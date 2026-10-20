import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const partSchema = z.object({
  partCode: z.string().trim().min(1, "Mã linh kiện không được trống"),
  name: z.string().trim().min(1, "Tên linh kiện không được trống"),
  category: z.string().trim().optional(),
  unit: z.string().trim().default("cái"),
  compatibleModels: z.array(z.string().trim()).optional().default([]),
  minThreshold: z.coerce.number().int().nonnegative().default(5),
  salePrice: z.coerce.number().nonnegative().optional(),
  isActive: z.boolean().optional().default(true),
});

export const GET = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;
  const category = sp.get("category");

  const where = {
    ...(category ? { category } : {}),
    ...(q
      ? {
          OR: [
            { partCode: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { category: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [parts, total] = await Promise.all([
    prisma.part.findMany({
      where,
      include: {
        batches: {
          orderBy: { receivedDate: "asc" },
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
    return {
      ...p,
      currentQuantity,
      isLowStock: currentQuantity <= p.minThreshold,
    };
  });

  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("stock:manage");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, partSchema);
  if (r.error) return r.error;

  const created = await prisma.part.create({
    data: {
      partCode: r.data.partCode,
      name: r.data.name,
      category: r.data.category || null,
      unit: r.data.unit,
      compatibleModels: r.data.compatibleModels,
      minThreshold: r.data.minThreshold,
      salePrice: r.data.salePrice,
      isActive: r.data.isActive,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "PART_CREATE",
      entity: "Part",
      entityId: created.id,
      meta: { partCode: created.partCode },
    },
  });

  return NextResponse.json(created, { status: 201 });
});

export const PATCH = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s || !can(s.role, "stock:manage")) {
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: "Thiếu ID linh kiện" }, { status: 400 });

  const updated = await prisma.part.update({
    where: { id: String(body.id) },
    data: {
      name: body.name,
      category: body.category || null,
      unit: body.unit,
      compatibleModels: Array.isArray(body.compatibleModels) ? body.compatibleModels : undefined,
      minThreshold: body.minThreshold !== undefined ? Number(body.minThreshold) : undefined,
      salePrice: body.salePrice !== undefined ? (body.salePrice ? Number(body.salePrice) : null) : undefined,
      isActive: body.isActive,
    },
  });

  await prisma.auditLog.create({
    data: { userId: s.userId, action: "PART_UPDATE", entity: "Part", entityId: updated.id },
  });

  return NextResponse.json(updated);
});
