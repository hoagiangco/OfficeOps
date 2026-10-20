import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import type { TicketPriority, TicketStatus } from "@prisma/client";

const patchSchema = z.object({
  action: z.enum(["ASSIGN", "CHECK_IN", "UPDATE", "COMPLETE", "CANCEL"]),
  assigneeId: z.string().optional().nullable(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  status: z
    .enum([
      "PENDING",
      "ASSIGNED",
      "IN_PROGRESS",
      "WAITING_PARTS",
      "WAITING_CUSTOMER",
      "COMPLETED",
      "CANCELLED",
    ])
    .optional(),
  diagnosis: z.string().optional().nullable(),
  checkInLat: z.number().optional().nullable(),
  checkInLng: z.number().optional().nullable(),
  counterAtClose: z.number().int().min(0).optional().nullable(),
  customerSignature: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
});

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");
  const { id } = await ctx.params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    include: {
      customer: true,
      equipment: {
        include: {
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
      logs: {
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
      },
      stockIssues: {
        include: {
          items: { include: { part: true } },
          requester: { select: { id: true, name: true } },
          approver: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      partsUsed: {
        include: { part: true },
        orderBy: { replacedAt: "desc" },
      },
      meterLogs: {
        orderBy: { logDate: "desc" },
      },
    },
  });

  if (!ticket) throw new HttpError(404, "Không tìm thấy phiếu yêu cầu");
  return NextResponse.json(ticket);
});

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, patchSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const existing = await prisma.ticket.findUnique({
    where: { id },
    include: { equipment: true, customer: true },
  });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu yêu cầu");

  if (data.action === "ASSIGN") {
    const session = await requirePermission("ticket:assign");
    if (session instanceof NextResponse) return session;
    if (!data.assigneeId) throw new HttpError(400, "Vui lòng chọn kỹ thuật viên");

    const tech = await prisma.user.findUnique({ where: { id: data.assigneeId } });
    if (!tech || !tech.isActive) throw new HttpError(400, "Kỹ thuật viên không hợp lệ hoặc đã khóa");

    const nextStatus: TicketStatus =
      existing.status === "PENDING" ? "ASSIGNED" : existing.status;

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id },
        data: {
          assigneeId: data.assigneeId,
          status: nextStatus,
          ...(data.priority ? { priority: data.priority as TicketPriority } : {}),
        },
        include: {
          customer: { select: { id: true, name: true } },
          equipment: { select: { id: true, serialNumber: true, model: true } },
          assignee: { select: { id: true, name: true } },
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: existing.status,
          toStatus: nextStatus,
          note: data.note || `Điều phối phân công cho KTV: ${tech.name}`,
        },
      });

      await tx.notification.create({
        data: {
          userId: tech.id,
          channel: "IN_APP",
          title: `Được giao phiếu ${existing.code}`,
          body: `${existing.customer.name} - Máy ${existing.equipment.model} (${existing.equipment.serialNumber})`,
          sentAt: new Date(),
        },
      });

      return t;
    });

    await audit(session.userId, "TICKET_ASSIGN", "Ticket", id, {
      code: existing.code,
      assigneeId: data.assigneeId,
      assigneeName: tech.name,
    });

    return NextResponse.json(updated);
  }

  const session = await requirePermission("ticket:update");
  if (session instanceof NextResponse) return session;

  if (data.action === "CHECK_IN") {
    const nextStatus: TicketStatus = "IN_PROGRESS";
    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id },
        data: {
          checkInAt: new Date(),
          checkInLat: data.checkInLat ?? 10.7769,
          checkInLng: data.checkInLng ?? 106.7009,
          status: nextStatus,
          ...(existing.assigneeId ? {} : { assigneeId: session.userId }),
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: existing.status,
          toStatus: nextStatus,
          note:
            data.note ||
            `KTV Check-in GPS tại hiện trường (${(data.checkInLat ?? 10.7769).toFixed(4)}, ${(data.checkInLng ?? 106.7009).toFixed(4)})`,
        },
      });

      return t;
    });

    await audit(session.userId, "TICKET_CHECKIN", "Ticket", id, { code: existing.code });
    return NextResponse.json(updated);
  }

  if (data.action === "COMPLETE") {
    if (
      data.counterAtClose !== undefined &&
      data.counterAtClose !== null &&
      data.counterAtClose < existing.equipment.currentCounter
    ) {
      throw new HttpError(
        400,
        `Chỉ số counter đóng phiếu (${data.counterAtClose.toLocaleString("vi-VN")}) không được nhỏ hơn counter hiện tại của máy (${existing.equipment.currentCounter.toLocaleString("vi-VN")})`
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id },
        data: {
          status: "COMPLETED",
          resolvedAt: new Date(),
          ...(data.diagnosis !== undefined ? { diagnosis: data.diagnosis } : {}),
          ...(data.counterAtClose !== undefined ? { counterAtClose: data.counterAtClose } : {}),
          ...(data.customerSignature !== undefined
            ? { customerSignature: data.customerSignature }
            : {}),
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: existing.status,
          toStatus: "COMPLETED",
          note:
            data.note ||
            `Hoàn thành xử lý phiếu.${
              data.counterAtClose != null
                ? ` Counter chốt: ${data.counterAtClose.toLocaleString("vi-VN")}.`
                : ""
            }${data.customerSignature ? ` Đã có xác nhận khách hàng.` : ""}`,
        },
      });

      if (data.counterAtClose !== undefined && data.counterAtClose !== null) {
        await tx.meterLog.create({
          data: {
            equipmentId: existing.equipmentId,
            ticketId: existing.id,
            recordedById: session.userId,
            counterValue: data.counterAtClose,
            source: "TECH",
          },
        });

        await tx.equipment.update({
          where: { id: existing.equipmentId },
          data: { currentCounter: data.counterAtClose },
        });
      }

      if (
        existing.equipment.status === "FAULTY" ||
        existing.equipment.status === "WAITING_PARTS"
      ) {
        await tx.equipment.update({
          where: { id: existing.equipmentId },
          data: { status: "ACTIVE" },
        });
        await tx.equipmentStatusHistory.create({
          data: {
            equipmentId: existing.equipmentId,
            fromStatus: existing.equipment.status,
            toStatus: "ACTIVE",
            note: `Khôi phục hoạt động sau khi hoàn thành phiếu ${existing.code}`,
          },
        });
      }

      return t;
    });

    await audit(session.userId, "TICKET_COMPLETE", "Ticket", id, {
      code: existing.code,
      counterAtClose: data.counterAtClose,
    });
    return NextResponse.json(updated);
  }

  if (data.action === "CANCEL") {
    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id },
        data: { status: "CANCELLED" },
      });
      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: existing.status,
          toStatus: "CANCELLED",
          note: data.note || "Hủy phiếu yêu cầu",
        },
      });
      return t;
    });

    await audit(session.userId, "TICKET_CANCEL", "Ticket", id, { code: existing.code });
    return NextResponse.json(updated);
  }

  // action === "UPDATE"
  const nextStatus: TicketStatus = (data.status as TicketStatus) || existing.status;
  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(data.priority ? { priority: data.priority as TicketPriority } : {}),
        ...(data.diagnosis !== undefined ? { diagnosis: data.diagnosis } : {}),
      },
    });

    if (nextStatus !== existing.status || data.note || data.diagnosis !== undefined) {
      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: existing.status,
          toStatus: nextStatus,
          note:
            data.note ||
            (data.diagnosis
              ? `Cập nhật chẩn đoán: ${data.diagnosis}`
              : `Chuyển trạng thái sang ${nextStatus}`),
        },
      });
    }

    if (nextStatus === "WAITING_PARTS" && existing.equipment.status !== "WAITING_PARTS") {
      await tx.equipment.update({
        where: { id: existing.equipmentId },
        data: { status: "WAITING_PARTS" },
      });
      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: existing.equipmentId,
          fromStatus: existing.equipment.status,
          toStatus: "WAITING_PARTS",
          note: `Chờ linh kiện theo phiếu ${existing.code}`,
        },
      });
    }

    return t;
  });

  await audit(session.userId, "TICKET_UPDATE", "Ticket", id, {
    code: existing.code,
    status: nextStatus,
  });

  return NextResponse.json(updated);
});
