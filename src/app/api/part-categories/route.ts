import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { parseBody, withErrors } from "@/lib/http";

const createCategorySchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().trim().min(1, "Tên danh mục không được trống"),
  description: z.string().trim().optional(),
  color: z.string().trim().optional().default("#2563eb"),
  sortOrder: z.coerce.number().int().default(0),
});

const DEFAULT_CATEGORIES = [
  { code: "CAT-MUC", name: "Mực in & Hộp mực", description: "Hộp mực, ống mực, mực nạp, bình mực thải", color: "#2563eb", sortOrder: 1 },
  { code: "CAT-TRONG", name: "Cụm trống & Gạt mực", description: "Trống OPC, cụm drum, gạt mực, gạt từ, trục sạc PCR", color: "#0891b2", sortOrder: 2 },
  { code: "CAT-SAY", name: "Cụm sấy & Lô sấy/ép", description: "Cụm sấy (Fuser Unit), rulo sấy, rulo ép, áo lụa sấy, thanh nhiệt", color: "#ea580c", sortOrder: 3 },
  { code: "CAT-BANHXE", name: "Bánh xe kéo giấy & Quả đào", description: "Bánh xe lấy giấy, quả đào cuốn giấy, cụm tách giấy", color: "#16a34a", sortOrder: 4 },
  { code: "CAT-BOMACH", name: "Bo mạch & Cảm biến", description: "Mainboard, bo nguồn, bo cao áp, sensor cảm biến quang, cáp bẹ", color: "#7c3aed", sortOrder: 5 },
  { code: "CAT-KHAC", name: "Vật tư & Linh kiện khác", description: "Bánh răng cơ khí, dây curoa, gương phản xạ, kính quét", color: "#64748b", sortOrder: 6 },
];

export const GET = withErrors(async () => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  let categories = await prisma.partCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: {
        select: { parts: true },
      },
    },
  });

  // Tự động khởi tạo danh mục tiêu chuẩn nếu bảng còn trống
  if (categories.length === 0) {
    for (const def of DEFAULT_CATEGORIES) {
      await prisma.partCategory.upsert({
        where: { name: def.name },
        create: def,
        update: {},
      });
    }

    // Liên kết các vật tư cũ (nếu có category dạng chuỗi)
    const existingParts = await prisma.part.findMany({
      where: { categoryId: null, category: { not: null } },
      select: { id: true, category: true },
    });

    const refreshedCats = await prisma.partCategory.findMany();
    for (const p of existingParts) {
      if (!p.category) continue;
      // Tìm danh mục tương ứng theo tên hoặc chứa tên
      const matched =
        refreshedCats.find((c) => c.name.toLowerCase() === p.category!.toLowerCase()) ||
        refreshedCats.find((c) => c.name.toLowerCase().includes(p.category!.toLowerCase())) ||
        refreshedCats.find((c) => p.category!.toLowerCase().includes(c.name.toLowerCase()));

      if (matched) {
        await prisma.part.update({
          where: { id: p.id },
          data: { categoryId: matched.id, category: matched.name },
        });
      }
    }

    categories = await prisma.partCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { parts: true },
        },
      },
    });
  }

  return NextResponse.json({ categories });
});

export const POST = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const canManage = await checkUserPermission(s.userId, s.role, "part:manage");

  if (!canManage) {
    return NextResponse.json({ error: "Không có quyền quản lý danh mục vật tư" }, { status: 403 });
  }

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

  // Tự động liên kết các vật tư đang lưu chuỗi cùng tên
  await prisma.part.updateMany({
    where: { category: created.name, categoryId: null },
    data: { categoryId: created.id },
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
