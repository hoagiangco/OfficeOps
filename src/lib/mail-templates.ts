/**
 * Bộ mẫu Email HTML chuẩn hóa cho OfficeOps
 * Dùng bảng (table layout) và CSS inline để đảm bảo hiển thị hoàn hảo trên Gmail web và mobile.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:5000";

// Helper định dạng tiền tệ VND
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);
}

// Helper định dạng ngày tháng
function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "--/--/----";
  return new Date(date).toLocaleDateString("vi-VN");
}

/**
 * Mẫu 1: Thông báo Hóa đơn cước dịch vụ & Thanh toán (kèm VietQR)
 */
export function getInvoiceEmailHtml(params: {
  customerName: string;
  invoiceCode: string;
  billingPeriod: string;
  dueDate: string | Date;
  totalAmount: number;
  invoiceId: string;
  bankInfo?: {
    bankName: string;
    accountNo: string;
    accountName: string;
  };
}) {
  const { customerName, invoiceCode, billingPeriod, dueDate, totalAmount, invoiceId, bankInfo } = params;
  const viewUrl = `${APP_URL}/finance/invoices/${invoiceId}/print`;

  // Mã VietQR link nhanh nếu có thông tin ngân hàng
  const vietQrUrl = bankInfo
    ? `https://img.vietqr.io/image/${bankInfo.bankName}-${bankInfo.accountNo}-compact2.png?amount=${totalAmount}&addInfo=${encodeURIComponent(
        invoiceCode
      )}&accountName=${encodeURIComponent(bankInfo.accountName)}`
    : null;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thông báo Cước dịch vụ - ${invoiceCode}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #2563eb; padding: 28px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold; letter-spacing: -0.5px;">OfficeOps</h1>
              <p style="margin: 6px 0 0 0; color: #bfdbfe; font-size: 14px;">Thông báo cước thuê & bảo trì máy văn phòng</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 24px;">
              <p style="font-size: 15px; margin: 0 0 16px 0;">Kính gửi Quý khách <strong>${customerName}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; color: #475569;">
                OfficeOps trân trọng gửi tới Quý khách bảng kê cước dịch vụ định kỳ. Thông tin chi tiết như sau:
              </p>

              <!-- Thông tin hóa đơn -->
              <table width="100%" border="0" cellpadding="8" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; font-size: 14px;">
                <tr>
                  <td width="40%" style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Mã hóa đơn:</td>
                  <td width="60%" style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${invoiceCode}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Kỳ thanh toán:</td>
                  <td style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${billingPeriod}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Hạn thanh toán:</td>
                  <td style="font-weight: bold; color: #ef4444; border-bottom: 1px solid #e2e8f0;">${formatDate(dueDate)}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; font-size: 15px;">Tổng tiền thanh toán:</td>
                  <td style="font-size: 18px; font-weight: bold; color: #2563eb;">${formatCurrency(totalAmount)}</td>
                </tr>
              </table>

              <!-- VietQR -->
              ${
                vietQrUrl
                  ? `
              <div style="text-align: center; margin-bottom: 24px; padding: 16px; background-color: #eff6ff; border-radius: 8px; border: 1px dashed #93c5fd;">
                <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: bold; color: #1e40af;">Quét mã VietQR để thanh toán nhanh:</p>
                <img src="${vietQrUrl}" alt="VietQR Thanh Toán" style="max-width: 220px; height: auto; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);" />
                <p style="margin: 8px 0 0 0; font-size: 12px; color: #64748b;">
                  Ngân hàng: <strong>${bankInfo?.bankName}</strong> | STK: <strong>${bankInfo?.accountNo}</strong><br/>
                  Nội dung chuyển khoản: <strong>${invoiceCode}</strong>
                </p>
              </div>
              `
                  : ""
              }

              <!-- Nút CTA xem bảng kê -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${viewUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                      Xem & In Bảng Kê Chi Tiết
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
                Mọi thắc mắc về số liệu bản in hoặc số tiền thanh toán, Quý khách vui lòng phản hồi qua email này hoặc liên hệ hotline: <strong>0908 123 456</strong>.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                © 2026 OfficeOps Solutions. Hệ thống Quản trị & Vận hành Dịch vụ Máy văn phòng.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Mẫu 2: Biên bản Nghiệm thu Kỹ thuật & Bàn giao khi đóng Ticket
 */
export function getTicketCompletionEmailHtml(params: {
  customerName: string;
  ticketCode: string;
  equipmentModel: string;
  serialNumber: string;
  completedAt: string | Date;
  counterAtClose?: number | null;
  technicianName: string;
  partsReplaced?: Array<{ name: string; quantity: number }>;
  ticketId: string;
}) {
  const {
    customerName,
    ticketCode,
    equipmentModel,
    serialNumber,
    completedAt,
    counterAtClose,
    technicianName,
    partsReplaced = [],
    ticketId,
  } = params;

  const viewUrl = `${APP_URL}/tickets/${ticketId}/print`;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Biên bản nghiệm thu kỹ thuật - ${ticketCode}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #059669; padding: 28px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: bold;">OfficeOps Field Service</h1>
              <p style="margin: 6px 0 0 0; color: #a7f3d0; font-size: 14px;">Biên bản nghiệm thu kỹ thuật & bàn giao thiết bị</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 24px;">
              <p style="font-size: 15px; margin: 0 0 16px 0;">Kính gửi Quý khách <strong>${customerName}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; margin: 0 0 20px 0; color: #475569;">
                Kỹ thuật viên của chúng tôi đã hoàn tất công tác bảo dưỡng / sửa chữa cho thiết bị của Quý khách. Xin trân trọng gửi biên bản bàn giao:
              </p>

              <!-- Thông tin ca dịch vụ -->
              <table width="100%" border="0" cellpadding="8" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 20px; font-size: 14px;">
                <tr>
                  <td width="40%" style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Mã phiếu:</td>
                  <td width="60%" style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${ticketCode}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Thiết bị:</td>
                  <td style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${equipmentModel} (Serial: ${serialNumber})</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Kỹ thuật viên phụ trách:</td>
                  <td style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${technicianName}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Thời gian hoàn tất:</td>
                  <td style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${new Date(completedAt).toLocaleString("vi-VN")}</td>
                </tr>
                ${
                  counterAtClose != null
                    ? `
                <tr>
                  <td style="color: #64748b;">Chỉ số Counter chốt:</td>
                  <td style="font-weight: bold; color: #059669; font-size: 16px;">${counterAtClose.toLocaleString("vi-VN")} bản in</td>
                </tr>
                `
                    : ""
                }
              </table>

              <!-- Linh kiện thay thế (nếu có) -->
              ${
                partsReplaced.length > 0
                  ? `
              <div style="margin-bottom: 24px;">
                <p style="font-size: 13px; font-weight: bold; color: #334155; margin: 0 0 8px 0;">Vật tư / Linh kiện đã thay thế:</p>
                <table width="100%" border="0" cellpadding="6" cellspacing="0" style="border-collapse: collapse; font-size: 13px;">
                  <tr style="background-color: #f1f5f9; text-align: left;">
                    <th style="padding: 6px 8px; border: 1px solid #cbd5e1;">Linh kiện</th>
                    <th style="padding: 6px 8px; border: 1px solid #cbd5e1; text-align: right;" width="80">Số lượng</th>
                  </tr>
                  ${partsReplaced
                    .map(
                      (p) => `
                    <tr>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0;">${p.name}</td>
                      <td style="padding: 6px 8px; border: 1px solid #e2e8f0; text-align: right; font-weight: bold;">${p.quantity}</td>
                    </tr>
                  `
                    )
                    .join("")}
                </table>
              </div>
              `
                  : ""
              }

              <!-- Nút CTA -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <a href="${viewUrl}" target="_blank" style="display: inline-block; background-color: #059669; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                      Xem & In Biên Bản Điện Tử
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
                Cảm ơn Quý khách đã tin tưởng và đồng hành cùng dịch vụ của chúng tôi!
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 16px 24px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                © 2026 OfficeOps Solutions. Hotline kỹ thuật 24/7: 0908 123 456
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Mẫu 3: Thông báo Giao việc cho Kỹ thuật viên (Field Tech)
 */
export function getTicketAssignedEmailHtml(params: {
  technicianName: string;
  ticketCode: string;
  customerName: string;
  customerAddress: string;
  customerPhone?: string | null;
  equipmentModel: string;
  priority: string;
  issueDescription: string;
  slaDueAt?: string | Date | null;
  ticketId: string;
}) {
  const {
    technicianName,
    ticketCode,
    customerName,
    customerAddress,
    customerPhone,
    equipmentModel,
    priority,
    issueDescription,
    slaDueAt,
  } = params;

  const techAppUrl = `${APP_URL}/tech`;
  const isUrgent = priority === "URGENT" || priority === "HIGH";

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lệnh điều phối ca kỹ thuật - ${ticketCode}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${isUrgent ? "#dc2626" : "#4338ca"}; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: bold;">Lệnh Điều Phối Ca Kỹ Thuật</h1>
              <p style="margin: 6px 0 0 0; color: #e0e7ff; font-size: 13px;">Phiếu công việc mới được phân công cho bạn</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 24px;">
              <p style="font-size: 15px; margin: 0 0 16px 0;">Xin chào <strong>${technicianName}</strong>,</p>
              <p style="font-size: 14px; margin: 0 0 20px 0; color: #475569;">
                Bạn vừa được Điều phối viên phân công phụ trách xử lý một ca dịch vụ tại hiện trường:
              </p>

              <!-- Bảng chi tiết -->
              <table width="100%" border="0" cellpadding="8" cellspacing="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; font-size: 14px;">
                <tr>
                  <td width="35%" style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Mã phiếu:</td>
                  <td width="65%" style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${ticketCode}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Độ ưu tiên:</td>
                  <td style="font-weight: bold; color: ${isUrgent ? "#dc2626" : "#2563eb"}; border-bottom: 1px solid #e2e8f0;">
                    ${priority === "URGENT" ? "🔥 KHẨN CẤP" : priority === "HIGH" ? "⚡ CAO" : "BÌNH THƯỜNG"}
                  </td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Khách hàng:</td>
                  <td style="font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${customerName}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Địa chỉ:</td>
                  <td style="color: #0f172a; border-bottom: 1px solid #e2e8f0;">${customerAddress}</td>
                </tr>
                ${
                  customerPhone
                    ? `
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">SĐT liên hệ:</td>
                  <td style="font-weight: bold; color: #2563eb; border-bottom: 1px solid #e2e8f0;">
                    <a href="tel:${customerPhone}" style="color: #2563eb; text-decoration: none;">${customerPhone}</a>
                  </td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Thiết bị:</td>
                  <td style="color: #0f172a; border-bottom: 1px solid #e2e8f0;">${equipmentModel}</td>
                </tr>
                <tr>
                  <td style="color: #64748b; border-bottom: 1px solid #e2e8f0;">Hiện tượng lỗi:</td>
                  <td style="color: #0f172a; border-bottom: 1px solid #e2e8f0;">${issueDescription}</td>
                </tr>
                ${
                  slaDueAt
                    ? `
                <tr>
                  <td style="color: #64748b;">Hạn cam kết (SLA):</td>
                  <td style="font-weight: bold; color: #ef4444;">${new Date(slaDueAt).toLocaleString("vi-VN")}</td>
                </tr>
                `
                    : ""
                }
              </table>

              <!-- Nút CTA mở app -->
              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 20px;">
                <tr>
                  <td align="center">
                    <a href="${techAppUrl}" target="_blank" style="display: inline-block; background-color: #4338ca; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                      Mở App Kỹ Thuật & Check-in
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
                Vui lòng check-in và cập nhật tiến độ công việc trên ứng dụng khi đến địa điểm.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}

/**
 * Mẫu 4: Đặt lại Mật khẩu (Password Reset Token)
 */
export function getPasswordResetEmailHtml(params: {
  userName: string;
  resetUrl: string;
}) {
  const { userName, resetUrl } = params;

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Khôi phục mật khẩu - OfficeOps</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table width="100%" border="0" cellpadding="0" cellspacing="0" style="background-color: #f1f5f9; padding: 24px 0;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color: #0f172a; padding: 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: bold;">OfficeOps Security</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px;">
              <p style="font-size: 15px; margin: 0 0 16px 0;">Xin chào <strong>${userName}</strong>,</p>
              <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
                Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. Vui lòng bấm vào nút bên dưới để tạo mật khẩu mới:
              </p>

              <table width="100%" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td align="center">
                    <a href="${resetUrl}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-weight: bold; font-size: 14px;">
                      Đặt Lại Mật Khẩu
                    </a>
                  </td>
                </tr>
              </table>

              <div style="background-color: #fef3c7; border: 1px solid #fde68a; border-radius: 6px; padding: 12px; font-size: 12px; color: #92400e; margin-bottom: 16px;">
                ⚠️ Liên kết này chỉ có hiệu lực trong vòng <strong>30 phút</strong> và chỉ sử dụng được <strong>một lần duy nhất</strong>.
              </div>

              <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0;">
                Nếu bạn không gửi yêu cầu này, vui lòng bỏ qua email. Mật khẩu hiện tại của bạn vẫn an toàn và không thay đổi.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
}
