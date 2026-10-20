import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const customerSchema = z.object({
  name: z.string().trim().min(1),
  taxCode: z.string().trim().optional(),
  phone: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  zaloId: z.string().trim().optional(),
  address: z.string().trim().min(1),
});

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("customer:read");
  if (s instanceof NextResponse) return s;
  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const where = q
    ? {
        OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { taxCode: { contains: q } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: { _count: { select: { equipment: true, contracts: true, branches: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("customer:write");
  if (s instanceof NextResponse) return s;
  const r = await parseBody(req, customerSchema);
  if (r.error) return r.error;
  const customer = await prisma.customer.create({ data: r.data });
  await prisma.auditLog.create({ data: { userId: s.userId, action: "CUSTOMER_CREATE", entity: "Customer", entityId: customer.id } });
  return NextResponse.json(customer, { status: 201 });
});
