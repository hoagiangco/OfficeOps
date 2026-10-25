"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import ModalShell from "@/components/ModalShell";
import { exportToCsv } from "@/lib/csv";
import { STOCK_MOVEMENT_TYPE_LABELS } from "@/lib/labels";

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

interface MovementItem {
  id: string;
  batchId: string;
  type: "IN" | "OUT" | "RETURN" | "ADJUST";
  quantity: number;
  refType: string | null;
  refId: string | null;
  createdAt: string;
  batch: {
    id: string;
    batchCode: string;
    location: string;
    costPrice: string | number;
    part: {
      id: string;
      partCode: string;
      name: string;
      unit: string;
      category: string | null;
    };
  };
}

export default function InventoryPage() {
  // Tabs: "stock" = Tồn kho & Lô FIFO; "movements" = Sổ cái biến động kho (Thẻ kho)
  const [activeTab, setActiveTab] = useState<"stock" | "movements">("stock");

  // === TAB 1: TỒN KHO & LÔ FIFO ===
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

  // === TAB 2: SỔ CÁI BIẾN ĐỘNG KHO (THẺ KHO) ===
  const [movements, setMovements] = useState<MovementItem[]>([]);
  const [movementTotal, setMovementTotal] = useState(0);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize, setMovementPageSize] = useState(25);
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [movementPartFilter, setMovementPartFilter] = useState("");
  const [movementFromDate, setMovementFromDate] = useState("");
  const [movementToDate, setMovementToDate] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [movementSummary, setMovementSummary] = useState({
    totalIn: 0,
    totalOut: 0,
    totalReturn: 0,
    totalAdjust: 0,
  });

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

  const loadMovements = useCallback(async () => {
    setMovementLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(movementPage),
        pageSize: String(movementPageSize),
      });
      if (movementSearch.trim()) sp.set("q", movementSearch.trim());
      if (movementTypeFilter) sp.set("type", movementTypeFilter);
      if (movementPartFilter) sp.set("partId", movementPartFilter);
      if (movementFromDate) sp.set("from", movementFromDate);
      if (movementToDate) sp.set("to", movementToDate);

      const res = await fetch(`/api/inventory/movements?${sp.toString()}`);
      if (!res.ok) throw new Error("Không tải được sổ cái biến động kho");
      const data = await res.json();
      setMovements(data.items || []);
      setMovementTotal(data.total || 0);
      setMovementSummary(
        data.summary || { totalIn: 0, totalOut: 0, totalReturn: 0, totalAdjust: 0 }
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải sổ cái biến động");
    } finally {
      setMovementLoading(false);
    }
  }, [
    movementPage,
    movementPageSize,
    movementSearch,
    movementTypeFilter,
    movementPartFilter,
    movementFromDate,
    movementToDate,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === "movements") {
      loadMovements();
    }
  }, [activeTab, loadMovements]);

  // Chuyển sang Tab Thẻ kho và tự lọc theo linh kiện
  const openPartMovement = (p: PartItem) => {
    setMovementPartFilter(p.id);
    setMovementSearch("");
    setMovementPage(1);
    setActiveTab("movements");
  };

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

  const openBatchIn = (defaultPart?: PartItem) => {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const randSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    setBatchForm({
      partId: defaultPart?.id || (parts[0]?.id ?? ""),
      batchCode: `LO-${ym}-${randSuffix}`,
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
      if (activeTab === "movements") loadMovements();
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
      {/* Header chuẩn spare-parts HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-primary text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-boxes fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">Kho linh kiện</h1>
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
        <div className="d-flex gap-1 flex-wrap">
          <button
            className="btn btn-outline-success btn-sm px-3 fw-bold"
            onClick={() => {
              if (activeTab === "stock") {
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
                );
              } else {
                exportToCsv(
                  "so-cai-the-kho.csv",
                  [
                    "Thời gian",
                    "Loại biến động",
                    "Mã LK",
                    "Tên vật tư",
                    "Đơn vị",
                    "Mã Lô",
                    "Vị trí kệ",
                    "Số lượng",
                    "Loại tham chiếu",
                    "Mã chứng từ",
                  ],
                  movements.map((m) => [
                    new Date(m.createdAt).toLocaleString("vi-VN"),
                    STOCK_MOVEMENT_TYPE_LABELS[m.type]?.label || m.type,
                    m.batch.part.partCode,
                    m.batch.part.name,
                    m.batch.part.unit,
                    m.batch.batchCode,
                    m.batch.location,
                    `${STOCK_MOVEMENT_TYPE_LABELS[m.type]?.sign || ""}${m.quantity}`,
                    m.refType || "",
                    m.refId || "",
                  ])
                );
              }
            }}
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
            <i className="fas fa-plus-circle me-1"></i> Nhập kho
          </button>
          <Link
            href="/stock-issues"
            className="btn btn-warning btn-sm px-3 fw-bold shadow-sm text-dark"
          >
            <i className="fas fa-minus-circle me-1"></i> Xuất kho
          </Link>
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={openNewPart}>
            <i className="fas fa-plus me-1"></i> Thêm linh kiện
          </button>
        </div>
      </div>

      {/* Tabs Chuyển đổi giữa Tồn kho & Sổ cái Thẻ kho */}
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="btn-group btn-group-sm shadow-sm">
          <button
            className={`btn px-3 fw-bold ${activeTab === "stock" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
            onClick={() => setActiveTab("stock")}
          >
            <i className="fas fa-layer-group me-1.5"></i> Tồn kho
          </button>
          <button
            className={`btn px-3 fw-bold ${activeTab === "movements" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
            onClick={() => {
              setActiveTab("movements");
              loadMovements();
            }}
          >
            <i className="fas fa-history me-1.5"></i> Sổ cái biến động kho (Thẻ kho)
            {movementTotal > 0 && (
              <span className="badge bg-white text-dark ms-1.5 rounded-pill border">
                {movementTotal}
              </span>
            )}
          </button>
        </div>

        {activeTab === "movements" && movementPartFilter && (
          <div className="d-flex align-items-center gap-2">
            <span className="small text-muted">
              Đang lọc theo mã:{" "}
              <strong className="text-primary font-monospace">
                {parts.find((p) => p.id === movementPartFilter)?.partCode || movementPartFilter}
              </strong>
            </span>
            <button
              className="btn btn-link btn-sm text-danger p-0"
              onClick={() => {
                setMovementPartFilter("");
                setMovementPage(1);
              }}
            >
              <i className="fas fa-times-circle"></i> Bỏ lọc
            </button>
          </div>
        )}
      </div>

      {/* ======================= TAB 1: DANH MỤC TỒN KHO & LÔ FIFO ======================= */}
      {activeTab === "stock" && (
        <>
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

          {/* Table chuẩn HoaGiang */}
          <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
            <div className="card-body p-0">
              <div className="table-responsive table-sticky-container">
                <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
                  <thead className="bg-dark text-white">
                    <tr>
                      <th className="px-3 py-2 text-uppercase small" style={{ width: "110px" }}>
                        Mã LK
                      </th>
                      <th className="py-2 text-uppercase small">
                        Tên vật tư &amp; Dòng máy tương thích
                      </th>
                      <th className="py-2 text-uppercase small">Danh mục</th>
                      <th className="py-2 text-uppercase small text-center">Số lô FIFO</th>
                      <th
                        className="py-2 text-uppercase small text-center"
                        style={{ width: "110px" }}
                      >
                        Tồn kho
                      </th>
                      <th
                        className="py-2 text-uppercase small text-center"
                        style={{ width: "110px" }}
                      >
                        Cảnh báo
                      </th>
                      <th
                        className="py-2 text-uppercase small text-end px-3"
                        style={{ width: "170px" }}
                      >
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
                                <div
                                  className="text-danger fw-bold"
                                  style={{ fontSize: "0.7rem" }}
                                >
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
                                  className="btn btn-outline-info btn-sm py-0 px-2"
                                  title="Xem Thẻ kho / Lịch sử biến động mã này"
                                  onClick={() => openPartMovement(item)}
                                >
                                  <i className="fas fa-history me-1"></i>Thẻ kho
                                </button>
                                <button
                                  className="btn btn-outline-success btn-sm py-0 px-2"
                                  title="Nhập thêm lô FIFO"
                                  onClick={() => openBatchIn(item)}
                                >
                                  <i className="fas fa-plus"></i>
                                </button>
                                <button
                                  className="btn btn-outline-secondary btn-sm py-0 px-2"
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
        </>
      )}

      {/* ======================= TAB 2: SỔ CÁI BIẾN ĐỘNG KHO (THẺ KHO) ======================= */}
      {activeTab === "movements" && (
        <>
          {/* 4 Thẻ tóm tắt tổng số nhập / xuất */}
          <div className="row g-2 mb-2">
            <div className="col-6 col-md-3">
              <div className="card shadow-sm border-0 border-start border-primary border-4 p-2 bg-white">
                <div className="small text-muted fw-bold">TỔNG LƯỢT BIẾN ĐỘNG</div>
                <div className="h5 mb-0 fw-bold text-primary font-monospace">{movementTotal}</div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card shadow-sm border-0 border-start border-success border-4 p-2 bg-white">
                <div className="small text-muted fw-bold">TỔNG NHẬP KHO (IN)</div>
                <div className="h5 mb-0 fw-bold text-success font-monospace">
                  +{movementSummary.totalIn}
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card shadow-sm border-0 border-start border-danger border-4 p-2 bg-white">
                <div className="small text-muted fw-bold">TỔNG XUẤT KHO (OUT)</div>
                <div className="h5 mb-0 fw-bold text-danger font-monospace">
                  -{movementSummary.totalOut}
                </div>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <div className="card shadow-sm border-0 border-start border-info border-4 p-2 bg-white">
                <div className="small text-muted fw-bold">HOÀN TRẢ / ĐIỀU CHỈNH</div>
                <div className="h5 mb-0 fw-bold text-info font-monospace">
                  +{movementSummary.totalReturn + movementSummary.totalAdjust}
                </div>
              </div>
            </div>
          </div>

          {/* Bộ lọc Sổ cái */}
          <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
            <div className="card-body p-2 bg-light bg-opacity-50">
              <div className="row g-2 align-items-center">
                <div className="col-md-3">
                  <div className="input-group input-group-sm border rounded-2 overflow-hidden bg-white">
                    <span className="input-group-text bg-white border-0 pe-1">
                      <i className="fas fa-search text-muted"></i>
                    </span>
                    <input
                      type="text"
                      className="form-control border-0 shadow-none"
                      placeholder="Tìm mã LK, tên, mã lô, số phiếu..."
                      value={movementSearch}
                      onChange={(e) => {
                        setMovementSearch(e.target.value);
                        setMovementPage(1);
                      }}
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <select
                    className="form-select form-select-sm"
                    value={movementTypeFilter}
                    onChange={(e) => {
                      setMovementTypeFilter(e.target.value);
                      setMovementPage(1);
                    }}
                  >
                    <option value="">-- Tất cả loại biến động --</option>
                    <option value="IN">Nhập kho (IN)</option>
                    <option value="OUT">Xuất kho kỹ thuật (OUT)</option>
                    <option value="RETURN">Hoàn trả linh kiện (RETURN)</option>
                    <option value="ADJUST">Điều chỉnh kiểm kê (ADJUST)</option>
                  </select>
                </div>
                <div className="col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={movementPartFilter}
                    onChange={(e) => {
                      setMovementPartFilter(e.target.value);
                      setMovementPage(1);
                    }}
                  >
                    <option value="">-- Tất cả linh kiện vật tư --</option>
                    {parts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.partCode} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-2">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white small px-1.5 text-muted">Từ</span>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={movementFromDate}
                      onChange={(e) => {
                        setMovementFromDate(e.target.value);
                        setMovementPage(1);
                      }}
                    />
                  </div>
                </div>
                <div className="col-md-2">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white small px-1.5 text-muted">Đến</span>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={movementToDate}
                      onChange={(e) => {
                        setMovementToDate(e.target.value);
                        setMovementPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bảng Sổ cái Thẻ kho */}
          <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
            <div className="card-body p-0">
              <div className="table-responsive table-sticky-container">
                <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
                  <thead className="bg-dark text-white">
                    <tr>
                      <th className="px-3 py-2 text-uppercase small" style={{ width: "160px" }}>
                        Thời gian
                      </th>
                      <th className="py-2 text-uppercase small" style={{ width: "160px" }}>
                        Loại biến động
                      </th>
                      <th className="py-2 text-uppercase small">Vật tư &amp; Linh kiện</th>
                      <th className="py-2 text-uppercase small">Mã Lô FIFO</th>
                      <th className="py-2 text-uppercase small">Vị trí kệ</th>
                      <th
                        className="py-2 text-uppercase small text-center"
                        style={{ width: "120px" }}
                      >
                        Số lượng
                      </th>
                      <th
                        className="py-2 text-uppercase small text-end px-3"
                        style={{ width: "160px" }}
                      >
                        Chứng từ tham chiếu
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {movementLoading ? (
                      <tr>
                        <td colSpan={7}>
                          <Loading />
                        </td>
                      </tr>
                    ) : movements.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-5 text-muted small">
                          Chưa có phát sinh biến động kho nào phù hợp với bộ lọc
                        </td>
                      </tr>
                    ) : (
                      movements.map((m) => {
                        const meta = STOCK_MOVEMENT_TYPE_LABELS[m.type] || {
                          label: m.type,
                          badgeClass: "bg-secondary",
                          sign: "",
                        };
                        const isIn = m.type === "IN" || m.type === "RETURN";
                        return (
                          <tr key={m.id}>
                            <td className="px-3 text-muted small">
                              <i className="far fa-clock me-1 opacity-75"></i>
                              {new Date(m.createdAt).toLocaleString("vi-VN", {
                                year: "numeric",
                                month: "2-digit",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td>
                              <span className={`badge ${meta.badgeClass} px-2 py-1`}>
                                {meta.label}
                              </span>
                            </td>
                            <td>
                              <div className="fw-bold text-dark small">
                                <span className="font-monospace text-primary me-1.5">
                                  {m.batch.part.partCode}
                                </span>
                                {m.batch.part.name}
                              </div>
                              <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                                {m.batch.part.category || "Linh kiện"}
                              </span>
                            </td>
                            <td className="font-monospace fw-bold small text-secondary">
                              {m.batch.batchCode}
                            </td>
                            <td className="small text-muted">{m.batch.location}</td>
                            <td className="text-center">
                              <span
                                className={`fw-bold font-monospace px-2 py-0.5 rounded ${
                                  isIn
                                    ? "text-success bg-success-subtle"
                                    : "text-danger bg-danger-subtle"
                                }`}
                              >
                                {meta.sign}
                                {m.quantity} {m.batch.part.unit}
                              </span>
                            </td>
                            <td className="px-3 text-end font-monospace small">
                              {m.refType === "StockIssue" ? (
                                <Link
                                  href="/stock-issues"
                                  className="text-primary text-decoration-none fw-bold"
                                  title="Xem phiếu xuất kho"
                                >
                                  <i className="fas fa-file-invoice me-1"></i>
                                  {m.refId || "Phiếu XK"}
                                </Link>
                              ) : m.refType === "InventoryBatch" ? (
                                <span className="text-muted">
                                  <i className="fas fa-box me-1"></i>Lô nhập #{m.refId}
                                </span>
                              ) : (
                                <span className="text-muted">{m.refId || "-"}</span>
                              )}
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
        </>
      )}

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
