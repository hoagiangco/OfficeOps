import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, audit } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";

const meterActionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().optional().nullable(),
});

export const PATCH = withErrors(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const session = await getSession();
    if (!session) throw new HttpError(401, "Chưa đăng nhập");

    // Chỉ Giám đốc, Admin, Kế toán mới được duyệt điều chỉnh Counter
    const allowedRoles = ["SUPER_ADMIN", "ADMIN", "DIRECTOR", "ACCOUNTANT"];
    if (!allowedRoles.includes(session.role)) {
      throw new HttpError(
        403,
        "Chỉ Giám đốc, Quản trị viên hoặc Kế toán mới có quyền duyệt điều chỉnh Counter."
      );
    }

    const { id } = await params;
    const parsed = await parseBody(req, meterActionSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const meterLog = await prisma.meterLog.findUnique({
      where: { id },
      include: {
        equipment: true,
        recordedBy: { select: { id: true, name: true, role: true } },
      },
    });

    if (!meterLog) {
      throw new HttpError(404, "Không tìm thấy bản ghi chỉ số Counter");
    }

    if (meterLog.status !== "PENDING_APPROVAL") {
      throw new HttpError(
        400,
        `Bản ghi counter đã ở trạng thái ${meterLog.status}, không thể thao tác lại.`
      );
    }

    if (data.action === "REJECT" && (!data.reason || data.reason.trim().length === 0)) {
      throw new HttpError(400, "Vui lòng nhập lý do từ chối yêu cầu điều chỉnh counter.");
    }

    if (data.action === "APPROVE") {
      const updated = await prisma.$transaction(async (tx) => {
        const approved = await tx.meterLog.update({
          where: { id },
          data: {
            status: "APPROVED",
            approvedById: session.userId,
            approvedAt: new Date(),
          },
          include: {
            equipment: true,
            recordedBy: { select: { id: true, name: true } },
            approvedBy: { select: { id: true, name: true } },
          },
        });

        // Cập nhật counter mới cho thiết bị
        await tx.equipment.update({
          where: { id: meterLog.equipmentId },
          data: { currentCounter: meterLog.counterValue },
        });

        return approved;
      });

      await audit(session.userId, "METER_ADJUST_APPROVE", "MeterLog", id, {
        equipmentId: meterLog.equipmentId,
        oldCounter: meterLog.equipment.currentCounter,
        newApprovedCounter: meterLog.counterValue,
        recordedById: meterLog.recordedById,
      });

      return NextResponse.json(updated);
    }

    // Action: REJECT
    const updated = await prisma.meterLog.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectionReason: data.reason?.trim() || "Không được chấp thuận",
        approvedById: session.userId,
        approvedAt: new Date(),
      },
      include: {
        equipment: true,
        recordedBy: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
    });

    await audit(session.userId, "METER_ADJUST_REJECT", "MeterLog", id, {
      equipmentId: meterLog.equipmentId,
      currentCounter: meterLog.equipment.currentCounter,
      rejectedCounter: meterLog.counterValue,
      reason: data.reason,
      recordedById: meterLog.recordedById,
    });

    return NextResponse.json(updated);
  }
);
