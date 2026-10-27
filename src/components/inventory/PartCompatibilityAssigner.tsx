"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import SearchableSelect, { SelectOption } from "@/components/ui/SearchableSelect";

export interface EquipmentModelItem {
  model: string;
  brand: string;
  fullName: string;
  type: string;
  totalUnits: number;
  activeUnits: number;
  equipments: { id: string; code: string | null; serialNumber: string; customerName: string | null }[];
}

export interface BrandGroupItem {
  brand: string;
  models: EquipmentModelItem[];
  totalModels: number;
  totalMachines: number;
  totalActiveMachines: number;
}

export interface PartOption {
  id: string;
  partCode: string;
  name: string;
  unit: string;
  compatibleModels: string[];
  category?: string | null;
  partCategory?: { name: string; color?: string | null } | null;
  currentQuantity?: number;
}

// Nhận diện hãng dựa theo chuỗi tên model
export function detectBrand(modelName: string, customBrand?: string): string {
  if (customBrand && customBrand.trim() && customBrand !== "AUTO") return customBrand.trim();
  const lower = modelName.toLowerCase();
  if (lower.includes("ricoh") || lower.startsWith("mp ") || lower.startsWith("im ") || lower.startsWith("aficio") || lower.startsWith("sp ")) return "Ricoh";
  if (lower.includes("canon") || lower.startsWith("ir") || lower.startsWith("lbp") || lower.startsWith("imagerunner")) return "Canon";
  if (lower.includes("toshiba") || lower.startsWith("e-studio")) return "Toshiba";
  if (lower.includes("xerox") || lower.includes("fujifilm") || lower.startsWith("docu") || lower.startsWith("apeos")) return "Xerox / Fujifilm";
  if (lower.includes("hp ") || lower.startsWith("hp ") || lower.includes("laserjet") || lower.includes("pagewide")) return "HP";
  if (lower.includes("konica") || lower.includes("bizhub")) return "Konica Minolta";
  if (lower.includes("brother")) return "Brother";
  if (lower.includes("epson")) return "Epson";
  return "Dòng máy khác";
}

interface PartCompatibilityAssignerProps {
  initialPartId?: string;
  onSaved?: (partId: string, updatedModels: string[]) => void;
  // Dùng khi tích hợp vào Modal tạo/sửa vật tư (chưa lưu vào DB)
  isModalPicker?: boolean;
  selectedModelsValue?: string[];
  onApplyModels?: (models: string[]) => void;
  onCancel?: () => void;
}

