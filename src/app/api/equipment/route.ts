import { NextResponse } from "next/server";
import { z } from "zod";
import { EquipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { getCategoryDescendantIds, validateContractOwner } from "@/lib/equipment";
import { resolveLocationIds } from "@/lib/location";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const equipmentSchema = z.object({
  code: z.string().trim().optional().nullable(),
  serialNumber: z.string().trim().min(1, "Vui lòng nhập Serial Number"),
  model: z.string().trim().min(1, "Vui lòng nhập dòng máy (Model)"),
  brand: z.string().trim().optional().nullable(),
  type: z.string().trim().default("Máy Photocopy"),
  group: z.string().trim().default("Máy văn phòng"),
  relationType: z.string().trim().default("Cho thuê"),
  categoryId: z.string().trim().optional().nullable(),
  warehouseId: z.string().trim().optional().nullable(),
  specs: z.record(z.string(), z.unknown()).optional(),
  customerId: z.string().min(1).optional().nullable(),
  contractId: z.string().min(1).optional().nullable(),
  branchId: z.string().min(1).optional().nullable(),
  buildingId: z.string().min(1).optional().nullable(),
  departmentId: z.string().min(1).optional().nullable(),
  locationNote: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  status: z.nativeEnum(EquipmentStatus).optional(),
  currentCounter: z.coerce.number().int().nonnegative().optional(),
  baseQuota: z.coerce.number().int().nonnegative().optional().nullable(),
  overagePrice: z.coerce.number().nonnegative().optional().nullable(),
  importedAt: z.coerce.date().optional().nullable(),
  installedAt: z.coerce.date().optional().nullable(),
  warrantyUntil: z.coerce.date().optional().nullable(),
});

function generateEquipmentCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `TB${year}${rand}`;
}

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:view");
  if (s instanceof NextResponse) return s;

  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const customerId = sp.get("customerId");
  const warehouseId = sp.get("warehouseId");
  const categoryId = sp.get("categoryId");
  const brand = sp.get("brand");
  const type = sp.get("type");
  const group = sp.get("group");
  const relationType = sp.get("relationType");
  const qr = sp.get("qr"); // tra cứu nhanh theo mã QR

  const andConditions: Record<string, unknown>[] = [];

  if (status && status in EquipmentStatus) {
    andConditions.push({ status: status as EquipmentStatus });
  }

  if (customerId) {
    if (customerId === "IN_WAREHOUSE") {
      andConditions.push({ customerId: null });
    } else if (customerId === "ASSIGNED") {
      andConditions.push({ customerId: { not: null } });
    } else if (customerId.startsWith("WH:")) {
      andConditions.push({ warehouseId: customerId.slice(3) });
    } else {
      andConditions.push({ customerId });
    }
  }

  if (warehouseId) {
    andConditions.push({ warehouseId });
  }

  if (categoryId) {
    const catIds = await getCategoryDescendantIds(categoryId);
    andConditions.push({ categoryId: { in: catIds } });
  }

  if (brand) {
    andConditions.push({ brand: { equals: brand, mode: "insensitive" as const } });
  }

  if (type) {
    andConditions.push({ type });
  }

  if (group) {
    andConditions.push({ group });
  }

  if (relationType) {
    if (relationType === "Sẵn hàng") {
      andConditions.push({
        OR: [
          { relationType: "Sẵn hàng" },
          { customerId: null },
          { status: "IN_STOCK" },
        ],
      });
    } else {
      andConditions.push({
        relationType,
        customerId: { not: null },
      });
    }
  }

  if (qr) {
    andConditions.push({ qrCode: qr });
  }

  if (q) {
    andConditions.push({
      OR: [
        { qrCode: { contains: q, mode: "insensitive" as const } },
        { serialNumber: { contains: q, mode: "insensitive" as const } },
        { code: { contains: q, mode: "insensitive" as const } },
        { model: { contains: q, mode: "insensitive" as const } },
        { brand: { contains: q, mode: "insensitive" as const } },
        { type: { contains: q, mode: "insensitive" as const } },
        { group: { contains: q, mode: "insensitive" as const } },
        { locationNote: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const [items, total, totalAll, brandStats, typeStats, groupStats, relationStats, statusStats] = await Promise.all([
    prisma.equipment.findMany({
      where,
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
        customer: { select: { id: true, name: true, code: true, phone: true, group: true, address: true } },
        warehouse: { select: { id: true, name: true, code: true, address: true } },
        contract: { select: { id: true, code: true, basePrice: true, baseQuota: true } },
        branch: { select: { id: true, name: true, address: true } },
        building: { select: { id: true, name: true, branch: { select: { name: true } } } },
        department: {
          select: {
            id: true,
            name: true,
            building: { select: { name: true, branch: { select: { name: true } } } },
          },
        },
        _count: {
          select: {
            tickets: true,
            partHistory: true,
            schedules: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.equipment.count({ where }),
    prisma.equipment.count(),
    prisma.equipment.groupBy({
      by: ["brand"],
      _count: { _all: true },
    }),
    prisma.equipment.groupBy({
      by: ["type"],
      _count: { _all: true },
    }),
    prisma.equipment.groupBy({
      by: ["group"],
      _count: { _all: true },
    }),
    prisma.equipment.groupBy({
      by: ["relationType"],
      _count: { _all: true },
    }),
    prisma.equipment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const brandCounts: Record<string, number> = {};
  brandStats.forEach((b) => {
    if (b.brand) brandCounts[b.brand] = b._count._all;
  });

  const typeCounts: Record<string, number> = {};
  typeStats.forEach((t) => {
    if (t.type) typeCounts[t.type] = t._count._all;
  });

  const groupCounts: Record<string, number> = {};
  groupStats.forEach((g) => {
    if (g.group) groupCounts[g.group] = g._count._all;
  });

  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");
  const formattedItems = items.map((eq) => ({
    ...eq,
    customer: eq.customer ? maskCustomerPhones(eq.customer, canViewPhone) : eq.customer,
    relationType:
      !eq.customerId || eq.status === "IN_STOCK" || eq.status === "RECALLED"
        ? "Sẵn hàng"
        : eq.relationType,
  }));

  const relationCounts: Record<string, number> = {};
  let inStockCount = 0;
  relationStats.forEach((r) => {
    if (r.relationType) relationCounts[r.relationType] = r._count._all;
  });

  // Calculate actual in-stock equipment
  const inStockStat = statusStats.find((s) => s.status === "IN_STOCK");
  if (inStockStat && inStockStat._count._all > 0) {
    relationCounts["Sẵn hàng"] = inStockStat._count._all;
  }

  const statusCounts: Record<string, number> = {};
  statusStats.forEach((st) => {
    statusCounts[st.status] = st._count._all;
  });

  return NextResponse.json({
    items: formattedItems,
    total,
    totalAll,
    page,
    pageSize,
    facets: {
      brandCounts,
      typeCounts,
      groupCounts,
      relationCounts,
      statusCounts,
    },
  });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:import-stock");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, equipmentSchema);
  if (r.error) return r.error;

  const { specs, code: inputCode, ...rest } = r.data;
  const err = await validateContractOwner(rest.customerId, rest.contractId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  let code = inputCode?.trim() || generateEquipmentCode();
  const dupCode = await prisma.equipment.findUnique({ where: { code } });
  if (dupCode) {
    code = generateEquipmentCode();
  }

  // If assigned to customer on creation and status wasn't explicitly set to something else, default to ACTIVE
  const finalStatus =
    rest.status ?? (rest.customerId ? EquipmentStatus.ACTIVE : EquipmentStatus.IN_STOCK);

  const loc = rest.customerId
    ? await resolveLocationIds({
        branchId: rest.branchId,
        buildingId: rest.buildingId,
        departmentId: rest.departmentId,
      })
    : { branchId: null, buildingId: null, departmentId: null };

  const equipment = await prisma.equipment.create({
    data: {
      code,
      serialNumber: rest.serialNumber,
      model: rest.model,
      brand: rest.brand || null,
      type: rest.type || "Máy Photocopy",
      group: rest.group || "Máy văn phòng",
      relationType: rest.customerId ? (rest.relationType || "Cho thuê") : "Sẵn hàng",
      categoryId: rest.categoryId || null,
      warehouseId: rest.customerId ? null : rest.warehouseId || null,
      customerId: rest.customerId || null,
      contractId: rest.contractId || null,
      branchId: loc.branchId,
      buildingId: loc.buildingId,
      departmentId: loc.departmentId,
      locationNote: rest.locationNote || null,
      notes: rest.notes || null,
      status: finalStatus,
      currentCounter: rest.currentCounter ?? 0,
      baseQuota: rest.baseQuota ?? null,
      overagePrice: rest.overagePrice ?? null,
      importedAt: rest.importedAt ?? new Date(),
      installedAt: rest.installedAt ?? (rest.customerId ? new Date() : null),
      warrantyUntil: rest.warrantyUntil ?? null,
      ...(specs ? { specs: specs as object } : {}),
    },
  });

  await prisma.equipmentStatusHistory.create({
    data: {
      equipmentId: equipment.id,
      toStatus: equipment.status,
      note: rest.customerId
        ? `Khởi tạo hồ sơ máy (${equipment.relationType})`
        : "Khởi tạo hồ sơ trong kho",
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "EQUIPMENT_CREATE",
      entity: "Equipment",
      entityId: equipment.id,
    },
  });

  return NextResponse.json(equipment, { status: 201 });
});
