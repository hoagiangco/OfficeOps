import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Vui lòng nhập tên nhóm thiết bị"),
    description: z.string().trim().nullable(),
    sortOrder: z.coerce.number().int(),
  })
  .partial();

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:category-manage");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await prisma.equipmentGroup.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Nhóm thiết bị không tồn tại" }, { status: 404 });
  }

  const r = await parseBody(req, patchGroupSchema);
  if (r.error) return r.error;

  const { name, description, sortOrder } = r.data;

  if (name && name !== current.name) {
    const dup = await prisma.equipmentGroup.findUnique({ where: { name } });
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "Tên nhóm thiết bị đã tồn tại" }, { status: 409 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.equipmentGroup.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description: description || null } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
    });

    // If name was updated, update existing equipment records to match new name
    if (name && name !== current.name) {
      await tx.equipment.updateMany({
        where: { group: current.name },
        data: { group: name },
      });
    }

    return res;
  });

  await audit(s.userId, "EQUIPMENT_GROUP_UPDATE", "EquipmentGroup", id, {
    oldName: current.name,
    newName: updated.name,
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:category-manage");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await prisma.equipmentGroup.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Nhóm thiết bị không tồn tại" }, { status: 404 });
  }

  const equipCount = await prisma.equipment.count({
    where: { group: current.name },
  });

  if (equipCount > 0) {
    return NextResponse.json(
      {
        error: `Nhóm thiết bị "${current.name}" đang được sử dụng bởi ${equipCount} thiết bị. Vui lòng chuyển các thiết bị sang nhóm khác trước khi xóa.`,
      },
      { status: 409 }
    );
  }

  await prisma.equipmentGroup.delete({ where: { id } });

  await audit(s.userId, "EQUIPMENT_GROUP_DELETE", "EquipmentGroup", id, { name: current.name });

  return NextResponse.json({ ok: true });
});
