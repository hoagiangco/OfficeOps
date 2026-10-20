import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import type { MeterSource } from "@prisma/client";

const createMeterSchema = z.object({
  equipmentId: z.string().min(1, "Vui lòng chọn thiết bị"),
  counterValue: z.number().int().min(0, "Chỉ số counter không hợp lệ"),
  source: z.enum(["MANUAL", "OCR", "TECH", "CUSTOMER"]).default("MANUAL"),
  photoUrl: z.string().optional().nullable(),
  logDate: z.string().optional(),
});

export const GET = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const sp = new URL(req.url).searchParams;
  const equipmentId = sp.get("equipmentId");
  const customerId = sp.get("customerId");
  const isBilledParam = sp.get("isBilled");

  const logs = await prisma.meterLog.findMany({
    where: {
      ...(equipmentId ? { equipmentId } : {}),
      ...(customerId ? { equipment: { customerId } } : {}),
      ...(isBilledParam === "true"
        ? { isBilled: true }
        : isBilledParam === "false"
        ? { isBilled: false }
        : {}),
    },
    include: {
      equipment: {
        select: {
          id: true,
          serialNumber: true,
          model: true,
          brand: true,
          currentCounter: true,
          baseQuota: true,
          overagePrice: true,
          customer: { select: { id: true, name: true } },
          contract: {
            select: {
              id: true,
              code: true,
              baseQuota: true,
              overagePrice: true,
            },
          },
        },
      },
      recordedBy: { select: { id: true, name: true } },
      ticket: { select: { id: true, code: true } },
      invoiceItem: {
        select: {
          id: true,
          invoice: { select: { id: true, code: true, status: true } },
        },
      },
    },
    orderBy: { logDate: "desc" },
    take: 200,
  });

  return NextResponse.json(logs);
});

export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("meter:record");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, createMeterSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const equipment = await prisma.equipment.findUnique({
    where: { id: data.equipmentId },
  });
  if (!equipment) throw new HttpError(404, "Không tìm thấy thiết bị");

  if (data.counterValue < equipment.currentCounter) {
    throw new HttpError(
      400,
      `Chỉ số counter mới (${data.counterValue.toLocaleString("vi-VN")}) không được nhỏ hơn chỉ số hiện tại (${equipment.currentCounter.toLocaleString("vi-VN")})`
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const log = await tx.meterLog.create({
      data: {
        equipmentId: data.equipmentId,
        recordedById: session.userId,
        counterValue: data.counterValue,
        source: data.source as MeterSource,
        photoUrl: data.photoUrl || null,
        logDate: data.logDate ? new Date(data.logDate) : new Date(),
      },
      include: {
        equipment: {
          select: {
            id: true,
            serialNumber: true,
            model: true,
            customer: { select: { id: true, name: true } },
          },
        },
        recordedBy: { select: { id: true, name: true } },
      },
    });

    await tx.equipment.update({
      where: { id: data.equipmentId },
      data: { currentCounter: data.counterValue },
    });

    return log;
  });

  await audit(session.userId, "METER_RECORD", "MeterLog", created.id, {
    equipmentId: created.equipmentId,
    previousCounter: equipment.currentCounter,
    newCounter: data.counterValue,
    usageDelta: data.counterValue - equipment.currentCounter,
  });

  return NextResponse.json(created, { status: 201 });
});
