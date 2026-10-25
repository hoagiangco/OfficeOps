import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchCategorySchema = z
  .object({
    code: z.string().trim().nullable(),
    name: z.string().trim().min(1, "Vui lòng nhập tên danh mục"),
    description: z.string().trim().nullable(),
    parentId: z.string().trim().nullable(),
    sortOrder: z.coerce.number().int(),
  })
  .partial();

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await prisma.equipmentCategory.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "Danh mục không tồn tại" }, { status: 404 });
  }

  const r = await parseBody(req, patchCategorySchema);
  if (r.error) return r.error;

  const { parentId, code, ...rest } = r.data;

  // Prevent circular hierarchy
  if (parentId !== undefined && parentId !== null) {
    if (parentId === id) {
      return NextResponse.json({ error: "Danh mục không thể nhận chính nó làm danh mục cha" }, { status: 400 });
    }
    let checkId: string | null = parentId;
    while (checkId) {
      const p: { parentId: string | null } | null = await prisma.equipmentCategory.findUnique({
        where: { id: checkId },
        select: { parentId: true },
      });
      if (!p) break;
      if (p.parentId === id) {
        return NextResponse.json({ error: "Không thể chọn danh mục con làm danh mục cha (lỗi vòng lặp)" }, { status: 400 });
      }
      checkId = p.parentId;
    }
  }

  if (code) {
    const dup = await prisma.equipmentCategory.findFirst({
      where: { code, id: { not: id } },
    });
    if (dup) {
      return NextResponse.json({ error: "Mã danh mục đã được sử dụng" }, { status: 409 });
    }
  }

  const updated = await prisma.equipmentCategory.update({
    where: { id },
    data: {
      ...rest,
      ...(code !== undefined ? { code: code || null } : {}),
      ...(parentId !== undefined ? { parentId: parentId || null } : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "EQUIPMENT_CATEGORY_UPDATE",
      entity: "EquipmentCategory",
      entityId: id,
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;

  const [childCount, equipCount] = await Promise.all([
    prisma.equipmentCategory.count({ where: { parentId: id } }),
    prisma.equipment.count({ where: { categoryId: id } }),
  ]);

  if (childCount > 0) {
    return NextResponse.json(
      { error: `Danh mục này đang có ${childCount} danh mục con. Vui lòng xóa hoặc chuyển danh mục con trước.` },
      { status: 409 }
    );
  }

  if (equipCount > 0) {
    return NextResponse.json(
      { error: `Danh mục này đang gắn với ${equipCount} thiết bị. Vui lòng chuyển thiết bị sang danh mục khác trước khi xóa.` },
      { status: 409 }
    );
  }

  await prisma.equipmentCategory.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "EQUIPMENT_CATEGORY_DELETE",
      entity: "EquipmentCategory",
      entityId: id,
    },
  });

  return NextResponse.json({ ok: true });
});
