import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
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
    const s = await getSession();
    if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const canManage = await checkUserPermission(s.userId, s.role, "part:manage");

    if (!canManage) {
      return NextResponse.json({ error: "Không có quyền quản lý danh mục vật tư" }, { status: 403 });
    }

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

    // Đồng bộ lại tên category dạng chuỗi cho các Part đang gắn danh mục này
    if (r.data.name && r.data.name !== existing.name) {
      await prisma.part.updateMany({
        where: { categoryId: id },
        data: { category: r.data.name },
      });
    }

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
    const s = await getSession();
    if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

    const canManage = await checkUserPermission(s.userId, s.role, "part:manage");

    if (!canManage) {
      return NextResponse.json({ error: "Không có quyền quản lý danh mục vật tư" }, { status: 403 });
    }

    const { id } = await context.params;

    const existing = await prisma.partCategory.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy danh mục vật tư" }, { status: 404 });
    }

    const partsCount = await prisma.part.count({
      where: {
        OR: [{ categoryId: id }, { category: existing.name }],
      },
    });

    if (partsCount > 0) {
      return NextResponse.json(
        { error: `Không thể xóa: đang có ${partsCount} vật tư thuộc danh mục này. Hãy đổi danh mục cho các vật tư trước khi xóa!` },
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
