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
                note: "KTV đã Check-in GPS",
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
          body: "Máy Canon DX 4745i báo lỗi cụm sấy, KTV Phạm Minh đã Check-in GPS.",
          sentAt: new Date(),
        },
      ],
    });
  }

  // Seed Danh mục thiết bị đa cấp (3 cấp)
  const catRootPrint = await prisma.equipmentCategory.upsert({
    where: { code: "DM-IN-AN" },
    update: {},
    create: {
      code: "DM-IN-AN",
      name: "Thiết bị In ấn & Sao chụp",
      description: "Danh mục gốc cho máy photocopy và máy in văn phòng",
      sortOrder: 1,
    },
  });

  const catRootDigitize = await prisma.equipmentCategory.upsert({
    where: { code: "DM-SO-HOA" },
    update: {},
    create: {
      code: "DM-SO-HOA",
      name: "Thiết bị Số hóa & Văn phòng",
      description: "Máy scan tài liệu, máy hủy giấy và thiết bị phụ trợ",
      sortOrder: 2,
    },
  });

  const catCopier = await prisma.equipmentCategory.upsert({
    where: { code: "DM-PHOTOCOPY" },
    update: { parentId: catRootPrint.id },
    create: {
      code: "DM-PHOTOCOPY",
      name: "Máy Photocopy",
      description: "Máy photocopy đa chức năng A3/A4",
      parentId: catRootPrint.id,
      sortOrder: 1,
    },
  });

  const catPrinter = await prisma.equipmentCategory.upsert({
    where: { code: "DM-MAY-IN" },
    update: { parentId: catRootPrint.id },
    create: {
      code: "DM-MAY-IN",
      name: "Máy In Văn Phòng",
      description: "Máy in laser đen trắng, máy in màu",
      parentId: catRootPrint.id,
      sortOrder: 2,
    },
  });

  const catScanner = await prisma.equipmentCategory.upsert({
    where: { code: "DM-MAY-SCAN" },
    update: { parentId: catRootDigitize.id },
    create: {
      code: "DM-MAY-SCAN",
      name: "Máy Scan Chuyên Dụng",
      description: "Máy scan tài liệu tốc độ cao",
      parentId: catRootDigitize.id,
      sortOrder: 1,
    },
  });

  const catCopierBW = await prisma.equipmentCategory.upsert({
    where: { code: "DM-PHOTO-BW" },
    update: { parentId: catCopier.id },
    create: {
      code: "DM-PHOTO-BW",
      name: "Photocopy Đen Trắng Tốc Độ Cao",
      description: "Dòng máy trắng đen công suất lớn 45-90 trang/phút",
      parentId: catCopier.id,
      sortOrder: 1,
    },
  });

  const catCopierColor = await prisma.equipmentCategory.upsert({
    where: { code: "DM-PHOTO-COLOR" },
    update: { parentId: catCopier.id },
    create: {
      code: "DM-PHOTO-COLOR",
      name: "Photocopy Màu Đa Chức Năng",
      description: "Dòng máy photocopy màu độ phân giải cao",
      parentId: catCopier.id,
      sortOrder: 2,
    },
  });

  const catLaserBW = await prisma.equipmentCategory.upsert({
    where: { code: "DM-LASER-BW" },
    update: { parentId: catPrinter.id },
    create: {
      code: "DM-LASER-BW",
      name: "Máy In Laser Đen Trắng",
      description: "Máy in để bàn A4 tốc độ ổn định",
      parentId: catPrinter.id,
      sortOrder: 1,
    },
  });

  // Cập nhật danh mục & thông tin mở rộng cho các thiết bị hiện có
  const allEquip = await prisma.equipment.findMany();
  for (let i = 0; i < allEquip.length; i++) {
    const eq = allEquip[i];
    if (!eq.categoryId || !eq.code) {
      const isColor = eq.model.toLowerCase().includes("c") || eq.model.toLowerCase().includes("color");
      await prisma.equipment.update({
        where: { id: eq.id },
        data: {
          code: eq.code || `TB2026000${i + 1}`,
          categoryId: eq.categoryId || (isColor ? catCopierColor.id : catCopierBW.id),
          type: eq.type || "Máy Photocopy",
          group: i === 0 ? "Máy tốc độ cao" : "Máy văn phòng",
          relationType: eq.relationType || "Cho thuê",
        },
      });
    }
  }

  // Thêm các thiết bị mẫu đa dạng về Hãng, Nhóm, Loại và Quan hệ (Bảo trì định kỳ, Sửa chữa dịch vụ, Trong kho)
  const firstCustomer = await prisma.customer.findFirst();
  const sampleServiceEquip = [
    {
      code: "TB20260101",
      serialNumber: "XR-C8155-7712",
      qrCode: "QR-XR-C8155-7712",
      model: "Xerox AltaLink C8155",
      brand: "Xerox",
      type: "Máy đa chức năng (MFP)",
      group: "Máy màu chuyên dụng",
      relationType: "Bảo trì định kỳ",
      categoryId: catCopierColor.id,
      customerId: firstCustomer?.id ?? null,
      status: "ACTIVE" as const,
      healthScore: 92,
      currentCounter: 64200,
      locationNote: "Phòng Thiết kế & Marketing",
      notes: "Máy thuộc sở hữu khách hàng, ký gói bảo trì định kỳ hàng tháng",
      warrantyUntil: new Date("2027-06-30"),
    },
    {
      code: "TB20260102",
      serialNumber: "HP-M404DN-5520",
      qrCode: "QR-HP-M404DN-5520",
      model: "HP LaserJet Pro M404dn",
      brand: "HP",
      type: "Máy in Laser",
      group: "Máy nhỏ gọn (Desktop)",
      relationType: "Sửa chữa dịch vụ",
      categoryId: catLaserBW.id,
      customerId: firstCustomer?.id ?? null,
      status: "WAITING_PARTS" as const,
      healthScore: 68,
      currentCounter: 15800,
      locationNote: "Quầy Giao dịch Tầng Trệt",
      notes: "Máy của khách gửi sửa chữa cụm sấy & nạp mực",
    },
    {
      code: "TB20260103",
      serialNumber: "RC-IM5000-9988",
      qrCode: "QR-RC-IM5000-9988",
      model: "Ricoh IM 5000",
      brand: "Ricoh",
      type: "Máy Photocopy",
      group: "Máy tốc độ cao",
      relationType: "Cho thuê",
      categoryId: catCopierBW.id,
      customerId: null,
      status: "IN_STOCK" as const,
      healthScore: 100,
      currentCounter: 5200,
      locationNote: "Kho Tổng - Khu A2",
      notes: "Máy sẵn sàng xuất cho thuê hợp đồng mới",
    },
    {
      code: "TB20260104",
      serialNumber: "BR-ADS3100-4410",
      qrCode: "QR-BR-ADS3100-4410",
      model: "Brother ADS-3100 High-Speed Scanner",
      brand: "Brother",
      type: "Máy Scan",
      group: "Máy văn phòng",
      relationType: "Bảo hành máy bán",
      categoryId: catScanner.id,
      customerId: firstCustomer?.id ?? null,
      status: "ACTIVE" as const,
      healthScore: 98,
      currentCounter: 8400,
      locationNote: "Phòng Lưu trữ Hồ sơ",
      notes: "Máy bán đứt cho khách, bảo hành chính hãng 12 tháng",
      warrantyUntil: new Date("2027-03-15"),
    },
  ];

  for (const item of sampleServiceEquip) {
    await prisma.equipment.upsert({
      where: { serialNumber: item.serialNumber },
      update: {
        categoryId: item.categoryId,
        type: item.type,
        group: item.group,
        relationType: item.relationType,
      },
      create: item,
    });
  }

  // Seed Loại thiết bị mẫu
  const defaultTypes = [
    { name: "Máy Photocopy", description: "Máy photocopy đa chức năng A3/A4", sortOrder: 1 },
    { name: "Máy in Laser", description: "Máy in laser đen trắng để bàn hoặc mạng", sortOrder: 2 },
    { name: "Máy in màu", description: "Máy in laser màu / in phun màu chất lượng cao", sortOrder: 3 },
    { name: "Máy Scan", description: "Máy quét tài liệu tốc độ cao, quét 2 mặt tự động", sortOrder: 4 },
    { name: "Máy đa chức năng (MFP)", description: "Thiết bị tích hợp In, Scan, Copy, Fax", sortOrder: 5 },
    { name: "Máy hủy tài liệu", description: "Máy hủy giấy bảo mật cấp văn phòng", sortOrder: 6 },
    { name: "Thiết bị phụ trợ", description: "Khay nạp tự động, khay giấy phụ, finisher", sortOrder: 7 },
  ];
  for (const t of defaultTypes) {
    await prisma.equipmentType.upsert({
      where: { name: t.name },
      update: { description: t.description, sortOrder: t.sortOrder },
      create: t,
    });
  }

  // Seed Nhóm thiết bị mẫu
  const defaultGroups = [
    { name: "Máy văn phòng", description: "Dành cho văn phòng tiêu chuẩn quy mô vừa & nhỏ", sortOrder: 1 },
    { name: "Máy tốc độ cao", description: "Công suất lớn từ 45 trang/phút trở lên", sortOrder: 2 },
    { name: "Máy công nghiệp", description: "Dành cho xưởng in hoặc trung tâm tài liệu", sortOrder: 3 },
    { name: "Máy màu chuyên dụng", description: "In đồ họa, thiết kế, bản vẽ kiến trúc", sortOrder: 4 },
    { name: "Máy nhỏ gọn (Desktop)", description: "Đặt bàn làm việc cá nhân hoặc quầy giao dịch", sortOrder: 5 },
    { name: "Máy dự phòng kho", description: "Máy sẵn sàng thay thế khẩn cấp khi máy khách gặp sự cố", sortOrder: 6 },
  ];
  for (const g of defaultGroups) {
    await prisma.equipmentGroup.upsert({
      where: { name: g.name },
      update: { description: g.description, sortOrder: g.sortOrder },
      create: g,
    });
  }

  // Seed Kho bãi công ty mẫu
  const defaultWarehouses = [
    {
      code: "KHO-TONG",
      name: "Kho Tổng TP.HCM",
      address: "123 Nguyễn Văn Cừ, Quận 5, TP.HCM",
      managerName: "Lê Hoàng Điều Phối",
      managerPhone: "0901000003",
      isDefault: true,
      notes: "Kho trung tâm lưu trữ máy nhập khẩu & máy sẵn sàng bàn giao",
      sortOrder: 1,
    },
    {
      code: "KHO-KT",
      name: "Kho Kỹ Thuật & Sửa Chữa",
      address: "456 Hoàng Diệu, Quận 4, TP.HCM",
      managerName: "Phạm Minh Kỹ Thuật",
      managerPhone: "0901000004",
      isDefault: false,
      notes: "Kho chuyên lưu trữ máy thu hồi cần đại tu, kiểm tra, thay linh kiện",
      sortOrder: 2,
    },
    {
      code: "KHO-HN",
      name: "Kho Chi Nhánh Hà Nội",
      address: "789 Giải Phóng, Quận Hai Bà Trưng, Hà Nội",
      managerName: "Nguyễn Văn Đại Diện",
      managerPhone: "0901000008",
      isDefault: false,
      notes: "Kho trung chuyển khu vực miền Bắc",
      sortOrder: 3,
    },
  ];

  let mainWarehouseId = "";
  for (const wh of defaultWarehouses) {
    const upserted = await prisma.warehouse.upsert({
      where: { name: wh.name },
      update: {
        code: wh.code,
        address: wh.address,
        managerName: wh.managerName,
        managerPhone: wh.managerPhone,
        isDefault: wh.isDefault,
        notes: wh.notes,
        sortOrder: wh.sortOrder,
      },
      create: wh,
    });
    if (wh.isDefault) mainWarehouseId = upserted.id;
  }

  // Gán tất cả thiết bị chưa thuộc khách hàng nào về Kho Tổng TP.HCM
  if (mainWarehouseId) {
    await prisma.equipment.updateMany({
      where: {
        customerId: null,
        warehouseId: null,
      },
      data: {
        warehouseId: mainWarehouseId,
        locationNote: "Khu vực máy sẵn sàng - Kệ A1",
      },
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