export default function PartCompatibilityAssigner({
  initialPartId,
  onSaved,
  isModalPicker = false,
  selectedModelsValue,
  onApplyModels,
  onCancel,
}: PartCompatibilityAssignerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Danh mục linh kiện & linh kiện đang chọn
  const [allParts, setAllParts] = useState<PartOption[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string>(initialPartId || "");
  const [currentPart, setCurrentPart] = useState<PartOption | null>(null);

  // Dữ liệu catalogue dòng máy theo hãng
  const [brandsData, setBrandsData] = useState<BrandGroupItem[]>([]);
  const [allModelsList, setAllModelsList] = useState<EquipmentModelItem[]>([]);

  // State các model đã được tick chọn (Set<string>)
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [initialModelsSet, setInitialModelsSet] = useState<Set<string>>(new Set());

  // Model mới vừa được thêm trong phiên làm việc này
  const [newlyAddedModels, setNewlyAddedModels] = useState<Set<string>>(new Set());

  // Bộ lọc tìm kiếm & Tab Hãng
  const [searchTerm, setSearchTerm] = useState("");
  const [activeBrandTab, setActiveBrandTab] = useState<string>("ALL");
  const [newCustomModel, setNewCustomModel] = useState("");
  const [customBrandSelect, setCustomBrandSelect] = useState<string>("AUTO");
  const [showAddCustom, setShowAddCustom] = useState(false);

  // 1. Tải catalogue tất cả dòng máy và danh sách linh kiện
  const loadData = useCallback(async (targetPartId?: string) => {
    try {
      setLoading(true);
      const [catRes, partsRes] = await Promise.all([
        fetch("/api/parts/compatible?catalog=true" + (targetPartId ? `&partId=${targetPartId}` : "")),
        fetch("/api/parts?pageSize=200").catch(() => null),
      ]);

      let items: PartOption[] = [];

      if (catRes.ok) {
        const catData = await catRes.json();
        setBrandsData(catData.modelsByBrand || []);
        setAllModelsList(catData.allModels || []);

        if (catData.parts && Array.isArray(catData.parts) && catData.parts.length > 0) {
          items = catData.parts;
        }

        if (catData.part) {
          setCurrentPart(catData.part);
          const initialSet = new Set<string>(catData.part.compatibleModels || []);
          setSelectedModels(new Set(initialSet));
          setInitialModelsSet(new Set(initialSet));
        }
      }

      if (items.length === 0 && partsRes && partsRes.ok) {
        const partsData = await partsRes.json().catch(() => ({}));
        if (partsData?.items && Array.isArray(partsData.items)) {
          items = partsData.items;
        }
      }

      setAllParts(items);

      // Nếu chưa chọn part nào và không phải modal picker, chọn part đầu tiên
      if (!isModalPicker && items.length > 0) {
        const activePart = targetPartId
          ? items.find((p) => p.id === targetPartId) || items[0]
          : items[0];

        setSelectedPartId(activePart.id);
        setCurrentPart(activePart);
        const initialSet = new Set<string>(activePart.compatibleModels || []);
        setSelectedModels(new Set(initialSet));
        setInitialModelsSet(new Set(initialSet));
      }
    } catch {
      toast.error("Không thể tải catalogue dòng máy");
    } finally {
      setLoading(false);
    }
  }, [isModalPicker]);

  useEffect(() => {
    loadData(initialPartId);
  }, [initialPartId, loadData]);

  // Nếu là modal picker từ ngoài truyền vào selectedModelsValue
  useEffect(() => {
    if (isModalPicker && selectedModelsValue) {
      const s = new Set<string>(selectedModelsValue);
      setSelectedModels(s);
      setInitialModelsSet(new Set(s));
    }
  }, [isModalPicker, selectedModelsValue]);

  // Khi người dùng đổi chọn vật tư khác từ dropdown
  const handleSelectPart = (partId: string) => {
    setSelectedPartId(partId);
    const found = allParts.find((p) => p.id === partId);
    if (found) {
      setCurrentPart(found);
      const s = new Set<string>(found.compatibleModels || []);
      setSelectedModels(new Set(s));
      setInitialModelsSet(new Set(s));
    }
  };

  // Toggle 1 model
  const toggleModel = (modelName: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelName)) {
        next.delete(modelName);
      } else {
        next.add(modelName);
      }
      return next;
    });
  };

  // Toggle cả một hãng
  const toggleBrand = (brandName: string, selectAll: boolean) => {
    const brandItem = brandsData.find((b) => b.brand === brandName);
    if (!brandItem) return;

    setSelectedModels((prev) => {
      const next = new Set(prev);
      brandItem.models.forEach((m) => {
        if (selectAll) {
          next.add(m.model);
        } else {
          next.delete(m.model);
        }
      });
      return next;
    });
  };

  // Thao tác gỡ 1 model đang chọn từ danh sách chip tag
  const handleRemoveModel = (modelName: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      next.delete(modelName);
      return next;
    });
  };

  // Thêm model tùy biến mới chưa có trong catalogue
  const handleAddCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    const val = newCustomModel.trim();
    if (!val) return;

    // Kiểm tra xem model đã tồn tại trong allModelsList chưa
    const existing = allModelsList.find(
      (m) => m.model.toLowerCase() === val.toLowerCase()
    );

    if (existing) {
      // Đã có sẵn trong catalogue -> chỉ cần tick chọn
      setSelectedModels((prev) => new Set(prev).add(existing.model));
      setActiveBrandTab(existing.brand);
      setSearchTerm("");
      setNewCustomModel("");
      setShowAddCustom(false);
      toast.info(`Dòng máy "${existing.model}" đã có sẵn trong danh mục hãng ${existing.brand} và đã được đánh dấu tương thích!`);
      return;
    }

    // Nếu là dòng máy mới hoàn toàn:
    const detectedBrand = detectBrand(
      val,
      customBrandSelect !== "AUTO" ? customBrandSelect : undefined
    );
    const fullName = val.toLowerCase().includes(detectedBrand.toLowerCase())
      ? val
      : `${detectedBrand} ${val}`;

    const newModelItem: EquipmentModelItem = {
      model: val,
      brand: detectedBrand,
      fullName,
      type: "Dòng máy tương thích",
      totalUnits: 0,
      activeUnits: 0,
      equipments: [],
    };

    // 1. Thêm vào allModelsList
    setAllModelsList((prev) => [newModelItem, ...prev]);

    // 2. Thêm vào brandsData
    setBrandsData((prev) => {
      const brandIndex = prev.findIndex(
        (b) => b.brand.toLowerCase() === detectedBrand.toLowerCase()
      );
      if (brandIndex >= 0) {
        const updated = [...prev];
        const currentBrand = updated[brandIndex];
        const newModels = [newModelItem, ...currentBrand.models].sort((a, b) =>
          a.model.localeCompare(b.model)
        );
        updated[brandIndex] = {
          ...currentBrand,
          models: newModels,
          totalModels: newModels.length,
        };
        return updated;
      } else {
        // Tạo hãng mới nếu chưa có trong danh mục
        const newBrandGroup: BrandGroupItem = {
          brand: detectedBrand,
          models: [newModelItem],
          totalModels: 1,
          totalMachines: 0,
          totalActiveMachines: 0,
        };
        return [...prev, newBrandGroup];
      }
    });

    // 3. Đánh dấu tick chọn & ghi nhận là model mới
    setSelectedModels((prev) => new Set(prev).add(val));
    setNewlyAddedModels((prev) => new Set(prev).add(val));

    // 4. Chuyển tab sang Hãng này để người dùng thấy ngay chiếc thẻ vừa thêm
    setActiveBrandTab(detectedBrand);
    setSearchTerm("");
    setNewCustomModel("");
    setShowAddCustom(false);

    toast.success(
      `Đã thêm dòng máy "${val}" vào danh mục hãng ${detectedBrand} và đánh dấu tương thích!`
    );
  };

  // Danh sách options có tìm kiếm cho SearchableSelect
  const partSelectOptions = useMemo<SelectOption[]>(() => {
    return allParts.map((p) => ({
      value: p.id,
      label: `[${p.partCode}] ${p.name}`,
      sublabel: `${p.partCategory?.name || p.category || "Vật tư"}${
        p.compatibleModels?.length ? ` • Đã gán ${p.compatibleModels.length} dòng máy` : ""
      }`,
      badge: p.currentQuantity !== undefined ? `Còn ${p.currentQuantity} ${p.unit}` : undefined,
    }));
  }, [allParts]);

  // Bộ lọc tìm kiếm
  const filteredBrands = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return brandsData
      .filter((b) => (activeBrandTab === "ALL" ? true : b.brand === activeBrandTab))
      .map((b) => {
        const filteredModels = b.models.filter((m) => {
          if (!term) return true;
          return (
            m.model.toLowerCase().includes(term) ||
            m.fullName.toLowerCase().includes(term) ||
            m.brand.toLowerCase().includes(term)
          );
        });

        return {
          ...b,
          models: filteredModels,
        };
      })
      .filter((b) => b.models.length > 0);
  }, [brandsData, searchTerm, activeBrandTab]);

  // Thống kê tổng quan
  const visibleModelsCount = useMemo(() => {
    return filteredBrands.reduce((sum, b) => sum + b.models.length, 0);
  }, [filteredBrands]);

  const selectedCount = selectedModels.size;

  const totalMatchingMachines = useMemo(() => {
    let count = 0;
    allModelsList.forEach((m) => {
      if (selectedModels.has(m.model)) {
        count += m.totalUnits;
      }
    });
    return count;
  }, [allModelsList, selectedModels]);

  const hasChanges = useMemo(() => {
    if (selectedModels.size !== initialModelsSet.size) return true;
    for (const item of selectedModels) {
      if (!initialModelsSet.has(item)) return true;
    }
    return false;
  }, [selectedModels, initialModelsSet]);

  // Bulk actions cho toàn bộ đang hiển thị
  const selectAllVisible = () => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      filteredBrands.forEach((b) => {
        b.models.forEach((m) => next.add(m.model));
      });
      return next;
    });
  };

  const unselectAllVisible = () => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      filteredBrands.forEach((b) => {
        b.models.forEach((m) => next.delete(m.model));
      });
      return next;
    });
  };

  const invertSelection = () => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      filteredBrands.forEach((b) => {
        b.models.forEach((m) => {
          if (next.has(m.model)) next.delete(m.model);
          else next.add(m.model);
        });
      });
      return next;
    });
  };

  const handleReset = () => {
    setSelectedModels(new Set(initialModelsSet));
  };

  // Lưu tương thích
  const handleSave = async () => {
    const modelsArray = Array.from(selectedModels);

    // Nếu là modal picker, chỉ cần bắn event lên cha
    if (isModalPicker) {
      if (onApplyModels) onApplyModels(modelsArray);
      return;
    }

    if (!selectedPartId) {
      toast.warning("Vui lòng chọn vật tư cần gán tương thích");
      return;
    }

    try {
      setSaving(true);
      const res = await fetch("/api/parts/compatible", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId: selectedPartId,
          compatibleModels: modelsArray,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu tương thích");
        return;
      }

      toast.success(
        data.message || `Đã cập nhật tương thích cho ${modelsArray.length} dòng máy thành công!`
      );
      setInitialModelsSet(new Set(modelsArray));

      // Cập nhật lại trong allParts local
      setAllParts((prev) =>
        prev.map((p) => (p.id === selectedPartId ? { ...p, compatibleModels: modelsArray } : p))
      );

      if (onSaved) onSaved(selectedPartId, modelsArray);
    } catch {
      toast.error("Lỗi kết nối khi lưu tương thích");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      {/* 1. KHUNG CHỌN VẬT TƯ (Nếu không phải modal picker) */}
      {!isModalPicker && (
        <div className="card shadow-sm border-0 rounded-3">
          <div className="card-body p-3">
            <div className="row g-2 align-items-center">
              <div className="col-12 col-md-5">
                <label className="form-label small fw-bold text-dark mb-1">
                  <i className="fas fa-boxes text-primary me-1.5"></i>
                  CHỌN VẬT TƯ / LINH KIỆN CẦN GÁN TƯƠNG THÍCH ({allParts.length})
                </label>
                <SearchableSelect
                  value={selectedPartId}
                  onChange={handleSelectPart}
                  options={partSelectOptions}
                  placeholder={
                    loading
                      ? "-- Đang nạp danh sách vật tư... --"
                      : "-- Chọn linh kiện cần gán tương thích --"
                  }
                  searchPlaceholder="Tìm kiếm mã, tên linh kiện, danh mục..."
                  prefixIcon="fas fa-boxes"
                  maxHeight={320}
                />
              </div>

              {currentPart && (
                <div className="col-12 col-md-7">
                  <div className="p-2.5 rounded-3 bg-light border d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <div>
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-primary px-2 py-0.5 font-monospace">
                          {currentPart.partCode}
                        </span>
                        <strong className="text-dark small">{currentPart.name}</strong>
                      </div>
                      <div className="small text-muted mt-0.5" style={{ fontSize: "11px" }}>
                        Danh mục:{" "}
                        <span className="fw-semibold">
                          {currentPart.partCategory?.name || currentPart.category || "Vật tư"}
                        </span>{" "}
                        | Đã gán:{" "}
                        <span className="text-primary fw-bold">{selectedCount} dòng máy</span>
                      </div>
                    </div>

                    <div className="text-end">
                      <div className="badge bg-success-subtle text-success border px-2 py-1">
                        <i className="fas fa-print me-1"></i>
                        {totalMatchingMachines} máy ngoài thị trường
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. THANH CÔNG CỤ TÌM KIẾM & BỘ LỌC HÃNG */}
      <div className="card shadow-sm border-0 rounded-3">
        <div className="card-body p-3">
          {/* Hàng 1: Tìm kiếm & Thao tác chọn nhanh */}
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2.5">
            <div className="d-flex align-items-center gap-2 flex-grow-1" style={{ maxWidth: "450px" }}>
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-white border-end-0 text-muted">
                  <i className="fas fa-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-start-0"
                  placeholder="Lọc nhanh model máy (VD: 5054, MP 3055, iR 2525...)"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    className="btn btn-outline-secondary border-start-0 bg-white"
                    type="button"
                    onClick={() => setSearchTerm("")}
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            </div>

            {/* Cụm nút Chọn / Bỏ chọn nhanh */}
            <div className="d-flex align-items-center gap-1.5 flex-wrap">
              <button
                type="button"
                className="btn btn-outline-primary btn-sm px-2.5 py-1"
                onClick={selectAllVisible}
                title="Đánh dấu tất cả dòng máy đang hiển thị"
              >
                <i className="fas fa-check-double me-1"></i> Chọn tất cả ({visibleModelsCount})
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm px-2.5 py-1"
                onClick={unselectAllVisible}
                title="Bỏ chọn tất cả dòng máy đang hiển thị"
              >
                <i className="fas fa-square me-1"></i> Bỏ chọn
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm px-2.5 py-1"
                onClick={invertSelection}
                title="Đảo trạng thái chọn của các dòng máy đang hiển thị"
              >
                <i className="fas fa-retweet me-1"></i> Đảo chọn
              </button>
              <button
                type="button"
                className="btn btn-light border btn-sm px-2.5 py-1 text-primary fw-semibold"
                onClick={() => setShowAddCustom(!showAddCustom)}
                title="Nhập thêm một model mới nếu chưa có trong danh mục"
              >
                <i className="fas fa-plus-circle me-1"></i> Thêm model khác
              </button>
            </div>
          </div>

          {/* Form thêm nhanh model tùy biến */}
          {showAddCustom && (
            <div className="p-3 bg-light rounded-3 border mb-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <strong className="text-dark small d-flex align-items-center gap-1.5">
                  <i className="fas fa-plus-circle text-primary"></i>
                  Thêm dòng máy mới vào danh mục tương thích
                </strong>
                <button
                  type="button"
                  className="btn-close btn-close-sm"
                  aria-label="Close"
                  onClick={() => setShowAddCustom(false)}
                />
              </div>

              <div className="alert alert-info py-2 px-3 small mb-2.5 border-0 bg-info-subtle text-info-emphasis d-flex align-items-start gap-2">
                <i className="fas fa-info-circle mt-0.5 flex-shrink-0 text-info"></i>
                <div>
                  <strong>Quy tắc quản lý danh mục:</strong> &quot;Dòng máy&quot; (Model) là chủng loại thiết bị kỹ thuật (VD: Ricoh MP 5055SP, Canon iR 2645i). Sau khi thêm và bấm <em>Lưu</em>, model sẽ được ghi nhận vào hệ thống tương thích và hiển thị ngay trên bảng. Dòng máy này <strong>chưa tự sinh máy vật lý</strong> (vì máy thực tế cần có số Serial Number cụ thể khi nhập kho bên Quản lý Thiết bị), nhưng khi tạo máy mới bên Quản lý Thiết bị với model này, hệ thống sẽ tự động bắt cặp ngay lập tức!
                </div>
              </div>

              <form onSubmit={handleAddCustomModel} className="row g-2 align-items-center">
                <div className="col-12 col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={customBrandSelect}
                    onChange={(e) => setCustomBrandSelect(e.target.value)}
                  >
                    <option value="AUTO">-- Tự động nhận diện hãng --</option>
                    <option value="Ricoh">Ricoh</option>
                    <option value="Canon">Canon</option>
                    <option value="Toshiba">Toshiba</option>
                    <option value="Xerox / Fujifilm">Xerox / Fujifilm</option>
                    <option value="HP">HP</option>
                    <option value="Konica Minolta">Konica Minolta</option>
                    <option value="Brother">Brother</option>
                    <option value="Epson">Epson</option>
                    <option value="Dòng máy khác">Dòng máy khác</option>
                  </select>
                </div>
                <div className="col-12 col-md-6">
                  <input
                    type="text"
                    required
                    className="form-control form-control-sm"
                    placeholder="Nhập tên dòng máy mới (VD: Ricoh MP 7503SP, Canon iR 2645i...)"
                    value={newCustomModel}
                    onChange={(e) => setNewCustomModel(e.target.value)}
                  />
                </div>
                <div className="col-12 col-md-3 d-flex align-items-center gap-1.5">
                  <button type="submit" className="btn btn-primary btn-sm px-3 fw-semibold flex-grow-1">
                    <i className="fas fa-check me-1"></i> Thêm &amp; Đánh dấu
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm px-2.5"
                    onClick={() => setShowAddCustom(false)}
                  >
                    Đóng
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Hàng 2: Tab các Hãng sản xuất */}
          <div className="d-flex align-items-center gap-1.5 flex-wrap pt-2 border-top">
            <span className="small text-muted fw-bold me-1" style={{ fontSize: "11px" }}>
              HÃNG:
            </span>
            <button
              type="button"
              className={`btn btn-sm py-0.5 px-2.5 rounded-pill ${
                activeBrandTab === "ALL" ? "btn-primary shadow-sm" : "btn-light border text-muted"
              }`}
              style={{ fontSize: "12px" }}
              onClick={() => setActiveBrandTab("ALL")}
            >
              Tất cả ({allModelsList.length})
            </button>
            {brandsData.map((b) => {
              const checkedInBrand = b.models.filter((m) => selectedModels.has(m.model)).length;
              return (
                <button
                  key={b.brand}
                  type="button"
                  className={`btn btn-sm py-0.5 px-2.5 rounded-pill d-flex align-items-center gap-1 ${
                    activeBrandTab === b.brand ? "btn-primary shadow-sm" : "btn-light border text-dark"
                  }`}
                  style={{ fontSize: "12px" }}
                  onClick={() => setActiveBrandTab(b.brand)}
                >
                  <span>{b.brand}</span>
                  <span
                    className={`badge rounded-pill ${
                      checkedInBrand > 0
                        ? activeBrandTab === b.brand
                          ? "bg-white text-primary"
                          : "bg-primary text-white"
                        : "bg-secondary-subtle text-muted"
                    }`}
                    style={{ fontSize: "10px" }}
                  >
                    {checkedInBrand}/{b.models.length}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Hàng 3: Danh sách các dòng máy đang được gán tương thích (Pill Tags List) */}
          <div className="mt-3 pt-2.5 border-top">
            <div className="d-flex align-items-center justify-content-between gap-2 mb-1.5">
              <div className="d-flex align-items-center gap-1.5 small fw-bold text-dark">
                <i className="fas fa-check-circle text-primary"></i>
                <span>CÁC DÒNG MÁY ĐANG ĐƯỢC CHỌN TƯƠNG THÍCH ({selectedCount}):</span>
              </div>
              {selectedCount > 0 && (
                <button
                  type="button"
                  className="btn btn-link btn-sm text-danger p-0 text-decoration-none"
                  style={{ fontSize: "11px" }}
                  onClick={() => setSelectedModels(new Set())}
                  title="Bỏ chọn tất cả các dòng máy"
                >
                  <i className="fas fa-trash-alt me-1"></i> Bỏ chọn tất cả
                </button>
              )}
            </div>

            {selectedCount === 0 ? (
              <div className="small text-muted py-1 fst-italic" style={{ fontSize: "12px" }}>
                Chưa có dòng máy nào được chọn. Hãy tick chọn từ bảng dưới đây hoặc bấm &quot;Chọn tất cả&quot;.
              </div>
            ) : (
              <div
                className="d-flex flex-wrap gap-1.5 p-2 rounded-2 bg-light border"
                style={{ maxHeight: "110px", overflowY: "auto" }}
              >
                {Array.from(selectedModels).map((modelName) => {
                  const isNew = newlyAddedModels.has(modelName);
                  return (
                    <span
                      key={modelName}
                      className={`badge d-inline-flex align-items-center gap-1 px-2 py-1 rounded-pill ${
                        isNew
                          ? "bg-warning-subtle text-warning-emphasis border border-warning"
                          : "bg-primary-subtle text-primary border border-primary-subtle"
                      }`}
                      style={{ fontSize: "11.5px", fontWeight: 500 }}
                    >
                      {isNew && (
                        <i className="fas fa-sparkles text-warning me-0.5" title="Dòng máy vừa mới thêm"></i>
                      )}
                      <span>{modelName}</span>
                      <button
                        type="button"
                        className="btn-close btn-close-sm ms-0.5"
                        style={{ fontSize: "8px", opacity: 0.7 }}
                        aria-label="Remove"
                        onClick={() => handleRemoveModel(modelName)}
                        title={`Bỏ chọn ${modelName}`}
                      />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. MA TRẬN DÒNG MÁY THEO HÃNG DẠNG CHECK / UNCHECK */}
      {loading ? (
        <div className="card shadow-sm border-0 rounded-3 p-5 text-center text-muted">
          <Loading />
          <div className="mt-2 small">Đang nạp ma trận dòng máy...</div>
        </div>
      ) : filteredBrands.length === 0 ? (
        <div className="card shadow-sm border-0 rounded-3 p-5 text-center text-muted">
          <i className="fas fa-search fa-2x mb-2 opacity-50"></i>
          <div>Không tìm thấy dòng máy nào khớp với từ khóa "{searchTerm}".</div>
          <button
            type="button"
            className="btn btn-outline-primary btn-sm mt-2"
            onClick={() => setSearchTerm("")}
          >
            Xóa tìm kiếm
          </button>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3">
          {filteredBrands.map((b) => {
            const checkedCount = b.models.filter((m) => selectedModels.has(m.model)).length;
            const isAllChecked = b.models.length > 0 && checkedCount === b.models.length;

            return (
              <div key={b.brand} className="card shadow-sm border-0 rounded-3 overflow-hidden">
                {/* Header từng Hãng */}
                <div className="card-header bg-white py-2.5 px-3 border-bottom d-flex flex-wrap align-items-center justify-content-between gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <span
                      className="rounded-circle d-inline-block bg-primary"
                      style={{ width: "8px", height: "8px" }}
                    />
                    <strong className="text-dark fs-6">{b.brand}</strong>
                    <span className="badge bg-light text-muted border small">
                      {b.models.length} dòng máy | {b.totalMachines} máy ngoài thị trường
                    </span>
                    <span
                      className={`badge rounded-pill ${
                        checkedCount > 0 ? "bg-primary-subtle text-primary border" : "bg-light text-muted"
                      } px-2 py-0.5`}
                      style={{ fontSize: "11px" }}
                    >
                      Đã chọn: {checkedCount}/{b.models.length}
                    </span>
                  </div>

                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className="btn btn-light border py-0.5 px-2"
                      style={{ fontSize: "11px" }}
                      onClick={() => toggleBrand(b.brand, !isAllChecked)}
                    >
                      {isAllChecked ? (
                        <>
                          <i className="fas fa-times me-1 text-danger"></i> Bỏ chọn cả hãng
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check-square me-1 text-primary"></i> Chọn cả hãng
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Grid các dòng máy dạng Checkbox Cards */}
                <div className="card-body p-3 bg-light-subtle">
                  <div className="row g-2">
                    {b.models.map((m) => {
                      const isChecked = selectedModels.has(m.model);

                      return (
                        <div key={m.model} className="col-12 col-sm-6 col-md-4 col-xl-3">
                          <div
                            className={`p-2.5 rounded-3 border transition-all h-100 d-flex align-items-start gap-2.5 ${
                              isChecked
                                ? "bg-primary-subtle border-primary shadow-sm"
                                : "bg-white border-light-subtle hover-shadow"
                            }`}
                            style={{
                              cursor: "pointer",
                              transition: "all 0.15s ease-in-out",
                              userSelect: "none",
                            }}
                            onClick={() => toggleModel(m.model)}
                          >
                            <input
                              type="checkbox"
                              className="form-check-input mt-1 flex-shrink-0"
                              checked={isChecked}
                              onChange={() => {}} // Đã xử lý ở onClick của thẻ cha
                              style={{ cursor: "pointer", width: "18px", height: "18px" }}
                            />

                            <div className="flex-grow-1 min-w-0">
                              <div className="d-flex align-items-center justify-content-between gap-1">
                                <strong
                                  className={`text-truncate small ${
                                    isChecked ? "text-primary fw-bold" : "text-dark"
                                  }`}
                                  title={m.fullName}
                                >
                                  {m.model}
                                </strong>

                                {newlyAddedModels.has(m.model) ? (
                                  <span
                                    className="badge bg-warning-subtle text-warning-emphasis border border-warning px-1.5 py-0.5 flex-shrink-0"
                                    style={{ fontSize: "10px" }}
                                    title="Dòng máy mới vừa thêm vào danh mục"
                                  >
                                    ✨ Mới thêm
                                  </span>
                                ) : m.totalUnits > 0 ? (
                                  <span
                                    className="badge bg-success-subtle text-success border px-1.5 py-0.5 flex-shrink-0"
                                    style={{ fontSize: "10px" }}
                                    title={`${m.totalUnits} máy thực tế trong hệ thống (${m.activeUnits} đang hoạt động)`}
                                  >
                                    <i className="fas fa-print me-1"></i>
                                    {m.totalUnits} máy
                                  </span>
                                ) : (
                                  <span
                                    className="badge bg-light text-muted border px-1.5 py-0.5 flex-shrink-0"
                                    style={{ fontSize: "10px" }}
                                    title="Chưa có máy vật lý nào trong kho. Khi tạo máy mới bên Quản lý Thiết bị, hệ thống sẽ tự nhận diện tương thích."
                                  >
                                    0 máy kho
                                  </span>
                                )}
                              </div>

                              <div
                                className="text-muted small text-truncate mt-0.5"
                                style={{ fontSize: "11px" }}
                              >
                                {m.fullName}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. THANH ĐIỀU KHIỂN & LƯU TƯƠNG THÍCH (Sticky Bottom Bar) */}
      <div
        className="card shadow-lg border rounded-3 p-3 bg-white sticky-bottom"
        style={{ zIndex: 100, bottom: "10px" }}
      >
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-3">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="d-flex align-items-center gap-1.5">
              <span className="small text-muted fw-bold">KẾT QUẢ GÁN:</span>
              <span className="badge bg-primary fs-6 px-2.5 py-1">
                {selectedCount} dòng máy
              </span>
            </div>

            <div className="vr mx-1 d-none d-sm-block" style={{ height: "20px" }}></div>

            <span className="small text-success fw-bold">
              <i className="fas fa-check-circle me-1"></i>
              Đáp ứng cho {totalMatchingMachines} thiết bị của khách hàng
            </span>

            {hasChanges && (
              <span className="badge bg-warning text-dark px-2 py-1">
                <i className="fas fa-exclamation-circle me-1"></i> Có thay đổi chưa lưu
              </span>
            )}
          </div>

          <div className="d-flex align-items-center gap-2">
            {isModalPicker && onCancel && (
              <button
                type="button"
                className="btn btn-sm btn-light border px-3"
                onClick={onCancel}
              >
                Hủy
              </button>
            )}

            {hasChanges && !isModalPicker && (
              <button
                type="button"
                className="btn btn-sm btn-light border text-muted px-3"
                onClick={handleReset}
                disabled={saving}
              >
                <i className="fas fa-undo me-1"></i> Khôi phục ban đầu
              </button>
            )}

            <button
              type="button"
              className="btn btn-sm btn-primary px-4 fw-bold shadow-sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <i className="fas fa-spinner fa-spin me-1.5"></i> Đang lưu...
                </>
              ) : (
                <>
                  <i className="fas fa-save me-1.5"></i>
                  {isModalPicker ? "Xác nhận danh sách model" : "Lưu tương thích thiết bị"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
