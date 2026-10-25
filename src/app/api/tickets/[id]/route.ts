import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { getTicketAssignedEmailHtml, getTicketCompletionEmailHtml } from "@/lib/mail-templates";
import type { TicketPriority, TicketStatus, MeterSource } from "@prisma/client";

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
  adjustmentReason: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
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
          branch: { select: { id: true, name: true } },
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
      attachments: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!ticket) throw new HttpError(404, "Không tìm thấy phiếu kỹ thuật");

  // Kỹ thuật viên (FIELD_TECH) chỉ được xem phiếu mình được phân công
  if (session.role === "FIELD_TECH" && ticket.assigneeId !== session.userId) {
    throw new HttpError(403, "Bạn chỉ có quyền xem phiếu kỹ thuật được phân công cho mình");
  }

  const canViewPhone = await checkUserPermission(session.userId, session.role, "customer:view-phone");
  const data = {
    ...ticket,
    customer: ticket.customer ? maskCustomerPhones(ticket.customer, canViewPhone) : ticket.customer,
  };

  return NextResponse.json(data);
});

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const { id } = await ctx.params;
  const parsed = await parseBody(req, patchSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const existing = await prisma.ticket.findUnique({
    where: { id },
    include: { equipment: true, customer: true, attachments: true },
  });
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu kỹ thuật");

  // Phiếu đã hoàn thành rồi thì không được sửa nội dung trừ superadmin (giám đốc)
  if (existing.status === "COMPLETED" && session.role !== "SUPER_ADMIN") {
    throw new HttpError(
      403,
      "Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc (Super Admin) mới có quyền chỉnh sửa nội dung"
    );
  }

  // Kỹ thuật viên không có quyền giao việc
  if (data.action === "ASSIGN") {
    if (session.role === "FIELD_TECH") {
      throw new HttpError(403, "Kỹ thuật viên không có quyền giao việc hoặc điều phối");
    }
    const checkPerm = await requirePermission("ticket:assign");
    if (checkPerm instanceof NextResponse) return checkPerm;
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

    // B5: Gửi Email thông báo phân công cho Kỹ thuật viên (chỉ gửi cho KTV mới được gán)
    let emailSentToTech = false;
    if (tech.email) {
      try {
        const emailHtml = getTicketAssignedEmailHtml({
          technicianName: tech.name,
          ticketCode: existing.code,
          customerName: existing.customer.name,
          customerAddress: existing.customer.address,
          customerPhone: existing.customer.phone,
          equipmentModel: `${existing.equipment.brand || ""} ${existing.equipment.model} (SN: ${existing.equipment.serialNumber})`,
          priority: data.priority || existing.priority,
          issueDescription: existing.description,
          slaDueAt: existing.slaDueAt,
          ticketId: existing.id,
        });

        const mailRes = await sendMail({
          to: tech.email,
          subject: `[OfficeOps] Lệnh điều phối ca kỹ thuật: ${existing.code} - ${existing.customer.name}`,
          html: emailHtml,
          text: `Bạn được phân công ca xử lý ${existing.code} tại ${existing.customer.name}. Địa chỉ: ${existing.customer.address}`,
          userId: tech.id,
        });
        emailSentToTech = mailRes.success;
      } catch (mailErr) {
        console.error("[Ticket Assign Email] Lỗi khi gửi email cho KTV:", mailErr);
      }
    }

    await audit(session.userId, "TICKET_ASSIGN", "Ticket", id, {
      code: existing.code,
      assigneeId: data.assigneeId,
      assigneeName: tech.name,
      emailSentToTech,
    });

    return NextResponse.json({ ...updated, emailSentToTech });
  }

  // Kỹ thuật viên chỉ được thao tác trên phiếu mình được phân công
  if (session.role === "FIELD_TECH" && existing.assigneeId !== session.userId) {
    throw new HttpError(403, "Bạn chỉ có quyền thao tác trên phiếu kỹ thuật được phân công cho mình");
  }

  const checkUpdatePerm = await requirePermission("ticket:update");
  if (checkUpdatePerm instanceof NextResponse) return checkUpdatePerm;

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
          attachments: true,
        },
      });

      // Tự động lưu tọa độ GPS cho khách hàng nếu khách hàng chưa có tọa độ
      if (data.checkInLat && data.checkInLng && existing.customerId) {
        if (existing.customer && (existing.customer.latitude === null || existing.customer.longitude === null)) {
          await tx.customer.update({
            where: { id: existing.customerId },
            data: {
              latitude: data.checkInLat,
              longitude: data.checkInLng,
            },
          });
        }
      }

      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: existing.status,
          toStatus: nextStatus,
          note:
            data.note ||
            (existing.checkInAt
              ? `${session.name || "KTV"} Cập nhật lại Check-in GPS (${(data.checkInLat ?? 10.7769).toFixed(4)}, ${(data.checkInLng ?? 106.7009).toFixed(4)})`
              : `${session.name || "KTV"} Check-in GPS (${(data.checkInLat ?? 10.7769).toFixed(4)}, ${(data.checkInLng ?? 106.7009).toFixed(4)})`),
        },
      });

      return t;
    });

    await audit(session.userId, "TICKET_CHECKIN", "Ticket", id, { code: existing.code });
    return NextResponse.json(updated);
  }

  if (data.action === "COMPLETE") {
    const isLowerCounter =
      data.counterAtClose !== undefined &&
      data.counterAtClose !== null &&
      data.counterAtClose < existing.equipment.currentCounter;

    if (isLowerCounter) {
      if (!data.adjustmentReason || data.adjustmentReason.trim().length < 3) {
        throw new HttpError(
          400,
          `Chỉ số counter đóng phiếu (${data.counterAtClose!.toLocaleString("vi-VN")}) thấp hơn counter ban đầu (${existing.equipment.currentCounter.toLocaleString("vi-VN")}). Vui lòng nhập lý do điều chỉnh để gửi cấp trên phê duyệt.`
        );
      }
      const hasCounterPhoto =
        data.photoUrl ||
        existing.attachments.some((a) => a.kind === "COUNTER_PHOTO");
      if (!hasCounterPhoto) {
        throw new HttpError(
          400,
          "Vui lòng chụp ảnh màn hình Counter thực tế để minh chứng cho yêu cầu hạ chỉ số counter."
        );
      }
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
                ? ` Counter chốt: ${data.counterAtClose.toLocaleString("vi-VN")}${
                    isLowerCounter ? " (Đang chờ duyệt giảm counter)" : ""
                  }.`
                : ""
            }${data.customerSignature ? ` Đã có xác nhận khách hàng.` : ""}`,
        },
      });

      if (data.counterAtClose !== undefined && data.counterAtClose !== null) {
        const counterPhotoUrl =
          data.photoUrl ||
          existing.attachments.find((a) => a.kind === "COUNTER_PHOTO")?.url ||
          null;

        await tx.meterLog.create({
          data: {
            equipmentId: existing.equipmentId,
            ticketId: existing.id,
            recordedById: session.userId,
            counterValue: data.counterAtClose,
            source: "TECH",
            photoUrl: counterPhotoUrl,
            status: isLowerCounter ? "PENDING_APPROVAL" : "APPROVED",
            adjustmentReason: isLowerCounter ? data.adjustmentReason?.trim() || null : null,
          },
        });

        // Chỉ cập nhật counter thiết bị ngay nếu counter không bị giảm
        if (!isLowerCounter) {
          await tx.equipment.update({
            where: { id: existing.equipmentId },
            data: { currentCounter: data.counterAtClose },
          });
        }
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

    // B4: Gửi biên bản nghiệm thu điện tử cho Khách hàng khi đóng phiếu
    // Chỉ gửi duy nhất 1 lần khi chuyển sang COMPLETED lần đầu
    let emailSentToCustomer = false;
    if (existing.status !== "COMPLETED" && existing.customer?.email) {
      try {
        const partsReplaced = await prisma.partReplacement.findMany({
          where: { ticketId: id },
          include: { part: { select: { name: true } } },
        });

        const emailHtml = getTicketCompletionEmailHtml({
          customerName: existing.customer.name,
          ticketCode: existing.code,
          equipmentModel: `${existing.equipment.brand || ""} ${existing.equipment.model}`,
          serialNumber: existing.equipment.serialNumber,
          completedAt: new Date(),
          counterAtClose: data.counterAtClose ?? existing.counterAtClose,
          technicianName: session.name,
          partsReplaced: partsReplaced.map((pr) => ({
            name: pr.part.name,
            quantity: pr.quantity,
          })),
          ticketId: existing.id,
        });

        const mailRes = await sendMail({
          to: existing.customer.email,
          subject: `[OfficeOps] Biên bản nghiệm thu kỹ thuật ${existing.code} - Thiết bị ${existing.equipment.model}`,
          html: emailHtml,
          text: `Phiếu kỹ thuật ${existing.code} đã hoàn tất bàn giao. Thiết bị: ${existing.equipment.model}. Chỉ số counter chốt: ${data.counterAtClose ?? existing.counterAtClose ?? "N/A"}.`,
          userId: session.userId,
        });
        emailSentToCustomer = mailRes.success;
      } catch (mailErr) {
        console.error("[Ticket Complete Email] Lỗi khi gửi biên bản nghiệm thu:", mailErr);
      }
    }

    await audit(session.userId, "TICKET_COMPLETE", "Ticket", id, {
      code: existing.code,
      counterAtClose: data.counterAtClose,
      emailSentToCustomer,
    });
    return NextResponse.json({ ...updated, emailSentToCustomer });
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
          note: data.note || "Hủy phiếu kỹ thuật",
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
        ...(data.counterAtClose !== undefined ? { counterAtClose: data.counterAtClose } : {}),
        ...(data.customerSignature !== undefined
          ? { customerSignature: data.customerSignature }
          : {}),
        ...(existing.status === "COMPLETED" && nextStatus !== "COMPLETED"
          ? { resolvedAt: null }
          : {}),
      },
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
        attachments: true,
      },
    });

    if (
      nextStatus !== existing.status ||
      data.note ||
      data.diagnosis !== undefined ||
      data.counterAtClose !== undefined
    ) {
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
              : `Cập nhật thông tin phiếu (${nextStatus})`),
        },
      });
    }

    if (data.counterAtClose !== undefined && data.counterAtClose !== null) {
      await tx.equipment.update({
        where: { id: existing.equipmentId },
        data: { currentCounter: data.counterAtClose },
      });
      await tx.meterLog.create({
        data: {
          equipmentId: existing.equipmentId,
          ticketId: existing.id,
          recordedById: session.userId,
          counterValue: data.counterAtClose,
          source: (session.role === "SUPER_ADMIN" ? "MANUAL" : "TECH") as MeterSource,
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
