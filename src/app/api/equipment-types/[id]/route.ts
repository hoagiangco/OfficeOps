import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchTypeSchema = z
  .object({
    name: z.string().trim().min(1, "Vui lòng nhập tên loại thiết bị"),
    description: z.string().trim().nullable(),
    sortOrder: z.coerce.number().int(),
  })
  .partial();

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await prisma.equipmentType.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Loại thiết bị không tồn tại" }, { status: 404 });
  }

  const r = await parseBody(req, patchTypeSchema);
  if (r.error) return r.error;

  const { name, description, sortOrder } = r.data;

  if (name && name !== current.name) {
    const dup = await prisma.equipmentType.findUnique({ where: { name } });
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: "Tên loại thiết bị đã tồn tại" }, { status: 409 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.equipmentType.update({
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
        where: { type: current.name },
        data: { type: name },
      });
    }

    return res;
  });

  await audit(s.userId, "EQUIPMENT_TYPE_UPDATE", "EquipmentType", id, {
    oldName: current.name,
    newName: updated.name,
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await prisma.equipmentType.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Loại thiết bị không tồn tại" }, { status: 404 });
  }

  const equipCount = await prisma.equipment.count({
    where: { type: current.name },
  });

  if (equipCount > 0) {
    return NextResponse.json(
      {
        error: `Loại thiết bị "${current.name}" đang được sử dụng bởi ${equipCount} thiết bị. Vui lòng chuyển các thiết bị sang loại khác trước khi xóa.`,
      },
      { status: 409 }
    );
  }

  await prisma.equipmentType.delete({ where: { id } });

  await audit(s.userId, "EQUIPMENT_TYPE_DELETE", "EquipmentType", id, { name: current.name });

  return NextResponse.json({ ok: true });
});
