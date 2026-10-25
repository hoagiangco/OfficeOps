import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên nhóm thiết bị"),
  description: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const GET = withErrors(async () => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;

  const [groups, equipmentCounts] = await Promise.all([
    prisma.equipmentGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.equipment.groupBy({
      by: ["group"],
      _count: { id: true },
    }),
  ]);

  const countMap = new Map<string, number>();
  for (const item of equipmentCounts) {
    if (item.group) {
      countMap.set(item.group, item._count.id);
    }
  }

  const items = groups.map((g) => ({
    ...g,
    equipmentCount: countMap.get(g.name) ?? 0,
  }));

  return NextResponse.json({ groups: items });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createGroupSchema);
  if (r.error) return r.error;

  const { name, description, sortOrder } = r.data;

  const existing = await prisma.equipmentGroup.findUnique({
    where: { name },
  });
  if (existing) {
    return NextResponse.json({ error: "Nhóm thiết bị này đã tồn tại" }, { status: 409 });
  }

  const created = await prisma.equipmentGroup.create({
    data: {
      name,
      description: description || null,
      sortOrder: sortOrder ?? 0,
    },
  });

  await audit(s.userId, "EQUIPMENT_GROUP_CREATE", "EquipmentGroup", created.id, { name });

  return NextResponse.json(created, { status: 201 });
});
