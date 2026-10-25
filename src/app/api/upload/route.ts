import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError } from "@/lib/http";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export const POST = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folder = (formData.get("folder") as string) || "tickets";

  if (!file) {
    throw new HttpError(400, "Vui lòng chọn file để tải lên");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new HttpError(400, "Dung lượng file vượt quá giới hạn cho phép (15MB)");
  }

  // Chuẩn hóa folder để tránh Path Traversal
  const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, "");

  // Đuôi mở rộng an toàn
  const ext = path.extname(file.name).toLowerCase();
  const safeExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"];
  if (!safeExts.includes(ext)) {
    throw new HttpError(400, `Định dạng file không được hỗ trợ (${ext}). Chỉ chấp nhận JPG, PNG, WEBP, GIF, PDF.`);
  }

  const uploadDir = path.join(process.cwd(), "public", "uploads", safeFolder);
  await fs.mkdir(uploadDir, { recursive: true });

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8);
  const cleanBaseName = path
    .basename(file.name, ext)
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .substring(0, 30);
  const uniqueFileName = `${timestamp}_${randomStr}_${cleanBaseName}${ext}`;
  const filePath = path.join(uploadDir, uniqueFileName);

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  await fs.writeFile(filePath, buffer);

  const publicUrl = `/uploads/${safeFolder}/${uniqueFileName}`;

  return NextResponse.json({
    url: publicUrl,
    filename: file.name,
    size: file.size,
    mimeType: file.type || "application/octet-stream",
  });
});
