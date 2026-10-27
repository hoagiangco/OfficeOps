import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const partSchema = z.object({
  partCode: z.string().trim().min(1, "Mã vật tư không được trống"),
  name: z.string().trim().min(1, "Tên vật tư không được trống"),
  categoryId: z.string().trim().optional().nullable(),
  category: z.string().trim().optional().nullable(),
  barcode: z.string().trim().optional().nullable(),
  unit: z.string().trim().default("cái"),
  compatibleModels: z.array(z.string().trim()).optional().default([]),
  minThreshold: z.coerce.number().int().nonnegative().default(5),
  costPrice: z.coerce.number().nonnegative().optional().nullable(),
  salePrice: z.coerce.number().nonnegative().optional().nullable(),
  specs: z.any().optional(),
  imageUrl: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

export const GET = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;
  const categoryId = sp.get("categoryId");
  const category = sp.get("category");
  const model = sp.get("model"); // Lọc theo model máy tương thích
  const lowStockOnly = sp.get("lowStock") === "true";

  const where: any = {
    ...(categoryId
      ? { categoryId }
      : category
      ? {
          OR: [
            { categoryId: category },
            { category },
            { partCategory: { name: category } },
          ],
        }
      : {}),
    ...(model
      ? {
          compatibleModels: {
            hasSome: [model, model.toLowerCase(), model.toUpperCase()],
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { partCode: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { barcode: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
            { partCategory: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [parts, total] = await Promise.all([
    prisma.part.findMany({
      where,
      include: {
        partCategory: true,
        batches: {
          orderBy: { receivedDate: "asc" },
        },
        _count: {
          select: { replacements: true, issueItems: true },
        },
      },
      orderBy: { partCode: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.part.count({ where }),
  ]);

  const items = parts.map((p) => {
    const currentQuantity = p.batches.reduce((sum, b) => sum + b.quantity, 0);
    const isLowStock = currentQuantity <= p.minThreshold;
    return {
      ...p,
      currentQuantity,
      isLowStock,
    };
  });

  const filteredItems = lowStockOnly ? items.filter((i) => i.isLowStock) : items;

  return NextResponse.json({
    items: filteredItems,
    total: lowStockOnly ? filteredItems.length : total,
    page,
    pageSize,
  });
});

export const POST = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const canManage = await checkUserPermission(s.userId, s.role, "part:manage");

  if (!canManage) {
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }

  const r = await parseBody(req, partSchema);
  if (r.error) return r.error;

  const existing = await prisma.part.findUnique({
    where: { partCode: r.data.partCode },
  });
  if (existing) {
    return NextResponse.json({ error: "Mã vật tư này đã tồn tại" }, { status: 409 });
  }

  // Tự động tìm tên category nếu truyền categoryId hoặc tìm categoryId nếu truyền category name
  let categoryId = r.data.categoryId || null;
  let categoryName = r.data.category || null;

  if (categoryId && !categoryName) {
    const cat = await prisma.partCategory.findUnique({ where: { id: categoryId } });
    if (cat) categoryName = cat.name;
  } else if (!categoryId && categoryName) {
    const cat = await prisma.partCategory.findFirst({ where: { name: categoryName } });
    if (cat) categoryId = cat.id;
  }

  const created = await prisma.part.create({
    data: {
      partCode: r.data.partCode.trim().toUpperCase(),
      name: r.data.name.trim(),
      categoryId: categoryId || null,
      category: categoryName || null,
      barcode: r.data.barcode?.trim() || null,
      unit: r.data.unit.trim(),
      compatibleModels: r.data.compatibleModels,
      minThreshold: r.data.minThreshold,
      costPrice: r.data.costPrice,
      salePrice: r.data.salePrice,
      specs: r.data.specs || null,
      imageUrl: r.data.imageUrl || null,
      notes: r.data.notes || null,
      isActive: r.data.isActive,
    },
    include: {
      partCategory: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "PART_CREATE",
      entity: "Part",
      entityId: created.id,
      meta: { partCode: created.partCode, name: created.name },
    },
  });

  return NextResponse.json(created, { status: 201 });
});

export const PATCH = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const canManage = await checkUserPermission(s.userId, s.role, "part:manage");

  if (!canManage) {
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Thiếu ID vật tư" }, { status: 400 });

  let categoryId = body.categoryId !== undefined ? body.categoryId : undefined;
  let categoryName = body.category !== undefined ? body.category : undefined;

  if (categoryId && !categoryName) {
    const cat = await prisma.partCategory.findUnique({ where: { id: categoryId } });
    if (cat) categoryName = cat.name;
  } else if (!categoryId && categoryName) {
    const cat = await prisma.partCategory.findFirst({ where: { name: categoryName } });
    if (cat) categoryId = cat.id;
  }

  const updated = await prisma.part.update({
    where: { id: String(body.id) },
    data: {
      name: body.name ? String(body.name).trim() : undefined,
      categoryId: categoryId !== undefined ? (categoryId || null) : undefined,
      category: categoryName !== undefined ? categoryName : undefined,
      barcode: body.barcode !== undefined ? (body.barcode?.trim() || null) : undefined,
      unit: body.unit ? String(body.unit).trim() : undefined,
      compatibleModels: Array.isArray(body.compatibleModels) ? body.compatibleModels : undefined,
      minThreshold: body.minThreshold !== undefined ? Number(body.minThreshold) : undefined,
      costPrice: body.costPrice !== undefined ? (body.costPrice ? Number(body.costPrice) : null) : undefined,
      salePrice: body.salePrice !== undefined ? (body.salePrice ? Number(body.salePrice) : null) : undefined,
      specs: body.specs !== undefined ? body.specs : undefined,
      imageUrl: body.imageUrl !== undefined ? body.imageUrl : undefined,
      notes: body.notes !== undefined ? body.notes : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    },
    include: {
      partCategory: true,
    },
  });

  await prisma.auditLog.create({
    data: { userId: s.userId, action: "PART_UPDATE", entity: "Part", entityId: updated.id, meta: { partCode: updated.partCode } },
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (req: Request) => {
  const s = await requirePermission("part:manage");
  if (s instanceof NextResponse) return s;

  const sp = new URL(req.url).searchParams;
  const id = sp.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu ID vật tư" }, { status: 400 });

  // Kiểm tra liên kết trước khi xóa
  const [batchesCount, replacementsCount, issueCount] = await Promise.all([
    prisma.inventoryBatch.count({ where: { partId: id } }),
    prisma.partReplacement.count({ where: { partId: id } }),
    prisma.stockIssueItem.count({ where: { partId: id } }),
  ]);

  if (batchesCount > 0 || replacementsCount > 0 || issueCount > 0) {
    // Nếu đã phát sinh dữ liệu, chuyển sang ngừng kích hoạt
    const deactivated = await prisma.part.update({
      where: { id },
      data: { isActive: false },
    });
    return NextResponse.json({
      message: `Vật tư đã có ${batchesCount} lô kho / ${replacementsCount} lượt thay thế. Đã tự động chuyển sang trạng thái Ngừng kinh doanh thay vì xóa cứng.`,
      part: deactivated,
      deactivated: true,
    });
  }

  const deleted = await prisma.part.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { userId: s.userId, action: "PART_DELETE", entity: "Part", entityId: deleted.id, meta: { partCode: deleted.partCode } },
  });

  return NextResponse.json({ success: true, deletedId: id });
});
