import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import { getSlaSettings, computeSlaDueAt } from "@/lib/slaSettings";
import {
  getTicketCustomTypesMap,
  isSystemTicketType,
  setTicketCustomTypeForTicket,
  toPrismaTicketType,
} from "@/lib/ticketWorkTypes";
import type { TicketPriority, TicketSource, TicketStatus, TicketType } from "@prisma/client";

const createSchema = z.object({
  customerId: z.string().min(1, "Vui lòng chọn khách hàng"),
  equipmentId: z.string().trim().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  type: z.string().trim().min(1, "Vui lòng chọn loại công việc").default("REPAIR"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  source: z.enum(["CUSTOMER", "SCHEDULED", "INTERNAL"]).default("CUSTOMER"),
  description: z.string().min(3, "Mô tả sự cố/yêu cầu tối thiểu 3 ký tự"),
  slaDueAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().optional().nullable(),
});

export const GET = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as TicketStatus | null;
  const priority = sp.get("priority") as TicketPriority | null;
  const type = sp.get("type")?.trim() || null;
  const assigneeId = sp.get("assigneeId");
  const customerId = sp.get("customerId");
  const equipmentId = sp.get("equipmentId");
  const q = sp.get("q")?.trim();

  // Kỹ thuật viên (FIELD_TECH) chỉ được xem các phiếu do mình được phân công trừ khi có quyền điều phối
  const canDispatch =
    (await checkUserPermission(session.userId, session.role, "ticket:assign")) ||
    (await checkUserPermission(session.userId, session.role, "ticket:dispatch-map"));
  const isFieldTech = session.role === "FIELD_TECH" && !canDispatch;
  const effectiveAssigneeId = isFieldTech ? session.userId : assigneeId;

  const prismaTypeFilter: TicketType | undefined = type
    ? isSystemTicketType(type)
      ? type
      : "OTHER"
    : undefined;

  const [tickets, customTypeMap] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(prismaTypeFilter ? { type: prismaTypeFilter } : {}),
        ...(effectiveAssigneeId === "UNASSIGNED"
          ? { assigneeId: null }
          : effectiveAssigneeId
          ? { assigneeId: effectiveAssigneeId }
          : {}),
        ...(customerId ? { customerId } : {}),
        ...(equipmentId ? { equipmentId } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
                { equipment: { serialNumber: { contains: q, mode: "insensitive" } } },
                { equipment: { model: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {}),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            latitude: true,
            longitude: true,
          },
        },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: true,
            brand: true,
            status: true,
            currentCounter: true,
            locationNote: true,
            branch: {
              select: {
                id: true,
                name: true,
                latitude: true,
                longitude: true,
              },
            },
            building: { select: { id: true, name: true, branch: { select: { name: true } } } },
            department: {
              include: {
                building: {
                  include: { branch: true },
                },
              },
            },
          },
        },
        assignee: { select: { id: true, name: true, phone: true, region: true, skills: true } },
        creator: { select: { id: true, name: true } },
        _count: { select: { stockIssues: true, logs: true, partsUsed: true } },
        attachments: {
          select: { id: true, url: true, kind: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
    getTicketCustomTypesMap(),
  ]);

  const canViewPhone = await checkUserPermission(session.userId, session.role, "customer:view-phone");
  const sanitizeSignature = (sig?: string | null) => {
    if (!sig) return null;
    if (sig.includes("[DEMO_SIGNATURE]") || sig.includes("...")) return null;
    return sig;
  };

  const items = tickets
    .map((t) => ({
      ...t,
      type: customTypeMap[t.id] || t.type,
      customerSignature: sanitizeSignature(t.customerSignature),
      customer: t.customer ? maskCustomerPhones(t.customer, canViewPhone) : t.customer,
    }))
    .filter((t) => (type ? t.type === type : true));

  return NextResponse.json(items);
});

