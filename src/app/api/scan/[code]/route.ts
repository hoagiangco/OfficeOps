import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import type { EquipmentStatus } from "@prisma/client";

const reportSchema = z.object({
  contactName: z.string().trim().min(2, "Vui lòng nhập họ và tên của bạn"),
  contactPhone: z.string().trim().min(9, "Vui lòng nhập số điện thoại liên hệ hợp lệ").max(15),
  issueType: z.string().trim().min(1, "Vui lòng chọn hoặc nhập loại sự cố"),
  description: z.string().trim().min(3, "Vui lòng mô tả thêm hiện tượng lỗi"),
  priority: z.enum(["NORMAL", "URGENT"]).default("NORMAL"),
  photoUrl: z.string().optional().nullable(),
});

type RouteCtx = { params: Promise<{ code: string }> };

// GET: Lấy thông tin cơ bản của thiết bị để hiển thị trên Cổng quét mã QR cho Khách hàng
export const GET = withErrors(async (_req: Request, { params }: RouteCtx) => {
  const { code } = await params;
  if (!code) throw new HttpError(400, "Thiếu mã quét");

  const eq = await prisma.equipment.findFirst({
    where: {
      OR: [
        { qrCode: code },
        { serialNumber: code },
        { code: code },
      ],
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
        },
      },
      department: {
        select: {
          name: true,
          building: {
            select: {
              name: true,
              branch: {
                select: { name: true },
              },
            },
          },
        },
      },
      tickets: {
        where: {
          status: { notIn: ["COMPLETED", "CANCELLED"] },
        },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          code: true,
          status: true,
          type: true,
          description: true,
          createdAt: true,
        },
      },
    },
  });

  if (!eq) {
    throw new HttpError(404, "Không tìm thấy thiết bị tương ứng với mã quét này.");
  }

  // Vị trí lắp đặt
  let locationStr = eq.locationNote || "";
  if (eq.department) {
    const parts = [
      eq.department.name,
      eq.department.building?.name,
      eq.department.building?.branch?.name,
    ].filter(Boolean);
    if (parts.length > 0) {
      locationStr = parts.join(" - ") + (locationStr ? ` (${locationStr})` : "");
    }
  }

  return NextResponse.json({
    id: eq.id,
    code: eq.code,
    serialNumber: eq.serialNumber,
    qrCode: eq.qrCode,
    model: eq.model,
    brand: eq.brand,
    type: eq.type,
    status: eq.status,
    customerName: eq.customer?.name || "Chưa gán khách hàng",
    customerPhone: eq.customer?.phone || null,
    location: locationStr || "Văn phòng khách hàng",
    activeTicket: eq.tickets[0] || null,
    supportHotline: "0908 123 456",
    supportEmail: "support@officeops.vn",
  });
});

