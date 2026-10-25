import { prisma } from "../src/lib/prisma";

async function main() {
  const cust = await prisma.customer.findFirst({
    where: { code: "KH2024452732" },
  });
  if (!cust) {
    console.error("Customer not found");
    return;
  }

  const serials = ["NDMA179630", "NTRA212371", "G166R692144"];
  for (const sn of serials) {
    await prisma.equipment.update({
      where: { serialNumber: sn },
      data: {
        customerId: cust.id,
        status: "ACTIVE",
        locationNote: "Số 15 Trần Quý Cáp, Phường An Bình, Tp. Rạch Giá, Tỉnh Kiên Giang",
        installedAt: new Date(),
      },
    });
  }

  // Also add sample ticket like in Image 1 ("Nạp mực máy in")
  const m1 = await prisma.equipment.findUnique({ where: { serialNumber: "NDMA179630" } });
  if (m1) {
    await prisma.ticket.create({
      data: {
        code: "TK-2026-000188",
        customerId: cust.id,
        equipmentId: m1.id,
        type: "OTHER",
        priority: "NORMAL",
        status: "PENDING",
        description: "Nạp mực máy in",
      },
    });
  }

  // Also add feedback like in Image 3 & 4
  await prisma.customerFeedback.create({
    data: {
      customerId: cust.id,
      authorName: "Kỹ thuật viên Kiên Giang",
      content: "Khách hàng báo máy in Canon 2900 sắp hết mực, yêu cầu mang hộp mực 12A đến nạp trong chiều nay.",
    },
  });

  console.log("Configured Zinwork customer demo data successfully!");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
