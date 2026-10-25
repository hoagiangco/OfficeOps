"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ModalShell from "@/components/ModalShell";
import type { Role } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/rbac";
import type { PermissionModuleMeta } from "@/lib/rbacMetadata";

interface UserSummaryItem {
  id: string;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  region: string | null;
  grantedCount: number;
  totalCount: number;
  isSuperAdmin: boolean;
  grantedPermissions?: string[];
}

const ACTION_BADGES: Record<string, { label: string; className: string }> = {
  VIEW: { label: "XEM", className: "bg-light text-secondary border" },
  CREATE: { label: "TẠO MỚI", className: "bg-success-subtle text-success border border-success-subtle" },
  EDIT: { label: "CHỈNH SỬA", className: "bg-warning-subtle text-warning-emphasis border border-warning-subtle" },
  DELETE: { label: "XÓA", className: "bg-danger-subtle text-danger border border-danger-subtle" },
  APPROVE: { label: "PHÊ DUYỆT", className: "bg-info-subtle text-info-emphasis border border-info-subtle" },
  MANAGE: { label: "TOÀN QUYỀN", className: "bg-primary-subtle text-primary border border-primary-subtle" },
};

const RISK_BADGES: Record<string, { label: string; className: string }> = {
  LOW: { label: "Thấp", className: "bg-light text-muted border" },
  MEDIUM: { label: "TB", className: "bg-info-subtle text-info-emphasis border border-info-subtle" },
  HIGH: { label: "Cao", className: "bg-warning-subtle text-warning-emphasis border border-warning-subtle" },
  CRITICAL: { label: "Rất cao", className: "bg-danger-subtle text-danger border border-danger-subtle fw-bold" },
};

const ROLE_BADGES: Record<Role, string> = {
  SUPER_ADMIN: "bg-danger",
  ADMIN: "bg-primary",
  DISPATCHER: "bg-info text-white",
  FIELD_TECH: "bg-secondary",
};

