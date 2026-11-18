import { prisma } from "@/lib/prisma";

const SETTING_KEY_TICKET_EQUIPMENTS_MAP = "TICKET_EQUIPMENTS_MAP";
const SETTING_KEY_TICKET_EQUIPMENT_TASKS_MAP = "TICKET_EQUIPMENT_TASKS_MAP";

export interface TicketEquipmentTask {
  equipmentId: string;
  workType: string;
  note?: string;
  counter?: number | null;
}

/**
 * Bảng ánh xạ ticketId -> danh sách tất cả equipmentIds được chọn trên phiếu (hỗ trợ nhiều máy trên 1 phiếu máy)
 */
export async function getTicketEquipmentsMap(): Promise<Record<string, string[]>> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_TICKET_EQUIPMENTS_MAP },
    });
    if (!record || !record.value) return {};
    const parsed = JSON.parse(record.value);
    if (!parsed || typeof parsed !== "object") return {};

    const clean: Record<string, string[]> = {};
    for (const [ticketId, val] of Object.entries(parsed)) {
      if (Array.isArray(val)) {
        const ids = Array.from(
          new Set(val.filter((id): id is string => typeof id === "string" && id.trim().length > 0).map((s) => s.trim()))
        );
        if (ids.length > 0) {
          clean[ticketId] = ids;
        }
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export async function saveTicketEquipmentsMap(map: Record<string, string[]>): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_TICKET_EQUIPMENTS_MAP },
    update: { value: JSON.stringify(map) },
    create: {
      key: SETTING_KEY_TICKET_EQUIPMENTS_MAP,
      value: JSON.stringify(map),
    },
  });
}

/**
 * Bảng ánh xạ ticketId -> { [equipmentId]: TicketEquipmentTask }
 * Lưu loại công việc riêng, ghi chú công việc riêng và counter riêng cho từng thiết bị trên phiếu
 */
export async function getTicketEquipmentTasksMap(): Promise<
  Record<string, Record<string, TicketEquipmentTask>>
> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_TICKET_EQUIPMENT_TASKS_MAP },
    });
    if (!record || !record.value) return {};
    const parsed = JSON.parse(record.value);
    if (!parsed || typeof parsed !== "object") return {};

    const clean: Record<string, Record<string, TicketEquipmentTask>> = {};
    for (const [ticketId, taskObj] of Object.entries(parsed)) {
      if (taskObj && typeof taskObj === "object" && !Array.isArray(taskObj)) {
        const perEquip: Record<string, TicketEquipmentTask> = {};
        for (const [eqId, rawTask] of Object.entries(taskObj as Record<string, unknown>)) {
          if (rawTask && typeof rawTask === "object") {
            const t = rawTask as Record<string, unknown>;
            const workType = typeof t.workType === "string" && t.workType.trim() ? t.workType.trim() : "REPAIR";
            const note = typeof t.note === "string" ? t.note.trim() : "";
            const counter =
              typeof t.counter === "number" && Number.isFinite(t.counter) && t.counter >= 0
                ? Math.round(t.counter)
                : null;
            perEquip[eqId] = {
              equipmentId: eqId,
              workType,
              ...(note ? { note } : {}),
              ...(counter !== null ? { counter } : {}),
            };
          }
        }
        if (Object.keys(perEquip).length > 0) {
          clean[ticketId] = perEquip;
        }
      }
    }
    return clean;
  } catch {
    return {};
  }
}

export async function saveTicketEquipmentTasksMap(
  map: Record<string, Record<string, TicketEquipmentTask>>
): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_TICKET_EQUIPMENT_TASKS_MAP },
    update: { value: JSON.stringify(map) },
    create: {
      key: SETTING_KEY_TICKET_EQUIPMENT_TASKS_MAP,
      value: JSON.stringify(map),
    },
  });
}

/**
 * Lưu chi tiết công việc riêng (workType, note, counter) cho từng thiết bị trên 1 phiếu
 */
export async function setTicketEquipmentTasks(
  ticketId: string,
  tasks: TicketEquipmentTask[],
  validEquipmentIds?: string[]
): Promise<Record<string, TicketEquipmentTask>> {
  const map = await getTicketEquipmentTasksMap();
  const validSet = validEquipmentIds ? new Set(validEquipmentIds) : null;

  const perEquip: Record<string, TicketEquipmentTask> = {};
  for (const item of tasks) {
    if (!item || typeof item.equipmentId !== "string") continue;
    const eqId = item.equipmentId.trim();
    if (!eqId) continue;
    if (validSet && !validSet.has(eqId)) continue;

    const workType = typeof item.workType === "string" && item.workType.trim() ? item.workType.trim() : "REPAIR";
    const note = typeof item.note === "string" ? item.note.trim() : "";
    const counter =
      typeof item.counter === "number" && Number.isFinite(item.counter) && item.counter >= 0
        ? Math.round(item.counter)
        : null;

    perEquip[eqId] = {
      equipmentId: eqId,
      workType,
      ...(note ? { note } : {}),
      ...(counter !== null ? { counter } : {}),
    };
  }

  if (Object.keys(perEquip).length === 0) {
    if (map[ticketId]) {
      delete map[ticketId];
      await saveTicketEquipmentTasksMap(map);
    }
    return {};
  }

  map[ticketId] = perEquip;
  await saveTicketEquipmentTasksMap(map);
  return perEquip;
}

/**
 * Lưu danh sách equipmentIds cho 1 phiếu kỹ thuật
 */
