import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import { requirePermission } from "@/lib/auth";
import { withErrors, HttpError } from "@/lib/http";
import { deleteBackup } from "@/lib/backupService";

type Ctx = { params: Promise<{ filename: string }> };

// GET /api/admin/backup/[filename] - Tải về file sao lưu
export const GET = withErrors(async (req: Request, { params }: Ctx) => {
  const session = await requirePermission("backup:view");
  if (session instanceof NextResponse) return session;

  const { filename } = await params;
  const safeFilename = path.basename(filename);
  const filePath = path.join(process.cwd(), "backups", safeFilename);

  if (!fsSync.existsSync(filePath)) {
    throw new HttpError(404, "Không tìm thấy file sao lưu trên hệ thống");
  }

  const fileBuffer = await fs.readFile(filePath);

  let contentType = "application/octet-stream";
  if (safeFilename.endsWith(".gz")) {
    contentType = "application/gzip";
  } else if (safeFilename.endsWith(".json")) {
    contentType = "application/json";
  } else if (safeFilename.endsWith(".sql")) {
    contentType = "application/sql";
  }

  return new NextResponse(fileBuffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${safeFilename}"`,
      "Content-Length": String(fileBuffer.length),
      "Cache-Control": "no-store",
    },
  });
});

// DELETE /api/admin/backup/[filename] - Xóa bản sao lưu
export const DELETE = withErrors(async (req: Request, { params }: Ctx) => {
  const session = await requirePermission("backup:manage");
  if (session instanceof NextResponse) return session;

  const { filename } = await params;
  const safeFilename = path.basename(filename);

  await deleteBackup(safeFilename, session.userId);

  return NextResponse.json({
    success: true,
    message: `Đã xóa bản sao lưu ${safeFilename} thành công`,
  });
});