export default function AdminUserPermissionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialUserId = searchParams.get("userId") || "";

  const [users, setUsers] = useState<UserSummaryItem[]>([]);
  const [modules, setModules] = useState<PermissionModuleMeta[]>([]);
  const [allKeys, setAllKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // User đang được chọn
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId);
  const [userPerms, setUserPerms] = useState<Record<string, boolean>>({});
  const [originalUserPerms, setOriginalUserPerms] = useState<Record<string, boolean>>({});
  const [userLoading, setUserLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters bên cột danh sách user
  const [userSearch, setUserSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");

  // Search quyền bên checklist
  const [permSearch, setPermSearch] = useState("");
  const [collapsedModules, setCollapsedModules] = useState<Set<string>>(new Set());

  // Modal sao chép quyền
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [copySourceId, setCopySourceId] = useState("");
  const [copying, setCopying] = useState(false);

  // Modal khôi phục role mặc định
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Chế độ xem: Từng user hoặc Bảng tổng hợp
  const [viewMode, setViewMode] = useState<"detail" | "matrix">("detail");

  // Tải danh sách người dùng ban đầu
  const loadUsersSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/permissions");
      if (!res.ok) {
        if (res.status === 403) throw new Error("Bạn không có quyền truy cập trang quản trị này");
        throw new Error("Không tải được danh sách người dùng");
      }
      const data = await res.json();
      setUsers(data.users || []);
      setModules(data.modules || []);
      setAllKeys(data.allKeys || []);

      // Nếu chưa chọn user nào và có danh sách, chọn user đầu tiên không phải SuperAdmin hoặc user đầu tiên
      if (!selectedUserId && data.users && data.users.length > 0) {
        const firstNonAdmin = data.users.find((u: UserSummaryItem) => !u.isSuperAdmin) || data.users[0];
        setSelectedUserId(firstNonAdmin.id);
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    loadUsersSummary();
  }, [loadUsersSummary]);

  // Tải quyền của user được chọn
  const loadSelectedUserPermissions = useCallback(async (uid: string) => {
    if (!uid) return;
    setUserLoading(true);
    try {
      const res = await fetch(`/api/admin/permissions?userId=${uid}`);
      if (!res.ok) throw new Error("Không tải được chi tiết quyền người dùng");
      const data = await res.json();
      setUserPerms(data.permissions || {});
      setOriginalUserPerms(JSON.parse(JSON.stringify(data.permissions || {})));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải quyền người dùng");
    } finally {
      setUserLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadSelectedUserPermissions(selectedUserId);
    }
  }, [selectedUserId, loadSelectedUserPermissions]);

  // Chọn user từ danh sách
  const handleSelectUser = (u: UserSummaryItem) => {
    if (pendingChanges.length > 0) {
      if (!confirm("Bạn có các quyền đã sửa chưa lưu cho người dùng này. Bỏ qua và chuyển sang người dùng khác?")) {
        return;
      }
    }
    setSelectedUserId(u.id);
    router.replace(`/admin/permissions?userId=${u.id}`, { scroll: false });
  };

  const selectedUserObj = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

  // Danh sách thay đổi chưa lưu của user hiện tại
  const pendingChanges = useMemo(() => {
    if (!selectedUserObj || selectedUserObj.isSuperAdmin) return [];
    const list: { permission: string; granted: boolean }[] = [];
    for (const key of allKeys) {
      const cur = userPerms[key] ?? false;
      const orig = originalUserPerms[key] ?? false;
      if (cur !== orig) {
        list.push({ permission: key, granted: cur });
      }
    }
    return list;
  }, [userPerms, originalUserPerms, allKeys, selectedUserObj]);

  // Toggle 1 quyền
  const togglePermission = (permKey: string) => {
    if (!selectedUserObj || selectedUserObj.isSuperAdmin) return;
    setUserPerms((prev) => ({
      ...prev,
      [permKey]: !prev[permKey],
    }));
  };

  // Toggle toàn bộ quyền trong 1 module
  const toggleModule = (moduleObj: PermissionModuleMeta, enable: boolean) => {
    if (!selectedUserObj || selectedUserObj.isSuperAdmin) return;
    setUserPerms((prev) => {
      const next = { ...prev };
      for (const p of moduleObj.permissions) {
        next[p.key] = enable;
      }
      return next;
    });
  };

  // Toggle collapse module
  const toggleCollapse = (moduleId: string) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) next.delete(moduleId);
      else next.add(moduleId);
      return next;
    });
  };

  // Hoàn tác thay đổi
  const handleDiscard = () => {
    setUserPerms(JSON.parse(JSON.stringify(originalUserPerms)));
    toast.info("Đã hoàn tác các thay đổi chưa lưu");
  };

  // Lưu quyền cho user
  const handleSave = async () => {
    if (!selectedUserId || pendingChanges.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/admin/permissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          updates: pendingChanges,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không thể lưu phân quyền");

      toast.success(data.message || `Đã lưu phân quyền cho ${selectedUserObj?.name}`);
      setUserPerms(data.permissions);
      setOriginalUserPerms(JSON.parse(JSON.stringify(data.permissions)));

      // Cập nhật lại số quyền trong danh sách users
      const grantedCount = Object.values(data.permissions).filter(Boolean).length;
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUserId ? { ...u, grantedCount } : u))
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi lưu quyền");
    } finally {
      setSaving(false);
    }
  };

  // Khôi phục quyền theo vai trò mặc định
  const handleResetToRole = async () => {
    if (!selectedUserId) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/permissions/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không thể khôi phục quyền");

      toast.success(data.message || `Đã khôi phục quyền cho ${selectedUserObj?.name}`);
      setUserPerms(data.permissions);
      setOriginalUserPerms(JSON.parse(JSON.stringify(data.permissions)));
      setShowResetModal(false);

      const grantedCount = Object.values(data.permissions).filter(Boolean).length;
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUserId ? { ...u, grantedCount } : u))
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi khôi phục quyền");
    } finally {
      setResetting(false);
    }
  };

  // Sao chép quyền từ user khác
  const handleCopyPermissions = async () => {
    if (!selectedUserId || !copySourceId) return;
    setCopying(true);
    try {
      const res = await fetch("/api/admin/permissions/copy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceUserId: copySourceId,
          targetUserId: selectedUserId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Không thể sao chép quyền");

      toast.success(data.message || "Đã sao chép quyền thành công");
      setUserPerms(data.permissions);
      setOriginalUserPerms(JSON.parse(JSON.stringify(data.permissions)));
      setShowCopyModal(false);

      const grantedCount = Object.values(data.permissions).filter(Boolean).length;
      setUsers((prev) =>
        prev.map((u) => (u.id === selectedUserId ? { ...u, grantedCount } : u))
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi sao chép");
    } finally {
      setCopying(false);
    }
  };

  // Lọc danh sách users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (userSearch.trim()) {
        const q = userSearch.trim().toLowerCase();
        const matchName = u.name.toLowerCase().includes(q);
        const matchEmail = u.email.toLowerCase().includes(q);
        if (!matchName && !matchEmail) return false;
      }
      if (roleFilter && u.role !== roleFilter) return false;
      return true;
    });
  }, [users, userSearch, roleFilter]);

  // Lọc module & quyền theo permSearch
  const filteredModules = useMemo(() => {
    if (!permSearch.trim()) return modules;
    const q = permSearch.trim().toLowerCase();
    return modules
      .map((mod) => {
        const matchedPerms = mod.permissions.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.key.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q)
        );
        return {
          ...mod,
          permissions: matchedPerms,
        };
      })
      .filter((mod) => mod.permissions.length > 0);
  }, [modules, permSearch]);

  const grantedPermsCount = useMemo(() => {
    if (selectedUserObj?.isSuperAdmin) return allKeys.length;
    return Object.values(userPerms).filter(Boolean).length;
  }, [userPerms, selectedUserObj, allKeys]);

  return (
    <div className="container-fluid px-1 py-1">
      {/* 1. Header chuẩn HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-primary text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-user-lock fa-sm"></i>
          </div>
          <div>
            <h1 className="h6 mb-0 text-dark fw-bold">Phân quyền theo từng Người dùng</h1>
            <div className="text-muted small" style={{ fontSize: "11px" }}>
              Cấu hình và bật/tắt trực tiếp từng quyền chức năng cho từng tài khoản cá nhân
            </div>
          </div>
        </div>

        {/* Action Controls Header */}
        <div className="d-flex align-items-center gap-2 flex-wrap">
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className={`btn ${viewMode === "detail" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("detail")}
            >
              <i className="fas fa-user-check me-1"></i> Từng người dùng
            </button>
            <button
              type="button"
              className={`btn ${viewMode === "matrix" ? "btn-primary" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("matrix")}
            >
              <i className="fas fa-th me-1"></i> Bảng tổng hợp
            </button>
          </div>

          <button
            type="button"
            className="btn btn-outline-dark btn-sm px-2.5 fw-semibold"
            onClick={loadUsersSummary}
            title="Tải lại danh sách"
          >
            <i className="fas fa-sync-alt me-1"></i> Tải lại
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs giữa các trang Hệ Thống */}
      <div className="d-flex gap-2 mb-2 border-bottom bg-white px-3 pt-2 rounded-top border">
        <Link
          href="/admin"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-user-shield me-1"></i> Tài khoản người dùng
        </Link>
        <Link
          href="/admin/permissions"
          className="pb-2 text-decoration-none small fw-bold text-primary border-bottom border-primary border-2 px-2"
        >
          <i className="fas fa-key me-1"></i> Phân quyền người dùng
        </Link>
        <Link
          href="/admin/company"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-building-circle-check me-1"></i> Cấu hình Doanh nghiệp & VietQR
        </Link>
        <Link
          href="/admin/audit-logs"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-history me-1"></i> Nhật ký hoạt động
        </Link>
      </div>

      {loading ? (
        <Loading />
      ) : viewMode === "matrix" ? (
        /* CHẾ ĐỘ 1: BẢNG TỔNG HỢP TOÀN BỘ USERS VÀ QUYỀN */
        <div className="card shadow-sm border-0 rounded-3 overflow-hidden border mb-3">
          <div className="card-header bg-light py-2 px-3 d-flex justify-content-between align-items-center">
            <strong className="small text-uppercase text-secondary">
              <i className="fas fa-th me-1"></i> Ma trận quyền của tất cả nhân viên ({users.length} tài khoản)
            </strong>
            <span className="small text-muted" style={{ fontSize: "11.5px" }}>
              Bấm vào tên người dùng để chuyển sang chế độ tick chọn chi tiết
            </span>
          </div>
          <div className="table-responsive" style={{ maxHeight: "75vh" }}>
            <table className="table table-sm table-bordered mb-0 align-middle custom-dense-table">
              <thead className="table-light sticky-top" style={{ zIndex: 10 }}>
                <tr className="text-nowrap">
                  <th style={{ width: "320px", minWidth: "260px" }} className="px-3 py-2 text-dark">
                    Chức năng / Quyền hạn
                  </th>
                  {users.map((u) => (
                    <th
                      key={u.id}
                      className="text-center py-2 px-2 bg-light cursor-pointer"
                      style={{ minWidth: "130px", cursor: "pointer" }}
                      onClick={() => {
                        setSelectedUserId(u.id);
                        setViewMode("detail");
                      }}
                      title="Bấm để xem và sửa quyền chi tiết của người dùng này"
                    >
                      <div className="d-flex flex-column align-items-center gap-0.5">
                        <strong className="text-dark small text-truncate" style={{ maxWidth: "120px" }}>
                          {u.name}
                        </strong>
                        <span className={`badge ${ROLE_BADGES[u.role]}`} style={{ fontSize: "9.5px" }}>
                          {ROLE_LABELS[u.role]}
                        </span>
                        <span className="badge bg-light text-secondary border font-monospace" style={{ fontSize: "9.5px" }}>
                          {u.grantedCount}/{u.totalCount} quyền
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {modules.map((mod) => (
                  <React.Fragment key={mod.id}>
                    <tr className="bg-light border-top border-bottom border-secondary-subtle">
                      <td colSpan={users.length + 1} className="px-3 py-1.5 fw-bold text-dark">
                        <i className={`${mod.icon} text-primary me-2`}></i>
                        <span>{mod.name}</span>
                        <span className="badge bg-secondary-subtle text-secondary rounded-pill ms-2">
                          {mod.permissions.length}
                        </span>
                      </td>
                    </tr>
                    {mod.permissions.map((p) => {
                      const badgeInfo = ACTION_BADGES[p.action] || ACTION_BADGES.VIEW;
                      return (
                        <tr key={p.key} className="hover-highlight-row">
                          <td className="px-3 py-1.5">
                            <span className={`badge ${badgeInfo.className} font-monospace me-2`} style={{ fontSize: "9px" }}>
                              {badgeInfo.label}
                            </span>
                            <strong className="small text-dark">{p.name}</strong>
                          </td>
                          {users.map((u) => {
                            const isGranted = u.isSuperAdmin || (u.grantedPermissions || []).includes(p.key);
                            return (
                              <td
                                key={u.id}
                                className={`text-center py-1 cursor-pointer ${
                                  isGranted ? "bg-success bg-opacity-10" : ""
                                }`}
                                onClick={() => {
                                  setSelectedUserId(u.id);
                                  setViewMode("detail");
                                }}
                                title={`${u.name}: ${isGranted ? "Đã cấp quyền" : "Chưa có quyền"}. Bấm để chỉnh sửa`}
                              >
                                {isGranted ? (
                                  <i className="fas fa-check text-success fa-xs"></i>
                                ) : (
                                  <span className="text-muted opacity-25">&bull;</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* CHẾ ĐỘ 2: TICK CHỌN QUYỀN CHO TỪNG USER (SPLIT VIEW) */
        <div className="row g-2 mb-3">
          {/* CỘT TRÁI: DANH SÁCH NGƯỜI DÙNG */}
          <div className="col-lg-4 col-xl-3.5">
            <div className="card shadow-sm border-0 rounded-3 border h-100 d-flex flex-column">
              <div className="card-header bg-light py-2 px-3 border-bottom">
                <div className="d-flex justify-content-between align-items-center mb-1.5">
                  <strong className="small text-uppercase text-secondary">
                    <i className="fas fa-users me-1"></i> Danh sách nhân viên ({filteredUsers.length})
                  </strong>
                </div>

                {/* Search & Role Filter */}
                <div className="d-flex flex-column gap-1.5">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white border-end-0">
                      <i className="fas fa-search text-muted fa-xs"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="Tìm tên hoặc email..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                    />
                  </div>

                  <select
                    className="form-select form-select-sm"
                    value={roleFilter}
                    onChange={(e) => setRoleFilter(e.target.value)}
                  >
                    <option value="">Tất cả vai trò</option>
                    <option value="SUPER_ADMIN">Giám đốc (SUPER_ADMIN)</option>
                    <option value="ADMIN">Kế toán (ADMIN)</option>
                    <option value="DISPATCHER">Điều phối / Thủ kho</option>
                    <option value="FIELD_TECH">Kỹ thuật viên</option>
                  </select>
                </div>
              </div>

              {/* User List scrollable */}
              <div className="card-body p-1 overflow-auto flex-grow-1" style={{ maxHeight: "calc(100vh - 280px)" }}>
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-4 text-muted small">
                    Không tìm thấy người dùng phù hợp
                  </div>
                ) : (
                  <div className="list-group list-group-flush">
                    {filteredUsers.map((u) => {
                      const isSelected = u.id === selectedUserId;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          className={`list-group-item list-group-item-action p-2 rounded-2 mb-1 border transition-all text-start ${
                            isSelected
                              ? "bg-primary-subtle border-primary text-primary shadow-xs"
                              : "border-light-subtle bg-white hover-bg-light"
                          }`}
                          onClick={() => handleSelectUser(u)}
                        >
                          <div className="d-flex justify-content-between align-items-start mb-1">
                            <strong className={`small text-truncate ${isSelected ? "text-primary" : "text-dark"}`} style={{ maxWidth: "160px" }}>
                              {u.name}
                            </strong>
                            <span className={`badge ${ROLE_BADGES[u.role]}`} style={{ fontSize: "9.5px" }}>
                              {ROLE_LABELS[u.role]}
                            </span>
                          </div>
                          <div className="text-muted small text-truncate" style={{ fontSize: "11px" }}>
                            {u.email}
                          </div>
                          <div className="d-flex justify-content-between align-items-center mt-1.5 pt-1 border-top border-light-subtle">
                            <span
                              className={`badge ${
                                u.isSuperAdmin
                                  ? "bg-danger-subtle text-danger"
                                  : u.grantedCount > 0
                                  ? "bg-success-subtle text-success"
                                  : "bg-secondary-subtle text-secondary"
                              }`}
                              style={{ fontSize: "10px" }}
                            >
                              <i className="fas fa-shield-alt me-1"></i>
                              {u.isSuperAdmin ? "Toàn quyền" : `${u.grantedCount}/${u.totalCount} quyền`}
                            </span>
                            {!u.isActive && (
                              <span className="badge bg-secondary" style={{ fontSize: "9px" }}>
                                Đã khóa
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: TICK CHỌN QUYỀN CHI TIẾT CỦA USER */}
          <div className="col-lg-8 col-xl-8.5">
            {!selectedUserObj ? (
              <div className="card shadow-sm border-0 rounded-3 border p-5 text-center text-muted">
                <i className="fas fa-user-slash fa-3x mb-2 text-secondary opacity-50"></i>
                <p>Vui lòng chọn một người dùng từ danh sách bên trái để phân quyền</p>
              </div>
            ) : (
              <div className="card shadow-sm border-0 rounded-3 border">
                {/* User Info & Actions Bar */}
                <div className="card-header bg-white py-2 px-3 border-bottom">
                  <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2">
                    <div className="d-flex align-items-center gap-2">
                      <div
                        className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center fw-bold shadow-xs"
                        style={{ width: "38px", height: "38px", fontSize: "14px" }}
                      >
                        {selectedUserObj.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="d-flex align-items-center gap-2">
                          <h2 className="h6 mb-0 text-dark fw-bold">{selectedUserObj.name}</h2>
                          <span className={`badge ${ROLE_BADGES[selectedUserObj.role]}`} style={{ fontSize: "10px" }}>
                            {ROLE_LABELS[selectedUserObj.role]}
                          </span>
                          {!selectedUserObj.isActive && (
                            <span className="badge bg-secondary" style={{ fontSize: "10px" }}>
                              Tài khoản đã khóa
                            </span>
                          )}
                        </div>
                        <div className="text-muted small" style={{ fontSize: "11px" }}>
                          {selectedUserObj.email} {selectedUserObj.region && `• Khu vực: ${selectedUserObj.region}`} •{" "}
                          <strong className="text-success">{grantedPermsCount}/{allKeys.length} quyền được cấp</strong>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons cho user */}
                    <div className="d-flex align-items-center gap-1.5 flex-wrap">
                      {!selectedUserObj.isSuperAdmin && (
                        <>
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm py-1 px-2.5"
                            onClick={() => {
                              setCopySourceId("");
                              setShowCopyModal(true);
                            }}
                            title="Sao chép toàn bộ quyền từ một nhân viên khác"
                          >
                            <i className="fas fa-copy me-1"></i> Sao chép
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm py-1 px-2.5"
                            onClick={() => setShowResetModal(true)}
                            title="Khôi phục quyền theo chuẩn vai trò của người này"
                          >
                            <i className="fas fa-undo-alt me-1"></i> Theo vai trò
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={`btn btn-sm px-3 fw-bold shadow-sm ${
                          pendingChanges.length > 0 ? "btn-primary animate-pulse" : "btn-secondary"
                        }`}
                        disabled={pendingChanges.length === 0 || saving || selectedUserObj.isSuperAdmin}
                        onClick={handleSave}
                      >
                        {saving ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                            Đang lưu...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-save me-1"></i>
                            Lưu quyền {pendingChanges.length > 0 && `(${pendingChanges.length})`}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Unsaved Changes Alert Bar */}
                {pendingChanges.length > 0 && (
                  <div className="alert alert-warning py-1.5 px-3 m-2 d-flex justify-content-between align-items-center rounded-2 border border-warning shadow-xs">
                    <div className="small text-warning-emphasis">
                      <i className="fas fa-exclamation-triangle me-1"></i>
                      Đang có <strong>{pendingChanges.length}</strong> quyền thay đổi chưa lưu cho <strong>{selectedUserObj.name}</strong>.
                    </div>
                    <div className="d-flex gap-1.5">
                      <button type="button" className="btn btn-xs btn-outline-secondary py-0.5 px-2" onClick={handleDiscard}>
                        Hoàn tác
                      </button>
                      <button type="button" className="btn btn-xs btn-warning text-dark py-0.5 px-2.5 fw-bold" onClick={handleSave} disabled={saving}>
                        Lưu ngay
                      </button>
                    </div>
                  </div>
                )}

                {/* Filter quyền bên trong user */}
                <div className="p-2 px-3 bg-light border-bottom d-flex justify-content-between align-items-center gap-2">
                  <div className="input-group input-group-sm" style={{ maxWidth: "340px" }}>
                    <span className="input-group-text bg-white border-end-0">
                      <i className="fas fa-search text-muted fa-xs"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control border-start-0"
                      placeholder="Lọc quyền (ví dụ: kho, thiết bị, cước)..."
                      value={permSearch}
                      onChange={(e) => setPermSearch(e.target.value)}
                    />
                    {permSearch && (
                      <button type="button" className="btn btn-outline-secondary border-start-0" onClick={() => setPermSearch("")}>
                        <i className="fas fa-times fa-xs"></i>
                      </button>
                    )}
                  </div>

                  <div className="small text-muted">
                    {selectedUserObj.isSuperAdmin ? (
                      <span className="text-danger fw-semibold">
                        <i className="fas fa-lock me-1"></i> Giám đốc có toàn bộ quyền hạn cố định
                      </span>
                    ) : (
                      <span>Tick chọn từng quyền tương ứng bên dưới</span>
                    )}
                  </div>
                </div>

                {/* Checklist quyền theo từng Module */}
                <div className="card-body p-2" style={{ maxHeight: "calc(100vh - 350px)", overflowY: "auto" }}>
                  {userLoading ? (
                    <Loading />
                  ) : filteredModules.length === 0 ? (
                    <div className="text-center py-5 text-muted small">
                      Không tìm thấy quyền hạn phù hợp với từ khóa &ldquo;{permSearch}&rdquo;
                    </div>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {filteredModules.map((mod) => {
                        const isCollapsed = collapsedModules.has(mod.id);
                        const isSuperAdmin = selectedUserObj.isSuperAdmin;

                        const grantedInModule = isSuperAdmin
                          ? mod.permissions.length
                          : mod.permissions.filter((p) => userPerms[p.key]).length;
                        const isAllGranted = grantedInModule === mod.permissions.length;

                        return (
                          <div key={mod.id} className="border rounded-2 overflow-hidden shadow-xs">
                            {/* Module Header */}
                            <div className="p-2 px-3 bg-light d-flex justify-content-between align-items-center border-bottom">
                              <div
                                className="d-flex align-items-center gap-2 cursor-pointer user-select-none"
                                onClick={() => toggleCollapse(mod.id)}
                                style={{ cursor: "pointer" }}
                              >
                                <i
                                  className={`fas ${isCollapsed ? "fa-chevron-right" : "fa-chevron-down"} text-muted fa-xs`}
                                  style={{ width: "12px" }}
                                ></i>
                                <i className={`${mod.icon} text-primary`}></i>
                                <strong className="small text-dark">{mod.name}</strong>
                                <span
                                  className={`badge rounded-pill ${
                                    isAllGranted ? "bg-success-subtle text-success" : "bg-secondary-subtle text-secondary"
                                  }`}
                                  style={{ fontSize: "10px" }}
                                >
                                  {grantedInModule}/{mod.permissions.length}
                                </span>
                              </div>

                              {/* Bật hết / Tắt hết module */}
                              {!isSuperAdmin && (
                                <div className="btn-group btn-group-sm">
                                  <button
                                    type="button"
                                    className={`btn btn-xs py-0 px-2 ${
                                      isAllGranted ? "btn-success" : "btn-outline-secondary"
                                    }`}
                                    style={{ fontSize: "10.5px" }}
                                    onClick={() => toggleModule(mod, true)}
                                    title={`Cấp tất cả quyền trong module ${mod.name}`}
                                  >
                                    Bật hết
                                  </button>
                                  <button
                                    type="button"
                                    className={`btn btn-xs py-0 px-2 ${
                                      grantedInModule === 0 ? "btn-danger" : "btn-outline-secondary"
                                    }`}
                                    style={{ fontSize: "10.5px" }}
                                    onClick={() => toggleModule(mod, false)}
                                    title={`Tắt tất cả quyền trong module ${mod.name}`}
                                  >
                                    Tắt hết
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Permission Rows */}
                            {!isCollapsed && (
                              <div className="list-group list-group-flush">
                                {mod.permissions.map((p) => {
                                  const badgeInfo = ACTION_BADGES[p.action] || ACTION_BADGES.VIEW;
                                  const isGranted = isSuperAdmin ? true : userPerms[p.key] ?? false;
                                  const wasGranted = originalUserPerms[p.key] ?? false;
                                  const isModified = !isSuperAdmin && isGranted !== wasGranted;

                                  return (
                                    <div
                                      key={p.key}
                                      className={`list-group-item list-group-item-action p-2 px-3 d-flex justify-content-between align-items-center transition-all ${
                                        isModified
                                          ? "bg-warning bg-opacity-10 border-warning"
                                          : isGranted
                                          ? "bg-white"
                                          : "bg-light bg-opacity-50 text-muted"
                                      }`}
                                    >
                                      <div className="d-flex align-items-start gap-2 me-3">
                                        <div className="d-flex flex-column align-items-start gap-1" style={{ minWidth: "72px" }}>
                                          <span
                                            className={`badge ${badgeInfo.className} font-monospace`}
                                            style={{ fontSize: "9px", width: "100%" }}
                                          >
                                            {badgeInfo.label}
                                          </span>
                                          {p.riskLevel && (
                                            <span
                                              className={`badge ${RISK_BADGES[p.riskLevel]?.className || "bg-light"} font-monospace`}
                                              style={{ fontSize: "8.5px", width: "100%" }}
                                              title={`Mức độ rủi ro: ${p.riskLevel}`}
                                            >
                                              {RISK_BADGES[p.riskLevel]?.label || p.riskLevel}
                                            </span>
                                          )}
                                        </div>
                                        <div>
                                          <div className={`fw-semibold small ${isGranted ? "text-dark" : "text-secondary"}`}>
                                            {p.name}
                                          </div>
                                          <div className="text-muted" style={{ fontSize: "11px", lineHeight: "1.3" }}>
                                            {p.description}
                                          </div>
                                          <div className="font-monospace text-muted opacity-75 mt-0.5" style={{ fontSize: "10px" }}>
                                            key: <code>{p.key}</code>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Switch / Checkbox */}
                                      <div className="d-flex align-items-center gap-2">
                                        {isModified && (
                                          <span className="badge bg-warning text-dark font-monospace" style={{ fontSize: "9px" }}>
                                            {isGranted ? "+ Bật" : "- Tắt"}
                                          </span>
                                        )}
                                        {isSuperAdmin ? (
                                          <i className="fas fa-check-circle text-danger fa-lg" title="Toàn quyền cố định"></i>
                                        ) : (
                                          <div className="form-check form-switch m-0">
                                            <input
                                              className="form-check-input cursor-pointer"
                                              type="checkbox"
                                              role="switch"
                                              id={`user-perm-${p.key}`}
                                              checked={isGranted}
                                              onChange={() => togglePermission(p.key)}
                                              style={{ width: "36px", height: "20px", cursor: "pointer" }}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Modal Sao chép Quyền từ User khác */}
      <ModalShell
        isOpen={showCopyModal}
        onClose={() => setShowCopyModal(false)}
        title={`Sao chép phân quyền sang ${selectedUserObj?.name}`}
        size="md"
        footer={
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowCopyModal(false)}>
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary fw-bold"
              onClick={handleCopyPermissions}
              disabled={!copySourceId || copying}
            >
              {copying ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                  Đang sao chép...
                </>
              ) : (
                <>
                  <i className="fas fa-copy me-1"></i> Xác nhận sao chép
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="text-start">
          <label className="form-label small fw-semibold text-secondary">Chọn người dùng mẫu để sao chép quyền:</label>
          <select
            className="form-select form-select-sm mb-3"
            value={copySourceId}
            onChange={(e) => setCopySourceId(e.target.value)}
          >
            <option value="">-- Chọn nhân viên nguồn --</option>
            {users
              .filter((u) => u.id !== selectedUserId && !u.isSuperAdmin)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({ROLE_LABELS[u.role]}) — {u.grantedCount} quyền
                </option>
              ))}
          </select>
          <p className="small text-muted mb-0">
            Toàn bộ quyền hạn hiện tại của <strong>{selectedUserObj?.name}</strong> sẽ được thay thế bằng danh sách quyền của nhân viên được chọn.
          </p>
        </div>
      </ModalShell>

      {/* 4. Modal Khôi phục quyền theo Vai trò */}
      <ModalShell
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title="Khôi phục quyền theo vai trò mặc định"
        size="md"
        footer={
          <div className="d-flex justify-content-end gap-2">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowResetModal(false)}>
              Hủy bỏ
            </button>
            <button
              type="button"
              className="btn btn-sm btn-warning text-dark fw-bold"
              onClick={handleResetToRole}
              disabled={resetting}
            >
              {resetting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                  Đang thiết lập...
                </>
              ) : (
                <>
                  <i className="fas fa-undo me-1"></i> Áp dụng chuẩn vai trò
                </>
              )}
            </button>
          </div>
        }
      >
        <div className="text-start">
          <p className="small text-dark mb-2">
            Bạn có chắc chắn muốn đặt lại toàn bộ quyền của <strong>{selectedUserObj?.name}</strong> theo vai trò{" "}
            <span className="badge bg-primary">{selectedUserObj ? ROLE_LABELS[selectedUserObj.role] : ""}</span> mặc định của hệ thống?
          </p>
          <p className="small text-muted mb-0">
            Các tùy chỉnh riêng trước đó của người dùng này sẽ bị hủy bỏ và áp dụng theo mẫu quyền chuẩn của vai trò.
          </p>
        </div>
      </ModalShell>
    </div>
  );
}
