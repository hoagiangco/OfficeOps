import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError, parseBody } from "@/lib/http";

const changePasswordSchema = z
  .object({
    oldPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại"),
    newPassword: z
      .string()
      .min(8, "Mật khẩu mới phải có ít nhất 8 ký tự")
      .regex(/[a-zA-Z]/, "Mật khẩu mới phải chứa ít nhất một chữ cái")
      .regex(/[0-9]/, "Mật khẩu mới phải chứa ít nhất một chữ số"),
    confirmPassword: z.string().min(1, "Vui lòng xác nhận mật khẩu mới"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Xác nhận mật khẩu mới không khớp",
    path: ["confirmPassword"],
  })
  .refine((data) => data.oldPassword !== data.newPassword, {
    message: "Mật khẩu mới không được trùng với mật khẩu hiện tại",
    path: ["newPassword"],
  });

export const POST = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session || !session.userId) {
    throw new HttpError(401, "Bạn chưa đăng nhập hoặc phiên làm việc đã hết hạn");
  }

  const parsed = await parseBody(req, changePasswordSchema);
  if (parsed.error) return parsed.error;
  const { oldPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user || !user.isActive) {
    throw new HttpError(404, "Tài khoản không tồn tại hoặc đã bị vô hiệu hóa");
  }

  // Kiểm tra mật khẩu cũ
  const isMatch = await bcrypt.compare(oldPassword, user.password);
  if (!isMatch) {
    throw new HttpError(400, "Mật khẩu hiện tại không chính xác");
  }

  // Băm mật khẩu mới
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Cập nhật database & ghi AuditLog
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "CHANGE_PASSWORD",
        entity: "User",
        entityId: user.id,
        meta: { ip: req.headers.get("x-forwarded-for") || "unknown" },
      },
    }),
  ]);

  return NextResponse.json({
    success: true,
    message: "Đổi mật khẩu thành công. Mật khẩu mới đã được cập nhật.",
  });
});
