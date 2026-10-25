import { prisma } from "../src/lib/prisma";

async function main() {
  await prisma.equipment.upsert({
    where: { serialNumber: "HP-M404DN-7712" },
    update: {},
    create: {
      serialNumber: "HP-M404DN-7712",
      model: "HP LaserJet Pro M404dn",
      brand: "HP",
      status: "IN_STOCK",
      currentCounter: 1400,
      healthScore: 99,
    },
  });

  await prisma.equipment.upsert({
    where: { serialNumber: "RC-MP2555-5501" },
    update: {},
    create: {
      serialNumber: "RC-MP2555-5501",
      model: "Ricoh MP 2555SP",
      brand: "Ricoh",
      status: "IN_STOCK",
      currentCounter: 42000,
      healthScore: 90,
    },
  });

  console.log("Seeded extra available machines in stock");
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
