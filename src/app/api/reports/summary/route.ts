import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { withErrors } from "@/lib/http";

export const GET = withErrors(async () => {
  const session = await requirePermission("finance:view");
  if (session instanceof NextResponse) return session;

  const [
    invoices,
    contracts,
    equipment,
    tickets,
    batches,
    parts,
    technicians,
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
  });
});
