import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const userPatchSchema = z
  .object({
    name: z.string().trim().min(1),
    email: z.string().trim().email(),
    password: z.string().min(6).optional(),
    phone: z.string().trim().nullable(),
    role: z.nativeEnum(Role),
    region: z.string().trim().nullable(),
    skills: z.array(z.string().trim()),
    isActive: z.boolean(),
  })
  .partial();

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await requirePermission("user:manage");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const r = await parseBody(req, userPatchSchema);
  if (r.error) return r.error;

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Không tìm thấy người dùng" }, { status: 404 });
  }

  // RULE: Chỉ có tài khoản Giám đốc (SUPER_ADMIN) mới có quyền chỉnh sửa tài khoản Giám đốc
  if (targetUser.role === Role.SUPER_ADMIN && s.role !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      { error: "Tài khoản Giám đốc (Super Admin) là tài khoản cao nhất. Chỉ Giám đốc mới có quyền chỉnh sửa tài khoản này." },
      { status: 403 }
    );
  }

  // RULE: Không thể khóa / vô hiệu hóa tài khoản Giám đốc (SUPER_ADMIN)
  if (targetUser.role === Role.SUPER_ADMIN && r.data.isActive === false) {
    return NextResponse.json(
      { error: "Tài khoản Giám đốc (Super Admin) là tài khoản tối cao của hệ thống, không thể khóa." },
      { status: 400 }
    );
  }

  // RULE: Không thể thay đổi vai trò của tài khoản Giám đốc (đảm bảo luôn duy trì 1 SUPER_ADMIN)
  if (targetUser.role === Role.SUPER_ADMIN && r.data.role && r.data.role !== Role.SUPER_ADMIN) {
    return NextResponse.json(
      { error: "Không thể thay đổi vai trò của tài khoản Giám đốc (Super Admin)." },
      { status: 400 }
    );
  }

  // RULE: Không thể nâng cấp người dùng khác thành SUPER_ADMIN nếu đã có 1 SUPER_ADMIN
  if (r.data.role === Role.SUPER_ADMIN && targetUser.role !== Role.SUPER_ADMIN) {
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: Role.SUPER_ADMIN, id: { not: id } },
      select: { id: true, name: true, email: true },
    });
    if (existingSuperAdmin) {
      return NextResponse.json(
        {
          error: `Hệ thống chỉ cho phép duy nhất 1 tài khoản Giám đốc (Super Admin). Hiện tại tài khoản này là ${existingSuperAdmin.name} (${existingSuperAdmin.email}).`,
        },
        { status: 400 }
      );
    }
  }

  if (id === s.userId && r.data.isActive === false) {
    return NextResponse.json({ error: "Không thể tự khóa tài khoản của chính mình" }, { status: 400 });
  }

  const { password, email, ...rest } = r.data;
  const dataToUpdate: Record<string, unknown> = { ...rest };
  if (email) dataToUpdate.email = email.toLowerCase();
  if (password) dataToUpdate.password = await bcrypt.hash(password, 10);

  const updated = await prisma.user.update({
    where: { id },
    data: dataToUpdate,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      region: true,
      skills: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "USER_UPDATE",
      entity: "User",
      entityId: id,
      meta: { role: updated.role, isActive: updated.isActive },
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await requirePermission("user:manage");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  if (id === s.userId) {
    return NextResponse.json({ error: "Không thể tự xóa tài khoản của chính mình" }, { status: 400 });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "Không tìm thấy người dùng để xóa" }, { status: 404 });
  }

  // RULE: Tài khoản Giám đốc (SUPER_ADMIN) là tài khoản cao nhất không thể xóa
  if (targetUser.role === Role.SUPER_ADMIN) {
    return NextResponse.json(
      { error: "Tài khoản Giám đốc (Super Admin) là tài khoản tối cao của hệ thống, không thể xóa." },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: s.userId, action: "USER_DELETE", entity: "User", entityId: id },
  });

  return NextResponse.json({ ok: true });
});
