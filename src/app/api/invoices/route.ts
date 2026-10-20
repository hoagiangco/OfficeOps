import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import type { InvoiceStatus } from "@prisma/client";

const generateInvoiceSchema = z.object({
  contractId: z.string().min(1, "Vui lòng chọn hợp đồng"),
  periodStart: z.string().min(1, "Vui lòng chọn ngày đầu kỳ"),
  periodEnd: z.string().min(1, "Vui lòng chọn ngày cuối kỳ"),
  taxPercent: z.number().min(0).max(20).default(8),
  dueDate: z.string().optional().nullable(),
});

export const GET = withErrors(async (req: Request) => {
  const session = await requirePermission("finance:view");
  if (session instanceof NextResponse) return session;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as InvoiceStatus | null;
  const customerId = sp.get("customerId");
  const contractId = sp.get("contractId");

  const invoices = await prisma.invoice.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(contractId ? { contractId } : {}),
    },
    include: {
      customer: { select: { id: true, name: true, taxCode: true, address: true, phone: true, email: true } },
      contract: {
        select: {
          id: true,
          code: true,
          basePrice: true,
          baseQuota: true,
          overagePrice: true,
        },
      },
      items: {
        orderBy: { id: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(invoices);
});

export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("invoice:manage");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, generateInvoiceSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const contract = await prisma.contract.findUnique({
    where: { id: data.contractId },
    include: {
      customer: true,
      equipment: {
        include: {
          meterLogs: {
            orderBy: { logDate: "asc" },
          },
        },
      },
    },
  });

  if (!contract) throw new HttpError(404, "Không tìm thấy hợp đồng");

  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const countThisMonth = await prisma.invoice.count({
    where: { code: { startsWith: `INV-${ym}-` } },
  });
  const code = `INV-${ym}-${String(countThisMonth + 1).padStart(4, "0")}`;

  const baseRentalAmount = Number(contract.basePrice);

  interface PreparedItem {
    equipmentId: string | null;
    description: string;
    usage: number;
    quota: number;
    overage: number;
    amount: number;
    unbilledLogIds: string[];
  }

  const preparedItems: PreparedItem[] = [
    {
      equipmentId: null,
      description: `Cước thuê cố định hàng tháng theo hợp đồng ${contract.code}`,
      usage: 0,
      quota: 0,
      overage: 0,
      amount: baseRentalAmount,
      unbilledLogIds: [],
    },
  ];

  for (const eq of contract.equipment) {
    const quota = eq.baseQuota ?? contract.baseQuota;
    const overagePrice = Number(eq.overagePrice ?? contract.overagePrice);

    const billedLogs = eq.meterLogs.filter((m) => m.isBilled);
    const unbilledLogs = eq.meterLogs.filter((m) => !m.isBilled);

    let startCounter = 0;
    let endCounter = eq.currentCounter;

    if (billedLogs.length > 0) {
      startCounter = billedLogs[billedLogs.length - 1].counterValue;
    } else if (unbilledLogs.length >= 2) {
      startCounter = unbilledLogs[0].counterValue;
    } else if (unbilledLogs.length === 1) {
      startCounter = 0;
    }

    if (unbilledLogs.length > 0) {
      endCounter = unbilledLogs[unbilledLogs.length - 1].counterValue;
    }

    const usage = Math.max(0, endCounter - startCounter);
    const overage = Math.max(0, usage - quota);
    const overageAmount = Math.round(overage * overagePrice);

    preparedItems.push({
      equipmentId: eq.id,
      description: `Máy ${eq.model} (SN: ${eq.serialNumber}) | Counter: ${startCounter.toLocaleString("vi-VN")} → ${endCounter.toLocaleString("vi-VN")} | Định mức: ${quota.toLocaleString("vi-VN")} bản | Đơn giá vượt: ${overagePrice.toLocaleString("vi-VN")} đ/bản`,
      usage,
      quota,
      overage,
      amount: overageAmount,
      unbilledLogIds: unbilledLogs.map((m) => m.id),
    });
  }

  const subtotal = preparedItems.reduce((sum, it) => sum + it.amount, 0);
  const tax = Math.round(subtotal * (data.taxPercent / 100));
  const total = subtotal + tax;

  const created = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        code,
        customerId: contract.customerId,
        contractId: contract.id,
        periodStart: new Date(data.periodStart),
        periodEnd: new Date(data.periodEnd),
        subtotal,
        tax,
        total,
        status: "DRAFT",
        dueDate: data.dueDate
          ? new Date(data.dueDate)
          : new Date(Date.now() + 10 * 24 * 3600 * 1000),
      },
    });

    for (const item of preparedItems) {
      const createdItem = await tx.invoiceItem.create({
        data: {
          invoiceId: inv.id,
          equipmentId: item.equipmentId,
          description: item.description,
          usage: item.usage,
          quota: item.quota,
          overage: item.overage,
          amount: item.amount,
        },
      });

      if (item.unbilledLogIds.length > 0) {
        await tx.meterLog.updateMany({
          where: { id: { in: item.unbilledLogIds } },
          data: {
            isBilled: true,
            invoiceItemId: createdItem.id,
          },
        });
      }
    }

    return tx.invoice.findUnique({
      where: { id: inv.id },
      include: {
        customer: true,
        contract: true,
        items: true,
      },
    });
  });

  await audit(session.userId, "INVOICE_GENERATE", "Invoice", created?.id, {
    code,
    contractCode: contract.code,
    total,
  });

  return NextResponse.json(created, { status: 201 });
});
