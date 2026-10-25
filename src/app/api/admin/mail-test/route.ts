import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError, parseBody } from "@/lib/http";
import { verifySmtpConnection, sendMail } from "@/lib/mailer";
import { z } from "zod";

const testSchema = z.object({
  to: z.string().email("Địa chỉ email nhận không hợp lệ").optional(),
});

// GET: Kiểm tra kết nối SMTP
export const GET = withErrors(async () => {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new HttpError(403, "Chỉ Giám đốc (SUPER_ADMIN) mới có quyền kiểm tra cấu hình Email");
  }

  const host = process.env.SMTP_HOST || "";
  const port = process.env.SMTP_PORT || "";
  const user = process.env.SMTP_USER || "";
  const isConfigured = Boolean(host && user && process.env.SMTP_PASS);

  const testResult = await verifySmtpConnection();

  return NextResponse.json({
    isConfigured,
    smtpHost: host,
    smtpPort: port,
    smtpUser: user ? user.replace(/(.{3})(.*)(@.*)/, "$1***$3") : "",
    connection: testResult,
  });
});

// POST: Gửi email thử nghiệm
export const POST = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session || session.role !== "SUPER_ADMIN") {
    throw new HttpError(403, "Chỉ Giám đốc (SUPER_ADMIN) mới có quyền thực hiện gửi email thử nghiệm");
  }

  const parsed = await parseBody(req, testSchema);
  if (parsed.error) return parsed.error;

  let toEmail = parsed.data?.to;
  if (!toEmail) {
    const adminUser = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { email: true },
    });
    toEmail = adminUser?.email;
  }

  if (!toEmail) {
    throw new HttpError(400, "Vui lòng nhập địa chỉ email nhận thư thử nghiệm");
  }

  const testHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #2563eb; margin-top: 0;">Kiểm tra kết nối Email OfficeOps</h2>
      <p>Xin chào <strong>${session.name}</strong>,</p>
      <p>Đây là email thử nghiệm từ hệ thống quản lý máy văn phòng <strong>OfficeOps</strong>.</p>
      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 15px 0;">
        <p style="margin: 0; font-size: 14px; color: #475569;">
          <strong>Thời gian gửi:</strong> ${new Date().toLocaleString("vi-VN")}<br/>
          <strong>Máy chủ SMTP:</strong> ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}<br/>
          <strong>Trạng thái:</strong> Kết nối & Gửi thư thành công
        </p>
      </div>
      <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">
        Email này được gửi tự động để kiểm tra hạ tầng máy chủ gửi thư.
      </p>
    </div>
  `;

  const result = await sendMail({
    to: toEmail,
    subject: "[OfficeOps] Thử nghiệm cấu hình hệ thống Email",
    html: testHtml,
    text: `Đây là email thử nghiệm từ hệ thống OfficeOps. Thời gian: ${new Date().toLocaleString("vi-VN")}`,
    userId: session.userId,
  });

  if (!result.success) {
    throw new HttpError(500, `Gửi email thử nghiệm thất bại: ${result.error}`);
  }

  return NextResponse.json({
    success: true,
    message: `Đã gửi email thử nghiệm thành công tới ${toEmail}`,
    messageId: result.messageId,
  });
});
