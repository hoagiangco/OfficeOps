import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const contractSchema = z
  .object({
    code: z.string().trim().min(1),
    customerId: z.string().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    basePrice: z.coerce.number().nonnegative(),
    baseQuota: z.coerce.number().int().nonnegative(),
    overagePrice: z.coerce.number().nonnegative(),
    billingDay: z.coerce.number().int().min(1).max(28).default(1),
    maintenanceIntervalDays: z.coerce.number().int().positive().optional(),
    note: z.string().trim().optional(),
  })
  .refine((v) => v.endDate > v.startDate, { message: "Ngày kết thúc phải sau ngày bắt đầu", path: ["endDate"] });

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("contract:read");
  if (s instanceof NextResponse) return s;
  const { page, pageSize, q } = parseQuery(req, pagingSchema.extend({ customerId: z.string().optional() }));
  const customerId = new URL(req.url).searchParams.get("customerId") ?? undefined;
  const where = {
    ...(customerId ? { customerId } : {}),
    ...(q ? { code: { contains: q, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: true,
            currentCounter: true,
            baseQuota: true,
            overagePrice: true,
          },
        },
        _count: { select: { equipment: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contract.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("contract:write");
  if (s instanceof NextResponse) return s;
  const r = await parseBody(req, contractSchema);
  if (r.error) return r.error;
  const contract = await prisma.contract.create({ data: r.data });
  await prisma.auditLog.create({ data: { userId: s.userId, action: "CONTRACT_CREATE", entity: "Contract", entityId: contract.id } });
  return NextResponse.json(contract, { status: 201 });
});
