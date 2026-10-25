import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError } from "@/lib/http";

interface CronDailyResult {
  timestamp: string;
  maintenanceTicketsCreated: number;
  lowStockAlerts: number;
  expiringContractsAlerts: number;
  slaBreachAlerts: number;
  details: {
    tickets: string[];
    lowStockParts: string[];
    expiringContracts: string[];
    slaBreachedTickets: string[];
  };
}

async function verifyAuth(req: Request) {
  // 1. Kiểm tra Bearer token nếu gọi từ cron bên ngoài
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader && authHeader.startsWith("Bearer ") && cronSecret) {
    const token = authHeader.substring(7).trim();
    if (token === cronSecret) {
      return { isCronService: true, userId: null };
    }
  }

  // 2. Hoặc kiểm tra session của người dùng đăng nhập
  const session = await getSession();
  if (session && ["SUPER_ADMIN", "ADMIN", "DISPATCHER"].includes(session.role)) {
    return { isCronService: false, userId: session.userId };
  }

  throw new HttpError(401, "Không có quyền thực thi tác vụ Cron Job");
}

export const GET = withErrors(async (req: Request) => {
  const auth = await verifyAuth(req);
  const result = await executeDailyCron(auth.userId);
  return NextResponse.json(result);
});

export const POST = withErrors(async (req: Request) => {
  const auth = await verifyAuth(req);
  const result = await executeDailyCron(auth.userId);
  return NextResponse.json(result);
});

