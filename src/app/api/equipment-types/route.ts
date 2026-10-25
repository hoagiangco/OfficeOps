import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const createTypeSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên loại thiết bị"),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const GET = withErrors(async () => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;

  const [types, equipmentCounts] = await Promise.all([
    prisma.equipmentType.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.equipment.groupBy({
      by: ["type"],
      _count: { id: true },
    }),
  ]);

  const countMap = new Map<string, number>();
  for (const item of equipmentCounts) {
    if (item.type) {
      countMap.set(item.type, item._count.id);
    }
  }

  const items = types.map((t) => ({
    ...t,
    equipmentCount: countMap.get(t.name) ?? 0,
  }));

  return NextResponse.json({ types: items });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createTypeSchema);
  if (r.error) return r.error;

  const { name, description, sortOrder } = r.data;

  const existing = await prisma.equipmentType.findUnique({
    where: { name },
  });
  if (existing) {
    return NextResponse.json({ error: "Loại thiết bị này đã tồn tại" }, { status: 409 });
  }

  const created = await prisma.equipmentType.create({
    data: {
      name,
      description: description || null,
      sortOrder: sortOrder ?? 0,
    },
  });

  await audit(s.userId, "EQUIPMENT_TYPE_CREATE", "EquipmentType", created.id, { name });

  return NextResponse.json(created, { status: 201 });
});
