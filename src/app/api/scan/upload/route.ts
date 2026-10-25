import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { withErrors, HttpError } from "@/lib/http";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB cho ảnh chụp từ điện thoại
const MAX_UPLOADS_PER_HOUR = 10;
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Kiểm tra tính hợp lệ của file ảnh qua Magic Bytes thực tế
 */
function isValidImageMagicBytes(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;

  // JPEG / JPG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }

  // GIF: GIF87a (47 49 46 38 37 61) hoặc GIF89a (47 49 46 38 39 61)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return true;
  }

  // WEBP: RIFF (52 49 46 46) .... WEBP (57 45 42 50)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return true;
  }

  return false;
}

export const POST = withErrors(async (req: Request) => {
  // 1. Chống spam Rate Limit theo IP: tối đa 10 ảnh / giờ
  const ip = getClientIp(req);
  const rateLimit = checkRateLimit(`upload_qr:${ip}`, MAX_UPLOADS_PER_HOUR, ONE_HOUR_MS);

  if (!rateLimit.allowed) {
    throw new HttpError(
      429,
      `Bạn đã vượt quá giới hạn tải lên (${MAX_UPLOADS_PER_HOUR} ảnh/giờ). Vui lòng thử lại sau ${Math.ceil(rateLimit.resetInSec / 60)} phút.`
    );
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    throw new HttpError(400, "Vui lòng chọn ảnh chụp lỗi để tải lên");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new HttpError(400, "Dung lượng ảnh vượt quá giới hạn cho phép (10MB)");
  }

  const ext = path.extname(file.name).toLowerCase();
  const safeExts = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
  if (!safeExts.includes(ext)) {
    throw new HttpError(400, "Định dạng file không được hỗ trợ. Chỉ chấp nhận JPG, PNG, WEBP, GIF.");
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // 2. Kiểm tra Magic Bytes thực tế chống giả mạo extension
  if (!isValidImageMagicBytes(buffer)) {
    throw new HttpError(
      400,
      "Nội dung file không phải là định dạng hình ảnh hợp lệ. Vui lòng kiểm tra lại file ảnh chụp."
    );
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", "customer-reports");
  await fs.mkdir(uploadDir, { recursive: true });

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const uniqueFileName = `${timestamp}_${randomStr}${ext || ".jpg"}`;
  const filePath = path.join(uploadDir, uniqueFileName);

  await fs.writeFile(filePath, buffer);

  const publicUrl = `/uploads/customer-reports/${uniqueFileName}`;

  return NextResponse.json({
    url: publicUrl,
    fileName: uniqueFileName,
    size: file.size,
  });
});
