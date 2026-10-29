"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  STATUS_LABELS,
  DEFAULT_EQUIPMENT_BRANDS,
  DEFAULT_EQUIPMENT_TYPES,
  DEFAULT_EQUIPMENT_GROUPS,
  DEFAULT_EQUIPMENT_RELATIONS,
} from "@/lib/labels";

interface CategoryNode {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  level: number;
  fullPath: string;
}

interface WarehouseItem {
  id: string;
  code: string | null;
  name: string;
  address: string | null;
  isDefault: boolean;
}

interface CustomerOption {
  id: string;
  name: string;
  code?: string | null;
}

interface ContractOption {
  id: string;
  code: string;
  customerId: string;
  customer?: { id: string; name: string };
}

interface DepartmentOption {
  id: string;
  label: string;
}

export interface EditableEquipmentTarget {
  id: string;
  code?: string | null;
  serialNumber?: string | null;
  model: string;
  brand?: string | null;
  type?: string;
  group?: string;
  relationType?: string;
  categoryId?: string | null;
  category?: { id?: string; name: string } | null;
  warehouseId?: string | null;
  customerId?: string | null;
  contractId?: string | null;
  contract?: { id?: string; code: string } | null;
  branchId?: string | null;
  buildingId?: string | null;
  departmentId?: string | null;
  branch?: { id?: string; name: string } | null;
  building?: { id?: string; name: string } | null;
  department?: { id?: string; name: string } | null;
  locationNote?: string | null;
  notes?: string | null;
  status?: string;
  healthScore?: number;
  currentCounter?: number;
  baseQuota?: number | null;
  overagePrice?: string | number | null;
  warrantyUntil?: string | null;
}

