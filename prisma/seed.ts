import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const users: {
  name: string;
  email: string;
  role: Role;
  phone: string;
  region?: string;
  skills?: string[];
}[] = [
  {
    name: "Nguyễn Văn Giám Đốc",
    email: "giamdoc@officeops.local",
    role: "SUPER_ADMIN",
    phone: "0901000001",
    region: "Toàn quốc",
    skills: ["Ricoh", "Canon", "Toshiba", "Xerox"],
  },
  {
    name: "Trần Thị Kế Toán",
    email: "ketoan@officeops.local",
    role: "ADMIN",
    phone: "0901000002",
    region: "TP.HCM",
    skills: [],
  },
  {
    name: "Lê Hoàng Điều Phối",
    email: "dieuphoi@officeops.local",
    role: "DISPATCHER",
    phone: "0901000003",
    region: "Quận 1, Quận 3, Bình Thạnh",
    skills: ["Ricoh", "Canon"],
  },
  {
    name: "Phạm Minh Kỹ Thuật",
    email: "kythuat@officeops.local",
    role: "FIELD_TECH",
    phone: "0901000004",
    region: "Quận 1, Quận 7, Thủ Đức",
    skills: ["Ricoh", "Toshiba", "Canon"],
  },
];

async function main() {
  const password = await bcrypt.hash("Office@123", 10);
  const seededUsers: Record<string, { id: string; name: string }> = {};

  for (const u of users) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        phone: u.phone,
        region: u.region,
        skills: u.skills ?? [],
      },
      create: {
        name: u.name,
        email: u.email,
        password,
        role: u.role,
        phone: u.phone,
        region: u.region,
        skills: u.skills ?? [],
      },
    });
    seededUsers[u.role] = user;
  }

  // Seed dữ liệu mẫu nếu chưa có khách hàng
  const existingCustomers = await prisma.customer.count();
  if (existingCustomers === 0) {
    const cust1 = await prisma.customer.create({
      data: {
        name: "Ngân hàng TMCP Á Châu (ACB) - Hội sở",
        taxCode: "0301452948",
        phone: "02839290999",
        email: "admin@acb.com.vn",
        address: "442 Nguyễn Thị Minh Khai, Quận 3, TP.HCM",
        branches: {
          create: [
            {
              name: "Chi nhánh Hội sở Quận 3",
              address: "442 Nguyễn Thị Minh Khai, Quận 3",
              buildings: {
                create: [
                  {
                    name: "Tòa nhà ACB Tower",
                    departments: {
                      create: [
                        { name: "Tầng 3 - Khối Tín dụng" },
                        { name: "Tầng 8 - Phòng Kế toán & Hành chính" },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },
      include: {
        branches: {
          include: { buildings: { include: { departments: true } } },
        },
      },
    });

    const cust2 = await prisma.customer.create({
      data: {
        name: "Tập đoàn Logistics Tân Cảng Sài Gòn",
        taxCode: "0300514849",
        phone: "02837422234",
        email: "it-support@saigonnewport.com.vn",
        address: "722 Điện Biên Phủ, Quận Bình Thạnh, TP.HCM",
      },
    });

    const dept1 = cust1.branches[0]?.buildings[0]?.departments[0];
    const dept2 = cust1.branches[0]?.buildings[0]?.departments[1];

    const contract1 = await prisma.contract.create({
      data: {
        code: "HD-2026-0001",
        customerId: cust1.id,
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-12-31"),
        basePrice: 3600000,
        baseQuota: 10000,
        overagePrice: 120,
        billingDay: 25,
        maintenanceIntervalDays: 30,
        note: "Hợp đồng thuê trọn gói 2 máy photocopy tốc độ cao tại Hội sở",
      },
    });

    const contract2 = await prisma.contract.create({
      data: {
        code: "HD-2026-0002",
        customerId: cust2.id,
        startDate: new Date("2026-02-01"),
        endDate: new Date("2026-11-15"),
        basePrice: 2200000,
        baseQuota: 8000,
        overagePrice: 130,
        billingDay: 28,
        maintenanceIntervalDays: 45,
        note: "Hợp đồng thuê máy in công suất lớn khu điều độ cảng",
      },
    });

    const eq1 = await prisma.equipment.create({
      data: {
        serialNumber: "RC-MP6055-8821",
        qrCode: "QR-RC-MP6055-8821",
        model: "Ricoh MP 6055SP",
        brand: "Ricoh",
        customerId: cust1.id,
        contractId: contract1.id,
        departmentId: dept1?.id,
        status: "ACTIVE",
        healthScore: 95,
        currentCounter: 48500,
        baseQuota: 12000,
        overagePrice: 110,
        installedAt: new Date("2026-01-05"),
      },
    });

    const eq2 = await prisma.equipment.create({
      data: {
        serialNumber: "CN-DX4745-3319",
        qrCode: "QR-CN-DX4745-3319",
        model: "Canon imageRUNNER ADVANCE DX 4745i",
        brand: "Canon",
        customerId: cust1.id,
        contractId: contract1.id,
        departmentId: dept2?.id,
        status: "FAULTY",
        healthScore: 72,
        currentCounter: 31200,
        installedAt: new Date("2026-01-05"),
      },
    });

    const eq3 = await prisma.equipment.create({
      data: {
        serialNumber: "TS-ES5518A-9904",
        qrCode: "QR-TS-ES5518A-9904",
        model: "Toshiba e-STUDIO 5518A",
        brand: "Toshiba",
        customerId: cust2.id,
        contractId: contract2.id,
        status: "ACTIVE",
        healthScore: 90,
        currentCounter: 19400,
        installedAt: new Date("2026-02-02"),
      },
    });

    // Seed MeterLogs
    await prisma.meterLog.createMany({
      data: [
        {
          equipmentId: eq1.id,
          recordedById: seededUsers.FIELD_TECH.id,
          counterValue: 34000,
          source: "TECH",
          logDate: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          isBilled: false,
        },
        {
          equipmentId: eq1.id,
          recordedById: seededUsers.FIELD_TECH.id,
          counterValue: 48500,
          source: "MANUAL",
          logDate: new Date(),
          isBilled: false,
        },
        {
          equipmentId: eq2.id,
          recordedById: seededUsers.FIELD_TECH.id,
          counterValue: 22000,
          source: "TECH",
          logDate: new Date(Date.now() - 30 * 24 * 3600 * 1000),
          isBilled: false,
        },
        {
          equipmentId: eq2.id,
          recordedById: seededUsers.FIELD_TECH.id,
          counterValue: 31200,
          source: "MANUAL",
          logDate: new Date(),
          isBilled: false,
        },
      ],
    });

    // Seed Parts & FIFO InventoryBatches
    const part1 = await prisma.part.create({
      data: {
        partCode: "LK-DRUM-MP6055",
        name: "Trống hình (Drum OPC) Ricoh MP 5055/6055",
        category: "Cụm trống",
        unit: "cái",
        compatibleModels: ["Ricoh MP 6055SP", "Ricoh MP 5055SP"],
        minThreshold: 5,
        salePrice: 850000,
        batches: {
          create: [
            {
              batchCode: "LO-202601-A",
              quantity: 4,
              costPrice: 520000,
              location: "Kệ A1 - Tầng 2",
              receivedDate: new Date("2026-01-10"),
            },
            {
              batchCode: "LO-202603-B",
              quantity: 8,
              costPrice: 545000,
              location: "Kệ A1 - Tầng 3",
              receivedDate: new Date("2026-03-15"),
            },
          ],
        },
      },
    });

    await prisma.part.create({
      data: {
        partCode: "LK-TONER-CN4745",
        name: "Ống mực chính hãng Canon NPG-73 Black",
        category: "Mực in",
        unit: "hộp",
        compatibleModels: ["Canon imageRUNNER ADVANCE DX 4745i"],
        minThreshold: 10,
        salePrice: 1250000,
        batches: {
          create: [
            {
              batchCode: "LO-202602-M1",
              quantity: 6, // Dưới ngưỡng tối thiểu 10 -> cảnh báo Low Stock!
              costPrice: 890000,
              location: "Tủ Mực B2",
              receivedDate: new Date("2026-02-20"),
            },
          ],
        },
      },
    });

    // Seed Ticket
    const tk1 = await prisma.ticket.create({
      data: {
        code: "TK-2026-0001",
        customerId: cust1.id,
        equipmentId: eq2.id,
        assigneeId: seededUsers.FIELD_TECH.id,
        creatorId: seededUsers.DISPATCHER.id,
        type: "REPAIR",
        status: "IN_PROGRESS",
        priority: "URGENT",
        source: "CUSTOMER",
        description: "Máy Canon báo lỗi E000007-0000 cụm sấy và kẹt giấy ở khay đảo mặt",
        diagnosis: "Rách bao lụa sấy + mòn bánh xe kéo giấy khay 2",
        checkInAt: new Date(Date.now() - 3600 * 1000),
        checkInLat: 10.7721,
        checkInLng: 106.6885,
        slaDueAt: new Date(Date.now() + 3 * 3600 * 1000),
        logs: {
          create: [
            {
              userId: seededUsers.DISPATCHER.id,
              fromStatus: null,
              toStatus: "ASSIGNED",
              note: "Tiếp nhận cuộc gọi từ Hội sở ACB và giao cho KTV Phạm Minh",
            },
            {
              userId: seededUsers.FIELD_TECH.id,
              fromStatus: "ASSIGNED",
              toStatus: "IN_PROGRESS",
              note: "Đã Check-in GPS tại Tòa nhà ACB Tower Tầng 8",
            },
          ],
        },
      },
    });

    await prisma.ticket.create({
      data: {
        code: "TK-2026-0002",
        customerId: cust2.id,
        equipmentId: eq3.id,
        creatorId: seededUsers.DISPATCHER.id,
        type: "MAINTENANCE",
        status: "PENDING",
        priority: "HIGH",
        source: "SCHEDULED",
        description: "Bảo dưỡng định kỳ vệ sinh quang học & kiểm tra cụm trống máy Toshiba",
        slaDueAt: new Date(Date.now() + 8 * 3600 * 1000),
      },
    });

    // Seed StockIssue gắn với Ticket
    await prisma.stockIssue.create({
      data: {
        code: "XK-2026-0001",
        type: "TECHNICAL",
        status: "PENDING",
        ticketId: tk1.id,
        requesterId: seededUsers.FIELD_TECH.id,
        note: "Xin xuất vật tư thay thế tại chỗ cho máy tại Hội sở ACB",
        items: {
          create: [{ partId: part1.id, quantity: 1 }],
        },
      },
    });

    // Seed MaintenanceSchedules
    await prisma.maintenanceSchedule.createMany({
      data: [
        {
          equipmentId: eq1.id,
          contractId: contract1.id,
          intervalDays: 30,
          nextDueDate: new Date(Date.now() + 3 * 24 * 3600 * 1000), // Sắp đến hạn
          lastRunAt: new Date(Date.now() - 27 * 24 * 3600 * 1000),
          isActive: true,
        },
        {
          equipmentId: eq3.id,
          contractId: contract2.id,
          intervalDays: 45,
          nextDueDate: new Date(Date.now() - 2 * 24 * 3600 * 1000), // Đã quá hạn 2 ngày
          lastRunAt: new Date(Date.now() - 47 * 24 * 3600 * 1000),
          isActive: true,
        },
      ],
    });
  }

  const counts = {
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    contracts: await prisma.contract.count(),
    equipment: await prisma.equipment.count(),
    parts: await prisma.part.count(),
    batches: await prisma.inventoryBatch.count(),
    stockIssues: await prisma.stockIssue.count(),
    tickets: await prisma.ticket.count(),
    schedules: await prisma.maintenanceSchedule.count(),
    meterLogs: await prisma.meterLog.count(),
    invoices: await prisma.invoice.count(),
  };

  // Nếu đã có thiết bị từ trước nhưng chưa có lịch bảo trì / ticket / meterLogs thì bổ sung mẫu
  if (counts.equipment > 0 && counts.schedules === 0) {
    const firstEq = await prisma.equipment.findFirst({ where: { customerId: { not: null } } });
    if (firstEq) {
      await prisma.maintenanceSchedule.create({
        data: {
          equipmentId: firstEq.id,
          contractId: firstEq.contractId,
          intervalDays: 30,
          nextDueDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
          lastRunAt: new Date(Date.now() - 27 * 24 * 3600 * 1000),
          isActive: true,
        },
      });
    }
  }

  if (counts.equipment > 0 && counts.meterLogs === 0) {
    const eqs = await prisma.equipment.findMany({ take: 2 });
    for (const eq of eqs) {
      const base = Math.max(0, eq.currentCounter - 12500);
      await prisma.meterLog.createMany({
        data: [
          {
            equipmentId: eq.id,
            recordedById: seededUsers.FIELD_TECH.id,
            counterValue: base,
            source: "TECH",
            logDate: new Date(Date.now() - 30 * 24 * 3600 * 1000),
            isBilled: false,
          },
          {
            equipmentId: eq.id,
            recordedById: seededUsers.FIELD_TECH.id,
            counterValue: eq.currentCounter || 12500,
            source: "MANUAL",
            logDate: new Date(),
            isBilled: false,
          },
        ],
      });
    }
  }

  if (counts.equipment > 0 && counts.tickets === 0) {
    const eq = await prisma.equipment.findFirst({ where: { customerId: { not: null } } });
    if (eq && eq.customerId) {
      await prisma.ticket.create({
        data: {
          code: "TK-2026-0001",
          customerId: eq.customerId,
          equipmentId: eq.id,
          assigneeId: seededUsers.FIELD_TECH.id,
          creatorId: seededUsers.DISPATCHER.id,
          type: "REPAIR",
          status: "IN_PROGRESS",
          priority: "URGENT",
          source: "CUSTOMER",
          description: "Máy báo lỗi cụm sấy và kẹt giấy khay đảo mặt",
          diagnosis: "Cần vệ sinh cụm sấy và thay bánh xe kéo giấy",
          checkInAt: new Date(Date.now() - 3600 * 1000),
          checkInLat: 10.7769,
          checkInLng: 106.7009,
          slaDueAt: new Date(Date.now() + 3 * 3600 * 1000),
          logs: {
            create: [
              {
                userId: seededUsers.DISPATCHER.id,
                fromStatus: null,
                toStatus: "ASSIGNED",
                note: "Tiếp nhận yêu cầu và giao KTV",
              },
              {
                userId: seededUsers.FIELD_TECH.id,
                fromStatus: "ASSIGNED",
                toStatus: "IN_PROGRESS",
                note: "KTV đã Check-in GPS tại hiện trường",
              },
            ],
          },
        },
      });
    }
  }

  const notifCount = await prisma.notification.count();
  if (notifCount === 0) {
    await prisma.notification.createMany({
      data: [
        {
          userId: null,
          channel: "IN_APP",
          title: "Cảnh báo tồn kho tối thiểu: Ống mực Canon NPG-73",
          body: "Mã LK-TONER-CN4745 hiện chỉ còn 6 hộp (dưới ngưỡng tối thiểu 10 hộp). Vui lòng nhập bổ sung lô mới.",
          sentAt: new Date(),
        },
        {
          userId: null,
          channel: "IN_APP",
          title: "Phiếu sự cố khẩn cấp TK-2026-0001 tại Hội sở ACB",
          body: "Máy Canon DX 4745i báo lỗi cụm sấy, KTV Phạm Minh đã Check-in GPS tại hiện trường.",
          sentAt: new Date(),
        },
      ],
    });
  }

  console.log("Seeded & verified ERP data:", {
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    contracts: await prisma.contract.count(),
    equipment: await prisma.equipment.count(),
    parts: await prisma.part.count(),
    batches: await prisma.inventoryBatch.count(),
    stockIssues: await prisma.stockIssue.count(),
    tickets: await prisma.ticket.count(),
    schedules: await prisma.maintenanceSchedule.count(),
    meterLogs: await prisma.meterLog.count(),
    invoices: await prisma.invoice.count(),
  });
}

main().finally(() => prisma.$disconnect());
