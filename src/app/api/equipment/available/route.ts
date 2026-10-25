import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { withErrors } from "@/lib/http";

export const GET = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "equipment:read"))
    return NextResponse.json({ error: "Không có quyền" }, { status: 403 });

  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  const warehouseId = url.searchParams.get("warehouseId") || "";

  const where: Record<string, unknown> = {
    OR: [{ customerId: null }, { status: { in: ["IN_STOCK", "RECALLED"] } }],
  };

  const andConditions: Record<string, unknown>[] = [];

  if (warehouseId) {
    andConditions.push({ warehouseId });
  }

  if (q.trim()) {
    andConditions.push({
      OR: [
        { serialNumber: { contains: q.trim(), mode: "insensitive" } },
        { model: { contains: q.trim(), mode: "insensitive" } },
        { brand: { contains: q.trim(), mode: "insensitive" } },
        { type: { contains: q.trim(), mode: "insensitive" } },
        { code: { contains: q.trim(), mode: "insensitive" } },
      ],
    });
  }

  if (andConditions.length > 0) {
    where.AND = andConditions;
  }

  const items = await prisma.equipment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      code: true,
      serialNumber: true,
      model: true,
      brand: true,
      type: true,
      group: true,
      relationType: true,
      status: true,
      currentCounter: true,
      baseQuota: true,
      overagePrice: true,
      locationNote: true,
      warehouseId: true,
      warehouse: {
        select: { id: true, name: true, code: true, address: true },
      },
      category: {
        select: { id: true, name: true },
      },
    },
  });

  return NextResponse.json({ items });
});
