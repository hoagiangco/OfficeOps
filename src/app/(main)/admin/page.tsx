"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import BatchActionBar from "@/components/BatchActionBar";
import ModalShell from "@/components/ModalShell";
import { MailTestModal } from "@/components/MailTestModal";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

interface UserItem {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  isActive: boolean;
  region: string | null;
  skills: string[];
  createdAt: string;
  _count?: { assignedTickets: number };
}

const ROLE_BADGE: Record<Role, string> = {
  SUPER_ADMIN: "bg-danger",
  ADMIN: "bg-primary",
  DISPATCHER: "bg-info text-white",
  FIELD_TECH: "bg-secondary",
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showMailModal, setShowMailModal] = useState(false);
  const [editing, setEditing] = useState<UserItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "FIELD_TECH" as Role,
    region: "",
    skillsText: "",
    isActive: true,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      if (roleFilter) sp.set("role", roleFilter);
      if (statusFilter) sp.set("isActive", statusFilter);

      const res = await fetch(`/api/users?${sp.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách người dùng");
      const data = await res.json();
      setUsers(data.items || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, roleFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditing(null);
    setFormData({
      name: "",
      email: "",
      password: "",
      phone: "",
      role: "FIELD_TECH",
      region: "",
      skillsText: "",
      isActive: true,
    });
    setShowModal(true);
  };

  const openEdit = (u: UserItem) => {
    setEditing(u);
    setFormData({
      name: u.name,
      email: u.email,
      password: "",
      phone: u.phone || "",
      role: u.role,
      region: u.region || "",
      skillsText: (u.skills || []).join(", "),
      isActive: u.isActive,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const skills = formData.skillsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        name: formData.name,
        email: formData.email,
        phone: formData.phone || null,
        role: formData.role,
        region: formData.region || null,
        skills,
        isActive: formData.isActive,
      };
      if (!editing || formData.password.trim()) {
        payload.password = formData.password;
      }

      const res = await fetch(editing ? `/api/users/${editing.id}` : "/api/users", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu tài khoản");
        return;
      }
      toast.success(editing ? "Đã cập nhật tài khoản" : "Đã tạo tài khoản mới");
      setShowModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (u: UserItem) => {
    const res = await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !u.isActive }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể đổi trạng thái");
      return;
    }
    toast.success(u.isActive ? "Đã khóa tài khoản" : "Đã kích hoạt tài khoản");
    loadData();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xóa tài khoản này?")) return;
    const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa tài khoản");
      return;
    }
    toast.success("Đã xóa tài khoản");
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    loadData();
  };

  const handleBatchToggle = async (active: boolean) => {
    for (const id of selectedIds) {
      await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: active }),
      });
    }
    toast.success(active ? "Đã mở khóa các tài khoản đã chọn" : "Đã khóa các tài khoản đã chọn");
    setSelectedIds([]);
    loadData();
  };

  const chips: FilterChipItem[] = [];
  if (search.trim()) {
    chips.push({
      id: "search",
      label: "Từ khóa",
      value: search.trim(),
      onClear: () => {
        setSearch("");
        setPage(1);
      },
    });
  }
  if (roleFilter) {
    chips.push({
      id: "role",
      label: "Vai trò",
      value: ROLE_LABELS[roleFilter as Role] || roleFilter,
      onClear: () => {
        setRoleFilter("");
        setPage(1);
      },
    });
  }
  if (statusFilter) {
    chips.push({
      id: "status",
      label: "Trạng thái",
      value: statusFilter === "true" ? "Đang hoạt động" : "Đã khóa",
      onClear: () => {
        setStatusFilter("");
        setPage(1);
      },
    });
  }

  const clearAllFilters = () => {
    setSearch("");
    setRoleFilter("");
    setStatusFilter("");
    setPage(1);
  };

  const activeCount = users.filter((u) => u.isActive).length;
  const techCount = users.filter((u) => u.role === "FIELD_TECH").length;

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header chuẩn HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-primary text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-user-shield fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">Tài khoản người dùng</h1>
          <div className="vr mx-2 d-none d-md-block" style={{ height: "20px" }}></div>
          <div className="d-none d-md-flex gap-3">
            <span className="small text-muted">
              Tổng: <strong>{total}</strong>
            </span>
            <span className="small text-success">
              Hoạt động: <strong>{activeCount}</strong>
            </span>
            <span className="small text-primary">
              Kỹ thuật viên: <strong>{techCount}</strong>
            </span>
          </div>
        </div>
        <div className="d-flex gap-1">
          <button className="btn btn-outline-dark btn-sm px-3 fw-bold" onClick={loadData}>
            <i className="fas fa-sync-alt me-1"></i> Tải lại
          </button>
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={openNew}>
            <i className="fas fa-plus me-1"></i> Thêm tài khoản
          </button>
        </div>
      </div>

      {/* Navigation Tabs giữa các trang Hệ Thống */}
      <div className="d-flex gap-2 mb-2 border-bottom bg-white px-3 pt-2 rounded-top border">
        <Link
          href="/admin"
          className="pb-2 text-decoration-none small fw-bold text-primary border-bottom border-primary border-2 px-2"
        >
          <i className="fas fa-user-shield me-1"></i> Tài khoản người dùng
        </Link>
        <Link
          href="/admin/permissions"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-key me-1"></i> Phân quyền ma trận
        </Link>
        <Link
          href="/admin/audit-logs"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-history me-1"></i> Nhật ký hoạt động
        </Link>
        <button
          type="button"
          onClick={() => setShowMailModal(true)}
          className="pb-2 btn btn-link text-decoration-none small fw-semibold text-secondary px-2 border-0 shadow-none"
        >
          <i className="fas fa-envelope me-1 text-primary"></i> Kiểm tra Email (SMTP)
        </button>
      </div>

      {/* Dense Filter Bar */}
      <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
        <div className="card-body p-2 bg-light bg-opacity-50">
          <div className="row g-2">
            <div className="col-md-4">
              <div className="input-group input-group-sm border rounded-2 overflow-hidden bg-white">
                <span className="input-group-text bg-white border-0 pe-1">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-0 shadow-none"
                  placeholder="Tìm tên, email, SĐT, khu vực..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
                {search && (
                  <button
                    className="btn btn-link btn-sm text-muted text-decoration-none py-0 px-2"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    type="button"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            </div>

            <div className="col-md-3">
              <select
                className="form-select form-select-sm"
                value={roleFilter}
                onChange={(e) => {
                  setRoleFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Tất cả vai trò --</option>
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-3">
              <select
                className="form-select form-select-sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Mọi trạng thái --</option>
                <option value="true">Đang hoạt động</option>
                <option value="false">Đã khóa</option>
              </select>
            </div>

            <div className="col-md-2">
              <select
                className="form-select form-select-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10 dòng</option>
                <option value={25}>25 dòng</option>
                <option value={50}>50 dòng</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <ActiveFilterChips chips={chips} onClearAll={clearAllFilters} />

      {/* Dense Table */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
        <div className="card-body p-0">
          <div className="table-responsive table-sticky-container">
            <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-3 py-2" style={{ width: "36px" }}>
                    <input
                      type="checkbox"
                      checked={users.length > 0 && selectedIds.length === users.length}
                      onChange={(e) =>
                        setSelectedIds(e.target.checked ? users.map((u) => u.id) : [])
                      }
                    />
                  </th>
                  <th className="py-2 text-uppercase small">Họ tên &amp; Email</th>
                  <th className="py-2 text-uppercase small">SĐT</th>
                  <th className="py-2 text-uppercase small">Vai trò</th>
                  <th className="py-2 text-uppercase small">Khu vực / Kỹ năng</th>
                  <th className="py-2 text-uppercase small text-center">Ticket</th>
                  <th className="py-2 text-uppercase small text-center">Trạng thái</th>
                  <th className="py-2 text-uppercase small text-end px-3" style={{ width: "130px" }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8}>
                      <Loading />
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-5 text-muted small">
                      Không tìm thấy tài khoản nào
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className={!u.isActive ? "bg-danger-subtle bg-opacity-25" : ""}>
                      <td className="px-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(u.id)}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(u.id) ? prev.filter((x) => x !== u.id) : [...prev, u.id]
                            )
                          }
                        />
                      </td>
                      <td className="py-1.5">
                        <div className="fw-bold text-dark small">{u.name}</div>
                        <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                          {u.email}
                        </div>
                      </td>
                      <td className="small">{u.phone || "—"}</td>
                      <td>
                        <span className={`badge ${ROLE_BADGE[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td>
                        <div className="small fw-medium">{u.region || "—"}</div>
                        {u.skills?.length > 0 && (
                          <div className="d-flex flex-wrap gap-1 mt-0.5">
                            {u.skills.map((sk) => (
                              <span
                                key={sk}
                                className="badge bg-light text-dark border"
                                style={{ fontSize: "0.68rem" }}
                              >
                                {sk}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="text-center fw-bold small">
                        {u._count?.assignedTickets ?? 0}
                      </td>
                      <td className="text-center">
                        {u.isActive ? (
                          <span className="badge bg-success">Hoạt động</span>
                        ) : (
                          <span className="badge bg-secondary">Đã khóa</span>
                        )}
                      </td>
                      <td className="px-3 text-end">
                        <div className="btn-group btn-group-sm">
                          <Link
                            href={`/admin/permissions?userId=${u.id}`}
                            className="btn btn-outline-info btn-sm py-0 px-2"
                            title="Phân quyền chi tiết cho nhân viên này"
                          >
                            <i className="fas fa-key"></i>
                          </Link>
                          <button
                            className="btn btn-outline-primary btn-sm py-0 px-2"
                            title="Sửa"
                            onClick={() => openEdit(u)}
                          >
                            <i className="fas fa-pen"></i>
                          </button>
                          <button
                            className={`btn btn-sm py-0 px-2 ${
                              u.isActive ? "btn-outline-warning" : "btn-outline-success"
                            }`}
                            title={u.isActive ? "Khóa tài khoản" : "Mở khóa"}
                            onClick={() => handleToggleActive(u)}
                          >
                            <i className={`fas ${u.isActive ? "fa-lock" : "fa-unlock"}`}></i>
                          </button>
                          <button
                            className="btn btn-outline-danger btn-sm py-0 px-2"
                            title="Xóa"
                            onClick={() => handleDelete(u.id)}
                          >
                            <i className="fas fa-trash-alt"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
      >
        <button
          className="btn btn-warning btn-sm rounded-pill px-3"
          onClick={() => handleBatchToggle(false)}
        >
          <i className="fas fa-lock me-1"></i> Khóa đã chọn
        </button>
        <button
          className="btn btn-success btn-sm rounded-pill px-3"
          onClick={() => handleBatchToggle(true)}
        >
          <i className="fas fa-unlock me-1"></i> Mở khóa đã chọn
        </button>
      </BatchActionBar>

      {/* Modal Thêm / Sửa Tài khoản */}
      <ModalShell
        show={showModal}
        title={editing ? `Cập nhật tài khoản: ${editing.name}` : "Thêm tài khoản mới"}
        onClose={() => setShowModal(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowModal(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="user-form"
              disabled={saving}
              className="btn btn-primary btn-sm px-3 fw-bold"
            >
              {saving ? "Đang lưu..." : "Lưu thông tin"}
            </button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSave}>
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                HỌ VÀ TÊN <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                className="form-control form-control-sm"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                EMAIL ĐĂNG NHẬP <span className="text-danger">*</span>
              </label>
              <input
                type="email"
                required
                className="form-control form-control-sm"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                {editing ? "MẬT KHẨU MỚI (ĐỂ TRỐNG NẾU GIỮ NGUYÊN)" : "MẬT KHẨU *"}
              </label>
              <input
                type="password"
                required={!editing}
                minLength={6}
                placeholder={editing ? "••••••••" : "Tối thiểu 6 ký tự"}
                className="form-control form-control-sm"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">SỐ ĐIỆN THOẠI</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-primary mb-1">
                VAI TRÒ PHÂN QUYỀN <span className="text-danger">*</span>
              </label>
              <select
                className="form-select form-select-sm border-primary"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
              >
                {Object.entries(ROLE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                KHU VỰC PHỤ TRÁCH (ĐIỀU PHỐI)
              </label>
              <input
                type="text"
                placeholder="VD: Quận 1, Cầu Giấy..."
                className="form-control form-control-sm"
                value={formData.region}
                onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              />
            </div>

            <div className="col-12">
              <label className="form-label small fw-bold text-muted mb-1">
                CHUYÊN MÔN DÒNG MÁY (PHÂN CÁCH BẰNG DẤU PHẨY)
              </label>
              <input
                type="text"
                placeholder="VD: Ricoh, Canon, HP, Photocopy màu..."
                className="form-control form-control-sm"
                value={formData.skillsText}
                onChange={(e) => setFormData({ ...formData, skillsText: e.target.value })}
              />
            </div>

            <div className="col-12 mt-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="userActiveSwitch"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label className="form-check-label small fw-medium" htmlFor="userActiveSwitch">
                  Cho phép tài khoản đăng nhập hoạt động
                </label>
              </div>
            </div>
          </div>
        </form>
      </ModalShell>

      <MailTestModal
        isOpen={showMailModal}
        onClose={() => setShowMailModal(false)}
      />
    </div>
  );
}
