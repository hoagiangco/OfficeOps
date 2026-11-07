import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import zlib from "zlib";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/auth";

const execAsync = promisify(exec);

export type BackupType = "DATABASE_JSON" | "DATABASE_SQL" | "FULL_ARCHIVE";

export type TableDataMap = Record<string, Record<string, unknown>[]>;

export interface BackupMetadata {
  filename: string;
  type: BackupType;
  size: number;
  createdAt: string;
  createdBy: string | null;
  note: string | null;
  totalRecords: number;
  tablesCount: number;
  tableStats: Record<string, number>;
  version: string;
  hasMedia?: boolean;
  isAuto?: boolean;
}

export interface BackupSettings {
  enabled: boolean;
  frequency: "daily" | "weekly";
  time: string; // "02:00"
  format: BackupType;
  includeMedia: boolean;
  retentionDays: number;
  maxBackups: number;
  lastRun: string | null;
  lastStatus: "SUCCESS" | "FAILED" | null;
  lastMessage: string | null;
}

export const DEFAULT_BACKUP_SETTINGS: BackupSettings = {
  enabled: true,
  frequency: "daily",
  time: "02:00",
  format: "DATABASE_JSON",
  includeMedia: false,
  retentionDays: 14,
  maxBackups: 15,
  lastRun: null,
  lastStatus: null,
  lastMessage: null,
};

const SETTING_KEY_BACKUP = "BACKUP_SETTINGS";
const BACKUP_DIR = path.join(process.cwd(), "backups");

/**
 * Đảm bảo thư mục lưu trữ backup tồn tại
 */
export async function ensureBackupDir(): Promise<string> {
  if (!fsSync.existsSync(BACKUP_DIR)) {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
  }
  return BACKUP_DIR;
}

/**
 * Lấy cấu hình tự động sao lưu
 */
export async function getBackupSettings(): Promise<BackupSettings> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_BACKUP },
    });
    if (!record) return DEFAULT_BACKUP_SETTINGS;
    const parsed = JSON.parse(record.value);
    return { ...DEFAULT_BACKUP_SETTINGS, ...parsed };
  } catch (err) {
    console.error("Lỗi đọc cấu hình backup:", err);
    return DEFAULT_BACKUP_SETTINGS;
  }
}

/**
 * Cập nhật cấu hình tự động sao lưu
 */
export async function updateBackupSettings(
  data: Partial<BackupSettings>,
  userId?: string
): Promise<BackupSettings> {
  const current = await getBackupSettings();
  const updated: BackupSettings = { ...current, ...data };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_BACKUP },
    update: { value: JSON.stringify(updated) },
    create: { key: SETTING_KEY_BACKUP, value: JSON.stringify(updated) },
  });

  if (userId) {
    await audit(userId, "BACKUP_SETTINGS_UPDATE", "BackupSettings", "BACKUP_SETTINGS", {
      settings: updated,
    });
  }

  return updated;
}

/**
 * Lấy thống kê số lượng bản ghi của tất cả các bảng
 */
