import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { getTicketAssignedEmailHtml, getTicketCompletionEmailHtml } from "@/lib/mail-templates";
import {
  getTicketCustomTypesMap,
  setTicketCustomTypeForTicket,
  toPrismaTicketType,
} from "@/lib/ticketWorkTypes";
import {
  countOtherOpenTicketsForEquipment,
  enrichTicketsWithEquipmentList,
  getEffectiveEquipmentIds,
  getTicketEquipmentsMap,
  removeTicketEquipmentIds,
  setTicketEquipmentIds,
  setTicketEquipmentTasks,
  type TicketEquipmentTask,
} from "@/lib/ticketEquipments";
import type { EquipmentStatus, TicketPriority, TicketStatus, TicketSource, MeterSource } from "@prisma/client";

const patchSchema = z.object({
  action: z.enum(["ASSIGN", "CHECK_IN", "UPDATE", "COMPLETE", "CANCEL", "REOPEN"]),
  customerId: z.string().optional(),
  equipmentId: z.string().optional().nullable(),
  equipmentIds: z.array(z.string().trim()).optional(),
  equipmentTasks: z
    .array(
      z.object({
        equipmentId: z.string().trim().min(1),
        workType: z.string().trim().optional(),
        note: z.string().optional(),
        counter: z.number().int().min(0).optional().nullable(),
      })
    )
    .optional(),
  equipmentCounters: z.record(z.string(), z.number().int().min(0)).optional(),
  equipmentStatus: z
    .enum(["ACTIVE", "FAULTY", "WAITING_PARTS", "RECALLED", "IN_STOCK", "SCRAPPED", "KEEP"])
    .optional()
    .nullable(),
  assigneeId: z.string().optional().nullable(),
  type: z.string().trim().min(1).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  source: z.enum(["CUSTOMER", "SCHEDULED", "INTERNAL"]).optional(),
  description: z.string().min(3, "Mô tả sự cố/yêu cầu tối thiểu 3 ký tự").optional(),
  createdAt: z.string().optional().nullable(),
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
  meterSource: z.enum(["MANUAL", "OCR", "TECH"]).optional(),
  customerSignature: z.string().optional().nullable(),
  adjustmentReason: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  slaDueAt: z.string().datetime().optional().nullable(),
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

  // Kỹ thuật viên (FIELD_TECH) chỉ được xem phiếu mình được phân công trừ khi có quyền điều phối
  const canDispatch =
    (await checkUserPermission(session.userId, session.role, "ticket:assign")) ||
    (await checkUserPermission(session.userId, session.role, "ticket:dispatch-map"));
  if (session.role === "FIELD_TECH" && !canDispatch && ticket.assigneeId !== session.userId) {
    throw new HttpError(403, "Bạn chỉ có quyền xem phiếu kỹ thuật được phân công cho mình");
  }

  const [canViewPhone, customTypeMap, equipMap] = await Promise.all([
    checkUserPermission(session.userId, session.role, "customer:view-phone"),
    getTicketCustomTypesMap(),
    getTicketEquipmentsMap(),
  ]);
  const sanitizeSignature = (sig?: string | null) => {
    if (!sig) return null;
    if (sig.includes("[DEMO_SIGNATURE]") || sig.includes("...")) return null;
    return sig;
  };
  const baseData = {
    ...ticket,
    type: customTypeMap[ticket.id] || ticket.type,
    customerSignature: sanitizeSignature(ticket.customerSignature),
    customer: ticket.customer ? maskCustomerPhones(ticket.customer, canViewPhone) : ticket.customer,
  };
  const [enriched] = await enrichTicketsWithEquipmentList([baseData], equipMap);

  return NextResponse.json(enriched || baseData);
});

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const { id } = await ctx.params;
  const parsed = await parseBody(req, patchSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  // Làm sạch dữ liệu chữ ký nếu chứa chuỗi mô phỏng/lỗi
  if (
    data.customerSignature &&
    (data.customerSignature.includes("[DEMO_SIGNATURE]") || data.customerSignature.includes("..."))
  ) {
    data.customerSignature = null;
  }

  const [existing, equipMap] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id },
      include: { equipment: true, customer: true, attachments: true },
    }),
    getTicketEquipmentsMap(),
  ]);
  if (!existing) throw new HttpError(404, "Không tìm thấy phiếu kỹ thuật");

  const currentEquipmentIds = getEffectiveEquipmentIds(existing, equipMap);
  const currentEquipments =
    currentEquipmentIds.length > 0
      ? await prisma.equipment.findMany({ where: { id: { in: currentEquipmentIds } } })
      : [];

  // Phiếu đã hủy thì không được thực hiện bất kỳ thao tác nào
  if (existing.status === "CANCELLED") {
    throw new HttpError(
      400,
      "Phiếu kỹ thuật này đã BỊ HỦY. Không thể phân công, điều phối, cập nhật tiến độ hay hoàn thành phiếu đã hủy."
    );
  }

  // Kiểm tra quyền mở lại phiếu đã hoàn thành
  const canReopenTicket =
    session.role === "SUPER_ADMIN" ||
    session.role === "ADMIN" ||
    session.role === "DISPATCHER" ||
    (await checkUserPermission(session.userId, session.role, "ticket:assign")) ||
    (await checkUserPermission(session.userId, session.role, "ticket:cancel"));

  // Xử lý hành động MỞ LẠI PHIẾU (REOPEN: COMPLETED -> IN_PROGRESS)
  if (data.action === "REOPEN") {
    if (existing.status !== "COMPLETED") {
      throw new HttpError(400, "Chỉ có thể mở lại phiếu kỹ thuật đang ở trạng thái Hoàn thành.");
    }
    if (!canReopenTicket) {
      throw new HttpError(
        403,
        "Bạn không có quyền mở lại phiếu đã hoàn thành (Chỉ Giám đốc, Quản lý hoặc Điều phối viên mới được phép mở lại)."
      );
    }

    const reopenReason = (data.note || "").trim();
    if (!reopenReason || reopenReason.length < 3) {
      throw new HttpError(400, "Vui lòng nhập lý do mở lại phiếu kỹ thuật (tối thiểu 3 ký tự).");
    }

    const targetStatus: TicketStatus =
      data.status && ["IN_PROGRESS", "ASSIGNED", "WAITING_PARTS", "PENDING"].includes(data.status)
        ? (data.status as TicketStatus)
        : "IN_PROGRESS";

    const updated = await prisma.$transaction(async (tx) => {
      const t = await tx.ticket.update({
        where: { id },
        data: {
          status: targetStatus,
          resolvedAt: null,
        },
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
          attachments: true,
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: "COMPLETED",
          toStatus: targetStatus,
          note: `🔄 Mở lại phiếu (Chuyển về Đang xử lý): ${reopenReason}`,
        },
      });

      // Cập nhật trạng thái máy nếu người dùng chủ động lựa chọn khi mở lại phiếu (không tự động áp đặt)
      if (data.equipmentStatus && data.equipmentStatus !== "KEEP" && currentEquipments.length > 0) {
        for (const eq of currentEquipments) {
          if (eq.status !== data.equipmentStatus) {
            await tx.equipment.update({
              where: { id: eq.id },
              data: { status: data.equipmentStatus as EquipmentStatus },
            });
            await tx.equipmentStatusHistory.create({
              data: {
                equipmentId: eq.id,
                fromStatus: eq.status,
                toStatus: data.equipmentStatus as EquipmentStatus,
                note: `Cập nhật trạng thái khi mở lại phiếu ${existing.code}: ${reopenReason}`,
              },
            });
          }
        }
      }

      // Thông báo cho KTV phụ trách nếu có
      if (existing.assigneeId && existing.assigneeId !== session.userId) {
        await tx.notification.create({
          data: {
            userId: existing.assigneeId,
            channel: "IN_APP",
            title: `Phiếu ${existing.code} đã được mở lại`,
            body: `Lý do mở lại: ${reopenReason} (${existing.customer.name})`,
            sentAt: new Date(),
          },
        });
      }

      return t;
    });

    await audit(session.userId, "TICKET_REOPEN", "Ticket", id, {
      code: existing.code,
      reason: reopenReason,
      toStatus: targetStatus,
    });

    const [enrichedReopen] = await enrichTicketsWithEquipmentList([updated], equipMap);
    return NextResponse.json(enrichedReopen || updated);
  }

  // Phiếu đã hoàn thành rồi thì không được sửa nội dung trừ superadmin (giám đốc)
  if (existing.status === "COMPLETED" && session.role !== "SUPER_ADMIN") {
    throw new HttpError(
      403,
      "Phiếu kỹ thuật đã hoàn thành. Vui lòng sử dụng chức năng 'Mở lại phiếu' để chuyển về trạng thái Đang xử lý trước khi cập nhật."
    );
  }

  // Kiểm tra quyền điều phối / giao việc
  if (data.action === "ASSIGN") {
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
          body: `${existing.customer.name} - ${existing.equipment ? `Máy ${existing.equipment.model} (${existing.equipment.serialNumber})` : "Phiếu dịch vụ"}`,
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
          equipmentModel: existing.equipment
            ? `${existing.equipment.brand || ""} ${existing.equipment.model} (SN: ${existing.equipment.serialNumber})`
            : "Phiếu dịch vụ",
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

  // Kỹ thuật viên chỉ được thao tác trên phiếu mình được phân công trừ khi có quyền điều phối
  const canAssignTicket = await checkUserPermission(session.userId, session.role, "ticket:assign");
  if (session.role === "FIELD_TECH" && !canAssignTicket && existing.assigneeId !== session.userId) {
    throw new HttpError(403, "Bạn chỉ có quyền thao tác trên phiếu kỹ thuật được phân công cho mình");
  }

  const requiredPerm =
    data.action === "COMPLETE"
      ? "ticket:close"
      : data.action === "CANCEL"
      ? "ticket:cancel"
      : "ticket:update-progress";

  const checkUpdatePerm = await requirePermission(requiredPerm);
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
    const isLowerCounter = Boolean(
      existing.equipment &&
      data.counterAtClose !== undefined &&
      data.counterAtClose !== null &&
      data.counterAtClose < existing.equipment.currentCounter
    );

    if (isLowerCounter && existing.equipment) {
      if (!data.adjustmentReason || data.adjustmentReason.trim().length < 3) {
        throw new HttpError(
          400,
          `Chỉ số counter đóng phiếu (${data.counterAtClose!.toLocaleString("vi-VN")}) thấp hơn counter ban đầu (${existing.equipment.currentCounter.toLocaleString("vi-VN")}). Vui lòng nhập lý do điều chỉnh để gửi cấp trên phê duyệt.`
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

      const counterPhotoUrl =
        data.photoUrl ||
        existing.attachments.find((a) => a.kind === "COUNTER_PHOTO")?.url ||
        null;

      // Hỗ trợ chốt counter cho nhiều máy (equipmentCounters) hoặc máy chính (counterAtClose)
      if (data.equipmentCounters && Object.keys(data.equipmentCounters).length > 0) {
        for (const [eqId, counterVal] of Object.entries(data.equipmentCounters)) {
          if (typeof counterVal === "number" && counterVal >= 0) {
            const eqObj = currentEquipments.find((m) => m.id === eqId);
            const eqIsLower = Boolean(eqObj && counterVal < eqObj.currentCounter);
            await tx.meterLog.create({
              data: {
                equipmentId: eqId,
                ticketId: existing.id,
                recordedById: session.userId,
                counterValue: counterVal,
                source: data.meterSource || "TECH",
                photoUrl: counterPhotoUrl,
                status: eqIsLower ? "PENDING_APPROVAL" : "APPROVED",
                adjustmentReason: eqIsLower ? data.adjustmentReason?.trim() || "Điều chỉnh khi đóng phiếu nhiều máy" : null,
              },
            });
            if (!eqIsLower) {
              await tx.equipment.update({
                where: { id: eqId },
                data: { currentCounter: counterVal },
              });
            }
          }
        }
      } else if (existing.equipmentId && data.counterAtClose !== undefined && data.counterAtClose !== null) {
        await tx.meterLog.create({
          data: {
            equipmentId: existing.equipmentId,
            ticketId: existing.id,
            recordedById: session.userId,
            counterValue: data.counterAtClose,
            source: data.meterSource || "TECH",
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

      // Cập nhật trạng thái cho các máy gắn trên phiếu này
      if (data.equipmentStatus !== "KEEP") {
        const targetEqStatus = (data.equipmentStatus || "ACTIVE") as EquipmentStatus;
        for (const eq of currentEquipments) {
          if (eq.status !== targetEqStatus) {
            // Nếu không truyền rõ và máy đang không hỏng (ví dụ ACTIVE/IN_STOCK), không cần đổi
            if (data.equipmentStatus === undefined && eq.status !== "FAULTY" && eq.status !== "WAITING_PARTS") {
              continue;
            }
            await tx.equipment.update({
              where: { id: eq.id },
              data: { status: targetEqStatus },
            });
            await tx.equipmentStatusHistory.create({
              data: {
                equipmentId: eq.id,
                fromStatus: eq.status,
                toStatus: targetEqStatus,
                note: `Cập nhật trạng thái sau khi hoàn thành phiếu ${existing.code}`,
              },
            });
          }
        }
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
          equipmentModel:
            currentEquipments.length > 1
              ? `${currentEquipments.length} thiết bị (${currentEquipments.map((m) => m.model).join(", ")})`
              : existing.equipment
              ? `${existing.equipment.brand || ""} ${existing.equipment.model}`
              : "Phiếu dịch vụ",
          serialNumber:
            currentEquipments.length > 1
              ? currentEquipments.map((m) => m.serialNumber || "N/A").join(", ")
              : existing.equipment?.serialNumber || "N/A",
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
          subject: `[OfficeOps] Biên bản nghiệm thu kỹ thuật ${existing.code} - ${
            currentEquipments.length > 1
              ? `${currentEquipments.length} thiết bị`
              : existing.equipment
              ? `Thiết bị ${existing.equipment.model}`
              : "Phiếu dịch vụ"
          }`,
          html: emailHtml,
          text: `Phiếu kỹ thuật ${existing.code} đã hoàn tất bàn giao. ${existing.equipment ? `Thiết bị: ${existing.equipment.model}.` : ""} Chỉ số counter chốt: ${data.counterAtClose ?? existing.counterAtClose ?? "N/A"}.`,
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
    const [enrichedComplete] = await enrichTicketsWithEquipmentList([updated], equipMap);
    return NextResponse.json({ ...(enrichedComplete || updated), emailSentToCustomer });
  }

  if (data.action === "CANCEL") {
    if (existing.status === "COMPLETED") {
      throw new HttpError(400, "Không thể hủy phiếu kỹ thuật đã hoàn thành.");
    }

    const cancelReason = (data.note || "").trim();
    if (!cancelReason || cancelReason.length < 3) {
      throw new HttpError(400, "Vui lòng nhập lý do hủy phiếu (tối thiểu 3 ký tự)");
    }

    // Kiểm tra nếu có phiếu xuất kho đã APPROVED
    const activeStockIssues = await prisma.stockIssue.findMany({
      where: {
        ticketId: id,
        status: "APPROVED",
      },
    });
    if (activeStockIssues.length > 0) {
      throw new HttpError(
        400,
        "Không thể hủy phiếu vì đã có phiếu xuất kho linh kiện được duyệt. Vui lòng làm thủ tục nhập trả linh kiện về kho trước khi hủy phiếu."
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Hủy các phiếu xuất kho đang ở trạng thái PENDING
      await tx.stockIssue.updateMany({
        where: { ticketId: id, status: "PENDING" },
        data: { status: "REJECTED", rejectReason: `Tự động hủy do phiếu kỹ thuật bị hủy: ${cancelReason}` },
      });

      const t = await tx.ticket.update({
        where: { id },
        data: { status: "CANCELLED" },
        include: {
          customer: true,
          equipment: true,
        },
      });

      await tx.ticketLog.create({
        data: {
          ticketId: id,
          userId: session.userId,
          fromStatus: existing.status,
          toStatus: "CANCELLED",
          note: `Hủy phiếu: ${cancelReason}`,
        },
      });

      // Nếu thiết bị trên phiếu đang FAULTY hoặc WAITING_PARTS, tự động phục hồi về ACTIVE nếu không còn phiếu hỏng nào khác
      for (const eq of currentEquipments) {
        if (eq.status === "FAULTY" || eq.status === "WAITING_PARTS") {
          const otherOpenTickets = await countOtherOpenTicketsForEquipment(eq.id, id, equipMap);
          if (otherOpenTickets === 0) {
            await tx.equipment.update({
              where: { id: eq.id },
              data: { status: "ACTIVE" },
            });
            await tx.equipmentStatusHistory.create({
              data: {
                equipmentId: eq.id,
                fromStatus: eq.status,
                toStatus: "ACTIVE",
                note: `Khôi phục trạng thái hoạt động do hủy phiếu ${existing.code}: ${cancelReason}`,
              },
            });
          }
        }
      }

      return t;
    });

    await audit(session.userId, "TICKET_CANCEL", "Ticket", id, {
      code: existing.code,
      reason: cancelReason,
    });
    const [enrichedCancel] = await enrichTicketsWithEquipmentList([updated], equipMap);
    return NextResponse.json(enrichedCancel || updated);
  }

  // action === "UPDATE"
  let nextStatus: TicketStatus = (data.status as TicketStatus) || existing.status;
  const targetCustomerId = data.customerId || existing.customerId;

  // Kiểm tra nếu có thay đổi KTV từ form Edit
  let updatedAssigneeId: string | null | undefined = undefined;
  if (data.assigneeId !== undefined && canAssignTicket) {
    updatedAssigneeId = data.assigneeId?.trim() || null;
    if (!data.status) {
      if (existing.status === "PENDING" && updatedAssigneeId) {
        nextStatus = "ASSIGNED";
      } else if (existing.status === "ASSIGNED" && !updatedAssigneeId) {
        nextStatus = "PENDING";
      }
    }
  }

  // Kiểm tra nếu có thay đổi ngày lập phiếu (createdAt)
  let customCreatedAt: Date | undefined = undefined;
  if (data.createdAt) {
    const baseTime = new Date(existing.createdAt);
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.createdAt.trim())) {
      const [y, m, d] = data.createdAt.trim().split("-").map(Number);
      customCreatedAt = new Date(
        y,
        m - 1,
        d,
        baseTime.getHours(),
        baseTime.getMinutes(),
        baseTime.getSeconds()
      );
    } else {
      const parsedDate = new Date(data.createdAt);
      if (!isNaN(parsedDate.getTime())) {
        customCreatedAt = parsedDate;
      }
    }
  }

  // Kiểm tra nếu có thay đổi danh sách thiết bị (equipmentIds hoặc equipmentId)
  const hasExplicitEquipmentInput = data.equipmentIds !== undefined || data.equipmentId !== undefined;
  const requestedEquipIds: string[] = hasExplicitEquipmentInput
    ? Array.isArray(data.equipmentIds)
      ? Array.from(
          new Set(
            data.equipmentIds
              .filter((s) => typeof s === "string" && s.trim().length > 0)
              .map((s) => s.trim())
          )
        )
      : data.equipmentId?.trim()
      ? [data.equipmentId.trim()]
      : []
    : currentEquipmentIds;

  const isChangingEquipmentList =
    hasExplicitEquipmentInput &&
    (requestedEquipIds.length !== currentEquipmentIds.length ||
      requestedEquipIds.some((eid, idx) => eid !== currentEquipmentIds[idx]));

  const targetEquipmentId = hasExplicitEquipmentInput
    ? requestedEquipIds[0] || null
    : existing.equipmentId;
  const isChangingPrimaryEquipment = (targetEquipmentId || null) !== (existing.equipmentId || null);

  let nextEquipments = currentEquipments;
  if (isChangingEquipmentList) {
    if (requestedEquipIds.length > 0) {
      nextEquipments = await prisma.equipment.findMany({
        where: { id: { in: requestedEquipIds } },
      });
      if (nextEquipments.length === 0) {
        throw new HttpError(404, "Không tìm thấy thiết bị được chọn");
      }
      const wrongCustomerEquip = nextEquipments.find((eq) => eq.customerId !== targetCustomerId);
      if (wrongCustomerEquip) {
        throw new HttpError(
          400,
          `Thiết bị ${wrongCustomerEquip.model} không thuộc khách hàng của phiếu này`
        );
      }
    } else {
      nextEquipments = [];
      const [partsCount, metersCount] = await Promise.all([
        prisma.partReplacement.count({ where: { ticketId: id } }),
        prisma.meterLog.count({ where: { ticketId: id } }),
      ]);
      if (partsCount > 0 || metersCount > 0) {
        throw new HttpError(
          400,
          "Không thể bỏ chọn máy (chuyển sang Phiếu dịch vụ) vì phiếu đã ghi nhận linh kiện thay thế hoặc chỉ số Counter. Vui lòng chọn sang máy đúng."
        );
      }
    }
  }

  const newEquip =
    nextEquipments.find((eq) => eq.id === targetEquipmentId) || nextEquipments[0] || null;

  const updated = await prisma.$transaction(async (tx) => {
    const t = await tx.ticket.update({
      where: { id },
      data: {
        status: nextStatus,
        ...(data.customerId ? { customerId: data.customerId } : {}),
        ...(isChangingPrimaryEquipment ? { equipmentId: targetEquipmentId } : {}),
        ...(updatedAssigneeId !== undefined ? { assigneeId: updatedAssigneeId } : {}),
        ...(data.type ? { type: toPrismaTicketType(data.type) } : {}),
        ...(data.priority ? { priority: data.priority as TicketPriority } : {}),
        ...(data.source ? { source: data.source as TicketSource } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(customCreatedAt ? { createdAt: customCreatedAt } : {}),
        ...(data.diagnosis !== undefined ? { diagnosis: data.diagnosis } : {}),
        ...(data.counterAtClose !== undefined ? { counterAtClose: data.counterAtClose } : {}),
        ...(data.customerSignature !== undefined
          ? { customerSignature: data.customerSignature }
          : {}),
        ...(data.slaDueAt !== undefined
          ? { slaDueAt: data.slaDueAt ? new Date(data.slaDueAt) : null }
          : {}),
        ...(existing.status === "COMPLETED" && nextStatus !== "COMPLETED"
          ? { resolvedAt: null }
          : {}),
      },
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
        attachments: true,
      },
    });

    if (isChangingEquipmentList) {
      // Nếu chỉ có 1 máy và đổi sang máy khác, đồng bộ lại equipmentId trên bản ghi linh kiện & counter đã gắn với phiếu (nếu có)
      if (isChangingPrimaryEquipment && targetEquipmentId && currentEquipmentIds.length <= 1 && requestedEquipIds.length === 1) {
        await tx.partReplacement.updateMany({
          where: { ticketId: id },
          data: { equipmentId: targetEquipmentId },
        });
        await tx.meterLog.updateMany({
          where: { ticketId: id },
          data: { equipmentId: targetEquipmentId },
        });
      }

      // Khôi phục trạng thái các máy bị gỡ khỏi phiếu nếu đang FAULTY / WAITING_PARTS do phiếu này
      const removedEquips = currentEquipments.filter((eq) => !requestedEquipIds.includes(eq.id));
      for (const oldEq of removedEquips) {
        if (oldEq.status === "FAULTY" || oldEq.status === "WAITING_PARTS") {
          const otherOpenTickets = await countOtherOpenTicketsForEquipment(oldEq.id, id, equipMap);
          if (otherOpenTickets === 0) {
            await tx.equipment.update({
              where: { id: oldEq.id },
              data: { status: "ACTIVE" },
            });
            await tx.equipmentStatusHistory.create({
              data: {
                equipmentId: oldEq.id,
                fromStatus: oldEq.status,
                toStatus: "ACTIVE",
                note: `Khôi phục trạng thái hoạt động do gỡ thiết bị khỏi phiếu ${existing.code}`,
              },
            });
          }
        }
      }

      // Cập nhật trạng thái các máy mới được thêm vào phiếu nếu người dùng chủ động lựa chọn
      const addedEquips = nextEquipments.filter((eq) => !currentEquipmentIds.includes(eq.id));
      if (
        data.equipmentStatus &&
        data.equipmentStatus !== "KEEP" &&
        ["PENDING", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"].includes(nextStatus)
      ) {
        for (const addedEq of addedEquips) {
          if (addedEq.status !== data.equipmentStatus) {
            await tx.equipment.update({
              where: { id: addedEq.id },
              data: { status: data.equipmentStatus as EquipmentStatus },
            });
            await tx.equipmentStatusHistory.create({
              data: {
                equipmentId: addedEq.id,
                fromStatus: addedEq.status,
                toStatus: data.equipmentStatus as EquipmentStatus,
                note: `Cập nhật trạng thái khi thêm thiết bị vào phiếu ${existing.code}`,
              },
            });
          }
        }
      }
    }

    const oldEquipLabel =
      currentEquipments.length > 0
        ? currentEquipments
            .map((m) => `${m.model}${m.serialNumber ? ` (${m.serialNumber})` : ""}`)
            .join(", ")
        : "Phiếu dịch vụ";
    const newEquipLabel =
      nextEquipments.length > 0
        ? nextEquipments
            .map((m) => `${m.model}${m.serialNumber ? ` (${m.serialNumber})` : ""}`)
            .join(", ")
        : "Phiếu dịch vụ";

    if (
      isChangingEquipmentList ||
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
          note: isChangingEquipmentList
            ? `Cập nhật thiết bị: từ [${oldEquipLabel}] sang [${newEquipLabel}]${data.note ? ` (${data.note})` : ""}`
            : data.note ||
              (data.diagnosis
                ? `Cập nhật chẩn đoán: ${data.diagnosis}`
                : `Cập nhật thông tin phiếu (${nextStatus})`),
        },
      });
    }

    const effectiveEquipId = targetEquipmentId;
    if (effectiveEquipId && data.counterAtClose !== undefined && data.counterAtClose !== null) {
      await tx.equipment.update({
        where: { id: effectiveEquipId },
        data: { currentCounter: data.counterAtClose },
      });
      await tx.meterLog.create({
        data: {
          equipmentId: effectiveEquipId,
          ticketId: existing.id,
          recordedById: session.userId,
          counterValue: data.counterAtClose,
          source: (data.meterSource || (session.role === "SUPER_ADMIN" ? "MANUAL" : "TECH")) as MeterSource,
        },
      });
    }

    // Ghi nhận Counter riêng cho từng máy nếu có trong equipmentTasks khi cập nhật phiếu
    if (Array.isArray(data.equipmentTasks) && data.equipmentTasks.length > 0) {
      for (const taskItem of data.equipmentTasks) {
        if (typeof taskItem.counter === "number" && taskItem.counter > 0) {
          const eqObj = nextEquipments.find((e) => e.id === taskItem.equipmentId);
          if (eqObj && taskItem.counter !== eqObj.currentCounter) {
            const isLower = taskItem.counter < eqObj.currentCounter;
            await tx.meterLog.create({
              data: {
                equipmentId: eqObj.id,
                ticketId: existing.id,
                recordedById: session.userId,
                counterValue: taskItem.counter,
                source: "MANUAL",
                status: isLower ? "PENDING_APPROVAL" : "APPROVED",
                adjustmentReason: isLower ? `Cập nhật từ phiếu ${existing.code}` : null,
              },
            });
            if (!isLower) {
              await tx.equipment.update({
                where: { id: eqObj.id },
                data: { currentCounter: taskItem.counter },
              });
            }
          }
        }
      }
    }

    if (!isChangingEquipmentList && data.equipmentStatus === "WAITING_PARTS") {
      for (const eq of currentEquipments) {
        if (eq.status !== "WAITING_PARTS") {
          await tx.equipment.update({
            where: { id: eq.id },
            data: { status: "WAITING_PARTS" },
          });
          await tx.equipmentStatusHistory.create({
            data: {
              equipmentId: eq.id,
              fromStatus: eq.status,
              toStatus: "WAITING_PARTS",
              note: `Chờ linh kiện theo phiếu ${existing.code}`,
            },
          });
        }
      }
    }

    return t;
  });

  if (data.type) {
    await setTicketCustomTypeForTicket(id, data.type);
  }
  if (hasExplicitEquipmentInput) {
    await setTicketEquipmentIds(id, requestedEquipIds);
  }
  if (Array.isArray(data.equipmentTasks)) {
    const normalizedTasks: TicketEquipmentTask[] = data.equipmentTasks.map((item) => ({
      equipmentId: item.equipmentId.trim(),
      workType: item.workType?.trim() || data.type || existing.type || "REPAIR",
      ...(item.note?.trim() ? { note: item.note.trim() } : {}),
      ...(typeof item.counter === "number" && item.counter >= 0
        ? { counter: Math.round(item.counter) }
        : {}),
    }));
    await setTicketEquipmentTasks(
      id,
      normalizedTasks,
      hasExplicitEquipmentInput ? requestedEquipIds : currentEquipmentIds
    );
  } else if (hasExplicitEquipmentInput && requestedEquipIds.length === 0) {
    await setTicketEquipmentTasks(id, [], []);
  }

  const [latestCustomMap, latestEquipMap] = await Promise.all([
    getTicketCustomTypesMap(),
    getTicketEquipmentsMap(),
  ]);

  await audit(session.userId, "TICKET_UPDATE", "Ticket", id, {
    code: existing.code,
    status: nextStatus,
    ...(data.type ? { type: data.type } : {}),
    ...(hasExplicitEquipmentInput ? { equipmentCount: requestedEquipIds.length } : {}),
  });

  const [enrichedUpdated] = await enrichTicketsWithEquipmentList(
    [
      {
        ...updated,
        type: latestCustomMap[id] || updated.type,
      },
    ],
    latestEquipMap
  );

  return NextResponse.json(
    enrichedUpdated || {
      ...updated,
      type: latestCustomMap[id] || updated.type,
    }
  );
});

export const DELETE = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  // Quyền xóa / hủy phiếu theo phân quyền "ticket:cancel"
  const canDeletePerm = await checkUserPermission(session.userId, session.role, "ticket:cancel");
  if (!canDeletePerm) {
    throw new HttpError(
      403,
      "Bạn không có quyền xóa phiếu kỹ thuật (yêu cầu quyền ticket:cancel)."
    );
  }

  const { id } = await ctx.params;
  const [ticket, equipMap] = await Promise.all([
    prisma.ticket.findUnique({
      where: { id },
      include: {
        stockIssues: true,
        partsUsed: true,
        meterLogs: true,
        attachments: true,
        equipment: true,
      },
    }),
    getTicketEquipmentsMap(),
  ]);

  if (!ticket) throw new HttpError(404, "Không tìm thấy phiếu kỹ thuật để xóa");

  const ticketEquipmentIds = getEffectiveEquipmentIds(ticket, equipMap);
  const ticketEquipments =
    ticketEquipmentIds.length > 0
      ? await prisma.equipment.findMany({ where: { id: { in: ticketEquipmentIds } } })
      : [];

  // RÀNG BUỘC TOÀN VẸN HỆ THỐNG:
  // 1. Không cho xóa nếu đã hoàn thành
  if (ticket.status === "COMPLETED") {
    throw new HttpError(
      400,
      "Không thể xóa phiếu đã hoàn thành vì đã phát sinh chữ ký, chốt chỉ số Counter và tính tiền dịch vụ."
    );
  }

  // 2. Không cho xóa nếu có phiếu xuất kho
  if (ticket.stockIssues.length > 0) {
    throw new HttpError(
      400,
      `Không thể xóa phiếu vì đã có ${ticket.stockIssues.length} phiếu xuất kho linh kiện liên quan. Để đảm bảo cân đối kho, bạn hãy chọn 'Hủy phiếu' hoặc hủy phiếu xuất kho trước.`
    );
  }

  // 3. Không cho xóa nếu đã ghi nhận linh kiện thay thế vào máy
  if (ticket.partsUsed.length > 0) {
    throw new HttpError(
      400,
      `Không thể xóa phiếu vì đã ghi nhận ${ticket.partsUsed.length} linh kiện thay thế vào lý lịch máy.`
    );
  }

  // 4. Không cho xóa nếu đã có ghi nhận chốt Counter
  if (ticket.meterLogs.length > 0) {
    throw new HttpError(
      400,
      "Không thể xóa phiếu vì đã có bản ghi chốt Counter liên kết với phiếu này."
    );
  }

  // 5. Không cho xóa nếu KTV đã Check-in hiện trường
  if (ticket.checkInAt) {
    throw new HttpError(
      400,
      "Không thể xóa phiếu vì Kỹ thuật viên đã Check-in GPS tại địa chỉ khách hàng. Vui lòng chọn 'Hủy phiếu' để giữ vết công tác."
    );
  }

  // Thực hiện xóa an toàn trong transaction
  await prisma.$transaction(async (tx) => {
    await tx.ticketAttachment.deleteMany({ where: { ticketId: id } });
    await tx.ticketLog.deleteMany({ where: { ticketId: id } });

    // Khôi phục trạng thái các máy gắn trên phiếu nếu máy đang báo hỏng do phiếu này
    for (const eq of ticketEquipments) {
      if (eq.status === "FAULTY" || eq.status === "WAITING_PARTS") {
        const otherFaultyTickets = await countOtherOpenTicketsForEquipment(eq.id, id, equipMap);
        if (otherFaultyTickets === 0) {
          await tx.equipment.update({
            where: { id: eq.id },
            data: { status: "ACTIVE" },
          });
        }
      }
    }

    await tx.ticket.delete({ where: { id } });
  });

  await removeTicketEquipmentIds(id);

  await audit(session.userId, "TICKET_DELETE", "Ticket", id, {
    code: ticket.code,
    description: ticket.description,
    customerId: ticket.customerId,
    equipmentId: ticket.equipmentId || undefined,
  });

  return NextResponse.json({ success: true, message: `Đã xóa vĩnh viễn phiếu kỹ thuật ${ticket.code}` });
});
