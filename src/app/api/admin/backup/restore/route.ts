import { NextResponse } from "next/server";
import path from "path";
import fsSync from "fs";
import { requirePermission } from "@/lib/auth";
import { withErrors, HttpError } from "@/lib/http";
import { restoreDatabase } from "@/lib/backupService";

export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("backup:restore");
  if (session instanceof NextResponse) return session;

  const contentType = req.headers.get("content-type") || "";

  let result;

  if (contentType.includes("multipart/form-data")) {
    // 1. Phục hồi từ file người dùng upload lên
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const createSafetySnapshot = formData.get("createSafetySnapshot") !== "false";

    if (!file) {
      throw new HttpError(400, "Vui lòng chọn tệp tin sao lưu để phục hồi");
    }

    const filename = file.name;
    const validExtensions = [".json", ".json.gz", ".sql.gz", ".tar.gz", ".tgz"];
    const isValid = validExtensions.some((ext) => filename.toLowerCase().endsWith(ext));
    if (!isValid) {
      throw new HttpError(
        400,
        "Định dạng tệp không được hỗ trợ. Vui lòng tải file .json.gz, .json, .sql.gz, hoặc .tar.gz"
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    result = await restoreDatabase({
      filePathOrBuffer: buffer,
      filename,
      userId: session.userId,
      userName: session.name,
      createSafetySnapshot,
    });
  } else {
    // 2. Phục hồi từ file sao lưu có sẵn trên máy chủ
    const body = await req.json().catch(() => ({}));
    const filename = body.filename ? String(body.filename).trim() : "";
    const createSafetySnapshot = body.createSafetySnapshot !== false;

    if (!filename) {
      throw new HttpError(400, "Tên file sao lưu không được để trống");
    }

    const safeFilename = path.basename(filename);
    const filePath = path.join(process.cwd(), "backups", safeFilename);

    if (!fsSync.existsSync(filePath)) {
      throw new HttpError(404, `Không tìm thấy file sao lưu "${safeFilename}" trên máy chủ`);
    }

    result = await restoreDatabase({
      filePathOrBuffer: filePath,
      filename: safeFilename,
      userId: session.userId,
      userName: session.name,
      createSafetySnapshot,
    });
  }

  return NextResponse.json({
    success: true,
    message: `Phục hồi dữ liệu thành công! Đã nạp lại ${result.restoredRecords.toLocaleString(
      "vi-VN"
    )} bản ghi.`,
    result,
  });
});
