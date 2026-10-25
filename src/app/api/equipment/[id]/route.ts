import { NextResponse } from "next/server";
import { z } from "zod";
import { EquipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors } from "@/lib/http";
import { validateContractOwner } from "@/lib/equipment";
import { resolveLocationIds } from "@/lib/location";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    code: z.string().trim().nullable(),
    model: z.string().trim().min(1),
    brand: z.string().trim().nullable(),
    type: z.string().trim(),
    group: z.string().trim(),
    relationType: z.string().trim(),
    categoryId: z.string().trim().nullable(),
    warehouseId: z.string().trim().nullable(),
    specs: z.record(z.string(), z.unknown()).nullable(),
    customerId: z.string().min(1).nullable(),
    contractId: z.string().min(1).nullable(),
    branchId: z.string().min(1).nullable(),
    buildingId: z.string().min(1).nullable(),
    departmentId: z.string().min(1).nullable(),
    locationNote: z.string().trim().nullable(),
    notes: z.string().trim().nullable(),
    status: z.nativeEnum(EquipmentStatus),
    healthScore: z.coerce.number().int().min(0).max(100),
    currentCounter: z.coerce.number().int().nonnegative(),
    baseQuota: z.coerce.number().int().nonnegative().nullable(),
    overagePrice: z.coerce.number().nonnegative().nullable(),
    importedAt: z.coerce.date().nullable(),
    installedAt: z.coerce.date().nullable(),
    warrantyUntil: z.coerce.date().nullable(),
    statusNote: z.string().trim(),
  })
  .partial();

export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "equipment:read")))
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          parent: {
            include: {
              parent: true,
            },
          },
        },
      },
      customer: true,
      warehouse: true,
      contract: true,
      branch: { select: { id: true, name: true, address: true } },
      building: { select: { id: true, name: true, branch: { select: { name: true } } } },
      department: { include: { building: { include: { branch: true } } } },
      statusHistory: { orderBy: { changedAt: "desc" } },
      meterLogs: { orderBy: { logDate: "desc" }, take: 20 },
      partHistory: { include: { part: true }, orderBy: { replacedAt: "desc" } },
      tickets: {
        include: { assignee: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: "desc" },
        take: 25,
      },
      schedules: { orderBy: { nextDueDate: "asc" } },
    },
  });
  if (!equipment) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });
  const isWh = !equipment.customerId || equipment.status === "IN_STOCK" || equipment.status === "RECALLED";
  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");
  const formatted = {
    ...equipment,
    customer: equipment.customer ? maskCustomerPhones(equipment.customer, canViewPhone) : equipment.customer,
    relationType: isWh ? "Sẵn hàng" : equipment.relationType,
  };
  if (s.role === "FIELD_TECH") {
    return NextResponse.json({ ...formatted, contract: null, meterLogs: [] });
  }
  return NextResponse.json(formatted);
});

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "equipment:write")))
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const r = await parseBody(req, patchSchema);
  if (r.error) return r.error;
  const { id } = await params;
  const current = await prisma.equipment.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const { statusNote, specs, status, ...rest } = r.data;
  const customerId = rest.customerId !== undefined ? rest.customerId : current.customerId;
  const contractId = rest.contractId !== undefined ? rest.contractId : current.contractId;
  const err = await validateContractOwner(customerId, contractId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const statusChanged = status !== undefined && status !== current.status;

  let locUpdate: Record<string, unknown> = {};
  if (rest.customerId === null) {
    locUpdate = { branchId: null, buildingId: null, departmentId: null };
  } else if (
    rest.branchId !== undefined ||
    rest.buildingId !== undefined ||
    rest.departmentId !== undefined
  ) {
    const loc = await resolveLocationIds({
      branchId: rest.branchId !== undefined ? rest.branchId : current.branchId,
      buildingId: rest.buildingId !== undefined ? rest.buildingId : current.buildingId,
      departmentId: rest.departmentId !== undefined ? rest.departmentId : current.departmentId,
    });
    locUpdate = {
      branchId: loc.branchId,
      buildingId: loc.buildingId,
      departmentId: loc.departmentId,
    };
  }

  const equipment = await prisma.$transaction(async (tx) => {
    const updated = await tx.equipment.update({
      where: { id },
      data: {
        ...rest,
        ...locUpdate,
        ...(rest.customerId ? { warehouseId: null } : {}),
        ...(rest.customerId === null || status === "IN_STOCK" ? { relationType: "Sẵn hàng" } : {}),
        ...(status ? { status } : {}),
        ...(specs !== undefined ? { specs: specs === null ? undefined : (specs as object) } : {}),
        ...(statusChanged && status === "SCRAPPED" ? { scrappedAt: new Date() } : {}),
      },
    });
    if (statusChanged) {
      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: id,
          fromStatus: current.status,
          toStatus: status!,
          note: statusNote,
        },
      });
    }
    await tx.auditLog.create({
      data: { userId: s.userId, action: "EQUIPMENT_UPDATE", entity: "Equipment", entityId: id },
    });
    return updated;
  });
  return NextResponse.json(equipment);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "equipment:write")))
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;

  const [ticketCount, partCount] = await Promise.all([
    prisma.ticket.count({ where: { equipmentId: id } }),
    prisma.partReplacement.count({ where: { equipmentId: id } }),
  ]);
  if (ticketCount > 0 || partCount > 0) {
    return NextResponse.json(
      {
        error: `Thiết bị đã có ${ticketCount} phiếu kỹ thuật / lịch sử thay vật tư, không thể xóa. Hãy chuyển trạng thái sang Thanh lý (SCRAPPED).`,
      },
      { status: 409 }
    );
  }

  await prisma.$transaction([
    prisma.equipmentStatusHistory.deleteMany({ where: { equipmentId: id } }),
    prisma.maintenanceSchedule.deleteMany({ where: { equipmentId: id } }),
    prisma.meterLog.deleteMany({ where: { equipmentId: id } }),
    prisma.equipment.delete({ where: { id } }),
  ]);
  await prisma.auditLog.create({
    data: { userId: s.userId, action: "EQUIPMENT_DELETE", entity: "Equipment", entityId: id },
  });
  return NextResponse.json({ ok: true });
});
