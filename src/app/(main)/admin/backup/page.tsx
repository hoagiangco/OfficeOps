"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ModalShell from "@/components/ModalShell";
import { AdminNavTabs } from "@/components/admin/AdminNavTabs";
import { type BackupType, type BackupMetadata, type BackupSettings } from "@/lib/backupService";

// Bảng dịch tên hiển thị tiếng Việt cho các model/bảng dữ liệu
const TABLE_LABELS: Record<string, string> = {
  users: "Tài khoản nhân viên & Kỹ thuật",
  rolePermissions: "Ma trận phân quyền theo vai trò",
  userPermissions: "Phân quyền chi tiết người dùng",
  loginAttempts: "Lịch sử đăng nhập",
  passwordResetTokens: "Mã đặt lại mật khẩu",
  systemSettings: "Cấu hình hệ thống & Doanh nghiệp",
  auditLogs: "Nhật ký kiểm toán truy vết",
  notifications: "Thông báo nội bộ",
  customerGroups: "Nhóm khách hàng",
  customers: "Khách hàng & Doanh nghiệp",
  customerFeedbacks: "Ý kiến phản hồi của khách hàng",
  branches: "Chi nhánh khách hàng",
  buildings: "Tòa nhà lắp đặt",
  departments: "Phòng ban / Vị trí chi tiết",
  equipmentCategories: "Danh mục phân cấp thiết bị",
  equipmentBrands: "Hãng sản xuất máy",
  equipmentTypes: "Loại máy (Photocopy, Máy in...)",
  equipmentGroups: "Nhóm máy kỹ thuật",
  warehouses: "Kho bãi lưu trữ",
  partCategories: "Danh mục linh kiện vật tư",
  parts: "Vật tư & Linh kiện",
  inventoryBatches: "Lô hàng tồn kho (FIFO)",
  stockMovements: "Sổ cái xuất - nhập - tồn",
  contracts: "Hợp đồng dịch vụ & Thuê máy",
  equipment: "Máy móc & Thiết bị",
  equipmentStatusHistories: "Lịch sử trạng thái thiết bị",
  maintenanceSchedules: "Kế hoạch bảo trì định kỳ",
  tickets: "Phiếu kỹ thuật & Báo sự cố",
  ticketAttachments: "Tệp tin & Ảnh đính kèm phiếu",
  ticketLogs: "Lịch sử tiến trình xử lý phiếu",
  stockIssues: "Phiếu xuất kho linh kiện",
  stockIssueItems: "Chi tiết vật tư xuất kho",
  partReplacements: "Lịch sử linh kiện thay thế",
  invoices: "Hóa đơn cước thanh toán",
  invoiceItems: "Chi tiết cước và phụ phí",
  meterLogs: "Chỉ số Counter & Bản in",
};