interface EquipmentEditModalProps {
  show: boolean;
  equipment: EditableEquipmentTarget | null;
  defaultCustomerId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EquipmentEditModal({
  show,
  equipment,
  defaultCustomerId,
  onClose,
  onSaved,
}: EquipmentEditModalProps) {
  const [saving, setSaving] = useState(false);

  const [categoriesFlat, setCategoriesFlat] = useState<CategoryNode[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  const [dbBrands, setDbBrands] = useState<{ id: string; name: string }[]>([]);
  const [dbTypes, setDbTypes] = useState<{ id: string; name: string }[]>([]);
  const [dbGroups, setDbGroups] = useState<{ id: string; name: string }[]>([]);

  const [customBrands, setCustomBrands] = useState<string[]>([]);
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [customRelations, setCustomRelations] = useState<string[]>([]);

  const [addingCustomBrand, setAddingCustomBrand] = useState(false);
  const [newBrandText, setNewBrandText] = useState("");
  const [addingCustomType, setAddingCustomType] = useState(false);
  const [newTypeText, setNewTypeText] = useState("");
  const [addingCustomGroup, setAddingCustomGroup] = useState(false);
  const [newGroupText, setNewGroupText] = useState("");
  const [addingCustomRelation, setAddingCustomRelation] = useState(false);
  const [newRelationText, setNewRelationText] = useState("");

  const [destinationMode, setDestinationMode] = useState<"WAREHOUSE" | "CUSTOMER">("CUSTOMER");
  const [formData, setFormData] = useState({
    code: "",
    serialNumber: "",
    model: "",
    brand: "Ricoh",
    type: "Máy Photocopy",
    group: "Máy văn phòng",
    relationType: "Cho thuê",
    categoryId: "",
    warehouseId: "",
    customerId: "",
    contractId: "",
    departmentId: "",
    locationNote: "",
    notes: "",
    status: "ACTIVE",
    healthScore: "100",
    currentCounter: "0",
    baseQuota: "",
    overagePrice: "",
    warrantyUntil: "",
  });

  const loadCustomerDepartments = useCallback(async (custId: string) => {
    if (!custId) {
      setDepartments([]);
      return;
    }
    try {
      const res = await fetch(`/api/customers/${custId}`);
      if (!res.ok) return;
      const data = await res.json();
      const list: DepartmentOption[] = [];
      for (const b of data.branches || []) {
        list.push({ id: `branch:${b.id}`, label: `📁 ${b.name}` });
        for (const bd of b.buildings || []) {
          list.push({ id: `building:${bd.id}`, label: `   └── 📂 ${bd.name}` });
          for (const dp of bd.departments || []) {
            list.push({ id: `department:${dp.id}`, label: `        └── 📍 ${dp.name}` });
          }
        }
      }
      setDepartments(list);
    } catch {
      // ignore
    }
  }, []);

  const applyEquipmentToForm = useCallback(
    (eq: EditableEquipmentTarget, fallbackCustId?: string | null) => {
      const effCustomerId = eq.customerId ?? fallbackCustId ?? "";
      const isCust = Boolean(effCustomerId) && eq.status !== "IN_STOCK";
      setDestinationMode(isCust ? "CUSTOMER" : "WAREHOUSE");

      const deptId = eq.departmentId || eq.department?.id;
      const bldId = eq.buildingId || eq.building?.id;
      const brId = eq.branchId || eq.branch?.id;

      setFormData({
        code: eq.code || "",
        serialNumber: eq.serialNumber || "",
        model: eq.model || "",
        brand: eq.brand || "",
        type: eq.type || "Máy Photocopy",
        group: eq.group || "Máy văn phòng",
        relationType: isCust ? eq.relationType || "Cho thuê" : "Sẵn hàng",
        categoryId: eq.categoryId || eq.category?.id || "",
        warehouseId: eq.warehouseId || "",
        customerId: effCustomerId,
        contractId: eq.contractId || eq.contract?.id || "",
        departmentId: deptId
          ? `department:${deptId}`
          : bldId
          ? `building:${bldId}`
          : brId
          ? `branch:${brId}`
          : "",
        locationNote: eq.locationNote || "",
        notes: eq.notes || "",
        status: eq.status || "ACTIVE",
        healthScore: String(eq.healthScore ?? 100),
        currentCounter: String(eq.currentCounter ?? 0),
        baseQuota: eq.baseQuota != null ? String(eq.baseQuota) : "",
        overagePrice: eq.overagePrice != null ? String(eq.overagePrice) : "",
        warrantyUntil: eq.warrantyUntil ? String(eq.warrantyUntil).slice(0, 10) : "",
      });

      if (effCustomerId) {
        loadCustomerDepartments(effCustomerId);
      } else {
        setDepartments([]);
      }
    },
    [loadCustomerDepartments]
  );

  // Khi mở modal: điền ngay dữ liệu sẵn có và tải đầy đủ hồ sơ thiết bị + danh mục hệ thống
  useEffect(() => {
    if (!show || !equipment) return;

    let ignore = false;

    Promise.resolve().then(() => {
      if (!ignore) {
        setAddingCustomBrand(false);
        setAddingCustomType(false);
        setAddingCustomGroup(false);
        setAddingCustomRelation(false);
        applyEquipmentToForm(equipment, defaultCustomerId);
      }
    });

    Promise.allSettled([
      fetch(`/api/equipment/${equipment.id}`).then((r) => (r.ok ? r.json() : null)),
      fetch("/api/customers?pageSize=200").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/contracts?pageSize=200").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment-categories").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment-brands").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment-types").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/equipment-groups").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/warehouses").then((r) => (r.ok ? r.json() : null)),
    ]).then(([eqRes, custRes, ctRes, catRes, brRes, tpRes, grRes, whRes]) => {
      if (ignore) return;

      if (custRes.status === "fulfilled" && custRes.value?.items) {
        setCustomers(custRes.value.items);
      }
      if (ctRes.status === "fulfilled" && ctRes.value?.items) {
        setContracts(ctRes.value.items);
      }
      if (catRes.status === "fulfilled" && catRes.value?.flat) {
        setCategoriesFlat(catRes.value.flat);
      }
      if (brRes.status === "fulfilled" && brRes.value?.brands) {
        setDbBrands(brRes.value.brands);
      }
      if (tpRes.status === "fulfilled" && tpRes.value?.types) {
        setDbTypes(tpRes.value.types);
      }
      if (grRes.status === "fulfilled" && grRes.value?.groups) {
        setDbGroups(grRes.value.groups);
      }
      if (whRes.status === "fulfilled" && whRes.value?.warehouses) {
        const whs: WarehouseItem[] = whRes.value.warehouses;
        setWarehouses(whs);
      }

      if (eqRes.status === "fulfilled" && eqRes.value) {
        applyEquipmentToForm(eqRes.value, defaultCustomerId);
      }
    });

    return () => {
      ignore = true;
    };
  }, [show, equipment, defaultCustomerId, applyEquipmentToForm]);

  const handleDestinationChange = (mode: "WAREHOUSE" | "CUSTOMER") => {
    setDestinationMode(mode);
    if (mode === "WAREHOUSE") {
      setFormData((prev) => ({
        ...prev,
        customerId: "",
        contractId: "",
        departmentId: "",
        warehouseId:
          prev.warehouseId ||
          warehouses.find((w) => w.isDefault)?.id ||
          warehouses[0]?.id ||
          "",
        status: prev.status === "ACTIVE" ? "IN_STOCK" : prev.status,
        relationType: "Sẵn hàng",
      }));
      setDepartments([]);
    } else {
      const targetCust = formData.customerId || defaultCustomerId || "";
      setFormData((prev) => ({
        ...prev,
        customerId: targetCust,
        warehouseId: "",
        status: prev.status === "IN_STOCK" ? "ACTIVE" : prev.status,
        relationType:
          prev.relationType === "Sẵn hàng" ? "Cho thuê" : prev.relationType || "Cho thuê",
      }));
      if (targetCust) {
        loadCustomerDepartments(targetCust);
      }
    }
  };

  const brandOptions = useMemo(() => {
    const set = new Set<string>([
      ...dbBrands.map((b) => b.name),
      ...DEFAULT_EQUIPMENT_BRANDS,
      ...customBrands,
      ...(formData.brand ? [formData.brand] : []),
    ]);
    return Array.from(set).filter(Boolean);
  }, [dbBrands, customBrands, formData.brand]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>([
      ...dbTypes.map((t) => t.name),
      ...DEFAULT_EQUIPMENT_TYPES,
      ...customTypes,
      ...(formData.type ? [formData.type] : []),
    ]);
    return Array.from(set).filter(Boolean);
  }, [dbTypes, customTypes, formData.type]);

  const groupOptions = useMemo(() => {
    const set = new Set<string>([
      ...dbGroups.map((g) => g.name),
      ...DEFAULT_EQUIPMENT_GROUPS,
      ...customGroups,
      ...(formData.group ? [formData.group] : []),
    ]);
    return Array.from(set).filter(Boolean);
  }, [dbGroups, customGroups, formData.group]);

  const relationOptions = useMemo(() => {
    const set = new Set<string>([
      ...DEFAULT_EQUIPMENT_RELATIONS,
      ...customRelations,
      ...(formData.relationType ? [formData.relationType] : []),
    ]);
    return Array.from(set).filter(Boolean);
  }, [customRelations, formData.relationType]);

  const categorySelectOptions = useMemo(() => {
    return categoriesFlat.map((c) => ({
      value: c.id,
      label: c.name,
      level: Math.max(0, c.level - 1),
    }));
  }, [categoriesFlat]);

  const warehouseSelectOptions = useMemo(() => {
    return warehouses.map((w) => ({
      value: w.id,
      label: w.isDefault ? `${w.name} (Mặc định)` : w.name,
      sublabel: w.address ? `Địa chỉ: ${w.address}` : undefined,
    }));
  }, [warehouses]);

  const customerSelectOptions = useMemo(() => {
    return customers.map((c) => ({
      value: c.id,
      label: c.name,
    }));
  }, [customers]);

  const filteredContracts = useMemo(() => {
    return contracts.filter(
      (c) => !formData.customerId || c.customerId === formData.customerId
    );
  }, [contracts, formData.customerId]);

  const contractSelectOptions = useMemo(() => {
    return filteredContracts.map((ct) => ({
      value: ct.id,
      label: ct.customer?.name ? `${ct.code} - ${ct.customer.name}` : ct.code,
    }));
  }, [filteredContracts]);

  const departmentSelectOptions = useMemo(() => {
    return departments.map((dp) => ({
      value: dp.id,
      label: dp.label,
    }));
  }, [departments]);

  const statusSelectOptions = useMemo(() => {
    return Object.entries(STATUS_LABELS).map(([k, v]) => ({
      value: k,
      label: v,
    }));
  }, []);

  const handleInlineAddBrand = async () => {
    if (!newBrandText.trim()) return;
    const v = newBrandText.trim();
    try {
      const res = await fetch("/api/equipment-brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v }),
      });
      if (res.ok) {
        toast.success(`Đã thêm hãng "${v}" vào CSDL`);
      }
    } catch {
      // ignore
    }
    setCustomBrands((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setFormData((prev) => ({ ...prev, brand: v }));
    setNewBrandText("");
    setAddingCustomBrand(false);
  };

  const handleInlineAddType = async () => {
    if (!newTypeText.trim()) return;
    const v = newTypeText.trim();
    try {
      const res = await fetch("/api/equipment-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v }),
      });
      if (res.ok) {
        toast.success(`Đã thêm loại "${v}" vào CSDL`);
      }
    } catch {
      // ignore
    }
    setCustomTypes((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setFormData((prev) => ({ ...prev, type: v }));
    setNewTypeText("");
    setAddingCustomType(false);
  };

  const handleInlineAddGroup = async () => {
    if (!newGroupText.trim()) return;
    const v = newGroupText.trim();
    try {
      const res = await fetch("/api/equipment-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: v }),
      });
      if (res.ok) {
        toast.success(`Đã thêm nhóm "${v}" vào CSDL`);
      }
    } catch {
      // ignore
    }
    setCustomGroups((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setFormData((prev) => ({ ...prev, group: v }));
    setNewGroupText("");
    setAddingCustomGroup(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipment) return;

    if (destinationMode === "CUSTOMER" && !formData.customerId) {
      toast.warning("Vui lòng chọn khách hàng khi chọn chế độ Gán cho khách hàng");
      return;
    }
    if (destinationMode === "WAREHOUSE" && !formData.warehouseId) {
      toast.warning("Vui lòng chọn kho bãi lưu trữ khi chọn chế độ Nhập kho lưu trữ");
      return;
    }

    setSaving(true);
    try {
      const finalStatus =
        destinationMode === "WAREHOUSE" && formData.status === "ACTIVE"
          ? "IN_STOCK"
          : destinationMode === "CUSTOMER" && formData.status === "IN_STOCK"
          ? "ACTIVE"
          : formData.status;

      const [level, targetId] = formData.departmentId
        ? formData.departmentId.split(":")
        : ["", ""];
      const isCust = destinationMode === "CUSTOMER";

      const payload: Record<string, unknown> = {
        serialNumber: formData.serialNumber.trim() || null,
        code: formData.code.trim() || null,
        model: formData.model.trim(),
        brand: formData.brand.trim() || null,
        type: formData.type.trim() || "Máy Photocopy",
        group: formData.group.trim() || "Máy văn phòng",
        relationType: isCust ? formData.relationType.trim() || "Cho thuê" : "Sẵn hàng",
        categoryId: formData.categoryId || null,
        warehouseId: destinationMode === "WAREHOUSE" ? formData.warehouseId || null : null,
        customerId: isCust ? formData.customerId || null : null,
        contractId: isCust ? formData.contractId || null : null,
        branchId: isCust ? (level === "branch" ? targetId : null) : null,
        buildingId: isCust ? (level === "building" ? targetId : null) : null,
        departmentId: isCust ? (level === "department" ? targetId : null) : null,
        locationNote: formData.locationNote.trim() || null,
        notes: formData.notes.trim() || null,
        status: finalStatus,
        currentCounter: formData.currentCounter ? Number(formData.currentCounter) : 0,
        healthScore: Number(formData.healthScore) || 100,
        baseQuota: formData.baseQuota ? Number(formData.baseQuota) : null,
        overagePrice: formData.overagePrice ? Number(formData.overagePrice) : null,
        warrantyUntil: formData.warrantyUntil
          ? new Date(formData.warrantyUntil).toISOString()
          : null,
      };

      const res = await fetch(`/api/equipment/${equipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể cập nhật thiết bị");
        return;
      }
      toast.success("Đã cập nhật hồ sơ thiết bị");
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      show={show}
      size="xl"
      scrollable={false}
      bodyClass="p-3"
      dialogStyle={{ maxWidth: "min(1360px, 95vw)", width: "100%" }}
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-pen-to-square text-white-50"></i>
          <span className="fw-semibold">
            {equipment
              ? `Cập nhật hồ sơ thiết bị: ${formData.model || equipment.model}${
                  formData.serialNumber || equipment.serialNumber
                    ? ` (${formData.serialNumber || equipment.serialNumber})`
                    : ""
                }`
              : "Cập nhật hồ sơ thiết bị"}
          </span>
        </div>
      }
      onClose={onClose}
      footer={
        <div className="d-flex justify-content-between align-items-center w-100">
          <div
            className="d-flex align-items-center gap-1.5 text-secondary"
            style={{ fontSize: "11.5px" }}
          >
            <i className="fas fa-shield-alt text-success"></i>
            <span>Hồ sơ tự động cập nhật nhật ký &amp; lịch sử điều chuyển</span>
          </div>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm px-3.5 d-inline-flex align-items-center gap-1.5"
              onClick={onClose}
            >
              <i className="fas fa-times text-muted"></i>
              <span>Hủy</span>
            </button>
            <button
              type="submit"
              form="equipment-edit-form"
              disabled={saving}
              className="btn btn-primary btn-sm px-3.5 fw-semibold d-inline-flex align-items-center gap-1.5 shadow-sm"
            >
              {saving ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  <span>Đang lưu...</span>
                </>
              ) : (
                <>
                  <i className="fas fa-check"></i>
                  <span>Cập nhật thiết bị</span>
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <form id="equipment-edit-form" onSubmit={handleSave}>
        <div className="row g-3">
          {/* CỘT TRÁI: Nhóm 1 (Định danh & Phân loại) + Nhóm 3 (Vận hành & Định mức) */}
          <div className="col-12 col-lg-6 d-flex flex-column gap-3">
            {/* Nhóm 1: Thông tin định danh & Phân loại */}
            <div className="bg-white p-3 rounded-3 border shadow-xs">
              <div className="d-flex align-items-center gap-2 pb-2 mb-2.5 border-bottom">
                <span
                  className="badge rounded-circle bg-primary-subtle text-primary fw-bold d-inline-flex align-items-center justify-content-center"
                  style={{ width: "20px", height: "20px", fontSize: "11px" }}
                >
                  1
                </span>
                <span className="fw-semibold text-dark" style={{ fontSize: "13px" }}>
                  Định danh &amp; Phân loại thiết bị
                </span>
              </div>

              <div className="row g-2.5">
                <div className="col-sm-6">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1 d-flex align-items-center"
                    style={{ minHeight: "20px" }}
                  >
                    <span>Số Serial (S/N)</span>
                    <span className="text-secondary fw-normal ms-1">(tùy chọn)</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <span
                      className="input-group-text bg-light text-secondary"
                      style={{
                        width: "32px",
                        justifyContent: "center",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      <i className="fas fa-barcode"></i>
                    </span>
                    <input
                      type="text"
                      placeholder="VD: RC-MP6055-8821 (nếu có)"
                      className="form-control form-control-sm font-monospace"
                      value={formData.serialNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, serialNumber: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="col-sm-6">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1 d-flex align-items-center"
                    style={{ minHeight: "20px" }}
                  >
                    <span>Tên dòng máy (Model)</span>
                    <span className="text-danger ms-1">*</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <span
                      className="input-group-text bg-light text-secondary"
                      style={{
                        width: "32px",
                        justifyContent: "center",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      <i className="fas fa-tag"></i>
                    </span>
                    <input
                      type="text"
                      required
                      placeholder="VD: Ricoh MP 6055SP"
                      className="form-control form-control-sm"
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                    />
                  </div>
                </div>

                <div className="col-sm-5">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1 d-flex align-items-center"
                    style={{ minHeight: "20px" }}
                  >
                    <span>Mã quản lý</span>
                  </label>
                  <div className="input-group input-group-sm">
                    <span
                      className="input-group-text bg-light text-secondary"
                      style={{
                        width: "32px",
                        justifyContent: "center",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      <i className="fas fa-hashtag"></i>
                    </span>
                    <input
                      type="text"
                      placeholder="Tự sinh nếu trống"
                      className="form-control form-control-sm font-monospace"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    />
                  </div>
                </div>

                <div className="col-sm-7">
                  <div
                    className="d-flex justify-content-between align-items-center mb-1"
                    style={{ minHeight: "20px" }}
                  >
                    <label className="form-label small fw-semibold text-secondary mb-0">
                      Danh mục thiết bị
                    </label>
                  </div>
                  <SearchableSelect
                    value={formData.categoryId}
                    onChange={(val) => setFormData({ ...formData, categoryId: val })}
                    options={categorySelectOptions}
                    placeholder="-- Chọn danh mục --"
                    searchPlaceholder="Tìm danh mục thiết bị..."
                    menuMinWidth={360}
                    allowClear
                    prefixIcon="fas fa-sitemap"
                    renderTriggerLabel={(opt) => {
                      const node = categoriesFlat.find((c) => c.id === opt.value);
                      return (
                        <span
                          className="text-dark fw-normal text-truncate"
                          title={node ? node.fullPath : opt.label}
                        >
                          {opt.label}
                        </span>
                      );
                    }}
                  />
                </div>

                <div className="col-sm-4">
                  <div
                    className="d-flex justify-content-between align-items-center mb-1"
                    style={{ minHeight: "20px" }}
                  >
                    <label className="form-label small fw-semibold text-secondary mb-0 text-nowrap">
                      Hãng
                    </label>
                    <button
                      type="button"
                      className="btn btn-sm py-0 px-1.5 rounded-pill text-secondary bg-light border border-secondary-subtle d-inline-flex align-items-center gap-0.5 shadow-none"
                      style={{ fontSize: "10.5px", height: "19px", lineHeight: "17px" }}
                      onClick={() => setAddingCustomBrand(!addingCustomBrand)}
                    >
                      {addingCustomBrand ? "Hủy" : "+ Khác"}
                    </button>
                  </div>
                  {addingCustomBrand ? (
                    <div className="input-group input-group-sm">
                      <span
                        className="input-group-text bg-light text-secondary"
                        style={{
                          width: "32px",
                          justifyContent: "center",
                          fontSize: "12px",
                          padding: 0,
                        }}
                      >
                        <i className="fas fa-copyright"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Hãng mới..."
                        value={newBrandText}
                        onChange={(e) => setNewBrandText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleInlineAddBrand();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-2"
                        onClick={handleInlineAddBrand}
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <SearchableSelect
                      value={formData.brand}
                      onChange={(val) => setFormData({ ...formData, brand: val })}
                      options={brandOptions}
                      placeholder="-- Chọn hãng --"
                      searchPlaceholder="Tìm hãng..."
                      menuMinWidth={200}
                      allowClear
                      prefixIcon="fas fa-copyright"
                    />
                  )}
                </div>

                <div className="col-sm-4">
                  <div
                    className="d-flex justify-content-between align-items-center mb-1"
                    style={{ minHeight: "20px" }}
                  >
                    <label className="form-label small fw-semibold text-secondary mb-0 text-nowrap">
                      Loại
                    </label>
                    <button
                      type="button"
                      className="btn btn-sm py-0 px-1.5 rounded-pill text-secondary bg-light border border-secondary-subtle d-inline-flex align-items-center gap-0.5 shadow-none"
                      style={{ fontSize: "10.5px", height: "19px", lineHeight: "17px" }}
                      onClick={() => setAddingCustomType(!addingCustomType)}
                    >
                      {addingCustomType ? "Hủy" : "+ Khác"}
                    </button>
                  </div>
                  {addingCustomType ? (
                    <div className="input-group input-group-sm">
                      <span
                        className="input-group-text bg-light text-secondary"
                        style={{
                          width: "32px",
                          justifyContent: "center",
                          fontSize: "12px",
                          padding: 0,
                        }}
                      >
                        <i className="fas fa-cube"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Loại mới..."
                        value={newTypeText}
                        onChange={(e) => setNewTypeText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleInlineAddType();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-2"
                        onClick={handleInlineAddType}
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <SearchableSelect
                      value={formData.type}
                      onChange={(val) => setFormData({ ...formData, type: val })}
                      options={typeOptions}
                      placeholder="-- Loại máy --"
                      searchPlaceholder="Tìm loại máy..."
                      menuMinWidth={200}
                      prefixIcon="fas fa-cube"
                    />
                  )}
                </div>

                <div className="col-sm-4">
                  <div
                    className="d-flex justify-content-between align-items-center mb-1"
                    style={{ minHeight: "20px" }}
                  >
                    <label className="form-label small fw-semibold text-secondary mb-0 text-nowrap">
                      Nhóm
                    </label>
                    <button
                      type="button"
                      className="btn btn-sm py-0 px-1.5 rounded-pill text-secondary bg-light border border-secondary-subtle d-inline-flex align-items-center gap-0.5 shadow-none"
                      style={{ fontSize: "10.5px", height: "19px", lineHeight: "17px" }}
                      onClick={() => setAddingCustomGroup(!addingCustomGroup)}
                    >
                      {addingCustomGroup ? "Hủy" : "+ Khác"}
                    </button>
                  </div>
                  {addingCustomGroup ? (
                    <div className="input-group input-group-sm">
                      <span
                        className="input-group-text bg-light text-secondary"
                        style={{
                          width: "32px",
                          justifyContent: "center",
                          fontSize: "12px",
                          padding: 0,
                        }}
                      >
                        <i className="fas fa-layer-group"></i>
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Nhóm mới..."
                        value={newGroupText}
                        onChange={(e) => setNewGroupText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleInlineAddGroup();
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-2"
                        onClick={handleInlineAddGroup}
                      >
                        OK
                      </button>
                    </div>
                  ) : (
                    <SearchableSelect
                      value={formData.group}
                      onChange={(val) => setFormData({ ...formData, group: val })}
                      options={groupOptions}
                      placeholder="-- Nhóm máy --"
                      searchPlaceholder="Tìm nhóm máy..."
                      menuMinWidth={200}
                      prefixIcon="fas fa-layer-group"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Nhóm 3: Trạng thái vận hành & Định mức */}
            <div className="bg-white p-3 rounded-3 border shadow-xs">
              <div className="d-flex align-items-center gap-2 pb-2 mb-2.5 border-bottom">
                <span
                  className="badge rounded-circle bg-primary-subtle text-primary fw-bold d-inline-flex align-items-center justify-content-center"
                  style={{ width: "20px", height: "20px", fontSize: "11px" }}
                >
                  3
                </span>
                <span className="fw-semibold text-dark" style={{ fontSize: "13px" }}>
                  Trạng thái vận hành &amp; Định mức
                </span>
              </div>

              <div className="row g-2.5">
                <div className="col-sm-6">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1 text-nowrap"
                    style={{ minHeight: "20px" }}
                  >
                    Trạng thái máy
                  </label>
                  <SearchableSelect
                    value={formData.status}
                    onChange={(val) => setFormData({ ...formData, status: val })}
                    options={statusSelectOptions}
                    placeholder="-- Chọn trạng thái --"
                    searchPlaceholder="Tìm trạng thái..."
                    menuMinWidth={220}
                    prefixIcon="fas fa-heartbeat"
                  />
                </div>

                <div className="col-sm-6">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1 text-nowrap"
                    style={{ minHeight: "20px" }}
                  >
                    Counter hiện tại
                  </label>
                  <div className="input-group input-group-sm">
                    <span
                      className="input-group-text bg-light text-secondary"
                      style={{
                        width: "32px",
                        justifyContent: "center",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      <i className="fas fa-tachometer-alt"></i>
                    </span>
                    <input
                      type="number"
                      min={0}
                      className="form-control form-control-sm font-monospace"
                      value={formData.currentCounter}
                      onChange={(e) =>
                        setFormData({ ...formData, currentCounter: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="col-sm-6">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1 text-nowrap"
                    style={{ minHeight: "20px" }}
                  >
                    Định mức riêng (bản/tháng)
                  </label>
                  <div className="input-group input-group-sm">
                    <span
                      className="input-group-text bg-light text-secondary"
                      style={{
                        width: "32px",
                        justifyContent: "center",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      <i className="fas fa-file-invoice"></i>
                    </span>
                    <input
                      type="number"
                      min={0}
                      placeholder="Theo HĐ"
                      className="form-control form-control-sm"
                      value={formData.baseQuota}
                      onChange={(e) => setFormData({ ...formData, baseQuota: e.target.value })}
                    />
                  </div>
                </div>

                <div className="col-sm-6">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1 text-nowrap"
                    style={{ minHeight: "20px" }}
                  >
                    Giá vượt riêng (đ/bản)
                  </label>
                  <div className="input-group input-group-sm">
                    <span
                      className="input-group-text bg-light text-secondary"
                      style={{
                        width: "32px",
                        justifyContent: "center",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      <i className="fas fa-coins"></i>
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Theo HĐ"
                      className="form-control form-control-sm"
                      value={formData.overagePrice}
                      onChange={(e) =>
                        setFormData({ ...formData, overagePrice: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="col-12">
                  <label
                    className="form-label small fw-semibold text-secondary mb-1"
                    style={{ minHeight: "20px" }}
                  >
                    Ghi chú{" "}
                    {destinationMode === "WAREHOUSE" ? "kho / nguồn gốc" : "kỹ thuật & dịch vụ"}
                  </label>
                  <div className="input-group input-group-sm">
                    <span
                      className="input-group-text bg-light text-secondary"
                      style={{
                        width: "32px",
                        justifyContent: "center",
                        fontSize: "12px",
                        padding: 0,
                      }}
                    >
                      <i className="fas fa-comment-dots"></i>
                    </span>
                    <input
                      type="text"
                      placeholder={
                        destinationMode === "WAREHOUSE"
                          ? "VD: Máy nguyên kiện nhập khẩu, phụ kiện đi kèm..."
                          : "VD: Bảo trì định kỳ mỗi tháng 1 lần..."
                      }
                      className="form-control form-control-sm"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CỘT PHẢI: Nhóm 2 (Phân bổ & Điểm đặt thiết bị) */}
          <div className="col-12 col-lg-6">
            <div className="bg-white p-3 rounded-3 border shadow-xs h-100 d-flex flex-column">
              <div className="d-flex align-items-center justify-content-between pb-2 mb-2.5 border-bottom">
                <div className="d-flex align-items-center gap-2">
                  <span
                    className="badge rounded-circle bg-primary-subtle text-primary fw-bold d-inline-flex align-items-center justify-content-center"
                    style={{ width: "20px", height: "20px", fontSize: "11px" }}
                  >
                    2
                  </span>
                  <span className="fw-semibold text-dark" style={{ fontSize: "13px" }}>
                    Phân bổ &amp; Điểm đặt thiết bị
                  </span>
                </div>
                <span
                  className={`badge rounded-pill px-2.5 py-1 ${
                    destinationMode === "WAREHOUSE"
                      ? "bg-primary-subtle text-primary border border-primary-subtle"
                      : "bg-success-subtle text-success border border-success-subtle"
                  }`}
                  style={{ fontSize: "11px" }}
                >
                  <i
                    className={`fas ${
                      destinationMode === "WAREHOUSE" ? "fa-warehouse" : "fa-building"
                    } me-1`}
                  ></i>
                  {destinationMode === "WAREHOUSE"
                    ? "Lưu kho (Sẵn sàng)"
                    : "Khách hàng (Hoạt động)"}
                </span>
              </div>

              {/* Segmented Switcher */}
              <div className="btn-group w-100 p-1 bg-light rounded-2 border mb-3">
                <button
                  type="button"
                  className={`btn btn-sm fw-semibold rounded-2 py-1.5 d-flex align-items-center justify-content-center gap-2 transition-all ${
                    destinationMode === "WAREHOUSE"
                      ? "btn-primary shadow-xs"
                      : "btn-light text-secondary border-0"
                  }`}
                  style={{ fontSize: "12.5px" }}
                  onClick={() => handleDestinationChange("WAREHOUSE")}
                >
                  <i className="fas fa-warehouse"></i>
                  <span>Nhập kho lưu trữ (Sẵn sàng)</span>
                </button>
                <button
                  type="button"
                  className={`btn btn-sm fw-semibold rounded-2 py-1.5 d-flex align-items-center justify-content-center gap-2 transition-all ${
                    destinationMode === "CUSTOMER"
                      ? "btn-success shadow-xs text-white"
                      : "btn-light text-secondary border-0"
                  }`}
                  style={{ fontSize: "12.5px" }}
                  onClick={() => handleDestinationChange("CUSTOMER")}
                >
                  <i className="fas fa-building"></i>
                  <span>Gán cho khách hàng (Hoạt động)</span>
                </button>
              </div>

              {/* Nội dung theo chế độ */}
              {destinationMode === "WAREHOUSE" ? (
                <div className="p-3 rounded-2 bg-light border border-light-subtle flex-grow-1 d-flex flex-column justify-content-between">
                  <div className="row g-2.5">
                    <div className="col-12">
                      <div
                        className="d-flex justify-content-between align-items-center mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        <label className="form-label small fw-semibold text-secondary mb-0">
                          Kho lưu trữ <span className="text-danger">*</span>
                        </label>
                      </div>
                      <SearchableSelect
                        value={formData.warehouseId}
                        onChange={(val) => setFormData({ ...formData, warehouseId: val })}
                        options={warehouseSelectOptions}
                        placeholder="-- Chọn kho lưu trữ --"
                        searchPlaceholder="Tìm kho theo tên, địa chỉ..."
                        menuMinWidth={340}
                        prefixIcon="fas fa-warehouse"
                      />
                    </div>

                    <div className="col-sm-6">
                      <label
                        className="form-label small fw-semibold text-secondary mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        Vị trí trong kho
                      </label>
                      <div className="input-group input-group-sm">
                        <span
                          className="input-group-text bg-light text-secondary"
                          style={{
                            width: "32px",
                            justifyContent: "center",
                            fontSize: "12px",
                            padding: 0,
                          }}
                        >
                          <i className="fas fa-map-pin"></i>
                        </span>
                        <input
                          type="text"
                          placeholder="VD: Kệ A1, Dãy 2..."
                          className="form-control form-control-sm"
                          value={formData.locationNote}
                          onChange={(e) =>
                            setFormData({ ...formData, locationNote: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="col-sm-6">
                      <label
                        className="form-label small fw-semibold text-secondary mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        Hạn bảo hành NCC
                      </label>
                      <div className="input-group input-group-sm">
                        <span
                          className="input-group-text bg-light text-secondary"
                          style={{
                            width: "32px",
                            justifyContent: "center",
                            fontSize: "12px",
                            padding: 0,
                          }}
                        >
                          <i className="fas fa-calendar-alt"></i>
                        </span>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={formData.warrantyUntil}
                          onChange={(e) =>
                            setFormData({ ...formData, warrantyUntil: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="col-12 mt-3">
                      <div className="p-3 rounded-2 bg-white border border-secondary-subtle">
                        <div
                          className="d-flex align-items-center gap-1.5 text-primary fw-semibold mb-2"
                          style={{ fontSize: "12px" }}
                        >
                          <i className="fas fa-clipboard-check text-primary"></i>
                          <span>Quy chuẩn thiết bị lưu kho &amp; Sẵn sàng bàn giao</span>
                        </div>
                        <div
                          className="d-flex flex-column gap-2 text-muted"
                          style={{ fontSize: "11.5px" }}
                        >
                          <div className="d-flex align-items-start gap-2">
                            <i
                              className="fas fa-check-circle text-success mt-0.5 flex-shrink-0"
                              style={{ fontSize: "11px" }}
                            ></i>
                            <span>
                              Thiết bị ở trạng thái <strong>Sẵn sàng (Kho)</strong>, không gắn
                              hợp đồng hay phát sinh dịch vụ.
                            </span>
                          </div>
                          <div className="d-flex align-items-start gap-2">
                            <i
                              className="fas fa-check-circle text-success mt-0.5 flex-shrink-0"
                              style={{ fontSize: "11px" }}
                            ></i>
                            <span>
                              Ghi rõ vị trí kệ/dãy kho để kỹ thuật viên xuất kho hoặc kiểm kê
                              tài sản nhanh chóng.
                            </span>
                          </div>
                          <div className="d-flex align-items-start gap-2">
                            <i
                              className="fas fa-shield-alt text-info mt-0.5 flex-shrink-0"
                              style={{ fontSize: "11px" }}
                            ></i>
                            <span>
                              Theo dõi hạn bảo hành NCC phục vụ chính sách đổi trả hoặc bảo hành
                              linh kiện chính hãng.
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-2 bg-light border border-light-subtle flex-grow-1">
                  <div className="row g-2.5">
                    <div className="col-sm-7">
                      <label
                        className="form-label small fw-semibold text-secondary mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        Khách hàng nhận máy <span className="text-danger">*</span>
                      </label>
                      <SearchableSelect
                        value={formData.customerId}
                        onChange={(val) => {
                          setFormData({
                            ...formData,
                            customerId: val,
                            contractId: "",
                            departmentId: "",
                          });
                          loadCustomerDepartments(val);
                        }}
                        options={customerSelectOptions}
                        placeholder="-- Chọn khách hàng --"
                        searchPlaceholder="Tìm khách hàng..."
                        menuMinWidth={340}
                        prefixIcon="fas fa-building"
                      />
                    </div>

                    <div className="col-sm-5">
                      <div
                        className="d-flex justify-content-between align-items-center mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        <label className="form-label small fw-semibold text-secondary mb-0">
                          Hình thức <span className="text-danger">*</span>
                        </label>
                        <button
                          type="button"
                          className="btn btn-sm py-0 px-1.5 rounded-pill text-secondary bg-light border border-secondary-subtle d-inline-flex align-items-center gap-1 shadow-none"
                          style={{ fontSize: "11px", height: "20px", lineHeight: "18px" }}
                          onClick={() => setAddingCustomRelation(!addingCustomRelation)}
                        >
                          {addingCustomRelation ? (
                            <>
                              <i className="fas fa-times" style={{ fontSize: "9px" }}></i>
                              <span>Hủy</span>
                            </>
                          ) : (
                            <>
                              <i className="fas fa-plus" style={{ fontSize: "9px" }}></i>
                              <span>Khác</span>
                            </>
                          )}
                        </button>
                      </div>
                      {addingCustomRelation ? (
                        <div className="input-group input-group-sm">
                          <span
                            className="input-group-text bg-light text-secondary"
                            style={{
                              width: "32px",
                              justifyContent: "center",
                              fontSize: "12px",
                              padding: 0,
                            }}
                          >
                            <i className="fas fa-handshake"></i>
                          </span>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Hình thức..."
                            value={newRelationText}
                            onChange={(e) => setNewRelationText(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm px-2"
                            onClick={() => {
                              if (newRelationText.trim()) {
                                const v = newRelationText.trim();
                                setCustomRelations((prev) => [...prev, v]);
                                setFormData({ ...formData, relationType: v });
                                setNewRelationText("");
                                setAddingCustomRelation(false);
                              }
                            }}
                          >
                            OK
                          </button>
                        </div>
                      ) : (
                        <SearchableSelect
                          value={formData.relationType}
                          onChange={(val) => setFormData({ ...formData, relationType: val })}
                          options={relationOptions}
                          placeholder="-- Hình thức --"
                          searchPlaceholder="Tìm hình thức..."
                          alignMenu="right"
                          menuMinWidth={200}
                          prefixIcon="fas fa-handshake"
                        />
                      )}
                    </div>

                    <div className="col-sm-6">
                      <label
                        className="form-label small fw-semibold text-secondary mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        Hợp đồng áp dụng
                      </label>
                      <SearchableSelect
                        value={formData.contractId}
                        onChange={(val) => setFormData({ ...formData, contractId: val })}
                        options={contractSelectOptions}
                        placeholder="-- Không gắn HĐ / Dịch vụ lẻ --"
                        searchPlaceholder="Tìm hợp đồng..."
                        menuMinWidth={320}
                        allowClear
                        prefixIcon="fas fa-file-signature"
                      />
                    </div>

                    <div className="col-sm-6">
                      <label
                        className="form-label small fw-semibold text-secondary mb-1 text-truncate"
                        style={{ minHeight: "20px" }}
                        title="Vị trí lắp đặt (Sơ đồ tổ chức - Mọi cấp)"
                      >
                        Vị trí (Phòng ban / Điểm đặt)
                      </label>
                      <SearchableSelect
                        value={formData.departmentId}
                        onChange={(val) => setFormData({ ...formData, departmentId: val })}
                        options={departmentSelectOptions}
                        placeholder="-- Chọn vị trí lắp đặt --"
                        searchPlaceholder="Tìm phòng ban / điểm đặt..."
                        alignMenu="right"
                        menuMinWidth={320}
                        allowClear
                        prefixIcon="fas fa-sitemap"
                      />
                    </div>

                    <div className="col-sm-7">
                      <label
                        className="form-label small fw-semibold text-secondary mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        Vị trí cụ thể tại khách hàng
                      </label>
                      <div className="input-group input-group-sm">
                        <span
                          className="input-group-text bg-light text-secondary"
                          style={{
                            width: "32px",
                            justifyContent: "center",
                            fontSize: "12px",
                            padding: 0,
                          }}
                        >
                          <i className="fas fa-map-marker-alt"></i>
                        </span>
                        <input
                          type="text"
                          placeholder="VD: Cạnh phòng họp lầu 2..."
                          className="form-control form-control-sm"
                          value={formData.locationNote}
                          onChange={(e) =>
                            setFormData({ ...formData, locationNote: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="col-sm-5">
                      <label
                        className="form-label small fw-semibold text-secondary mb-1"
                        style={{ minHeight: "20px" }}
                      >
                        Hạn bảo hành / bảo trì
                      </label>
                      <div className="input-group input-group-sm">
                        <span
                          className="input-group-text bg-light text-secondary"
                          style={{
                            width: "32px",
                            justifyContent: "center",
                            fontSize: "12px",
                            padding: 0,
                          }}
                        >
                          <i className="fas fa-calendar-check"></i>
                        </span>
                        <input
                          type="date"
                          className="form-control form-control-sm"
                          value={formData.warrantyUntil}
                          onChange={(e) =>
                            setFormData({ ...formData, warrantyUntil: e.target.value })
                          }
                        />
                      </div>
                    </div>

                    <div className="col-12 mt-2">
                      <div
                        className="px-3 py-2 rounded-2 bg-success-subtle border border-success-subtle d-flex align-items-center gap-2 text-success-emphasis"
                        style={{ fontSize: "12px" }}
                      >
                        <i className="fas fa-info-circle flex-shrink-0 text-success"></i>
                        <span>
                          Máy sẽ tự động đồng bộ trạng thái <strong>Đang hoạt động</strong> khi
                          được gán vào khách hàng.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </form>
    </ModalShell>
  );
}
