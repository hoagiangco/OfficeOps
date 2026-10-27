"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import ModalShell from "@/components/ModalShell";
import { exportToCsv } from "@/lib/csv";
import { STOCK_MOVEMENT_TYPE_LABELS } from "@/lib/labels";
import PartCategoriesTab from "@/components/inventory/PartCategoriesTab";
import PartCompatibilityTab from "@/components/inventory/PartCompatibilityTab";
import PartCategoriesModal from "@/components/inventory/PartCategoriesModal";
import PartCompatibilityModal from "@/components/inventory/PartCompatibilityModal";

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
  categoryId?: string | null;
  partCategory?: { id: string; name: string; color?: string | null } | null;
  category: string | null;
  barcode?: string | null;
  unit: string;
  compatibleModels: string[];
  minThreshold: number;
  costPrice?: string | number | null;
  salePrice: string | number | null;
  specs?: Record<string, unknown> | null;
  notes?: string | null;
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

type InventoryTab = "parts" | "categories" | "compatibility" | "stock" | "movements";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<InventoryTab>("parts");

  // === TAB 1: DANH SÁCH VẬT TƯ & LINH KIỆN ===
  const [parts, setParts] = useState<PartItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [partCategories, setPartCategories] = useState<{ id: string; code?: string | null; name: string; color?: string | null }[]>([]);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [compatibilityModalPart, setCompatibilityModalPart] = useState<PartItem | null>(null);
  const [showPickerModal, setShowPickerModal] = useState(false);
  const [batchCategoryFilter, setBatchCategoryFilter] = useState("");
  const [allParts, setAllParts] = useState<PartItem[]>([]);

  // Modal Thêm / Sửa Vật tư
  const [showPartModal, setShowPartModal] = useState(false);
  const [editingPart, setEditingPart] = useState<PartItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [partForm, setPartForm] = useState({
    partCode: "",
    name: "",
    categoryId: "",
    category: "",
    barcode: "",
    unit: "cái",
    compatibleText: "",
    minThreshold: "5",
    costPrice: "",
    salePrice: "",
    notes: "",
  });
  const [quickModelInput, setQuickModelInput] = useState("");

  const compatibleList = useMemo<string[]>(() => {
    if (!partForm.compatibleText) return [];
    return partForm.compatibleText
      .split(",")
      .map((s: string) => s.trim())
      .filter(Boolean);
  }, [partForm.compatibleText]);

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

  // === TAB: SỔ CÁI BIẾN ĐỘNG KHO (THẺ KHO) ===
  const [movements, setMovements] = useState<MovementItem[]>([]);
  const [movementTotal, setMovementTotal] = useState(0);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementPage, setMovementPage] = useState(1);
  const [movementPageSize] = useState(25);
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [movementPartFilter, setMovementPartFilter] = useState("");
  const [movementFromDate, setMovementFromDate] = useState("");
  const [movementToDate, setMovementToDate] = useState("");
  const [movementSearch, setMovementSearch] = useState("");
  const [dataReloadCount, setDataReloadCount] = useState(0);
  const [movementReloadCount, setMovementReloadCount] = useState(0);
  const [movementSummary, setMovementSummary] = useState({
    totalIn: 0,
    totalOut: 0,
    totalReturn: 0,
    totalAdjust: 0,
  });

  const loadData = useCallback(() => {
    setLoading(true);
    setDataReloadCount((c) => c + 1);
  }, []);

  const loadMovements = useCallback(() => {
    setMovementLoading(true);
    setMovementReloadCount((c) => c + 1);
  }, []);

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/part-categories");
      if (res.ok) {
        const data = await res.json();
        setPartCategories(data.categories || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    let ignore = false;
    async function fetchData() {
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
        if (!ignore) {
          setParts(data.items || []);
          setTotal(data.total || 0);
        }
      } catch (e: unknown) {
        if (!ignore) toast.error(e instanceof Error ? e.message : "Lỗi tải kho");
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchData();
    return () => {
      ignore = true;
    };
  }, [page, pageSize, search, categoryFilter, dataReloadCount]);

  useEffect(() => {
    if (activeTab !== "movements") return;
    let ignore = false;
    async function fetchMovements() {
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
        if (!ignore) {
          setMovements(data.items || []);
          setMovementTotal(data.total || 0);
          setMovementSummary(
            data.summary || { totalIn: 0, totalOut: 0, totalReturn: 0, totalAdjust: 0 }
          );
        }
      } catch (e: unknown) {
        if (!ignore) toast.error(e instanceof Error ? e.message : "Lỗi tải sổ cái biến động");
      } finally {
        if (!ignore) setMovementLoading(false);
      }
    }
    fetchMovements();
    return () => {
      ignore = true;
    };
  }, [
    activeTab,
    movementPage,
    movementPageSize,
    movementSearch,
    movementTypeFilter,
    movementPartFilter,
    movementFromDate,
    movementToDate,
    movementReloadCount,
  ]);

  // Chuyển sang Tab Thẻ kho và tự lọc theo linh kiện
  const openPartMovement = (p: PartItem) => {
    setMovementPartFilter(p.id);
    setMovementSearch("");
    setMovementPage(1);
    setActiveTab("movements");
  };

  const openNewPart = (preselectedCategoryId?: string) => {
    setEditingPart(null);
    const targetCat = preselectedCategoryId
      ? partCategories.find((c) => c.id === preselectedCategoryId || c.name === preselectedCategoryId)
      : partCategories[0];

    setPartForm({
      partCode: `VT-${String(total + 1).padStart(4, "0")}`,
      name: "",
      categoryId: targetCat?.id || "",
      category: targetCat?.name || "",
      barcode: "",
      unit: "cái",
      compatibleText: "",
      minThreshold: "5",
      costPrice: "",
      salePrice: "",
      notes: "",
    });
    setQuickModelInput("");
    setShowPartModal(true);
  };

  const openEditPart = (p: PartItem) => {
    setEditingPart(p);
    setQuickModelInput("");
    setPartForm({
      partCode: p.partCode,
      name: p.name,
      categoryId: p.categoryId || (partCategories.find((c) => c.name === p.category)?.id || ""),
      category: p.partCategory?.name || p.category || "",
      barcode: p.barcode || "",
      unit: p.unit,
      compatibleText: (p.compatibleModels || []).join(", "),
      minThreshold: String(p.minThreshold),
      costPrice: p.costPrice !== undefined && p.costPrice !== null ? String(p.costPrice) : "",
      salePrice: p.salePrice !== undefined && p.salePrice !== null ? String(p.salePrice) : "",
      notes: p.notes || "",
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
        categoryId: partForm.categoryId || undefined,
        category: partForm.category || undefined,
        barcode: partForm.barcode?.trim() || undefined,
        unit: partForm.unit || "cái",
        compatibleModels,
        minThreshold: Number(partForm.minThreshold),
        costPrice: partForm.costPrice ? Number(partForm.costPrice) : undefined,
        salePrice: partForm.salePrice ? Number(partForm.salePrice) : undefined,
        notes: partForm.notes?.trim() || undefined,
      };

      const res = await fetch("/api/parts", {
        method: editingPart ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu vật tư");
        return;
      }
      toast.success(editingPart ? "Đã cập nhật vật tư" : "Đã thêm mã vật tư mới");
      setShowPartModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePart = async (p: PartItem) => {
    if (!confirm(`Bạn có chắc muốn xóa hoặc ngừng sử dụng vật tư "${p.name}" (${p.partCode})?`)) return;
    try {
      const res = await fetch(`/api/parts?id=${p.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Thao tác thất bại");
        return;
      }
      toast.success(data.message || "Đã xử lý vật tư thành công");
      loadData();
    } catch {
      toast.error("Lỗi khi xử lý");
    }
  };

  const openBatchIn = async (defaultPart?: PartItem) => {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const randSuffix = Math.random().toString(36).substring(2, 5).toUpperCase();

    let partsList = allParts;
    if (partsList.length === 0) {
      try {
        const res = await fetch("/api/parts?pageSize=500");
        if (res.ok) {
          const data = await res.json();
          partsList = data.items || [];
          setAllParts(partsList);
        }
      } catch {
        partsList = parts;
      }
    }

    const selectedPart = defaultPart || (partsList[0] ?? parts[0]);
    if (selectedPart?.categoryId) {
      setBatchCategoryFilter(selectedPart.categoryId);
    } else if (selectedPart?.category) {
      const matched = partCategories.find((c) => c.name === selectedPart.category);
      if (matched) setBatchCategoryFilter(matched.id);
    } else {
      setBatchCategoryFilter("");
    }

    setBatchForm({
      partId: selectedPart?.id || (partsList[0]?.id ?? parts[0]?.id ?? ""),
      batchCode: `LO-${ym}-${randSuffix}`,
      quantity: "10",
      costPrice: selectedPart?.costPrice ? String(selectedPart.costPrice) : "250000",
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

  const batchPartsList = allParts.length > 0 ? allParts : parts;
  const filteredBatchParts = batchCategoryFilter
    ? batchPartsList.filter(
        (p) =>
          p.categoryId === batchCategoryFilter ||
          p.partCategory?.id === batchCategoryFilter ||
          p.category === partCategories.find((c) => c.id === batchCategoryFilter)?.name
      )
    : batchPartsList;

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
            type="button"
            className="btn btn-outline-primary btn-sm px-3 fw-bold shadow-sm d-flex align-items-center gap-1.5"
            onClick={() => setShowCategoryModal(true)}
            title="Quản lý tùy chỉnh Danh mục & Phân nhóm vật tư linh kiện"
          >
            <i className="fas fa-folder-tree"></i>
            <span>Danh mục vật tư</span>
            {partCategories.length > 0 && (
              <span className="badge bg-primary text-white rounded-pill ms-1" style={{ fontSize: "11px" }}>
                {partCategories.length}
              </span>
            )}
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
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={() => openNewPart()}>
            <i className="fas fa-plus me-1"></i> Thêm linh kiện
          </button>
        </div>
      </div>

      {/* Tabs Chuyển đổi giữa các phân hệ Vật tư & Kho */}
      <div className="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-2">
        <div className="btn-group btn-group-sm shadow-sm">
          <button
            className={`btn px-3 fw-bold ${activeTab === "parts" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
            onClick={() => setActiveTab("parts")}
          >
            <i className="fas fa-boxes-stacked me-1.5"></i> Danh sách Vật tư
            {total > 0 && (
              <span className="badge bg-white text-dark ms-1.5 rounded-pill border">
                {total}
              </span>
            )}
          </button>
          <button
            className={`btn px-3 fw-bold ${activeTab === "categories" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
            onClick={() => setActiveTab("categories")}
          >
            <i className="fas fa-folder-tree me-1.5"></i> Danh mục Vật tư
            {partCategories.length > 0 && (
              <span className="badge bg-white text-dark ms-1.5 rounded-pill border">
                {partCategories.length}
              </span>
            )}
          </button>
          <button
            className={`btn px-3 fw-bold ${activeTab === "compatibility" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
            onClick={() => setActiveTab("compatibility")}
          >
            <i className="fas fa-microchip me-1.5"></i> Tra cứu tương thích
          </button>
          <button
            className={`btn px-3 fw-bold ${activeTab === "stock" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
            onClick={() => setActiveTab("stock")}
          >
            <i className="fas fa-warehouse me-1.5"></i> Lô tồn FIFO
          </button>
          <button
            className={`btn px-3 fw-bold ${activeTab === "movements" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
            onClick={() => {
              setActiveTab("movements");
              loadMovements();
            }}
          >
            <i className="fas fa-history me-1.5"></i> Sổ cái thẻ kho
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

      {/* ======================= TAB 1 & 4: DANH MỤC VẬT TƯ & LÔ FIFO ======================= */}
      {(activeTab === "parts" || activeTab === "stock") && (
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
                    {partCategories.length > 0
                      ? partCategories.map((c) => (
                          <option key={c.id} value={c.name}>
                            {c.name}
                          </option>
                        ))
                      : categories.map((cat) => (
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
                            <td className="px-3">
                              <span className="font-monospace fw-bold text-primary small">
                                {item.partCode}
                              </span>
                              {item.barcode && (
                                <div className="text-muted" style={{ fontSize: "10px" }}>
                                  <i className="fas fa-barcode me-1"></i>
                                  {item.barcode}
                                </div>
                              )}
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
                                  style={{ width: "28px", height: "28px", flexShrink: 0 }}
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
                                  <div className="d-flex flex-wrap gap-1 mt-1">
                                    {item.compatibleModels?.slice(0, 3).map((m) => (
                                      <span key={m} className="badge bg-light text-secondary border font-monospace" style={{ fontSize: "10px" }}>
                                        {m}
                                      </span>
                                    ))}
                                    {(item.compatibleModels?.length || 0) > 3 && (
                                      <span className="badge bg-light text-muted border" style={{ fontSize: "10px" }}>
                                        +{(item.compatibleModels?.length || 0) - 3} dòng máy
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span
                                className="small fw-semibold px-2 py-0.5 rounded border"
                                style={{
                                  backgroundColor: item.partCategory?.color ? `${item.partCategory.color}15` : "#f1f5f9",
                                  color: item.partCategory?.color || "#334155",
                                  borderColor: item.partCategory?.color ? `${item.partCategory.color}40` : "#cbd5e1",
                                }}
                              >
                                {item.partCategory?.name || item.category || "Chung"}
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
                                  className="btn btn-outline-warning btn-sm py-0 px-2"
                                  title="Gán thiết bị tương thích (Check / Uncheck)"
                                  onClick={() => setCompatibilityModalPart(item)}
                                >
                                  <i className="fas fa-microchip"></i>
                                </button>
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
                                <button
                                  className="btn btn-outline-danger btn-sm py-0 px-2"
                                  title="Xóa hoặc ngừng sử dụng"
                                  onClick={() => handleDeletePart(item)}
                                >
                                  <i className="fas fa-trash"></i>
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

      {/* ======================= TAB 2: DANH MỤC VẬT TƯ ======================= */}
      {activeTab === "categories" && (
        <PartCategoriesTab
          onChanged={loadCategories}
          onSelectCategory={(catName) => {
            setCategoryFilter(catName);
            setActiveTab("parts");
          }}
        />
      )}

      {/* ======================= TAB 3: TRA CỨU TƯƠNG THÍCH ======================= */}
      {activeTab === "compatibility" && <PartCompatibilityTab />}

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
        size="xl"
        dialogStyle={{ maxWidth: "940px" }}
        headerClass="bg-white border-bottom py-2.5 px-3 px-sm-4"
        bodyClass="p-3 px-sm-4 py-sm-3 bg-white"
        scrollable={false}
        title={
          <div className="d-flex align-items-center gap-2">
            <div
              className="rounded-3 bg-primary-subtle text-primary d-flex align-items-center justify-content-center flex-shrink-0"
              style={{ width: "34px", height: "34px" }}
            >
              <i className="fas fa-boxes-stacked fs-6"></i>
            </div>
            <div className="min-w-0">
              <div className="fw-bold text-dark fs-6 text-truncate lh-sm">
                {editingPart ? `Sửa vật tư: ${editingPart.partCode}` : "Thêm mã vật tư dự phòng mới"}
              </div>
              <div className="text-muted small fw-normal" style={{ fontSize: "11.5px" }}>
                {editingPart
                  ? `Cập nhật thông số kỹ thuật, danh mục và dòng máy tương thích cho ${editingPart.name}`
                  : "Khai báo thông số kỹ thuật, danh mục phân loại, giá tham chiếu và dòng máy tương thích"}
              </div>
            </div>
          </div>
        }
        onClose={() => setShowPartModal(false)}
        footer={
          <div className="d-flex align-items-center justify-content-between w-100 flex-wrap gap-2 py-0">
            <span className="small text-muted" style={{ fontSize: "11.5px" }}>
              <span className="text-danger fw-bold">*</span> Các trường bắt buộc nhập
            </span>
            <div className="d-flex align-items-center gap-2 ms-auto">
              <button
                type="button"
                className="btn btn-light border btn-sm px-3 text-secondary fw-medium"
                onClick={() => setShowPartModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                form="part-form"
                disabled={saving}
                className="btn btn-primary btn-sm px-3.5 fw-bold shadow-sm d-inline-flex align-items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <i className="fas fa-spinner fa-spin"></i>
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-save"></i>
                    <span>{editingPart ? "Cập nhật vật tư" : "Lưu vật tư"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        }
      >
        <form id="part-form" onSubmit={handleSavePart}>
          <div className="row g-3 align-items-stretch">
            {/* CỘT TRÁI: THÔNG TIN CƠ BẢN, ĐỊNH MỨC & GIÁ (Chiếm 7/12 cột để rộng rãi) */}
            <div className="col-12 col-lg-7 d-flex flex-column gap-2.5">
              {/* Hàng 1: Mã vật tư (col-5) & Mã vạch (col-7) */}
              <div className="row g-2">
                <div className="col-5">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Mã vật tư <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light text-muted px-2">
                      <i className="fas fa-hashtag"></i>
                    </span>
                    <input
                      type="text"
                      required
                      disabled={!!editingPart}
                      placeholder="VT-0013"
                      className="form-control font-monospace fw-bold text-primary"
                      value={partForm.partCode}
                      onChange={(e) => setPartForm({ ...partForm, partCode: e.target.value })}
                    />
                  </div>
                </div>
                <div className="col-7">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Mã vạch (Barcode)
                  </label>
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-light text-muted px-2">
                      <i className="fas fa-barcode"></i>
                    </span>
                    <input
                      type="text"
                      placeholder="VD: 893850020101"
                      className="form-control font-monospace"
                      value={partForm.barcode}
                      onChange={(e) => setPartForm({ ...partForm, barcode: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              {/* Hàng 2: Tên vật tư (Full width) */}
              <div>
                <label className="form-label small fw-semibold text-dark mb-1">
                  Tên vật tư / linh kiện <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Trống từ Ricoh MP 3055 / MP 3555..."
                  className="form-control form-control-sm"
                  value={partForm.name}
                  onChange={(e) => setPartForm({ ...partForm, name: e.target.value })}
                />
              </div>

              {/* Hàng 3: Danh mục (col-8) & Đơn vị tính (col-4) */}
              <div className="row g-2">
                <div className="col-8">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Danh mục vật tư <span className="text-danger">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <select
                      required
                      className="form-select"
                      value={partForm.categoryId}
                      onChange={(e) => {
                        const sel = partCategories.find((c) => c.id === e.target.value);
                        setPartForm({
                          ...partForm,
                          categoryId: e.target.value,
                          category: sel?.name || (e.target.value ? partForm.category : ""),
                        });
                      }}
                    >
                      <option value="">-- Chọn danh mục --</option>
                      {partCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.code ? `(${c.code})` : ""}
                        </option>
                      ))}
                      {partForm.category &&
                        !partCategories.some(
                          (c) => c.id === partForm.categoryId || c.name === partForm.category
                        ) && (
                          <option value={partForm.categoryId || "custom"}>
                            {partForm.category} (Hiện tại)
                          </option>
                        )}
                    </select>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setShowCategoryModal(true)}
                      title="Quản lý / thêm danh mục"
                    >
                      <i className="fas fa-cog"></i>
                    </button>
                  </div>
                </div>
                <div className="col-4">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Đơn vị tính
                  </label>
                  <input
                    type="text"
                    list="unit-presets-list"
                    className="form-control form-control-sm"
                    placeholder="cái, bộ..."
                    value={partForm.unit}
                    onChange={(e) => setPartForm({ ...partForm, unit: e.target.value })}
                  />
                  <datalist id="unit-presets-list">
                    <option value="cái" />
                    <option value="bộ" />
                    <option value="hộp" />
                    <option value="cuộn" />
                    <option value="thanh" />
                    <option value="lọ" />
                    <option value="cặp" />
                    <option value="bình" />
                    <option value="ống" />
                  </datalist>
                </div>
              </div>

              {/* Hàng 4: Giá vốn (col-4) & Giá bán (col-4) & Cảnh báo tồn (col-4) */}
              <div className="row g-2">
                <div className="col-4">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Giá vốn
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      min={0}
                      placeholder="450000"
                      className="form-control font-monospace text-end"
                      value={partForm.costPrice}
                      onChange={(e) => setPartForm({ ...partForm, costPrice: e.target.value })}
                    />
                    <span className="input-group-text px-1 text-muted" style={{ fontSize: "11px" }}>₫</span>
                  </div>
                </div>
                <div className="col-4">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Giá bán lẻ
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      min={0}
                      placeholder="650000"
                      className="form-control font-monospace fw-semibold text-primary text-end"
                      value={partForm.salePrice}
                      onChange={(e) => setPartForm({ ...partForm, salePrice: e.target.value })}
                    />
                    <span className="input-group-text px-1 text-muted" style={{ fontSize: "11px" }}>₫</span>
                  </div>
                </div>
                <div className="col-4">
                  <label className="form-label small fw-semibold text-dark mb-1">
                    Cảnh báo tồn
                  </label>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      min={0}
                      placeholder="5"
                      className="form-control font-monospace text-end"
                      value={partForm.minThreshold}
                      onChange={(e) => setPartForm({ ...partForm, minThreshold: e.target.value })}
                    />
                    <span className="input-group-text px-1 text-muted" style={{ fontSize: "10.5px" }}>{partForm.unit || "cái"}</span>
                  </div>
                </div>
              </div>

              {/* Hàng 5: Ghi chú */}
              <div>
                <label className="form-label small fw-semibold text-dark mb-1">
                  Ghi chú / Quy cách kỹ thuật
                </label>
                <input
                  type="text"
                  placeholder="Quy cách đóng gói, xuất xứ, tuổi thọ số bản in..."
                  className="form-control form-control-sm"
                  value={partForm.notes}
                  onChange={(e) => setPartForm({ ...partForm, notes: e.target.value })}
                />
              </div>
            </div>

            {/* CỘT PHẢI: DÒNG MÁY TƯƠNG THÍCH (Chiếm 5/12 cột, thẻ card tự co giãn hoàn hảo) */}
            <div className="col-12 col-lg-5 d-flex flex-column">
              <div className="p-2.5 bg-light rounded-3 border h-100 d-flex flex-column">
                {/* Header dòng máy */}
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <div className="small fw-bold text-dark d-flex align-items-center gap-1.5">
                    <i className="fas fa-print text-primary"></i>
                    <span>Dòng máy tương thích</span>
                    <span className="badge bg-primary text-white rounded-pill px-1.5 py-0.5" style={{ fontSize: "11px" }}>
                      {compatibleList.length}
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-sm px-2 py-0.5 fw-semibold shadow-xs d-inline-flex align-items-center gap-1"
                    style={{ fontSize: "11px" }}
                    onClick={() => setShowPickerModal(true)}
                    title="Mở ma trận checklist chọn máy"
                  >
                    <i className="fas fa-tasks"></i>
                    <span>Checklist</span>
                  </button>
                </div>

                {/* Danh sách các tag pills dòng máy */}
                <div
                  className="p-1.5 rounded-2 bg-white border flex-grow-1 mb-2 overflow-auto"
                  style={{ minHeight: "125px", maxHeight: "155px" }}
                >
                  {compatibleList.length > 0 ? (
                    <div className="d-flex flex-wrap gap-1 align-content-start">
                      {compatibleList.map((model: string) => (
                        <span
                          key={model}
                          className="badge bg-primary-subtle text-primary border border-primary-subtle d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill"
                          style={{ fontSize: "11px", fontWeight: 500 }}
                        >
                          <span>{model}</span>
                          <button
                            type="button"
                            className="btn-close btn-close-sm ms-0.5"
                            style={{ fontSize: "7px" }}
                            aria-label="Remove"
                            onClick={() => {
                              const next = compatibleList.filter((m: string) => m !== model);
                              setPartForm({ ...partForm, compatibleText: next.join(", ") });
                            }}
                            title={`Bỏ gán ${model}`}
                          />
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="h-100 d-flex flex-column align-items-center justify-content-center text-muted small py-2 text-center" style={{ fontSize: "11.5px" }}>
                      <i className="fas fa-print fa-2x mb-1 opacity-25"></i>
                      <span>Chưa gán dòng máy. Bấm <strong>Checklist</strong> hoặc gõ nhanh bên dưới.</span>
                    </div>
                  )}
                </div>

                {/* Input gõ thêm nhanh */}
                <div className="input-group input-group-sm mb-1.5">
                  <input
                    type="text"
                    placeholder="Gõ model rồi Enter (VD: Ricoh MP 5002...)"
                    className="form-control"
                    value={quickModelInput}
                    onChange={(e) => setQuickModelInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        const val = quickModelInput.trim();
                        if (val) {
                          if (!compatibleList.includes(val)) {
                            setPartForm({
                              ...partForm,
                              compatibleText: [...compatibleList, val].join(", "),
                            });
                          }
                          setQuickModelInput("");
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() => {
                      const val = quickModelInput.trim();
                      if (val) {
                        if (!compatibleList.includes(val)) {
                          setPartForm({
                            ...partForm,
                            compatibleText: [...compatibleList, val].join(", "),
                          });
                        }
                        setQuickModelInput("");
                      }
                    }}
                  >
                    + Thêm
                  </button>
                  {compatibleList.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline-danger"
                      onClick={() => setPartForm({ ...partForm, compatibleText: "" })}
                      title="Bỏ chọn tất cả"
                    >
                      Xóa
                    </button>
                  )}
                </div>

                {/* Gợi ý thêm nhanh */}
                <div className="d-flex flex-wrap gap-1 align-items-center">
                  <span className="text-muted" style={{ fontSize: "10px" }}>Gợi ý:</span>
                  {["Ricoh MP 5002", "Canon iR 2525", "Toshiba 3008A", "HP M404dn", "Ricoh IM 5000"].map((model) => {
                    const isAdded = compatibleList.includes(model);
                    return (
                      <button
                        key={model}
                        type="button"
                        disabled={isAdded}
                        className={`btn btn-sm py-0 px-1.5 rounded-pill ${
                          isAdded ? "btn-light text-muted border-0 opacity-40" : "btn-white border text-dark bg-white"
                        }`}
                        style={{ fontSize: "10.5px" }}
                        onClick={() => {
                          if (!isAdded) {
                            setPartForm({
                              ...partForm,
                              compatibleText: [...compatibleList, model].join(", "),
                            });
                          }
                        }}
                      >
                        {isAdded ? "✓ " : "+ "}{model}
                      </button>
                    );
                  })}
                </div>
              </div>
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
          {/* Lọc nhanh theo Danh mục & Khai báo linh kiện mới */}
          <div className="row g-2 mb-2 p-2 bg-light rounded border align-items-center">
            <div className="col-12 col-md-7">
              <label className="form-label small fw-bold text-dark mb-1">
                <i className="fas fa-filter text-primary me-1"></i>
                LỌC LINH KIỆN THEO DANH MỤC
              </label>
              <select
                className="form-select form-select-sm"
                value={batchCategoryFilter}
                onChange={(e) => {
                  const newCatId = e.target.value;
                  setBatchCategoryFilter(newCatId);
                  const available = (allParts.length > 0 ? allParts : parts).filter((p) =>
                    newCatId
                      ? p.categoryId === newCatId ||
                        p.partCategory?.id === newCatId ||
                        p.category === partCategories.find((c) => c.id === newCatId)?.name
                      : true
                  );
                  if (available.length > 0) {
                    setBatchForm((prev) => ({
                      ...prev,
                      partId: available[0].id,
                      costPrice: available[0].costPrice ? String(available[0].costPrice) : prev.costPrice,
                    }));
                  }
                }}
              >
                <option value="">-- Tất cả danh mục ({partCategories.length}) --</option>
                {partCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-5 d-flex align-items-end justify-content-md-end pt-1">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm w-100"
                onClick={() => {
                  setShowBatchModal(false);
                  openNewPart(batchCategoryFilter);
                }}
                title="Khai báo mã linh kiện mới nếu chưa có trong danh mục"
              >
                <i className="fas fa-plus me-1"></i> Khai báo linh kiện mới
              </button>
            </div>
          </div>

          <div className="row g-2">
            <div className="col-12">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small fw-bold text-muted mb-0">
                  CHỌN VẬT TƯ / LINH KIỆN <span className="text-danger">*</span>
                </label>
                <span className="small text-muted" style={{ fontSize: "11px" }}>
                  {filteredBatchParts.length} vật tư khả dụng
                </span>
              </div>
              <select
                required
                className="form-select form-select-sm"
                value={batchForm.partId}
                onChange={(e) => {
                  const found = (allParts.length > 0 ? allParts : parts).find((p) => p.id === e.target.value);
                  setBatchForm({
                    ...batchForm,
                    partId: e.target.value,
                    costPrice: found?.costPrice ? String(found.costPrice) : batchForm.costPrice,
                  });
                }}
              >
                <option value="">-- Chọn linh kiện --</option>
                {filteredBatchParts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.partCode} – {p.name} [{p.partCategory?.name || p.category || "Chưa phân loại"}] (Tồn: {p.currentQuantity} {p.unit})
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

      {/* Modal Quản lý Danh mục Vật tư & Linh kiện */}
      <PartCategoriesModal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        onChanged={() => {
          loadCategories();
          loadData();
        }}
        onCreated={(newCat) => {
          setPartForm((prev) => ({
            ...prev,
            categoryId: newCat.id,
            category: newCat.name,
          }));
        }}
      />

      {/* Modal Gán Dòng máy tương thích cho 1 vật tư (từ danh sách vật tư) */}
      {compatibilityModalPart && (
        <PartCompatibilityModal
          isOpen={!!compatibilityModalPart}
          onClose={() => setCompatibilityModalPart(null)}
          partId={compatibilityModalPart.id}
          partName={compatibilityModalPart.name}
          partCode={compatibilityModalPart.partCode}
          onSaved={() => {
            loadData();
          }}
        />
      )}

      {/* Modal Checklist Picker khi đang tạo / sửa vật tư */}
      {showPickerModal && (
        <PartCompatibilityModal
          isOpen={showPickerModal}
          onClose={() => setShowPickerModal(false)}
          isPickerOnly
          initialSelectedModels={
            partForm.compatibleText
              ? partForm.compatibleText
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : []
          }
          onApplyModels={(models) => {
            setPartForm((prev) => ({
              ...prev,
              compatibleText: models.join(", "),
            }));
          }}
        />
      )}
    </div>
  );
}
