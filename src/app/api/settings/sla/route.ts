import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError, parseBody } from "@/lib/http";
import {
  getSlaSettings,
  saveSlaSettings,
  SlaSettings,
  DEFAULT_SLA_SETTINGS,
} from "@/lib/slaSettings";
import { z } from "zod";

const slaSettingsSchema = z.object({
  urgentHours: z.number().min(0.5, "Giờ xử lý khẩn cấp tối thiểu là 0.5 giờ"),
  highHours: z.number().min(0.5, "Giờ xử lý mức cao tối thiểu là 0.5 giờ"),
  normalHours: z.number().min(0.5, "Giờ xử lý mức bình thường tối thiểu là 0.5 giờ"),
  lowHours: z.number().min(0.5, "Giờ xử lý mức thấp tối thiểu là 0.5 giờ"),
  businessHoursOnly: z.boolean().default(false),
  businessStartHour: z.number().min(0).max(23).default(8),
  businessEndHour: z.number().min(1).max(24).default(17),
  includeSaturday: z.boolean().default(true),
});

// GET: Lấy cấu hình SLA hiện tại
export const GET = withErrors(async () => {
  const settings = await getSlaSettings();
  return NextResponse.json({
    settings,
    defaultSettings: DEFAULT_SLA_SETTINGS,
  });
});

// POST: Cập nhật cấu hình SLA
export const POST = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
    throw new HttpError(403, "Chỉ Quản trị viên (SUPER_ADMIN / ADMIN) mới có quyền chỉnh sửa cấu hình SLA");
  }

  const parsed = await parseBody(req, slaSettingsSchema);
  if (parsed.error) return parsed.error;

  const updated = await saveSlaSettings(parsed.data as SlaSettings);

  // Ghi nhật ký hệ thống
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "UPDATE_SLA_SETTINGS",
      entity: "SystemSetting",
      entityId: "SLA_SETTINGS",
      meta: {
        urgentHours: updated.urgentHours,
        highHours: updated.highHours,
        normalHours: updated.normalHours,
        lowHours: updated.lowHours,
        businessHoursOnly: updated.businessHoursOnly,
      },
    },
  });

  return NextResponse.json({
    success: true,
    settings: updated,
    message: "Cập nhật cấu hình cam kết SLA thành công",
  });
});
