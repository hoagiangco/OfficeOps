import { NextResponse } from "next/server";
import { StockMovementType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { withErrors, parseQuery, pagingSchema } from "@/lib/http";

export const GET = withErrors(async (req: Request) => {
  const session = await requirePermission("stock:read");
  if (session instanceof NextResponse) return session;

  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;

  const typeParam = sp.get("type");
  const partId = sp.get("partId");
  const fromDate = sp.get("from");
  const toDate = sp.get("to");

  const where: Record<string, unknown> = {};

  if (typeParam && Object.values(StockMovementType).includes(typeParam as StockMovementType)) {
    where.type = typeParam as StockMovementType;
  }

  if (partId) {
    where.batch = { partId };
  }

  if (fromDate || toDate) {
    where.createdAt = {
      ...(fromDate ? { gte: new Date(`${fromDate}T00:00:00.000Z`) } : {}),
      ...(toDate ? { lte: new Date(`${toDate}T23:59:59.999Z`) } : {}),
    };
  }

  if (q && q.trim()) {
    const keyword = q.trim();
    where.OR = [
      { refId: { contains: keyword, mode: "insensitive" } },
      { refType: { contains: keyword, mode: "insensitive" } },
      {
        batch: {
          batchCode: { contains: keyword, mode: "insensitive" },
        },
      },
      {
        batch: {
          part: {
            OR: [
              { partCode: { contains: keyword, mode: "insensitive" } },
              { name: { contains: keyword, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }

  const [items, total, stats] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: {
        batch: {
          include: {
            part: {
              select: {
                id: true,
                partCode: true,
                name: true,
                category: true,
                unit: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.groupBy({
      by: ["type"],
      where,
      _sum: { quantity: true },
      _count: true,
    }),
  ]);

  const summary = {
    totalIn: 0,
    totalOut: 0,
    totalReturn: 0,
    totalAdjust: 0,
  };

  for (const s of stats) {
    const qty = s._sum.quantity || 0;
    if (s.type === "IN") summary.totalIn = qty;
    if (s.type === "OUT") summary.totalOut = qty;
    if (s.type === "RETURN") summary.totalReturn = qty;
    if (s.type === "ADJUST") summary.totalAdjust = qty;
  }

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    summary,
  });
});
