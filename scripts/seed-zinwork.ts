import { prisma } from "../src/lib/prisma";

async function main() {
  const m1 = await prisma.equipment.upsert({
    where: { serialNumber: "NDMA179630" },
    update: {},
    create: {
      serialNumber: "NDMA179630",
      model: "Canon LBP 2900",
      brand: "Canon",
      status: "IN_STOCK",
      currentCounter: 3200,
      healthScore: 98,
    },
  });

  const m2 = await prisma.equipment.upsert({
    where: { serialNumber: "NTRA212371" },
    update: {},
    create: {
      serialNumber: "NTRA212371",
      model: "Canon LBP6230DN",
      brand: "Canon",
      status: "IN_STOCK",
      currentCounter: 8450,
      healthScore: 95,
    },
  });

  const m3 = await prisma.equipment.upsert({
    where: { serialNumber: "G166R692144" },
    update: {},
    create: {
      serialNumber: "G166R692144",
      model: "Ricoh MP3554",
      brand: "Ricoh",
      status: "IN_STOCK",
      currentCounter: 25100,
      healthScore: 92,
    },
  });

  console.log("Seeded Zinwork equipment in stock:", m1.serialNumber, m2.serialNumber, m3.serialNumber);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
