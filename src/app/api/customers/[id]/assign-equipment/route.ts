import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { parseBody, withErrors } from "@/lib/http";
import { validateContractOwner } from "@/lib/equipment";
import { resolveLocationIds } from "@/lib/location";

type Ctx = { params: Promise<{ id: string }> };

const assignSchema = z.object({
  equipmentId: z.string().min(1, "Vui lòng chọn thiết bị"),
  relationType: z.string().trim().default("Cho thuê"),
  branchId: z.string().nullable().optional(),
  buildingId: z.string().nullable().optional(),
  departmentId: z.string().nullable().optional(),
  contractId: z.string().nullable().optional(),
  locationNote: z.string().trim().nullable().optional(),
  initialCounter: z.coerce.number().int().nonnegative().optional(),
  warrantyUntil: z.coerce.date().nullable().optional(),
  note: z.string().trim().optional(),
});

export const POST = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "equipment:write")))
    return NextResponse.json({ error: "Không có quyền gán thiết bị" }, { status: 403 });

  const { id: customerId } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true },
  });
  if (!customer) return NextResponse.json({ error: "Khách hàng không tồn tại" }, { status: 404 });

  const r = await parseBody(req, assignSchema);
  if (r.error) return r.error;

  const {
    equipmentId,
    relationType,
    branchId,
    buildingId,
    departmentId,
    contractId,
    locationNote,
    initialCounter,
    warrantyUntil,
    note,
  } = r.data;

  // Validate contract belongs to this customer if specified
  if (contractId) {
    const err = await validateContractOwner(customerId, contractId);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
  }

  // Check equipment exists
  const eq = await prisma.equipment.findUnique({ where: { id: equipmentId } });
  if (!eq) return NextResponse.json({ error: "Thiết bị không tồn tại" }, { status: 404 });

  // If already assigned to another active customer, reject or require explicit transfer
  if (eq.customerId && eq.customerId !== customerId && eq.status === "ACTIVE") {
    return NextResponse.json(
      {
        error:
          "Thiết bị này đang được gán cho một khách hàng khác. Vui lòng thu hồi trước khi gán lại.",
      },
      { status: 400 }
    );
  }

  const finalRelation = relationType || eq.relationType || "Cho thuê";
  const loc = await resolveLocationIds({ branchId, buildingId, departmentId });

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.equipment.update({
      where: { id: equipmentId },
      data: {
        customerId,
        warehouseId: null,
        relationType: finalRelation,
        branchId: loc.branchId,
        buildingId: loc.buildingId,
        departmentId: loc.departmentId,
        contractId: contractId || null,
        locationNote: locationNote || null,
        status: "ACTIVE",
        installedAt: eq.installedAt || new Date(),
        ...(warrantyUntil !== undefined ? { warrantyUntil } : {}),
        ...(initialCounter !== undefined ? { currentCounter: initialCounter } : {}),
      },
    });

    await tx.equipmentStatusHistory.create({
      data: {
        equipmentId,
        fromStatus: eq.status,
        toStatus: "ACTIVE",
        note: note || `Gán máy (${finalRelation}) cho khách hàng ${customer.name}`,
      },
    });

    if (initialCounter !== undefined && initialCounter !== eq.currentCounter) {
      await tx.meterLog.create({
        data: {
          equipmentId,
          counterValue: initialCounter,
          recordedById: s.userId,
          source: "MANUAL",
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: s.userId,
        action: "EQUIPMENT_ASSIGN_CUSTOMER",
        entity: "Equipment",
        entityId: equipmentId,
        meta: {
          customerId,
          customerName: customer.name,
          relationType: finalRelation,
          contractId,
          departmentId,
        },
      },
    });

    return updated;
  });

  return NextResponse.json(result);
});
