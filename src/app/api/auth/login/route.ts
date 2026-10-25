import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { encrypt, cookieOptions, SESSION_COOKIE } from "@/lib/session";
import type { Role } from "@/lib/rbac";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

const WINDOW_MS = 15 * 60 * 1000; // 15 phút
const LOCKOUT_MS = 15 * 60 * 1000; // 15 phút
const MAX_FAILED_ATTEMPTS = 5;

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  // 1. Kiểm tra thời điểm đăng nhập thành công gần nhất để chỉ đếm lỗi phát sinh sau đó
  const lastSuccess = await prisma.loginAttempt.findFirst({
    where: { email: normalizedEmail, success: true },
    orderBy: { createdAt: "desc" },
  });

  const sinceDate = new Date(
    Math.max(Date.now() - WINDOW_MS, lastSuccess?.createdAt?.getTime() || 0)
  );

  // 2. Đếm số lần đăng nhập sai liên tiếp
  const failedAttempts = await prisma.loginAttempt.findMany({
    where: {
      email: normalizedEmail,
      success: false,
      createdAt: { gte: sinceDate },
    },
    orderBy: { createdAt: "desc" },
  });

  if (failedAttempts.length >= MAX_FAILED_ATTEMPTS) {
    const mostRecentFail = failedAttempts[0];
    const elapsed = Date.now() - mostRecentFail.createdAt.getTime();
    if (elapsed < LOCKOUT_MS) {
      const remainingSec = Math.ceil((LOCKOUT_MS - elapsed) / 1000);
      const remainingMin = Math.ceil(remainingSec / 60);

      return NextResponse.json(
        {
          error: `Tài khoản tạm thời bị khóa do nhập sai mật khẩu quá 5 lần. Vui lòng thử lại sau ${remainingMin} phút.`,
          retryAfter: remainingSec,
        },
        {
          status: 429,
          headers: { "Retry-After": remainingSec.toString() },
        }
      );
    }
  }

  // 3. Kiểm tra user trong database
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  const isPasswordValid =
    user && user.isActive ? await bcrypt.compare(password, user.password) : false;

  if (!user || !user.isActive || !isPasswordValid) {
    // Ghi nhận lần thử thất bại
    await prisma.loginAttempt.create({
      data: {
        email: normalizedEmail,
        ipAddress: ip,
        success: false,
      },
    });

    const currentFailedCount = failedAttempts.length + 1;
    const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - currentFailedCount);

    return NextResponse.json(
      {
        error: "Email hoặc mật khẩu không đúng",
        attemptsRemaining: remainingAttempts > 0 ? remainingAttempts : 0,
      },
      { status: 401 }
    );
  }

  // 4. Đăng nhập thành công -> ghi nhận attempt thành công & xóa các attempt thất bại cũ
  await prisma.loginAttempt.create({
    data: {
      email: normalizedEmail,
      ipAddress: ip,
      success: true,
    },
  });

  const token = await encrypt({ userId: user.id, role: user.role as Role, name: user.name });
  await prisma.auditLog.create({
    data: { userId: user.id, action: "LOGIN", entity: "User", entityId: user.id },
  });

  const res = NextResponse.json({ id: user.id, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);
  return res;
}
