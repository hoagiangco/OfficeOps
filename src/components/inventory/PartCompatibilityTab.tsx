"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import PartCompatibilityAssigner from "@/components/inventory/PartCompatibilityAssigner";
import SearchableSelect, { SelectOption } from "@/components/ui/SearchableSelect";

interface CompatiblePart {
  id: string;
  partCode: string;
  name: string;
  barcode?: string | null;
  category: string;
  categoryColor: string;
  unit: string;
  minThreshold: number;
  currentQuantity: number;
  isLowStock: boolean;
  isOutOfStock: boolean;
  salePrice: number | string | null;
  costPrice: number | string | null;
  specs?: Record<string, unknown> | null;
  notes?: string | null;
  compatibleModels: string[];
  batches: {
    id: string;
    batchCode: string;
    quantity: number;
    location: string;
    receivedDate: string;
  }[];
}

interface CompatibleGroup {
  category: string;
  color: string;
  parts: CompatiblePart[];
}

interface EquipmentOption {
  id: string;
  code: string | null;
  serialNumber: string;
  model: string;
  brand: string | null;
  customer?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
  currentCounter?: number;
}

interface PartOption {
  id: string;
  partCode: string;
  name: string;
  unit: string;
  compatibleModels: string[];
  category?: string | null;
  minThreshold?: number;
}

interface TargetEquipmentInfo {
  id: string;
  code: string | null;
  serialNumber?: string | null;
  model: string;
  brand: string | null;
  customer?: { id: string; name: string } | null;
  warehouse?: { id: string; name: string } | null;
  currentCounter?: number | null;
}

interface ReverseEquipmentItem {
  id: string;
  code: string | null;
  serialNumber: string;
  model: string;
  brand: string | null;
  status: string;
  customer?: { id: string; name: string; phone?: string | null; address?: string | null } | null;
  warehouse?: { id: string; name: string } | null;
}

interface ReverseQueryResult {
  part: PartOption & {
    currentQuantity: number;
    isLowStock: boolean;
    partCategory?: { name: string; color?: string | null } | null;
    batches?: { quantity: number; location: string }[];
  };
  compatibleModels: string[];
  matchingEquipmentsCount: number;
  matchingEquipments: ReverseEquipmentItem[];
}

