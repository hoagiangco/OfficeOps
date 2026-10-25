import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { getInvoiceEmailHtml } from "@/lib/mail-templates";
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
    include: {
      items: true,
      customer: true,
      contract: true,
    },
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

  let emailSent = false;
  let emailWarning: string | null = null;

  // B3: Khi chuyển trạng thái sang SENT -> tự động gửi email hóa đơn kèm VietQR
  if (data.status === "SENT") {
    const customerEmail = updated.customer?.email?.trim();

    if (customerEmail) {
      try {
        // Lấy cấu hình tài khoản ngân hàng từ SystemSetting (nếu có)
        const bankSetting = await prisma.systemSetting.findUnique({
          where: { key: "bank_info" },
        });

        let bankInfo = {
          bankName: "ICB", // Ngân hàng Công Thương VietinBank
          accountNo: "108876543210",
          accountName: "CONG TY TNHH THIET BI VAN PHONG OFFICEOPS",
        };

        if (bankSetting?.value) {
          try {
            const parsedBank = JSON.parse(bankSetting.value);
            bankInfo = { ...bankInfo, ...parsedBank };
          } catch {}
        }

        const billingPeriod = `${new Date(updated.periodStart).toLocaleDateString(
          "vi-VN"
        )} - ${new Date(updated.periodEnd).toLocaleDateString("vi-VN")}`;
        const totalAmountNum = Number(updated.total);
        const invoiceDueDate = updated.dueDate || new Date();

        const emailHtml = getInvoiceEmailHtml({
          customerName: updated.customer.name,
          invoiceCode: updated.code,
          billingPeriod,
          dueDate: invoiceDueDate,
          totalAmount: totalAmountNum,
          invoiceId: updated.id,
          bankInfo,
        });

        const mailRes = await sendMail({
          to: customerEmail,
          subject: `[OfficeOps] Thông báo cước dịch vụ hóa đơn ${updated.code} - Kỳ ${billingPeriod}`,
          html: emailHtml,
          text: `Kính gửi ${updated.customer.name}, OfficeOps gửi bạn thông báo cước ${updated.code} tổng tiền ${totalAmountNum.toLocaleString("vi-VN")} VND. Hạn thanh toán: ${invoiceDueDate.toLocaleDateString("vi-VN")}.`,
          userId: session.userId,
        });

        emailSent = mailRes.success;
      } catch (mailErr) {
        console.error("[Invoice Email] Lỗi khi gửi mail hóa đơn:", mailErr);
      }
    } else {
      emailWarning = `Khách hàng "${updated.customer.name}" chưa có địa chỉ email trên hệ thống. Hóa đơn đã chuyển trạng thái SENT nhưng chưa gửi được thư điện tử.`;
    }
  }

  await audit(session.userId, "INVOICE_STATUS_CHANGE", "Invoice", id, {
    code: existing.code,
    fromStatus: existing.status,
    toStatus: data.status,
    emailSent,
    customerEmail: updated.customer?.email || null,
  });

  return NextResponse.json({
    ...updated,
    emailSent,
    emailWarning,
  });
});