// POST: Khách hàng gửi yêu cầu hỗ trợ sự cố trực tiếp từ Cổng QR
export const POST = withErrors(async (req: Request, { params }: RouteCtx) => {
  const { code } = await params;
  if (!code) throw new HttpError(400, "Thiếu mã quét");

  const parsed = await parseBody(req, reportSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const eq = await prisma.equipment.findFirst({
    where: {
      OR: [
        { qrCode: code },
        { serialNumber: code },
        { code: code },
      ],
    },
    include: {
      customer: true,
    },
  });

  if (!eq) {
    throw new HttpError(404, "Không tìm thấy thiết bị.");
  }

  if (!eq.customerId) {
    throw new HttpError(
      400,
      "Thiết bị này chưa được liên kết với khách hàng trên hệ thống. Vui lòng liên hệ hotline kỹ thuật 0908 123 456 để được hỗ trợ trực tiếp."
    );
  }

  // 1. Chống spam: Giới hạn theo IP (tối đa 5 yêu cầu/giờ/máy)
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`scan_report:${ip}:${eq.id}`, 5, 60 * 60 * 1000);
  if (!rateLimit.allowed) {
    throw new HttpError(
      429,
      `Bạn đã gửi yêu cầu quá nhiều lần cho thiết bị này. Vui lòng chờ ${Math.ceil(
        rateLimit.resetInSec / 60
      )} phút hoặc gọi hotline 0908 123 456 để được hỗ trợ gấp.`
    );
  }

  // 2. Chống spam phiếu trùng: Từ chối nếu máy đã có phiếu PENDING trong vòng 10 phút gần nhất
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentPendingTicket = await prisma.ticket.findFirst({
    where: {
      equipmentId: eq.id,
      status: "PENDING",
      createdAt: { gte: tenMinutesAgo },
    },
    orderBy: { createdAt: "desc" },
  });

  if (recentPendingTicket) {
    throw new HttpError(
      429,
      `Thiết bị này vừa được tạo yêu cầu tiếp nhận (Mã: ${recentPendingTicket.code}) cách đây ít phút. Đội ngũ kỹ thuật đang xử lý, vui lòng không gửi lại liên tục.`
    );
  }

  // Kiểm tra xem đã có Ticket đang xử lý cho máy này chưa
  const existingTicket = await prisma.ticket.findFirst({
    where: {
      equipmentId: eq.id,
      status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
    },
  });

  // Sinh mã phiếu TK-YYYY-XXXX
  const year = new Date().getFullYear();
  const ticketCountThisYear = await prisma.ticket.count({
    where: { code: { startsWith: `TK-${year}-` } },
  });
  const ticketCode = `TK-${year}-${String(ticketCountThisYear + 1).padStart(4, "0")}`;

  const priority = data.priority === "URGENT" ? "URGENT" : "HIGH";
  const fullDescription = `[Khách hàng báo hỏng: ${data.issueType}] ${data.description} | Người liên hệ: ${data.contactName} - SĐT: ${data.contactPhone}`;

  // Thực thi Transaction tạo Ticket & cập nhật trạng thái
  const createdTicket = await prisma.$transaction(async (tx) => {
    // 1. Tạo Ticket
    const ticket = await tx.ticket.create({
      data: {
        code: ticketCode,
        customerId: eq.customerId!,
        equipmentId: eq.id,
        type: "REPAIR",
        status: "PENDING",
        priority,
        source: "CUSTOMER",
        description: fullDescription,
        slaDueAt: new Date(Date.now() + 4 * 3600 * 1000), // Cam kết 4 giờ
      },
    });

    // 2. Ghi TicketLog
    await tx.ticketLog.create({
      data: {
        ticketId: ticket.id,
        fromStatus: null,
        toStatus: "PENDING",
        note: `Phiếu kỹ thuật được tạo tự động từ Cổng Khách hàng quét mã QR (${data.contactName} - ${data.contactPhone})`,
      },
    });

    // 3. Đính kèm ảnh lỗi (nếu có)
    if (data.photoUrl) {
      await tx.ticketAttachment.create({
        data: {
          ticketId: ticket.id,
          url: data.photoUrl,
          kind: "PHOTO",
        },
      });
    }

    // 4. Đổi trạng thái máy sang FAULTY nếu đang ACTIVE hoặc IN_STOCK
    if (eq.status === "ACTIVE" || eq.status === "IN_STOCK") {
      await tx.equipment.update({
        where: { id: eq.id },
        data: { status: "FAULTY" },
      });

      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: eq.id,
          fromStatus: eq.status as EquipmentStatus,
          toStatus: "FAULTY",
          note: `Khách hàng báo sự cố qua Cổng QR: ${data.issueType}`,
        },
      });
    }

    // 5. Gửi Notification cho tất cả Điều phối viên và Giám đốc
    const dispatchersAndAdmins = await tx.user.findMany({
      where: {
        role: { in: ["DISPATCHER", "SUPER_ADMIN", "ADMIN"] },
        isActive: true,
      },
      select: { id: true },
    });

    if (dispatchersAndAdmins.length > 0) {
      await tx.notification.createMany({
        data: dispatchersAndAdmins.map((u) => ({
          userId: u.id,
          channel: "IN_APP",
          title: `🚨 Sự cố máy ${eq.model} (${eq.serialNumber})`,
          body: `Khách hàng ${eq.customer?.name} vừa báo lỗi "${data.issueType}". Liên hệ: ${data.contactName} (${data.contactPhone}). Mã phiếu: ${ticketCode}`,
        })),
      });
    }

    return ticket;
  });

  return NextResponse.json({
    success: true,
    ticket: {
      id: createdTicket.id,
      code: createdTicket.code,
      priority: createdTicket.priority,
      createdAt: createdTicket.createdAt,
    },
    message: existingTicket
      ? `Đã tiếp nhận thêm yêu cầu mới cho máy. Lưu ý hiện có phiếu ${existingTicket.code} cũng đang trong quá trình xử lý.`
      : `Đã tiếp nhận yêu cầu thành công! Kỹ thuật viên sẽ liên hệ và có mặt hỗ trợ trong thời gian sớm nhất.`,
  });
});
