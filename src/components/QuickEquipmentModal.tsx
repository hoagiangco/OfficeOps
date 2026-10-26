"use client";

import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import Loading from "@/components/Loading";
import {
  DEFAULT_EQUIPMENT_BRANDS,
  DEFAULT_EQUIPMENT_TYPES,
  DEFAULT_EQUIPMENT_GROUPS,
  DEFAULT_EQUIPMENT_RELATIONS,
} from "@/lib/labels";
import { resolveLocationConfig } from "@/lib/location";

interface WarehouseOption {
  id: string;
  name: string;
  code?: string | null;
  isDefault?: boolean;
}

interface ContractOption {
  id: string;
  code: string;
  title?: string | null;
  baseQuota?: number | null;
  status?: string | null;
}

interface CategoryOption {
  id: string;
  name: string;
  code?: string | null;
  level?: number;
  fullPath?: string;
}

interface CustomerOption {
  id: string;
  name: string;
  code?: string | null;
  branches?: any[];
  contracts?: ContractOption[];
  locationConfig?: unknown;
}

interface QuickEquipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: CustomerOption | null;
  onSuccess: (newEquipment: any, assignedDirectly: boolean) => void;
}

export default function QuickEquipmentModal({
  isOpen,
  onClose,
  customer,
  onSuccess,
}: QuickEquipmentModalProps) {
  const [submitting, setSubmitting] = useState(false);

  // Danh mục dữ liệu động nạp từ hệ thống
  const [brands, setBrands] = useState<string[]>(DEFAULT_EQUIPMENT_BRANDS);
  const [types, setTypes] = useState<string[]>(DEFAULT_EQUIPMENT_TYPES);
  const [groups, setGroups] = useState<string[]>(DEFAULT_EQUIPMENT_GROUPS);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [allCustomers, setAllCustomers] = useState<{ id: string; name: string; code?: string | null }[]>([]);

  const [loadingMetadata, setLoadingMetadata] = useState(false);
  const [loadingCustData, setLoadingCustData] = useState(false);
  const [custDetail, setCustDetail] = useState<CustomerOption | null>(null);

  // Cho phép nhập tự do nếu chọn "Khác"
  const [isCustomBrand, setIsCustomBrand] = useState(false);
  const [isCustomType, setIsCustomType] = useState(false);
  const [isCustomGroup, setIsCustomGroup] = useState(false);
  const [isCustomRelation, setIsCustomRelation] = useState(false);

  // Chế độ tiếp nhận: "CUSTOMER" (Gán luôn cho khách) hoặc "WAREHOUSE" (Nhập kho lưu trữ)
  const [targetMode, setTargetMode] = useState<"CUSTOMER" | "WAREHOUSE">(
    customer ? "CUSTOMER" : "WAREHOUSE"
  );

  const [formData, setFormData] = useState({
    serialNumber: "",
    model: "",
    brand: "Ricoh",
    customBrand: "",
    type: "Máy Photocopy",
    customType: "",
    group: "Máy văn phòng",
    customGroup: "",
    categoryId: "",
    currentCounter: 0,
    relationType: "Cho thuê",
    customRelation: "",
    warehouseId: "",
    selectedCustomerId: customer?.id || "",
    contractId: "",
    locationTarget: "", // "branch:id" | "building:id" | "department:id"
    locationNote: "",
    warrantyUntil: "",
    installedAt: "",
    notes: "",
  });

  // Tải danh mục hệ thống (Brands, Types, Groups, Categories, Warehouses, Customers) khi mở Modal
  useEffect(() => {
    if (!isOpen) return;

    let ignore = false;
    const initMode = customer ? "CUSTOMER" : "WAREHOUSE";

    const resetTimer = setTimeout(() => {
      if (ignore) return;
      setTargetMode(initMode);
      setIsCustomBrand(false);
      setIsCustomType(false);
      setIsCustomGroup(false);
      setIsCustomRelation(false);

      setFormData({
        serialNumber: "",
        model: "",
        brand: "Ricoh",
        customBrand: "",
        type: "Máy Photocopy",
        customType: "",
        group: "Máy văn phòng",
        customGroup: "",
        categoryId: "",
        currentCounter: 0,
        relationType: "Cho thuê",
        customRelation: "",
        warehouseId: "",
        selectedCustomerId: customer?.id || "",
        contractId: "",
        locationTarget: "",
        locationNote: "",
        warrantyUntil: "",
        installedAt: new Date().toISOString().slice(0, 10),
        notes: "",
      });
      setLoadingMetadata(true);
    }, 0);
    Promise.allSettled([
      fetch("/api/equipment-brands").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment-types").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment-groups").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment-categories").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/warehouses").then((r) => (r.ok ? r.json() : null)),
      !customer
        ? fetch("/api/customers?pageSize=200").then((r) => (r.ok ? r.json() : null))
        : Promise.resolve(null),
    ])
      .then(([brandRes, typeRes, groupRes, catRes, whRes, custListRes]) => {
        // Hãng sản xuất
        if (brandRes.status === "fulfilled" && brandRes.value?.brands) {
          const fromDb = brandRes.value.brands.map((b: any) => b.name);
          setBrands(Array.from(new Set([...fromDb, ...DEFAULT_EQUIPMENT_BRANDS])).filter(Boolean));
        }

        // Loại thiết bị
        if (typeRes.status === "fulfilled" && typeRes.value?.types) {
          const fromDb = typeRes.value.types.map((t: any) => t.name);
          setTypes(Array.from(new Set([...fromDb, ...DEFAULT_EQUIPMENT_TYPES])).filter(Boolean));
        }

        // Phân nhóm
        if (groupRes.status === "fulfilled" && groupRes.value?.groups) {
          const fromDb = groupRes.value.groups.map((g: any) => g.name);
          setGroups(Array.from(new Set([...fromDb, ...DEFAULT_EQUIPMENT_GROUPS])).filter(Boolean));
        }

        // Danh mục phân cấp
        if (catRes.status === "fulfilled" && catRes.value?.flat) {
          setCategories(catRes.value.flat);
        }

        // Kho bãi
        if (whRes.status === "fulfilled" && whRes.value?.warehouses) {
          const whList: WarehouseOption[] = whRes.value.warehouses;
          setWarehouses(whList);
          const defaultWh = whList.find((w) => w.isDefault) || whList[0];
          if (defaultWh) {
            setFormData((prev) => ({
              ...prev,
              warehouseId: prev.warehouseId || defaultWh.id,
            }));
          }
        }

        // Danh sách khách hàng (khi mở modal tự do)
        if (custListRes && custListRes.status === "fulfilled" && custListRes.value?.items) {
          setAllCustomers(custListRes.value.items);
        }
      })
      .finally(() => {
        setLoadingMetadata(false);
      });

    return () => {
      ignore = true;
      clearTimeout(resetTimer);
    };
  }, [isOpen, customer]);

  // Xác định khách hàng đang chọn (truyền qua prop hoặc chọn từ dropdown)
  const activeCustomerId = customer?.id || formData.selectedCustomerId;

  // Nạp chi tiết khách hàng (sơ đồ chi nhánh) & Hợp đồng tương ứng
  useEffect(() => {
    if (!isOpen || !activeCustomerId) {
      const timer = setTimeout(() => {
        setCustDetail(null);
        setContracts([]);
      }, 0);
      return () => clearTimeout(timer);
    }

    let ignore = false;
    const startTimer = setTimeout(() => {
      if (!ignore) setLoadingCustData(true);
    }, 0);

    Promise.allSettled([
      fetch(`/api/customers/${activeCustomerId}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/contracts?customerId=${activeCustomerId}&pageSize=100`).then((r) =>
        r.ok ? r.json() : null
      ),
    ])
      .then(([custRes, contractRes]) => {
        let loadedCust: any = null;
        if (custRes.status === "fulfilled" && custRes.value) {
          loadedCust = custRes.value;
          setCustDetail(loadedCust);

          // Tự động chọn vị trí nếu khách hàng chỉ có duy nhất 1 chi nhánh chưa chia tòa nhà
          if (
            loadedCust.branches &&
            loadedCust.branches.length === 1 &&
            (!loadedCust.branches[0].buildings || loadedCust.branches[0].buildings.length === 0)
          ) {
            setFormData((prev) => ({
              ...prev,
              locationTarget: `branch:${loadedCust.branches[0].id}`,
            }));
          }
        }

        // Hợp đồng áp dụng
        let loadedContracts: ContractOption[] = [];
        if (contractRes.status === "fulfilled" && contractRes.value?.items) {
          loadedContracts = contractRes.value.items;
        } else if (loadedCust?.contracts) {
          loadedContracts = loadedCust.contracts;
        }
        setContracts(loadedContracts);
      })
      .finally(() => {
        setLoadingCustData(false);
      });

    return () => {
      ignore = true;
      clearTimeout(startTimer);
    };
  }, [isOpen, activeCustomerId]);

  // Sinh Serial Number ngẫu nhiên nhanh
  const handleGenerateSerial = () => {
    const currentBrand = isCustomBrand ? formData.customBrand : formData.brand;
    const brandPrefix = (currentBrand || "EQ")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 3) || "EQ";
    const rand = Math.floor(100000 + Math.random() * 900000);
    const sn = `${brandPrefix}-${rand}`;
    setFormData((prev) => ({ ...prev, serialNumber: sn }));
  };

  const activeCustomer = custDetail || customer;

  // Cây danh sách vị trí phân cấp của khách hàng hiện tại
  const locationOptions = useMemo(() => {
    if (!activeCustomer?.branches) return [];
    const options: { targetKey: string; label: string }[] = [];

    activeCustomer.branches.forEach((b: any) => {
      // Cấp 1: Chi nhánh
      options.push({
        targetKey: `branch:${b.id}`,
        label: `📁 ${b.name}`,
      });

      b.buildings?.forEach((bu: any) => {
        // Cấp 2: Tòa nhà / Khối
        options.push({
          targetKey: `building:${bu.id}`,
          label: `   └── 📂 ${bu.name}`,
        });

        bu.departments?.forEach((d: any) => {
          // Cấp 3: Phòng ban / Điểm đặt
          options.push({
            targetKey: `department:${d.id}`,
            label: `        └── 📍 ${d.name}`,
          });
        });
      });
    });
    return options;
  }, [activeCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.model.trim()) {
      toast.warning("Vui lòng nhập Dòng máy (Model)");
      return;
    }
    if (!formData.serialNumber.trim()) {
      toast.warning("Vui lòng nhập Số Serial Number");
      return;
    }

    const finalBrand =
      (isCustomBrand ? formData.customBrand.trim() : formData.brand.trim()) || "Khác";
    const finalType =
      (isCustomType ? formData.customType.trim() : formData.type.trim()) || "Máy Photocopy";
    const finalGroup =
      (isCustomGroup ? formData.customGroup.trim() : formData.group.trim()) || "Máy văn phòng";
    const finalRelation =
      (isCustomRelation ? formData.customRelation.trim() : formData.relationType.trim()) ||
      "Cho thuê";

    const isCust = targetMode === "CUSTOMER";
    const effectiveCustomerId = isCust ? customer?.id || formData.selectedCustomerId : null;

    if (isCust && !effectiveCustomerId) {
      toast.warning("Vui lòng chọn khách hàng nhận bàn giao máy");
      return;
    }

    setSubmitting(true);
    try {
      const [level, targetId] = formData.locationTarget
        ? formData.locationTarget.split(":")
        : ["", ""];

      const payload = {
        serialNumber: formData.serialNumber.trim(),
        model: formData.model.trim(),
        brand: finalBrand,
        type: finalType,
        group: finalGroup,
        categoryId: formData.categoryId || null,
        relationType: isCust ? finalRelation : "Sẵn hàng",
        currentCounter: Number(formData.currentCounter) || 0,
        warehouseId: isCust ? null : formData.warehouseId || null,
        customerId: effectiveCustomerId,
        contractId: isCust ? formData.contractId || null : null,
        branchId: isCust ? (level === "branch" ? targetId : null) : null,
        buildingId: isCust ? (level === "building" ? targetId : null) : null,
        departmentId: isCust ? (level === "department" ? targetId : null) : null,
        locationNote: formData.locationNote.trim() || null,
        notes: formData.notes.trim() || null,
        warrantyUntil: formData.warrantyUntil
          ? new Date(formData.warrantyUntil).toISOString()
          : null,
      };

      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể tạo thiết bị");
        return;
      }

      toast.success(
        isCust
          ? `Đã tạo và gán máy ${data.model} (${data.serialNumber}) cho khách hàng thành công!`
          : `Đã nhập máy ${data.model} (${data.serialNumber}) vào kho thành công!`
      );

      onSuccess(data, isCust);
      onClose();
    } catch {
      toast.error("Lỗi kết nối máy chủ khi tạo thiết bị");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-print text-primary fs-6"></i>
          <span>
            Nhập nhanh thiết bị mới
            {activeCustomer && (
              <span className="fw-normal text-white-50 ms-1" style={{ fontSize: "12.5px" }}>
                (cho: <strong>{activeCustomer.name}</strong>)
              </span>
            )}
          </span>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* TÙY CHỌN MỤC TIÊU TIẾP NHẬN */}
        <div className="card bg-light-subtle border rounded-3 p-2.5 mb-3">
          <label className="form-label small fw-bold text-secondary mb-1.5">
            Mục tiêu tiếp nhận thiết bị:
          </label>
          <div className="d-flex gap-3">
            <label
              className={`d-flex align-items-center gap-2 px-3 py-2 rounded-2 border cursor-pointer flex-grow-1 ${
                targetMode === "CUSTOMER"
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-white text-dark border-secondary-subtle"
              }`}
              style={{ cursor: "pointer", transition: "all 0.15s ease" }}
            >
              <input
                type="radio"
                name="targetMode"
                className="form-check-input my-0"
                checked={targetMode === "CUSTOMER"}
                onChange={() => setTargetMode("CUSTOMER")}
              />
              <div>
                <div className="fw-bold small">
                  {customer ? "Gán luôn cho khách hàng này" : "Gán cho khách hàng"}
                </div>
                <div
                  className={targetMode === "CUSTOMER" ? "text-white-50" : "text-muted"}
                  style={{ fontSize: "11px" }}
                >
                  Kích hoạt máy vận hành ngay tại điểm đặt của khách
                </div>
              </div>
            </label>

            <label
              className={`d-flex align-items-center gap-2 px-3 py-2 rounded-2 border cursor-pointer flex-grow-1 ${
                targetMode === "WAREHOUSE"
                  ? "bg-primary text-white border-primary shadow-xs"
                  : "bg-white text-dark border-secondary-subtle"
              }`}
              style={{ cursor: "pointer", transition: "all 0.15s ease" }}
            >
              <input
                type="radio"
                name="targetMode"
                className="form-check-input my-0"
                checked={targetMode === "WAREHOUSE"}
                onChange={() => setTargetMode("WAREHOUSE")}
              />
              <div>
                <div className="fw-bold small">Nhập vào kho lưu trữ</div>
                <div
                  className={targetMode === "WAREHOUSE" ? "text-white-50" : "text-muted"}
                  style={{ fontSize: "11px" }}
                >
                  Lưu vào danh mục kho sẵn sàng để chọn gán sau
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* THÔNG TIN THIẾT BỊ BẮT BUỘC */}
        <div className="row g-2.5 mb-3">
          {/* Dòng máy (Model) */}
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold text-secondary mb-1">
              Dòng máy (Model) <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="VD: Ricoh MP 5054, Canon IR 2525..."
              value={formData.model}
              autoFocus
              required
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
            />
          </div>

          {/* Serial Number */}
          <div className="col-12 col-md-6">
            <label className="form-label small fw-semibold text-secondary mb-1 d-flex justify-content-between align-items-center">
              <span>
                Số Serial Number (S/N) <span className="text-danger">*</span>
              </span>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none small text-primary"
                style={{ fontSize: "11px" }}
                onClick={handleGenerateSerial}
              >
                <i className="fas fa-magic me-1"></i>Sinh mã S/N
              </button>
            </label>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-secondary font-monospace">
                S/N
              </span>
              <input
                type="text"
                className="form-control form-control-sm font-monospace fw-bold"
                placeholder="VD: RC-5054-9988..."
                value={formData.serialNumber}
                required
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
              />
            </div>
          </div>

          {/* Hãng sản xuất */}
          <div className="col-12 col-md-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label className="form-label small fw-semibold text-secondary mb-0">
                Hãng sản xuất
              </label>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none small text-primary"
                style={{ fontSize: "11px" }}
                onClick={() => {
                  setIsCustomBrand(!isCustomBrand);
                  if (!isCustomBrand) {
                    setFormData((prev) => ({ ...prev, customBrand: "" }));
                  }
                }}
              >
                {isCustomBrand ? "← Danh sách" : "+ Khác"}
              </button>
            </div>
            {isCustomBrand ? (
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Nhập tên hãng..."
                value={formData.customBrand}
                autoFocus
                onChange={(e) => setFormData({ ...formData, customBrand: e.target.value })}
              />
            ) : (
              <select
                className="form-select form-select-sm"
                value={formData.brand}
                onChange={(e) => {
                  if (e.target.value === "__CUSTOM__") {
                    setIsCustomBrand(true);
                  } else {
                    setFormData({ ...formData, brand: e.target.value });
                  }
                }}
              >
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
                <option value="__CUSTOM__">+ Hãng khác...</option>
              </select>
            )}
          </div>

          {/* Loại thiết bị */}
          <div className="col-12 col-md-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label className="form-label small fw-semibold text-secondary mb-0">
                Loại thiết bị
              </label>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none small text-primary"
                style={{ fontSize: "11px" }}
                onClick={() => {
                  setIsCustomType(!isCustomType);
                  if (!isCustomType) {
                    setFormData((prev) => ({ ...prev, customType: "" }));
                  }
                }}
              >
                {isCustomType ? "← Danh sách" : "+ Khác"}
              </button>
            </div>
            {isCustomType ? (
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Nhập loại thiết bị..."
                value={formData.customType}
                autoFocus
                onChange={(e) => setFormData({ ...formData, customType: e.target.value })}
              />
            ) : (
              <select
                className="form-select form-select-sm"
                value={formData.type}
                onChange={(e) => {
                  if (e.target.value === "__CUSTOM__") {
                    setIsCustomType(true);
                  } else {
                    setFormData({ ...formData, type: e.target.value });
                  }
                }}
              >
                {types.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value="__CUSTOM__">+ Loại khác...</option>
              </select>
            )}
          </div>

          {/* Phân nhóm máy */}
          <div className="col-12 col-md-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label className="form-label small fw-semibold text-secondary mb-0">
                Phân nhóm máy
              </label>
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none small text-primary"
                style={{ fontSize: "11px" }}
                onClick={() => {
                  setIsCustomGroup(!isCustomGroup);
                  if (!isCustomGroup) {
                    setFormData((prev) => ({ ...prev, customGroup: "" }));
                  }
                }}
              >
                {isCustomGroup ? "← Danh sách" : "+ Khác"}
              </button>
            </div>
            {isCustomGroup ? (
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Nhập phân nhóm..."
                value={formData.customGroup}
                autoFocus
                onChange={(e) => setFormData({ ...formData, customGroup: e.target.value })}
              />
            ) : (
              <select
                className="form-select form-select-sm"
                value={formData.group}
                onChange={(e) => {
                  if (e.target.value === "__CUSTOM__") {
                    setIsCustomGroup(true);
                  } else {
                    setFormData({ ...formData, group: e.target.value });
                  }
                }}
              >
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                <option value="__CUSTOM__">+ Nhóm khác...</option>
              </select>
            )}
          </div>

          {/* Danh mục thiết bị phân cấp */}
          <div className="col-12 col-md-8">
            <label className="form-label small fw-semibold text-secondary mb-1">
              Danh mục phân cấp (Hệ thống)
            </label>
            <select
              className="form-select form-select-sm"
              value={formData.categoryId}
              onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
            >
              <option value="">-- Chưa phân danh mục thiết bị --</option>
              {categories.map((c) => {
                const indent = "— ".repeat(Math.max(0, (c.level || 1) - 1));
                return (
                  <option key={c.id} value={c.id}>
                    {indent ? `${indent} ` : ""}{c.name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Counter ban đầu */}
          <div className="col-12 col-md-4">
            <label className="form-label small fw-semibold text-secondary mb-1">
              Counter ban đầu (Sản lượng)
            </label>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-light text-info">
                <i className="fas fa-tachometer-alt"></i>
              </span>
              <input
                type="number"
                min="0"
                className="form-control form-control-sm font-monospace"
                value={formData.currentCounter}
                onChange={(e) =>
                  setFormData({ ...formData, currentCounter: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
        </div>

        {/* NẾU GÁN LUÔN CHO KHÁCH HÀNG */}
        {targetMode === "CUSTOMER" && (
          <div className="border-top pt-3 mb-3">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <div className="fw-bold small text-success">
                <i className="fas fa-clipboard-check me-1"></i> Thông tin bàn giao cho khách hàng:
              </div>
              {loadingCustData && (
                <span
                  className="badge bg-light text-secondary d-inline-flex align-items-center gap-1"
                  style={{ fontSize: "11px" }}
                >
                  <span
                    className="spinner-border spinner-border-sm"
                    style={{ width: "10px", height: "10px" }}
                  ></span>
                  <span>Đang tải thông tin khách &amp; HĐ...</span>
                </span>
              )}
            </div>

            {/* Chọn khách hàng nếu modal mở tự do */}
            {!customer && (
              <div className="mb-2.5">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Khách hàng nhận máy <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select form-select-sm"
                  value={formData.selectedCustomerId}
                  required
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      selectedCustomerId: e.target.value,
                      contractId: "",
                      locationTarget: "",
                    })
                  }
                >
                  <option value="">-- Chọn khách hàng nhận bàn giao --</option>
                  {allCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="row g-2.5">
              {/* Hình thức dịch vụ */}
              <div className="col-12 col-md-4">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <label className="form-label small fw-semibold text-secondary mb-0">
                    Hình thức dịch vụ <span className="text-danger">*</span>
                  </label>
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none small text-primary"
                    style={{ fontSize: "11px" }}
                    onClick={() => {
                      setIsCustomRelation(!isCustomRelation);
                      if (!isCustomRelation) {
                        setFormData((prev) => ({ ...prev, customRelation: "" }));
                      }
                    }}
                  >
                    {isCustomRelation ? "← Danh sách" : "+ Khác"}
                  </button>
                </div>
                {isCustomRelation ? (
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Nhập hình thức..."
                    value={formData.customRelation}
                    autoFocus
                    onChange={(e) =>
                      setFormData({ ...formData, customRelation: e.target.value })
                    }
                  />
                ) : (
                  <select
                    className="form-select form-select-sm"
                    value={formData.relationType}
                    onChange={(e) => {
                      if (e.target.value === "__CUSTOM__") {
                        setIsCustomRelation(true);
                      } else {
                        setFormData({ ...formData, relationType: e.target.value });
                      }
                    }}
                  >
                    <option value="Cho thuê">Cho thuê (Máy công ty)</option>
                    <option value="Bảo trì định kỳ">Bảo trì định kỳ (Máy khách)</option>
                    <option value="Sửa chữa dịch vụ">Sửa chữa dịch vụ (Máy khách)</option>
                    <option value="Bảo hành máy bán">Bảo hành máy bán</option>
                    <option value="Cho mượn / Dùng thử">Cho mượn / Dùng thử</option>
                    <option value="__CUSTOM__">+ Hình thức khác...</option>
                  </select>
                )}
              </div>

              {/* Hợp đồng */}
              <div className="col-12 col-md-4">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Hợp đồng áp dụng{" "}
                  {contracts.length > 0 && (
                    <span className="badge bg-primary-subtle text-primary ms-1">
                      {contracts.length}
                    </span>
                  )}
                </label>
                <select
                  className="form-select form-select-sm"
                  value={formData.contractId}
                  disabled={loadingCustData}
                  onChange={(e) =>
                    setFormData({ ...formData, contractId: e.target.value })
                  }
                >
                  <option value="">
                    {contracts.length === 0
                      ? "-- Dịch vụ lẻ / Khách chưa có HĐ --"
                      : "-- Dịch vụ lẻ / Không gắn HĐ --"}
                  </option>
                  {contracts.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.code} {c.title ? `- ${c.title}` : ""}{" "}
                      {c.baseQuota ? `(${c.baseQuota.toLocaleString()} bản)` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Hạn bảo hành / bảo trì */}
              <div className="col-12 col-md-4">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Hạn bảo hành / bảo trì
                </label>
                <input
                  type="date"
                  className="form-control form-control-sm"
                  value={formData.warrantyUntil}
                  onChange={(e) =>
                    setFormData({ ...formData, warrantyUntil: e.target.value })
                  }
                />
              </div>

              {/* Vị trí sơ đồ tổ chức */}
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Vị trí lắp đặt (Sơ đồ khách){" "}
                  {locationOptions.length > 0 && (
                    <span className="badge bg-secondary-subtle text-secondary ms-1">
                      {locationOptions.length}
                    </span>
                  )}
                </label>
                <select
                  className="form-select form-select-sm"
                  value={formData.locationTarget}
                  disabled={loadingCustData}
                  onChange={(e) =>
                    setFormData({ ...formData, locationTarget: e.target.value })
                  }
                >
                  <option value="">
                    {locationOptions.length === 0
                      ? "-- Chưa có sơ đồ vị trí --"
                      : "-- Chọn vị trí (Bất kỳ cấp nào) --"}
                  </option>
                  {locationOptions.map((opt) => (
                    <option key={opt.targetKey} value={opt.targetKey}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Vị trí chi tiết */}
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Vị trí chi tiết tại điểm đặt
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="VD: Phòng Kế toán Lầu 2, Cạnh cửa..."
                  value={formData.locationNote}
                  onChange={(e) =>
                    setFormData({ ...formData, locationNote: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* NẾU NHẬP VÀO KHO LƯU TRỮ */}
        {targetMode === "WAREHOUSE" && (
          <div className="border-top pt-3 mb-3">
            <div className="fw-bold small text-primary mb-2">
              <i className="fas fa-warehouse me-1"></i> Thông tin lưu kho:
            </div>
            <div className="row g-2.5">
              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Kho tiếp nhận máy <span className="text-danger">*</span>
                </label>
                <select
                  className="form-select form-select-sm"
                  value={formData.warehouseId}
                  required
                  onChange={(e) =>
                    setFormData({ ...formData, warehouseId: e.target.value })
                  }
                >
                  <option value="">-- Chọn kho lưu trữ --</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} {w.isDefault ? "(Mặc định)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-12 col-md-6">
                <label className="form-label small fw-semibold text-secondary mb-1">
                  Ghi chú vị trí trong kho
                </label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="VD: Kệ A2, Khu vực chờ bàn giao..."
                  value={formData.locationNote}
                  onChange={(e) =>
                    setFormData({ ...formData, locationNote: e.target.value })
                  }
                />
              </div>
            </div>
          </div>
        )}

        {/* Ghi chú chung */}
        <div className="mb-3">
          <label className="form-label small fw-semibold text-secondary mb-1">
            Ghi chú kỹ thuật / tình trạng máy
          </label>
          <input
            type="text"
            className="form-control form-control-sm"
            placeholder="VD: Máy mới 98%, kèm cáp mạng và dây nguồn..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          />
        </div>

        {/* FOOTER */}
        <div className="d-flex justify-content-end gap-2 pt-2 border-top">
          <button
            type="button"
            className="btn btn-sm btn-light border px-3"
            onClick={onClose}
            disabled={submitting}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="btn btn-sm btn-primary fw-bold px-3 d-inline-flex align-items-center gap-1.5 shadow-sm"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner-border spinner-border-sm"></span>
                <span>Đang lưu...</span>
              </>
            ) : targetMode === "CUSTOMER" ? (
              <>
                <i className="fas fa-check-circle"></i>
                <span>Lưu &amp; Bàn giao ngay</span>
              </>
            ) : (
              <>
                <i className="fas fa-box"></i>
                <span>Lưu vào kho thiết bị</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
