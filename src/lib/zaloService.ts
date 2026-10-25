/**
 * OfficeOps - Tích hợp Zalo Official Account (OA) & Zalo Notification Service (ZNS)
 *
 * Tính năng:
 * 1. Chuẩn hóa số điện thoại người nhận sang định dạng chuẩn ZNS (849xxxxxxxx).
 * 2. Cơ chế xác thực OAuth 2.0 (tự động làm mới Access Token bằng Refresh Token).
 * 3. Hỗ trợ 2 chế độ:
 *    - PRODUCTION: Gửi ZNS thật qua API chính thức của Zalo (business.openapi.zalo.com).
 *    - SANDBOX / SIMULATION: Tự động giả lập an toàn khi chưa cấu hình Access Token thật,
 *      ghi log chi tiết và lưu Notification vào cơ sở dữ liệu để kiểm thử toàn diện luồng nghiệp vụ.
 */

import { prisma } from "@/lib/prisma";

export interface ZnsSendOptions {
  phone: string;
  templateId: string;
  templateData: Record<string, any>;
  trackingId?: string;
  userId?: string;
}

export interface ZnsResult {
  success: boolean;
  messageId?: string;
  simulated: boolean;
  error?: string;
}

/**
 * Chuẩn hóa số điện thoại Việt Nam sang định dạng 84xxxxxxxxx
 */
export function normalizePhoneForZalo(phone: string): string {
  let clean = phone.replace(/\D/g, "");
  if (clean.startsWith("0")) {
    clean = "84" + clean.slice(1);
  } else if (!clean.startsWith("84") && clean.length === 9) {
    clean = "84" + clean;
  }
  return clean;
}

/**
 * Lấy Access Token Zalo OA (hỗ trợ refresh token nếu có cấu hình)
 */
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getZaloAccessToken(): Promise<string | null> {
  // 1. Kiểm tra biến môi trường trực tiếp
  const directToken = process.env.ZALO_ACCESS_TOKEN;
  if (directToken) return directToken;

  // 2. Kiểm tra cache trong bộ nhớ
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now()) {
    return cachedAccessToken.token;
  }

  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;
  const refreshToken = process.env.ZALO_REFRESH_TOKEN;

  if (!appId || !appSecret || !refreshToken) {
    return null;
  }

  try {
    const res = await fetch("https://oauth.zaloapp.com/v4/oa/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        secret_key: appSecret,
      },
      body: new URLSearchParams({
        app_id: appId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await res.json();
    if (data.access_token) {
      const expiresInSec = Number(data.expires_in) || 3600;
      cachedAccessToken = {
        token: data.access_token,
        expiresAt: Date.now() + (expiresInSec - 300) * 1000,
      };
      return data.access_token;
    } else {
      console.warn("[ZaloService] Lỗi làm mới Access Token Zalo:", data);
      return null;
    }
  } catch (err) {
    console.error("[ZaloService] Lỗi kết nối máy chủ Zalo OAuth:", err);
    return null;
  }
}

/**
 * Gửi thông báo ZNS (Zalo Notification Service)
 */
export async function sendZnsNotification(options: ZnsSendOptions): Promise<ZnsResult> {
  const normPhone = normalizePhoneForZalo(options.phone);
  const accessToken = await getZaloAccessToken();

  // Nếu chưa cấu hình credentials thật -> Chạy chế độ giả lập (Simulation Mode)
  if (!accessToken) {
    console.log("------------------------------------------------------------");
    console.log("📱 [Zalo ZNS - SIMULATION]");
    console.log(`- Đến số: ${normPhone} (Gốc: ${options.phone})`);
    console.log(`- Template ID: ${options.templateId}`);
    console.log(`- Dữ liệu:`, JSON.stringify(options.templateData, null, 2));
    console.log("------------------------------------------------------------");

    // Lưu bản ghi thông báo vào cơ sở dữ liệu
    try {
      await prisma.notification.create({
        data: {
          userId: options.userId || null,
          channel: "ZALO",
          title: `[ZNS - Mẫu ${options.templateId}] Gửi tới ${normPhone}`,
          body: JSON.stringify(options.templateData),
          sentAt: new Date(),
        },
      });
    } catch (e) {
      console.warn("[ZaloService] Không thể ghi bản ghi thông báo vào DB:", e);
    }

    return {
      success: true,
      simulated: true,
      messageId: `sim_${Date.now()}_${normPhone}`,
    };
  }

  // Chế độ gửi thật (Production API)
  try {
    const res = await fetch("https://business.openapi.zalo.com/message/template", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        access_token: accessToken,
      },
      body: JSON.stringify({
        phone: normPhone,
        template_id: options.templateId,
        template_data: options.templateData,
        tracking_id: options.trackingId || `trk_${Date.now()}`,
      }),
    });

    const data = await res.json();

    if (data.error === 0) {
      await prisma.notification.create({
        data: {
          userId: options.userId || null,
          channel: "ZALO",
          title: `[ZNS Thành công] Mẫu ${options.templateId}`,
          body: JSON.stringify(options.templateData),
          sentAt: new Date(),
        },
      });

      return {
        success: true,
        simulated: false,
        messageId: data.data?.msg_id,
      };
    } else {
      console.warn("[ZaloService] API Zalo trả về mã lỗi:", data);
      return {
        success: false,
        simulated: false,
        error: data.message || `Lỗi Zalo error code: ${data.error}`,
      };
    }
  } catch (err: any) {
    console.error("[ZaloService] Lỗi mạng khi gọi ZNS API:", err);
    return {
      success: false,
      simulated: false,
      error: err.message || "Lỗi mạng Zalo API",
    };
  }
}

