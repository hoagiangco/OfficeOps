import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserPermissions } from "@/lib/rbacService";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      region: true,
      skills: true,
      isActive: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Tài khoản không tồn tại" }, { status: 404 });
  }

  const userPerms = await getUserPermissions(user.id);

  return NextResponse.json({
    userId: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    region: user.region,
    skills: user.skills,
    isActive: user.isActive,
    permissions: userPerms.permissions,
  });
}
