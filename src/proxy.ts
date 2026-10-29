import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

const isPublicPath = (pathname: string) => {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/forgot-password" ||
    pathname === "/api/auth/reset-password" ||
    pathname === "/reset-password" ||
    pathname.startsWith("/scan") ||
    pathname.startsWith("/api/scan") ||
    pathname.startsWith("/api/cron") ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/manifest.json"
  );
};

// Kiểm tra xác thực phiên đăng nhập qua cookie; quyền chi tiết từng user được kiểm tra theo DB (getUserPermissions / requirePermission).
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) return NextResponse.next();

  const session = await decrypt(request.cookies.get(SESSION_COOKIE)?.value);
  const isApi = pathname.startsWith("/api/");

  if (!session) {
    if (isApi) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
