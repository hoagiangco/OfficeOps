import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1),
    taxCode: z.string().trim().nullable(),
    phone: z.string().trim().min(1),
    email: z.string().trim().email().nullable(),
    zaloId: z.string().trim().nullable(),
    address: z.string().trim().min(1),
  })
  .partial();

// Điều phối viên chỉ được sửa thông tin liên hệ (PRD: "Xem + sửa liên hệ")
const DISPATCHER_FIELDS = ["phone", "email", "zaloId"];

export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "customer:read")) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      branches: { include: { buildings: { include: { departments: true } } } },
      _count: { select: { equipment: true, contracts: true, tickets: true } },
    },
  });
  if (!customer) return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
  return NextResponse.json(customer);
});

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const full = can(s.role, "customer:write");
  if (!full && s.role !== "DISPATCHER") return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const r = await parseBody(req, patchSchema);
  if (r.error) return r.error;
  if (!full && Object.keys(r.data).some((k) => !DISPATCHER_FIELDS.includes(k))) {
    return NextResponse.json({ error: "Chỉ được sửa thông tin liên hệ" }, { status: 403 });
  }
  const { id } = await params;
  const customer = await prisma.customer.update({ where: { id }, data: r.data });
  await prisma.auditLog.create({ data: { userId: s.userId, action: "CUSTOMER_UPDATE", entity: "Customer", entityId: id } });
  return NextResponse.json(customer);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "customer:write")) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;
  // Khách hàng đã có hợp đồng/thiết bị/phiếu thì không xóa (P2003 -> 409)
  await prisma.customer.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: s.userId, action: "CUSTOMER_DELETE", entity: "Customer", entityId: id } });
  return NextResponse.json({ ok: true });
});
