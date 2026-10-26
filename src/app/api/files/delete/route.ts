import { NextRequest, NextResponse } from "next/server";
import { unlink } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getSession, audit } from "@/lib/auth";

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    // Chỉ SUPER_ADMIN, ADMIN, DISPATCHER mới có quyền xóa file
    if (!["SUPER_ADMIN", "ADMIN", "DISPATCHER"].includes(session.role)) {
      return NextResponse.json(
        { error: "Bạn không có quyền xóa tệp tin" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const rawFileParam = searchParams.get("file");

    if (!rawFileParam) {
      return NextResponse.json({ error: "Thiếu thông tin file cần xóa" }, { status: 400 });
    }

    const decodedTarget = decodeURIComponent(rawFileParam).trim();

    // Local storage
    let cleanRelPath = decodedTarget;
    if (cleanRelPath.startsWith("/uploads/")) {
      cleanRelPath = cleanRelPath.replace(/^\/uploads\//, "");
    } else if (cleanRelPath.startsWith("uploads/")) {
      cleanRelPath = cleanRelPath.replace(/^uploads\//, "");
    }

    // Chống path traversal nguy hiểm
    if (cleanRelPath.includes("..") || path.isAbsolute(cleanRelPath)) {
      return NextResponse.json({ error: "Đường dẫn file không hợp lệ" }, { status: 400 });
    }

    let uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (process.env.UPLOAD_DIR) {
      uploadsDir = path.isAbsolute(process.env.UPLOAD_DIR)
        ? process.env.UPLOAD_DIR
        : path.join(process.cwd(), process.env.UPLOAD_DIR);
    }

    const targetFilePath = path.join(uploadsDir, cleanRelPath);

    // Đảm bảo file nằm trong uploadsDir
    const normalizedTarget = path.normalize(targetFilePath);
    const normalizedUploads = path.normalize(uploadsDir);
    if (!normalizedTarget.startsWith(normalizedUploads)) {
      return NextResponse.json({ error: "Không được phép truy cập ngoài thư mục uploads" }, { status: 403 });
    }

    if (!existsSync(targetFilePath)) {
      return NextResponse.json({ error: "Không tìm thấy file trên hệ thống" }, { status: 404 });
    }

    await unlink(targetFilePath);

    await audit(session.userId, "DELETE", "File", cleanRelPath);

    return NextResponse.json({ success: true, message: "Đã xóa file thành công" });
  } catch (error: any) {
    if (error && typeof error === "object" && "digest" in error) {
      throw error;
    }
    console.error("Lỗi khi xóa file:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi khi xóa file" },
      { status: 500 }
    );
  }
}
