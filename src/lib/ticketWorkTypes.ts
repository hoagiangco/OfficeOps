import { prisma } from "@/lib/prisma";
import type { TicketType } from "@prisma/client";

export interface TicketWorkTypeItem {
  code: string;
  label: string;
  isSystem: boolean;
}

export const SYSTEM_TICKET_TYPES = [
  "INSTALLATION",
  "INSPECTION",
  "REPAIR",
  "MAINTENANCE",
  "OTHER",
] as const;

export const DEFAULT_TICKET_WORK_TYPES: TicketWorkTypeItem[] = [
  { code: "INSTALLATION", label: "Lắp mới", isSystem: true },
  { code: "INSPECTION", label: "Kiểm tra", isSystem: true },
  { code: "REPAIR", label: "Sửa chữa", isSystem: true },
  { code: "MAINTENANCE", label: "Bảo trì định kỳ", isSystem: true },
  { code: "OTHER", label: "Khác", isSystem: true },
];

const SETTING_KEY_WORK_TYPES = "TICKET_WORK_TYPES";
const SETTING_KEY_CUSTOM_TYPE_MAP = "TICKET_CUSTOM_TYPES_MAP";

export function isSystemTicketType(type: string): type is TicketType {
  return (SYSTEM_TICKET_TYPES as readonly string[]).includes(type);
}

/**
 * Lấy danh sách Loại công việc của Phiếu kỹ thuật
 */
export async function getTicketWorkTypes(): Promise<TicketWorkTypeItem[]> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_WORK_TYPES },
    });
    if (!record || !record.value) {
      return DEFAULT_TICKET_WORK_TYPES;
    }
    const parsed = JSON.parse(record.value);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_TICKET_WORK_TYPES;
    }

    // Đảm bảo luôn có đủ 5 loại mặc định gốc (giữ nguyên tên đã sửa nếu có)
    const mapByCode = new Map<string, TicketWorkTypeItem>();
    for (const item of parsed) {
      if (item && typeof item.code === "string" && typeof item.label === "string") {
        mapByCode.set(item.code, {
          code: item.code.trim(),
          label: item.label.trim(),
          isSystem: isSystemTicketType(item.code.trim()),
        });
      }
    }

    const result: TicketWorkTypeItem[] = [];
    for (const def of DEFAULT_TICKET_WORK_TYPES) {
      const existing = mapByCode.get(def.code);
      if (existing) {
        result.push(existing);
        mapByCode.delete(def.code);
      } else {
        result.push(def);
      }
    }

    // Thêm các loại công việc tùy chỉnh do người dùng thêm
    for (const custom of mapByCode.values()) {
      result.push(custom);
    }

    return result;
  } catch (err) {
    console.error("[getTicketWorkTypes] Lỗi đọc cấu hình loại công việc:", err);
    return DEFAULT_TICKET_WORK_TYPES;
  }
}

/**
 * Lưu danh sách Loại công việc
 */
export async function saveTicketWorkTypes(items: TicketWorkTypeItem[]): Promise<TicketWorkTypeItem[]> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_WORK_TYPES },
    update: { value: JSON.stringify(items) },
    create: {
      key: SETTING_KEY_WORK_TYPES,
      value: JSON.stringify(items),
    },
  });
  return items;
}

/**
 * Lấy bảng ánh xạ ticketId -> customWorkTypeCode (dành cho các loại công việc thêm mới ngoài 5 enum gốc)
 */
export async function getTicketCustomTypesMap(): Promise<Record<string, string>> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_CUSTOM_TYPE_MAP },
    });
    if (!record || !record.value) return {};
    const parsed = JSON.parse(record.value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Lưu bảng ánh xạ ticketId -> customWorkTypeCode
 */
export async function saveTicketCustomTypesMap(map: Record<string, string>): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_CUSTOM_TYPE_MAP },
    update: { value: JSON.stringify(map) },
    create: {
      key: SETTING_KEY_CUSTOM_TYPE_MAP,
      value: JSON.stringify(map),
    },
  });
}

/**
 * Ghi nhận loại công việc cho 1 ticket cụ thể
 */
export async function setTicketCustomTypeForTicket(ticketId: string, requestedType: string): Promise<void> {
  const trimmed = requestedType.trim();
  const map = await getTicketCustomTypesMap();
  if (isSystemTicketType(trimmed)) {
    if (map[ticketId]) {
      delete map[ticketId];
      await saveTicketCustomTypesMap(map);
    }
  } else {
    map[ticketId] = trimmed;
    await saveTicketCustomTypesMap(map);
  }
}

/**
 * Chuyển đổi mã công việc sang giá trị Enum hợp lệ của Prisma khi lưu vào bảng Ticket
 */
export function toPrismaTicketType(requestedType?: string | null): TicketType {
  if (!requestedType) return "REPAIR";
  const trimmed = requestedType.trim();
  if (isSystemTicketType(trimmed)) {
    return trimmed;
  }
  return "OTHER";
}
