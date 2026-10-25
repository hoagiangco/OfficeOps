import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError, parseBody } from "@/lib/http";
import { sendZnsNotification, getZaloAccessToken, normalizePhoneForZalo } from "@/lib/zaloService";
import { z } from "zod";

const zaloTestSchema = z.object({
  phone: z.string().min(8, "Số điện thoại nhận tin không hợp lệ"),
  message: z.string().optional(),
});

// GET: Kiểm tra trạng thái cấu hình kết nối Zalo OA / ZNS
export const GET = withErrors(async () => {
  const session = await getSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
    throw new HttpError(403, "Chỉ Quản trị viên mới có quyền kiểm tra cấu hình Zalo OA");
  }

  const appId = process.env.ZALO_APP_ID || "";
  const oaId = process.env.ZALO_OA_ID || "";
  const hasSecret = Boolean(process.env.ZALO_APP_SECRET);
  const hasRefreshToken = Boolean(process.env.ZALO_REFRESH_TOKEN);
  const directToken = process.env.ZALO_ACCESS_TOKEN || "";

  const isConfigured = Boolean(appId && (directToken || (hasSecret && hasRefreshToken)));
  const currentToken = await getZaloAccessToken();

  return NextResponse.json({
    isConfigured,
    mode: currentToken ? "PRODUCTION (Live Zalo API)" : "SIMULATION (Mô phỏng an toàn)",
    zaloAppId: appId ? `${appId.slice(0, 4)}****` : "Chưa cấu hình",
    zaloOaId: oaId ? `${oaId.slice(0, 4)}****` : "Chưa cấu hình",
    hasAccessToken: Boolean(currentToken),
  });
});

// POST: Gửi thử nghiệm một tin nhắn Zalo ZNS
export const POST = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
    throw new HttpError(403, "Chỉ Quản trị viên mới có quyền gửi thử nghiệm Zalo ZNS");
  }

  const parsed = await parseBody(req, zaloTestSchema);
  if (parsed.error) return parsed.error;

  const { phone, message } = parsed.data;
  const normPhone = normalizePhoneForZalo(phone);

  const res = await sendZnsNotification({
    phone: normPhone,
    templateId: "TPL_OFFICEOPS_TEST",
    templateData: {
      title: "Kiểm tra hệ thống OfficeOps",
      recipient_name: "Quản trị viên",
      message: message || "Đây là tin nhắn thử nghiệm kết nối Zalo Notification Service từ OfficeOps.",
      sent_time: new Date().toLocaleString("vi-VN"),
    },
    userId: session.userId,
    trackingId: `test_${Date.now()}`,
  });

  return NextResponse.json({
    success: res.success,
    simulated: res.simulated,
    messageId: res.messageId,
    phone: normPhone,
    error: res.error,
  });
});
