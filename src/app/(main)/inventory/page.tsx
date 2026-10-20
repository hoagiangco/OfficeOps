"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import ModalShell from "@/components/ModalShell";
import { exportToCsv } from "@/lib/csv";

interface BatchItem {
  id: string;
  batchCode: string;
  quantity: number;
  receivedDate: string;
  costPrice: string | number;
  location: string;
}

interface PartItem {
  id: string;
  partCode: string;
  name: string;
  category: string | null;
  unit: string;
  compatibleModels: string[];
  minThreshold: number;
  salePrice: string | number | null;
  isActive: boolean;
  currentQuantity: number;
  isLowStock: boolean;
  batches: BatchItem[];
}

export default function InventoryPage() {
  const [parts, setParts] = useState<PartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Modal Thêm / Sửa Danh mục Linh kiện
  const [showPartModal, setShowPartModal] = useState(false);
  const [editingPart, setEditingPart] = useState<PartItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [partForm, setPartForm] = useState({
    partCode: "",
    name: "",
    category: "Mực & Cụm trống",
    unit: "cái",
    compatibleText: "",
    minThreshold: "5",
    salePrice: "",
  });

  // Modal Nhập lô hàng mới (FIFO Batch In)
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchForm, setBatchForm] = useState({
    partId: "",
    batchCode: "",
    quantity: "10",
    costPrice: "250000",
    location: "Tủ A - Kệ 1",
  });

  // Modal Xem các lô tồn FIFO của 1 linh kiện
  const [viewBatchesPart, setViewBatchesPart] = useState<PartItem | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      if (categoryFilter) sp.set("category", categoryFilter);

      const res = await fetch(`/api/parts?${sp.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách tồn kho");
      const data = await res.json();
      setParts(data.items || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải kho");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, categoryFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNewPart = () => {
    setEditingPart(null);
    setPartForm({
      partCode: `LK-${String(total + 1).padStart(4, "0")}`,
      name: "",
      category: "Mực & Cụm trống",
      unit: "cái",
      compatibleText: "",
      minThreshold: "5",
      salePrice: "",
    });
    setShowPartModal(true);
  };

  const openEditPart = (p: PartItem) => {
    setEditingPart(p);
    setPartForm({
      partCode: p.partCode,
      name: p.name,
      category: p.category || "",
      unit: p.unit,
      compatibleText: (p.compatibleModels || []).join(", "),
      minThreshold: String(p.minThreshold),
      salePrice: p.salePrice !== null ? String(p.salePrice) : "",
    });
    setShowPartModal(true);
  };

  const handleSavePart = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const compatibleModels = partForm.compatibleText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const payload: Record<string, unknown> = {
        ...(editingPart ? { id: editingPart.id } : { partCode: partForm.partCode }),
        name: partForm.name,
        category: partForm.category || undefined,
        unit: partForm.unit || "cái",
        compatibleModels,
        minThreshold: Number(partForm.minThreshold),
        salePrice: partForm.salePrice ? Number(partForm.salePrice) : undefined,
      };

      const res = await fetch("/api/parts", {
        method: editingPart ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu linh kiện");
        return;
      }
      toast.success(editingPart ? "Đã cập nhật linh kiện" : "Đã thêm mã linh kiện mới");
      setShowPartModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const openBatchIn = (p?: PartItem) => {
    const dStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    setBatchForm({
      partId: p?.id || parts[0]?.id || "",
      batchCode: `LOT-${dStr}-${Math.floor(100 + Math.random() * 900)}`,
      quantity: "10",
      costPrice: "250000",
      location: "Tủ A - Kệ 1",
    });
    setShowBatchModal(true);
  };

  const handleSaveBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/inventory/batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId: batchForm.partId,
          batchCode: batchForm.batchCode,
          quantity: Number(batchForm.quantity),
          costPrice: Number(batchForm.costPrice),
          location: batchForm.location,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể nhập lô hàng");
        return;
      }
      toast.success("Đã nhập kho lô hàng mới (FIFO)");
      setShowBatchModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const chips: FilterChipItem[] = [];
  if (search.trim()) {
    chips.push({
      id: "q",
      label: "Tìm kiếm",
      value: search.trim(),
      onClear: () => {
        setSearch("");
        setPage(1);
      },
    });
  }
  if (categoryFilter) {
    chips.push({
      id: "cat",
      label: "Danh mục",
      value: categoryFilter,
      onClear: () => {
        setCategoryFilter("");
        setPage(1);
      },
    });
  }

  const lowStockCount = parts.filter((p) => p.isLowStock && p.currentQuantity > 0).length;
  const outOfStockCount = parts.filter((p) => p.currentQuantity <= 0).length;
  const categories = Array.from(new Set(parts.map((p) => p.category).filter(Boolean))) as string[];

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header chuẩn spare-parts HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-primary text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-boxes fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">QUẢN LÝ VẬT TƯ DỰ PHÒNG &amp; LÔ FIFO</h1>
          <div className="vr mx-2 d-none d-md-block" style={{ height: "20px" }}></div>
          <div className="d-none d-md-flex gap-3">
            <span className="small text-muted">
              Tổng mã: <strong>{total}</strong>
            </span>
            <span className="small text-warning-emphasis">
              Sắp hết: <strong>{lowStockCount}</strong>
            </span>
            <span className="small text-danger">
              Hết hàng: <strong>{outOfStockCount}</strong>
            </span>
          </div>
        </div>
        <div className="d-flex gap-1">
          <button
            className="btn btn-outline-success btn-sm px-3 fw-bold"
            onClick={() =>
              exportToCsv(
                "ton-kho-vat-tu-fifo.csv",
                [
                  "Mã linh kiện",
                  "Tên vật tư",
                  "Danh mục",
                  "Đơn vị",
                  "Tồn kho hiện tại",
                  "Định mức tối thiểu",
                  "Giá bán lẻ",
                  "Số lô FIFO",
                ],
                parts.map((p) => [
                  p.partCode,
                  p.name,
                  p.category || "",
                  p.unit,
                  p.currentQuantity,
                  p.minThreshold,
                  p.salePrice ?? "",
                  p.batches.length,
                ])
              )
            }
          >
            <i className="fas fa-file-excel me-1"></i> Xuất Excel
          </button>
          <button
            className="btn btn-light border shadow-sm btn-sm px-3 fw-bold text-dark"
            onClick={() => window.print()}
          >
            <i className="fas fa-print text-primary me-1"></i> In báo cáo
          </button>
          <button
            className="btn btn-success btn-sm px-3 fw-bold shadow-sm"
            onClick={() => openBatchIn()}
          >
            <i className="fas fa-plus-circle me-1"></i> Nhập lô FIFO
          </button>
          <Link
            href="/stock-issues"
            className="btn btn-warning btn-sm px-3 fw-bold shadow-sm text-dark"
          >
            <i className="fas fa-minus-circle me-1"></i> Xuất kho
          </Link>
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={openNewPart}>
            <i className="fas fa-plus me-1"></i> Thêm mã mới
          </button>
        </div>
      </div>

      {/* Dense Filters */}
      <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
        <div className="card-body p-2 bg-light bg-opacity-50">
          <div className="row g-2">
            <div className="col-md-5">
              <div className="input-group input-group-sm border rounded-2 overflow-hidden bg-white">
                <span className="input-group-text bg-white border-0 pe-1">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-0 shadow-none"
                  placeholder="Tìm mã hoặc tên vật tư linh kiện..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="col-md-3">
              <select
                className="form-select form-select-sm"
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Tất cả danh mục --</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
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
            <div className="col-md-2">
              <button className="btn btn-outline-dark btn-sm w-100" onClick={loadData}>
                <i className="fas fa-sync-alt me-1"></i> Tải lại
              </button>
            </div>
          </div>
        </div>
      </div>

      <ActiveFilterChips
        chips={chips}
        onClearAll={() => {
          setSearch("");
          setCategoryFilter("");
          setPage(1);
        }}
      />

      {/* Ultra-Dense Table chuẩn HoaGiang */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
        <div className="card-body p-0">
          <div className="table-responsive table-sticky-container">
            <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-3 py-2 text-uppercase small" style={{ width: "110px" }}>
                    Mã LK
                  </th>
                  <th className="py-2 text-uppercase small">Tên vật tư &amp; Dòng máy tương thích</th>
                  <th className="py-2 text-uppercase small">Danh mục</th>
                  <th className="py-2 text-uppercase small text-center">Số lô FIFO</th>
                  <th className="py-2 text-uppercase small text-center" style={{ width: "110px" }}>
                    Tồn kho
                  </th>
                  <th className="py-2 text-uppercase small text-center" style={{ width: "110px" }}>
                    Cảnh báo
                  </th>
                  <th className="py-2 text-uppercase small text-end px-3" style={{ width: "150px" }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <Loading />
                    </td>
                  </tr>
                ) : parts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-5 text-muted small">
                      Không tìm thấy vật tư nào trong kho
                    </td>
                  </tr>
                ) : (
                  parts.map((item) => {
                    const isOutOfStock = item.currentQuantity <= 0;
                    const isWarning = item.isLowStock && !isOutOfStock;
                    return (
                      <tr
                        key={item.id}
                        className={
                          isOutOfStock
                            ? "bg-danger-subtle bg-opacity-10"
                            : isWarning
                              ? "bg-warning-subtle bg-opacity-10"
                              : ""
                        }
                      >
                        <td className="px-3 font-monospace fw-bold text-primary small">
                          {item.partCode}
                        </td>
                        <td className="py-1.5">
                          <div className="d-flex align-items-center">
                            <div
                              className={`p-1 rounded-1 me-2 d-flex align-items-center justify-content-center border ${
                                isOutOfStock
                                  ? "bg-danger text-white border-danger"
                                  : isWarning
                                    ? "bg-warning text-dark border-warning"
                                    : "bg-light text-primary border-light-subtle"
                              }`}
                              style={{ width: "28px", height: "28px" }}
                            >
                              <i
                                className={`fas ${
                                  isOutOfStock
                                    ? "fa-exclamation-triangle"
                                    : isWarning
                                      ? "fa-exclamation"
                                      : "fa-box"
                                } fa-xs`}
                              ></i>
                            </div>
                            <div className="lh-sm">
                              <div className="fw-bold text-dark small">{item.name}</div>
                              <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                                Tương thích:{" "}
                                {item.compatibleModels?.length > 0
                                  ? item.compatibleModels.join(", ")
                                  : "Mọi dòng máy"}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="small fw-medium text-dark bg-light px-2 py-0.5 border rounded">
                            {item.category || "Chung"}
                          </span>
                        </td>
                        <td className="text-center">
                          <button
                            className="btn btn-outline-secondary btn-sm py-0 px-2"
                            style={{ fontSize: "0.75rem" }}
                            onClick={() => setViewBatchesPart(item)}
                          >
                            <i className="fas fa-layer-group me-1"></i>
                            {item.batches.length} lô
                          </button>
                        </td>
                        <td className="text-center">
                          <div
                            className={`fw-bold small ${
                              isOutOfStock
                                ? "text-danger"
                                : isWarning
                                  ? "text-warning-emphasis"
                                  : "text-success"
                            }`}
                          >
                            {item.currentQuantity}{" "}
                            <span className="opacity-75 fw-normal">{item.unit}</span>
                          </div>
                        </td>
                        <td className="text-center">
                          <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                            Tối thiểu: {item.minThreshold} {item.unit}
                          </span>
                          {isOutOfStock && (
                            <div className="text-danger fw-bold" style={{ fontSize: "0.7rem" }}>
                              HẾT HÀNG!
                            </div>
                          )}
                          {isWarning && (
                            <div
                              className="text-warning-emphasis fw-bold"
                              style={{ fontSize: "0.7rem" }}
                            >
                              SẮP HẾT!
                            </div>
                          )}
                        </td>
                        <td className="px-3 text-end">
                          <div className="btn-group btn-group-sm">
                            <button
                              className="btn btn-outline-success btn-sm py-0 px-2"
                              title="Nhập thêm lô FIFO"
                              onClick={() => openBatchIn(item)}
                            >
                              <i className="fas fa-plus"></i>
                            </button>
                            <button
                              className="btn btn-outline-info btn-sm py-0 px-2"
                              title="Xem chi tiết các lô FIFO"
                              onClick={() => setViewBatchesPart(item)}
                            >
                              <i className="fas fa-boxes"></i>
                            </button>
                            <button
                              className="btn btn-outline-primary btn-sm py-0 px-2"
                              title="Sửa thông tin"
                              onClick={() => openEditPart(item)}
                            >
                              <i className="fas fa-pen"></i>
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
      </div>

      {/* Modal Thêm / Sửa Linh kiện */}
      <ModalShell
        show={showPartModal}
        title={editingPart ? `Sửa vật tư: ${editingPart.partCode}` : "Thêm mã vật tư dự phòng mới"}
        onClose={() => setShowPartModal(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowPartModal(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="part-form"
              disabled={saving}
              className="btn btn-primary btn-sm px-3 fw-bold"
            >
              {saving ? "Đang lưu..." : "Lưu vật tư"}
            </button>
          </>
        }
      >
        <form id="part-form" onSubmit={handleSavePart}>
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                MÃ VẬT TƯ <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!!editingPart}
                className="form-control form-control-sm font-monospace"
                value={partForm.partCode}
                onChange={(e) => setPartForm({ ...partForm, partCode: e.target.value })}
              />
            </div>
            <div className="col-md-8">
              <label className="form-label small fw-bold text-muted mb-1">
                TÊN VẬT TƯ / LINH KIỆN <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="VD: Trống từ Ricoh MP 3055"
                className="form-control form-control-sm"
                value={partForm.name}
                onChange={(e) => setPartForm({ ...partForm, name: e.target.value })}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-primary mb-1">DANH MỤC</label>
              <input
                type="text"
                placeholder="Mực, Cụm sấy, Trống, Bánh răng..."
                className="form-control form-control-sm border-primary"
                value={partForm.category}
                onChange={(e) => setPartForm({ ...partForm, category: e.target.value })}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small fw-bold text-muted mb-1">ĐƠN VỊ TÍNH</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={partForm.unit}
                onChange={(e) => setPartForm({ ...partForm, unit: e.target.value })}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small fw-bold text-muted mb-1">NGƯỠNG CẢNH BÁO</label>
              <input
                type="number"
                min={0}
                className="form-control form-control-sm"
                value={partForm.minThreshold}
                onChange={(e) => setPartForm({ ...partForm, minThreshold: e.target.value })}
              />
            </div>
            <div className="col-md-8">
              <label className="form-label small fw-bold text-muted mb-1">
                DÒNG MÁY TƯƠNG THÍCH (CÁCH NHAU DẤU PHẨY)
              </label>
              <input
                type="text"
                placeholder="Ricoh MP 3055, Ricoh MP 4055, Canon iR 2625..."
                className="form-control form-control-sm"
                value={partForm.compatibleText}
                onChange={(e) => setPartForm({ ...partForm, compatibleText: e.target.value })}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">GIÁ BÁN LẺ (₫)</label>
              <input
                type="number"
                min={0}
                className="form-control form-control-sm"
                value={partForm.salePrice}
                onChange={(e) => setPartForm({ ...partForm, salePrice: e.target.value })}
              />
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal Nhập kho theo Lô FIFO */}
      <ModalShell
        show={showBatchModal}
        headerClass="bg-success text-white"
        title="Nhập kho Lô hàng mới (FIFO)"
        onClose={() => setShowBatchModal(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowBatchModal(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="batch-form"
              disabled={saving}
              className="btn btn-success btn-sm px-3 fw-bold"
            >
              {saving ? "Đang nhập..." : "Xác nhận nhập kho"}
            </button>
          </>
        }
      >
        <form id="batch-form" onSubmit={handleSaveBatch}>
          <div className="row g-2">
            <div className="col-12">
              <label className="form-label small fw-bold text-muted mb-1">
                CHỌN VẬT TƯ / LINH KIỆN <span className="text-danger">*</span>
              </label>
              <select
                required
                className="form-select form-select-sm"
                value={batchForm.partId}
                onChange={(e) => setBatchForm({ ...batchForm, partId: e.target.value })}
              >
                <option value="">-- Chọn linh kiện --</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partCode} – {p.name} (Tồn: {p.currentQuantity} {p.unit})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                MÃ LÔ HÀNG (BATCH CODE) <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                className="form-control form-control-sm font-monospace"
                value={batchForm.batchCode}
                onChange={(e) => setBatchForm({ ...batchForm, batchCode: e.target.value })}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                SỐ LƯỢNG NHẬP <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                required
                min={1}
                className="form-control form-control-sm"
                value={batchForm.quantity}
                onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                GIÁ VỐN NHẬP (₫ / ĐƠN VỊ) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                className="form-control form-control-sm"
                value={batchForm.costPrice}
                onChange={(e) => setBatchForm({ ...batchForm, costPrice: e.target.value })}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                TỌA ĐỘ TỦ / KỆ LƯU KHO <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="VD: Tủ A - Kệ 2"
                className="form-control form-control-sm"
                value={batchForm.location}
                onChange={(e) => setBatchForm({ ...batchForm, location: e.target.value })}
              />
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal Chi tiết các Lô FIFO của 1 linh kiện */}
      <ModalShell
        show={!!viewBatchesPart}
        size="lg"
        title={`Danh sách Lô tồn kho FIFO – ${viewBatchesPart?.partCode} (${viewBatchesPart?.name})`}
        onClose={() => setViewBatchesPart(null)}
        footer={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setViewBatchesPart(null)}
          >
            Đóng
          </button>
        }
      >
        {viewBatchesPart && (
          <div className="table-responsive">
            <table className="table table-sm table-bordered mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Thứ tự xuất FIFO</th>
                  <th>Mã lô (Batch)</th>
                  <th>Ngày nhập</th>
                  <th>Vị trí kệ</th>
                  <th className="text-end">Giá vốn</th>
                  <th className="text-end">SL còn lại</th>
                </tr>
              </thead>
              <tbody>
                {viewBatchesPart.batches.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-3 text-muted">
                      Chưa có lô hàng nào được nhập
                    </td>
                  </tr>
                ) : (
                  viewBatchesPart.batches.map((b, idx) => (
                    <tr key={b.id} className={b.quantity === 0 ? "text-muted bg-light" : ""}>
                      <td>
                        {b.quantity > 0 ? (
                          <span className="badge bg-info text-white">Ưu tiên #{idx + 1}</span>
                        ) : (
                          <span className="badge bg-secondary">Đã xuất hết</span>
                        )}
                      </td>
                      <td className="font-monospace fw-bold">{b.batchCode}</td>
                      <td>{new Date(b.receivedDate).toLocaleDateString("vi-VN")}</td>
                      <td>{b.location}</td>
                      <td className="text-end font-monospace">
                        {Number(b.costPrice).toLocaleString("vi-VN")} ₫
                      </td>
                      <td className="text-end fw-bold">{b.quantity}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
