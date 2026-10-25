import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withErrors, parseBody } from "@/lib/http";
import { sendMail } from "@/lib/mailer";
import { getPasswordResetEmailHtml } from "@/lib/mail-templates";

const forgotSchema = z.object({
  email: z.string().email("Vui lòng nhập địa chỉ email hợp lệ"),
});

export const POST = withErrors(async (req: Request) => {
  const parsed = await parseBody(req, forgotSchema);
  if (parsed.error) return parsed.error;

  const normalizedEmail = parsed.data.email.toLowerCase().trim();

  // Tìm người dùng trong hệ thống
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  // Luôn trả về thông báo chung để bảo mật chống lộ thông tin tài khoản
  const genericResponse = NextResponse.json({
    success: true,
    message:
      "Nếu email của bạn tồn tại trên hệ thống, chúng tôi đã gửi liên kết khôi phục mật khẩu. Vui lòng kiểm tra hộp thư đến (và thư mục Spam/Quảng cáo).",
  });

  if (!user || !user.isActive) {
    return genericResponse;
  }

  // 1. Sinh token ngẫu nhiên an toàn và lưu bản băm SHA-256
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 phút

  // Vô hiệu hóa các token cũ chưa sử dụng của email này
  await prisma.passwordResetToken.deleteMany({
    where: {
      email: normalizedEmail,
      usedAt: null,
    },
  });

  // Tạo token mới
  await prisma.passwordResetToken.create({
    data: {
      email: normalizedEmail,
      tokenHash,
      expiresAt,
    },
  });

  // 2. Gửi email chứa liên kết reset mật khẩu
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5000";
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  const emailHtml = getPasswordResetEmailHtml({
    userName: user.name,
    resetUrl,
  });

  await sendMail({
    to: user.email,
    subject: "[OfficeOps] Khôi phục mật khẩu tài khoản của bạn",
    html: emailHtml,
    text: `Xin chào ${user.name}, bấm vào liên kết sau để đặt lại mật khẩu của bạn: ${resetUrl} (Liên kết có hiệu lực trong 30 phút).`,
    userId: user.id,
  });

  return genericResponse;
});