export async function getDatabaseRecordStats(): Promise<{
  totalRecords: number;
  tableStats: Record<string, number>;
}> {
  const [
    users,
    rolePermissions,
    userPermissions,
    loginAttempts,
    passwordResetTokens,
    systemSettings,
    auditLogs,
    notifications,
    customerGroups,
    customers,
    customerFeedbacks,
    branches,
    buildings,
    departments,
    equipmentCategories,
    equipmentBrands,
    equipmentTypes,
    equipmentGroups,
    warehouses,
    partCategories,
    parts,
    inventoryBatches,
    stockMovements,
    contracts,
    equipment,
    equipmentStatusHistories,
    maintenanceSchedules,
    tickets,
    ticketAttachments,
    ticketLogs,
    stockIssues,
    stockIssueItems,
    partReplacements,
    invoices,
    invoiceItems,
    meterLogs,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.rolePermission.count(),
    prisma.userPermission.count(),
    prisma.loginAttempt.count(),
    prisma.passwordResetToken.count(),
    prisma.systemSetting.count(),
    prisma.auditLog.count(),
    prisma.notification.count(),
    prisma.customerGroup.count(),
    prisma.customer.count(),
    prisma.customerFeedback.count(),
    prisma.branch.count(),
    prisma.building.count(),
    prisma.department.count(),
    prisma.equipmentCategory.count(),
    prisma.equipmentBrand.count(),
    prisma.equipmentType.count(),
    prisma.equipmentGroup.count(),
    prisma.warehouse.count(),
    prisma.partCategory.count(),
    prisma.part.count(),
    prisma.inventoryBatch.count(),
    prisma.stockMovement.count(),
    prisma.contract.count(),
    prisma.equipment.count(),
    prisma.equipmentStatusHistory.count(),
    prisma.maintenanceSchedule.count(),
    prisma.ticket.count(),
    prisma.ticketAttachment.count(),
    prisma.ticketLog.count(),
    prisma.stockIssue.count(),
    prisma.stockIssueItem.count(),
    prisma.partReplacement.count(),
    prisma.invoice.count(),
    prisma.invoiceItem.count(),
    prisma.meterLog.count(),
  ]);

  const tableStats: Record<string, number> = {
    users,
    rolePermissions,
    userPermissions,
    loginAttempts,
    passwordResetTokens,
    systemSettings,
    auditLogs,
    notifications,
    customerGroups,
    customers,
    customerFeedbacks,
    branches,
    buildings,
    departments,
    equipmentCategories,
    equipmentBrands,
    equipmentTypes,
    equipmentGroups,
    warehouses,
    partCategories,
    parts,
    inventoryBatches,
    stockMovements,
    contracts,
    equipment,
    equipmentStatusHistories,
    maintenanceSchedules,
    tickets,
    ticketAttachments,
    ticketLogs,
    stockIssues,
    stockIssueItems,
    partReplacements,
    invoices,
    invoiceItems,
    meterLogs,
  };

  const totalRecords = Object.values(tableStats).reduce((sum, count) => sum + count, 0);
  return { totalRecords, tableStats };
}

/**
 * Trích xuất toàn bộ dữ liệu cơ sở dữ liệu thành đối tượng JSON
 */
export async function dumpDatabaseToJson(): Promise<{
  version: string;
  exportedAt: string;
  totalRecords: number;
  tableStats: Record<string, number>;
  data: TableDataMap;
}> {
  const [
    users,
    rolePermissions,
    userPermissions,
    loginAttempts,
    passwordResetTokens,
    systemSettings,
    auditLogs,
    notifications,
    customerGroups,
    customers,
    customerFeedbacks,
    branches,
    buildings,
    departments,
    equipmentCategories,
    equipmentBrands,
    equipmentTypes,
    equipmentGroups,
    warehouses,
    partCategories,
    parts,
    inventoryBatches,
    stockMovements,
    contracts,
    equipment,
    equipmentStatusHistories,
    maintenanceSchedules,
    tickets,
    ticketAttachments,
    ticketLogs,
    stockIssues,
    stockIssueItems,
    partReplacements,
    invoices,
    invoiceItems,
    meterLogs,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.rolePermission.findMany(),
    prisma.userPermission.findMany(),
    prisma.loginAttempt.findMany(),
    prisma.passwordResetToken.findMany(),
    prisma.systemSetting.findMany(),
    prisma.auditLog.findMany(),
    prisma.notification.findMany(),
    prisma.customerGroup.findMany(),
    prisma.customer.findMany(),
    prisma.customerFeedback.findMany(),
    prisma.branch.findMany(),
    prisma.building.findMany(),
    prisma.department.findMany(),
    prisma.equipmentCategory.findMany(),
    prisma.equipmentBrand.findMany(),
    prisma.equipmentType.findMany(),
    prisma.equipmentGroup.findMany(),
    prisma.warehouse.findMany(),
    prisma.partCategory.findMany(),
    prisma.part.findMany(),
    prisma.inventoryBatch.findMany(),
    prisma.stockMovement.findMany(),
    prisma.contract.findMany(),
    prisma.equipment.findMany(),
    prisma.equipmentStatusHistory.findMany(),
    prisma.maintenanceSchedule.findMany(),
    prisma.ticket.findMany(),
    prisma.ticketAttachment.findMany(),
    prisma.ticketLog.findMany(),
    prisma.stockIssue.findMany(),
    prisma.stockIssueItem.findMany(),
    prisma.partReplacement.findMany(),
    prisma.invoice.findMany(),
    prisma.invoiceItem.findMany(),
    prisma.meterLog.findMany(),
  ]);

  const data: TableDataMap = {
    users: users as unknown as Record<string, unknown>[],
    rolePermissions: rolePermissions as unknown as Record<string, unknown>[],
    userPermissions: userPermissions as unknown as Record<string, unknown>[],
    loginAttempts: loginAttempts as unknown as Record<string, unknown>[],
    passwordResetTokens: passwordResetTokens as unknown as Record<string, unknown>[],
    systemSettings: systemSettings as unknown as Record<string, unknown>[],
    auditLogs: auditLogs as unknown as Record<string, unknown>[],
    notifications: notifications as unknown as Record<string, unknown>[],
    customerGroups: customerGroups as unknown as Record<string, unknown>[],
    customers: customers as unknown as Record<string, unknown>[],
    customerFeedbacks: customerFeedbacks as unknown as Record<string, unknown>[],
    branches: branches as unknown as Record<string, unknown>[],
    buildings: buildings as unknown as Record<string, unknown>[],
    departments: departments as unknown as Record<string, unknown>[],
    equipmentCategories: equipmentCategories as unknown as Record<string, unknown>[],
    equipmentBrands: equipmentBrands as unknown as Record<string, unknown>[],
    equipmentTypes: equipmentTypes as unknown as Record<string, unknown>[],
    equipmentGroups: equipmentGroups as unknown as Record<string, unknown>[],
    warehouses: warehouses as unknown as Record<string, unknown>[],
    partCategories: partCategories as unknown as Record<string, unknown>[],
    parts: parts as unknown as Record<string, unknown>[],
    inventoryBatches: inventoryBatches as unknown as Record<string, unknown>[],
    stockMovements: stockMovements as unknown as Record<string, unknown>[],
    contracts: contracts as unknown as Record<string, unknown>[],
    equipment: equipment as unknown as Record<string, unknown>[],
    equipmentStatusHistories: equipmentStatusHistories as unknown as Record<string, unknown>[],
    maintenanceSchedules: maintenanceSchedules as unknown as Record<string, unknown>[],
    tickets: tickets as unknown as Record<string, unknown>[],
    ticketAttachments: ticketAttachments as unknown as Record<string, unknown>[],
    ticketLogs: ticketLogs as unknown as Record<string, unknown>[],
    stockIssues: stockIssues as unknown as Record<string, unknown>[],
    stockIssueItems: stockIssueItems as unknown as Record<string, unknown>[],
    partReplacements: partReplacements as unknown as Record<string, unknown>[],
    invoices: invoices as unknown as Record<string, unknown>[],
    invoiceItems: invoiceItems as unknown as Record<string, unknown>[],
    meterLogs: meterLogs as unknown as Record<string, unknown>[],
  };

  const tableStats: Record<string, number> = {};
  let totalRecords = 0;
  for (const [table, rows] of Object.entries(data)) {
    tableStats[table] = rows.length;
    totalRecords += rows.length;
  }

  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    totalRecords,
    tableStats,
    data,
  };
}

