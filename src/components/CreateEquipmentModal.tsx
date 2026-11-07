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
  directEquipmentCount: number;
  totalEquipmentCount: number;
  children?: CategoryNode[];
}

interface WarehouseItem {
  id: string;
  code: string | null;
  name: string;
  address: string | null;
  managerName: string | null;
  managerPhone: string | null;
  isDefault: boolean;
  isActive: boolean;
  notes: string | null;
  sortOrder: number;
  equipmentCount?: number;
}

interface ContractOption {
  id: string;
  code: string;
  customerId: string;
  customer: { id: string; name: string };
}

interface DepartmentOption {
  id: string;
  label: string;
}

export interface CreatedEquipmentResult {
  id: string;
  code?: string | null;
  serialNumber?: string | null;
  model: string;
  brand?: string | null;
  type?: string | null;
  group?: string | null;
  relationType?: string | null;
  status: string;
  currentCounter: number;
  locationNote?: string | null;
  branchId?: string | null;
  buildingId?: string | null;
  departmentId?: string | null;
  branch?: { id: string; name: string; address?: string | null } | null;
  building?: { id: string; name: string; branch?: { name: string } | null } | null;
  department?: {
    id: string;
    name: string;
    building?: { name: string; branch?: { name: string } | null } | null;
  } | null;
}

interface CreateEquipmentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (equipment: CreatedEquipmentResult) => void;
  initialCustomerId?: string;
  initialCustomerGroup?: string | null;
  initialModel?: string;
  customersList?: Array<{ id: string; name: string }>;
}

