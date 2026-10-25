import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    basePrice: z.coerce.number().nonnegative(),
    baseQuota: z.coerce.number().int().nonnegative(),
    overagePrice: z.coerce.number().nonnegative(),
    billingDay: z.coerce.number().int().min(1).max(28),
    maintenanceIntervalDays: z.coerce.number().int().positive().nullable(),
    isActive: z.boolean(),
    note: z.string().trim().nullable(),
  })
  .partial();

export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "contract:read"))) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;
  const contract = await prisma.contract.findUnique({
    where: { id },
    include: { customer: true, equipment: { select: { id: true, serialNumber: true, model: true, status: true, baseQuota: true, overagePrice: true } } },
  });
  if (!contract) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });
  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");
  return NextResponse.json({
    ...contract,
    customer: maskCustomerPhones(contract.customer, canViewPhone),
  });
});

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "contract:write"))) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const r = await parseBody(req, patchSchema);
  if (r.error) return r.error;
  const { id } = await params;
  const current = await prisma.contract.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Không tìm thấy hợp đồng" }, { status: 404 });
  const start = r.data.startDate ?? current.startDate;
  const end = r.data.endDate ?? current.endDate;
  if (end <= start) return NextResponse.json({ error: "Ngày kết thúc phải sau ngày bắt đầu" }, { status: 400 });
  const contract = await prisma.contract.update({ where: { id }, data: r.data });
  await prisma.auditLog.create({ data: { userId: s.userId, action: "CONTRACT_UPDATE", entity: "Contract", entityId: id } });
  return NextResponse.json(contract);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "contract:write"))) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;

  const [eqCount, invCount] = await Promise.all([
    prisma.equipment.count({ where: { contractId: id } }),
    prisma.invoice.count({ where: { contractId: id } }),
  ]);
  if (eqCount > 0 || invCount > 0) {
    return NextResponse.json(
      { error: `Hợp đồng đang gắn với ${eqCount} thiết bị và ${invCount} hóa đơn, không thể xóa` },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.maintenanceSchedule.deleteMany({ where: { contractId: id } }),
    prisma.contract.delete({ where: { id } }),
  ]);
  await prisma.auditLog.create({
    data: { userId: s.userId, action: "CONTRACT_DELETE", entity: "Contract", entityId: id },
  });
  return NextResponse.json({ ok: true });
});
