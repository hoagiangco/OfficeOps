import { NextResponse } from "next/server";
import { z } from "zod";
import { EquipmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { validateContractOwner } from "@/lib/equipment";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const equipmentSchema = z.object({
  serialNumber: z.string().trim().min(1),
  model: z.string().trim().min(1),
  brand: z.string().trim().optional(),
  specs: z.record(z.string(), z.unknown()).optional(),
  customerId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  departmentId: z.string().min(1).optional(),
  locationNote: z.string().trim().optional(),
  status: z.nativeEnum(EquipmentStatus).optional(),
  baseQuota: z.coerce.number().int().nonnegative().optional(),
  overagePrice: z.coerce.number().nonnegative().optional(),
  importedAt: z.coerce.date().optional(),
  installedAt: z.coerce.date().optional(),
});

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;
  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const customerId = sp.get("customerId");
  const qr = sp.get("qr"); // tra cứu nhanh theo mã QR
  const where = {
    ...(status && status in EquipmentStatus ? { status: status as EquipmentStatus } : {}),
    ...(customerId ? { customerId } : {}),
    ...(qr ? { qrCode: qr } : {}),
    ...(q
      ? {
          OR: [
            { serialNumber: { contains: q, mode: "insensitive" as const } },
            { model: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.equipment.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true } },
        contract: { select: { id: true, code: true } },
        department: {
          select: {
            id: true,
            name: true,
            building: { select: { name: true, branch: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.equipment.count({ where }),
  ]);
  return NextResponse.json({ items, total, page, pageSize });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;
  const r = await parseBody(req, equipmentSchema);
  if (r.error) return r.error;
  const { specs, ...rest } = r.data;
  const err = await validateContractOwner(rest.customerId, rest.contractId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const equipment = await prisma.equipment.create({
    data: { ...rest, ...(specs ? { specs: specs as object } : {}), importedAt: rest.importedAt ?? new Date() },
  });
  await prisma.equipmentStatusHistory.create({
    data: { equipmentId: equipment.id, toStatus: equipment.status, note: "Khởi tạo hồ sơ" },
  });
  await prisma.auditLog.create({ data: { userId: s.userId, action: "EQUIPMENT_CREATE", entity: "Equipment", entityId: equipment.id } });
  return NextResponse.json(equipment, { status: 201 });
});
