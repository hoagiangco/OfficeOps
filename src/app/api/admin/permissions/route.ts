import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS } from "@/lib/rbac";
import {
  getAllUsersPermissionsSummary,
  getUserPermissions,
  updateUserPermissions,
} from "@/lib/rbacService";
import { PERMISSION_MODULES, ALL_PERMISSION_KEYS } from "@/lib/rbacMetadata";

const updateUserPermsSchema = z.object({
  userId: z.string().min(1, "Thiếu ID người dùng"),
  updates: z.array(
    z.object({
      permission: z.string(),
      granted: z.boolean(),
    })
  ),
});

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("user:permission-manage");
  if (s instanceof NextResponse) return s;

  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  // Nếu truyền userId: trả về chi tiết quyền của user đó
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        region: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
    }

    const userPerms = await getUserPermissions(userId);

    return NextResponse.json({
      user: {
        ...user,
        roleLabel: ROLE_LABELS[user.role] || user.role,
        isSuperAdmin: user.role === "SUPER_ADMIN",
      },
      permissions: userPerms.permissions,
      isCustomized: userPerms.isCustomized,
      modules: PERMISSION_MODULES,
      allKeys: ALL_PERMISSION_KEYS,
    });
  }

  // Nếu không truyền userId: trả về danh sách tổng quan tất cả người dùng
  const users = await getAllUsersPermissionsSummary();

  return NextResponse.json({
    users,
    modules: PERMISSION_MODULES,
    allKeys: ALL_PERMISSION_KEYS,
  });
});

export const PUT = withErrors(async (req: Request) => {
  const s = await requirePermission("user:permission-manage");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, updateUserPermsSchema);
  if (r.error) return r.error;

  const updatedPermissions = await updateUserPermissions(
    r.data.userId,
    r.data.updates,
    s.userId
  );

  return NextResponse.json({
    success: true,
    message: "Đã cập nhật phân quyền người dùng thành công",
    permissions: updatedPermissions,
  });
});
