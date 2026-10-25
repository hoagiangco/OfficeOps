import { NextResponse } from "next/server";
import { z } from "zod";
import { StockIssueType, ApprovalStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission } from "@/lib/auth";
import { pagingSchema, parseBody, parseQuery, withErrors, HttpError } from "@/lib/http";

const createIssueSchema = z.object({
  type: z.nativeEnum(StockIssueType).default(StockIssueType.TECHNICAL),
  ticketId: z.string().min(1).optional(),
  note: z.string().trim().optional(),
  items: z
    .array(
      z.object({
        partId: z.string().min(1),
        quantity: z.coerce.number().int().positive(),
      })
    )
    .min(1, "Cần chọn ít nhất 1 linh kiện"),
});

export const GET = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { page, pageSize } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const type = sp.get("type");

  const where = {
    ...(status && status in ApprovalStatus ? { status: status as ApprovalStatus } : {}),
    ...(type && type in StockIssueType ? { type: type as StockIssueType } : {}),
    ...(s.role === "FIELD_TECH" ? { requesterId: s.userId } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.stockIssue.findMany({
      where,
      include: {
        requester: { select: { id: true, name: true, role: true } },
        approver: { select: { id: true, name: true } },
        ticket: { select: { id: true, code: true, equipmentId: true, equipment: { select: { serialNumber: true, model: true } } } },
        items: { include: { part: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stockIssue.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("stock:request");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createIssueSchema);
  if (r.error) return r.error;

  if (r.data.ticketId) {
    const linkedTicket = await prisma.ticket.findUnique({
      where: { id: r.data.ticketId },
      select: { id: true, status: true },
    });
    if (linkedTicket?.status === "COMPLETED" && s.role !== "SUPER_ADMIN") {
      throw new HttpError(
        403,
        "Phiếu kỹ thuật đã hoàn thành, không thể tạo thêm yêu cầu xuất linh kiện"
      );
    }
  }

  const count = await prisma.stockIssue.count();
  const code = `PXK-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const created = await prisma.$transaction(async (tx) => {
    const issue = await tx.stockIssue.create({
      data: {
        code,
        type: r.data.type,
        ticketId: r.data.ticketId || null,
        requesterId: s.userId,
        note: r.data.note || null,
        items: {
          create: r.data.items.map((it) => ({
            partId: it.partId,
            quantity: it.quantity,
          })),
        },
      },
      include: { items: { include: { part: true } } },
    });

    if (r.data.ticketId && r.data.type === "TECHNICAL") {
      const linked = await tx.ticket.findUnique({
        where: { id: r.data.ticketId },
        select: { status: true },
      });
      if (linked && linked.status !== "COMPLETED") {
        await tx.ticket.update({
          where: { id: r.data.ticketId },
          data: { status: "WAITING_PARTS" },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        userId: s.userId,
        action: "STOCK_ISSUE_REQUEST",
        entity: "StockIssue",
        entityId: issue.id,
        meta: { code: issue.code, type: issue.type },
      },
    });

    return issue;
  });

  return NextResponse.json(created, { status: 201 });
});
