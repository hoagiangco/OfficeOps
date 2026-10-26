import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const createCategorySchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().trim().min(1, "Tên danh mục không được trống"),
  description: z.string().trim().optional(),
  color: z.string().trim().optional().default("#2563eb"),
  sortOrder: z.coerce.number().int().default(0),
});

export const GET = withErrors(async () => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const categories = await prisma.partCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { parts: true },
      },
    },
  });

  return NextResponse.json({ categories });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("stock:manage");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createCategorySchema);
  if (r.error) return r.error;

  const code = r.data.code ? r.data.code.toUpperCase() : `CAT-${Date.now().toString().slice(-6)}`;

  const existing = await prisma.partCategory.findFirst({
    where: {
      OR: [
        { name: r.data.name },
        ...(r.data.code ? [{ code }] : []),
      ],
    },
  });

  if (existing) {
    return NextResponse.json(
      { error: "Tên hoặc mã danh mục vật tư đã tồn tại" },
      { status: 409 }
    );
  }

  const created = await prisma.partCategory.create({
    data: {
      code,
      name: r.data.name,
      description: r.data.description || null,
      color: r.data.color || "#2563eb",
      sortOrder: r.data.sortOrder,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "PART_CATEGORY_CREATE",
      entity: "PartCategory",
      entityId: created.id,
      meta: { code: created.code, name: created.name },
    },
  });

  return NextResponse.json(created, { status: 201 });
});