export function CreateEquipmentModal({
  open,
  onClose,
  onSuccess,
  initialCustomerId,
  initialCustomerGroup,
  initialModel,
  customersList = [],
}: CreateEquipmentModalProps) {
  const [saving, setSaving] = useState(false);
  const [destinationMode, setDestinationMode] = useState<"WAREHOUSE" | "CUSTOMER">(
    initialCustomerId ? "CUSTOMER" : "WAREHOUSE"
  );

  // Danh mục, Hãng, Loại, Nhóm, Kho, Hợp đồng, Khách hàng, Phòng ban
  const [categoriesFlat, setCategoriesFlat] = useState<CategoryNode[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<CategoryNode[]>([]);
  const [dbBrands, setDbBrands] = useState<Array<{ id: string; name: string }>>([]);
  const [dbTypes, setDbTypes] = useState<Array<{ id: string; name: string }>>([]);
  const [dbGroups, setDbGroups] = useState<Array<{ id: string; name: string }>>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>(customersList);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);

  // Inline custom additions (+ Khác)
  const [addingCustomBrand, setAddingCustomBrand] = useState(false);
  const [newBrandText, setNewBrandText] = useState("");
  const [customBrands, setCustomBrands] = useState<string[]>([]);

  const [addingCustomType, setAddingCustomType] = useState(false);
  const [newTypeText, setNewTypeText] = useState("");
  const [customTypes, setCustomTypes] = useState<string[]>([]);

  const [addingCustomGroup, setAddingCustomGroup] = useState(false);
  const [newGroupText, setNewGroupText] = useState("");
  const [customGroups, setCustomGroups] = useState<string[]>([]);

  const [addingCustomRelation, setAddingCustomRelation] = useState(false);
  const [newRelationText, setNewRelationText] = useState("");
  const [customRelations, setCustomRelations] = useState<string[]>([]);

  // Sub-modals: Cây danh mục & Quản lý kho
  const [showCatModal, setShowCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryNode | null>(null);
  const [catSaving, setCatSaving] = useState(false);
  const [catSearch, setCatSearch] = useState("");
  const [collapsedCatIds, setCollapsedCatIds] = useState<Record<string, boolean>>({});
  const [catForm, setCatForm] = useState({
    code: "",
    name: "",
    description: "",
    parentId: "",
    sortOrder: "0",
  });

  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseItem | null>(null);
  const [warehouseSaving, setWarehouseSaving] = useState(false);
  const [warehouseForm, setWarehouseForm] = useState({
    code: "",
    name: "",
    address: "",
    managerName: "",
    managerPhone: "",
    isDefault: false,
    isActive: true,
    notes: "",
    sortOrder: "0",
  });

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

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/equipment-categories");
      if (res.ok) {
        const d = await res.json();
        setCategoriesFlat(d.flat || []);
        setCategoriesTree(d.tree || []);
        return (d.flat || []) as CategoryNode[];
      }
    } catch {
      // ignore
    }
    return [] as CategoryNode[];
  }, []);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await fetch("/api/warehouses");
      if (res.ok) {
        const d = await res.json();
        setWarehouses(d.warehouses || []);
        return (d.warehouses || []) as WarehouseItem[];
      }
    } catch {
      // ignore
    }
    return [] as WarehouseItem[];
  }, []);

  const loadEquipmentBrands = useCallback(async () => {
    try {
      const res = await fetch("/api/equipment-brands");
      if (res.ok) {
        const d = await res.json();
        setDbBrands(d.brands || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadEquipmentTypes = useCallback(async () => {
    try {
      const res = await fetch("/api/equipment-types");
      if (res.ok) {
        const d = await res.json();
        setDbTypes(d.types || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadEquipmentGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/equipment-groups");
      if (res.ok) {
        const d = await res.json();
        setDbGroups(d.groups || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    let isMounted = true;

    const isCust = Boolean(initialCustomerId);
    const defaultRel = !isCust
      ? "Sẵn hàng"
      : initialCustomerGroup === "Khách mua máy"
      ? "Bảo hành máy bán"
      : "Cho thuê";

    setDestinationMode(isCust ? "CUSTOMER" : "WAREHOUSE");
    setAddingCustomBrand(false);
    setAddingCustomType(false);
    setAddingCustomGroup(false);
    setAddingCustomRelation(false);

    setFormData({
      code: "",
      serialNumber: "",
      model: initialModel?.trim() || "",
      brand: "Ricoh",
      type: "Máy Photocopy",
      group: "Máy văn phòng",
      relationType: defaultRel,
      categoryId: "",
      warehouseId: "",
      customerId: initialCustomerId || "",
      contractId: "",
      departmentId: "",
      locationNote: "",
      notes: "",
      status: isCust ? "ACTIVE" : "IN_STOCK",
      currentCounter: "0",
      baseQuota: "",
      overagePrice: "",
      warrantyUntil: "",
    });

    if (initialCustomerId) {
      loadCustomerDepartments(initialCustomerId);
    } else {
      setDepartments([]);
    }

    Promise.all([
      loadCategories(),
      loadWarehouses(),
      loadEquipmentBrands(),
      loadEquipmentTypes(),
      loadEquipmentGroups(),
      fetch("/api/contracts?pageSize=100").then((r) => (r.ok ? r.json() : null)),
      customersList.length > 0
        ? Promise.resolve({ items: customersList })
        : fetch("/api/customers?pageSize=500").then((r) => (r.ok ? r.json() : null)),
    ]).then(([flatCats, whList, , , , ctData, custData]) => {
      if (!isMounted) return;
      if (ctData?.items) setContracts(ctData.items);
      if (custData?.items) setCustomers(custData.items);
      setFormData((prev) => ({
        ...prev,
        categoryId: prev.categoryId || flatCats[0]?.id || "",
        warehouseId:
          isCust
            ? ""
            : prev.warehouseId || whList.find((w) => w.isDefault)?.id || whList[0]?.id || "",
      }));
    });

    return () => {
      isMounted = false;
    };
  }, [
    open,
    initialCustomerId,
    initialCustomerGroup,
    initialModel,
    customersList,
    loadCategories,
    loadWarehouses,
    loadEquipmentBrands,
    loadEquipmentTypes,
    loadEquipmentGroups,
    loadCustomerDepartments,
  ]);

  const handleDestinationChange = (mode: "WAREHOUSE" | "CUSTOMER") => {
    setDestinationMode(mode);
    if (mode === "WAREHOUSE") {
      setFormData((prev) => ({
        ...prev,
        customerId: "",
        contractId: "",
        departmentId: "",
        warehouseId:
          prev.warehouseId || warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || "",
        status: prev.status === "ACTIVE" ? "IN_STOCK" : prev.status,
        relationType: "Sẵn hàng",
      }));
      setDepartments([]);
    } else {
      const targetCustomerId = formData.customerId || initialCustomerId || "";
      setFormData((prev) => ({
        ...prev,
        customerId: targetCustomerId,
        warehouseId: "",
        status: prev.status === "IN_STOCK" ? "ACTIVE" : prev.status,
        relationType:
          prev.relationType === "Sẵn hàng" ? "Cho thuê" : prev.relationType || "Cho thuê",
      }));
      if (targetCustomerId) {
        loadCustomerDepartments(targetCustomerId);
      }
    }
  };

  // Options
  const brandOptions = useMemo(() => {
    const fromDb = dbBrands.map((b) => b.name);
    return Array.from(new Set([...fromDb, ...DEFAULT_EQUIPMENT_BRANDS, ...customBrands])).filter(
      Boolean
    );
  }, [dbBrands, customBrands]);

  const typeOptions = useMemo(() => {
    const fromDb = dbTypes.map((t) => t.name);
    return Array.from(new Set([...fromDb, ...DEFAULT_EQUIPMENT_TYPES, ...customTypes])).filter(
      Boolean
    );
  }, [dbTypes, customTypes]);

  const groupOptions = useMemo(() => {
    const fromDb = dbGroups.map((g) => g.name);
    return Array.from(new Set([...fromDb, ...DEFAULT_EQUIPMENT_GROUPS, ...customGroups])).filter(
      Boolean
    );
  }, [dbGroups, customGroups]);

  const relationOptions = useMemo(() => {
    return Array.from(new Set([...DEFAULT_EQUIPMENT_RELATIONS, ...customRelations])).filter(
      Boolean
    );
  }, [customRelations]);

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
      label: `${ct.code} - ${ct.customer.name}`,
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

  // Inline +Khác handlers
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
        await loadEquipmentBrands();
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
        await loadEquipmentTypes();
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
        await loadEquipmentGroups();
      }
    } catch {
      // ignore
    }
    setCustomGroups((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setFormData((prev) => ({ ...prev, group: v }));
    setNewGroupText("");
    setAddingCustomGroup(false);
  };

  // Lưu thiết bị
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
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
        serialNumber: formData.serialNumber.trim() || undefined,
        code: formData.code.trim() || undefined,
        model: formData.model.trim(),
        brand: formData.brand.trim() || undefined,
        type: formData.type.trim() || "Máy Photocopy",
        group: formData.group.trim() || "Máy văn phòng",
        relationType: isCust ? formData.relationType.trim() || "Cho thuê" : "Sẵn hàng",
        categoryId: formData.categoryId || undefined,
        warehouseId: destinationMode === "WAREHOUSE" ? formData.warehouseId || undefined : null,
        customerId: isCust ? formData.customerId || undefined : null,
        contractId: isCust ? formData.contractId || undefined : null,
        branchId: isCust ? (level === "branch" ? targetId : undefined) : null,
        buildingId: isCust ? (level === "building" ? targetId : undefined) : null,
        departmentId: isCust ? (level === "department" ? targetId : undefined) : null,
        locationNote: formData.locationNote.trim() || undefined,
        notes: formData.notes.trim() || undefined,
        status: finalStatus,
        currentCounter: formData.currentCounter ? Number(formData.currentCounter) : 0,
        baseQuota: formData.baseQuota ? Number(formData.baseQuota) : undefined,
        overagePrice: formData.overagePrice ? Number(formData.overagePrice) : undefined,
        warrantyUntil: formData.warrantyUntil
          ? new Date(formData.warrantyUntil).toISOString()
          : undefined,
      };

      const res = await fetch("/api/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu thiết bị");
        return;
      }

      toast.success("Đã thêm thiết bị mới");
      onSuccess?.(data as CreatedEquipmentResult);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  // Quản lý Cây Danh mục Đa cấp
  const openCategoryManager = (parentNode?: CategoryNode | null) => {
    setEditingCat(null);
    setCatSearch("");
    setCatForm({
      code: "",
      name: "",
      description: "",
      parentId: parentNode?.id || "",
      sortOrder: "0",
    });
    setShowCatModal(true);
  };

  const resetCatForm = (parentId = "") => {
    setEditingCat(null);
    setCatForm({
      code: "",
      name: "",
      description: "",
      parentId,
      sortOrder: "0",
    });
  };

  const activeParentNode = useMemo(() => {
    if (!catForm.parentId) return null;
    return categoriesFlat.find((c) => c.id === catForm.parentId) || null;
  }, [catForm.parentId, categoriesFlat]);

  const parentCategorySelectOptions = useMemo(() => {
    const list = categoriesFlat
      .filter((c) => !editingCat || c.id !== editingCat.id)
      .map((c) => ({
        value: c.id,
        label: c.name,
        level: Math.max(0, c.level - 1),
      }));
    return [{ value: "", label: "-- Danh mục gốc --", level: 0 }, ...list];
  }, [categoriesFlat, editingCat]);

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catForm.name.trim()) {
      toast.warning("Vui lòng nhập tên danh mục");
      return;
    }
    setCatSaving(true);
    try {
      const url = editingCat
        ? `/api/equipment-categories/${editingCat.id}`
        : "/api/equipment-categories";
      const method = editingCat ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: catForm.code.trim() || null,
          name: catForm.name.trim(),
          description: catForm.description.trim() || null,
          parentId: catForm.parentId || null,
          sortOrder: Number(catForm.sortOrder) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu danh mục");
        return;
      }
      toast.success(editingCat ? "Đã cập nhật danh mục" : "Đã tạo danh mục mới");
      resetCatForm(editingCat ? "" : catForm.parentId);
      await loadCategories();
      if (data.id && !editingCat) {
        setFormData((prev) => ({ ...prev, categoryId: data.id }));
      }
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (node: CategoryNode) => {
    if (!confirm(`Bạn có chắc muốn xóa danh mục "${node.name}"?`)) return;
    const res = await fetch(`/api/equipment-categories/${node.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa danh mục");
      return;
    }
    toast.success(`Đã xóa danh mục "${node.name}"`);
    await loadCategories();
  };

  const renderCategoryTreeNodes = (nodes: CategoryNode[]) => {
    const searchTerm = catSearch.trim().toLowerCase();
    return (
      <div className="d-flex flex-column gap-1">
        {nodes.map((node) => {
          const hasChildren = Boolean(node.children && node.children.length > 0);
          const isEditingThis = editingCat?.id === node.id;
          const isSelectedParent = !editingCat && catForm.parentId === node.id;
          const isCollapsed = !searchTerm && Boolean(collapsedCatIds[node.id]);

          return (
            <div key={node.id} className="category-tree-node">
              <div
                className={`d-flex justify-content-between align-items-center py-1.5 px-2 rounded border transition-all ${
                  isEditingThis
                    ? "bg-primary-subtle border-primary text-primary-emphasis shadow-sm"
                    : isSelectedParent
                    ? "bg-success-subtle border-success text-success-emphasis"
                    : "bg-white border-light-subtle"
                }`}
                style={{ fontSize: "13px" }}
              >
                <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1 me-2">
                  {hasChildren ? (
                    <button
                      type="button"
                      className="btn btn-sm p-0 text-secondary border-0 d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: "20px", height: "20px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCollapsedCatIds((prev) => ({ ...prev, [node.id]: !prev[node.id] }));
                      }}
                    >
                      <i
                        className={`fas fa-chevron-${isCollapsed ? "right" : "down"}`}
                        style={{ fontSize: "11px" }}
                      ></i>
                    </button>
                  ) : (
                    <span
                      className="d-inline-flex align-items-center justify-content-center text-muted opacity-40 flex-shrink-0"
                      style={{ width: "20px", height: "20px" }}
                    >
                      <i className="fas fa-circle" style={{ fontSize: "4px" }}></i>
                    </span>
                  )}
                  <span className="text-truncate fw-semibold text-dark">{node.name}</span>
                  <span
                    className="badge bg-light text-secondary border flex-shrink-0"
                    style={{ fontSize: "11px", fontWeight: 500 }}
                  >
                    {node.totalEquipmentCount} máy
                  </span>
                </div>
                <div className="d-flex align-items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success py-0 px-2"
                    style={{ fontSize: "11px", height: "24px" }}
                    onClick={() => {
                      setEditingCat(null);
                      setCatForm({
                        code: "",
                        name: "",
                        description: "",
                        parentId: node.id,
                        sortOrder: "0",
                      });
                    }}
                  >
                    <i className="fas fa-plus"></i>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary py-0 px-2"
                    style={{ fontSize: "11px", height: "24px" }}
                    onClick={() => {
                      setEditingCat(node);
                      setCatForm({
                        code: node.code || "",
                        name: node.name,
                        description: node.description || "",
                        parentId: node.parentId || "",
                        sortOrder: String(node.sortOrder ?? 0),
                      });
                    }}
                  >
                    <i className="fas fa-pen"></i>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger py-0 px-2"
                    style={{ fontSize: "11px", height: "24px" }}
                    onClick={() => handleDeleteCategory(node)}
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>
              {hasChildren && !isCollapsed && (
                <div
                  className="ps-2 ms-2 my-1"
                  style={{ borderLeft: "2px solid rgba(13, 110, 253, 0.2)" }}
                >
                  {renderCategoryTreeNodes(node.children!)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Quản lý Kho bãi
  const openWarehouseManager = () => {
    setEditingWarehouse(null);
    setWarehouseForm({
      code: "",
      name: "",
      address: "",
      managerName: "",
      managerPhone: "",
      isDefault: false,
      isActive: true,
      notes: "",
      sortOrder: "0",
    });
    setShowWarehouseModal(true);
  };

  const handleSaveWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseForm.name.trim()) {
      toast.warning("Vui lòng nhập tên kho");
      return;
    }
    setWarehouseSaving(true);
    try {
      const url = editingWarehouse
        ? `/api/warehouses/${editingWarehouse.id}`
        : "/api/warehouses";
      const method = editingWarehouse ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: warehouseForm.code.trim() || null,
          name: warehouseForm.name.trim(),
          address: warehouseForm.address.trim() || null,
          managerName: warehouseForm.managerName.trim() || null,
          managerPhone: warehouseForm.managerPhone.trim() || null,
          isDefault: warehouseForm.isDefault,
          isActive: warehouseForm.isActive,
          notes: warehouseForm.notes.trim() || null,
          sortOrder: Number(warehouseForm.sortOrder) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu kho");
        return;
      }
      toast.success(editingWarehouse ? "Đã cập nhật kho" : "Đã tạo kho mới");
      setEditingWarehouse(null);
      setWarehouseForm({
        code: "",
        name: "",
        address: "",
        managerName: "",
        managerPhone: "",
        isDefault: false,
        isActive: true,
        notes: "",
        sortOrder: "0",
      });
      await loadWarehouses();
      if (data.id && !editingWarehouse) {
        setFormData((prev) => ({ ...prev, warehouseId: data.id }));
      }
    } finally {
      setWarehouseSaving(false);
    }
  };

  return (
    <>
      <ModalShell
        show={open}
        size="xl"
        scrollable={false}
        bodyClass="p-3"
        dialogStyle={{ maxWidth: "min(1360px, 95vw)", width: "100%" }}
        title={
          <div className="d-flex align-items-center gap-2">
            <i className="fas fa-plus-circle text-white-50"></i>
            <span className="fw-semibold">Thêm hồ sơ thiết bị mới</span>
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
                form="ticket-create-equipment-form"
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
                    <span>Lưu thiết bị</span>
                  </>
                )}
              </button>
            </div>
          </div>
        }
      >
        <form id="ticket-create-equipment-form" onSubmit={handleSave}>
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
                      <button
                        type="button"
                        className="btn btn-sm py-0 px-2 rounded-pill text-primary bg-primary-subtle border border-primary-subtle d-inline-flex align-items-center gap-1 shadow-none"
                        style={{ fontSize: "11px", height: "20px", lineHeight: "18px" }}
                        onClick={() => openCategoryManager(null)}
                      >
                        <i className="fas fa-sitemap" style={{ fontSize: "10px" }}></i>
                        <span>Cây danh mục</span>
                      </button>
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
                      {destinationMode === "WAREHOUSE"
                        ? "kho / nguồn gốc"
                        : "kỹ thuật & dịch vụ"}
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

                {/* Segmented Switcher gọn gàng */}
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
                          <button
                            type="button"
                            className="btn btn-sm py-0 px-2 rounded-pill text-primary bg-primary-subtle border border-primary-subtle d-inline-flex align-items-center gap-1 shadow-none"
                            style={{ fontSize: "11px", height: "20px", lineHeight: "18px" }}
                            onClick={openWarehouseManager}
                          >
                            <i className="fas fa-boxes-stacked" style={{ fontSize: "10px" }}></i>
                            <span>Quản lý kho</span>
                          </button>
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
                                Theo dõi hạn bảo hành NCC phục vụ chính sách đổi trả hoặc bảo
                                hành linh kiện chính hãng.
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
                            Máy sẽ tự động đồng bộ trạng thái <strong>Đang hoạt động</strong>{" "}
                            khi được gán vào khách hàng.
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

      {/* Modal Quản lý Cây Danh mục Thiết bị Đa cấp */}
      <ModalShell
        show={showCatModal}
        size="lg"
        dialogStyle={{ maxWidth: "980px" }}
        title="Quản lý Cây danh mục thiết bị"
        onClose={() => setShowCatModal(false)}
        footer={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowCatModal(false)}
          >
            Đóng
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-md-5">
            <div className="bg-light p-3 rounded border h-100 d-flex flex-column">
              <div className="d-flex justify-content-between align-items-center mb-2.5 pb-2 border-bottom">
                <div>
                  {editingCat ? (
                    <>
                      <div
                        className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle mb-1"
                        style={{ fontSize: "10.5px" }}
                      >
                        <i className="fas fa-pen me-1"></i>Đang sửa danh mục
                      </div>
                      <div
                        className="fw-bold text-dark text-truncate"
                        style={{ maxWidth: "220px" }}
                      >
                        {editingCat.name}
                      </div>
                    </>
                  ) : activeParentNode ? (
                    <>
                      <div
                        className="badge bg-success-subtle text-success border border-success-subtle mb-1"
                        style={{ fontSize: "10.5px" }}
                      >
                        <i className="fas fa-plus me-1"></i>Thêm danh mục con
                      </div>
                      <div
                        className="small text-muted text-truncate"
                        style={{ maxWidth: "220px" }}
                      >
                        Thuộc: <strong className="text-dark">{activeParentNode.name}</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <div
                        className="badge bg-primary-subtle text-primary border border-primary-subtle mb-1"
                        style={{ fontSize: "10.5px" }}
                      >
                        <i className="fas fa-folder-plus me-1"></i>Tạo danh mục mới
                      </div>
                      <div className="fw-bold text-dark">Danh mục gốc</div>
                    </>
                  )}
                </div>
                {(editingCat || activeParentNode) && (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-secondary py-1 px-2"
                    style={{ fontSize: "11px" }}
                    onClick={() => resetCatForm("")}
                  >
                    <i className="fas fa-undo me-1"></i>Về gốc
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveCategory} className="flex-grow-1 d-flex flex-column">
                <div className="mb-2">
                  <label className="form-label small fw-bold text-muted mb-1">
                    DANH MỤC CHA
                  </label>
                  <SearchableSelect
                    value={catForm.parentId}
                    onChange={(val) => setCatForm({ ...catForm, parentId: val })}
                    options={parentCategorySelectOptions}
                    placeholder="-- Danh mục gốc --"
                    searchPlaceholder="Tìm danh mục cha..."
                    allowClear
                    prefixIcon="fas fa-sitemap"
                    menuMinWidth={300}
                  />
                </div>

                <div className="mb-2">
                  <label className="form-label small fw-bold text-muted mb-1">
                    TÊN DANH MỤC <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Máy Photocopy Màu"
                    className="form-control form-control-sm"
                    value={catForm.name}
                    onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                  />
                </div>

                <div className="row g-2 mb-2">
                  <div className="col-5">
                    <label className="form-label small fw-bold text-muted mb-1">THỨ TỰ</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      placeholder="0"
                      value={catForm.sortOrder}
                      onChange={(e) => setCatForm({ ...catForm, sortOrder: e.target.value })}
                    />
                  </div>
                  <div className="col-7">
                    <label className="form-label small fw-bold text-muted mb-1">
                      MÃ <span className="text-muted fw-normal">(Tùy chọn)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="VD: PHOTO-COLOR"
                      className="form-control form-control-sm font-monospace"
                      value={catForm.code}
                      onChange={(e) => setCatForm({ ...catForm, code: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-bold text-muted mb-1">
                    MÔ TẢ <span className="text-muted fw-normal">(Tùy chọn)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ghi chú về nhóm thiết bị này..."
                    className="form-control form-control-sm"
                    value={catForm.description}
                    onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
                  />
                </div>

                <div className="mt-auto pt-2 d-flex gap-2">
                  <button
                    type="submit"
                    disabled={catSaving}
                    className="btn btn-primary btn-sm flex-grow-1 fw-bold"
                  >
                    {catSaving
                      ? "Đang lưu..."
                      : editingCat
                      ? "Cập nhật danh mục"
                      : activeParentNode
                      ? "Thêm vào nhánh này"
                      : "Thêm danh mục gốc"}
                  </button>
                  {(editingCat || activeParentNode) && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => resetCatForm("")}
                    >
                      Hủy
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          <div className="col-md-7">
            <div
              className="border rounded p-2.5 bg-light h-100 d-flex flex-column"
              style={{ minHeight: "420px" }}
            >
              <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                <div className="d-flex align-items-center gap-1.5">
                  <i className="fas fa-sitemap text-primary"></i>
                  <span className="small fw-bold text-dark">Cây danh mục</span>
                  <span
                    className="badge bg-secondary-subtle text-secondary border"
                    style={{ fontSize: "11px" }}
                  >
                    {categoriesFlat.length} danh mục
                  </span>
                </div>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-primary py-1 px-2 fw-semibold"
                  style={{ fontSize: "11px" }}
                  onClick={() => resetCatForm("")}
                >
                  <i className="fas fa-plus me-1"></i>Thêm danh mục gốc
                </button>
              </div>
              <div
                className="flex-grow-1 bg-white border rounded p-2"
                style={{ maxHeight: "410px", overflowY: "auto" }}
              >
                {categoriesTree.length === 0 ? (
                  <div className="text-center py-5 text-muted small">
                    Chưa có danh mục nào. Hãy tạo danh mục gốc bên trái.
                  </div>
                ) : (
                  renderCategoryTreeNodes(categoriesTree)
                )}
              </div>
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Modal Quản lý Kho bãi */}
      <ModalShell
        show={showWarehouseModal}
        size="lg"
        title="Kho bãi"
        onClose={() => setShowWarehouseModal(false)}
        footer={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowWarehouseModal(false)}
          >
            Đóng
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-md-5">
            <div className="bg-light p-3 rounded border h-100">
              <strong className="small text-uppercase text-dark d-block mb-2">
                {editingWarehouse ? `Sửa kho: ${editingWarehouse.name}` : "Tạo kho mới"}
              </strong>
              <form onSubmit={handleSaveWarehouse}>
                <div className="mb-2">
                  <label className="form-label small fw-bold text-muted mb-1">
                    TÊN KHO <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Kho Tổng TP.HCM..."
                    className="form-control form-control-sm"
                    value={warehouseForm.name}
                    onChange={(e) =>
                      setWarehouseForm({ ...warehouseForm, name: e.target.value })
                    }
                  />
                </div>
                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted mb-1">MÃ KHO</label>
                    <input
                      type="text"
                      placeholder="VD: KHO-TONG"
                      className="form-control form-control-sm font-monospace"
                      value={warehouseForm.code}
                      onChange={(e) =>
                        setWarehouseForm({ ...warehouseForm, code: e.target.value })
                      }
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted mb-1">THỨ TỰ</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={warehouseForm.sortOrder}
                      onChange={(e) =>
                        setWarehouseForm({ ...warehouseForm, sortOrder: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-bold text-muted mb-1">ĐỊA CHỈ KHO</label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    value={warehouseForm.address}
                    onChange={(e) =>
                      setWarehouseForm({ ...warehouseForm, address: e.target.value })
                    }
                  />
                </div>
                <div className="mb-3">
                  <div className="form-check form-switch mt-1">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="ticketWhDefaultSwitch"
                      checked={warehouseForm.isDefault}
                      onChange={(e) =>
                        setWarehouseForm({ ...warehouseForm, isDefault: e.target.checked })
                      }
                    />
                    <label
                      className="form-check-label small fw-semibold text-dark"
                      htmlFor="ticketWhDefaultSwitch"
                    >
                      Đặt làm Kho mặc định
                    </label>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={warehouseSaving}
                  className="btn btn-warning btn-sm w-100 fw-bold text-dark"
                >
                  {warehouseSaving
                    ? "Đang lưu..."
                    : editingWarehouse
                    ? "Cập nhật kho"
                    : "Tạo kho mới"}
                </button>
              </form>
            </div>
          </div>
          <div className="col-md-7">
            <div
              className="border rounded p-2.5 bg-white h-100"
              style={{ maxHeight: "420px", overflowY: "auto" }}
            >
              <span className="small fw-bold text-dark d-block mb-2 pb-1 border-bottom">
                <i className="fas fa-warehouse me-1 text-warning"></i>
                Danh sách Kho bãi công ty ({warehouses.length})
              </span>
              {warehouses.map((w) => (
                <div
                  key={w.id}
                  className="d-flex justify-content-between align-items-center py-1.5 px-2 border-bottom small"
                >
                  <div>
                    <strong>{w.name}</strong>
                    {w.isDefault && (
                      <span className="badge bg-warning text-dark ms-1.5">Mặc định</span>
                    )}
                    {w.address && <div className="text-muted">{w.address}</div>}
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary py-0 px-2"
                    onClick={() => {
                      setEditingWarehouse(w);
                      setWarehouseForm({
                        code: w.code || "",
                        name: w.name,
                        address: w.address || "",
                        managerName: w.managerName || "",
                        managerPhone: w.managerPhone || "",
                        isDefault: w.isDefault,
                        isActive: w.isActive,
                        notes: w.notes || "",
                        sortOrder: String(w.sortOrder ?? 0),
                      });
                    }}
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ModalShell>
    </>
  );
}
export default CreateEquipmentModal;
