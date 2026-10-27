"use client";

import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import Loading from "@/components/Loading";

export interface PartCategoryItem {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    parts: number;
  };
}

interface PartCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
  onCreated?: (newCategory: PartCategoryItem) => void;
}

const PRESET_COLORS = [
  "#2563eb", // Xanh dương
  "#0891b2", // Xanh ngọc
  "#16a34a", // Xanh lá
  "#ea580c", // Cam đậm
  "#dc2626", // Đỏ
  "#7c3aed", // Tím
  "#eab308", // Vàng đậm
  "#64748b", // Xám slate
];

export default function PartCategoriesModal({
  isOpen,
  onClose,
  onChanged,
  onCreated,
}: PartCategoriesModalProps) {
  const [categories, setCategories] = useState<PartCategoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PartCategoryItem | null>(null);

  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    color: "#2563eb",
    sortOrder: "1",
  });

  const loadCategories = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/part-categories");
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      } else {
        toast.error("Không thể tải danh mục vật tư");
      }
    } catch {
      toast.error("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setEditingCategory(null);
    setForm({
      code: "",
      name: "",
      description: "",
      color: "#2563eb",
      sortOrder: String(categories.length + 1),
    });
  };

  const handleStartEdit = (cat: PartCategoryItem) => {
    setEditingCategory(cat);
    setForm({
      code: cat.code || "",
      name: cat.name,
      description: cat.description || "",
      color: cat.color || "#2563eb",
      sortOrder: String(cat.sortOrder ?? 0),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.warning("Vui lòng nhập tên danh mục vật tư");
      return;
    }

    try {
      setSaving(true);
      const url = editingCategory
        ? `/api/part-categories/${editingCategory.id}`
        : "/api/part-categories";
      const method = editingCategory ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code.trim() || undefined,
          name: form.name.trim(),
          description: form.description.trim() || null,
          color: form.color,
          sortOrder: Number(form.sortOrder) || 0,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Thao tác thất bại");
        return;
      }

      toast.success(
        editingCategory
          ? `Đã cập nhật danh mục "${data.name || form.name}"`
          : `Đã tạo danh mục "${data.name || form.name}" thành công`
      );

      if (!editingCategory && onCreated) {
        onCreated(data);
      }

      resetForm();
      loadCategories();
      if (onChanged) onChanged();
    } catch {
      toast.error("Lỗi khi lưu danh mục vật tư");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: PartCategoryItem) => {
    const partsCount = cat._count?.parts || 0;
    if (partsCount > 0) {
      toast.warning(
        `Không thể xóa danh mục "${cat.name}" vì đang có ${partsCount} vật tư thuộc nhóm này. Hãy chuyển danh mục cho các vật tư trước!`
      );
      return;
    }

    if (!confirm(`Bạn có chắc muốn xóa danh mục vật tư "${cat.name}"?`)) return;

    try {
      const res = await fetch(`/api/part-categories/${cat.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể xóa");
        return;
      }

      toast.success(`Đã xóa danh mục "${cat.name}"`);
      if (editingCategory?.id === cat.id) resetForm();
      loadCategories();
      if (onChanged) onChanged();
    } catch {
      toast.error("Lỗi khi xóa danh mục");
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-folder-tree text-primary fs-5"></i>
          <span>Quản lý Danh mục Vật tư &amp; Linh kiện</span>
        </div>
      }
      size="lg"
      headerClass="bg-dark text-white"
    >
      <div className="d-flex flex-column gap-3">
        {/* Hướng dẫn ngắn */}
        <div className="small text-muted bg-light p-2.5 rounded-3 border">
          <i className="fas fa-info-circle text-primary me-1.5"></i>
          Danh mục giúp phân loại rõ ràng vật tư tiêu hao (mực, trống, gạt, sấy, bánh xe lấy giấy, bo mạch...). 
          Khi tạo mới hoặc nhập kho linh kiện, bạn có thể nhanh chóng lọc và chọn theo danh mục phù hợp.
        </div>

        {/* Khung Thêm / Sửa Danh mục */}
        <div className="card border p-3 rounded-3 bg-white shadow-sm">
          <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
            <h6 className="fw-bold mb-0 text-dark">
              <i
                className={`fas ${
                  editingCategory ? "fa-edit text-warning" : "fa-plus-circle text-success"
                } me-2`}
              ></i>
              {editingCategory
                ? `Chỉnh sửa danh mục: ${editingCategory.name}`
                : "Thêm danh mục vật tư mới"}
            </h6>
            {editingCategory && (
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

          <form onSubmit={handleSave}>
            <div className="row g-2 mb-2">
              <div className="col-12 col-md-6">
                <label className="form-label small fw-bold mb-1">
                  TÊN DANH MỤC <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="VD: Mực in & Hộp mực, Cụm trống & Gạt..."
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label small fw-bold mb-1">MÃ DANH MỤC</label>
                <input
                  type="text"
                  className="form-control form-control-sm text-uppercase font-monospace"
                  placeholder="VD: CAT-MUC"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </div>

              <div className="col-12 col-md-3">
                <label className="form-label small fw-bold mb-1">THỨ TỰ HIỂN THỊ</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                />
              </div>
            </div>

            <div className="row g-2 mb-3 align-items-center">
              <div className="col-12 col-md-7">
                <label className="form-label small fw-bold mb-1">MÔ TẢ / NHÓM CHỨC NĂNG</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="VD: Hộp mực, ống mực, bình mực thải..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>

              <div className="col-12 col-md-5">
                <label className="form-label small fw-bold mb-1">MÀU SẮC NHẬN DIỆN</label>
                <div className="d-flex align-items-center gap-2">
                  <div className="d-flex align-items-center gap-1">
                    {PRESET_COLORS.map((col) => (
                      <button
                        key={col}
                        type="button"
                        className="rounded-circle border-0 p-0"
                        style={{
                          width: "20px",
                          height: "20px",
                          backgroundColor: col,
                          cursor: "pointer",
                          transform: form.color === col ? "scale(1.2)" : "scale(1)",
                          boxShadow:
                            form.color === col ? "0 0 0 2px #fff, 0 0 0 3px #000" : "none",
                        }}
                        onClick={() => setForm({ ...form, color: col })}
                        title={col}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    className="form-control form-control-color border-0 p-0"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    style={{ width: "32px", height: "28px", cursor: "pointer" }}
                    title="Chọn màu tùy biến"
                  />
                </div>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2">
              {editingCategory && (
                <button
                  type="button"
                  className="btn btn-sm btn-light border px-3"
                  onClick={resetForm}
                >
                  Hủy
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="btn btn-sm btn-primary px-3 fw-semibold shadow-sm"
              >
                {saving ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-1"></i> Đang lưu...
                  </>
                ) : editingCategory ? (
                  <>
                    <i className="fas fa-check me-1"></i> Cập nhật danh mục
                  </>
                ) : (
                  <>
                    <i className="fas fa-plus me-1"></i> Thêm danh mục
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Danh sách các danh mục hiện có */}
        <div className="card border rounded-3 bg-white shadow-sm overflow-hidden">
          <div className="card-header bg-light py-2 px-3 d-flex justify-content-between align-items-center">
            <span className="fw-bold text-dark small">
              <i className="fas fa-list text-muted me-1.5"></i>
              Danh sách danh mục hiện có ({categories.length})
            </span>
          </div>

          <div className="card-body p-0">
            {loading ? (
              <div className="p-4 text-center">
                <Loading />
              </div>
            ) : categories.length === 0 ? (
              <div className="p-4 text-center text-muted small">
                Chưa có danh mục nào. Hãy thêm danh mục đầu tiên ở biểu mẫu phía trên!
              </div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: "320px", overflowY: "auto" }}>
                <table className="table table-hover align-middle mb-0 custom-dense-table small">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th className="px-3" style={{ width: "60px" }}>STT</th>
                      <th style={{ width: "120px" }}>Mã</th>
                      <th>Tên danh mục vật tư</th>
                      <th>Mô tả</th>
                      <th className="text-center" style={{ width: "110px" }}>Số lượng VT</th>
                      <th className="text-end px-3" style={{ width: "110px" }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 text-muted font-monospace">{c.sortOrder}</td>
                        <td>
                          <span className="badge bg-light text-dark font-monospace border px-1.5 py-0.5">
                            {c.code || "—"}
                          </span>
                        </td>
                        <td>
                          <div className="d-flex align-items-center gap-2">
                            <span
                              className="rounded-circle d-inline-block"
                              style={{
                                width: "10px",
                                height: "10px",
                                backgroundColor: c.color || "#2563eb",
                                flexShrink: 0,
                              }}
                            />
                            <strong className="text-dark">{c.name}</strong>
                          </div>
                        </td>
                        <td className="text-muted text-truncate" style={{ maxWidth: "220px" }}>
                          {c.description || "—"}
                        </td>
                        <td className="text-center">
                          <span
                            className={`badge rounded-pill ${
                              (c._count?.parts || 0) > 0
                                ? "bg-primary-subtle text-primary border"
                                : "bg-light text-muted"
                            } px-2 py-0.5 fw-bold`}
                          >
                            {c._count?.parts || 0} vật tư
                          </span>
                        </td>
                        <td className="text-end px-3">
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-outline-secondary py-0 px-2"
                              title="Chỉnh sửa danh mục"
                              onClick={() => handleStartEdit(c)}
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger py-0 px-2"
                              title="Xóa danh mục"
                              onClick={() => handleDelete(c)}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="d-flex justify-content-end">
          <button type="button" className="btn btn-secondary btn-sm px-4 fw-bold" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
