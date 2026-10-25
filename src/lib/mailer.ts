import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";

export interface MailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: any;
    path?: string;
    contentType?: string;
  }>;
  userId?: string | null;
}

export interface MailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

let transporterInstance: Transporter | null = null;

/**
 * Khởi tạo hoặc lấy Transporter nodemailer
 */
function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  if (!host || !user || !pass) {
    return null;
  }

  if (!transporterInstance) {
    transporterInstance = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      tls: {
        rejectUnauthorized: process.env.NODE_ENV === "production",
      },
    });
  }

  return transporterInstance;
}

/**
 * Kiểm tra kết nối SMTP
 */
export async function verifySmtpConnection(): Promise<{ ok: boolean; message: string }> {
  const transporter = getTransporter();
  if (!transporter) {
    return {
      ok: false,
      message: "Chưa cấu hình đầy đủ biến môi trường SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS)",
    };
  }

  try {
    await transporter.verify();
    return { ok: true, message: "Kết nối máy chủ SMTP thành công" };
  } catch (error: any) {
    return {
      ok: false,
      message: `Lỗi kết nối SMTP: ${error?.message || String(error)}`,
    };
  }
}

/**
 * Gửi Email với cơ chế Thử lại tối đa 3 lần và ghi Notification
 */
export async function sendMail(options: MailOptions): Promise<MailResult> {
  const { to, subject, html, text, attachments, userId } = options;
  const transporter = getTransporter();

  // Nếu chưa cấu hình SMTP, bỏ qua một cách an toàn mà không làm sập flow nghiệp vụ
  if (!transporter) {
    console.warn(`[Mailer] SMTP chưa được cấu hình. Bỏ qua gửi email tới: ${to} (Tiêu đề: ${subject})`);
    return {
      success: false,
      skipped: true,
      error: "Cấu hình SMTP chưa được thiết lập trên máy chủ",
    };
  }

  const mailFrom = process.env.MAIL_FROM || `OfficeOps <${process.env.SMTP_USER}>`;
  const mailOptions: SendMailOptions = {
    from: mailFrom,
    to,
    subject,
    html,
    text: text || subject,
    attachments,
  };

  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[Mailer] Gửi mail thành công tới ${to} (MessageId: ${info.messageId}) ở lần thử ${attempt}`);

      // Ghi nhận vào Notification log
      try {
        await prisma.notification.create({
          data: {
            userId: userId || null,
            channel: "EMAIL",
            title: subject,
            body: text || subject,
            isRead: true,
            sentAt: new Date(),
          },
        });
      } catch (logErr) {
        console.error("[Mailer] Lỗi khi ghi Notification log:", logErr);
      }

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (err: any) {
      lastError = err;
      console.warn(`[Mailer] Gửi mail thất bại lần ${attempt}/${MAX_RETRIES} tới ${to}: ${err?.message || err}`);
      if (attempt < MAX_RETRIES) {
        // Đợi theo exponential backoff: 1s, 2s
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  console.error(`[Mailer] Gửi mail thất bại hoàn toàn tới ${to} sau ${MAX_RETRIES} lần thử:`, lastError?.message);

  return {
    success: false,
    error: lastError?.message || "Không thể gửi email sau 3 lần thử",
  };
}