async function executeDailyCron(invokedByUserId: string | null): Promise<CronDailyResult> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const year = now.getFullYear();

  // Danh sách người nhận thông báo (Điều phối viên & Giám đốc)
  const dispatchersAndAdmins = await prisma.user.findMany({
    where: {
      role: { in: ["DISPATCHER", "SUPER_ADMIN", "ADMIN"] },
      isActive: true,
    },
    select: { id: true, role: true },
  });

  const dispatcherUserIds = dispatchersAndAdmins.map((u) => u.id);

  // =========================================================================
  // TÁC VỤ 1: QUÉT LỊCH BẢO TRÌ ĐỊNH KỲ (Đến hạn trong vòng 7 ngày tới)
  // =========================================================================
  const horizon = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
  const dueSchedules = await prisma.maintenanceSchedule.findMany({
    where: {
      isActive: true,
      nextDueDate: { lte: horizon },
    },
    include: {
      equipment: {
        include: {
          customer: { select: { id: true, name: true } },
          tickets: {
            where: {
              type: "MAINTENANCE",
              status: { notIn: ["COMPLETED", "CANCELLED"] },
            },
            take: 1,
          },
        },
      },
    },
  });

  let ticketCountThisYear = await prisma.ticket.count({
    where: { code: { startsWith: `TK-${year}-` } },
  });

  const createdTickets: string[] = [];

  for (const sched of dueSchedules) {
    if (!sched.equipment.customerId) continue;

    // Tránh tạo trùng nếu máy này đã có phiếu bảo trì đang mở
    if (sched.equipment.tickets.length > 0) continue;

    ticketCountThisYear += 1;
    const ticketCode = `TK-${year}-${String(ticketCountThisYear).padStart(4, "0")}`;
    const nextDue = new Date(now.getTime() + sched.intervalDays * 24 * 3600 * 1000);

    await prisma.$transaction(async (tx) => {
      // 1. Tạo Phiếu Kỹ Thuật Bảo Trì
      const t = await tx.ticket.create({
        data: {
          code: ticketCode,
          customerId: sched.equipment.customerId!,
          equipmentId: sched.equipmentId,
          creatorId: invokedByUserId,
          type: "MAINTENANCE",
          status: "PENDING",
          priority: "NORMAL",
          source: "SCHEDULED",
          description: `Bảo dưỡng định kỳ ${sched.intervalDays} ngày/lần cho máy ${sched.equipment.model} (SN: ${sched.equipment.serialNumber})`,
          slaDueAt: new Date(now.getTime() + 48 * 3600 * 1000), // Cam kết 48h
        },
      });

      // 2. Ghi TicketLog
      await tx.ticketLog.create({
        data: {
          ticketId: t.id,
          userId: invokedByUserId,
          fromStatus: null,
          toStatus: "PENDING",
          note: `Tự động sinh từ Lịch bảo dưỡng định kỳ (Chu kỳ ${sched.intervalDays} ngày)`,
        },
      });

      // 3. Cập nhật lịch sang chu kỳ tiếp theo
      await tx.maintenanceSchedule.update({
        where: { id: sched.id },
        data: {
          lastRunAt: now,
          nextDueDate: nextDue,
        },
      });

      // 4. Bắn Notification in-app
      if (dispatcherUserIds.length > 0) {
        await tx.notification.createMany({
          data: dispatcherUserIds.map((uid) => ({
            userId: uid,
            channel: "IN_APP",
            title: `🔧 Phiếu bảo trì định kỳ: ${ticketCode}`,
            body: `Đã tự động tạo phiếu bảo dưỡng cho máy ${sched.equipment.model} (${sched.equipment.customer?.name}). Vui lòng phân công KTV.`,
          })),
        });
      }
    });

    createdTickets.push(`${ticketCode} (${sched.equipment.model})`);
  }

  // =========================================================================
  // TÁC VỤ 2: QUÉT CẢNH BÁO TỒN KHO LINH KIỆN (Dưới ngưỡng minThreshold)
  // =========================================================================
  const allParts = await prisma.part.findMany({
    where: { isActive: true },
    include: {
      batches: {
        select: { quantity: true },
      },
    },
  });

  const lowStockParts: string[] = [];

  for (const part of allParts) {
    const currentQty = part.batches.reduce((sum, b) => sum + b.quantity, 0);

    if (currentQty <= part.minThreshold) {
      // Kiểm tra xem hôm nay đã gửi cảnh báo cho linh kiện này chưa
      const existingAlertToday = await prisma.notification.findFirst({
        where: {
          createdAt: { gte: todayStart },
          title: { contains: part.partCode },
        },
      });

      if (!existingAlertToday && dispatcherUserIds.length > 0) {
        await prisma.notification.createMany({
          data: dispatcherUserIds.map((uid) => ({
            userId: uid,
            channel: "IN_APP",
            title: `⚠️ Cảnh báo tồn kho: [${part.partCode}] ${part.name}`,
            body: `Vật tư "${part.name}" hiện chỉ còn ${currentQty} ${part.unit} (dưới ngưỡng tối thiểu ${part.minThreshold} ${part.unit}). Cần lập đề xuất nhập kho FIFO.`,
          })),
        });
      }

      lowStockParts.push(`[${part.partCode}] ${part.name}: còn ${currentQty}/${part.minThreshold} ${part.unit}`);
    }
  }

  // =========================================================================
  // TÁC VỤ 3: QUÉT CẢNH BÁO HỢP ĐỒNG SẮP HẾT HẠN (Trong vòng 30 ngày)
  // =========================================================================
  const in30Days = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
  const expiringContracts = await prisma.contract.findMany({
    where: {
      isActive: true,
      endDate: {
        gte: now,
        lte: in30Days,
      },
    },
    include: {
      customer: { select: { name: true } },
    },
  });

  const expiringList: string[] = [];

  for (const c of expiringContracts) {
    // Kiểm tra xem trong 7 ngày qua đã gửi thông báo cho hợp đồng này chưa
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const recentNotif = await prisma.notification.findFirst({
      where: {
        createdAt: { gte: sevenDaysAgo },
        title: { contains: c.code },
      },
    });

    const daysLeft = Math.ceil((new Date(c.endDate).getTime() - now.getTime()) / (24 * 3600 * 1000));

    if (!recentNotif && dispatcherUserIds.length > 0) {
      await prisma.notification.createMany({
        data: dispatcherUserIds.map((uid) => ({
          userId: uid,
          channel: "IN_APP",
          title: `📄 Hợp đồng sắp hết hạn: ${c.code}`,
          body: `Hợp đồng ${c.code} (${c.customer.name}) sẽ hết hạn vào ngày ${new Date(c.endDate).toLocaleDateString("vi-VN")} (còn ${daysLeft} ngày). Vui lòng liên hệ khách hàng tái ký.`,
        })),
      });
    }

    expiringList.push(`${c.code} (${c.customer.name}) - còn ${daysLeft} ngày`);
  }

  // =========================================================================
  // TÁC VỤ 4: QUÉT TRỄ THỜI HẠN CAM KẾT (SLA MONITORING)
  // =========================================================================
  const slaBreachedTickets = await prisma.ticket.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED"] },
      slaDueAt: { lt: now },
    },
    include: {
      customer: { select: { name: true } },
      equipment: { select: { model: true } },
      assignee: { select: { name: true } },
    },
  });

  const slaBreachList: string[] = [];

  for (const t of slaBreachedTickets) {
    // Tránh gửi lặp trong ngày
    const alertToday = await prisma.notification.findFirst({
      where: {
        createdAt: { gte: todayStart },
        title: { contains: t.code },
        body: { contains: "quá hạn SLA" },
      },
    });

    if (!alertToday && dispatcherUserIds.length > 0) {
      await prisma.notification.createMany({
        data: dispatcherUserIds.map((uid) => ({
          userId: uid,
          channel: "IN_APP",
          title: `⏰ Cảnh báo trễ SLA: Phiếu ${t.code}`,
          body: `Phiếu kỹ thuật ${t.code} xử lý máy ${t.equipment.model} (${t.customer.name}) đã quá hạn SLA. KTV phụ trách: ${t.assignee?.name || "Chưa phân công"}.`,
        })),
      });
    }

    slaBreachList.push(`${t.code} - ${t.equipment.model} (${t.customer.name})`);
  }

  // Ghi AuditLog
  await prisma.auditLog.create({
    data: {
      userId: invokedByUserId,
      action: "CRON_DAILY_RUN",
      entity: "System",
      meta: {
        ticketsCreated: createdTickets.length,
        lowStockCount: lowStockParts.length,
        expiringContractsCount: expiringList.length,
        slaBreachedCount: slaBreachList.length,
      },
    },
  });

  return {
    timestamp: now.toISOString(),
    maintenanceTicketsCreated: createdTickets.length,
    lowStockAlerts: lowStockParts.length,
    expiringContractsAlerts: expiringList.length,
    slaBreachAlerts: slaBreachList.length,
    details: {
      tickets: createdTickets,
      lowStockParts,
      expiringContracts: expiringList,
      slaBreachedTickets: slaBreachList,
    },
  };
}
