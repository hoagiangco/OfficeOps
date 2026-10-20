import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import type { InvoiceStatus } from "@prisma/client";

const updateInvoiceSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELLED"]),
});

export const GET = withErrors(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("finance:view");
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer: true,
      contract: true,
      items: true,
    },
  });
  if (!invoice) throw new HttpError(404, "Không tìm thấy bảng kê / hóa đơn");
  return NextResponse.json(invoice);
});

export const PATCH = withErrors(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission("invoice:manage");
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  const parsed = await parseBody(req, updateInvoiceSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const existing = await prisma.invoice.findUnique({
    where: { id },
    include: { items: true },
  });
  if (!existing) throw new HttpError(404, "Không tìm thấy hóa đơn");

  const updated = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id },
      data: {
        status: data.status as InvoiceStatus,
        ...(data.status === "SENT" ? { sentAt: new Date() } : {}),
        ...(data.status === "PAID" ? { paidAt: new Date() } : {}),
      },
      include: {
        customer: true,
        contract: true,
        items: true,
      },
    });

    if (data.status === "CANCELLED") {
      const itemIds = existing.items.map((it) => it.id);
      if (itemIds.length > 0) {
        await tx.meterLog.updateMany({
          where: { invoiceItemId: { in: itemIds } },
          data: { isBilled: false, invoiceItemId: null },
        });
      }
    }

    return inv;
  });

  await audit(session.userId, "INVOICE_STATUS_CHANGE", "Invoice", id, {
    code: existing.code,
    fromStatus: existing.status,
    toStatus: data.status,
  });

  return NextResponse.json(updated);
});