export default function PartCompatibilityTab() {
  const [mode, setMode] = useState<"assign" | "byEquipment" | "byPart">("assign");

  // State mode 1: Theo Thiết bị / Model
  const [equipments, setEquipments] = useState<EquipmentOption[]>([]);
  const [suggestedModels, setSuggestedModels] = useState<string[]>([]);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState("");
  const [customModelQuery, setCustomModelQuery] = useState("");
  const [matchedGroups, setMatchedGroups] = useState<CompatibleGroup[]>([]);
  const [targetEquipmentInfo, setTargetEquipmentInfo] = useState<TargetEquipmentInfo | null>(null);
  const [loadingCompat, setLoadingCompat] = useState(false);

  // State mode 2: Theo Vật tư -> Tìm máy trên thị trường
  const [allParts, setAllParts] = useState<PartOption[]>([]);
  const [selectedPartId, setSelectedPartId] = useState("");
  const [reverseQueryResult, setReverseQueryResult] = useState<ReverseQueryResult | null>(null);
  const [loadingReverse, setLoadingReverse] = useState(false);

  // Tra cứu vật tư tương thích theo máy
  const queryCompatibleParts = useCallback(async (eqId?: string, modelStr?: string) => {
    if (!eqId && !modelStr) return;

    try {
      setLoadingCompat(true);
      const params = new URLSearchParams();
      if (eqId) params.set("equipmentId", eqId);
      else if (modelStr) params.set("model", modelStr);

      const res = await fetch(`/api/parts/compatible?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMatchedGroups(data.groups || []);
        setTargetEquipmentInfo(data.equipment || null);
      } else {
        toast.error("Không thể tra cứu vật tư tương thích");
      }
    } catch {
      toast.error("Lỗi khi kết nối tra cứu");
    } finally {
      setLoadingCompat(false);
    }
  }, []);

  // Tra cứu ngược từ vật tư
  const queryReverseEquipments = useCallback(async (partId: string) => {
    if (!partId) return;
    try {
      setLoadingReverse(true);
      const res = await fetch(`/api/parts/compatible?partId=${partId}`);
      if (res.ok) {
        const data = await res.json();
        setReverseQueryResult(data);
      } else {
        toast.error("Không thể tra cứu thông tin thiết bị");
      }
    } catch {
      toast.error("Lỗi kết nối tra cứu");
    } finally {
      setLoadingReverse(false);
    }
  }, []);

  // Tải danh sách thiết bị và models gợi ý khi mount
  useEffect(() => {
    fetch("/api/equipment?pageSize=200")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items) {
          setEquipments(d.items);
          if (d.items.length > 0) {
            setSelectedEquipmentId(d.items[0].id);
            queryCompatibleParts(d.items[0].id, undefined);
          }
        }
      })
      .catch(() => {});

    fetch("/api/parts/compatible")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.suggestedModels) setSuggestedModels(d.suggestedModels);
      })
      .catch(() => {});

    fetch("/api/parts?pageSize=200")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.items) {
          setAllParts(d.items);
          if (d.items.length > 0) {
            setSelectedPartId(d.items[0].id);
            queryReverseEquipments(d.items[0].id);
          }
        }
      })
      .catch(() => {});
  }, [queryCompatibleParts, queryReverseEquipments]);

  const handleSearchCustomModel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customModelQuery.trim()) return;
    setSelectedEquipmentId("");
    queryCompatibleParts(undefined, customModelQuery.trim());
  };

  const handleSelectSuggestedModel = (model: string) => {
    setCustomModelQuery(model);
    setSelectedEquipmentId("");
    queryCompatibleParts(undefined, model);
  };

  const equipmentSelectOptions = useMemo<SelectOption[]>(() => {
    return equipments.map((eq) => ({
      value: eq.id,
      label: `${eq.code || eq.serialNumber} • ${eq.brand || ""} ${eq.model}`,
      sublabel: eq.customer ? eq.customer.name : "Tại kho lưu trữ",
      badge: eq.brand || undefined,
    }));
  }, [equipments]);

  const partSelectOptions = useMemo<SelectOption[]>(() => {
    return allParts.map((p) => ({
      value: p.id,
      label: `[${p.partCode}] ${p.name}`,
      sublabel: `${p.category || "Vật tư"}${
        p.compatibleModels?.length ? ` • Đã gán ${p.compatibleModels.length} dòng máy` : ""
      }`,
      badge: p.unit,
    }));
  }, [allParts]);

  return (
    <div className="d-flex flex-column gap-3">
      {/* Thanh chuyển chế độ tra cứu */}
      <div className="card shadow-sm border-0 rounded-3">
        <div className="card-body p-3">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <h6 className="mb-1 fw-bold text-dark">
                <i className="fas fa-microchip text-primary me-2"></i>
                Ma trận Tương thích Vật tư &amp; Dòng máy Thiết bị
              </h6>
              <small className="text-muted">
                Tra cứu tự động các loại mực in, trống gạt, rulo sấy và linh kiện hao mòn chuẩn xác theo dòng máy
              </small>
            </div>
            <div className="btn-group btn-group-sm">
              <button
                className={`btn px-3 fw-semibold ${mode === "assign" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
                onClick={() => setMode("assign")}
              >
                <i className="fas fa-check-square me-1.5"></i> Gán máy tương thích (Check / Uncheck)
              </button>
              <button
                className={`btn px-3 fw-semibold ${mode === "byEquipment" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
                onClick={() => {
                  setMode("byEquipment");
                  if (selectedEquipmentId) queryCompatibleParts(selectedEquipmentId, undefined);
                }}
              >
                <i className="fas fa-print me-1.5"></i> Tra cứu theo Thiết bị / Model
              </button>
              <button
                className={`btn px-3 fw-semibold ${mode === "byPart" ? "btn-primary shadow-sm" : "btn-light border text-muted"}`}
                onClick={() => {
                  setMode("byPart");
                  if (selectedPartId) queryReverseEquipments(selectedPartId);
                }}
              >
                <i className="fas fa-box-open me-1.5"></i> Tra cứu theo Vật tư &rarr; Khách dùng
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CHẾ ĐỘ 0: GÁN THIẾT BỊ TƯƠNG THÍCH DẠNG CHECK / UNCHECK */}
      {mode === "assign" && (
        <PartCompatibilityAssigner
          initialPartId={selectedPartId}
          onSaved={(partId) => {
            setSelectedPartId(partId);
          }}
        />
      )}

      {/* CHẾ ĐỘ 1: TÌM THEO THIẾT BỊ / MODEL */}
      {mode === "byEquipment" && (
        <>
          <div className="card shadow-sm border-0 rounded-3">
            <div className="card-body p-3">
              <div className="row g-3 align-items-end">
                {/* Chọn từ thiết bị đang lắp */}
                <div className="col-lg-6 col-md-12">
                  <label className="form-label small fw-bold text-dark mb-1">
                    <i className="fas fa-barcode text-secondary me-1"></i>
                    Cách 1: Chọn Thiết bị đang quản lý trong hệ thống
                  </label>
                  <SearchableSelect
                    value={selectedEquipmentId}
                    onChange={(val) => {
                      setSelectedEquipmentId(val);
                      setCustomModelQuery("");
                      if (val) queryCompatibleParts(val, undefined);
                    }}
                    options={equipmentSelectOptions}
                    placeholder={`-- Chọn máy trong danh sách thiết bị (${equipments.length}) --`}
                    searchPlaceholder="Tìm mã máy, serial, model hoặc tên khách hàng..."
                    prefixIcon="fas fa-print"
                    maxHeight={280}
                  />
                </div>

                {/* Nhập hoặc gõ model tự do */}
                <div className="col-lg-6 col-md-12">
                  <label className="form-label small fw-bold text-dark mb-1">
                    <i className="fas fa-search text-secondary me-1"></i>
                    Cách 2: Gõ tên Model máy (Ví dụ: MP 5002, iR 2525, 3008A...)
                  </label>
                  <form onSubmit={handleSearchCustomModel} className="input-group input-group-sm">
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Gõ mã dòng máy (VD: MP 5002, Canon 2525...)"
                      value={customModelQuery}
                      onChange={(e) => setCustomModelQuery(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary px-3 fw-semibold">
                      Tra cứu
                    </button>
                  </form>
                </div>
              </div>

              {/* Các model phổ biến để bấm nhanh */}
              {suggestedModels.length > 0 && (
                <div className="mt-2.5 pt-2 border-top d-flex flex-wrap align-items-center gap-1.5">
                  <span className="small text-muted me-1">
                    <i className="fas fa-tags me-1"></i>Dòng máy phổ biến:
                  </span>
                  {suggestedModels.slice(0, 8).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`badge rounded-pill border px-2 py-1 text-decoration-none btn btn-sm ${
                        customModelQuery === m ? "bg-primary text-white" : "bg-light text-dark"
                      }`}
                      style={{ fontSize: "11px" }}
                      onClick={() => handleSelectSuggestedModel(m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Thông tin thiết bị được chọn (nếu có) */}
          {targetEquipmentInfo && (
            <div className="alert alert-info border-0 shadow-sm d-flex flex-wrap align-items-center justify-content-between p-3 mb-0 rounded-3">
              <div className="d-flex align-items-center gap-3">
                <div className="bg-white text-primary rounded-circle p-2.5 shadow-sm">
                  <i className="fas fa-print fa-lg"></i>
                </div>
                <div>
                  <h6 className="mb-0 fw-bold">
                    {targetEquipmentInfo.brand} {targetEquipmentInfo.model}
                    <span className="badge bg-dark ms-2 font-monospace">
                      {targetEquipmentInfo.code || targetEquipmentInfo.serialNumber}
                    </span>
                  </h6>
                  <small className="text-muted">
                    {targetEquipmentInfo.customer ? (
                      <>
                        <i className="fas fa-building me-1"></i>
                        Khách hàng: <strong>{targetEquipmentInfo.customer.name}</strong>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-warehouse me-1"></i>
                        Vị trí: Trong kho <strong>{targetEquipmentInfo.warehouse?.name || "Kho"}</strong>
                      </>
                    )}
                    {targetEquipmentInfo.currentCounter !== undefined && (
                      <span className="ms-3">
                        Counter: <strong>{Number(targetEquipmentInfo.currentCounter).toLocaleString("vi-VN")}</strong> bản
                      </span>
                    )}
                  </small>
                </div>
              </div>
              <Link
                href={`/equipment/${targetEquipmentInfo.id}`}
                className="btn btn-outline-primary btn-sm px-3 fw-semibold bg-white"
              >
                Xem chi tiết máy &rarr;
              </Link>
            </div>
          )}

          {/* Bảng kết quả vật tư tương thích */}
          <div className="card shadow-sm border-0 rounded-3">
            <div className="card-header bg-white py-3 border-bottom d-flex align-items-center justify-content-between">
              <h6 className="mb-0 fw-bold text-dark">
                <i className="fas fa-clipboard-check text-success me-2"></i>
                Danh sách Vật tư Tương thích Tìm Thấy (
                {matchedGroups.reduce((s, g) => s + g.parts.length, 0)} linh kiện)
              </h6>
              {matchedGroups.length > 0 && (
                <span className="small text-muted">
                  Đã phân loại thành {matchedGroups.length} nhóm linh kiện
                </span>
              )}
            </div>

            <div className="card-body p-0">
              {loadingCompat ? (
                <div className="p-5 text-center text-muted">
                  <Loading />
                  <p className="mt-2 small text-muted">Đang quét ma trận tương thích...</p>
                </div>
              ) : matchedGroups.length === 0 ? (
                <div className="p-5 text-center text-muted">
                  <i className="fas fa-search fa-2x mb-2 text-secondary opacity-50"></i>
                  <p className="mb-1 fw-bold text-dark">Không tìm thấy vật tư tương thích nào cho model này</p>
                  <small className="text-muted">
                    Vui lòng thử gõ từ khóa model khác hoặc cập nhật thêm thông tin &quot;Dòng máy tương thích&quot; trong tab Vật tư.
                  </small>
                </div>
              ) : (
                <div className="d-flex flex-column gap-3 p-3">
                  {matchedGroups.map((group) => (
                    <div key={group.category} className="border rounded-3 overflow-hidden bg-white shadow-sm">
                      <div
                        className="py-2 px-3 fw-bold small text-white d-flex align-items-center justify-content-between"
                        style={{ backgroundColor: group.color || "#0284c7" }}
                      >
                        <span>
                          <i className="fas fa-layer-group me-1.5"></i>
                          {group.category}
                        </span>
                        <span className="badge bg-white text-dark">{group.parts.length} vật tư</span>
                      </div>

                      <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0 custom-dense-table">
                          <thead className="table-light">
                            <tr>
                              <th className="px-3" style={{ width: "150px" }}>Mã vật tư</th>
                              <th>Tên vật tư / Thông số</th>
                              <th className="text-center" style={{ width: "120px" }}>Tồn kho</th>
                              <th style={{ width: "180px" }}>Vị trí tủ / Kệ</th>
                              <th className="text-end" style={{ width: "130px" }}>Đơn giá</th>
                              <th className="text-end px-3" style={{ width: "150px" }}>Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.parts.map((part) => (
                              <tr key={part.id}>
                                <td className="px-3">
                                  <strong className="font-monospace text-dark small">{part.partCode}</strong>
                                  {part.barcode && (
                                    <div className="text-muted" style={{ fontSize: "10px" }}>
                                      <i className="fas fa-barcode me-1"></i>
                                      {part.barcode}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <div className="fw-semibold text-dark">{part.name}</div>
                                  {part.specs && typeof part.specs === "object" && (
                                    <div className="text-muted small" style={{ fontSize: "11px" }}>
                                      {Object.entries(part.specs).map(([k, v]) => (
                                        <span key={k} className="me-2 badge bg-light text-secondary border">
                                          {k}: {String(v)}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="text-center">
                                  {part.isOutOfStock ? (
                                    <span className="badge bg-danger px-2 py-1">Hết hàng (0 {part.unit})</span>
                                  ) : part.isLowStock ? (
                                    <span className="badge bg-warning text-dark px-2 py-1">
                                      Sắp hết ({part.currentQuantity} {part.unit})
                                    </span>
                                  ) : (
                                    <span className="badge bg-success-subtle text-success border border-success-subtle px-2 py-1 fw-bold">
                                      Còn {part.currentQuantity} {part.unit}
                                    </span>
                                  )}
                                </td>
                                <td className="small text-muted">
                                  {part.batches.length > 0 ? (
                                    part.batches.slice(0, 2).map((b) => (
                                      <div key={b.id} className="text-truncate" style={{ maxWidth: "170px" }}>
                                        <i className="fas fa-map-marker-alt text-danger me-1"></i>
                                        {b.location} ({b.quantity})
                                      </div>
                                    ))
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="text-end small font-monospace fw-bold text-dark">
                                  {part.salePrice
                                    ? `${Number(part.salePrice).toLocaleString("vi-VN")} đ`
                                    : "Liên hệ"}
                                </td>
                                <td className="text-end px-3">
                                  <Link
                                    href={`/stock-issues?partId=${part.id}`}
                                    className="btn btn-outline-primary btn-sm px-2.5 py-1"
                                    title="Tạo phiếu xuất kho linh kiện này"
                                  >
                                    <i className="fas fa-dolly me-1"></i> Xuất kho
                                  </Link>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* CHẾ ĐỘ 2: TÌM THEO VẬT TƯ -> XEM CÁC MÁY ĐANG DÙNG TRÊN THỊ TRƯỜNG */}
      {mode === "byPart" && (
        <div className="d-flex flex-column gap-3">
          <div className="card shadow-sm border-0 rounded-3">
            <div className="card-body p-3">
              <label className="form-label small fw-bold text-dark mb-1">
                <i className="fas fa-box-open text-primary me-1"></i>
                Chọn Vật tư / Linh kiện cần kiểm tra độ tương thích ({allParts.length})
              </label>
              <SearchableSelect
                value={selectedPartId}
                onChange={(val) => {
                  setSelectedPartId(val);
                  if (val) queryReverseEquipments(val);
                }}
                options={partSelectOptions}
                placeholder={`-- Chọn vật tư cần tra cứu (${allParts.length}) --`}
                searchPlaceholder="Tìm mã hoặc tên linh kiện, dòng máy..."
                prefixIcon="fas fa-box-open"
                maxHeight={280}
              />
            </div>
          </div>

          {loadingReverse ? (
            <div className="p-5 text-center text-muted card shadow-sm border-0 rounded-3">
              <Loading />
            </div>
          ) : reverseQueryResult ? (
            <div className="d-flex flex-column gap-3">
              {/* Thẻ tóm tắt vật tư */}
              <div className="card shadow-sm border-0 rounded-3">
                <div className="card-body p-3">
                  <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                    <div>
                      <span className="badge bg-primary-subtle text-primary border mb-1">
                        {reverseQueryResult.part.partCategory?.name || reverseQueryResult.part.category || "Vật tư"}
                      </span>
                      <h5 className="mb-1 fw-bold text-dark">
                        [{reverseQueryResult.part.partCode}] {reverseQueryResult.part.name}
                      </h5>
                      <div className="small text-muted">
                        Tồn kho: <strong>{reverseQueryResult.part.currentQuantity}</strong> {reverseQueryResult.part.unit} | Định mức tối thiểu: {reverseQueryResult.part.minThreshold} {reverseQueryResult.part.unit}
                      </div>
                    </div>
                    <div className="text-end">
                      <div className="h4 text-success fw-bold mb-0">
                        {reverseQueryResult.matchingEquipmentsCount} máy
                      </div>
                      <small className="text-muted">Đang vận hành tại khách hàng</small>
                    </div>
                  </div>

                  {/* Dòng máy tương thích */}
                  <div className="mt-3 pt-2.5 border-top">
                    <span className="small fw-bold text-dark me-2">Các model máy tương thích khai báo:</span>
                    <div className="d-inline-flex flex-wrap gap-1 mt-1">
                      {reverseQueryResult.compatibleModels.map((m: string) => (
                        <span key={m} className="badge bg-light text-dark border px-2 py-1 font-monospace">
                          {m}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Danh sách máy thực tế tại khách hàng */}
              <div className="card shadow-sm border-0 rounded-3">
                <div className="card-header bg-white py-3 border-bottom">
                  <h6 className="mb-0 fw-bold text-dark">
                    <i className="fas fa-building text-secondary me-2"></i>
                    Danh sách Thiết bị của Khách hàng dùng dòng máy này ({reverseQueryResult.matchingEquipmentsCount})
                  </h6>
                </div>
                <div className="card-body p-0">
                  {reverseQueryResult.matchingEquipments.length === 0 ? (
                    <div className="p-4 text-center text-muted small">
                      Hiện tại chưa có thiết bị nào của khách hàng đang lắp model máy khớp với danh mục này.
                    </div>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-hover align-middle mb-0 custom-dense-table">
                        <thead className="table-light">
                          <tr>
                            <th className="px-3">Mã máy / Serial</th>
                            <th>Hãng &amp; Model</th>
                            <th>Khách hàng đang thuê</th>
                            <th>Địa chỉ lắp đặt</th>
                            <th className="text-end px-3">Hành động</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reverseQueryResult.matchingEquipments.map((eq: ReverseEquipmentItem) => (
                            <tr key={eq.id}>
                              <td className="px-3">
                                <strong className="font-monospace text-dark small">{eq.code || eq.serialNumber}</strong>
                                <div className="text-muted small" style={{ fontSize: "10px" }}>SN: {eq.serialNumber}</div>
                              </td>
                              <td>
                                <span className="fw-semibold">{eq.brand} {eq.model}</span>
                              </td>
                              <td>
                                {eq.customer ? (
                                  <div>
                                    <div className="fw-bold text-dark">{eq.customer.name}</div>
                                    <small className="text-muted">{eq.customer.phone || "—"}</small>
                                  </div>
                                ) : (
                                  <span className="text-muted">Chưa bàn giao (Tại kho)</span>
                                )}
                              </td>
                              <td className="small text-muted text-break" style={{ maxWidth: "250px" }}>
                                {eq.customer?.address || "—"}
                              </td>
                              <td className="text-end px-3">
                                <Link
                                  href={`/equipment/${eq.id}`}
                                  className="btn btn-outline-secondary btn-sm px-2.5 py-1"
                                >
                                  Xem máy &rarr;
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
