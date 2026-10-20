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

  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: s.userId, action: "USER_DELETE", entity: "User", entityId: id },
  });

  return NextResponse.json({ ok: true });
});
