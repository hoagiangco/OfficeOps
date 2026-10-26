/**
 * OfficeOps - Cấu hình Cam kết Chất lượng Dịch vụ (SLA)
 * Lưu trữ trong bảng SystemSetting với key: "SLA_SETTINGS"
 */

import { prisma } from "@/lib/prisma";
import type { TicketPriority } from "@prisma/client";

export interface SlaSettings {
  urgentHours: number; // Mức Khẩn cấp (giờ)
  highHours: number; // Mức Cao (giờ)
  normalHours: number; // Mức Bình thường (giờ)
  lowHours: number; // Mức Thấp (giờ)

  // Cấu hình tính theo giờ làm việc hành chính
  businessHoursOnly: boolean; // Bật: chỉ tính trong giờ làm việc; Tắt: tính 24/7 liên tục
  businessStartHour: number; // Giờ bắt đầu làm việc (vd: 8)
  businessEndHour: number; // Giờ kết thúc làm việc (vd: 17)
  includeSaturday: boolean; // Có tính ngày Thứ 7 là ngày làm việc không
}

export const DEFAULT_SLA_SETTINGS: SlaSettings = {
  urgentHours: 4,
  highHours: 8,
  normalHours: 24,
  lowHours: 48,
  businessHoursOnly: false,
  businessStartHour: 8,
  businessEndHour: 17,
  includeSaturday: true,
};

export const SETTING_KEY_SLA_SETTINGS = "SLA_SETTINGS";

/**
 * Lấy cấu hình SLA hiện tại từ cơ sở dữ liệu (kèm fallback mặc định)
 */
export async function getSlaSettings(): Promise<SlaSettings> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_SLA_SETTINGS },
    });

    if (!record || !record.value) {
      return DEFAULT_SLA_SETTINGS;
    }

    const parsed = JSON.parse(record.value);
    return {
      ...DEFAULT_SLA_SETTINGS,
      ...parsed,
      urgentHours: Math.max(0.5, Number(parsed.urgentHours) || DEFAULT_SLA_SETTINGS.urgentHours),
      highHours: Math.max(0.5, Number(parsed.highHours) || DEFAULT_SLA_SETTINGS.highHours),
      normalHours: Math.max(0.5, Number(parsed.normalHours) || DEFAULT_SLA_SETTINGS.normalHours),
      lowHours: Math.max(0.5, Number(parsed.lowHours) || DEFAULT_SLA_SETTINGS.lowHours),
      businessStartHour: Number(parsed.businessStartHour) ?? DEFAULT_SLA_SETTINGS.businessStartHour,
      businessEndHour: Number(parsed.businessEndHour) ?? DEFAULT_SLA_SETTINGS.businessEndHour,
      businessHoursOnly: Boolean(parsed.businessHoursOnly),
      includeSaturday: parsed.includeSaturday !== undefined ? Boolean(parsed.includeSaturday) : true,
    };
  } catch (err) {
    console.error("[getSlaSettings] Lỗi đọc cấu hình SLA:", err);
    return DEFAULT_SLA_SETTINGS;
  }
}

/**
 * Lưu cấu hình SLA vào cơ sở dữ liệu
 */
export async function saveSlaSettings(data: Partial<SlaSettings>): Promise<SlaSettings> {
  const current = await getSlaSettings();
  const updated: SlaSettings = {
    ...current,
    ...data,
    urgentHours: Math.max(0.5, Number(data.urgentHours ?? current.urgentHours)),
    highHours: Math.max(0.5, Number(data.highHours ?? current.highHours)),
    normalHours: Math.max(0.5, Number(data.normalHours ?? current.normalHours)),
    lowHours: Math.max(0.5, Number(data.lowHours ?? current.lowHours)),
    businessStartHour: Math.min(23, Math.max(0, Number(data.businessStartHour ?? current.businessStartHour))),
    businessEndHour: Math.min(24, Math.max(1, Number(data.businessEndHour ?? current.businessEndHour))),
    businessHoursOnly: Boolean(data.businessHoursOnly ?? current.businessHoursOnly),
    includeSaturday: Boolean(data.includeSaturday ?? current.includeSaturday),
  };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_SLA_SETTINGS },
    update: { value: JSON.stringify(updated) },
    create: {
      key: SETTING_KEY_SLA_SETTINGS,
      value: JSON.stringify(updated),
    },
  });

  return updated;
}

/**
 * Tính toán mốc thời hạn SLA (slaDueAt) dựa trên cấu hình và mức độ ưu tiên
 */
export function computeSlaDueAt(
  priority: TicketPriority,
  settings: SlaSettings = DEFAULT_SLA_SETTINGS,
  fromDate: Date = new Date()
): Date {
  const hoursMap: Record<TicketPriority, number> = {
    URGENT: settings.urgentHours || 4,
    HIGH: settings.highHours || 8,
    NORMAL: settings.normalHours || 24,
    LOW: settings.lowHours || 48,
  };

  const neededHours = hoursMap[priority] ?? 24;

  // Trường hợp tính 24/7 thông thường
  if (!settings.businessHoursOnly) {
    return new Date(fromDate.getTime() + neededHours * 3600 * 1000);
  }

  // Trường hợp tính theo giờ hành chính
  const startH = Math.min(settings.businessStartHour, settings.businessEndHour - 1);
  const endH = Math.max(settings.businessEndHour, startH + 1);

  let cur = new Date(fromDate);
  let remainingHours = neededHours;

  // Lặp tối đa 60 ngày để tránh vòng lặp vô hạn trong trường hợp cấu hình đặc biệt
  let safetyLoop = 0;
  while (remainingHours > 0 && safetyLoop < 60) {
    safetyLoop++;
    const dayOfWeek = cur.getDay(); // 0: CN, 6: T7
    const isWorkingDay = dayOfWeek !== 0 && (dayOfWeek !== 6 || settings.includeSaturday);

    if (!isWorkingDay) {
      // Sang 8h sáng ngày tiếp theo
      cur.setDate(cur.getDate() + 1);
      cur.setHours(startH, 0, 0, 0);
      continue;
    }

    const curHour = cur.getHours() + cur.getMinutes() / 60;
    if (curHour < startH) {
      cur.setHours(startH, 0, 0, 0);
      continue;
    }
    if (curHour >= endH) {
      cur.setDate(cur.getDate() + 1);
      cur.setHours(startH, 0, 0, 0);
      continue;
    }

    const hoursLeftToday = endH - curHour;
    if (remainingHours <= hoursLeftToday) {
      cur = new Date(cur.getTime() + remainingHours * 3600 * 1000);
      remainingHours = 0;
    } else {
      remainingHours -= hoursLeftToday;
      cur.setDate(cur.getDate() + 1);
      cur.setHours(startH, 0, 0, 0);
    }
  }

  return cur;
}
