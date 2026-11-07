import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { withErrors } from "@/lib/http";
import { getBackupSettings, updateBackupSettings, type BackupSettings } from "@/lib/backupService";

// GET /api/admin/backup/settings - Lấy cấu hình tự động sao lưu
export const GET = withErrors(async () => {
  const session = await requirePermission("backup:view");
  if (session instanceof NextResponse) return session;

  const settings = await getBackupSettings();
  return NextResponse.json(settings);
});

// POST /api/admin/backup/settings - Cập nhật cấu hình tự động sao lưu
export const POST = withErrors(async (req: Request) => {
  const session = await requirePermission("backup:manage");
  if (session instanceof NextResponse) return session;

  const body = (await req.json().catch(() => ({}))) as Partial<BackupSettings>;

  const updated = await updateBackupSettings(body, session.userId);

  return NextResponse.json({
    success: true,
    message: "Đã cập nhật cấu hình tự động sao lưu thành công",
    settings: updated,
  });
});
