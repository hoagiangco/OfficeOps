import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const createWarehouseSchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1, "Vui lòng nhập tên kho"),
  address: z.string().trim().optional().nullable(),
  managerName: z.string().trim().optional().nullable(),
  managerPhone: z.string().trim().optional().nullable(),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  notes: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const GET = withErrors(async () => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;

  const [warehouses, equipmentCounts, inStockCounts] = await Promise.all([
    prisma.warehouse.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.equipment.groupBy({
      by: ["warehouseId"],
      _count: { id: true },
      where: { warehouseId: { not: null } },
    }),
    prisma.equipment.groupBy({
      by: ["warehouseId"],
      _count: { id: true },
      where: {
        warehouseId: { not: null },
        status: "IN_STOCK",
      },
    }),
  ]);

  const countMap = new Map<string, number>();
  for (const item of equipmentCounts) {
    if (item.warehouseId) countMap.set(item.warehouseId, item._count.id);
  }

  const inStockMap = new Map<string, number>();
  for (const item of inStockCounts) {
    if (item.warehouseId) inStockMap.set(item.warehouseId, item._count.id);
  }

  const items = warehouses.map((w) => ({
    ...w,
    equipmentCount: countMap.get(w.id) ?? 0,
    inStockEquipmentCount: inStockMap.get(w.id) ?? 0,
  }));

  return NextResponse.json({ warehouses: items });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createWarehouseSchema);
  if (r.error) return r.error;

  const { code, name, address, managerName, managerPhone, isDefault, isActive, notes, sortOrder } = r.data;

  const existingName = await prisma.warehouse.findUnique({ where: { name } });
  if (existingName) {
    return NextResponse.json({ error: "Tên kho này đã tồn tại" }, { status: 409 });
  }

  if (code) {
    const existingCode = await prisma.warehouse.findUnique({ where: { code } });
    if (existingCode) {
      return NextResponse.json({ error: "Mã kho này đã tồn tại" }, { status: 409 });
    }
  }

  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.warehouse.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.warehouse.create({
      data: {
        code: code || null,
        name,
        address: address || null,
        managerName: managerName || null,
        managerPhone: managerPhone || null,
        isDefault: isDefault ?? false,
        isActive: isActive ?? true,
        notes: notes || null,
        sortOrder: sortOrder ?? 0,
      },
    });
  });

  await audit(s.userId, "WAREHOUSE_CREATE", "Warehouse", created.id, { name, code });

  return NextResponse.json(created, { status: 201 });
});
