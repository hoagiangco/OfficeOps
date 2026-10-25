import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError } from "@/lib/http";
import type { Role } from "@prisma/client";

const ALLOWED_ROLES: Role[] = ["SUPER_ADMIN", "ADMIN", "DISPATCHER"];

export const GET = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session || !ALLOWED_ROLES.includes(session.role as Role)) {
    throw new HttpError(403, "Bạn không có quyền xem báo cáo Nhập - Xuất - Tồn kho");
  }

  const { searchParams } = new URL(req.url);
  const now = new Date();
  
  // Mặc định từ ngày 1 đầu tháng hiện tại đến cuối ngày hôm nay
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const category = searchParams.get("category");
  const search = searchParams.get("q")?.trim().toLowerCase();

  const fromDate = fromParam ? new Date(fromParam) : new Date(now.getFullYear(), now.getMonth(), 1);
  const toDate = toParam ? new Date(toParam) : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  // Lấy danh sách linh kiện cùng các lô và biến động kho
  const parts = await prisma.part.findMany({
    where: {
      isActive: true,
      ...(category ? { category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { partCode: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      batches: {
        include: {
          movements: true,
        },
        orderBy: { receivedDate: "desc" },
      },
    },
    orderBy: { partCode: "asc" },
  });

  let totalItemsCount = 0;
  let totalInQuantity = 0;
  let totalOutQuantity = 0;
  let totalClosingValue = 0;

  const reportItems = parts.map((part) => {
    // Thu thập tất cả movements của tất cả lô thuộc part
    const allMovements = part.batches.flatMap((b) =>
      b.movements.map((m) => ({
        ...m,
        costPrice: Number(b.costPrice),
      }))
    );

    // 1. Tồn đầu kỳ: biến động trước ngày fromDate
    const beforeMovements = allMovements.filter((m) => new Date(m.createdAt) < fromDate);
    const inBefore = beforeMovements
      .filter((m) => m.type === "IN" || m.type === "RETURN")
      .reduce((sum, m) => sum + m.quantity, 0);
    const outBefore = beforeMovements
      .filter((m) => m.type === "OUT" || m.type === "ADJUST")
      .reduce((sum, m) => sum + m.quantity, 0);
    const openingStock = Math.max(0, inBefore - outBefore);

    // 2. Biến động trong kỳ [fromDate, toDate]
    const periodMovements = allMovements.filter((m) => {
      const d = new Date(m.createdAt);
      return d >= fromDate && d <= toDate;
    });

    const inPeriod = periodMovements
      .filter((m) => m.type === "IN" || m.type === "RETURN")
      .reduce((sum, m) => sum + m.quantity, 0);

    const outPeriod = periodMovements
      .filter((m) => m.type === "OUT" || m.type === "ADJUST")
      .reduce((sum, m) => sum + m.quantity, 0);

    // 3. Tồn cuối kỳ
    // Nếu có ghi nhận movement đầy đủ: closingStock = openingStock + inPeriod - outPeriod
    // Nếu allMovements rỗng (chưa sinh movement): lấy trực tiếp tổng quantity các lô
    let closingStock = openingStock + inPeriod - outPeriod;
    const currentBatchesTotal = part.batches.reduce((sum, b) => sum + b.quantity, 0);

    if (allMovements.length === 0) {
      closingStock = currentBatchesTotal;
    }

    // Đơn giá vốn: ưu tiên lô mới nhất có giá > 0, fallback sang salePrice
    const latestBatchWithCost = part.batches.find((b) => Number(b.costPrice) > 0);
    const costPrice = latestBatchWithCost
      ? Number(latestBatchWithCost.costPrice)
      : Number(part.salePrice || 0);

    const totalValue = closingStock * costPrice;

    totalItemsCount += 1;
    totalInQuantity += inPeriod;
    totalOutQuantity += outPeriod;
    totalClosingValue += totalValue;

    return {
      partId: part.id,
      partCode: part.partCode,
      name: part.name,
      category: part.category || "Chung",
      unit: part.unit,
      minThreshold: part.minThreshold,
      openingStock,
      inPeriod,
      outPeriod,
      closingStock,
      costPrice,
      totalValue,
      currentBatchStock: currentBatchesTotal,
    };
  });

  return NextResponse.json({
    period: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    },
    summary: {
      totalItems: totalItemsCount,
      totalInQuantity,
      totalOutQuantity,
      totalClosingValue,
    },
    items: reportItems,
  });
});
