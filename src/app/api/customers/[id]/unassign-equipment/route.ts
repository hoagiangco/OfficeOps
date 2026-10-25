import { NextResponse } from "next/server";
import { z } from "zod";
import { EquipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const unassignSchema = z.object({
  equipmentId: z.string().min(1, "Vui lòng chọn thiết bị"),
  warehouseId: z.string().trim().optional(),
  targetStatus: z.enum(["IN_STOCK", "RECALLED", "FAULTY"]).default("IN_STOCK"),
  note: z.string().trim().optional(),
  finalCounter: z.coerce.number().int().nonnegative().optional(),
});

export const POST = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "equipment:write"))) return NextResponse.json({ error: "Không có quyền thu hồi thiết bị" }, { status: 403 });

  const { id: customerId } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
  if (!customer) return NextResponse.json({ error: "Khách hàng không tồn tại" }, { status: 404 });

  const r = await parseBody(req, unassignSchema);
  if (r.error) return r.error;

  const { equipmentId, warehouseId, targetStatus, note, finalCounter } = r.data;

  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!eq) return NextResponse.json({ error: "Thiết bị không tồn tại" }, { status: 404 });

  if (eq.customerId !== customerId) {
    return NextResponse.json({ error: "Thiết bị không thuộc khách hàng này" }, { status: 400 });
  }

  // Nếu không chọn kho, lấy kho mặc định của công ty
  let targetWarehouseId = warehouseId || null;
  if (!targetWarehouseId) {
    const defaultWh = await prisma.warehouse.findFirst({ where: { isDefault: true } });
    targetWarehouseId = defaultWh?.id || null;
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.equipment.update({
      where: { id: equipmentId },
      data: {
        customerId: null,
        contractId: null,
        departmentId: null,
        locationNote: null,
        warehouseId: targetWarehouseId,
        status: targetStatus as EquipmentStatus,
        ...(finalCounter !== undefined ? { currentCounter: finalCounter } : {}),
      },
    });

    await tx.equipmentStatusHistory.create({
      data: {
        equipmentId,
        fromStatus: eq.status,
        toStatus: targetStatus as EquipmentStatus,
        note: note || `Thu hồi thiết bị từ khách hàng ${customer.name} về trạng thái ${targetStatus}`,
      },
    });

    if (finalCounter !== undefined && finalCounter !== eq.currentCounter) {
      await tx.meterLog.create({
        data: {
          equipmentId,
          counterValue: finalCounter,
          recordedById: s.userId,
          source: "MANUAL",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: s.userId,
        action: "EQUIPMENT_UNASSIGN_CUSTOMER",
        entity: "Equipment",
        entityId: equipmentId,
        meta: { customerId, customerName: customer.name, targetStatus },
      },
    });

    return updated;
  });

  return NextResponse.json(result);
});
