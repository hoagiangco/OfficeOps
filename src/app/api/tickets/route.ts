import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import type { TicketPriority, TicketSource, TicketStatus, TicketType } from "@prisma/client";

const createSchema = z.object({
  customerId: z.string().min(1, "Vui lòng chọn khách hàng"),
  equipmentId: z.string().min(1, "Vui lòng chọn thiết bị"),
  assigneeId: z.string().optional().nullable(),
  type: z.enum(["INSTALLATION", "INSPECTION", "REPAIR", "MAINTENANCE", "OTHER"]).default("REPAIR"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  source: z.enum(["CUSTOMER", "SCHEDULED", "INTERNAL"]).default("CUSTOMER"),
  description: z.string().min(3, "Mô tả sự cố/yêu cầu tối thiểu 3 ký tự"),
});

function computeSlaDueAt(priority: TicketPriority): Date {
  const hoursMap: Record<TicketPriority, number> = {
    URGENT: 4,
    HIGH: 8,
    NORMAL: 24,
    LOW: 48,
  };
  const hours = hoursMap[priority] ?? 24;
  return new Date(Date.now() + hours * 3600 * 1000);
}

export const GET = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as TicketStatus | null;
  const priority = sp.get("priority") as TicketPriority | null;
  const type = sp.get("type") as TicketType | null;
  const assigneeId = sp.get("assigneeId");
  const customerId = sp.get("customerId");
  const equipmentId = sp.get("equipmentId");
  const q = sp.get("q")?.trim();

  // Kỹ thuật viên (FIELD_TECH) chỉ được xem các phiếu do mình được phân công
  const isFieldTech = session.role === "FIELD_TECH";
  const effectiveAssigneeId = isFieldTech ? session.userId : assigneeId;

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(type ? { type } : {}),
      ...(effectiveAssigneeId === "UNASSIGNED"
        ? { assigneeId: null }
        : effectiveAssigneeId
        ? { assigneeId: effectiveAssigneeId }
        : {}),
      ...(customerId ? { customerId } : {}),
      ...(equipmentId ? { equipmentId } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
              { equipment: { serialNumber: { contains: q, mode: "insensitive" } } },
              { equipment: { model: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
          latitude: true,
          longitude: true,
        },
      },
      equipment: {
        select: {
          id: true,
          serialNumber: true,
          model: true,
          brand: true,
          status: true,
          currentCounter: true,
          locationNote: true,
          branch: {
            select: {
              id: true,
              name: true,
              latitude: true,
              longitude: true,
            },
          },
          building: { select: { id: true, name: true, branch: { select: { name: true } } } },
          department: {
            include: {
              building: {
                include: { branch: true },
              },
            },
          },
        },
      },
      assignee: { select: { id: true, name: true, phone: true, region: true, skills: true } },
      creator: { select: { id: true, name: true } },
      _count: { select: { stockIssues: true, logs: true, partsUsed: true } },
      attachments: {
        select: { id: true, url: true, kind: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const canViewPhone = await checkUserPermission(session.userId, session.role, "customer:view-phone");
  const items = canViewPhone
    ? tickets
    : tickets.map((t) => ({
        ...t,
        customer: t.customer ? maskCustomerPhones(t.customer, false) : t.customer,
      }));

  return NextResponse.json(items);
});

export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("ticket:create");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, createSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const equipment = await prisma.equipment.findUnique({
    where: { id: data.equipmentId },
  });
  if (!equipment) throw new HttpError(404, "Không tìm thấy thiết bị");

  const year = new Date().getFullYear();
  const countThisYear = await prisma.ticket.count({
    where: { code: { startsWith: `TK-${year}-` } },
  });
  const code = `TK-${year}-${String(countThisYear + 1).padStart(4, "0")}`;

  // Kỹ thuật viên không có quyền giao việc
  const canAssign = session.role === "SUPER_ADMIN" || session.role === "DISPATCHER";
  const finalAssigneeId = canAssign ? (data.assigneeId || null) : null;
  const initialStatus: TicketStatus = finalAssigneeId ? "ASSIGNED" : "PENDING";
  const slaDueAt = computeSlaDueAt(data.priority as TicketPriority);

  const created = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        code,
        customerId: data.customerId,
        equipmentId: data.equipmentId,
        assigneeId: finalAssigneeId,
        creatorId: session.userId,
        type: data.type as TicketType,
        status: initialStatus,
        priority: data.priority as TicketPriority,
        source: data.source as TicketSource,
        description: data.description,
        slaDueAt,
      },
      include: {
        customer: { select: { id: true, name: true } },
        equipment: { select: { id: true, serialNumber: true, model: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    await tx.ticketLog.create({
      data: {
        ticketId: ticket.id,
        userId: session.userId,
        fromStatus: null,
        toStatus: initialStatus,
        note: finalAssigneeId
          ? `Tạo phiếu và giao cho KTV ${ticket.assignee?.name ?? ""}`
          : "Khởi tạo phiếu kỹ thuật mới",
      },
    });

    if (data.type === "REPAIR" && equipment.status === "ACTIVE") {
      await tx.equipment.update({
        where: { id: equipment.id },
        data: { status: "FAULTY" },
      });
      await tx.equipmentStatusHistory.create({
        data: {
          equipmentId: equipment.id,
          fromStatus: equipment.status,
          toStatus: "FAULTY",
          note: `Tự động chuyển trạng thái khi tạo phiếu sửa chữa ${code}`,
        },
      });
    }

    if (data.assigneeId) {
      await tx.notification.create({
        data: {
          userId: data.assigneeId,
          channel: "IN_APP",
          title: `Phiếu kỹ thuật mới: ${code}`,
          body: `${ticket.customer.name} - Máy ${ticket.equipment.model} (${ticket.equipment.serialNumber}): ${data.description}`,
          sentAt: new Date(),
        },
      });
    }

    return ticket;
  });

  await audit(session.userId, "TICKET_CREATE", "Ticket", created.id, {
    code: created.code,
    type: created.type,
    priority: created.priority,
    assigneeId: created.assigneeId,
  });

  return NextResponse.json(created, { status: 201 });
});
