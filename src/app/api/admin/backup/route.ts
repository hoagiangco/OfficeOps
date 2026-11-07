import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { withErrors, HttpError } from "@/lib/http";
import {
  listBackups,
  createBackup,
  getDatabaseRecordStats,
  getBackupSettings,
  type BackupType,
} from "@/lib/backupService";

// GET /api/admin/backup - Lấy danh sách bản sao lưu, thống kê DB và cấu hình
export const GET = withErrors(async () => {
  const session = await requirePermission("backup:view");
  if (session instanceof NextResponse) return session;

  const [backups, stats, settings] = await Promise.all([
    listBackups(),
    getDatabaseRecordStats(),
    getBackupSettings(),
  ]);

  return NextResponse.json({
    backups,
    stats,
    settings,
  });
});

// POST /api/admin/backup - Tạo bản sao lưu mới
export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("backup:create");
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => ({}));
  const type = (body.type || "DATABASE_JSON") as BackupType;
  const note = body.note ? String(body.note).trim() : undefined;

  const validTypes: BackupType[] = ["DATABASE_JSON", "DATABASE_SQL", "FULL_ARCHIVE"];
  if (!validTypes.includes(type)) {
    throw new HttpError(400, "Loại sao lưu không hợp lệ. Chỉ chấp nhận DATABASE_JSON, DATABASE_SQL, FULL_ARCHIVE");
  }

  const backup = await createBackup({
    type,
    note,
    userId: session.userId,
    userName: session.name,
    isAuto: false,
  });

  return NextResponse.json({
    success: true,
    message: "Tạo bản sao lưu thành công",
    backup,
  });
});
