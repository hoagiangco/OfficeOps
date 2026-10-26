import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const updateCategorySchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().trim().min(1, "Tên danh mục không được trống").optional(),
  description: z.string().trim().optional().nullable(),
  color: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const PATCH = withErrors(
  async (req: Request, context: { params: Promise<{ id: string }> }) => {
    const s = await requirePermission("stock:manage");
    if (s instanceof NextResponse) return s;

    const { id } = await context.params;
    const r = await parseBody(req, updateCategorySchema);
    if (r.error) return r.error;

    const existing = await prisma.partCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy danh mục vật tư" }, { status: 404 });
    }

    if (r.data.name && r.data.name !== existing.name) {
      const duplicate = await prisma.partCategory.findFirst({
        where: { name: r.data.name, id: { not: id } },
      });
      if (duplicate) {
        return NextResponse.json({ error: "Tên danh mục này đã được sử dụng" }, { status: 409 });
      }
    }

    const updated = await prisma.partCategory.update({
      where: { id },
      data: {
        code: r.data.code ? r.data.code.toUpperCase() : undefined,
        name: r.data.name,
        description: r.data.description,
        color: r.data.color,
        sortOrder: r.data.sortOrder,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: s.userId,
        action: "PART_CATEGORY_UPDATE",
        entity: "PartCategory",
        entityId: updated.id,
        meta: { code: updated.code, name: updated.name },
      },
    });

    return NextResponse.json(updated);
  }
);

export const DELETE = withErrors(
  async (_req: Request, context: { params: Promise<{ id: string }> }) => {
    const s = await requirePermission("stock:manage");
    if (s instanceof NextResponse) return s;

    const { id } = await context.params;

    const partsCount = await prisma.part.count({ where: { categoryId: id } });
    if (partsCount > 0) {
      return NextResponse.json(
        { error: `Không thể xóa: đang có ${partsCount} vật tư thuộc danh mục này. Hãy đổi danh mục cho vật tư trước!` },
        { status: 400 }
      );
    }

    const deleted = await prisma.partCategory.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: s.userId,
        action: "PART_CATEGORY_DELETE",
        entity: "PartCategory",
        entityId: deleted.id,
        meta: { code: deleted.code, name: deleted.name },
      },
    });

    return NextResponse.json({ success: true, deletedId: id });
  }
);
