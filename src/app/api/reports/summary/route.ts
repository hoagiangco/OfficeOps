import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { withErrors } from "@/lib/http";

export const GET = withErrors(async () => {
  const session = await requirePermission("report:finance-view");
  if (session instanceof NextResponse) return session;

  const [
    invoices,
    contracts,
    equipment,
    tickets,
    batches,
    parts,
    technicians,
    partReplacements,
  ] = await Promise.all([
    prisma.invoice.findMany({
      include: {
        customer: { select: { name: true } },
        contract: { select: { code: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contract.findMany({
      where: { isActive: true },
    }),
    prisma.equipment.findMany({
      include: {
        customer: { select: { name: true } },
        _count: { select: { tickets: true, partHistory: true } },
      },
    }),
    prisma.ticket.findMany({
      include: {
        assignee: { select: { id: true, name: true } },
      },
    }),
    prisma.inventoryBatch.findMany(),
    prisma.part.findMany({
      include: { batches: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ["FIELD_TECH", "DISPATCHER"] } },
      select: {
        id: true,
        name: true,
        region: true,
        assignedTickets: {
          select: { id: true, status: true, slaDueAt: true, resolvedAt: true },
        },
      },
    }),
    prisma.partReplacement.findMany({
      include: {
        part: { select: { id: true, partCode: true, name: true, unit: true } },
      },
    }),
  ]);

  const paidRevenue = invoices
    .filter((i) => i.status === "PAID")
    .reduce((sum, i) => sum + Number(i.total), 0);
  const receivableRevenue = invoices
    .filter((i) => ["SENT", "OVERDUE"].includes(i.status))
    .reduce((sum, i) => sum + Number(i.total), 0);
  const draftRevenue = invoices
    .filter((i) => i.status === "DRAFT")
    .reduce((sum, i) => sum + Number(i.total), 0);
  const monthlyContractRecurring = contracts.reduce(
    (sum, c) => sum + Number(c.basePrice),
    0
  );

  const inventoryValuation = batches.reduce(
    (sum, b) => sum + b.quantity * Number(b.costPrice),
    0
  );
  const lowStockCount = parts.filter((p) => {
    const qty = p.batches.reduce((s, b) => s + b.quantity, 0);
    return qty < p.minThreshold;
  }).length;

  const equipmentByStatus: Record<string, number> = {};
  for (const eq of equipment) {
    equipmentByStatus[eq.status] = (equipmentByStatus[eq.status] || 0) + 1;
  }

  const attentionEquipment = [...equipment]
    .sort((a, b) => a.healthScore - b.healthScore || b._count.tickets - a._count.tickets)
    .slice(0, 6)
    .map((e) => ({
      id: e.id,
      serialNumber: e.serialNumber,
      model: e.model,
      status: e.status,
      healthScore: e.healthScore,
      currentCounter: e.currentCounter,
      customerName: e.customer?.name || "Trong kho",
      ticketCount: e._count.tickets,
      partReplacedCount: e._count.partHistory,
    }));

  const totalTickets = tickets.length;
  const completedTickets = tickets.filter((t) => t.status === "COMPLETED");
  const onTimeTickets = completedTickets.filter(
    (t) => !t.slaDueAt || !t.resolvedAt || new Date(t.resolvedAt) <= new Date(t.slaDueAt)
  );
  const slaRate =
    completedTickets.length > 0
      ? Math.round((onTimeTickets.length / completedTickets.length) * 100)
      : 100;

  const techPerformance = technicians.map((tech) => {
    const total = tech.assignedTickets.length;
    const completed = tech.assignedTickets.filter((t) => t.status === "COMPLETED").length;
    const inProgress = tech.assignedTickets.filter((t) =>
      ["ASSIGNED", "IN_PROGRESS", "WAITING_PARTS", "WAITING_CUSTOMER"].includes(t.status)
    ).length;
    return {
      id: tech.id,
      name: tech.name,
      region: tech.region || "Toàn vùng",
      total,
      completed,
      inProgress,
    };
  });

  // ========== DỮ LIỆU BIỂU ĐỒ (CHARTS DATA) ==========

  // 1. Biểu đồ doanh thu 6 tháng gần nhất
  const now = new Date();
  const monthlyRevenueChart: Array<{ month: string; paid: number; total: number }> = [];

  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const monthKey = `T${d.getMonth() + 1}/${d.getFullYear()}`;
    const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);

    const invoicesInMonth = invoices.filter((inv) => {
      const invDate = new Date(inv.createdAt);
      return invDate >= startOfMonth && invDate <= endOfMonth;
    });

    const paidInMonth = invoicesInMonth
      .filter((i) => i.status === "PAID")
      .reduce((sum, i) => sum + Number(i.total), 0);

    const totalInMonth = invoicesInMonth
      .filter((i) => i.status !== "CANCELLED")
      .reduce((sum, i) => sum + Number(i.total), 0);

    monthlyRevenueChart.push({
      month: monthKey,
      paid: paidInMonth,
      total: totalInMonth,
    });
  }

  // 2. Biểu đồ phân bổ Ticket theo trạng thái
  const ticketStatusMap: Record<string, { label: string; count: number; color: string }> = {
    PENDING: { label: "Chờ tiếp nhận", count: 0, color: "#f59e0b" },
    ASSIGNED: { label: "Đã phân công", count: 0, color: "#3b82f6" },
    IN_PROGRESS: { label: "Đang xử lý", count: 0, color: "#8b5cf6" },
    WAITING_PARTS: { label: "Chờ linh kiện", count: 0, color: "#ec4899" },
    COMPLETED: { label: "Hoàn tất", count: 0, color: "#10b981" },
    CANCELLED: { label: "Đã hủy", count: 0, color: "#64748b" },
  };

  tickets.forEach((t) => {
    if (ticketStatusMap[t.status]) {
      ticketStatusMap[t.status].count += 1;
    }
  });

  const ticketStatusChart = Object.entries(ticketStatusMap).map(([status, item]) => ({
    status,
    name: item.label,
    value: item.count,
    color: item.color,
  }));

  // 3. Biểu đồ Top 5 Linh kiện tiêu thụ nhiều nhất
  const partConsumptionMap: Record<string, { name: string; partCode: string; count: number; unit: string }> = {};

  partReplacements.forEach((pr) => {
    const pId = pr.partId;
    if (!partConsumptionMap[pId]) {
      partConsumptionMap[pId] = {
        name: pr.part.name,
        partCode: pr.part.partCode,
        count: 0,
        unit: pr.part.unit || "cái",
      };
    }
    partConsumptionMap[pId].count += pr.quantity;
  });

  const topPartsConsumed = Object.values(partConsumptionMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return NextResponse.json({
    finance: {
      paidRevenue,
      receivableRevenue,
      draftRevenue,
      monthlyContractRecurring,
      totalInvoices: invoices.length,
    },
    inventory: {
      inventoryValuation,
      lowStockCount,
      totalParts: parts.length,
      totalBatches: batches.length,
    },
    equipment: {
      total: equipment.length,
      byStatus: equipmentByStatus,
      attentionEquipment,
    },
    tickets: {
      total: totalTickets,
      completed: completedTickets.length,
      open: tickets.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status)).length,
      slaRate,
      techPerformance,
    },
    charts: {
      monthlyRevenue: monthlyRevenueChart,
      ticketStatus: ticketStatusChart,
      topParts: topPartsConsumed,
    },
  });
});