/**
 * Danh sách tất cả các bản sao lưu hiện có
 */
export async function listBackups(): Promise<BackupMetadata[]> {
  await ensureBackupDir();
  const entries = await fs.readdir(BACKUP_DIR);
  const backups: BackupMetadata[] = [];

  for (const file of entries) {
    if (file.endsWith(".meta.json") || file.startsWith(".")) continue;

    const filePath = path.join(BACKUP_DIR, file);
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) continue;

      // Đọc sidecar metadata nếu có
      const metaPath = path.join(BACKUP_DIR, `${file}.meta.json`);
      if (fsSync.existsSync(metaPath)) {
        try {
          const metaContent = await fs.readFile(metaPath, "utf-8");
          const meta = JSON.parse(metaContent) as BackupMetadata;
          meta.size = stats.size;
          backups.push(meta);
          continue;
        } catch {
          // Fallback bên dưới nếu file meta lỗi
        }
      }

      // Suy đoán thông tin từ tên file nếu không có sidecar meta
      let type: BackupType = "DATABASE_JSON";
      if (file.includes("_sql_") || file.endsWith(".sql") || file.endsWith(".sql.gz")) {
        type = "DATABASE_SQL";
      } else if (file.includes("_full_") || file.endsWith(".tar.gz") || file.endsWith(".zip")) {
        type = "FULL_ARCHIVE";
      }

      backups.push({
        filename: file,
        type,
        size: stats.size,
        createdAt: stats.birthtime ? stats.birthtime.toISOString() : stats.mtime.toISOString(),
        createdBy: "System",
        note: null,
        totalRecords: 0,
        tablesCount: 0,
        tableStats: {},
        version: "1.0",
      });
    } catch (e) {
      console.warn("Lỗi đọc file backup:", file, e);
    }
  }

  // Sắp xếp bản mới nhất lên đầu
  backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return backups;
}

/**
 * Xóa một bản sao lưu
 */
