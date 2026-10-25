import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import type { MeterSource, MeterApprovalStatus } from "@prisma/client";

const createMeterSchema = z.object({
  equipmentId: z.string().min(1, "Vui lòng chọn thiết bị"),
  counterValue: z.number().int().min(0, "Chỉ số counter không hợp lệ"),
  source: z.enum(["MANUAL", "OCR", "TECH", "CUSTOMER"]).default("MANUAL"),
  photoUrl: z.string().optional().nullable(),
  logDate: z.string().optional(),
  adjustmentReason: z.string().optional().nullable(),
});

export const GET = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const sp = new URL(req.url).searchParams;
  const equipmentId = sp.get("equipmentId");
  const customerId = sp.get("customerId");
  const isBilledParam = sp.get("isBilled");
  const statusParam = sp.get("status"); // ALL | APPROVED | PENDING_APPROVAL | REJECTED
  const pendingOnly = sp.get("pendingOnly") === "true";

  const logs = await prisma.meterLog.findMany({
    where: {
      ...(equipmentId ? { equipmentId } : {}),
      ...(customerId ? { equipment: { customerId } } : {}),
      ...(isBilledParam === "true"
        ? { isBilled: true }
        : isBilledParam === "false"
        ? { isBilled: false }
        : {}),
      ...(pendingOnly
        ? { status: "PENDING_APPROVAL" }
        : statusParam && statusParam !== "ALL"
        ? { status: statusParam as MeterApprovalStatus }
        : {}),
    },
    include: {
      equipment: {
        select: {
          id: true,
          serialNumber: true,
          model: true,
          brand: true,
          currentCounter: true,
          baseQuota: true,
          overagePrice: true,
          customer: { select: { id: true, name: true, code: true } },
          contract: {
            select: {
              id: true,
              code: true,
              baseQuota: true,
              overagePrice: true,
            },
          },
        },
      },
      recordedBy: { select: { id: true, name: true, role: true } },
      approvedBy: { select: { id: true, name: true, role: true } },
      ticket: { select: { id: true, code: true, title: true } },
      invoiceItem: {
        select: {
          id: true,
          invoice: { select: { id: true, code: true, status: true } },
        },
      },
    },
    orderBy: { logDate: "desc" },
    take: 200,
  });

  return NextResponse.json(logs);
});

export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("meter:record");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, createMeterSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const equipment = await prisma.equipment.findUnique({
    where: { id: data.equipmentId },
  });
  if (!equipment) throw new HttpError(404, "Không tìm thấy thiết bị");

  const isLowerCounter = data.counterValue < equipment.currentCounter;

  // D3: Nếu số counter mới nhỏ hơn số hiện tại, yêu cầu bắt buộc có lý do và ảnh minh chứng
  if (isLowerCounter) {
    if (!data.adjustmentReason || data.adjustmentReason.trim().length < 3) {
      throw new HttpError(
        400,
        `Chỉ số counter mới (${data.counterValue.toLocaleString(
          "vi-VN"
        )}) thấp hơn counter hiện tại của máy (${equipment.currentCounter.toLocaleString(
          "vi-VN"
        )}). Vui lòng cung cấp Lý do điều chỉnh (VD: Thay bo mạch chính, reset đồng hồ, nhập nhầm) và ảnh chụp để gửi cấp trên phê duyệt.`
      );
    }

    if (!data.photoUrl) {
      throw new HttpError(
        400,
        "Yêu cầu bắt buộc đính kèm ảnh chụp đồng hồ Counter thực tế khi điều chỉnh giảm chỉ số."
      );
    }
  }

  if (isLowerCounter) {
    // Tạo bản ghi MeterLog ở trạng thái PENDING_APPROVAL, KHÔNG cập nhật equipment.currentCounter
    const created = await prisma.meterLog.create({
      data: {
        equipmentId: data.equipmentId,
        recordedById: session.userId,
        counterValue: data.counterValue,
        source: data.source as MeterSource,
        photoUrl: data.photoUrl || null,
        logDate: data.logDate ? new Date(data.logDate) : new Date(),
        status: "PENDING_APPROVAL",
        adjustmentReason: data.adjustmentReason?.trim() || null,
      },
      include: {
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: true,
            currentCounter: true,
            customer: { select: { id: true, name: true } },
          },
        },
        recordedBy: { select: { id: true, name: true } },
      },
    });

    await audit(session.userId, "METER_ADJUST_REQUEST", "MeterLog", created.id, {
      equipmentId: created.equipmentId,
      currentCounter: equipment.currentCounter,
      requestedCounter: data.counterValue,
      delta: data.counterValue - equipment.currentCounter,
      reason: data.adjustmentReason,
      status: "PENDING_APPROVAL",
    });

    return NextResponse.json(
      {
        ...created,
        pendingApproval: true,
        message:
          "Chỉ số counter thấp hơn hiện tại đã được gửi chờ Kế toán / Giám đốc phê duyệt.",
      },
      { status: 201 }
    );
  }

  // Luồng bình thường (counterValue >= currentCounter): Duyệt ngay và cập nhật máy
  const created = await prisma.$transaction(async (tx) => {
    const log = await tx.meterLog.create({
      data: {
        equipmentId: data.equipmentId,
        recordedById: session.userId,
        counterValue: data.counterValue,
        source: data.source as MeterSource,
        photoUrl: data.photoUrl || null,
        logDate: data.logDate ? new Date(data.logDate) : new Date(),
        status: "APPROVED",
        adjustmentReason: data.adjustmentReason || null,
      },
      include: {
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: true,
            customer: { select: { id: true, name: true } },
          },
        },
        recordedBy: { select: { id: true, name: true } },
      },
    });

    await tx.equipment.update({
      where: { id: data.equipmentId },
      data: { currentCounter: data.counterValue },
    });

    return log;
  });

  await audit(session.userId, "METER_RECORD", "MeterLog", created.id, {
    equipmentId: created.equipmentId,
    previousCounter: equipment.currentCounter,
    newCounter: data.counterValue,
    usageDelta: data.counterValue - equipment.currentCounter,
  });

  return NextResponse.json(created, { status: 201 });
});
