import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, requirePermission, audit } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors, HttpError } from "@/lib/http";
import { getSlaSettings, computeSlaDueAt } from "@/lib/slaSettings";
import {
  getTicketCustomTypesMap,
  isSystemTicketType,
  setTicketCustomTypeForTicket,
  toPrismaTicketType,
} from "@/lib/ticketWorkTypes";
import {
  enrichTicketsWithEquipmentList,
  findMappedTicketIdsForEquipment,
  getTicketEquipmentTasksMap,
  getTicketEquipmentsMap,
  setTicketEquipmentIds,
  setTicketEquipmentTasks,
  type TicketEquipmentTask,
} from "@/lib/ticketEquipments";
import type { EquipmentStatus, TicketPriority, TicketSource, TicketStatus } from "@prisma/client";

const createSchema = z.object({
  customerId: z.string().min(1, "Vui lòng chọn khách hàng"),
  equipmentId: z.string().trim().optional().nullable(),
  equipmentIds: z.array(z.string().trim()).optional(),
  equipmentTasks: z
    .array(
      z.object({
        equipmentId: z.string().trim().min(1),
        workType: z.string().trim().optional(),
        note: z.string().optional(),
        counter: z.number().int().min(0).optional().nullable(),
      })
    )
    .optional(),
  equipmentStatus: z
    .enum(["ACTIVE", "FAULTY", "WAITING_PARTS", "RECALLED", "IN_STOCK", "SCRAPPED"])
    .optional()
    .nullable(),
  assigneeId: z.string().optional().nullable(),
  type: z.string().trim().min(1, "Vui lòng chọn loại công việc").default("REPAIR"),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  source: z.enum(["CUSTOMER", "SCHEDULED", "INTERNAL"]).default("CUSTOMER"),
  description: z.string().min(3, "Mô tả sự cố/yêu cầu tối thiểu 3 ký tự"),
  slaDueAt: z.string().datetime().optional().nullable(),
  createdAt: z.string().optional().nullable(),
});

export const GET = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as TicketStatus | null;
  const priority = sp.get("priority") as TicketPriority | null;
  const type = sp.get("type")?.trim() || null;
  const assigneeId = sp.get("assigneeId");
  const customerId = sp.get("customerId");
  const equipmentId = sp.get("equipmentId");
  const q = sp.get("q")?.trim();

  // Kỹ thuật viên (FIELD_TECH) chỉ được xem các phiếu do mình được phân công trừ khi có quyền điều phối
  const canDispatch =
    (await checkUserPermission(session.userId, session.role, "ticket:assign")) ||
    (await checkUserPermission(session.userId, session.role, "ticket:dispatch-map"));
  const isFieldTech = session.role === "FIELD_TECH" && !canDispatch;
  const effectiveAssigneeId = isFieldTech ? session.userId : assigneeId;

  const [customTypeMap, equipMap, tasksMap] = await Promise.all([
    getTicketCustomTypesMap(),
    getTicketEquipmentsMap(),
    getTicketEquipmentTasksMap(),
  ]);

  const mappedTicketIdsForEquip = equipmentId
    ? findMappedTicketIdsForEquipment(equipmentId, equipMap)
    : [];

  const tickets = await prisma.ticket.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(effectiveAssigneeId === "UNASSIGNED"
        ? { assigneeId: null }
        : effectiveAssigneeId
        ? { assigneeId: effectiveAssigneeId }
        : {}),
      ...(customerId ? { customerId } : {}),
      ...(equipmentId
        ? {
            OR: [
              { equipmentId },
              ...(mappedTicketIdsForEquip.length > 0
                ? [{ id: { in: mappedTicketIdsForEquip } }]
                : []),
            ],
          }
        : {}),
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
  const sanitizeSignature = (sig?: string | null) => {
    if (!sig) return null;
    if (sig.includes("[DEMO_SIGNATURE]") || sig.includes("...")) return null;
    return sig;
  };

  const baseItems = tickets
    .map((t) => ({
      ...t,
      type: customTypeMap[t.id] || t.type,
      customerSignature: sanitizeSignature(t.customerSignature),
      customer: t.customer ? maskCustomerPhones(t.customer, canViewPhone) : t.customer,
    }))
    .filter((t) => {
      if (!type) return true;
      if (t.type === type) return true;
      const perEquipTasks = tasksMap[t.id];
      if (perEquipTasks && Object.values(perEquipTasks).some((item) => item.workType === type)) {
        return true;
      }
      return false;
    });

  const enrichedItems = await enrichTicketsWithEquipmentList(baseItems, equipMap, tasksMap);

  return NextResponse.json(enrichedItems);
});

