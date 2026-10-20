import { NextResponse } from "next/server";
import { z } from "zod";
import { EquipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parseBody, withErrors } from "@/lib/http";
import { validateContractOwner } from "@/lib/equipment";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    model: z.string().trim().min(1),
    brand: z.string().trim().nullable(),
    specs: z.record(z.string(), z.unknown()).nullable(),
    customerId: z.string().min(1).nullable(),
    contractId: z.string().min(1).nullable(),
    departmentId: z.string().min(1).nullable(),
    locationNote: z.string().trim().nullable(),
    status: z.nativeEnum(EquipmentStatus),
    healthScore: z.coerce.number().int().min(0).max(100),
    baseQuota: z.coerce.number().int().nonnegative().nullable(),
    overagePrice: z.coerce.number().nonnegative().nullable(),
    installedAt: z.coerce.date().nullable(),
    statusNote: z.string().trim(),
  })
  .partial();

export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "equipment:read")) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    include: {
      customer: true,
      contract: true,
      department: { include: { building: { include: { branch: true } } } },
      statusHistory: { orderBy: { changedAt: "desc" } },
      meterLogs: { orderBy: { logDate: "desc" }, take: 20 },
      partHistory: { include: { part: true }, orderBy: { replacedAt: "desc" } },
      tickets: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!equipment) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });
  // Phạm vi xem theo vai trò (PRD 3.2): Kế toán không cần chi tiết kỹ thuật; kỹ thuật viên chỉ xem lịch sử sửa chữa.
  if (s.role === "FIELD_TECH") {
    return NextResponse.json({ ...equipment, contract: null, meterLogs: [] });
  }
  return NextResponse.json(equipment);
});

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "equipment:write")) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const r = await parseBody(req, patchSchema);
  if (r.error) return r.error;
  const { id } = await params;
  const current = await prisma.equipment.findUnique({ where: { id } });
  if (!current) return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });

  const { statusNote, specs, status, ...rest } = r.data;
  const customerId = rest.customerId !== undefined ? rest.customerId : current.customerId;
  const contractId = rest.contractId !== undefined ? rest.contractId : current.contractId;
  // Đổi khách hàng mà giữ hợp đồng cũ -> sai quan hệ
  const err = await validateContractOwner(customerId, contractId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const statusChanged = status !== undefined && status !== current.status;
  const equipment = await prisma.$transaction(async (tx) => {
    const updated = await tx.equipment.update({
      where: { id },
      data: {
        ...rest,
        ...(status ? { status } : {}),
        ...(specs !== undefined ? { specs: specs === null ? undefined : (specs as object) } : {}),
        ...(statusChanged && status === "SCRAPPED" ? { scrappedAt: new Date() } : {}),
      },
    });
    if (statusChanged) {
      await tx.equipmentStatusHistory.create({
        data: { equipmentId: id, fromStatus: current.status, toStatus: status!, note: statusNote },
      });
    }
    await tx.auditLog.create({ data: { userId: s.userId, action: "EQUIPMENT_UPDATE", entity: "Equipment", entityId: id } });
    return updated;
  });
  return NextResponse.json(equipment);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "equipment:write")) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;

  const [ticketCount, partCount] = await Promise.all([
    prisma.ticket.count({ where: { equipmentId: id } }),
    prisma.partReplacement.count({ where: { equipmentId: id } }),
  ]);
  if (ticketCount > 0 || partCount > 0) {
    return NextResponse.json(
      { error: `Thiết bị đã có ${ticketCount} phiếu sự cố / lịch sử thay vật tư, không thể xóa. Hãy chuyển trạng thái sang Thanh lý (SCRAPPED).` },
      { status: 409 },
    );
  }

  await prisma.$transaction([
    prisma.equipmentStatusHistory.deleteMany({ where: { equipmentId: id } }),
    prisma.maintenanceSchedule.deleteMany({ where: { equipmentId: id } }),
    prisma.meterLog.deleteMany({ where: { equipmentId: id } }),
    prisma.equipment.delete({ where: { id } }),
  ]);
  await prisma.auditLog.create({
    data: { userId: s.userId, action: "EQUIPMENT_DELETE", entity: "Equipment", entityId: id },
  });
  return NextResponse.json({ ok: true });
});
