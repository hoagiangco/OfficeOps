import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors, HttpError } from "@/lib/http";

const createScheduleSchema = z.object({
  equipmentId: z.string().min(1, "Vui lòng chọn thiết bị"),
  contractId: z.string().optional().nullable(),
  intervalDays: z.number().int().min(7, "Chu kỳ tối thiểu 7 ngày").max(365),
  nextDueDate: z.string().min(1, "Vui lòng chọn ngày bảo trì tiếp theo"),
  isActive: z.boolean().default(true),
});

const generateSchema = z.object({
  action: z.literal("GENERATE_DUE"),
  scheduleId: z.string().optional(),
});

const patchScheduleSchema = z.object({
  id: z.string().min(1),
  intervalDays: z.number().int().min(7).max(365).optional(),
  nextDueDate: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const GET = withErrors(async () => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const schedules = await prisma.maintenanceSchedule.findMany({
    include: {
      equipment: {
        include: {
          customer: { select: { id: true, name: true, phone: true, address: true } },
          contract: { select: { id: true, code: true } },
        },
      },
      contract: { select: { id: true, code: true } },
    },
    orderBy: { nextDueDate: "asc" },
  });

  const canViewPhone = await checkUserPermission(session.userId, session.role, "customer:view-phone");
  const items = canViewPhone
    ? schedules
    : schedules.map((s) => ({
        ...s,
        equipment: {
          ...s.equipment,
          customer: s.equipment.customer ? maskCustomerPhones(s.equipment.customer, false) : s.equipment.customer,
        },
      }));

  return NextResponse.json(items);
});

export const POST = withErrors(async (req: Request) => {
  const raw = await req.clone().json().catch(() => ({}));

  if (raw && raw.action === "GENERATE_DUE") {
    const session = await requirePermission("ticket:create");
    if (session instanceof NextResponse) return session;
    const parsed = await parseBody(req, generateSchema);
    if (parsed.error) return parsed.error;
    const data = parsed.data;

    const horizon = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const dueSchedules = await prisma.maintenanceSchedule.findMany({
      where: {
        isActive: true,
        ...(data.scheduleId ? { id: data.scheduleId } : { nextDueDate: { lte: horizon } }),
      },
      include: {
        equipment: true,
      },
    });

    if (dueSchedules.length === 0) {
      return NextResponse.json({
        generatedCount: 0,
        message: "Không có lịch bảo trì nào đến hạn trong 7 ngày tới",
      });
    }

    const year = new Date().getFullYear();
    let countThisYear = await prisma.ticket.count({
      where: { code: { startsWith: `TK-${year}-` } },
    });

    const createdTickets = [];

    for (const sched of dueSchedules) {
      if (!sched.equipment.customerId) continue;

      countThisYear += 1;
      const code = `TK-${year}-${String(countThisYear).padStart(4, "0")}`;
      const now = new Date();
      const nextDue = new Date(now.getTime() + sched.intervalDays * 24 * 3600 * 1000);

      const ticket = await prisma.$transaction(async (tx) => {
        const t = await tx.ticket.create({
          data: {
            code,
            customerId: sched.equipment.customerId!,
            equipmentId: sched.equipmentId,
            creatorId: session.userId,
            type: "MAINTENANCE",
            status: "PENDING",
            priority: "NORMAL",
            source: "SCHEDULED",
            description: `Bảo dưỡng định kỳ chu kỳ ${sched.intervalDays} ngày cho máy ${sched.equipment.model} (${sched.equipment.serialNumber})`,
            slaDueAt: new Date(Date.now() + 24 * 3600 * 1000),
          },
        });

        await tx.ticketLog.create({
          data: {
            ticketId: t.id,
            userId: session.userId,
            fromStatus: null,
            toStatus: "PENDING",
            note: `Tự động sinh từ lịch bảo dưỡng định kỳ (${sched.intervalDays} ngày/lần)`,
          },
        });

        await tx.maintenanceSchedule.update({
          where: { id: sched.id },
          data: {
            lastRunAt: now,
            nextDueDate: nextDue,
          },
        });

        return t;
      });

      createdTickets.push(ticket);
    }

    await audit(session.userId, "MAINTENANCE_GENERATE_TICKETS", "MaintenanceSchedule", undefined, {
      generatedCount: createdTickets.length,
      codes: createdTickets.map((t) => t.code),
    });

    return NextResponse.json({
      generatedCount: createdTickets.length,
      tickets: createdTickets,
    });
  }

  const session = await requirePermission("maintenance:plan-manage");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, createScheduleSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const eq = await prisma.equipment.findUnique({ where: { id: data.equipmentId } });
  if (!eq) throw new HttpError(404, "Không tìm thấy thiết bị");

  const created = await prisma.maintenanceSchedule.create({
    data: {
      equipmentId: data.equipmentId,
      contractId: data.contractId || eq.contractId || null,
      intervalDays: data.intervalDays,
      nextDueDate: new Date(data.nextDueDate),
      isActive: data.isActive,
    },
    include: {
      equipment: {
        include: { customer: { select: { id: true, name: true } } },
      },
      contract: { select: { id: true, code: true } },
    },
  });

  await audit(session.userId, "MAINTENANCE_SCHEDULE_CREATE", "MaintenanceSchedule", created.id, {
    equipmentId: created.equipmentId,
    intervalDays: created.intervalDays,
  });

  return NextResponse.json(created, { status: 201 });
});

export const PATCH = withErrors(async (req: Request) => {
  const session = await requirePermission("maintenance:plan-manage");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, patchScheduleSchema);
  if (parsed.error) return parsed.error;
  const { id, intervalDays, nextDueDate, isActive } = parsed.data;

  const updated = await prisma.maintenanceSchedule.update({
    where: { id },
    data: {
      ...(intervalDays !== undefined ? { intervalDays } : {}),
      ...(nextDueDate ? { nextDueDate: new Date(nextDueDate) } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
    include: {
      equipment: {
        include: { customer: { select: { id: true, name: true } } },
      },
      contract: { select: { id: true, code: true } },
    },
  });

  await audit(session.userId, "MAINTENANCE_SCHEDULE_UPDATE", "MaintenanceSchedule", id, {
    intervalDays: updated.intervalDays,
    isActive: updated.isActive,
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (req: Request) => {
  const session = await requirePermission("maintenance:plan-manage");
  if (session instanceof NextResponse) return session;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "Thiếu mã lịch bảo trì cần xóa");

  await prisma.maintenanceSchedule.delete({ where: { id } });
  await audit(session.userId, "MAINTENANCE_SCHEDULE_DELETE", "MaintenanceSchedule", id);

  return NextResponse.json({ ok: true });
});
