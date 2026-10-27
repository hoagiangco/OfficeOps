import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const batchSchema = z.object({
  partId: z.string().min(1),
  batchCode: z.string().trim().min(1, "Mã lô không được trống"),
  quantity: z.coerce.number().int().positive("Số lượng nhập phải > 0"),
  costPrice: z.coerce.number().nonnegative("Giá vốn không hợp lệ"),
  location: z.string().trim().min(1, "Vị trí kệ/tủ không được trống"),
  receivedDate: z.coerce.date().optional(),
});

// Nhập kho theo Lô (FIFO) và ghi Sổ cái StockMovement (IN)
export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("stock:import");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, batchSchema);
  if (r.error) return r.error;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.inventoryBatch.findUnique({
      where: {
        partId_batchCode: { partId: r.data.partId, batchCode: r.data.batchCode },
      },
    });

    const batch = existing
      ? await tx.inventoryBatch.update({
          where: { id: existing.id },
          data: {
            quantity: existing.quantity + r.data.quantity,
            costPrice: r.data.costPrice,
            location: r.data.location,
          },
        })
      : await tx.inventoryBatch.create({
          data: {
            partId: r.data.partId,
            batchCode: r.data.batchCode,
            quantity: r.data.quantity,
            costPrice: r.data.costPrice,
            location: r.data.location,
            receivedDate: r.data.receivedDate ?? new Date(),
          },
        });

    await tx.stockMovement.create({
      data: {
        batchId: batch.id,
        type: "IN",
        quantity: r.data.quantity,
        refType: "InventoryBatch",
        refId: batch.id,
      },
    });

    await tx.auditLog.create({
      data: {
        userId: s.userId,
        action: "STOCK_BATCH_IN",
        entity: "InventoryBatch",
        entityId: batch.id,
        meta: { batchCode: batch.batchCode, quantity: r.data.quantity },
      },
    });

    return batch;
  });

  return NextResponse.json(result, { status: 201 });
});