export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("ticket:create");
  if (session instanceof NextResponse) return session;
  const parsed = await parseBody(req, createSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  // Chuẩn hóa danh sách máy được chọn (hỗ trợ cả chọn 1 máy hoặc nhiều máy trên 1 phiếu)
  const rawEquipIds =
    Array.isArray(data.equipmentIds) && data.equipmentIds.length > 0
      ? data.equipmentIds
      : data.equipmentId
      ? [data.equipmentId]
      : [];
  const selectedEquipmentIds = Array.from(
    new Set(rawEquipIds.filter((id) => typeof id === "string" && id.trim().length > 0).map((s) => s.trim()))
  );
  const primaryEquipmentId = selectedEquipmentIds[0] || null;

  const selectedEquipments =
    selectedEquipmentIds.length > 0
      ? await prisma.equipment.findMany({
          where: { id: { in: selectedEquipmentIds } },
        })
      : [];

  if (selectedEquipmentIds.length > 0 && selectedEquipments.length === 0) {
    throw new HttpError(404, "Không tìm thấy thiết bị đã chọn");
  }

  // Chuẩn hóa danh sách công việc riêng cho từng máy (equipmentTasks)
  const rawTaskMap = new Map<string, { workType?: string; note?: string; counter?: number | null }>();
  if (Array.isArray(data.equipmentTasks)) {
    for (const item of data.equipmentTasks) {
      if (item && item.equipmentId) {
        rawTaskMap.set(item.equipmentId.trim(), item);
      }
    }
  }
  const normalizedTasks: TicketEquipmentTask[] = selectedEquipmentIds.map((eqId) => {
    const raw = rawTaskMap.get(eqId);
    const workType = raw?.workType?.trim() || data.type || "REPAIR";
    const note = raw?.note?.trim() || "";
    const counter =
      typeof raw?.counter === "number" && Number.isFinite(raw.counter) && raw.counter >= 0
        ? Math.round(raw.counter)
        : null;
    return {
      equipmentId: eqId,
      workType,
      ...(note ? { note } : {}),
      ...(counter !== null ? { counter } : {}),
    };
  });

  // Nếu máy đầu tiên có chọn loại công việc riêng thì ưu tiên đồng bộ làm loại công việc chính của phiếu
  const effectivePrimaryType = normalizedTasks[0]?.workType || data.type || "REPAIR";

  let customCreatedAt: Date | undefined = undefined;
  if (data.createdAt) {
    const now = new Date();
    if (/^\d{4}-\d{2}-\d{2}$/.test(data.createdAt.trim())) {
      const [y, m, d] = data.createdAt.trim().split("-").map(Number);
      customCreatedAt = new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
    } else {
      const parsedDate = new Date(data.createdAt);
      if (!isNaN(parsedDate.getTime())) {
        customCreatedAt = parsedDate;
      }
    }
  }

  const baseDate = customCreatedAt || new Date();
  const year = baseDate.getFullYear();
  const countThisYear = await prisma.ticket.count({
    where: { code: { startsWith: `TK-${year}-` } },
  });
  let seq = countThisYear + 1;
  let code = `TK-${year}-${String(seq).padStart(4, "0")}`;
  while (await prisma.ticket.findUnique({ where: { code }, select: { id: true } })) {
    seq++;
    code = `TK-${year}-${String(seq).padStart(4, "0")}`;
  }

  // Kiểm tra quyền phân công kỹ thuật viên
  const canAssign = await checkUserPermission(session.userId, session.role, "ticket:assign");
  const finalAssigneeId = canAssign ? (data.assigneeId || null) : null;
  const initialStatus: TicketStatus = finalAssigneeId ? "ASSIGNED" : "PENDING";
  const slaSettings = await getSlaSettings();
  const slaDueAt = data.slaDueAt
    ? new Date(data.slaDueAt)
    : computeSlaDueAt(data.priority as TicketPriority, slaSettings, baseDate);

  const created = await prisma.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        code,
        customerId: data.customerId,
        equipmentId: primaryEquipmentId,
        assigneeId: finalAssigneeId,
        creatorId: session.userId,
        type: toPrismaTicketType(effectivePrimaryType),
        status: initialStatus,
        priority: data.priority as TicketPriority,
        source: data.source as TicketSource,
        description: data.description,
        slaDueAt,
        ...(customCreatedAt ? { createdAt: customCreatedAt } : {}),
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
          ? `Tạo phiếu${selectedEquipmentIds.length > 1 ? ` (${selectedEquipmentIds.length} máy)` : ""} và giao cho KTV ${ticket.assignee?.name ?? ""}`
          : `Khởi tạo phiếu kỹ thuật mới${selectedEquipmentIds.length > 1 ? ` (${selectedEquipmentIds.length} máy)` : ""}`,
        ...(customCreatedAt ? { createdAt: customCreatedAt } : {}),
      },
    });

    // Ghi nhận Counter riêng cho từng máy nếu người lập phiếu có nhập sẵn chỉ số Counter
    for (const task of normalizedTasks) {
      if (typeof task.counter === "number" && task.counter > 0) {
        const eqObj = selectedEquipments.find((e) => e.id === task.equipmentId);
        if (eqObj) {
          const isLower = task.counter < eqObj.currentCounter;
          await tx.meterLog.create({
            data: {
              equipmentId: eqObj.id,
              ticketId: ticket.id,
              recordedById: session.userId,
              counterValue: task.counter,
              source: "MANUAL",
              status: isLower ? "PENDING_APPROVAL" : "APPROVED",
              adjustmentReason: isLower ? `Ghi nhận từ phiếu ${code}` : null,
              ...(customCreatedAt ? { logDate: customCreatedAt } : {}),
            },
          });
          if (!isLower && task.counter !== eqObj.currentCounter) {
            await tx.equipment.update({
              where: { id: eqObj.id },
              data: { currentCounter: task.counter },
            });
          }
        }
      }
    }

    // Cập nhật trạng thái máy nếu người dùng chủ động lựa chọn (gợi ý trong form, không tự động áp đặt)
    if (data.equipmentStatus && selectedEquipments.length > 0) {
      for (const eq of selectedEquipments) {
        if (eq.status !== data.equipmentStatus) {
          const task = normalizedTasks.find((t) => t.equipmentId === eq.id);
          await tx.equipment.update({
            where: { id: eq.id },
            data: { status: data.equipmentStatus as EquipmentStatus },
          });
          await tx.equipmentStatusHistory.create({
            data: {
              equipmentId: eq.id,
              fromStatus: eq.status,
              toStatus: data.equipmentStatus as EquipmentStatus,
              note: `Cập nhật trạng thái theo lựa chọn khi tạo phiếu ${code}${task?.note ? ` (${task.note})` : ""}`,
            },
          });
        }
      }
    }

    if (data.assigneeId) {
      const equipmentInfo =
        selectedEquipments.length > 1
          ? `${selectedEquipments.length} máy (${selectedEquipments
              .slice(0, 2)
              .map((m) => m.model)
              .join(", ")}${selectedEquipments.length > 2 ? "..." : ""})`
          : ticket.equipment
          ? `Máy ${ticket.equipment.model} (${ticket.equipment.serialNumber})`
          : "Phiếu dịch vụ";
      await tx.notification.create({
        data: {
          userId: data.assigneeId,
          channel: "IN_APP",
          title: `Phiếu kỹ thuật mới: ${code}`,
          body: `${ticket.customer.name} - ${equipmentInfo}: ${data.description}`,
          sentAt: new Date(),
        },
      });
    }

    return ticket;
  });

  await Promise.all([
    setTicketCustomTypeForTicket(created.id, effectivePrimaryType),
    setTicketEquipmentIds(created.id, selectedEquipmentIds),
    setTicketEquipmentTasks(created.id, normalizedTasks, selectedEquipmentIds),
  ]);

  const [enrichedCreated] = await enrichTicketsWithEquipmentList([
    { ...created, type: effectivePrimaryType },
  ]);

  await audit(session.userId, "TICKET_CREATE", "Ticket", created.id, {
    code: created.code,
    type: effectivePrimaryType,
    priority: created.priority,
    assigneeId: created.assigneeId,
    equipmentCount: selectedEquipmentIds.length,
  });

  return NextResponse.json(enrichedCreated || { ...created, type: effectivePrimaryType }, { status: 201 });
});
