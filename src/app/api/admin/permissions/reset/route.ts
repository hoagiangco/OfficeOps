import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";
import { resetUserPermissionsToRole } from "@/lib/rbacService";
import { prisma } from "@/lib/prisma";

const resetSchema = z.object({
  userId: z.string().min(1, "Thiếu ID người dùng"),
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("user:permission-manage");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, resetSchema);
  if (r.error) return r.error;

  const target = await prisma.user.findUnique({
    where: { id: r.data.userId },
    select: { role: true },
  });
  if (target?.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: "Tài khoản Giám đốc (Super Admin) luôn có toàn quyền cố định, không thể khôi phục phân quyền." },
      { status: 400 }
    );
  }

  const permissions = await resetUserPermissionsToRole(r.data.userId, s.userId);

  return NextResponse.json({
    success: true,
    message: "Đã khôi phục phân quyền người dùng về mặc định theo vai trò",
    permissions,
  });
});
