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
  createdAt: string;
  updatedAt: string;
  _count?: {
    parts: number;
  };
}

interface PartCategoriesTabProps {
  onSelectCategory?: (categoryName: string) => void;
  onChanged?: () => void;
}

export default function PartCategoriesTab({ onSelectCategory, onChanged }: PartCategoriesTabProps) {
  const [categories, setCategories] = useState<PartCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<PartCategoryItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    code: "",
    name: "",
    description: "",
    color: "#0284c7",
    sortOrder: "0",
  });

  const [reloadTrigger, setReloadTrigger] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function fetchCategories() {
      try {
        setLoading(true);
        const res = await fetch("/api/part-categories");
        if (res.ok && !ignore) {
          const data = await res.json();
          setCategories(data.categories || []);
        } else if (!ignore) {
          toast.error("Không thể tải danh mục vật tư");
        }
      } catch {
        if (!ignore) toast.error("Lỗi kết nối máy chủ");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchCategories();
    return () => {
      ignore = true;
    };
  }, [reloadTrigger]);

  const handleOpenCreate = () => {
    setEditingCategory(null);
    setForm({
      code: `CAT-${(categories.length + 1).toString().padStart(2, "0")}`,
      name: "",
      description: "",
      color: "#0284c7",
      sortOrder: String(categories.length + 1),
    });
    setShowModal(true);
  };

  const handleOpenEdit = (cat: PartCategoryItem) => {
    setEditingCategory(cat);
    setForm({
      code: cat.code || "",
      name: cat.name,
      description: cat.description || "",
      color: cat.color || "#0284c7",
      sortOrder: String(cat.sortOrder),
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.warning("Vui lòng nhập tên danh mục");
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

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Thao tác thất bại");
        return;
      }

      toast.success(editingCategory ? "Cập nhật danh mục thành công!" : "Tạo danh mục mới thành công!");
      setShowModal(false);
      setReloadTrigger((v) => v + 1);
      if (onChanged) onChanged();
    } catch {
      toast.error("Lỗi khi lưu danh mục");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: PartCategoryItem) => {
    if (cat._count && cat._count.parts > 0) {
      toast.warning(`Không thể xóa danh mục "${cat.name}" vì đang có ${cat._count.parts} vật tư thuộc nhóm này.`);
      return;
    }

    if (!confirm(`Bạn có chắc muốn xóa danh mục vật tư "${cat.name}"?`)) return;

    try {
      const res = await fetch(`/api/part-categories/${cat.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Không thể xóa");
        return;
      }
      toast.success("Đã xóa danh mục vật tư");
      setReloadTrigger((v) => v + 1);
      if (onChanged) onChanged();
    } catch {
      toast.error("Lỗi khi xóa");
    }
  };

  return (
    <div className="card shadow-sm border-0 rounded-3">
      <div className="card-header bg-white py-3 d-flex flex-wrap align-items-center justify-content-between gap-2 border-bottom">
        <div>
          <h6 className="mb-0 fw-bold text-dark">
            <i className="fas fa-folder-tree text-primary me-2"></i>
            Danh mục Vật tư &amp; Phân nhóm Linh kiện ({categories.length})
          </h6>
          <small className="text-muted">
            Phân loại mực in, cụm trống, cụm sấy, bánh xe kéo giấy, bo mạch và linh kiện cơ khí
          </small>
        </div>
        <button className="btn btn-primary btn-sm px-3 fw-semibold" onClick={handleOpenCreate}>
          <i className="fas fa-plus me-1.5"></i> Thêm danh mục mới
        </button>
      </div>

      <div className="card-body p-0">
        {loading ? (
          <div className="p-5 text-center text-muted">
            <Loading />
          </div>
        ) : categories.length === 0 ? (
          <div className="p-5 text-center text-muted">
            <i className="fas fa-folder-open fa-2x mb-2 text-secondary opacity-50"></i>
            <p className="mb-2">Chưa có danh mục vật tư nào.</p>
            <button className="btn btn-outline-primary btn-sm" onClick={handleOpenCreate}>
              Thêm danh mục đầu tiên
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 custom-dense-table">
              <thead className="table-light">
                <tr>
                  <th className="px-3" style={{ width: "80px" }}>Thứ tự</th>
                  <th style={{ width: "140px" }}>Mã danh mục</th>
                  <th>Tên danh mục vật tư</th>
                  <th>Mô tả / Nhóm chức năng</th>
                  <th className="text-center" style={{ width: "120px" }}>Số lượng vật tư</th>
                  <th className="text-end px-3" style={{ width: "140px" }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 text-muted font-monospace">{c.sortOrder}</td>
                    <td>
                      <span className="badge bg-light text-dark font-monospace border px-2 py-1">
                        {c.code || "—"}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                        <span
                          className="rounded-circle d-inline-block"
                          style={{
                            width: "12px",
                            height: "12px",
                            backgroundColor: c.color || "#0284c7",
                            flexShrink: 0,
                          }}
                        />
                        <strong className="text-dark">{c.name}</strong>
                      </div>
                    </td>
                    <td className="small text-muted text-break">{c.description || "—"}</td>
                    <td className="text-center">
                      <span
                        className={`badge rounded-pill ${
                          (c._count?.parts || 0) > 0 ? "bg-primary-subtle text-primary border" : "bg-light text-muted"
                        } px-2.5 py-1 fw-bold`}
                        style={{ cursor: onSelectCategory ? "pointer" : "default" }}
                        onClick={() => onSelectCategory && onSelectCategory(c.name)}
                        title="Bấm để lọc danh sách vật tư theo nhóm này"
                      >
                        {c._count?.parts || 0} vật tư
                      </span>
                    </td>
                    <td className="text-end px-3">
                      <div className="btn-group btn-group-sm">
                        <button
                          className="btn btn-outline-secondary"
                          title="Sửa danh mục"
                          onClick={() => handleOpenEdit(c)}
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          className="btn btn-outline-danger"
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

      {/* Modal Thêm / Sửa Danh mục */}
      <ModalShell
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingCategory ? "Chỉnh sửa Danh mục Vật tư" : "Thêm Danh mục Vật tư mới"}
        size="md"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <button
              type="button"
              className="btn btn-light border px-3"
              onClick={() => setShowModal(false)}
              disabled={saving}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-primary px-4 fw-semibold"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Đang lưu..." : editingCategory ? "Lưu thay đổi" : "Tạo danh mục"}
            </button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="p-3">
          <div className="mb-3">
            <label className="form-label small fw-bold text-dark">
              Tên danh mục <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="VD: Mực in &amp; Hộp mực, Trống &amp; Gạt..."
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>

          <div className="row g-2 mb-3">
            <div className="col-md-6">
              <label className="form-label small fw-bold text-dark">Mã danh mục</label>
              <input
                type="text"
                className="form-control form-control-sm font-monospace"
                placeholder="VD: CAT-MUC"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-dark">Thứ tự hiển thị</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold text-dark">Màu sắc nhận diện</label>
            <div className="d-flex align-items-center gap-2">
              <input
                type="color"
                className="form-control form-control-color border-0 p-0"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                style={{ width: "38px", height: "32px", cursor: "pointer" }}
              />
              <input
                type="text"
                className="form-control form-control-sm font-monospace"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="#0284c7"
                style={{ maxWidth: "120px" }}
              />
            </div>
          </div>

          <div className="mb-2">
            <label className="form-label small fw-bold text-dark">Mô tả / Ghi chú</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              placeholder="Mô tả các vật tư thuộc danh mục này..."
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