/**
 * 1. Mẫu ZNS: Báo Kỹ thuật viên có phiếu mới được điều phối
 */
export async function sendTicketAssignedZns(params: {
  technicianPhone: string;
  technicianName: string;
  ticketCode: string;
  customerName: string;
  customerAddress: string;
  issueDescription: string;
  techUserId?: string;
}): Promise<ZnsResult> {
  const templateId = process.env.ZNS_TPL_TICKET_ASSIGNED || "TPL_TICKET_ASSIGNED_DEMO";
  return sendZnsNotification({
    phone: params.technicianPhone,
    templateId,
    templateData: {
      technician_name: params.technicianName,
      ticket_code: params.ticketCode,
      customer_name: params.customerName,
      address: params.customerAddress,
      description: params.issueDescription,
      assigned_time: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
    },
    userId: params.techUserId,
    trackingId: `ticket_assign_${params.ticketCode}`,
  });
}

/**
 * 2. Mẫu ZNS: Gửi thông báo Hóa đơn cước dịch vụ & Mã thanh toán cho Khách hàng
 */
export async function sendInvoiceSentZns(params: {
  customerPhone: string;
  customerName: string;
  invoiceCode: string;
  totalAmount: number;
  periodText: string;
  dueDateStr: string;
  paymentUrl?: string;
  customerUserId?: string;
}): Promise<ZnsResult> {
  const templateId = process.env.ZNS_TPL_INVOICE_SENT || "TPL_INVOICE_SENT_DEMO";
  return sendZnsNotification({
    phone: params.customerPhone,
    templateId,
    templateData: {
      customer_name: params.customerName,
      invoice_code: params.invoiceCode,
      amount: params.totalAmount.toLocaleString("vi-VN") + " VNĐ",
      period: params.periodText,
      due_date: params.dueDateStr,
      payment_link: params.paymentUrl || `https://officeops.vn/invoices/${params.invoiceCode}`,
    },
    userId: params.customerUserId,
    trackingId: `invoice_sent_${params.invoiceCode}`,
  });
}

/**
 * 3. Mẫu ZNS: Gửi Biên bản nghiệm thu bàn giao máy hoàn thành sửa chữa cho Khách hàng
 */
export async function sendTicketCompletedZns(params: {
  customerPhone: string;
  customerName: string;
  ticketCode: string;
  equipmentModel: string;
  counterValue?: number | null;
  technicianName: string;
  customerUserId?: string;
}): Promise<ZnsResult> {
  const templateId = process.env.ZNS_TPL_TICKET_COMPLETED || "TPL_TICKET_COMPLETED_DEMO";
  return sendZnsNotification({
    phone: params.customerPhone,
    templateId,
    templateData: {
      customer_name: params.customerName,
      ticket_code: params.ticketCode,
      model: params.equipmentModel,
      counter: params.counterValue != null ? params.counterValue.toLocaleString("vi-VN") : "N/A",
      technician: params.technicianName,
      completed_at: new Date().toLocaleDateString("vi-VN"),
    },
    userId: params.customerUserId,
    trackingId: `ticket_done_${params.ticketCode}`,
  });
}
