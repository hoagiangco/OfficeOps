import { NextRequest, NextResponse } from "next/server";
import { rename } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { getSession, audit } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
    }

    if (!["SUPER_ADMIN", "ADMIN", "DISPATCHER"].includes(session.role)) {
      return NextResponse.json(
        { error: "Bạn không có quyền đổi tên tệp tin" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { oldName, newName, oldPath } = body;

    const sourceTarget = (oldPath || oldName || "").trim();
    const targetName = (newName || "").trim();

    if (!sourceTarget || !targetName) {
      return NextResponse.json(
        { error: "Vui lòng cung cấp tên file cũ và tên file mới" },
        { status: 400 }
      );
    }

    // Kiểm tra tính hợp lệ của tên mới
    if (
      targetName.includes("..") ||
      targetName.includes("/") ||
      targetName.includes("\\")
    ) {
      return NextResponse.json(
        { error: "Tên file mới không được chứa ký tự đặc biệt hoặc đường dẫn" },
        { status: 400 }
      );
    }

    let cleanRelPath = sourceTarget;
    if (cleanRelPath.startsWith("/uploads/")) {
      cleanRelPath = cleanRelPath.replace(/^\/uploads\//, "");
    } else if (cleanRelPath.startsWith("uploads/")) {
      cleanRelPath = cleanRelPath.replace(/^uploads\//, "");
    }

    if (cleanRelPath.includes("..") || path.isAbsolute(cleanRelPath)) {
      return NextResponse.json({ error: "Đường dẫn file không hợp lệ" }, { status: 400 });
    }

    let uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (process.env.UPLOAD_DIR) {
      uploadsDir = path.isAbsolute(process.env.UPLOAD_DIR)
        ? process.env.UPLOAD_DIR
        : path.join(process.cwd(), process.env.UPLOAD_DIR);
    }

    const currentFilePath = path.join(uploadsDir, cleanRelPath);
    if (!existsSync(currentFilePath)) {
      return NextResponse.json({ error: "Không tìm thấy file nguồn" }, { status: 404 });
    }

    // Đảm bảo giữ nguyên đuôi mở rộng nếu người dùng không nhập đuôi
    const oldExt = path.extname(cleanRelPath);
    const newExt = path.extname(targetName);
    const finalNewName = newExt ? targetName : `${targetName}${oldExt}`;

    const parentDir = path.dirname(currentFilePath);
    const newFilePath = path.join(parentDir, finalNewName);

    if (existsSync(newFilePath)) {
      return NextResponse.json(
        { error: "Tên file này đã tồn tại trong thư mục, vui lòng chọn tên khác" },
        { status: 400 }
      );
    }

    await rename(currentFilePath, newFilePath);

    const relFolder = path.relative(uploadsDir, parentDir).replace(/\\/g, "/");
    const newUrl = relFolder && relFolder !== "."
      ? `/uploads/${relFolder}/${finalNewName}`
      : `/uploads/${finalNewName}`;

    await audit(session.userId, "RENAME", "File", cleanRelPath, {
      oldName: cleanRelPath,
      newName: finalNewName,
      newUrl,
    });

    return NextResponse.json({
      success: true,
      message: "Đổi tên file thành công",
      newUrl,
      newName: finalNewName,
    });
  } catch (error: any) {
    console.error("Lỗi khi đổi tên file:", error);
    return NextResponse.json(
      { error: error?.message || "Lỗi khi đổi tên file" },
      { status: 500 }
    );
  }
}