export default function AdminBackupPage() {
  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [stats, setStats] = useState<{
    totalRecords: number;
    tableStats: Record<string, number>;
  }>({ totalRecords: 0, tableStats: {} });
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState("");

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);

  // Form states for Create Backup
  const [createType, setCreateType] = useState<BackupType>("DATABASE_JSON");
  const [createNote, setCreateNote] = useState("");

  // Target backup for Restore
  const [targetRestoreBackup, setTargetRestoreBackup] = useState<BackupMetadata | null>(null);
  const [restoreConfirmKeyword, setRestoreConfirmKeyword] = useState("");
  const [restoreSafetySnapshot, setRestoreSafetySnapshot] = useState(true);

  // Form state for Upload & Restore
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSafetySnapshot, setUploadSafetySnapshot] = useState(true);
  const [uploadConfirmKeyword, setUploadConfirmKeyword] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state for Settings
  const [editSettings, setEditSettings] = useState<BackupSettings | null>(null);

  // Search filter for Table Stats Modal
  const [statsSearch, setStatsSearch] = useState("");

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup");
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Không thể tải danh sách bản sao lưu");
      }
      const data = await res.json();
      setBackups(data.backups || []);
      setStats(data.stats || { totalRecords: 0, tableStats: {} });
      setSettings(data.settings || null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/admin/backup");
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Không thể tải danh sách bản sao lưu");
        }
        const data = await res.json();
        if (!ignore) {
          setBackups(data.backups || []);
          setStats(data.stats || { totalRecords: 0, tableStats: {} });
          setSettings(data.settings || null);
        }
      } catch (err: unknown) {
        if (!ignore) {
          toast.error(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      ignore = true;
    };
  }, []);

  // Format kích thước file
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Format ngày giờ
  const formatDateTime = (dateStr: string): string => {
    if (!dateStr) return "Chưa có";
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  // Tính tổng dung lượng tất cả các bản sao lưu
  const totalStorageBytes = backups.reduce((sum, b) => sum + (b.size || 0), 0);

  // Xử lý tạo bản sao lưu mới
  const handleCreateBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setProcessingMessage("Hệ thống đang trích xuất và đóng gói dữ liệu sao lưu...");
    setShowCreateModal(false);

    try {
      const res = await fetch("/api/admin/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: createType,
          note: createNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lỗi tạo bản sao lưu");

      toast.success(
        `Đã tạo bản sao lưu thành công (${data.backup?.totalRecords?.toLocaleString("vi-VN")} bản ghi)!`
      );
      setCreateNote("");
      await handleRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Thao tác thất bại");
    } finally {
      setProcessing(false);
      setProcessingMessage("");
    }
  };

  // Xử lý tải về bản sao lưu
  const handleDownload = (filename: string) => {
    window.open(`/api/admin/backup/${encodeURIComponent(filename)}`, "_blank");
  };

  // Xử lý xóa bản sao lưu
  const handleDelete = async (backup: BackupMetadata) => {
    if (
      !confirm(
        `Bạn có chắc chắn muốn xóa bản sao lưu "${backup.filename}" (${formatFileSize(
          backup.size
        )}) không?\nHành động này không thể hoàn tác.`
      )
    ) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/backup/${encodeURIComponent(backup.filename)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể xóa bản sao lưu");

      toast.success("Đã xóa bản sao lưu thành công");
      await handleRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi xóa bản sao lưu");
    }
  };

  // Mở modal khôi phục cho một bản sao lưu cụ thể
  const openRestoreModal = (backup: BackupMetadata) => {
    setTargetRestoreBackup(backup);
    setRestoreConfirmKeyword("");
    setRestoreSafetySnapshot(true);
    setShowRestoreModal(true);
  };

  // Thực hiện khôi phục từ file có sẵn trên máy chủ
  const handleExecuteRestore = async () => {
    if (!targetRestoreBackup) return;
    if (restoreConfirmKeyword.trim().toUpperCase() !== "KHOI PHUC") {
      toast.warn("Vui lòng gõ chính xác cụm từ 'KHOI PHUC' để xác nhận");
      return;
    }

    setProcessing(true);
    setProcessingMessage(
      "Đang khôi phục dữ liệu cơ sở dữ liệu... Quá trình này có thể mất từ 10 - 60 giây. Vui lòng không đóng trình duyệt!"
    );
    setShowRestoreModal(false);

    try {
      const res = await fetch("/api/admin/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: targetRestoreBackup.filename,
          createSafetySnapshot: restoreSafetySnapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Khôi phục dữ liệu thất bại");

      toast.success(data.message || "Khôi phục dữ liệu thành công!");
      await handleRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi khôi phục dữ liệu");
    } finally {
      setProcessing(false);
      setProcessingMessage("");
    }
  };

  // Thực hiện tải lên và khôi phục từ file người dùng upload
  const handleUploadAndRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) {
      toast.warn("Vui lòng chọn tệp tin sao lưu từ máy tính của bạn");
      return;
    }
    if (uploadConfirmKeyword.trim().toUpperCase() !== "KHOI PHUC") {
      toast.warn("Vui lòng gõ chính xác cụm từ 'KHOI PHUC' để xác nhận");
      return;
    }

    setProcessing(true);
    setProcessingMessage(
      "Đang tải lên và nạp dữ liệu từ tệp tin... Vui lòng không làm mới hoặc đóng trang!"
    );
    setShowUploadModal(false);

    try {
      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("createSafetySnapshot", String(uploadSafetySnapshot));

      const res = await fetch("/api/admin/backup/restore", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Khôi phục từ tệp tin thất bại");

      toast.success(data.message || "Khôi phục dữ liệu từ tệp tin thành công!");
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await handleRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi nạp tệp tin sao lưu");
    } finally {
      setProcessing(false);
      setProcessingMessage("");
    }
  };

  // Mở modal cấu hình tự động sao lưu
  const openSettingsModal = () => {
    if (settings) {
      setEditSettings({ ...settings });
    }
    setShowSettingsModal(true);
  };

  // Lưu cấu hình tự động sao lưu
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSettings) return;

    try {
      const res = await fetch("/api/admin/backup/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editSettings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu cấu hình");

      toast.success("Đã cập nhật cấu hình tự động sao lưu!");
      setSettings(data.settings);
      setShowSettingsModal(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu cấu hình");
    }
  };

  // Render badge loại sao lưu
  const renderTypeBadge = (type: BackupType, hasMedia?: boolean) => {
    if (type === "DATABASE_JSON") {
      return (
        <span className="badge bg-primary-subtle text-primary border border-primary-subtle d-inline-flex align-items-center gap-1.5 py-1 px-2.5">
          <i className="fas fa-file-code"></i>
          <span>JSON Snapshot</span>
        </span>
      );
    }
    if (type === "DATABASE_SQL") {
      return (
        <span className="badge bg-purple-subtle text-purple border border-purple-subtle d-inline-flex align-items-center gap-1.5 py-1 px-2.5" style={{ backgroundColor: "#f3e8ff", color: "#6b21a8", borderColor: "#d8b4fe" }}>
          <i className="fas fa-database"></i>
          <span>PostgreSQL SQL</span>
        </span>
      );
    }
    return (
      <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1.5 py-1 px-2.5">
        <i className="fas fa-box-archive"></i>
        <span>Toàn bộ hệ thống {hasMedia ? "+ Media" : ""}</span>
      </span>
    );
  };

  return (
    <div className="container-fluid p-3 p-md-4">
      {/* Tiêu đề & Nút thao tác chính */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2 text-muted small mb-1">
            <Link href="/admin" className="text-decoration-none text-muted">
              Quản trị
            </Link>
            <span>/</span>
            <span className="text-dark fw-medium">Sao lưu & Phục hồi</span>
          </div>
          <h4 className="fw-bold text-dark m-0 d-flex align-items-center gap-2">
            <i className="fas fa-database text-primary"></i>
            <span>Trung tâm Sao lưu & Khôi phục Dữ liệu</span>
          </h4>
        </div>

        <div className="d-flex align-items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || processing}
            className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1.5 py-2 px-3 fw-medium"
            title="Tải lại danh sách bản sao lưu"
          >
            <i className={`fas fa-rotate ${loading ? "fa-spin" : ""}`}></i>
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            onClick={openSettingsModal}
            className="btn btn-outline-primary btn-sm d-inline-flex align-items-center gap-1.5 py-2 px-3 fw-medium shadow-xs"
          >
            <i className="fas fa-sliders"></i>
            <span>Cấu hình tự động</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUploadFile(null);
              setUploadConfirmKeyword("");
              setUploadSafetySnapshot(true);
              setShowUploadModal(true);
            }}
            disabled={processing}
            className="btn btn-outline-warning text-dark btn-sm d-inline-flex align-items-center gap-1.5 py-2 px-3 fw-semibold shadow-xs"
          >
            <i className="fas fa-cloud-arrow-up text-warning"></i>
            <span>Tải file lên để khôi phục</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCreateNote("");
              setShowCreateModal(true);
            }}
            disabled={processing}
            className="btn btn-primary btn-sm d-inline-flex align-items-center gap-1.5 py-2 px-3 fw-semibold shadow-sm"
          >
            <i className="fas fa-plus-circle"></i>
            <span>Tạo bản sao lưu ngay</span>
          </button>
        </div>
      </div>

      {/* Tabs Quản trị Hệ Thống */}
      <AdminNavTabs activeTab="backup" />

      {/* Banner cảnh báo khi đang xử lý tác vụ sao lưu / khôi phục */}
      {processing && (
        <div className="alert alert-primary d-flex align-items-center gap-3 shadow-sm border-primary mb-4 p-3 rounded-3 animate-pulse">
          <div className="spinner-border text-primary flex-shrink-0" role="status">
            <span className="visually-hidden">Đang xử lý...</span>
          </div>
          <div>
            <h6 className="fw-bold mb-1 text-primary d-flex align-items-center gap-2">
              <i className="fas fa-gear fa-spin"></i>
              <span>Hệ thống đang thực thi tác vụ sao lưu / khôi phục</span>
            </h6>
            <div className="small text-secondary">{processingMessage}</div>
          </div>
        </div>
      )}

      {/* 4 Thẻ Thống kê Tổng quan (Summary Cards) */}
      <div className="row g-3 mb-4">
        {/* Thẻ 1: Bản sao lưu hiện có */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-3 bg-white border-start border-4 border-primary">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-secondary small fw-semibold">Bản sao lưu lưu trữ</span>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle bg-primary-subtle text-primary"
                style={{ width: "38px", height: "38px" }}
              >
                <i className="fas fa-server"></i>
              </div>
            </div>
            <div className="d-flex align-items-baseline gap-2">
              <h3 className="fw-bold text-dark mb-0">{backups.length}</h3>
              <span className="text-muted small">bản lưu trữ</span>
            </div>
            <div className="text-muted small mt-2 d-flex align-items-center gap-1">
              <i className="fas fa-hard-drive opacity-75"></i>
              <span>Tổng dung lượng: </span>
              <strong className="text-dark">{formatFileSize(totalStorageBytes)}</strong>
            </div>
          </div>
        </div>

        {/* Thẻ 2: Tổng số bản ghi trong Cơ sở dữ liệu */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-3 bg-white border-start border-4 border-info">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-secondary small fw-semibold">Dữ liệu hiện hành</span>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle bg-info-subtle text-info"
                style={{ width: "38px", height: "38px" }}
              >
                <i className="fas fa-database"></i>
              </div>
            </div>
            <div className="d-flex align-items-baseline gap-2">
              <h3 className="fw-bold text-dark mb-0">
                {stats.totalRecords.toLocaleString("vi-VN")}
              </h3>
              <span className="text-muted small">bản ghi</span>
            </div>
            <div className="mt-2 d-flex align-items-center justify-content-between">
              <span className="text-muted small">
                Trên <strong>{Object.keys(stats.tableStats || {}).length}</strong> bảng dữ liệu
              </span>
              <button
                type="button"
                onClick={() => setShowStatsModal(true)}
                className="btn btn-link btn-sm p-0 text-decoration-none small fw-semibold"
              >
                Xem chi tiết &rarr;
              </button>
            </div>
          </div>
        </div>

        {/* Thẻ 3: Tự động sao lưu định kỳ */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-3 bg-white border-start border-4 border-success">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-secondary small fw-semibold">Tự động sao lưu</span>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle bg-success-subtle text-success"
                style={{ width: "38px", height: "38px" }}
              >
                <i className="fas fa-clock-rotate-left"></i>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2 mb-1">
              {settings?.enabled ? (
                <span className="badge bg-success d-inline-flex align-items-center gap-1 px-2 py-1">
                  <i className="fas fa-circle-check"></i>
                  <span>ĐANG HOẠT ĐỘNG</span>
                </span>
              ) : (
                <span className="badge bg-secondary d-inline-flex align-items-center gap-1 px-2 py-1">
                  <i className="fas fa-circle-pause"></i>
                  <span>ĐANG TẮT</span>
                </span>
              )}
              <span className="text-muted small">
                {settings?.frequency === "daily" ? "Hàng ngày" : "Hàng tuần"} ({settings?.time || "02:00"})
              </span>
            </div>
            <div className="text-muted small mt-2 d-flex align-items-center gap-1 text-truncate">
              <i className="fas fa-rotate opacity-75"></i>
              <span>Lần chạy cuối: </span>
              <span className="text-dark fw-medium text-truncate">
                {settings?.lastRun ? formatDateTime(settings.lastRun) : "Chưa chạy"}
              </span>
            </div>
          </div>
        </div>

        {/* Thẻ 4: Bản sao lưu mới nhất */}
        <div className="col-12 col-sm-6 col-xl-3">
          <div className="card border-0 shadow-sm rounded-3 h-100 p-3 bg-white border-start border-4 border-warning">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-secondary small fw-semibold">Bản sao lưu gần nhất</span>
              <div
                className="d-flex align-items-center justify-content-center rounded-circle bg-warning-subtle text-warning"
                style={{ width: "38px", height: "38px" }}
              >
                <i className="fas fa-shield-halved"></i>
              </div>
            </div>
            {backups.length > 0 ? (
              <>
                <div className="fw-semibold text-dark text-truncate" title={backups[0].filename}>
                  {backups[0].filename}
                </div>
                <div className="text-muted small mt-1 d-flex align-items-center justify-content-between">
                  <span>{formatDateTime(backups[0].createdAt)}</span>
                  <span className="fw-bold text-primary">{formatFileSize(backups[0].size)}</span>
                </div>
              </>
            ) : (
              <div className="text-muted small py-2">Chưa có bản sao lưu nào được tạo</div>
            )}
          </div>
        </div>
      </div>

      {/* Bảng Danh sách các Bản sao lưu (History Table) */}
      <div className="card border-0 shadow-sm rounded-3 bg-white overflow-hidden">
        <div className="card-header bg-white py-3 px-3 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <h6 className="fw-bold mb-0 text-dark">
              <i className="fas fa-list-check text-primary me-2"></i>
              Danh mục các bản sao lưu trong hệ thống ({backups.length})
            </h6>
          </div>
          <div className="text-secondary small d-flex align-items-center gap-2">
            <i className="fas fa-info-circle text-info"></i>
            <span>
              Các bản sao lưu được lưu trữ an toàn trong thư mục máy chủ <code>/backups</code>.
            </span>
          </div>
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light text-secondary small text-uppercase">
              <tr>
                <th style={{ width: "60px" }} className="text-center">#</th>
                <th style={{ minWidth: "150px" }}>Định dạng</th>
                <th style={{ minWidth: "220px" }}>Tên tệp tin sao lưu</th>
                <th style={{ minWidth: "120px" }}>Dung lượng</th>
                <th style={{ minWidth: "180px" }}>Thời gian tạo</th>
                <th style={{ minWidth: "150px" }}>Người tạo</th>
                <th style={{ minWidth: "200px" }}>Ghi chú / Nhãn</th>
                <th style={{ width: "170px" }} className="text-end pe-3">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center py-5">
                    <Loading />
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <i className="fas fa-box-open fa-3x mb-3 text-secondary opacity-50 d-block"></i>
                    <h6 className="fw-bold text-dark">Chưa có bản sao lưu nào</h6>
                    <p className="small mb-3">
                      Hãy bấm nút &quot;Tạo bản sao lưu ngay&quot; để bảo vệ an toàn dữ liệu doanh nghiệp của bạn.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="btn btn-sm btn-primary d-inline-flex align-items-center gap-2"
                    >
                      <i className="fas fa-plus-circle"></i>
                      <span>Tạo bản sao lưu đầu tiên</span>
                    </button>
                  </td>
                </tr>
              ) : (
                backups.map((item, index) => {
                  const isSafety = item.note && item.note.includes("Safety Snapshot");
                  return (
                    <tr key={item.filename} className={isSafety ? "bg-warning-subtle/25" : ""}>
                      <td className="text-center text-muted fw-semibold">{index + 1}</td>
                      <td>{renderTypeBadge(item.type, item.hasMedia)}</td>
                      <td>
                        <div className="fw-semibold text-dark font-monospace small">
                          {item.filename}
                        </div>
                        {item.totalRecords > 0 && (
                          <div className="text-muted smaller" style={{ fontSize: "11px" }}>
                            {item.totalRecords.toLocaleString("vi-VN")} bản ghi &bull; {item.tablesCount} bảng
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-light text-dark border fw-semibold">
                          {formatFileSize(item.size)}
                        </span>
                      </td>
                      <td>
                        <div className="small fw-medium text-dark">
                          {formatDateTime(item.createdAt)}
                        </div>
                      </td>
                      <td>
                        <div className="small text-secondary d-flex align-items-center gap-1.5">
                          <i className={`fas ${item.isAuto ? "fa-robot text-success" : "fa-user-tie text-primary"}`}></i>
                          <span>{item.createdBy || "System"}</span>
                        </div>
                      </td>
                      <td>
                        {item.note ? (
                          <span
                            className={`small ${
                              isSafety
                                ? "badge bg-warning-subtle text-dark border border-warning"
                                : "text-muted"
                            }`}
                          >
                            {item.note}
                          </span>
                        ) : (
                          <span className="text-muted fst-italic small">-- Không có --</span>
                        )}
                      </td>
                      <td className="text-end pe-3">
                        <div className="btn-group btn-group-sm" role="group">
                          {/* Nút Tải về */}
                          <button
                            type="button"
                            onClick={() => handleDownload(item.filename)}
                            className="btn btn-outline-primary"
                            title="Tải file sao lưu về máy tính"
                          >
                            <i className="fas fa-download"></i>
                          </button>

                          {/* Nút Khôi phục */}
                          <button
                            type="button"
                            onClick={() => openRestoreModal(item)}
                            className="btn btn-outline-success"
                            title="Khôi phục cơ sở dữ liệu từ bản sao lưu này"
                          >
                            <i className="fas fa-rotate-left"></i>
                          </button>

                          {/* Nút Xóa */}
                          <button
                            type="button"
                            onClick={() => handleDelete(item)}
                            className="btn btn-outline-danger"
                            title="Xóa vĩnh viễn bản sao lưu này"
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: TẠO BẢN SAO LƯU MỚI (CreateBackupModal) */}
      {/* ========================================================================= */}
      <ModalShell
        show={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={
          <span className="d-flex align-items-center gap-2">
            <i className="fas fa-shield-halved"></i>
            <span>Tạo bản sao lưu dữ liệu mới</span>
          </span>
        }
        size="lg"
      >
        <form onSubmit={handleCreateBackup}>
          <div className="mb-3">
            <label className="form-label fw-bold small text-secondary text-uppercase mb-2">
              Chọn định dạng & phạm vi sao lưu <span className="text-danger">*</span>
            </label>
            <div className="row g-2">
              {/* Option 1: JSON Snapshot */}
              <div className="col-12 col-md-4">
                <div
                  onClick={() => setCreateType("DATABASE_JSON")}
                  className={`card h-100 p-3 cursor-pointer rounded-3 border-2 transition-all ${
                    createType === "DATABASE_JSON"
                      ? "border-primary bg-primary-subtle/10 shadow-sm"
                      : "border-light-subtle hover:border-secondary"
                  }`}
                  style={{ cursor: "pointer" }}
                >
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <input
                      type="radio"
                      name="backupType"
                      checked={createType === "DATABASE_JSON"}
                      onChange={() => setCreateType("DATABASE_JSON")}
                      className="form-check-input mt-0"
                    />
                    <span className="fw-bold text-dark small">JSON Snapshot</span>
                  </div>
                  <div className="badge bg-primary text-white w-fit mb-2 small" style={{ width: "fit-content" }}>
                    Khuyên dùng
                  </div>
                  <p className="text-secondary smaller mb-0" style={{ fontSize: "12px" }}>
                    Nén dạng <code>.json.gz</code>. Tương thích 100% mọi nền tảng, nạp an toàn, kiểm tra tính toàn vẹn cao.
                  </p>
                </div>
              </div>

              {/* Option 2: SQL Script */}
              <div className="col-12 col-md-4">
                <div
                  onClick={() => setCreateType("DATABASE_SQL")}
                  className={`card h-100 p-3 cursor-pointer rounded-3 border-2 transition-all ${
                    createType === "DATABASE_SQL"
                      ? "border-primary bg-primary-subtle/10 shadow-sm"
                      : "border-light-subtle hover:border-secondary"
                  }`}
                  style={{ cursor: "pointer" }}
                >
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <input
                      type="radio"
                      name="backupType"
                      checked={createType === "DATABASE_SQL"}
                      onChange={() => setCreateType("DATABASE_SQL")}
                      className="form-check-input mt-0"
                    />
                    <span className="fw-bold text-dark small">PostgreSQL SQL</span>
                  </div>
                  <div className="badge bg-purple text-white w-fit mb-2 small" style={{ width: "fit-content", backgroundColor: "#6b21a8" }}>
                    Chuẩn SQL
                  </div>
                  <p className="text-secondary smaller mb-0" style={{ fontSize: "12px" }}>
                    File nén <code>.sql.gz</code>. Có thể mở xem, trích xuất hoặc phục hồi qua pgAdmin, DBeaver, psql.
                  </p>
                </div>
              </div>

              {/* Option 3: Full Archive */}
              <div className="col-12 col-md-4">
                <div
                  onClick={() => setCreateType("FULL_ARCHIVE")}
                  className={`card h-100 p-3 cursor-pointer rounded-3 border-2 transition-all ${
                    createType === "FULL_ARCHIVE"
                      ? "border-primary bg-primary-subtle/10 shadow-sm"
                      : "border-light-subtle hover:border-secondary"
                  }`}
                  style={{ cursor: "pointer" }}
                >
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <input
                      type="radio"
                      name="backupType"
                      checked={createType === "FULL_ARCHIVE"}
                      onChange={() => setCreateType("FULL_ARCHIVE")}
                      className="form-check-input mt-0"
                    />
                    <span className="fw-bold text-dark small">Toàn bộ + Media</span>
                  </div>
                  <div className="badge bg-success text-white w-fit mb-2 small" style={{ width: "fit-content" }}>
                    Đầy đủ nhất
                  </div>
                  <p className="text-secondary smaller mb-0" style={{ fontSize: "12px" }}>
                    Gói nén <code>.tar.gz</code> chứa toàn bộ Cơ sở dữ liệu và tất cả các ảnh, tài liệu trong thư mục uploads.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label fw-semibold small text-dark">
              Ghi chú cho bản sao lưu (Tùy chọn)
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="VD: Bản sao lưu trước khi nghiệm thu hợp đồng / nâng cấp máy..."
              value={createNote}
              onChange={(e) => setCreateNote(e.target.value)}
              maxLength={120}
            />
            <div className="form-text small">
              Giúp bạn và các quản trị viên dễ dàng nhận biết mục đích của bản sao lưu này về sau.
            </div>
          </div>

          <div className="alert alert-info py-2 px-3 small d-flex align-items-center gap-2 mb-4">
            <i className="fas fa-info-circle text-info fs-5 flex-shrink-0"></i>
            <div>
              Hiện hệ thống có <strong>{stats.totalRecords.toLocaleString("vi-VN")} bản ghi</strong> trên{" "}
              <strong>{Object.keys(stats.tableStats || {}).length} bảng</strong>. Thời gian đóng gói thường từ 2 - 10 giây.
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="btn btn-light btn-sm px-3"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={processing}
              className="btn btn-primary btn-sm px-4 fw-semibold d-inline-flex align-items-center gap-2"
            >
              <i className="fas fa-download"></i>
              <span>Bắt đầu sao lưu</span>
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ========================================================================= */}
      {/* MODAL 2: XÁC NHẬN PHỤC HỒI TỪ BẢN LƯU CÓ SẴN (RestoreModal) */}
      {/* ========================================================================= */}
      <ModalShell
        show={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        title={
          <span className="d-flex align-items-center gap-2 text-danger">
            <i className="fas fa-triangle-exclamation"></i>
            <span>Cảnh báo: Khôi phục Cơ sở dữ liệu</span>
          </span>
        }
        headerClass="bg-danger text-white"
        size="md"
      >
        {targetRestoreBackup && (
          <div>
            <div className="alert alert-danger py-2.5 px-3 mb-3 border-danger">
              <h6 className="fw-bold mb-1 text-danger d-flex align-items-center gap-2">
                <i className="fas fa-circle-exclamation"></i>
                <span>CẨN TRỌNG: HÀNH ĐỘNG GHI ĐÈ DỮ LIỆU!</span>
              </h6>
              <div className="small text-danger">
                Hệ thống sẽ <strong>xóa toàn bộ dữ liệu hiện tại</strong> và nạp lại chính xác trạng thái từ bản sao lưu này.
              </div>
            </div>

            <div className="bg-light p-3 rounded-3 border mb-3 small">
              <div className="row g-2">
                <div className="col-5 text-secondary">Tệp tin sao lưu:</div>
                <div className="col-7 fw-bold text-dark font-monospace text-truncate">
                  {targetRestoreBackup.filename}
                </div>

                <div className="col-5 text-secondary">Định dạng:</div>
                <div className="col-7">{renderTypeBadge(targetRestoreBackup.type, targetRestoreBackup.hasMedia)}</div>

                <div className="col-5 text-secondary">Thời điểm tạo:</div>
                <div className="col-7 text-dark">{formatDateTime(targetRestoreBackup.createdAt)}</div>

                <div className="col-5 text-secondary">Dung lượng:</div>
                <div className="col-7 fw-semibold text-dark">{formatFileSize(targetRestoreBackup.size)}</div>

                {targetRestoreBackup.totalRecords > 0 && (
                  <>
                    <div className="col-5 text-secondary">Số bản ghi khôi phục:</div>
                    <div className="col-7 fw-bold text-success">
                      {targetRestoreBackup.totalRecords.toLocaleString("vi-VN")} bản ghi
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Checkbox tạo điểm an toàn */}
            <div className="form-check form-switch p-3 bg-white rounded-3 border mb-3">
              <input
                type="checkbox"
                id="safetyToggle"
                checked={restoreSafetySnapshot}
                onChange={(e) => setRestoreSafetySnapshot(e.target.checked)}
                className="form-check-input ms-0 me-2"
              />
              <label htmlFor="safetyToggle" className="form-check-label fw-bold text-dark small cursor-pointer">
                Tự động tạo điểm lưu an toàn (Safety Snapshot) trước khi khôi phục
              </label>
              <div className="text-secondary smaller mt-1 ps-4" style={{ fontSize: "12px" }}>
                Khuyên dùng: Nếu có sự cố, bạn có thể hoàn tác quay lại trạng thái ngay trước thời điểm này.
              </div>
            </div>

            {/* Nhập từ khóa xác nhận */}
            <div className="mb-4">
              <label className="form-label fw-bold small text-secondary text-uppercase mb-1">
                Nhập chữ <span className="text-danger fw-black">KHOI PHUC</span> để mở khóa:
              </label>
              <input
                type="text"
                className="form-control text-center font-monospace fw-bold"
                placeholder="KHOI PHUC"
                value={restoreConfirmKeyword}
                onChange={(e) => setRestoreConfirmKeyword(e.target.value)}
              />
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                onClick={() => setShowRestoreModal(false)}
                className="btn btn-light btn-sm px-3"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleExecuteRestore}
                disabled={restoreConfirmKeyword.trim().toUpperCase() !== "KHOI PHUC" || processing}
                className="btn btn-danger btn-sm px-4 fw-bold d-inline-flex align-items-center gap-2"
              >
                <i className="fas fa-rotate-left"></i>
                <span>Xác nhận khôi phục ngay</span>
              </button>
            </div>
          </div>
        )}
      </ModalShell>

      {/* ========================================================================= */}
      {/* MODAL 3: TẢI LÊN FILE TỪ MÁY TÍNH ĐỂ PHỤC HỒI (UploadRestoreModal) */}
      {/* ========================================================================= */}
      <ModalShell
        show={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title={
          <span className="d-flex align-items-center gap-2">
            <i className="fas fa-cloud-arrow-up text-warning"></i>
            <span>Tải file sao lưu từ máy tính để phục hồi</span>
          </span>
        }
        size="md"
      >
        <form onSubmit={handleUploadAndRestore}>
          <div className="mb-3">
            <label className="form-label fw-bold small text-secondary text-uppercase">
              Chọn tệp tin sao lưu (.json.gz, .json, .sql.gz, .tar.gz) <span className="text-danger">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              className="form-control"
              accept=".gz,.json,.sql,.tgz,.tar.gz"
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setUploadFile(f);
              }}
              required
            />
            <div className="form-text small">
              Hỗ trợ các định dạng sao lưu xuất từ OfficeOps: <code>.json.gz</code>, <code>.sql.gz</code> hoặc <code>.tar.gz</code>.
            </div>
          </div>

          {uploadFile && (
            <div className="alert alert-secondary py-2 px-3 small d-flex align-items-center justify-content-between mb-3">
              <div>
                <strong className="text-dark">{uploadFile.name}</strong>
                <span className="text-muted ms-2">({formatFileSize(uploadFile.size)})</span>
              </div>
              <span className="badge bg-primary">Sẵn sàng</span>
            </div>
          )}

          <div className="form-check form-switch p-3 bg-light rounded-3 border mb-3">
            <input
              type="checkbox"
              id="uploadSafetyToggle"
              checked={uploadSafetySnapshot}
              onChange={(e) => setUploadSafetySnapshot(e.target.checked)}
              className="form-check-input ms-0 me-2"
            />
            <label htmlFor="uploadSafetyToggle" className="form-check-label fw-bold text-dark small cursor-pointer">
              Tạo điểm lưu an toàn (Safety Snapshot) dữ liệu hiện tại trước khi khôi phục
            </label>
          </div>

          <div className="mb-4">
            <label className="form-label fw-bold small text-secondary text-uppercase mb-1">
              Nhập chữ <span className="text-danger fw-black">KHOI PHUC</span> để xác nhận:
            </label>
            <input
              type="text"
              className="form-control text-center font-monospace fw-bold"
              placeholder="KHOI PHUC"
              value={uploadConfirmKeyword}
              onChange={(e) => setUploadConfirmKeyword(e.target.value)}
            />
          </div>

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              onClick={() => setShowUploadModal(false)}
              className="btn btn-light btn-sm px-3"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={!uploadFile || uploadConfirmKeyword.trim().toUpperCase() !== "KHOI PHUC" || processing}
              className="btn btn-warning text-dark btn-sm px-4 fw-bold d-inline-flex align-items-center gap-2"
            >
              <i className="fas fa-cloud-arrow-up"></i>
              <span>Bắt đầu nạp & phục hồi</span>
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ========================================================================= */}
      {/* MODAL 4: CẤU HÌNH TỰ ĐỘNG SAO LƯU (BackupSettingsModal) */}
      {/* ========================================================================= */}
      <ModalShell
        show={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        title={
          <span className="d-flex align-items-center gap-2">
            <i className="fas fa-sliders text-primary"></i>
            <span>Cấu hình tự động sao lưu hệ thống</span>
          </span>
        }
        size="md"
      >
        {editSettings && (
          <form onSubmit={handleSaveSettings}>
            {/* Bật / Tắt */}
            <div className="form-check form-switch p-3 bg-light rounded-3 border mb-3 d-flex align-items-center justify-content-between">
              <div>
                <label htmlFor="enableAutoBackup" className="form-check-label fw-bold text-dark cursor-pointer d-block mb-1">
                  Kích hoạt tự động sao lưu định kỳ
                </label>
                <div className="text-muted smaller" style={{ fontSize: "12px" }}>
                  Hệ thống sẽ tự động sao lưu dữ liệu theo lịch trình vào nền mà không ảnh hưởng người dùng.
                </div>
              </div>
              <input
                type="checkbox"
                id="enableAutoBackup"
                checked={editSettings.enabled}
                onChange={(e) => setEditSettings({ ...editSettings, enabled: e.target.checked })}
                className="form-check-input ms-3 me-0 flex-shrink-0"
                style={{ width: "2.5em", height: "1.3em" }}
              />
            </div>

            <div className="row g-3 mb-3">
              {/* Tần suất */}
              <div className="col-12 col-sm-6">
                <label className="form-label fw-semibold small text-secondary text-uppercase">
                  Tần suất sao lưu
                </label>
                <select
                  className="form-select form-select-sm"
                  value={editSettings.frequency}
                  onChange={(e) =>
                    setEditSettings({
                      ...editSettings,
                      frequency: e.target.value as "daily" | "weekly",
                    })
                  }
                >
                  <option value="daily">Hàng ngày (Daily)</option>
                  <option value="weekly">Hàng tuần (Weekly)</option>
                </select>
              </div>

              {/* Giờ chạy */}
              <div className="col-12 col-sm-6">
                <label className="form-label fw-semibold small text-secondary text-uppercase">
                  Thời gian thực thi
                </label>
                <input
                  type="time"
                  className="form-control form-control-sm"
                  value={editSettings.time}
                  onChange={(e) => setEditSettings({ ...editSettings, time: e.target.value })}
                />
              </div>

              {/* Định dạng */}
              <div className="col-12 col-sm-6">
                <label className="form-label fw-semibold small text-secondary text-uppercase">
                  Định dạng tệp tin
                </label>
                <select
                  className="form-select form-select-sm"
                  value={editSettings.format}
                  onChange={(e) =>
                    setEditSettings({
                      ...editSettings,
                      format: e.target.value as BackupType,
                    })
                  }
                >
                  <option value="DATABASE_JSON">JSON Snapshot (.json.gz) - Khuyên dùng</option>
                  <option value="DATABASE_SQL">PostgreSQL SQL (.sql.gz)</option>
                  <option value="FULL_ARCHIVE">Toàn bộ hệ thống (.tar.gz)</option>
                </select>
              </div>

              {/* Số ngày giữ lại */}
              <div className="col-12 col-sm-6">
                <label className="form-label fw-semibold small text-secondary text-uppercase">
                  Số ngày lưu trữ (Retention)
                </label>
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="form-control"
                    value={editSettings.retentionDays}
                    onChange={(e) =>
                      setEditSettings({
                        ...editSettings,
                        retentionDays: parseInt(e.target.value, 10) || 7,
                      })
                    }
                  />
                  <span className="input-group-text">ngày</span>
                </div>
              </div>

              {/* Số bản tối đa */}
              <div className="col-12 col-sm-6">
                <label className="form-label fw-semibold small text-secondary text-uppercase">
                  Giới hạn số bản lưu tối đa
                </label>
                <div className="input-group input-group-sm">
                  <input
                    type="number"
                    min={3}
                    max={100}
                    className="form-control"
                    value={editSettings.maxBackups}
                    onChange={(e) =>
                      setEditSettings({
                        ...editSettings,
                        maxBackups: parseInt(e.target.value, 10) || 10,
                      })
                    }
                  />
                  <span className="input-group-text">bản</span>
                </div>
              </div>

              {/* Bao gồm Media */}
              <div className="col-12 col-sm-6 d-flex align-items-center">
                <div className="form-check mt-3">
                  <input
                    type="checkbox"
                    id="includeMediaCheck"
                    checked={editSettings.includeMedia}
                    onChange={(e) =>
                      setEditSettings({ ...editSettings, includeMedia: e.target.checked })
                    }
                    className="form-check-input"
                  />
                  <label htmlFor="includeMediaCheck" className="form-check-label small fw-semibold text-dark">
                    Bao gồm cả tệp Media / Ảnh đính kèm
                  </label>
                </div>
              </div>
            </div>

            <div className="alert alert-secondary py-2 px-3 small mb-4">
              <i className="fas fa-circle-nodes me-2 text-primary"></i>
              Tác vụ tự động sao lưu được tích hợp chung vào lịch trình Cron Job hàng ngày (<code>/api/cron/daily</code>).
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="btn btn-light btn-sm px-3"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm px-4 fw-semibold d-inline-flex align-items-center gap-2"
              >
                <i className="fas fa-save"></i>
                <span>Lưu cấu hình</span>
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* ========================================================================= */}
      {/* MODAL 5: CHI TIẾT SỐ LƯỢNG BẢN GHI TỪNG BẢNG (TableStatsModal) */}
      {/* ========================================================================= */}
      <ModalShell
        show={showStatsModal}
        onClose={() => setShowStatsModal(false)}
        title={
          <span className="d-flex align-items-center gap-2">
            <i className="fas fa-table-list text-primary"></i>
            <span>Chi tiết số lượng bản ghi Cơ sở dữ liệu ({Object.keys(stats.tableStats || {}).length} bảng)</span>
          </span>
        }
        size="lg"
      >
        <div>
          <div className="mb-3">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Tìm kiếm bảng hoặc mô tả..."
              value={statsSearch}
              onChange={(e) => setStatsSearch(e.target.value)}
            />
          </div>

          <div className="table-responsive" style={{ maxHeight: "420px", overflowY: "auto" }}>
            <table className="table table-sm table-hover align-middle mb-0">
              <thead className="table-light sticky-top small text-uppercase">
                <tr>
                  <th style={{ width: "40px" }} className="text-center">#</th>
                  <th>Tên bảng (Prisma Model)</th>
                  <th>Mô tả chức năng</th>
                  <th className="text-end pe-3">Số lượng bản ghi</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.tableStats || {})
                  .filter(([key]) => {
                    if (!statsSearch.trim()) return true;
                    const q = statsSearch.toLowerCase();
                    const desc = (TABLE_LABELS[key] || "").toLowerCase();
                    return key.toLowerCase().includes(q) || desc.includes(q);
                  })
                  .map(([tableKey, count], idx) => (
                    <tr key={tableKey}>
                      <td className="text-center text-muted small">{idx + 1}</td>
                      <td>
                        <code className="text-primary fw-semibold">{tableKey}</code>
                      </td>
                      <td className="small text-secondary">
                        {TABLE_LABELS[tableKey] || "Bảng dữ liệu hệ thống"}
                      </td>
                      <td className="text-end pe-3">
                        <span className="badge bg-light text-dark border font-monospace">
                          {count.toLocaleString("vi-VN")}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="d-flex align-items-center justify-content-between pt-3 mt-3 border-top">
            <div className="small text-secondary">
              Tổng cộng: <strong className="text-dark">{stats.totalRecords.toLocaleString("vi-VN")} bản ghi</strong>
            </div>
            <button
              type="button"
              onClick={() => setShowStatsModal(false)}
              className="btn btn-secondary btn-sm px-3"
            >
              Đóng
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}