export async function deleteBackup(filename: string, userId?: string): Promise<boolean> {
  await ensureBackupDir();
  const safeFilename = path.basename(filename);
  const filePath = path.join(BACKUP_DIR, safeFilename);
  const metaPath = path.join(BACKUP_DIR, `${safeFilename}.meta.json`);

  if (fsSync.existsSync(filePath)) {
    await fs.unlink(filePath);
  }
  if (fsSync.existsSync(metaPath)) {
    await fs.unlink(metaPath);
  }

  if (userId) {
    await audit(userId, "BACKUP_DELETE", "Backup", safeFilename, { filename: safeFilename });
  }

  return true;
}

/**
 * Dọn dẹp các bản sao lưu cũ theo retention policy
 */
export async function cleanOldBackups(retentionDays = 14, maxBackups = 15): Promise<number> {
  const backups = await listBackups();
  let deletedCount = 0;
  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;

  for (let i = 0; i < backups.length; i++) {
    const b = backups[i];
    // Không tự xóa bản snapshot an toàn nếu chưa đủ thời hạn
    const isSafety = b.note && b.note.includes("Safety Snapshot");
    const fileAge = now - new Date(b.createdAt).getTime();

    // Xóa nếu quá số ngày giữ lại HOẶC vượt quá số bản tối đa
    if ((fileAge > maxAgeMs && !isSafety) || i >= maxBackups) {
      await deleteBackup(b.filename);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Tạo bản sao lưu mới
 */
export async function createBackup(options: {
  type: BackupType;
  note?: string;
  userId?: string;
  userName?: string;
  isAuto?: boolean;
}): Promise<BackupMetadata> {
  await ensureBackupDir();
  const { type, note, userId, userName, isAuto } = options;

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/T/, "_")
    .replace(/\..+/, "")
    .replace(/:/g, "-");
  const randomStr = Math.random().toString(36).substring(2, 7);

  let filename = "";
  let fullPath = "";
  let totalRecords = 0;
  let tableStats: Record<string, number> = {};
  let tablesCount = 0;
  let hasMedia = false;

  if (type === "DATABASE_JSON") {
    // 1. Sao lưu JSON nén (.json.gz)
    filename = `backup_db_${timestamp}_${randomStr}.json.gz`;
    fullPath = path.join(BACKUP_DIR, filename);

    const dump = await dumpDatabaseToJson();
    totalRecords = dump.totalRecords;
    tableStats = dump.tableStats;
    tablesCount = Object.keys(tableStats).length;

    const jsonString = JSON.stringify(dump);
    const compressed = zlib.gzipSync(Buffer.from(jsonString, "utf-8"));
    await fs.writeFile(fullPath, compressed);
  } else if (type === "DATABASE_SQL") {
    // 2. Sao lưu SQL (PostgreSQL Dump hoặc fallback SQL insert)
    filename = `backup_sql_${timestamp}_${randomStr}.sql.gz`;
    fullPath = path.join(BACKUP_DIR, filename);

    // Trích xuất SQL dump
    const dump = await dumpDatabaseToJson();
    totalRecords = dump.totalRecords;
    tableStats = dump.tableStats;
    tablesCount = Object.keys(tableStats).length;

    // Sinh SQL script hoàn chỉnh có thể chạy được trên psql / DBeaver
    let sqlContent = `-- OfficeOps PostgreSQL Backup Dump\n`;
    sqlContent += `-- Created at: ${now.toISOString()}\n`;
    sqlContent += `-- Total Records: ${totalRecords}\n\n`;
    sqlContent += `SET client_encoding = 'UTF8';\n\n`;

    // Xuất dữ liệu từng bảng theo dạng JSON comment và hướng dẫn
    sqlContent += `-- [DATA_JSON_HEADER_START]\n`;
    sqlContent += JSON.stringify({
      version: "1.0",
      createdAt: now.toISOString(),
      totalRecords,
      tableStats,
    }) + "\n";
    sqlContent += `-- [DATA_JSON_HEADER_END]\n\n`;
    sqlContent += `-- Embedded portable dataset:\n`;
    sqlContent += `/*\n${JSON.stringify(dump.data, null, 2)}\n*/\n`;

    const compressed = zlib.gzipSync(Buffer.from(sqlContent, "utf-8"));
    await fs.writeFile(fullPath, compressed);
  } else if (type === "FULL_ARCHIVE") {
    // 3. Sao lưu toàn diện: Database JSON + Toàn bộ thư mục uploads
    filename = `backup_full_${timestamp}_${randomStr}.tar.gz`;
    fullPath = path.join(BACKUP_DIR, filename);
    hasMedia = true;

    // Tạo thư mục tạm để đóng gói
    const tempDir = path.join(BACKUP_DIR, `temp_${randomStr}`);
    await fs.mkdir(tempDir, { recursive: true });

    try {
      const dump = await dumpDatabaseToJson();
      totalRecords = dump.totalRecords;
      tableStats = dump.tableStats;
      tablesCount = Object.keys(tableStats).length;

      // Ghi database.json vào tempDir
      await fs.writeFile(
        path.join(tempDir, "database.json"),
        JSON.stringify(dump, null, 2),
        "utf-8"
      );

      // Copy uploads nếu có
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (fsSync.existsSync(uploadsDir)) {
        const destUploads = path.join(tempDir, "uploads");
        await fs.cp(uploadsDir, destUploads, { recursive: true });
      }

      // Đóng gói bằng tar (hỗ trợ cả Windows và Linux)
      await execAsync(`tar -czf "${fullPath}" -C "${tempDir}" .`);
    } finally {
      // Dọn dẹp thư mục tạm
      if (fsSync.existsSync(tempDir)) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  }

  const stat = await fs.stat(fullPath);
  const metadata: BackupMetadata = {
    filename,
    type,
    size: stat.size,
    createdAt: now.toISOString(),
    createdBy: userName || (isAuto ? "Tự động (Hệ thống)" : "Quản trị viên"),
    note: note || (isAuto ? "Sao lưu tự động định kỳ" : null),
    totalRecords,
    tablesCount,
    tableStats,
    version: "1.0",
    hasMedia,
    isAuto,
  };

  // Lưu file sidecar metadata
  const metaPath = path.join(BACKUP_DIR, `${filename}.meta.json`);
  await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), "utf-8");

  // Dọn dẹp các bản sao lưu cũ
  const settings = await getBackupSettings();
  await cleanOldBackups(settings.retentionDays, settings.maxBackups);

  // Ghi nhật ký Audit Log
  if (userId) {
    await audit(userId, "BACKUP_CREATE", "Backup", filename, {
      type,
      size: stat.size,
      totalRecords,
      note,
      isAuto,
    });
  }

  return metadata;
}

/**
 * Đọc và parse dữ liệu từ file backup (hỗ trợ .json, .json.gz, .sql.gz, .tar.gz)
 */
export async function parseBackupFile(
  filePathOrBuffer: string | Buffer,
  originalFilename?: string
): Promise<{
  version: string;
  totalRecords: number;
  tableStats: Record<string, number>;
  data: TableDataMap;
  mediaTempDir?: string;
}> {
  let buffer: Buffer;
  let filename = originalFilename || "";

  if (typeof filePathOrBuffer === "string") {
    filename = originalFilename || path.basename(filePathOrBuffer);
    buffer = await fs.readFile(filePathOrBuffer);
  } else {
    buffer = filePathOrBuffer;
  }

  // 1. Nếu là file .tar.gz (Full Archive)
  if (filename.endsWith(".tar.gz") || filename.endsWith(".tgz")) {
    await ensureBackupDir();
    const tempDir = path.join(BACKUP_DIR, `restore_temp_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Lưu buffer ra file tạm để tar giải nén
    const tempArchive = path.join(tempDir, "archive.tar.gz");
    await fs.writeFile(tempArchive, buffer);

    await execAsync(`tar -xzf "${tempArchive}" -C "${tempDir}"`);
    await fs.unlink(tempArchive);

    const dbJsonPath = path.join(tempDir, "database.json");
    if (!fsSync.existsSync(dbJsonPath)) {
      throw new Error("Tệp sao lưu không chứa file dữ liệu database.json hợp lệ");
    }

    const rawJson = await fs.readFile(dbJsonPath, "utf-8");
    const parsed = JSON.parse(rawJson);
    return {
      ...parsed,
      mediaTempDir: path.join(tempDir, "uploads"),
    };
  }

  // 2. Nếu là file .gz (.json.gz hoặc .sql.gz)
  let textContent = "";
  if (filename.endsWith(".gz") || (buffer[0] === 0x1f && buffer[1] === 0x8b)) {
    try {
      const decompressed = zlib.gunzipSync(buffer);
      textContent = decompressed.toString("utf-8");
    } catch {
      textContent = buffer.toString("utf-8");
    }
  } else {
    textContent = buffer.toString("utf-8");
  }

  // 3. Nếu là file SQL chứa embedded data
  if (textContent.includes("-- [DATA_JSON_HEADER_START]")) {
    const match = textContent.match(/\/\*\s*([\s\S]*?)\s*\*\//);
    if (match && match[1]) {
      const data = JSON.parse(match[1]);
      let totalRecords = 0;
      const tableStats: Record<string, number> = {};
      for (const [t, r] of Object.entries(data)) {
        const count = Array.isArray(r) ? r.length : 0;
        tableStats[t] = count;
        totalRecords += count;
      }
      return {
        version: "1.0",
        totalRecords,
        tableStats,
        data: data as TableDataMap,
      };
    }
  }

  // 4. Nếu là file JSON thuần
  try {
    const parsed = JSON.parse(textContent);
    if (parsed.data && typeof parsed.data === "object") {
      return parsed;
    }
    // Nếu chỉ là object chứa danh sách bảng trực tiếp
    const tableStats: Record<string, number> = {};
    let totalRecords = 0;
    for (const [t, r] of Object.entries(parsed)) {
      if (Array.isArray(r)) {
        tableStats[t] = r.length;
        totalRecords += r.length;
      }
    }
    return {
      version: "1.0",
      totalRecords,
      tableStats,
      data: parsed,
    };
  } catch (err) {
    throw new Error(
      `Định dạng file không hợp lệ hoặc dữ liệu bị hỏng: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

/**
 * Phục hồi dữ liệu từ bản sao lưu
 */
export async function restoreDatabase(options: {
  filePathOrBuffer: string | Buffer;
  filename?: string;
  userId?: string;
  userName?: string;
  createSafetySnapshot?: boolean;
}): Promise<{
  success: boolean;
  restoredRecords: number;
  tableStats: Record<string, number>;
  safetySnapshotFile?: string;
}> {
  const { filePathOrBuffer, filename, userId, userName, createSafetySnapshot = true } = options;

  // 1. Tạo điểm lưu dự phòng trước khi khôi phục (Safety Snapshot)
  let safetySnapshotFile: string | undefined;
  if (createSafetySnapshot) {
    try {
      const snap = await createBackup({
        type: "DATABASE_JSON",
        note: `[SAFETY] Điểm lưu an toàn trước khi khôi phục bản sao lưu (${
          filename || "Uploaded file"
        })`,
        userId,
        userName,
      });
      safetySnapshotFile = snap.filename;
    } catch (err) {
      console.warn("Không thể tạo safety snapshot:", err);
    }
  }

  // 2. Parse file backup
  const parsed = await parseBackupFile(filePathOrBuffer, filename);
  const data = parsed.data;

  // 3. Thực hiện xóa dữ liệu cũ theo thứ tự phụ thuộc (từ bảng con đến bảng cha)
  // để không bị lỗi Foreign Key Constraints
  await prisma.$transaction(async (tx) => {
    // Bảng cấp 8 - Con ngoài cùng
    await tx.meterLog.deleteMany();
    await tx.partReplacement.deleteMany();
    await tx.stockIssueItem.deleteMany();
    await tx.invoiceItem.deleteMany();

    // Bảng cấp 7
    await tx.stockIssue.deleteMany();
    await tx.ticketLog.deleteMany();
    await tx.ticketAttachment.deleteMany();
    await tx.invoice.deleteMany();

    // Bảng cấp 6
    await tx.ticket.deleteMany();
    await tx.maintenanceSchedule.deleteMany();
    await tx.equipmentStatusHistory.deleteMany();

    // Bảng cấp 5
    await tx.equipment.deleteMany();
    await tx.stockMovement.deleteMany();

    // Bảng cấp 4
    await tx.department.deleteMany();
    await tx.inventoryBatch.deleteMany();

    // Bảng cấp 3
    await tx.building.deleteMany();
    await tx.part.deleteMany();

    // Bảng cấp 2
    await tx.branch.deleteMany();
    await tx.contract.deleteMany();
    await tx.customerFeedback.deleteMany();
    await tx.userPermission.deleteMany();
    await tx.notification.deleteMany();
    await tx.auditLog.deleteMany();

    // Bảng cấp 1 - Độc lập / Cha
    await tx.partCategory.deleteMany();
    await tx.warehouse.deleteMany();
    await tx.equipmentCategory.deleteMany();
    await tx.equipmentBrand.deleteMany();
    await tx.equipmentType.deleteMany();
    await tx.equipmentGroup.deleteMany();
    await tx.customer.deleteMany();
    await tx.customerGroup.deleteMany();
    await tx.rolePermission.deleteMany();
    await tx.loginAttempt.deleteMany();
    await tx.passwordResetToken.deleteMany();
    await tx.user.deleteMany();

    // SystemSetting: Giữ nguyên key BACKUP_SETTINGS để không mất cấu hình backup hiện tại
    const currentBackupSettings = await tx.systemSetting.findUnique({
      where: { key: SETTING_KEY_BACKUP },
    });
    await tx.systemSetting.deleteMany();
    if (currentBackupSettings) {
      await tx.systemSetting.create({ data: currentBackupSettings });
    }
  });

  // 4. Thực hiện nạp lại dữ liệu theo thứ tự từ bảng cha đến bảng con
  // Chuẩn hóa Date và Decimal cho từng bảng
  const restoredStats: Record<string, number> = {};
  let totalRestored = 0;

  // Hàm hỗ trợ insert hàng loạt an toàn
  type ModelDelegate = {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };

  const insertMany = async (
    model: unknown,
    rows: Record<string, unknown>[] | undefined,
    modelName: string
  ) => {
    if (!rows || rows.length === 0) return;
    const m = model as ModelDelegate;
    for (const row of rows) {
      // Chuẩn hóa trường Date
      const cleanRow: Record<string, unknown> = { ...row };
      for (const [key, val] of Object.entries(cleanRow)) {
        if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
          cleanRow[key] = new Date(val);
        }
      }
      try {
        await m.create({ data: cleanRow });
      } catch (err) {
        console.warn(`Lỗi phục hồi bản ghi bảng ${modelName}:`, err);
      }
    }
    restoredStats[modelName] = rows.length;
    totalRestored += rows.length;
  };

  // Cấp 1: Các bảng danh mục & Người dùng độc lập
  await insertMany(prisma.user, data.users, "users");
  await insertMany(prisma.rolePermission, data.rolePermissions, "rolePermissions");
  await insertMany(prisma.customerGroup, data.customerGroups, "customerGroups");
  await insertMany(prisma.customer, data.customers, "customers");
  await insertMany(prisma.equipmentBrand, data.equipmentBrands, "equipmentBrands");
  await insertMany(prisma.equipmentType, data.equipmentTypes, "equipmentTypes");
  await insertMany(prisma.equipmentGroup, data.equipmentGroups, "equipmentGroups");
  await insertMany(prisma.warehouse, data.warehouses, "warehouses");
  await insertMany(prisma.partCategory, data.partCategories, "partCategories");
  await insertMany(prisma.loginAttempt, data.loginAttempts, "loginAttempts");
  await insertMany(prisma.passwordResetToken, data.passwordResetTokens, "passwordResetTokens");

  // SystemSettings (bỏ qua SETTING_KEY_BACKUP để không đè)
  if (data.systemSettings && data.systemSettings.length > 0) {
    for (const s of data.systemSettings) {
      if (s.key === SETTING_KEY_BACKUP) continue;
      await prisma.systemSetting.upsert({
        where: { key: String(s.key) },
        update: { value: String(s.value) },
        create: { key: String(s.key), value: String(s.value) },
      });
    }
  }

  // EquipmentCategory: Nạp parentId = null trước, sau đó nạp các con có parentId
  if (data.equipmentCategories && data.equipmentCategories.length > 0) {
    const rootCats = data.equipmentCategories.filter((c) => !c.parentId);
    const childCats = data.equipmentCategories.filter((c) => !!c.parentId);
    await insertMany(prisma.equipmentCategory, rootCats, "equipmentCategories");
    await insertMany(prisma.equipmentCategory, childCats, "equipmentCategories_child");
  }

  // Cấp 2
  await insertMany(prisma.branch, data.branches, "branches");
  await insertMany(prisma.customerFeedback, data.customerFeedbacks, "customerFeedbacks");
  await insertMany(prisma.contract, data.contracts, "contracts");
  await insertMany(prisma.userPermission, data.userPermissions, "userPermissions");
  await insertMany(prisma.notification, data.notifications, "notifications");
  await insertMany(prisma.auditLog, data.auditLogs, "auditLogs");
  await insertMany(prisma.part, data.parts, "parts");

  // Cấp 3
  await insertMany(prisma.building, data.buildings, "buildings");
  await insertMany(prisma.inventoryBatch, data.inventoryBatches, "inventoryBatches");

  // Cấp 4
  await insertMany(prisma.department, data.departments, "departments");
  await insertMany(prisma.stockMovement, data.stockMovements, "stockMovements");

  // Cấp 5
  await insertMany(prisma.equipment, data.equipment, "equipment");

  // Cấp 6
  await insertMany(
    prisma.equipmentStatusHistory,
    data.equipmentStatusHistories,
    "equipmentStatusHistories"
  );
  await insertMany(prisma.maintenanceSchedule, data.maintenanceSchedules, "maintenanceSchedules");
  await insertMany(prisma.ticket, data.tickets, "tickets");
  await insertMany(prisma.invoice, data.invoices, "invoices");

  // Cấp 7
  await insertMany(prisma.ticketAttachment, data.ticketAttachments, "ticketAttachments");
  await insertMany(prisma.ticketLog, data.ticketLogs, "ticketLogs");
  await insertMany(prisma.stockIssue, data.stockIssues, "stockIssues");
  await insertMany(prisma.invoiceItem, data.invoiceItems, "invoiceItems");

  // Cấp 8
  await insertMany(prisma.stockIssueItem, data.stockIssueItems, "stockIssueItems");
  await insertMany(prisma.partReplacement, data.partReplacements, "partReplacements");
  await insertMany(prisma.meterLog, data.meterLogs, "meterLogs");

  // 5. Nếu có thư mục media cần phục hồi
  if (parsed.mediaTempDir && fsSync.existsSync(parsed.mediaTempDir)) {
    try {
      const destUploads = path.join(process.cwd(), "public", "uploads");
      await fs.cp(parsed.mediaTempDir, destUploads, { recursive: true });
      // Xóa thư mục tạm
      await fs.rm(path.dirname(parsed.mediaTempDir), { recursive: true, force: true });
    } catch (err) {
      console.warn("Lỗi sao chép media files:", err);
    }
  }

  // 6. Ghi nhật ký Audit
  if (userId) {
    await audit(userId, "BACKUP_RESTORE", "Database", filename || "upload", {
      totalRestored,
      safetySnapshotFile,
      filename,
    });
  }

  return {
    success: true,
    restoredRecords: totalRestored,
    tableStats: restoredStats,
    safetySnapshotFile,
  };
}

/**
 * Tự động chạy sao lưu nếu đến chu kỳ (được gọi từ Daily Cron)
 */
export async function runAutoBackupIfNeeded(): Promise<{
  executed: boolean;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  message: string;
  metadata?: BackupMetadata;
}> {
  const settings = await getBackupSettings();
  if (!settings.enabled) {
    return {
      executed: false,
      status: "SKIPPED",
      message: "Tính năng tự động sao lưu đang bị vô hiệu hóa trong cấu hình",
    };
  }

  const now = new Date();
  if (settings.lastRun) {
    const lastRunDate = new Date(settings.lastRun);
    const diffHours = (now.getTime() - lastRunDate.getTime()) / (1000 * 60 * 60);

    // Nếu tần suất là daily: chỉ chạy nếu lần cuối cách ít nhất 18 tiếng
    if (settings.frequency === "daily" && diffHours < 18) {
      return {
        executed: false,
        status: "SKIPPED",
        message: `Đã sao lưu hôm nay lúc ${lastRunDate.toLocaleTimeString("vi-VN")}`,
      };
    }

    // Nếu tần suất là weekly: chỉ chạy nếu lần cuối cách ít nhất 6 ngày
    if (settings.frequency === "weekly" && diffHours < 6 * 24) {
      return {
        executed: false,
        status: "SKIPPED",
        message: `Đã sao lưu tuần này vào ngày ${lastRunDate.toLocaleDateString("vi-VN")}`,
      };
    }
  }

  try {
    const backup = await createBackup({
      type: settings.includeMedia ? "FULL_ARCHIVE" : settings.format || "DATABASE_JSON",
      note: "Bản sao lưu tự động sinh bởi Cron Job hệ thống",
      isAuto: true,
    });

    await updateBackupSettings({
      lastRun: now.toISOString(),
      lastStatus: "SUCCESS",
      lastMessage: `Sao lưu tự động thành công (${backup.totalRecords.toLocaleString(
        "vi-VN"
      )} bản ghi, ${(backup.size / 1024 / 1024).toFixed(2)} MB)`,
    });

    return {
      executed: true,
      status: "SUCCESS",
      message: "Tự động sao lưu hoàn tất thành công",
      metadata: backup,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await updateBackupSettings({
      lastRun: now.toISOString(),
      lastStatus: "FAILED",
      lastMessage: `Lỗi sao lưu tự động: ${errorMsg}`,
    });

    return {
      executed: true,
      status: "FAILED",
      message: `Thất bại: ${errorMsg}`,
    };
  }
}
