"use client";

import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import type { CustomerGroupItem } from "@/lib/customerGroupRepo";

interface CustomerGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged: () => void;
}

const PRESET_COLORS = [
  "#2563eb", // Blue
  "#eab308", // Yellow / Gold
  "#16a34a", // Green
  "#0891b2", // Cyan
  "#7c3aed", // Purple
  "#dc2626", // Red
  "#ea580c", // Orange
  "#64748b", // Slate
];

export default function CustomerGroupModal({
  isOpen,
  onClose,
  onChanged,
}: CustomerGroupModalProps) {
  const [groups, setGroups] = useState<CustomerGroupItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<CustomerGroupItem | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    code: "",
    description: "",
    color: "#2563eb",
    sortOrder: 0,
  });

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customer-groups");
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch {
      toast.error("Không thể tải danh sách loại khách hàng");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadGroups();
    }
  }, [isOpen]);

  const resetForm = () => {
    setEditing(null);
    setFormData({
      name: "",
      code: "",
      description: "",
      color: "#2563eb",
      sortOrder: groups.length > 0 ? Math.max(...groups.map((g) => g.sortOrder || 0)) + 1 : 1,
    });
  };

  const handleStartEdit = (g: CustomerGroupItem) => {
    setEditing(g);
    setFormData({
      name: g.name,
      code: g.code || "",
      description: g.description || "",
      color: g.color || "#2563eb",
      sortOrder: g.sortOrder || 0,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.warning("Vui lòng nhập tên loại khách hàng");
      return;
    }

    setSubmitting(true);
    try {
      const url = editing ? `/api/customer-groups/${editing.id}` : "/api/customer-groups";
      const method = editing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name.trim(),
          code: formData.code.trim() || null,
          description: formData.description.trim() || null,
          color: formData.color,
          sortOrder: Number(formData.sortOrder) || 0,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Không thể lưu loại khách hàng");
        return;
      }

      toast.success(editing ? "Đã cập nhật loại khách hàng" : "Đã tạo loại khách hàng mới thành công");
      resetForm();
      loadGroups();
      onChanged();
    } catch {
      toast.error("Lỗi kết nối máy chủ");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (g: CustomerGroupItem) => {
    if (g.customerCount && g.customerCount > 0) {
      toast.warning(
        `Loại "${g.name}" đang có ${g.customerCount} khách hàng sử dụng. Bạn phải chuyển các khách hàng sang loại khác trước khi xóa.`
      );
      return;
    }

    if (!window.confirm(`Bạn có chắc chắn muốn xóa loại khách hàng "${g.name}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/customer-groups/${g.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể xóa loại khách hàng");
        return;
      }

      toast.success(`Đã xóa loại khách hàng "${g.name}"`);
      if (editing?.id === g.id) resetForm();
      loadGroups();
      onChanged();
    } catch {
      toast.error("Lỗi kết nối khi xóa");
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-layer-group text-primary fs-5"></i>
          <span>Quản lý Loại &amp; Phân nhóm khách hàng</span>
        </div>
      }
      size="lg"
      headerClass="bg-dark text-white"
    >
      <div className="d-flex flex-column gap-3">
        {/* Hướng dẫn */}
        <div className="small text-muted bg-light p-2 rounded border">
          <i className="fas fa-info-circle text-primary me-1"></i>
          Chủ động định nghĩa các phân nhóm khách hàng theo chiến lược kinh doanh của doanh nghiệp (ví dụ:{" "}
          <em>Khách VIP, Khách thuê máy, Khách mua máy, Khách dự án, Khách ngân hàng...</em>). Khi đổi tên một nhóm, hệ
          thống sẽ tự động đồng bộ tên mới cho toàn bộ khách hàng đang thuộc nhóm đó.
        </div>

        {/* Khung thêm / sửa */}
        <div className="card border p-3 rounded bg-white shadow-sm">
          <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h6 className="fw-bold mb-0 text-dark">
              <i className={`fas ${editing ? "fa-edit text-warning" : "fa-plus-circle text-success"} me-2`}></i>
              {editing ? `Chỉnh sửa loại: ${editing.name}` : "Thêm loại khách hàng mới"}
            </h6>
            {editing && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary py-0 px-2"
                style={{ fontSize: "12px" }}
                onClick={resetForm}
              >
                <i className="fas fa-undo me-1"></i> Hủy sửa / Tạo mới
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="row g-2 mb-2">
              <div className="col-12 col-md-6">
                <label className="form-label small fw-bold mb-1">
                  Tên loại khách hàng <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="VD: Khách VIP, Khách thuê máy..."
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label small fw-bold mb-1">Mã phân loại</label>
                <input
                  type="text"
                  className="form-control form-control-sm text-uppercase font-monospace"
                  placeholder="VD: VIP, CORP..."
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label small fw-bold mb-1">Thứ tự ưu tiên</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={formData.sortOrder}
                  onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="row g-2 mb-3 align-items-center">
              <div className="col-12 col-md-8">
                <label className="form-label small fw-bold mb-1">Mô tả / Chính sách dịch vụ</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="VD: SLA xử lý sự cố trong 2 giờ, ưu tiên đổi linh kiện..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>

              <div className="col-12 col-md-4">
                <label className="form-label small fw-bold mb-1">Màu sắc nhận diện</label>
                <div className="d-flex align-items-center gap-2">
                  <input
                    type="color"
                    className="form-control form-control-color form-control-sm p-0"
                    style={{ width: "38px", height: "31px", cursor: "pointer" }}
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  />
                  <div className="d-flex gap-1 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <span
                        key={c}
                        onClick={() => setFormData({ ...formData, color: c })}
                        style={{
                          backgroundColor: c,
                          width: "18px",
                          height: "18px",
                          borderRadius: "4px",
                          cursor: "pointer",
                          border: formData.color === c ? "2px solid #000" : "1px solid rgba(0,0,0,0.15)",
                        }}
                      ></span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2">
              {editing && (
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={resetForm}>
                  Hủy
                </button>
              )}
              <button
                type="submit"
                className={`btn btn-sm px-4 fw-bold ${editing ? "btn-warning" : "btn-primary"}`}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                    Đang lưu...
                  </>
                ) : editing ? (
                  <>
                    <i className="fas fa-save me-1"></i> Lưu thay đổi
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus me-1"></i> Thêm loại mới
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Danh sách các loại khách hàng */}
        <div>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="fw-bold small text-uppercase text-secondary">
              <i className="fas fa-list me-1"></i> Danh sách loại khách hàng ({groups.length})
            </span>
            <button
              type="button"
              className="btn btn-sm btn-link p-0 text-decoration-none text-muted"
              onClick={loadGroups}
            >
              <i className="fas fa-sync-alt me-1"></i> Làm mới
            </button>
          </div>

          <div className="table-responsive border rounded bg-white shadow-sm" style={{ maxHeight: "300px" }}>
            <table className="table table-sm table-hover align-middle mb-0" style={{ fontSize: "13px" }}>
              <thead className="table-light sticky-top" style={{ zIndex: 1 }}>
                <tr>
                  <th style={{ width: "45px" }} className="text-center">#</th>
                  <th style={{ width: "180px" }}>Tên loại khách hàng</th>
                  <th style={{ width: "90px" }}>Mã loại</th>
                  <th style={{ width: "110px" }} className="text-center">Số khách</th>
                  <th>Mô tả / SLA</th>
                  <th style={{ width: "70px" }} className="text-center">Thứ tự</th>
                  <th style={{ width: "90px" }} className="text-end pe-3">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-muted">
                      <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                      Đang tải danh sách...
                    </td>
                  </tr>
                ) : groups.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-4 text-muted fst-italic">
                      Chưa có loại khách hàng nào
                    </td>
                  </tr>
                ) : (
                  groups.map((g, idx) => (
                    <tr key={g.id} className={editing?.id === g.id ? "table-warning bg-opacity-25" : ""}>
                      <td className="text-center text-muted small">{idx + 1}</td>
                      <td>
                        <span
                          className="badge d-inline-flex align-items-center gap-1 shadow-sm"
                          style={{
                            backgroundColor: g.color || "#2563eb",
                            color: "#fff",
                            fontSize: "12px",
                            padding: "4px 8px",
                          }}
                        >
                          <i className="fas fa-building" style={{ fontSize: "10px" }}></i>
                          {g.name}
                        </span>
                      </td>
                      <td>
                        {g.code ? (
                          <span className="badge bg-light text-dark border font-monospace">{g.code}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-center">
                        <span
                          className={`badge ${
                            (g.customerCount || 0) > 0 ? "bg-primary-subtle text-primary border" : "bg-light text-muted"
                          }`}
                        >
                          {g.customerCount || 0} khách
                        </span>
                      </td>
                      <td className="text-muted small text-truncate" style={{ maxWidth: "240px" }} title={g.description || ""}>
                        {g.description || "—"}
                      </td>
                      <td className="text-center font-monospace text-secondary small">{g.sortOrder}</td>
                      <td className="text-end pe-3">
                        <div className="btn-group btn-group-sm">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-xs py-0 px-2"
                            title="Chỉnh sửa"
                            onClick={() => handleStartEdit(g)}
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-xs py-0 px-2"
                            title="Xóa"
                            disabled={(g.customerCount || 0) > 0}
                            onClick={() => handleDelete(g)}
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

        {/* Footer */}
        <div className="d-flex justify-content-end pt-2 border-top">
          <button type="button" className="btn btn-outline-secondary btn-sm px-4" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
