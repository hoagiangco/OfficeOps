import { NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withErrors, HttpError, parseBody } from "@/lib/http";

const resetPasswordSchema = z
  .object({
    token: z.string().min(1, "Thiếu mã xác thực đặt lại mật khẩu"),
    newPassword: z
      .string()
      .min(8, "Mật khẩu mới phải có ít nhất 8 ký tự")
      .regex(/[a-zA-Z]/, "Mật khẩu mới phải chứa ít nhất một chữ cái")
      .regex(/[0-9]/, "Mật khẩu mới phải chứa ít nhất một chữ số"),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu xác nhận không khớp",
    path: ["confirmPassword"],
  });

export const POST = withErrors(async (req: Request) => {
  const parsed = await parseBody(req, resetPasswordSchema);
  if (parsed.error) return parsed.error;

  const { token, newPassword } = parsed.data;

  // 1. Băm SHA-256 token gửi lên để tìm kiếm trong database
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  const resetRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!resetRecord) {
    throw new HttpError(
      400,
      "Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại yêu cầu mới."
    );
  }

  // 2. Kiểm tra token đã sử dụng chưa
  if (resetRecord.usedAt) {
    throw new HttpError(
      400,
      "Liên kết này đã được sử dụng trước đó. Mỗi liên kết chỉ dùng được một lần duy nhất."
    );
  }

  // 3. Kiểm tra hạn sử dụng (30 phút)
  if (resetRecord.expiresAt < new Date()) {
    throw new HttpError(
      400,
      "Liên kết đặt lại mật khẩu đã hết thời hạn 30 phút. Vui lòng yêu cầu liên kết mới."
    );
  }

  // 4. Tìm tài khoản người dùng
  const user = await prisma.user.findUnique({
    where: { email: resetRecord.email },
  });

  if (!user || !user.isActive) {
    throw new HttpError(404, "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.");
  }

  // 5. Cập nhật mật khẩu mới & đánh dấu token đã sử dụng
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "PASSWORD_RESET_VIA_TOKEN",
        entity: "User",
        entityId: user.id,
        meta: { ip: req.headers.get("x-forwarded-for") || "unknown" },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: "Đặt lại mật khẩu thành công! Bạn có thể đăng nhập ngay với mật khẩu mới.",
  });
});
