import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchWarehouseSchema = z
  .object({
    code: z.string().trim().nullable(),
    name: z.string().trim().min(1, "Vui lòng nhập tên kho"),
    address: z.string().trim().nullable(),
    managerName: z.string().trim().nullable(),
    managerPhone: z.string().trim().nullable(),
    isDefault: z.boolean(),
    isActive: z.boolean(),
    notes: z.string().trim().nullable(),
    sortOrder: z.coerce.number().int(),
  })
  .partial();

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await prisma.warehouse.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Kho không tồn tại" }, { status: 404 });
  }

  const r = await parseBody(req, patchWarehouseSchema);
  if (r.error) return r.error;

  const { code, name, address, managerName, managerPhone, isDefault, isActive, notes, sortOrder } = r.data;

  if (name && name !== current.name) {
    const dupName = await prisma.warehouse.findUnique({ where: { name } });
    if (dupName && dupName.id !== id) {
      return NextResponse.json({ error: "Tên kho này đã tồn tại" }, { status: 409 });
    }
  }

  if (code && code !== current.code) {
    const dupCode = await prisma.warehouse.findUnique({ where: { code } });
    if (dupCode && dupCode.id !== id) {
      return NextResponse.json({ error: "Mã kho này đã tồn tại" }, { status: 409 });
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.warehouse.updateMany({
        where: { id: { not: id }, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.warehouse.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(code !== undefined ? { code: code || null } : {}),
        ...(address !== undefined ? { address: address || null } : {}),
        ...(managerName !== undefined ? { managerName: managerName || null } : {}),
        ...(managerPhone !== undefined ? { managerPhone: managerPhone || null } : {}),
        ...(isDefault !== undefined ? { isDefault } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(notes !== undefined ? { notes: notes || null } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
    });
  });

  await audit(s.userId, "WAREHOUSE_UPDATE", "Warehouse", id, {
    oldName: current.name,
    newName: updated.name,
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await prisma.warehouse.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Kho không tồn tại" }, { status: 404 });
  }

  const equipCount = await prisma.equipment.count({
    where: { warehouseId: id },
  });

  if (equipCount > 0) {
    return NextResponse.json(
      {
        error: `Kho "${current.name}" đang lưu trữ ${equipCount} thiết bị. Vui lòng chuyển các thiết bị sang kho khác trước khi xóa.`,
      },
      { status: 409 }
    );
  }

  await prisma.warehouse.delete({ where: { id } });

  await audit(s.userId, "WAREHOUSE_DELETE", "Warehouse", id, { name: current.name });

  return NextResponse.json({ ok: true });
});
