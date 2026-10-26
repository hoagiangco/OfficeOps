import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getSession, audit } from "@/lib/auth";

const DISALLOWED_EXTENSIONS = [
  ".exe",
  ".bat",
  ".cmd",
  ".sh",
  ".php",
  ".phtml",
  ".vbs",
  ".js",
  ".mjs",
  ".cjs",
  ".scr",
  ".jar",
];

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const folder = (formData.get("folder") as string) || "";

    if (!file) {
      return NextResponse.json({ error: "Vui lòng chọn file để tải lên" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Dung lượng file vượt quá giới hạn 25MB" },
        { status: 400 }
      );
    }

    const originalName = file.name || "unnamed";
    const ext = path.extname(originalName).toLowerCase();

    if (DISALLOWED_EXTENSIONS.includes(ext)) {
      return NextResponse.json(
        { error: `Định dạng file ${ext} không được phép tải lên vì lý do an toàn.` },
        { status: 400 }
      );
    }

    // Chuẩn hóa tên file chống path traversal
    const baseName = path.basename(originalName, ext) || "file";
    const sanitizedBase = baseName.replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 7);
    const fileName = `${sanitizedBase}_${timestamp}_${randomStr}${ext}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    if (buffer.length === 0) {
      return NextResponse.json({ error: "File rỗng" }, { status: 400 });
    }

    // Lưu cục bộ vào public/uploads trên máy chủ/host
    let uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (process.env.UPLOAD_DIR) {
      uploadsDir = path.isAbsolute(process.env.UPLOAD_DIR)
        ? process.env.UPLOAD_DIR
        : path.join(process.cwd(), process.env.UPLOAD_DIR);
    }

    if (folder) {
      const safeSub = folder.replace(/[^a-zA-Z0-9_-]/g, "");
      uploadsDir = path.join(uploadsDir, safeSub);
    }

    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, fileName);
    await writeFile(filePath, buffer);

    const relFolder = folder ? `${folder.replace(/[^a-zA-Z0-9_-]/g, "")}/` : "";
    const localUrl = `/uploads/${relFolder}${fileName}`;

    await audit(session.userId, "UPLOAD", "File", fileName, {
      originalName,
      size: file.size,
      url: localUrl,
    });

    return NextResponse.json({
      success: true,
      url: localUrl,
      path: localUrl,
      name: originalName,
      size: file.size,
    });
  } catch (error: any) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    console.error("Lỗi khi tải file:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi khi tải file" },
      { status: 500 }
    );
  }
}