export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("ticket:create");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, createSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  let equipment = null;
  if (data.equipmentId) {
    equipment = await prisma.equipment.findUnique({
      where: { id: data.equipmentId },
    });
    if (!equipment) throw new HttpError(404, "Không tìm thấy thiết bị");
  }

  let customCreatedAt: Date | undefined = undefined;
  if (data.createdAt) {
    const now = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.createdAt.trim())) {
      const [y, m, d] = data.createdAt.trim().split("-").map(Number);
      customCreatedAt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
    } else {
      const parsedDate = new Date(data.createdAt);
      if (!isNaN(parsedDate.getTime())) {
        customCreatedAt = parsedDate;
      }
    }
  }

  const baseDate = customCreatedAt || new Date();
  const year = baseDate.getFullYear();
  const countThisYear = await prisma.ticket.count({
    where: { code: { startsWith: `TK-${year}-` } },
  });
  let seq = countThisYear + 1;
  let code = `TK-${year}-${String(seq).padStart(4, "0")}`;
  while (await prisma.ticket.findUnique({ where: { code }, select: { id: true } })) {
    seq++;
    code = `TK-${year}-${String(seq).padStart(4, "0")}`;
  }

  // Kiểm tra quyền phân công kỹ thuật viên
  const canAssign = await checkUserPermission(session.userId, session.role, "ticket:assign");
  const finalAssigneeId = canAssign ? (data.assigneeId || null) : null;
  const initialStatus: TicketStatus = finalAssigneeId ? "ASSIGNED" : "PENDING";
  const slaSettings = await getSlaSettings();
  const slaDueAt = data.slaDueAt
    ? new Date(data.slaDueAt)
    : computeSlaDueAt(data.priority as TicketPriority, slaSettings, baseDate);

  const created = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        code,
        customerId: data.customerId,
        equipmentId: data.equipmentId || null,
        assigneeId: finalAssigneeId,
        creatorId: session.userId,
        type: toPrismaTicketType(data.type),
        status: initialStatus,
        priority: data.priority as TicketPriority,
        source: data.source as TicketSource,
        description: data.description,
        slaDueAt,
        ...(customCreatedAt ? { createdAt: customCreatedAt } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        equipment: { select: { id: true, serialNumber: true, model: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    await tx.ticketLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.userId,
        fromStatus: null,
        toStatus: initialStatus,
        note: finalAssigneeId
          ? `Tạo phiếu và giao cho KTV ${ticket.assignee?.name ?? ""}`
          : "Khởi tạo phiếu kỹ thuật mới",
        ...(customCreatedAt ? { createdAt: customCreatedAt } : {}),
      },
    });

    if (equipment && data.type === "REPAIR" && equipment.status === "ACTIVE") {
      await tx.equipment.update({
        where: { id: equipment.id },
        data: { status: "FAULTY" },
      });
      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: equipment.id,
          fromStatus: equipment.status,
          toStatus: "FAULTY",
          note: `Tự động chuyển trạng thái khi tạo phiếu sửa chữa ${code}`,
        },
      });
    }

    if (data.assigneeId) {
      const equipmentInfo = ticket.equipment
        ? `Máy ${ticket.equipment.model} (${ticket.equipment.serialNumber})`
        : "Phiếu dịch vụ";
      await tx.notification.create({
        data: {
          userId: data.assigneeId,
          channel: "IN_APP",
          title: `Phiếu kỹ thuật mới: ${code}`,
          body: `${ticket.customer.name} - ${equipmentInfo}: ${data.description}`,
          sentAt: new Date(),
        },
      });
    }

    return ticket;
  });

  await setTicketCustomTypeForTicket(created.id, data.type);

  await audit(session.userId, "TICKET_CREATE", "Ticket", created.id, {
    code: created.code,
    type: data.type,
    priority: created.priority,
    assigneeId: created.assigneeId,
  });

  return NextResponse.json({ ...created, type: data.type }, { status: 201 });
});
