import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập họ tên"),
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
  phone: z.string().trim().nullable().optional(),
  role: z.nativeEnum(Role).default(Role.FIELD_TECH),
  region: z.string().trim().nullable().optional(),
  skills: z.array(z.string().trim()).optional().default([]),
  isActive: z.boolean().optional().default(true),
});

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("user:view");
  if (s instanceof NextResponse) return s;

  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;
  const role = sp.get("role");
  const isActive = sp.get("isActive");

  const where = {
    ...(role && role in Role ? { role: role as Role } : {}),
    ...(isActive === "true" ? { isActive: true } : isActive === "false" ? { isActive: false } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
            { region: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        region: true,
        skills: true,
        createdAt: true,
        _count: { select: { assignedTickets: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("user:manage");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, userCreateSchema);
  if (r.error) return r.error;

  const passwordHash = await bcrypt.hash(r.data.password, 10);
  const created = await prisma.user.create({
    data: {
      name: r.data.name,
      email: r.data.email.toLowerCase(),
      password: passwordHash,
      phone: r.data.phone || null,
      role: r.data.role,
      region: r.data.region || null,
      skills: r.data.skills,
      isActive: r.data.isActive,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      isActive: true,
      region: true,
      skills: true,
      createdAt: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "USER_CREATE",
      entity: "User",
      entityId: created.id,
      meta: { email: created.email, role: created.role },
    },
  });

  return NextResponse.json(created, { status: 201 });
});
