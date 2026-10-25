import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Checking batches without StockMovement...");
  const batches = await prisma.inventoryBatch.findMany({
    include: {
      movements: true,
      part: { select: { partCode: true, name: true } },
    },
  });

  let createdCount = 0;
  for (const b of batches) {
    if (b.movements.length === 0) {
      await prisma.stockMovement.create({
        data: {
          batchId: b.id,
          type: "IN",
          quantity: b.quantity,
          refType: "InventoryBatch",
          refId: b.batchCode,
          createdAt: b.receivedDate || new Date(),
        },
      });
      createdCount++;
      console.log(`Created IN movement for batch ${b.batchCode} (${b.part.name}): +${b.quantity}`);
    }
  }

  // Kiểm tra các StockIssue đã APPROVED mà chưa có movement OUT
  const approvedIssues = await prisma.stockIssue.findMany({
    where: { status: "APPROVED" },
    include: {
      items: { include: { part: true } },
    },
  });

  console.log(`Checked ${batches.length} batches. Created ${createdCount} missing initial IN movements.`);
  console.log(`Found ${approvedIssues.length} approved issues.`);
  const totalMovements = await prisma.stockMovement.count();
  console.log(`Total movements now in DB: ${totalMovements}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
