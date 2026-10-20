import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  rejectReason: z.string().trim().optional(),
});

// Duyệt / Từ chối phiếu xuất kho kèm giải thuật trừ tồn kho theo lô FIFO
export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;
  const r = await parseBody(req, decisionSchema);
  if (r.error) return r.error;

  const issue = await prisma.stockIssue.findUnique({
    where: { id },
    include: {
      items: { include: { part: true } },
      ticket: true,
    },
  });
  if (!issue) return NextResponse.json({ error: "Không tìm thấy phiếu xuất kho" }, { status: 404 });
  if (issue.status !== "PENDING") {
    return NextResponse.json({ error: "Phiếu này đã được xử lý trước đó" }, { status: 400 });
  }

  const permNeeded =
    issue.type === "RETAIL" ? "stock:approve-retail" : "stock:approve-technical";
  if (!can(s.role, permNeeded)) {
    return NextResponse.json({ error: "Bạn không có quyền duyệt loại phiếu này" }, { status: 403 });
  }

  if (r.data.decision === "REJECTED") {
    const rejected = await prisma.stockIssue.update({
      where: { id },
      data: {
        status: "REJECTED",
        approverId: s.userId,
        approvedAt: new Date(),
        rejectReason: r.data.rejectReason || "Không duyệt",
      },
    });
    await prisma.auditLog.create({
      data: { userId: s.userId, action: "STOCK_ISSUE_REJECT", entity: "StockIssue", entityId: id },
    });
    return NextResponse.json(rejected);
  }

  // Duyệt phiếu APPROVED -> Chạy Transaction FIFO
  try {
    const approved = await prisma.$transaction(async (tx) => {
      for (const item of issue.items) {
        if (issue.type === "RETURN") {
          // Hoàn trả linh kiện vào lô mới nhất hoặc tạo lô RETURN
          const batchCode = `RET-${issue.code}`;
          const batch = await tx.inventoryBatch.upsert({
            where: { partId_batchCode: { partId: item.partId, batchCode } },
            update: { quantity: { increment: item.quantity } },
            create: {
              partId: item.partId,
              batchCode,
              quantity: item.quantity,
              costPrice: 0,
              location: "Kho thu hồi",
            },
          });
          await tx.stockMovement.create({
            data: {
              batchId: batch.id,
              type: "RETURN",
              quantity: item.quantity,
              refType: "StockIssue",
              refId: issue.id,
            },
          });
          continue;
        }

        // Xuất kho theo FIFO (receivedDate tăng dần)
        const batches = await tx.inventoryBatch.findMany({
          where: { partId: item.partId, quantity: { gt: 0 } },
          orderBy: { receivedDate: "asc" },
        });

        const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
        if (totalAvailable < item.quantity) {
          throw new Error(
            `INSUFFICIENT_STOCK:Linh kiện "${item.part.name}" chỉ còn tồn ${totalAvailable}, không đủ xuất ${item.quantity}`
          );
        }

        let remaining = item.quantity;
        for (const b of batches) {
          if (remaining <= 0) break;
          const take = Math.min(b.quantity, remaining);
          await tx.inventoryBatch.update({
            where: { id: b.id },
            data: { quantity: b.quantity - take },
          });
          await tx.stockMovement.create({
            data: {
              batchId: b.id,
              type: "OUT",
              quantity: take,
              refType: "StockIssue",
              refId: issue.id,
            },
          });
          remaining -= take;
        }

        // Kiểm tra ngưỡng tồn tối thiểu để tạo cảnh báo Notification
        const newTotal = totalAvailable - item.quantity;
        if (newTotal <= item.part.minThreshold) {
          await tx.notification.create({
            data: {
              channel: "IN_APP",
              title: `Cảnh báo tồn kho thấp: ${item.part.partCode}`,
              body: `Linh kiện ${item.part.name} chỉ còn ${newTotal} ${item.part.unit} (ngưỡng tối thiểu: ${item.part.minThreshold}).`,
            },
          });
        }

        // Nếu xuất kỹ thuật gắn với Ticket -> ghi lịch sử thay thế linh kiện cho máy
        if (issue.ticketId && issue.ticket) {
          await tx.partReplacement.create({
            data: {
              ticketId: issue.ticketId,
              equipmentId: issue.ticket.equipmentId,
              partId: item.partId,
              quantity: item.quantity,
            },
          });
        }
      }

      if (issue.ticketId && issue.ticket?.status === "WAITING_PARTS") {
        await tx.ticket.update({
          where: { id: issue.ticketId },
          data: { status: "IN_PROGRESS" },
        });
      }

      const updated = await tx.stockIssue.update({
        where: { id },
        data: {
          status: "APPROVED",
          approverId: s.userId,
          approvedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          userId: s.userId,
          action: "STOCK_ISSUE_APPROVE",
          entity: "StockIssue",
          entityId: id,
          meta: { code: issue.code },
        },
      });

      return updated;
    });

    return NextResponse.json(approved);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("INSUFFICIENT_STOCK:")) {
      return NextResponse.json(
        { error: err.message.replace("INSUFFICIENT_STOCK:", "") },
        { status: 400 }
      );
    }
    throw err;
  }
});
