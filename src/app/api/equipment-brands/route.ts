import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";
import { DEFAULT_EQUIPMENT_BRANDS } from "@/lib/labels";

const createBrandSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên hãng sản xuất"),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const GET = withErrors(async () => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;

  // Auto-seed default brands if table is brand new and completely empty
  const count = await prisma.equipmentBrand.count();
  if (count === 0) {
    await prisma.equipmentBrand.createMany({
      data: DEFAULT_EQUIPMENT_BRANDS.map((name, idx) => ({
        name,
        sortOrder: (idx + 1) * 10,
      })),
      skipDuplicates: true,
    }).catch(() => {});
  }

  const [brands, equipmentCounts] = await Promise.all([
    prisma.equipmentBrand.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.equipment.groupBy({
      by: ["brand"],
      _count: { id: true },
    }),
  ]);

  const countMap = new Map<string, number>();
  for (const item of equipmentCounts) {
    if (item.brand) {
      countMap.set(item.brand, item._count.id);
    }
  }

  const items = brands.map((b) => ({
    ...b,
    equipmentCount: countMap.get(b.name) ?? 0,
  }));

  return NextResponse.json({ brands: items });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createBrandSchema);
  if (r.error) return r.error;

  const { name, description, sortOrder } = r.data;

  const existing = await prisma.equipmentBrand.findUnique({
    where: { name },
  });
  if (existing) {
    return NextResponse.json({ error: "Hãng sản xuất này đã tồn tại" }, { status: 409 });
  }

  const created = await prisma.equipmentBrand.create({
    data: {
      name,
      description: description || null,
      sortOrder: sortOrder ?? 0,
    },
  });

  await audit(s.userId, "EQUIPMENT_BRAND_CREATE", "EquipmentBrand", created.id, { name });

  return NextResponse.json(created, { status: 201 });
});