export async function setTicketEquipmentIds(ticketId: string, equipmentIds: string[]): Promise<string[]> {
  const uniqueIds = Array.from(
    new Set(equipmentIds.filter((id) => typeof id === "string" && id.trim().length > 0).map((id) => id.trim()))
  );
  const map = await getTicketEquipmentsMap();
  if (uniqueIds.length === 0) {
    if (map[ticketId]) {
      delete map[ticketId];
      await saveTicketEquipmentsMap(map);
    }
    return [];
  }
  map[ticketId] = uniqueIds;
  await saveTicketEquipmentsMap(map);
  return uniqueIds;
}

/**
 * Xóa ánh xạ thiết bị & công việc từng máy khi xóa phiếu
 */
export async function removeTicketEquipmentIds(ticketId: string): Promise<void> {
  const [map, tasksMap] = await Promise.all([
    getTicketEquipmentsMap(),
    getTicketEquipmentTasksMap(),
  ]);
  const promises: Promise<void>[] = [];
  if (map[ticketId]) {
    delete map[ticketId];
    promises.push(saveTicketEquipmentsMap(map));
  }
  if (tasksMap[ticketId]) {
    delete tasksMap[ticketId];
    promises.push(saveTicketEquipmentTasksMap(tasksMap));
  }
  if (promises.length > 0) {
    await Promise.all(promises);
  }
}

/**
 * Lấy danh sách equipmentIds thực tế của 1 phiếu (kết hợp cả cột equipmentId chính và danh sách mở rộng)
 */
export function getEffectiveEquipmentIds(
  ticket: { id: string; equipmentId?: string | null },
  map: Record<string, string[]>
): string[] {
  const mapped = map[ticket.id] || [];
  const primary = ticket.equipmentId ? [ticket.equipmentId] : [];
  return Array.from(new Set([...primary, ...mapped]));
}

/**
 * Tìm tất cả ticketId có chứa equipmentId trong bảng ánh xạ nhiều máy
 */
export function findMappedTicketIdsForEquipment(
  equipmentId: string,
  map: Record<string, string[]>
): string[] {
  const matched: string[] = [];
  for (const [ticketId, equipIds] of Object.entries(map)) {
    if (Array.isArray(equipIds) && equipIds.includes(equipmentId)) {
      matched.push(ticketId);
    }
  }
  return matched;
}

/**
 * Kiểm tra xem một thiết bị có còn nằm trong phiếu kỹ thuật đang mở nào khác hay không
 * (Bao gồm cả trường hợp là máy chính equipmentId hoặc máy phụ trong phiếu nhiều máy)
 */
export async function countOtherOpenTicketsForEquipment(
  equipmentId: string,
  excludeTicketId: string,
  equipMap?: Record<string, string[]>
): Promise<number> {
  const map = equipMap ?? (await getTicketEquipmentsMap());
  const mappedTicketIds = findMappedTicketIdsForEquipment(equipmentId, map).filter(
    (tid) => tid !== excludeTicketId
  );

  return prisma.ticket.count({
    where: {
      id: { not: excludeTicketId },
      status: { in: ["PENDING", "ASSIGNED", "IN_PROGRESS", "WAITING_PARTS"] },
      OR: [
        { equipmentId },
        ...(mappedTicketIds.length > 0 ? [{ id: { in: mappedTicketIds } }] : []),
      ],
    },
  });
}

/**
 * Bổ sung thông tin `equipmentIds`, `equipmentTasks` và `equipmentList` đầy đủ cho danh sách phiếu kỹ thuật
 */
export async function enrichTicketsWithEquipmentList<
  T extends { id: string; type?: string; description?: string; equipmentId?: string | null; equipment?: unknown }
>(
  tickets: T[],
  existingMap?: Record<string, string[]>,
  existingTasksMap?: Record<string, Record<string, TicketEquipmentTask>>
): Promise<
  Array<
    T & {
      equipmentIds: string[];
      equipmentTasks: Record<string, TicketEquipmentTask>;
      equipmentList: unknown[];
    }
  >
> {
  if (tickets.length === 0) return [];
  const [map, tasksMap] = await Promise.all([
    existingMap ? Promise.resolve(existingMap) : getTicketEquipmentsMap(),
    existingTasksMap ? Promise.resolve(existingTasksMap) : getTicketEquipmentTasksMap(),
  ]);

  // Thu thập toàn bộ equipmentId cần truy vấn chi tiết
  const allNeededEquipIds = new Set<string>();
  for (const t of tickets) {
    const ids = getEffectiveEquipmentIds(t, map);
    for (const eid of ids) {
      allNeededEquipIds.add(eid);
    }
  }

  if (allNeededEquipIds.size === 0) {
    return tickets.map((t) => ({
      ...t,
      equipmentIds: [],
      equipmentTasks: {},
      equipmentList: [],
    }));
  }

  const equipments = await prisma.equipment.findMany({
    where: { id: { in: Array.from(allNeededEquipIds) } },
    include: {
      branch: { select: { id: true, name: true, address: true } },
      building: { select: { id: true, name: true, branch: { select: { name: true } } } },
      department: {
        include: {
          building: {
            include: { branch: true },
          },
        },
      },
    },
  });

  const equipById = new Map(equipments.map((eq) => [eq.id, eq]));

  return tickets.map((t) => {
    const ids = getEffectiveEquipmentIds(t, map);
    const ticketTasks = tasksMap[t.id] || {};
    const list = ids
      .map((eid) => {
        const eq = equipById.get(eid);
        if (!eq) return null;
        const task = ticketTasks[eid];
        return {
          ...eq,
          taskWorkType: task?.workType || t.type || "REPAIR",
          taskNote: task?.note || "",
          taskCounter: task?.counter ?? null,
        };
      })
      .filter(Boolean);

    return {
      ...t,
      equipmentIds: ids,
      equipmentTasks: ticketTasks,
      equipmentList: list,
    };
  });
}
