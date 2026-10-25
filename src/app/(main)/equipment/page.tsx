"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import BatchActionBar from "@/components/BatchActionBar";
import ModalShell from "@/components/ModalShell";
import SearchableSelect from "@/components/ui/SearchableSelect";
import {
  STATUS_LABELS,
  DEFAULT_EQUIPMENT_BRANDS,
  DEFAULT_EQUIPMENT_TYPES,
  DEFAULT_EQUIPMENT_GROUPS,
  DEFAULT_EQUIPMENT_RELATIONS,
} from "@/lib/labels";
import { exportToCsv } from "@/lib/csv";
import { formatLocationPath, resolveLocationConfig } from "@/lib/location";

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

export interface EquipmentBrandItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  equipmentCount?: number;
}

export interface EquipmentTypeItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  equipmentCount?: number;
}

export interface EquipmentGroupItem {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  equipmentCount?: number;
}

export interface WarehouseItem {
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
  inStockEquipmentCount?: number;
}

interface EquipmentCategoryNested {
  id: string;
  name: string;
  code?: string | null;
  parent?: {
    id: string;
    name: string;
    parent?: {
      id: string;
      name: string;
    } | null;
  } | null;
}

interface EquipmentItem {
  id: string;
  code: string | null;
  serialNumber: string;
  qrCode: string;
  model: string;
  brand: string | null;
  type: string;
  group: string;
  relationType: string;
  categoryId: string | null;
  category: EquipmentCategoryNested | null;
  customerId: string | null;
  warehouseId: string | null;
  warehouse: {
    id: string;
    name: string;
    code?: string | null;
    address?: string | null;
  } | null;
  customer: {
    id: string;
    name: string;
    code?: string | null;
    phone?: string;
    group?: string;
    address?: string | null;
  } | null;
  contractId: string | null;
  contract: {
    id: string;
    code: string;
    basePrice?: string | number;
    baseQuota?: number;
  } | null;
  branchId?: string | null;
  buildingId?: string | null;
  departmentId: string | null;
  branch?: { id: string; name: string; address?: string | null } | null;
  building?: { id: string; name: string; branch?: { name: string } | null } | null;
  department: {
    id: string;
    name: string;
    building: { name: string; branch: { name: string } };
  } | null;
  locationNote: string | null;
  notes: string | null;
  status: string;
  healthScore: number;
  currentCounter: number;
  baseQuota: number | null;
  overagePrice: string | number | null;
  importedAt: string | null;
  installedAt: string | null;
  warrantyUntil: string | null;
  _count?: {
    tickets: number;
    partHistory: number;
    schedules: number;
  };
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
  customer: { id: string; name: string };
}

interface DepartmentOption {
  id: string;
  label: string;
}

interface FacetCounts {
  brandCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  groupCounts: Record<string, number>;
  relationCounts: Record<string, number>;
  statusCounts: Record<string, number>;
}

function getCategoryPath(cat: EquipmentCategoryNested | null | undefined): string {
  if (!cat) return "Chưa phân danh mục";
  const parts: string[] = [];
  if (cat.parent?.parent?.name) parts.push(cat.parent.parent.name);
  if (cat.parent?.name) parts.push(cat.parent.name);
  parts.push(cat.name);
  return parts.join(" › ");
}

function getStatusBadgeClass(st: string) {
  switch (st) {
    case "ACTIVE":
      return "badge bg-success-subtle text-success border border-success-subtle";
    case "FAULTY":
      return "badge bg-danger text-white border border-danger fw-bold";
    case "WAITING_PARTS":
      return "badge bg-warning text-dark border border-warning fw-bold";
    case "RECALLED":
      return "badge bg-secondary-subtle text-secondary border";
    case "IN_STOCK":
      return "badge bg-info-subtle text-info border border-info-subtle";
    case "SCRAPPED":
      return "badge bg-dark text-white";
    default:
      return "badge bg-light text-dark border";
  }
}

function getRelationBadgeClass(rel: string) {
  const lower = (rel || "").toLowerCase();
  if (!rel || lower.includes("sẵn hàng") || lower.includes("trong kho") || rel === "—") {
    return "badge bg-light text-secondary border border-secondary-subtle fw-medium";
  }
  if (lower.includes("thuê")) {
    return "badge bg-primary text-white";
  }
  if (lower.includes("bảo trì")) {
    return "badge bg-info text-dark fw-semibold";
  }
  if (lower.includes("sửa chữa") || lower.includes("dịch vụ")) {
    return "badge bg-warning text-dark border border-warning fw-semibold";
  }
  if (lower.includes("bảo hành") || lower.includes("bán")) {
    return "badge bg-success text-white";
  }
  if (lower.includes("mượn") || lower.includes("thử")) {
    return "badge bg-secondary text-white";
  }
  return "badge bg-light text-secondary border";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function EquipmentPage() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [categoriesFlat, setCategoriesFlat] = useState<CategoryNode[]>([]);
  const [categoriesTree, setCategoriesTree] = useState<CategoryNode[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [facets, setFacets] = useState<FacetCounts>({
    brandCounts: {},
    typeCounts: {},
    groupCounts: {},
    relationCounts: {},
    statusCounts: {},
  });

  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  // Paging & Filters
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [relationFilter, setRelationFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  // Custom options added by user during session
  const [customBrands, setCustomBrands] = useState<string[]>([]);
  const [customTypes, setCustomTypes] = useState<string[]>([]);
  const [customGroups, setCustomGroups] = useState<string[]>([]);
  const [customRelations, setCustomRelations] = useState<string[]>([]);

  // Inline custom input toggles inside Equipment Form
  const [addingCustomBrand, setAddingCustomBrand] = useState(false);
  const [newBrandText, setNewBrandText] = useState("");
  const [addingCustomType, setAddingCustomType] = useState(false);
  const [newTypeText, setNewTypeText] = useState("");
  const [addingCustomGroup, setAddingCustomGroup] = useState(false);
  const [newGroupText, setNewGroupText] = useState("");
  const [addingCustomRelation, setAddingCustomRelation] = useState(false);
  const [newRelationText, setNewRelationText] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal Quản lý Cây Danh mục Đa cấp
  const [showCatModal, setShowCatModal] = useState(false);
  const [catSaving, setCatSaving] = useState(false);
  const [editingCat, setEditingCat] = useState<CategoryNode | null>(null);
  const [collapsedCatIds, setCollapsedCatIds] = useState<Record<string, boolean>>({});
  const [catSearch, setCatSearch] = useState("");
  const [catForm, setCatForm] = useState({
    code: "",
    name: "",
    description: "",
    parentId: "",
    sortOrder: "0",
  });

  // Modal Quản lý Hãng, Loại & Nhóm thiết bị (Simple CRUD)
  const [showTypeGroupModal, setShowTypeGroupModal] = useState(false);
  const [typeGroupActiveTab, setTypeGroupActiveTab] = useState<"brand" | "type" | "group">("brand");
  const [dbBrands, setDbBrands] = useState<EquipmentBrandItem[]>([]);
  const [dbTypes, setDbTypes] = useState<EquipmentTypeItem[]>([]);
  const [dbGroups, setDbGroups] = useState<EquipmentGroupItem[]>([]);
  const [typeGroupSaving, setTypeGroupSaving] = useState(false);

  const [editingBrand, setEditingBrand] = useState<EquipmentBrandItem | null>(null);
  const [brandForm, setBrandForm] = useState({
    name: "",
    description: "",
    sortOrder: "0",
  });

  const [editingType, setEditingType] = useState<EquipmentTypeItem | null>(null);
  const [typeForm, setTypeForm] = useState({
    name: "",
    description: "",
    sortOrder: "0",
  });

  const [editingGroup, setEditingGroup] = useState<EquipmentGroupItem | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    sortOrder: "0",
  });

  // Modal Quản lý Kho bãi công ty
  const [showWarehouseModal, setShowWarehouseModal] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [warehouseSaving, setWarehouseSaving] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<WarehouseItem | null>(null);
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

  // Modal Đổi trạng thái nhanh
  const [statusTarget, setStatusTarget] = useState<EquipmentItem | null>(null);
  const [newStatus, setNewStatus] = useState("ACTIVE");
  const [statusNote, setStatusNote] = useState("");

  // Modal Tạo Ticket sửa chữa / bảo trì nhanh
  const [ticketTarget, setTicketTarget] = useState<EquipmentItem | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    type: "REPAIR",
    priority: "NORMAL",
    description: "",
  });

  const [destinationMode, setDestinationMode] = useState<"WAREHOUSE" | "CUSTOMER">("WAREHOUSE");
  const [formData, setFormData] = useState({
    code: "",
    serialNumber: "",
    model: "",
    brand: "Ricoh",
    type: "Máy Photocopy",
    group: "Máy văn phòng",
    relationType: "Sẵn hàng",
    categoryId: "",
    warehouseId: "",
    customerId: "",
    contractId: "",
    departmentId: "",
    locationNote: "",
    notes: "",
    status: "IN_STOCK",
    healthScore: "100",
    currentCounter: "0",
    baseQuota: "",
    overagePrice: "",
    warrantyUntil: "",
  });

  const handleDestinationChange = (mode: "WAREHOUSE" | "CUSTOMER") => {
    setDestinationMode(mode);
    if (mode === "WAREHOUSE") {
      setFormData((prev) => ({
        ...prev,
        customerId: "",
        contractId: "",
        departmentId: "",
        warehouseId: prev.warehouseId || warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || "",
        status: prev.status === "ACTIVE" ? "IN_STOCK" : prev.status,
        relationType: "Sẵn hàng",
      }));
      setDepartments([]);
    } else {
      setFormData((prev) => ({
        ...prev,
        warehouseId: "",
        status: prev.status === "IN_STOCK" ? "ACTIVE" : prev.status,
        relationType: prev.relationType === "Sẵn hàng" ? "Cho thuê" : (prev.relationType || "Cho thuê"),
      }));
    }
  };

  // Combined dynamic option lists (defaults + DB facets + user custom options)
  const brandOptions = useMemo(() => {
    const fromDb = dbBrands.map((b) => b.name);
    const set = new Set<string>([
      ...fromDb,
      ...DEFAULT_EQUIPMENT_BRANDS,
      ...Object.keys(facets.brandCounts),
      ...customBrands,
    ]);
    return Array.from(set).filter(Boolean);
  }, [dbBrands, facets.brandCounts, customBrands]);

  const typeOptions = useMemo(() => {
    const fromDb = dbTypes.map((t) => t.name);
    const set = new Set<string>([
      ...fromDb,
      ...DEFAULT_EQUIPMENT_TYPES,
      ...Object.keys(facets.typeCounts),
      ...customTypes,
    ]);
    return Array.from(set).filter(Boolean);
  }, [dbTypes, facets.typeCounts, customTypes]);

  const groupOptions = useMemo(() => {
    const fromDb = dbGroups.map((g) => g.name);
    const set = new Set<string>([
      ...fromDb,
      ...DEFAULT_EQUIPMENT_GROUPS,
      ...Object.keys(facets.groupCounts),
      ...customGroups,
    ]);
    return Array.from(set).filter(Boolean);
  }, [dbGroups, facets.groupCounts, customGroups]);

  const relationOptions = useMemo(() => {
    const set = new Set<string>([
      ...DEFAULT_EQUIPMENT_RELATIONS,
      ...Object.keys(facets.relationCounts),
      ...customRelations,
    ]);
    return Array.from(set).filter(Boolean);
  }, [facets.relationCounts, customRelations]);

  const categorySelectOptions = useMemo(() => {
    return categoriesFlat.map((c) => ({
      value: c.id,
      label: c.name,
      level: Math.max(0, c.level - 1),
    }));
  }, [categoriesFlat]);

  const categoryFilterSelectOptions = useMemo(() => {
    return [
      { value: "", label: "-- Tất cả danh mục --", level: 0 },
      ...categorySelectOptions,
    ];
  }, [categorySelectOptions]);

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const st = sp.get("status");
      if (st) setStatusFilter(st);
      if (window.innerWidth <= 768) setViewMode("card");
    }
  }, []);

  const loadWarehouses = useCallback(async () => {
    try {
      const res = await fetch("/api/warehouses");
      if (res.ok) {
        const d = await res.json();
        setWarehouses(d.warehouses || []);
      }
    } catch {
      // ignore
    }
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

  const loadCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/equipment-categories");
      if (res.ok) {
        const d = await res.json();
        setCategoriesFlat(d.flat || []);
        setCategoriesTree(d.tree || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadContracts = useCallback(async () => {
    try {
      const res = await fetch("/api/contracts?pageSize=100");
      if (res.ok) {
        const dct = await res.json();
        setContracts(dct.items || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      if (categoryFilter) sp.set("categoryId", categoryFilter);
      if (brandFilter) sp.set("brand", brandFilter);
      if (typeFilter) sp.set("type", typeFilter);
      if (groupFilter) sp.set("group", groupFilter);
      if (relationFilter) sp.set("relationType", relationFilter);
      if (statusFilter) sp.set("status", statusFilter);
      if (customerFilter) sp.set("customerId", customerFilter);

      const [resEq, resCust, resCat, resBrands, resTypes, resGroups, resWh] = await Promise.all([
        fetch(`/api/equipment?${sp.toString()}`),
        fetch("/api/customers?pageSize=100"),
        fetch("/api/equipment-categories"),
        fetch("/api/equipment-brands"),
        fetch("/api/equipment-types"),
        fetch("/api/equipment-groups"),
        fetch("/api/warehouses"),
      ]);
      if (resEq.ok) {
        const d = await resEq.json();
        setItems(d.items || []);
        setTotal(d.total || 0);
        setTotalAll(d.totalAll ?? d.total ?? 0);
        if (d.facets) setFacets(d.facets);
      }
      if (resCust.ok) {
        const dc = await resCust.json();
        setCustomers(dc.items || []);
      }
      if (resCat.ok) {
        const dcat = await resCat.json();
        setCategoriesFlat(dcat.flat || []);
        setCategoriesTree(dcat.tree || []);
      }
      if (resBrands.ok) {
        const dbr = await resBrands.json();
        setDbBrands(dbr.brands || []);
      }
      if (resTypes.ok) {
        const dt = await resTypes.json();
        setDbTypes(dt.types || []);
      }
      if (resGroups.ok) {
        const dg = await resGroups.json();
        setDbGroups(dg.groups || []);
      }
      if (resWh.ok) {
        const dw = await resWh.json();
        setWarehouses(dw.warehouses || []);
      }
    } catch {
      toast.error("Lỗi khi tải danh sách thiết bị");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    pageSize,
    search,
    categoryFilter,
    brandFilter,
    typeFilter,
    groupFilter,
    relationFilter,
    statusFilter,
    customerFilter,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const toggleRow = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllRows = () => {
    if (expandedRowIds.size === items.length && items.length > 0) {
      setExpandedRowIds(new Set());
    } else {
      setExpandedRowIds(new Set(items.map((x) => x.id)));
    }
  };

  const loadCustomerDepartments = async (custId: string) => {
    if (!custId) {
      setDepartments([]);
      return;
    }
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
  };

  const openNew = () => {
    setEditing(null);
    setDestinationMode("WAREHOUSE");
    setAddingCustomBrand(false);
    setAddingCustomType(false);
    setAddingCustomGroup(false);
    setAddingCustomRelation(false);
    setFormData({
      code: "",
      serialNumber: "",
      model: "",
      brand: "Ricoh",
      type: "Máy Photocopy",
      group: "Máy văn phòng",
      relationType: "Sẵn hàng",
      categoryId: categoriesFlat[0]?.id || "",
      warehouseId: warehouses.find((w) => w.isDefault)?.id || warehouses[0]?.id || "",
      customerId: "",
      contractId: "",
      departmentId: "",
      locationNote: "",
      notes: "",
      status: "IN_STOCK",
      healthScore: "100",
      currentCounter: "0",
      baseQuota: "",
      overagePrice: "",
      warrantyUntil: "",
    });
    setDepartments([]);
    loadContracts();
    setShowModal(true);
  };

  const openEdit = (eq: EquipmentItem) => {
    setEditing(eq);
    setDestinationMode(eq.customerId ? "CUSTOMER" : "WAREHOUSE");
    loadContracts();
    setAddingCustomBrand(false);
    setAddingCustomType(false);
    setAddingCustomGroup(false);
    setAddingCustomRelation(false);
    setFormData({
      code: eq.code || "",
      serialNumber: eq.serialNumber,
      model: eq.model,
      brand: eq.brand || "",
      type: eq.type || "Máy Photocopy",
      group: eq.group || "Máy văn phòng",
      relationType: eq.customerId ? (eq.relationType || "Cho thuê") : "Sẵn hàng",
      categoryId: eq.categoryId || "",
      warehouseId: eq.warehouseId || warehouses.find((w) => w.isDefault)?.id || "",
      customerId: eq.customerId || "",
      contractId: eq.contractId || "",
      departmentId: eq.departmentId
        ? `department:${eq.departmentId}`
        : eq.buildingId
        ? `building:${eq.buildingId}`
        : eq.branchId
        ? `branch:${eq.branchId}`
        : "",
      locationNote: eq.locationNote || "",
      notes: eq.notes || "",
      status: eq.status,
      healthScore: String(eq.healthScore),
      currentCounter: String(eq.currentCounter ?? 0),
      baseQuota: eq.baseQuota !== null ? String(eq.baseQuota) : "",
      overagePrice: eq.overagePrice !== null ? String(eq.overagePrice) : "",
      warrantyUntil: eq.warrantyUntil ? eq.warrantyUntil.slice(0, 10) : "",
    });
    if (eq.customerId) loadCustomerDepartments(eq.customerId);
    else setDepartments([]);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (destinationMode === "CUSTOMER" && !formData.customerId) {
      toast.warning("Vui lòng chọn khách hàng khi chọn chế độ Gán luôn cho khách hàng");
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

        const [level, targetId] = formData.departmentId ? formData.departmentId.split(":") : ["", ""];
        const isCust = destinationMode === "CUSTOMER";
        const payload: Record<string, unknown> = {
        ...(editing ? {} : { serialNumber: formData.serialNumber }),
        code: formData.code.trim() || (editing ? null : undefined),
        model: formData.model.trim(),
        brand: formData.brand.trim() || (editing ? null : undefined),
        type: formData.type.trim() || "Máy Photocopy",
        group: formData.group.trim() || "Máy văn phòng",
        relationType: isCust ? (formData.relationType.trim() || "Cho thuê") : "Sẵn hàng",
        categoryId: formData.categoryId || (editing ? null : undefined),
        warehouseId: destinationMode === "WAREHOUSE" ? (formData.warehouseId || (editing ? null : undefined)) : null,
        customerId: isCust ? (formData.customerId || (editing ? null : undefined)) : null,
        contractId: isCust ? (formData.contractId || (editing ? null : undefined)) : null,
        branchId: isCust ? (level === "branch" ? targetId : (editing ? null : undefined)) : null,
        buildingId: isCust ? (level === "building" ? targetId : (editing ? null : undefined)) : null,
        departmentId: isCust ? (level === "department" ? targetId : (editing ? null : undefined)) : null,
        locationNote: formData.locationNote.trim() || (editing ? null : undefined),
        notes: formData.notes.trim() || (editing ? null : undefined),
        status: finalStatus,
        currentCounter: formData.currentCounter ? Number(formData.currentCounter) : 0,
        ...(editing ? { healthScore: Number(formData.healthScore) } : {}),
        baseQuota: formData.baseQuota ? Number(formData.baseQuota) : editing ? null : undefined,
        overagePrice: formData.overagePrice
          ? Number(formData.overagePrice)
          : editing
            ? null
            : undefined,
        warrantyUntil: formData.warrantyUntil
          ? new Date(formData.warrantyUntil).toISOString()
          : editing
            ? null
            : undefined,
      };

      const res = await fetch(editing ? `/api/equipment/${editing.id}` : "/api/equipment", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu thiết bị");
        return;
      }
      toast.success(editing ? "Đã cập nhật hồ sơ thiết bị" : "Đã thêm thiết bị mới");
      setShowModal(false);
      loadData();
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

  const handleAddSubCategory = (parentNode: CategoryNode) => {
    setEditingCat(null);
    setCatForm({
      code: "",
      name: "",
      description: "",
      parentId: parentNode.id,
      sortOrder: "0",
    });
    if (collapsedCatIds[parentNode.id]) {
      setCollapsedCatIds((prev) => ({ ...prev, [parentNode.id]: false }));
    }
  };

  const startEditCategory = (node: CategoryNode) => {
    setEditingCat(node);
    setCatForm({
      code: node.code || "",
      name: node.name,
      description: node.description || "",
      parentId: node.parentId || "",
      sortOrder: String(node.sortOrder ?? 0),
    });
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

  const toggleCollapseCat = (id: string) => {
    setCollapsedCatIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const collapseAllCats = () => {
    const next: Record<string, boolean> = {};
    const traverse = (nodes: CategoryNode[]) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          next[n.id] = true;
          traverse(n.children);
        }
      }
    };
    traverse(categoriesTree);
    setCollapsedCatIds(next);
  };

  const expandAllCats = () => {
    setCollapsedCatIds({});
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
    return [
      { value: "", label: "-- Danh mục gốc --", level: 0 },
      ...list,
    ];
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
      toast.success(editingCat ? "Đã cập nhật danh mục" : "Đã thêm danh mục mới");
      resetCatForm(catForm.parentId);
      await loadCategories();
      loadData();
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (node: CategoryNode) => {
    if (!confirm(`Bạn có chắc muốn xóa danh mục "${node.name}"?`)) return;
    const res = await fetch(`/api/equipment-categories/${node.id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa danh mục");
      return;
    }
    toast.success(`Đã xóa danh mục "${node.name}"`);
    if (editingCat?.id === node.id) resetCatForm();
    if (categoryFilter === node.id) setCategoryFilter("");
    await loadCategories();
    loadData();
  };

  // Simple CRUD handlers for Equipment Brand, Type & Group
  const openTypeGroupManager = (tab: "brand" | "type" | "group" = "brand") => {
    setTypeGroupActiveTab(tab);
    setEditingBrand(null);
    setBrandForm({ name: "", description: "", sortOrder: "0" });
    setEditingType(null);
    setTypeForm({ name: "", description: "", sortOrder: "0" });
    setEditingGroup(null);
    setGroupForm({ name: "", description: "", sortOrder: "0" });
    setShowTypeGroupModal(true);
  };

  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandForm.name.trim()) {
      toast.warning("Vui lòng nhập tên hãng sản xuất");
      return;
    }
    setTypeGroupSaving(true);
    try {
      const url = editingBrand
        ? `/api/equipment-brands/${editingBrand.id}`
        : "/api/equipment-brands";
      const method = editingBrand ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: brandForm.name.trim(),
          description: brandForm.description.trim() || null,
          sortOrder: Number(brandForm.sortOrder) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu hãng sản xuất");
        return;
      }
      toast.success(editingBrand ? "Đã cập nhật hãng sản xuất" : "Đã thêm hãng sản xuất mới");
      setEditingBrand(null);
      setBrandForm({ name: "", description: "", sortOrder: "0" });
      await loadEquipmentBrands();
      loadData();
    } finally {
      setTypeGroupSaving(false);
    }
  };

  const handleDeleteBrand = async (b: EquipmentBrandItem) => {
    if (!confirm(`Bạn có chắc muốn xóa hãng "${b.name}"?`)) return;
    const res = await fetch(`/api/equipment-brands/${b.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa hãng sản xuất");
      return;
    }
    toast.success(`Đã xóa hãng "${b.name}"`);
    if (editingBrand?.id === b.id) {
      setEditingBrand(null);
      setBrandForm({ name: "", description: "", sortOrder: "0" });
    }
    if (brandFilter === b.name) setBrandFilter("");
    await loadEquipmentBrands();
    loadData();
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!typeForm.name.trim()) {
      toast.warning("Vui lòng nhập tên loại thiết bị");
      return;
    }
    setTypeGroupSaving(true);
    try {
      const url = editingType
        ? `/api/equipment-types/${editingType.id}`
        : "/api/equipment-types";
      const method = editingType ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: typeForm.name.trim(),
          description: typeForm.description.trim() || null,
          sortOrder: Number(typeForm.sortOrder) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu loại thiết bị");
        return;
      }
      toast.success(editingType ? "Đã cập nhật loại thiết bị" : "Đã thêm loại thiết bị mới");
      setEditingType(null);
      setTypeForm({ name: "", description: "", sortOrder: "0" });
      await loadEquipmentTypes();
      loadData();
    } finally {
      setTypeGroupSaving(false);
    }
  };

  const handleDeleteType = async (t: EquipmentTypeItem) => {
    if (!confirm(`Bạn có chắc muốn xóa loại thiết bị "${t.name}"?`)) return;
    const res = await fetch(`/api/equipment-types/${t.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa loại thiết bị");
      return;
    }
    toast.success(`Đã xóa loại thiết bị "${t.name}"`);
    if (editingType?.id === t.id) {
      setEditingType(null);
      setTypeForm({ name: "", description: "", sortOrder: "0" });
    }
    if (typeFilter === t.name) setTypeFilter("");
    await loadEquipmentTypes();
    loadData();
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      toast.warning("Vui lòng nhập tên nhóm máy");
      return;
    }
    setTypeGroupSaving(true);
    try {
      const url = editingGroup
        ? `/api/equipment-groups/${editingGroup.id}`
        : "/api/equipment-groups";
      const method = editingGroup ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: groupForm.name.trim(),
          description: groupForm.description.trim() || null,
          sortOrder: Number(groupForm.sortOrder) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu nhóm máy");
        return;
      }
      toast.success(editingGroup ? "Đã cập nhật nhóm máy" : "Đã thêm nhóm máy mới");
      setEditingGroup(null);
      setGroupForm({ name: "", description: "", sortOrder: "0" });
      await loadEquipmentGroups();
      loadData();
    } finally {
      setTypeGroupSaving(false);
    }
  };

  const handleDeleteGroup = async (g: EquipmentGroupItem) => {
    if (!confirm(`Bạn có chắc muốn xóa nhóm máy "${g.name}"?`)) return;
    const res = await fetch(`/api/equipment-groups/${g.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa nhóm máy");
      return;
    }
    toast.success(`Đã xóa nhóm máy "${g.name}"`);
    if (editingGroup?.id === g.id) {
      setEditingGroup(null);
      setGroupForm({ name: "", description: "", sortOrder: "0" });
    }
    if (groupFilter === g.name) setGroupFilter("");
    await loadEquipmentGroups();
    loadData();
  };

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
      } else if (res.status === 409) {
        // already exists
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Không thể lưu hãng");
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
      } else if (res.status === 409) {
        // already exists
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Không thể lưu loại thiết bị");
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
      } else if (res.status === 409) {
        // already exists
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Không thể lưu nhóm máy");
      }
    } catch {
      // ignore
    }
    setCustomGroups((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setFormData((prev) => ({ ...prev, group: v }));
    setNewGroupText("");
    setAddingCustomGroup(false);
  };

  // Warehouse CRUD handlers
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
      loadData();
    } finally {
      setWarehouseSaving(false);
    }
  };

  const handleDeleteWarehouse = async (w: WarehouseItem) => {
    if (!confirm(`Bạn có chắc muốn xóa kho "${w.name}"?`)) return;
    const res = await fetch(`/api/warehouses/${w.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa kho");
      return;
    }
    toast.success(`Đã xóa kho "${w.name}"`);
    if (editingWarehouse?.id === w.id) {
      setEditingWarehouse(null);
    }
    await loadWarehouses();
    loadData();
  };

  const handleQuickStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTarget) return;
    const res = await fetch(`/api/equipment/${statusTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, statusNote }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể đổi trạng thái");
      return;
    }
    toast.success("Đã cập nhật trạng thái thiết bị");
    setStatusTarget(null);
    setStatusNote("");
    loadData();
  };

  const handleQuickTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketTarget || !ticketTarget.customerId) {
      toast.warning("Thiết bị cần gắn với khách hàng để tạo phiếu dịch vụ kỹ thuật");
      return;
    }
    setTicketSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: ticketTarget.customerId,
          equipmentId: ticketTarget.id,
          type: ticketForm.type,
          priority: ticketForm.priority,
          description: ticketForm.description,
          source: "INTERNAL",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể tạo phiếu kỹ thuật");
        return;
      }
      toast.success(`Đã tạo phiếu kỹ thuật ${data.code || ""} cho máy ${ticketTarget.serialNumber}`);
      setTicketTarget(null);
      loadData();
    } finally {
      setTicketSubmitting(false);
    }
  };

  const handleBatchStatus = async (st: string) => {
    for (const id of selectedIds) {
      await fetch(`/api/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: st, statusNote: "Cập nhật hàng loạt" }),
      });
    }
    toast.success(`Đã chuyển ${selectedIds.length} máy sang ${STATUS_LABELS[st]}`);
    setSelectedIds([]);
    loadData();
  };

  const handleDeleteEquipment = async (eq: EquipmentItem) => {
    if (!confirm(`Bạn có chắc muốn xóa thiết bị "${eq.model} (SN: ${eq.serialNumber})"?`))
      return;
    const res = await fetch(`/api/equipment/${eq.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa thiết bị");
      return;
    }
    toast.success(`Đã xóa thiết bị ${eq.serialNumber}`);
    loadData();
  };

  const handleExportCsv = () => {
    exportToCsv(
      "danh-sach-thiet-bi.csv",
      [
        "Mã TB",
        "Serial Number",
        "Hãng",
        "Model",
        "Danh mục đa cấp",
        "Loại thiết bị",
        "Nhóm thiết bị",
        "Quan hệ KH",
        "Khách hàng",
        "Mã Hợp đồng",
        "Vị trí lắp đặt",
        "Trạng thái",
        "Counter hiện tại",
        "Sức khỏe (%)",
      ],
      items.map((eq) => {
        const loc = formatLocationPath(eq) || eq.locationNote || "";
        return [
          eq.code || "",
          eq.serialNumber,
          eq.brand || "",
          eq.model,
          getCategoryPath(eq.category),
          eq.type || "",
          eq.group || "",
          eq.relationType || "Cho thuê",
          eq.customer?.name || "Trong kho công ty",
          eq.contract?.code || "",
          loc,
          STATUS_LABELS[eq.status] || eq.status,
          eq.currentCounter,
          eq.healthScore,
        ];
      })
    );
  };

  // Active Filter Chips
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
    const cat = categoriesFlat.find((c) => c.id === categoryFilter);
    chips.push({
      id: "category",
      label: "Danh mục",
      value: cat?.fullPath || categoryFilter,
      onClear: () => {
        setCategoryFilter("");
        setPage(1);
      },
    });
  }
  if (relationFilter) {
    chips.push({
      id: "relation",
      label: "Quan hệ KH",
      value: relationFilter,
      onClear: () => {
        setRelationFilter("");
        setPage(1);
      },
    });
  }
  if (brandFilter) {
    chips.push({
      id: "brand",
      label: "Hãng",
      value: brandFilter,
      onClear: () => {
        setBrandFilter("");
        setPage(1);
      },
    });
  }
  if (typeFilter) {
    chips.push({
      id: "type",
      label: "Loại",
      value: typeFilter,
      onClear: () => {
        setTypeFilter("");
        setPage(1);
      },
    });
  }
  if (groupFilter) {
    chips.push({
      id: "group",
      label: "Nhóm",
      value: groupFilter,
      onClear: () => {
        setGroupFilter("");
        setPage(1);
      },
    });
  }
  if (customerFilter) {
    const labelVal =
      customerFilter === "IN_WAREHOUSE"
        ? "Toàn bộ kho công ty"
        : customerFilter === "ASSIGNED"
          ? "Đang ở khách hàng"
          : customerFilter.startsWith("WH:")
            ? `Kho: ${warehouses.find((w) => w.id === customerFilter.slice(3))?.name || customerFilter}`
            : customers.find((x) => x.id === customerFilter)?.name || customerFilter;
    chips.push({
      id: "customer",
      label: customerFilter.startsWith("WH:") || customerFilter === "IN_WAREHOUSE" ? "Vị trí kho" : "Khách hàng",
      value: labelVal,
      onClear: () => {
        setCustomerFilter("");
        setPage(1);
      },
    });
  }
  if (statusFilter) {
    chips.push({
      id: "status",
      label: "Trạng thái",
      value: STATUS_LABELS[statusFilter] || statusFilter,
      onClear: () => {
        setStatusFilter("");
        setPage(1);
      },
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const masterTotal =
    totalAll > 0
      ? totalAll
      : Object.values(facets.statusCounts).reduce((acc, v) => acc + v, 0) || total;
  const activeCount = facets.statusCounts["ACTIVE"] ?? items.filter((i) => i.status === "ACTIVE").length;
  const inStockCount = facets.statusCounts["IN_STOCK"] ?? items.filter((i) => i.status === "IN_STOCK").length;
  const faultyCount =
    (facets.statusCounts["FAULTY"] ?? 0) + (facets.statusCounts["WAITING_PARTS"] ?? 0);
  const rentalCount = facets.relationCounts["Cho thuê"] ?? 0;
  const serviceCount = Object.entries(facets.relationCounts)
    .filter(([k]) => k !== "Cho thuê")
    .reduce((acc, [, v]) => acc + v, 0);

  const filteredContracts = contracts.filter(
    (c) => !formData.customerId || c.customerId === formData.customerId
  );

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

  // Helper kiểm tra nhánh con có khớp từ khóa tìm kiếm hay không
  const hasMatchingDescendant = (children: CategoryNode[], term: string): boolean => {
    return children.some(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.children && c.children.length > 0 && hasMatchingDescendant(c.children, term))
    );
  };

  // Render recursive category tree inside Modal
  const renderCategoryTreeNodes = (nodes: CategoryNode[]) => {
    const searchTerm = catSearch.trim().toLowerCase();

    return (
      <div className="d-flex flex-column gap-1">
        {nodes.map((node) => {
          const hasChildren = Boolean(node.children && node.children.length > 0);
          const isEditingThis = editingCat?.id === node.id;
          const isSelectedParent = !editingCat && catForm.parentId === node.id;

          // Tìm kiếm lọc danh mục
          const isSelfMatch = !searchTerm || node.name.toLowerCase().includes(searchTerm);
          const hasChildMatch =
            !searchTerm || (hasChildren && hasMatchingDescendant(node.children!, searchTerm));

          if (!isSelfMatch && !hasChildMatch) {
            return null;
          }

          // Khi tìm kiếm: tự bung các nhánh có kết quả để người dùng nhìn thấy
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
                style={{
                  fontSize: "13px",
                }}
              >
                {/* Cột trái: Nút bung/gập + Tên danh mục + Số lượng máy (chỉ hiển thị Tên và Số lượng) */}
                <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1 me-2">
                  {hasChildren ? (
                    <button
                      type="button"
                      className="btn btn-sm p-0 text-secondary border-0 d-flex align-items-center justify-content-center flex-shrink-0"
                      style={{ width: "20px", height: "20px" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCollapseCat(node.id);
                      }}
                      title={isCollapsed ? "Mở rộng nhánh" : "Thu gọn nhánh"}
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

                  <span
                    className={`text-truncate ${
                      node.level === 1
                        ? "fw-bold text-dark"
                        : node.level === 2
                        ? "fw-semibold text-dark"
                        : "text-body"
                    }`}
                    title={node.description ? `${node.name} — ${node.description}` : node.name}
                  >
                    {node.name}
                  </span>

                  <span
                    className="badge bg-light text-secondary border flex-shrink-0"
                    style={{ fontSize: "11px", fontWeight: 500 }}
                    title={`Tổng ${node.totalEquipmentCount} thiết bị trong nhánh này`}
                  >
                    {node.totalEquipmentCount} máy
                  </span>
                </div>

                {/* Cột phải: Chỉ tập trung các thao tác quản lý danh mục (Cấp con, Sửa, Xóa) */}
                <div className="d-flex align-items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-success py-0 px-2 d-flex align-items-center gap-1"
                    style={{ fontSize: "11px", height: "24px" }}
                    onClick={() => handleAddSubCategory(node)}
                    title={`Thêm danh mục con thuộc "${node.name}"`}
                  >
                    <i className="fas fa-plus"></i>
                    <span className="d-none d-sm-inline">Cấp con</span>
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm py-0 px-2 d-flex align-items-center gap-1 ${
                      isEditingThis ? "btn-primary" : "btn-outline-secondary"
                    }`}
                    style={{ fontSize: "11px", height: "24px" }}
                    onClick={() => startEditCategory(node)}
                    title="Chỉnh sửa thông tin danh mục"
                  >
                    <i className="fas fa-pen"></i>
                    <span className="d-none d-sm-inline">Sửa</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger py-0 px-2"
                    style={{ fontSize: "11px", height: "24px" }}
                    onClick={() => handleDeleteCategory(node)}
                    title="Xóa danh mục"
                  >
                    <i className="fas fa-trash-alt"></i>
                  </button>
                </div>
              </div>

              {/* Nhánh con có đường dẫn dọc kết nối dạng cây */}
              {hasChildren && !isCollapsed && (
                <div
                  className="ps-2 ms-2 my-1"
                  style={{
                    borderLeft: "2px solid rgba(13, 110, 253, 0.2)",
                  }}
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

  return (
    <div className="container-fluid px-0">
      {/* 1. Header Bar chuẩn ERP (Gom gọn trên 1 dòng duy nhất, phân cụm rành mạch) */}
      <div className="bg-white px-3 py-2 rounded shadow-sm border mb-2 d-flex align-items-center justify-content-between gap-2 flex-wrap">
        {/* Cụm trái: Tiêu đề + Thống kê nhanh */}
        <div className="d-flex align-items-center gap-2.5 flex-wrap">
          <div className="d-flex align-items-center gap-2">
            <span
              className="d-inline-flex align-items-center justify-content-center bg-primary-subtle text-primary rounded-2"
              style={{ width: "30px", height: "30px", flexShrink: 0 }}
            >
              <i className="fas fa-print"></i>
            </span>
            <h5 className="mb-0 fw-bold text-dark text-nowrap" style={{ fontSize: "16px" }}>
              Thiết bị
            </h5>
          </div>

          {/* Quick Metrics */}
          <div className="d-flex align-items-center gap-1.5 flex-wrap">
            <span className="badge rounded-pill bg-light text-secondary border px-2 py-1 text-nowrap" style={{ fontSize: "11px" }}>
              Tổng: <strong className="text-dark">{masterTotal}</strong>
            </span>
            <span className="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2 py-1 text-nowrap" style={{ fontSize: "11px" }}>
              Hoạt động: <strong>{activeCount}</strong>
            </span>
            <span
              className="badge rounded-pill bg-info-subtle text-info border border-info-subtle px-2 py-1 text-nowrap"
              style={{ fontSize: "11px", cursor: "pointer" }}
              onClick={() => {
                setStatusFilter(statusFilter === "IN_STOCK" ? "" : "IN_STOCK");
                setPage(1);
              }}
              title="Lọc thiết bị Trong kho"
            >
              Kho: <strong>{inStockCount}</strong>
            </span>
            {faultyCount > 0 && (
              <span
                className="badge rounded-pill bg-danger text-white px-2 py-1 text-nowrap shadow-xs"
                style={{ fontSize: "11px", cursor: "pointer" }}
                onClick={() => {
                  setStatusFilter(statusFilter === "FAULTY" ? "" : "FAULTY");
                  setPage(1);
                }}
                title="Lọc thiết bị Lỗi / Cần bảo trì"
              >
                <i className="fas fa-exclamation-triangle me-1"></i>Lỗi: <strong>{faultyCount}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Cụm phải: Điều khiển hiển thị + Quản lý Danh mục/Kho + Xuất Excel + Thao tác chính */}
        <div className="d-flex align-items-center gap-1.5 flex-nowrap overflow-x-auto">
          {/* Nhóm 1: Chế độ hiển thị (Bảng / Thẻ) & Mở rộng */}
          <div className="btn-group btn-group-sm shadow-xs" role="group">
            <button
              type="button"
              className={`btn py-1 px-2 ${viewMode === "table" ? "btn-dark fw-bold" : "btn-light border text-secondary"}`}
              onClick={() => setViewMode("table")}
              title="Chế độ bảng ERP"
              style={{ height: "30px", fontSize: "12px" }}
            >
              <i className="fas fa-table me-1"></i>Bảng
            </button>
            <button
              type="button"
              className={`btn py-1 px-2 ${viewMode === "card" ? "btn-dark fw-bold" : "btn-light border text-secondary"}`}
              onClick={() => setViewMode("card")}
              title="Chế độ thẻ"
              style={{ height: "30px", fontSize: "12px" }}
            >
              <i className="fas fa-th-large me-1"></i>Thẻ
            </button>
          </div>

          {viewMode === "table" && items.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-light border text-secondary fw-medium px-2 shadow-xs d-flex align-items-center gap-1"
              onClick={toggleAllRows}
              title={expandedRowIds.size === items.length ? "Thu gọn tất cả dòng" : "Mở rộng tất cả dòng"}
              style={{ height: "30px", fontSize: "12px" }}
            >
              <i
                className={`fas fa-${
                  expandedRowIds.size === items.length ? "compress-alt text-danger" : "expand-alt text-primary"
                }`}
              ></i>
              <span className="d-none d-xl-inline">{expandedRowIds.size === items.length ? "Thu gọn" : "Sổ tất cả"}</span>
            </button>
          )}

          {/* Đường ngăn cách nhẹ */}
          <div className="vr text-muted opacity-25 d-none d-md-block mx-0.5" style={{ height: "18px" }}></div>

          {/* Nhóm 2: Quản lý Danh mục & Kho (Khối nút gắn kết liền mạch) */}
          <div className="btn-group btn-group-sm shadow-xs" role="group">
            <button
              type="button"
              className="btn btn-light border text-dark fw-medium px-2.5 d-flex align-items-center gap-1"
              onClick={() => openCategoryManager(null)}
              title="Quản lý Cây danh mục thiết bị đa cấp"
              style={{ height: "30px", fontSize: "12px" }}
            >
              <i className="fas fa-sitemap text-warning"></i>
              <span className="d-none d-lg-inline">Cây Danh mục</span>
              <span className="d-inline d-lg-none">Cây DM</span>
              <span className="badge bg-secondary-subtle text-secondary ms-1 px-1.5" style={{ fontSize: "10px" }}>
                {categoriesFlat.length}
              </span>
            </button>

            <button
              type="button"
              className="btn btn-light border text-dark fw-medium px-2.5 d-flex align-items-center gap-1"
              onClick={() => openTypeGroupManager("brand")}
              title="Quản lý Hãng sản xuất, Loại thiết bị và Nhóm máy"
              style={{ height: "30px", fontSize: "12px" }}
            >
              <i className="fas fa-layer-group text-primary"></i>
              <span className="d-none d-lg-inline">Hãng, Loại &amp; Nhóm</span>
              <span className="d-inline d-lg-none">Hãng/Loại</span>
            </button>

            <button
              type="button"
              className="btn btn-light border text-dark fw-medium px-2.5 d-flex align-items-center gap-1"
              onClick={openWarehouseManager}
              title="Quản lý danh sách Kho bãi công ty"
              style={{ height: "30px", fontSize: "12px" }}
            >
              <i className="fas fa-warehouse text-warning"></i>
              <span>Kho bãi</span>
              <span className="badge bg-secondary-subtle text-secondary ms-1 px-1.5" style={{ fontSize: "10px" }}>
                {warehouses.length}
              </span>
            </button>
          </div>

          {/* Đường ngăn cách nhẹ */}
          <div className="vr text-muted opacity-25 d-none d-md-block mx-0.5" style={{ height: "18px" }}></div>

          {/* Nhóm 3: Xuất Excel & Tải lại */}
          <button
            type="button"
            className="btn btn-sm btn-light border border-success-subtle text-success fw-medium px-2 shadow-xs d-flex align-items-center gap-1"
            onClick={handleExportCsv}
            title="Xuất file Excel"
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className="fas fa-file-excel"></i>
            <span className="d-none d-xl-inline">Xuất Excel</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-light border text-secondary fw-medium px-2 shadow-xs d-flex align-items-center"
            onClick={loadData}
            title="Tải lại dữ liệu"
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className={`fas fa-sync-alt ${loading ? "fa-spin text-primary" : ""}`}></i>
          </button>

          {/* Nhóm 4: Nút Thêm mới chính */}
          <button
            type="button"
            className="btn btn-sm btn-primary fw-bold px-2.5 d-flex align-items-center gap-1 shadow-sm text-nowrap ms-1"
            onClick={openNew}
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className="fas fa-plus"></i>
            <span>Thêm thiết bị</span>
          </button>
        </div>
      </div>

      {/* 2. Quick Bar: Phân chia theo Hãng & Quan hệ Khách hàng */}
      <div className="bg-white p-2 px-3 rounded border mb-2 d-flex flex-wrap align-items-center justify-content-between gap-2 shadow-xs">
        <div className="d-flex align-items-center gap-1.5 flex-wrap">
          <span className="small fw-bold text-secondary me-1">
            <i className="fas fa-industry me-1 text-primary"></i>Hãng:
          </span>
          <button
            type="button"
            className={`btn btn-sm py-0 px-2 rounded-pill ${
              !brandFilter ? "btn-dark fw-bold" : "btn-outline-secondary"
            }`}
            style={{ fontSize: "11.5px", height: "24px" }}
            onClick={() => {
              setBrandFilter("");
              setPage(1);
            }}
          >
            Tất cả
          </button>
          {brandOptions.map((b) => {
            const cnt = facets.brandCounts[b] || 0;
            const active = brandFilter.toLowerCase() === b.toLowerCase();
            if (cnt === 0 && !active && DEFAULT_EQUIPMENT_BRANDS.indexOf(b) > 5) return null;
            return (
              <button
                key={b}
                type="button"
                className={`btn btn-sm py-0 px-2.5 rounded-pill ${
                  active ? "btn-primary fw-bold" : "btn-light border text-dark"
                }`}
                style={{ fontSize: "11.5px", height: "24px" }}
                onClick={() => {
                  setBrandFilter(active ? "" : b);
                  setPage(1);
                }}
              >
                {b} {cnt > 0 && <span className="opacity-75">({cnt})</span>}
              </button>
            );
          })}
          <button
            type="button"
            className="btn btn-sm py-0 px-2 rounded-pill btn-light border text-secondary"
            style={{ fontSize: "11px", height: "24px" }}
            title="Quản lý danh sách Hãng"
            onClick={() => openTypeGroupManager("brand")}
          >
            <i className="fas fa-cog me-1"></i>Hãng
          </button>
        </div>

        <div className="d-flex align-items-center gap-1.5 flex-wrap">
          <span className="small fw-bold text-secondary me-1">
            <i className="fas fa-exchange-alt me-1 text-success"></i>Hình thức:
          </span>
          {relationOptions.map((rel) => {
            const cnt = facets.relationCounts[rel] || 0;
            const active = relationFilter === rel;
            return (
              <button
                key={rel}
                type="button"
                className={`btn btn-sm py-0 px-2.5 rounded-pill ${
                  active ? "btn-success fw-bold text-white" : "btn-light border text-dark"
                }`}
                style={{ fontSize: "11.5px", height: "24px" }}
                onClick={() => {
                  setRelationFilter(active ? "" : rel);
                  setPage(1);
                }}
              >
                {rel} {cnt > 0 && <span className="opacity-75">({cnt})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Dense Filter Bar */}
      <div className="bg-light p-2 rounded border mb-2">
        <div className="row g-2 align-items-center">
          <div className="col-md-3">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white">
                <i className="fas fa-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Tìm Serial, Mã TB, Model, Hãng, Vị trí..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="col-md-2">
            <SearchableSelect
              value={categoryFilter}
              onChange={(val) => {
                setCategoryFilter(val);
                setPage(1);
              }}
              options={categoryFilterSelectOptions}
              placeholder="-- Tất cả danh mục --"
              searchPlaceholder="Tìm danh mục..."
              allowClear
              prefixIcon="fas fa-sitemap"
              menuMinWidth={280}
            />
          </div>

          <div className="col-md-2">
            <div className="input-group input-group-sm">
              <select
                className="form-select form-select-sm"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Mọi loại thiết bị --</option>
                {typeOptions.map((tp) => (
                  <option key={tp} value={tp}>
                    {tp} {facets.typeCounts[tp] ? `(${facets.typeCounts[tp]})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline-secondary px-2"
                title="Quản lý danh sách Loại thiết bị"
                onClick={() => openTypeGroupManager("type")}
              >
                <i className="fas fa-cog"></i>
              </button>
            </div>
          </div>

          <div className="col-md-2">
            <div className="input-group input-group-sm">
              <select
                className="form-select form-select-sm"
                value={groupFilter}
                onChange={(e) => {
                  setGroupFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Mọi nhóm máy --</option>
                {groupOptions.map((grp) => (
                  <option key={grp} value={grp}>
                    {grp} {facets.groupCounts[grp] ? `(${facets.groupCounts[grp]})` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-outline-secondary px-2"
                title="Quản lý danh sách Nhóm máy"
                onClick={() => openTypeGroupManager("group")}
              >
                <i className="fas fa-cog"></i>
              </button>
            </div>
          </div>

          <div className="col-md-2">
            <div className="input-group input-group-sm">
              <select
                className="form-select form-select-sm"
                value={customerFilter}
                onChange={(e) => {
                  setCustomerFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Mọi vị trí / Khách &amp; Kho --</option>
                <optgroup label="🏢 KHO BÃI CÔNG TY">
                  <option value="IN_WAREHOUSE">📦 Tất cả máy trong kho</option>
                  {warehouses.map((w) => (
                    <option key={`WH:${w.id}`} value={`WH:${w.id}`}>
                      🏢 {w.name} ({w.equipmentCount ?? 0} máy)
                    </option>
                  ))}
                </optgroup>
                <optgroup label="👥 KHÁCH HÀNG">
                  <option value="ASSIGNED">👥 Tất cả máy tại khách hàng</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              </select>
              <button
                type="button"
                className="btn btn-outline-secondary px-2"
                title="Quản lý danh sách Kho bãi"
                onClick={openWarehouseManager}
              >
                <i className="fas fa-warehouse text-warning"></i>
              </button>
            </div>
          </div>

          <div className="col-md-1">
            <select
              className="form-select form-select-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Trạng thái</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>

        {chips.length > 0 && (
          <div className="mt-2 pt-2 border-top">
            <ActiveFilterChips
              chips={chips}
              resultCount={total}
              onClearAll={() => {
                setSearch("");
                setCategoryFilter("");
                setBrandFilter("");
                setTypeFilter("");
                setGroupFilter("");
                setRelationFilter("");
                setCustomerFilter("");
                setStatusFilter("");
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* 4. Bảng Dữ Liệu Tương Phản Cao (Chỉ hiển thị thông tin chính của thiết bị) */}
      {loading ? (
        <Loading text="Đang tải danh sách thiết bị..." />
      ) : viewMode === "table" ? (
        <div
          className="table-responsive bg-white rounded shadow-sm border"
          style={{ maxHeight: "calc(100vh - 265px)" }}
        >
          <table className="table table-hover table-bordered mb-0 custom-dense-table table-sticky-header align-middle">
            <thead className="bg-dark text-white text-nowrap align-middle">
              <tr>
                <th className="px-3 py-2.5 text-center" style={{ width: "38px" }}>
                  <input
                    type="checkbox"
                    checked={items.length > 0 && selectedIds.length === items.length}
                    onChange={(e) =>
                      setSelectedIds(e.target.checked ? items.map((x) => x.id) : [])
                    }
                  />
                </th>
                <th className="py-2.5">
                  Thiết bị &amp; Dòng máy (Model)
                </th>
                <th style={{ width: "150px" }} className="text-center py-2.5">
                  Hình thức
                </th>
                <th style={{ width: "135px" }} className="text-end py-2.5">
                  Chỉ số Counter
                </th>
                <th style={{ width: "110px" }} className="text-center py-2.5">
                  Sức khỏe
                </th>
                <th style={{ width: "135px" }} className="text-center py-2.5">
                  Trạng thái
                </th>
                <th style={{ width: "175px" }} className="text-center py-2.5">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    Không tìm thấy thiết bị nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                items.map((eq) => {
                  const isExpanded = expandedRowIds.has(eq.id);
                  const locPath = formatLocationPath(eq);
                  const installLocation = [locPath, eq.locationNote].filter(Boolean).join(" • ");
                  const addressText = eq.branch?.address || eq.customer?.address || null;
                  const loc = installLocation || "Chưa gán vị trí";
                  const catPath = getCategoryPath(eq.category);

                  const rowClass =
                    eq.status === "FAULTY"
                      ? "table-danger bg-danger-subtle"
                      : eq.status === "WAITING_PARTS"
                        ? "table-warning bg-warning-subtle"
                        : "";

                  return (
                    <React.Fragment key={eq.id}>
                      <tr className={rowClass}>
                        <td className="px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(eq.id)}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(eq.id)
                                  ? prev.filter((x) => x !== eq.id)
                                  : [...prev, eq.id]
                              )
                            }
                          />
                        </td>

                        {/* Cột gộp: Mã & Serial Number + Dòng máy (Model) */}
                        <td className="py-2">
                          <div className="min-w-0">
                            <div>
                              <Link
                                href={`/equipment/${eq.id}`}
                                className="text-decoration-none d-inline-flex align-items-baseline gap-1.5 flex-wrap"
                                  title="Xem hồ sơ máy"
                                >
                                  <span className="fw-bold text-dark fs-6">
                                    {eq.model}
                                  </span>
                                  <span
                                    className="text-primary font-monospace fw-medium"
                                    style={{ fontSize: "12.5px" }}
                                  >
                                    (SN: {eq.serialNumber})
                                  </span>
                                </Link>
                              </div>
                              <div className="mt-1 d-flex flex-column gap-0.5">
                                {eq.customer ? (
                                  <>
                                    <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                      <span className="badge bg-light text-secondary border fw-normal" style={{ fontSize: "11px" }}>
                                        <i className="fas fa-building text-primary me-1"></i>
                                        {eq.customer.name}
                                      </span>
                                    </div>

                                    {/* Địa chỉ khách hàng / chi nhánh */}
                                    {addressText && (
                                      <div
                                        className="text-muted mt-0.5 d-flex align-items-center gap-1"
                                        style={{ fontSize: "11px" }}
                                        title={`Địa chỉ: ${addressText}`}
                                      >
                                        <i className="fas fa-map-marker-alt text-secondary flex-shrink-0" style={{ fontSize: "10px" }}></i>
                                        <span className="text-truncate" style={{ maxWidth: "100%" }}>
                                          {addressText}
                                        </span>
                                      </div>
                                    )}

                                    {/* Vị trí lắp đặt phía dưới địa chỉ */}
                                    {installLocation ? (
                                      <div
                                        className="text-dark mt-0.5 d-flex align-items-center gap-1"
                                        style={{ fontSize: "11px" }}
                                        title={`Vị trí lắp đặt: ${installLocation}`}
                                      >
                                        <i className="fas fa-map-pin text-danger flex-shrink-0" style={{ fontSize: "10px" }}></i>
                                        <span className="text-truncate" style={{ maxWidth: "100%" }}>
                                          <span className="text-muted">Vị trí:</span>{" "}
                                          <strong className="fw-semibold text-dark">{installLocation}</strong>
                                        </span>
                                      </div>
                                    ) : (
                                      <div
                                        className="text-muted mt-0.5 d-flex align-items-center gap-1 opacity-75 fst-italic"
                                        style={{ fontSize: "10.5px" }}
                                      >
                                        <i className="fas fa-map-pin text-muted flex-shrink-0" style={{ fontSize: "9.5px" }}></i>
                                        <span>Chưa gán vị trí lắp đặt</span>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                      <span className="badge bg-warning-subtle text-dark border border-warning fw-medium" style={{ fontSize: "11px" }}>
                                        <i className="fas fa-warehouse text-warning me-1"></i>
                                        {eq.warehouse?.name || "Kho công ty"}
                                      </span>
                                    </div>

                                    {/* Địa chỉ kho */}
                                    {eq.warehouse?.address && (
                                      <div
                                        className="text-muted mt-0.5 d-flex align-items-center gap-1"
                                        style={{ fontSize: "11px" }}
                                        title={`Địa chỉ kho: ${eq.warehouse.address}`}
                                      >
                                        <i className="fas fa-map-marker-alt text-secondary flex-shrink-0" style={{ fontSize: "10px" }}></i>
                                        <span className="text-truncate" style={{ maxWidth: "100%" }}>
                                          {eq.warehouse.address}
                                        </span>
                                      </div>
                                    )}

                                    {/* Vị trí trong kho */}
                                    {eq.locationNote && (
                                      <div
                                        className="text-dark mt-0.5 d-flex align-items-center gap-1"
                                        style={{ fontSize: "11px" }}
                                        title={`Vị trí trong kho: ${eq.locationNote}`}
                                      >
                                        <i className="fas fa-box text-warning flex-shrink-0" style={{ fontSize: "10px" }}></i>
                                        <span className="text-truncate" style={{ maxWidth: "100%" }}>
                                          <span className="text-muted">Vị trí:</span>{" "}
                                          <strong className="fw-semibold text-dark">{eq.locationNote}</strong>
                                        </span>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                        </td>

                        {/* Cột 2: Hình thức (Cho thuê, Bảo trì, Sửa chữa... hoặc Sẵn hàng nếu trong kho) */}
                        <td className="text-center align-middle">
                          {(!eq.customer && !eq.customerId) || eq.status === "IN_STOCK" || eq.status === "RECALLED" || eq.relationType === "Sẵn hàng" ? (
                            <span
                              className="badge bg-light text-secondary border border-secondary-subtle fw-medium"
                              style={{ fontSize: "11px", padding: "5px 9px", whiteSpace: "nowrap" }}
                              title="Thiết bị trong kho, sẵn hàng bàn giao"
                            >
                              Sẵn hàng
                            </span>
                          ) : (
                            <span
                              className={getRelationBadgeClass(eq.relationType)}
                              style={{ fontSize: "11px", padding: "5px 9px", whiteSpace: "nowrap" }}
                              title={`Hình thức: ${eq.relationType}`}
                            >
                              {eq.relationType || "—"}
                            </span>
                          )}
                        </td>

                        {/* Cột 3: Counter hiện tại */}
                        <td className="text-end align-middle">
                          <span className="font-monospace fw-bold text-dark fs-6">
                            {eq.currentCounter.toLocaleString("vi-VN")}
                          </span>
                          <span className="text-muted ms-1 small">bản</span>
                        </td>

                        {/* Cột 3: Sức khỏe máy */}
                        <td className="text-center align-middle">
                          <span
                            className={`fw-bold small ${
                              eq.healthScore >= 80
                                ? "text-success"
                                : eq.healthScore >= 50
                                  ? "text-warning-emphasis"
                                  : "text-danger"
                            }`}
                          >
                            {eq.healthScore}%
                          </span>
                        </td>

                        {/* Cột 4: Trạng thái */}
                        <td className="text-center align-middle">
                          <span
                            className={getStatusBadgeClass(eq.status)}
                            style={{ fontSize: "11px", padding: "5px 8px", cursor: "pointer" }}
                            onClick={() => {
                              setStatusTarget(eq);
                              setNewStatus(eq.status);
                              setStatusNote("");
                            }}
                            title="Bấm để đổi trạng thái nhanh"
                          >
                            {STATUS_LABELS[eq.status] || eq.status}
                          </span>
                        </td>

                        {/* Cột 5: Thao tác */}
                        <td className="text-center align-middle">
                          <div className="d-inline-flex align-items-center justify-content-center gap-1 flex-nowrap">
                            {/* Split Button: Xem toàn bộ hồ sơ máy & Mở rộng xem nhanh thông tin liên kết */}
                            <div className="btn-group btn-group-sm">
                              <Link
                                href={`/equipment/${eq.id}`}
                                className="btn btn-sm btn-outline-primary fw-semibold d-inline-flex align-items-center justify-content-center gap-1 text-nowrap"
                                style={{ height: "28px", padding: "0 8px", fontSize: "11.5px" }}
                                title="Xem toàn bộ hồ sơ vòng đời máy"
                              >
                                <i className="fas fa-eye" style={{ fontSize: "11px" }}></i>
                                <span>Hồ sơ</span>
                              </Link>
                              <button
                                type="button"
                                className={`btn btn-sm ${
                                  isExpanded
                                    ? "btn-primary text-white"
                                    : "btn-outline-primary"
                                } px-1.5 d-inline-flex align-items-center justify-content-center`}
                                style={{ height: "28px" }}
                                onClick={() => toggleRow(eq.id)}
                                title={
                                  isExpanded
                                    ? "Thu gọn thông tin liên kết"
                                    : "Xem nhanh thông tin liên kết (Hợp đồng, định mức, kỹ thuật...)"
                                }
                              >
                                <i
                                  className={`fas fa-chevron-${isExpanded ? "up" : "down"}`}
                                  style={{ fontSize: "10px" }}
                                ></i>
                              </button>
                            </div>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary p-0 d-inline-flex align-items-center justify-content-center"
                              style={{ width: "28px", height: "28px" }}
                              onClick={() => openEdit(eq)}
                              title="Chỉnh sửa thiết bị"
                            >
                              <i className="fas fa-pen" style={{ fontSize: "11px" }}></i>
                            </button>

                            <Link
                              href={`/api/equipment/${eq.id}/qr`}
                              target="_blank"
                              className="btn btn-sm btn-outline-dark p-0 d-inline-flex align-items-center justify-content-center"
                              style={{ width: "28px", height: "28px" }}
                              title="In tem QR Code"
                            >
                              <i className="fas fa-qrcode" style={{ fontSize: "11px" }}></i>
                            </Link>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger p-0 d-inline-flex align-items-center justify-content-center"
                              style={{ width: "28px", height: "28px" }}
                              onClick={() => handleDeleteEquipment(eq)}
                              title="Xóa thiết bị"
                            >
                              <i className="fas fa-trash-alt" style={{ fontSize: "11px" }}></i>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Khối Sổ Ra (Thông tin liên kết xem khi cần) */}
                      {isExpanded && (
                        <tr className="table-light">
                          <td colSpan={7} className="p-3 bg-light border-top border-bottom">
                            <div className="row g-3">
                              <div className="col-12 col-xl-8">
                                <div className="bg-white rounded border p-3 h-100">
                                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                                    <span className="fw-bold text-dark" style={{ fontSize: "13px" }}>
                                      <i className="fas fa-sliders-h text-primary me-1.5"></i>
                                      Thông tin liên kết: Khách hàng, Hợp đồng &amp; Phân loại chi tiết
                                    </span>
                                    <div className="d-flex gap-1.5">
                                      {eq.customerId && (
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-outline-danger fw-semibold"
                                          style={{ fontSize: "11.5px", height: "26px", padding: "0 10px" }}
                                          onClick={() => {
                                            setTicketTarget(eq);
                                            setTicketForm({
                                              type:
                                                eq.relationType === "Bảo trì định kỳ"
                                                  ? "MAINTENANCE"
                                                  : "REPAIR",
                                              priority: "NORMAL",
                                              description: `Yêu cầu kỹ thuật (${eq.relationType}) cho máy ${eq.brand || ""} ${eq.model} (SN: ${eq.serialNumber})`,
                                            });
                                          }}
                                        >
                                          <i className="fas fa-tools me-1"></i>Tạo phiếu Kỹ thuật
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-warning text-dark fw-semibold"
                                        style={{ fontSize: "11.5px", height: "26px", padding: "0 10px" }}
                                        onClick={() => {
                                          setStatusTarget(eq);
                                          setNewStatus(eq.status);
                                          setStatusNote("");
                                        }}
                                      >
                                        <i className="fas fa-exchange-alt me-1"></i>Đổi trạng thái
                                      </button>
                                    </div>
                                  </div>

                                  <div className="row g-2 small">
                                    <div className="col-md-4">
                                      <span className="text-muted d-block" style={{ fontSize: "11px" }}>
                                        Hãng • Loại • Nhóm máy:
                                      </span>
                                      <strong className="text-dark">
                                        {eq.brand || "—"} • {eq.type} • {eq.group}
                                      </strong>
                                    </div>
                                    <div className="col-md-4">
                                      <span className="text-muted d-block" style={{ fontSize: "11px" }}>
                                        Hình thức quan hệ:
                                      </span>
                                      {(!eq.customer && !eq.customerId) || eq.status === "IN_STOCK" || eq.status === "RECALLED" || eq.relationType === "Sẵn hàng" ? (
                                        <span className="badge bg-light text-secondary border border-secondary-subtle fw-medium">
                                          Sẵn hàng
                                        </span>
                                      ) : (
                                        <span className={getRelationBadgeClass(eq.relationType)}>
                                          {eq.relationType || "—"}
                                        </span>
                                      )}
                                    </div>
                                    <div className="col-md-4">
                                      <span className="text-muted d-block" style={{ fontSize: "11px" }}>
                                        Hợp đồng áp dụng:
                                      </span>
                                      <strong className="font-monospace text-primary">
                                        {eq.contract?.code || "— (Dịch vụ lẻ)"}
                                      </strong>
                                    </div>

                                    <div className="col-md-4">
                                      <span className="text-muted d-block" style={{ fontSize: "11px" }}>
                                        Định mức &amp; Giá vượt:
                                      </span>
                                      <strong className="text-dark">
                                        {eq.baseQuota !== null
                                          ? `${eq.baseQuota.toLocaleString("vi-VN")} bản`
                                          : eq.contract?.baseQuota
                                            ? `${eq.contract.baseQuota.toLocaleString("vi-VN")} bản (Theo HĐ)`
                                            : "Không định mức"}
                                      </strong>
                                      {eq.overagePrice !== null && (
                                        <span className="text-secondary ms-1">
                                          ({Number(eq.overagePrice).toLocaleString("vi-VN")} ₫/bản)
                                        </span>
                                      )}
                                    </div>

                                    <div className="col-md-4">
                                      <span className="text-muted d-block" style={{ fontSize: "11px" }}>
                                        Lắp đặt &amp; Hạn bảo hành-bảo trì:
                                      </span>
                                      <strong className="text-dark">
                                        Lắp: {formatDate(eq.installedAt)} • Hạn:{" "}
                                        {formatDate(eq.warrantyUntil)}
                                      </strong>
                                    </div>

                                    <div className="col-md-4">
                                      <span className="text-muted d-block" style={{ fontSize: "11px" }}>
                                        Lịch sử kỹ thuật:
                                      </span>
                                      <strong className="text-primary">
                                        {eq._count?.tickets ?? 0} phiếu kỹ thuật
                                      </strong>{" "}
                                      •{" "}
                                      <strong className="text-success">
                                        {eq._count?.partHistory ?? 0} lần thay LK
                                      </strong>
                                    </div>

                                    {eq.notes && (
                                      <div className="col-12 mt-1">
                                        <span className="text-muted d-block" style={{ fontSize: "11px" }}>
                                          Ghi chú kỹ thuật / dịch vụ:
                                        </span>
                                        <div className="bg-light p-2 rounded border text-secondary">
                                          {eq.notes}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="col-12 col-xl-4">
                                <div className="bg-white rounded border p-3 h-100 d-flex flex-column justify-content-between">
                                  <div>
                                    <div className="fw-bold text-dark mb-2" style={{ fontSize: "13px" }}>
                                      <i className="fas fa-building text-primary me-1.5"></i>
                                      Khách hàng &amp; Vị trí lắp đặt
                                    </div>
                                    {eq.customer ? (
                                      <div className="small">
                                        <div className="fw-bold text-dark fs-6">
                                          {eq.customer.name}
                                        </div>
                                        {eq.customer.phone && (
                                          <div className="text-secondary mt-1">
                                            <i className="fas fa-phone-alt text-success me-1"></i>
                                            {eq.customer.phone}
                                          </div>
                                        )}
                                        <div className="text-secondary mt-1">
                                          <i className="fas fa-map-marker-alt text-danger me-1"></i>
                                          {loc}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="small">
                                        <div className="badge bg-warning-subtle text-dark border border-warning mb-2 px-2 py-1">
                                          <i className="fas fa-warehouse text-warning me-1.5"></i>
                                          Đang lưu tại kho công ty
                                        </div>
                                        <div className="fw-bold text-dark fs-6">
                                          {eq.warehouse?.name || "Kho công ty"}
                                        </div>
                                        {eq.warehouse?.address && (
                                          <div className="text-secondary mt-1">
                                            <i className="fas fa-map-marker-alt text-danger me-1"></i>
                                            {eq.warehouse.address}
                                          </div>
                                        )}
                                        {eq.locationNote && (
                                          <div className="text-muted mt-1">
                                            <i className="fas fa-tag text-info me-1"></i>
                                            Vị trí trong kho: <span className="fw-semibold text-dark">{eq.locationNote}</span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  <div className="d-flex justify-content-end gap-2 mt-2 pt-2 border-top">
                                    <Link
                                      href={`/equipment/${eq.id}`}
                                      className="btn btn-sm btn-primary fw-bold"
                                    >
                                      Xem toàn bộ vòng đời máy ›
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Card View: Chỉ hiển thị thông tin chính của thiết bị */
        <div className="row g-3">
          {items.map((eq) => (
            <div key={eq.id} className="col-12 col-md-6 col-xl-4">
              <div className="card shadow-sm border rounded-3 h-100">
                <div className="card-header bg-white py-2 d-flex justify-content-between align-items-center border-bottom">
                  <Link
                    href={`/equipment/${eq.id}`}
                    className="text-decoration-none d-flex align-items-baseline gap-1.5 flex-wrap text-truncate me-2"
                    title="Xem hồ sơ máy"
                  >
                    <span className="fw-bold text-dark fs-6 text-truncate">
                      {eq.model}
                    </span>
                    <span
                      className="text-primary font-monospace fw-medium"
                      style={{ fontSize: "12px" }}
                    >
                      (SN: {eq.serialNumber})
                    </span>
                  </Link>
                  <span className={getStatusBadgeClass(eq.status)}>
                    {STATUS_LABELS[eq.status]}
                  </span>
                </div>
                <div className="card-body p-3">
                  <div className="mb-2">
                    {eq.customer ? (
                      <div className="d-flex flex-column gap-0.5">
                        <div className="d-flex align-items-center gap-1.5 flex-wrap">
                          <span className="badge bg-light text-secondary border fw-normal" style={{ fontSize: "11px" }}>
                            <i className="fas fa-building text-primary me-1"></i>
                            {eq.customer.name}
                          </span>
                        </div>
                        {(eq.branch?.address || eq.customer.address) && (
                          <div
                            className="text-muted mt-0.5 d-flex align-items-center gap-1"
                            style={{ fontSize: "11px" }}
                            title={`Địa chỉ: ${eq.branch?.address || eq.customer.address}`}
                          >
                            <i className="fas fa-map-marker-alt text-secondary flex-shrink-0" style={{ fontSize: "10px" }}></i>
                            <span className="text-truncate" style={{ maxWidth: "100%" }}>
                              {eq.branch?.address || eq.customer.address}
                            </span>
                          </div>
                        )}
                        {[formatLocationPath(eq), eq.locationNote].filter(Boolean).join(" • ") ? (
                          <div
                            className="text-dark mt-0.5 d-flex align-items-center gap-1"
                            style={{ fontSize: "11px" }}
                            title={`Vị trí lắp đặt: ${[formatLocationPath(eq), eq.locationNote].filter(Boolean).join(" • ")}`}
                          >
                            <i className="fas fa-map-pin text-danger flex-shrink-0" style={{ fontSize: "10px" }}></i>
                            <span className="text-truncate" style={{ maxWidth: "100%" }}>
                              <span className="text-muted">Vị trí:</span>{" "}
                              <strong className="fw-semibold text-dark">
                                {[formatLocationPath(eq), eq.locationNote].filter(Boolean).join(" • ")}
                              </strong>
                            </span>
                          </div>
                        ) : (
                          <div
                            className="text-muted mt-0.5 d-flex align-items-center gap-1 opacity-75 fst-italic"
                            style={{ fontSize: "10.5px" }}
                          >
                            <i className="fas fa-map-pin text-muted flex-shrink-0" style={{ fontSize: "9.5px" }}></i>
                            <span>Chưa gán vị trí lắp đặt</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="d-flex flex-column gap-0.5">
                        <div className="d-flex align-items-center gap-1.5 flex-wrap">
                          <span className="badge bg-warning-subtle text-dark border border-warning fw-medium" style={{ fontSize: "11px" }}>
                            <i className="fas fa-warehouse text-warning me-1"></i>
                            {eq.warehouse?.name || "Kho công ty"}
                          </span>
                        </div>
                        {eq.warehouse?.address && (
                          <div
                            className="text-muted mt-0.5 d-flex align-items-center gap-1"
                            style={{ fontSize: "11px" }}
                            title={`Địa chỉ kho: ${eq.warehouse.address}`}
                          >
                            <i className="fas fa-map-marker-alt text-secondary flex-shrink-0" style={{ fontSize: "10px" }}></i>
                            <span className="text-truncate" style={{ maxWidth: "100%" }}>
                              {eq.warehouse.address}
                            </span>
                          </div>
                        )}
                        {eq.locationNote && (
                          <div
                            className="text-dark mt-0.5 d-flex align-items-center gap-1"
                            style={{ fontSize: "11px" }}
                            title={`Vị trí trong kho: ${eq.locationNote}`}
                          >
                            <i className="fas fa-box text-warning flex-shrink-0" style={{ fontSize: "10px" }}></i>
                            <span className="text-truncate" style={{ maxWidth: "100%" }}>
                              <span className="text-muted">Vị trí:</span>{" "}
                              <strong className="fw-semibold text-dark">{eq.locationNote}</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="d-flex justify-content-between align-items-center small text-secondary bg-light p-2 rounded border mb-2">
                    <div>
                      Counter: <strong className="font-monospace text-dark">{eq.currentCounter.toLocaleString("vi-VN")}</strong> bản
                    </div>
                    <div>
                      Sức khỏe: <strong className="text-success">{eq.healthScore}%</strong>
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center pt-2 border-top">
                    <Link href={`/equipment/${eq.id}`} className="btn btn-outline-primary btn-sm">
                      Hồ sơ máy
                    </Link>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => openEdit(eq)}
                    >
                      <i className="fas fa-pen me-1"></i> Sửa
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Phân trang */}
      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center mt-3 bg-white p-2 px-3 rounded border shadow-xs">
          <div className="small text-muted">
            Hiển thị <strong>{items.length}</strong> / <strong>{total}</strong> thiết bị (Trang{" "}
            {page}/{totalPages})
          </div>
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹ Trước
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau ›
            </button>
          </div>
        </div>
      )}

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
      >
        <button
          className="btn btn-success btn-sm rounded-pill px-3"
          onClick={() => handleBatchStatus("ACTIVE")}
        >
          Chuyển: Đang hoạt động
        </button>
        <button
          className="btn btn-danger btn-sm rounded-pill px-3"
          onClick={() => handleBatchStatus("FAULTY")}
        >
          Chuyển: Báo lỗi
        </button>
        <button
          className="btn btn-info text-white btn-sm rounded-pill px-3"
          onClick={() => handleBatchStatus("IN_STOCK")}
        >
          Thu về kho
        </button>
      </BatchActionBar>

      {/* Modal Thêm / Sửa Thiết bị */}
      <ModalShell
        show={showModal}
        size="xl"
        scrollable={false}
        bodyClass="p-3"
        dialogStyle={{ maxWidth: "min(1360px, 95vw)", width: "100%" }}
        title={
          <div className="d-flex align-items-center gap-2">
            <i className={`fas ${editing ? "fa-pen-to-square" : "fa-plus-circle"} text-white-50`}></i>
            <span className="fw-semibold">
              {editing
                ? `Cập nhật hồ sơ thiết bị: ${editing.serialNumber}`
                : "Thêm hồ sơ thiết bị mới"}
            </span>
          </div>
        }
        onClose={() => setShowModal(false)}
        footer={
          <div className="d-flex justify-content-between align-items-center w-100">
            <div className="d-flex align-items-center gap-1.5 text-secondary" style={{ fontSize: "11.5px" }}>
              <i className="fas fa-shield-alt text-success"></i>
              <span>Hồ sơ tự động cập nhật nhật ký &amp; lịch sử điều chuyển</span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm px-3.5 d-inline-flex align-items-center gap-1.5"
                onClick={() => setShowModal(false)}
              >
                <i className="fas fa-times text-muted"></i>
                <span>Hủy</span>
              </button>
              <button
                type="submit"
                form="equipment-form"
                disabled={saving}
                className="btn btn-primary btn-sm px-3.5 fw-semibold d-inline-flex align-items-center gap-1.5 shadow-sm"
              >
                {saving ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <i className="fas fa-check"></i>
                    <span>{editing ? "Cập nhật thiết bị" : "Lưu thiết bị"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        }
      >
        <form id="equipment-form" onSubmit={handleSave}>
          <div className="row g-3">
            {/* CỘT TRÁI: Nhóm 1 (Định danh & Phân loại) + Nhóm 3 (Vận hành & Định mức) */}
            <div className="col-12 col-lg-6 d-flex flex-column gap-3">
              {/* Nhóm 1: Thông tin định danh & Phân loại */}
              <div className="bg-white p-3 rounded-3 border shadow-xs">
                <div className="d-flex align-items-center gap-2 pb-2 mb-2.5 border-bottom">
                  <span className="badge rounded-circle bg-primary-subtle text-primary fw-bold d-inline-flex align-items-center justify-content-center" style={{ width: "20px", height: "20px", fontSize: "11px" }}>
                    1
                  </span>
                  <span className="fw-semibold text-dark" style={{ fontSize: "13px" }}>
                    Định danh &amp; Phân loại thiết bị
                  </span>
                </div>

                <div className="row g-2.5">
                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold text-secondary mb-1 d-flex align-items-center" style={{ minHeight: "20px" }}>
                      <span>Số Serial (S/N)</span>
                      <span className="text-danger ms-1">*</span>
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
                        <i className="fas fa-barcode"></i>
                      </span>
                      <input
                        type="text"
                        required
                        disabled={!!editing}
                        placeholder="VD: RC-MP6055-8821"
                        className="form-control form-control-sm font-monospace"
                        value={formData.serialNumber}
                        onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold text-secondary mb-1 d-flex align-items-center" style={{ minHeight: "20px" }}>
                      <span>Tên dòng máy (Model)</span>
                      <span className="text-danger ms-1">*</span>
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                    <label className="form-label small fw-semibold text-secondary mb-1 d-flex align-items-center" style={{ minHeight: "20px" }}>
                      <span>Mã quản lý</span>
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: "20px" }}>
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
                          <span className="text-dark fw-normal text-truncate" title={node ? node.fullPath : opt.label}>
                            {opt.label}
                          </span>
                        );
                      }}
                    />
                  </div>

                  <div className="col-sm-4">
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: "20px" }}>
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
                        <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: "20px" }}>
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
                        <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                    <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: "20px" }}>
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
                        <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                  <span className="badge rounded-circle bg-primary-subtle text-primary fw-bold d-inline-flex align-items-center justify-content-center" style={{ width: "20px", height: "20px", fontSize: "11px" }}>
                    3
                  </span>
                  <span className="fw-semibold text-dark" style={{ fontSize: "13px" }}>
                    Trạng thái vận hành &amp; Định mức
                  </span>
                </div>

                <div className="row g-2.5">
                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold text-secondary mb-1 text-nowrap" style={{ minHeight: "20px" }}>
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
                    <label className="form-label small fw-semibold text-secondary mb-1 text-nowrap" style={{ minHeight: "20px" }}>
                      Counter hiện tại
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
                        <i className="fas fa-tachometer-alt"></i>
                      </span>
                      <input
                        type="number"
                        min={0}
                        className="form-control form-control-sm font-monospace"
                        value={formData.currentCounter}
                        onChange={(e) => setFormData({ ...formData, currentCounter: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="col-sm-6">
                    <label className="form-label small fw-semibold text-secondary mb-1 text-nowrap" style={{ minHeight: "20px" }}>
                      Định mức riêng (bản/tháng)
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                    <label className="form-label small fw-semibold text-secondary mb-1 text-nowrap" style={{ minHeight: "20px" }}>
                      Giá vượt riêng (đ/bản)
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
                        <i className="fas fa-coins"></i>
                      </span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        placeholder="Theo HĐ"
                        className="form-control form-control-sm"
                        value={formData.overagePrice}
                        onChange={(e) => setFormData({ ...formData, overagePrice: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="col-12">
                    <label className="form-label small fw-semibold text-secondary mb-1" style={{ minHeight: "20px" }}>
                      Ghi chú {destinationMode === "WAREHOUSE" ? "kho / nguồn gốc" : "kỹ thuật & dịch vụ"}
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                    <span className="badge rounded-circle bg-primary-subtle text-primary fw-bold d-inline-flex align-items-center justify-content-center" style={{ width: "20px", height: "20px", fontSize: "11px" }}>
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
                    <i className={`fas ${destinationMode === "WAREHOUSE" ? "fa-warehouse" : "fa-building"} me-1`}></i>
                    {destinationMode === "WAREHOUSE" ? "Lưu kho (Sẵn sàng)" : "Khách hàng (Hoạt động)"}
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
                        <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: "20px" }}>
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
                        <label className="form-label small fw-semibold text-secondary mb-1" style={{ minHeight: "20px" }}>
                          Vị trí trong kho
                        </label>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
                            <i className="fas fa-map-pin"></i>
                          </span>
                          <input
                            type="text"
                            placeholder="VD: Kệ A1, Dãy 2..."
                            className="form-control form-control-sm"
                            value={formData.locationNote}
                            onChange={(e) => setFormData({ ...formData, locationNote: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="col-sm-6">
                        <label className="form-label small fw-semibold text-secondary mb-1" style={{ minHeight: "20px" }}>
                          Hạn bảo hành NCC
                        </label>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
                            <i className="fas fa-calendar-alt"></i>
                          </span>
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={formData.warrantyUntil}
                            onChange={(e) => setFormData({ ...formData, warrantyUntil: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Thẻ hướng dẫn quy chuẩn lưu kho tạo cân bằng chiều cao 2 cột */}
                      <div className="col-12 mt-3">
                        <div className="p-3 rounded-2 bg-white border border-secondary-subtle">
                          <div className="d-flex align-items-center gap-1.5 text-primary fw-semibold mb-2" style={{ fontSize: "12px" }}>
                            <i className="fas fa-clipboard-check text-primary"></i>
                            <span>Quy chuẩn thiết bị lưu kho &amp; Sẵn sàng bàn giao</span>
                          </div>
                          <div className="d-flex flex-column gap-2 text-muted" style={{ fontSize: "11.5px" }}>
                            <div className="d-flex align-items-start gap-2">
                              <i className="fas fa-check-circle text-success mt-0.5 flex-shrink-0" style={{ fontSize: "11px" }}></i>
                              <span>Thiết bị ở trạng thái <strong>Sẵn sàng (Kho)</strong>, không gắn hợp đồng hay phát sinh dịch vụ.</span>
                            </div>
                            <div className="d-flex align-items-start gap-2">
                              <i className="fas fa-check-circle text-success mt-0.5 flex-shrink-0" style={{ fontSize: "11px" }}></i>
                              <span>Ghi rõ vị trí kệ/dãy kho để kỹ thuật viên xuất kho hoặc kiểm kê tài sản nhanh chóng.</span>
                            </div>
                            <div className="d-flex align-items-start gap-2">
                              <i className="fas fa-shield-alt text-info mt-0.5 flex-shrink-0" style={{ fontSize: "11px" }}></i>
                              <span>Theo dõi hạn bảo hành NCC phục vụ chính sách đổi trả hoặc bảo hành linh kiện chính hãng.</span>
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
                        <label className="form-label small fw-semibold text-secondary mb-1" style={{ minHeight: "20px" }}>
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
                        <div className="d-flex justify-content-between align-items-center mb-1" style={{ minHeight: "20px" }}>
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
                            <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
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
                        <label className="form-label small fw-semibold text-secondary mb-1" style={{ minHeight: "20px" }}>
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
                        <label className="form-label small fw-semibold text-secondary mb-1 text-truncate" style={{ minHeight: "20px" }} title="Vị trí lắp đặt (Sơ đồ tổ chức - Mọi cấp)">
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
                        <label className="form-label small fw-semibold text-secondary mb-1" style={{ minHeight: "20px" }}>
                          Vị trí cụ thể tại khách hàng
                        </label>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
                            <i className="fas fa-map-marker-alt"></i>
                          </span>
                          <input
                            type="text"
                            placeholder="VD: Cạnh phòng họp lầu 2..."
                            className="form-control form-control-sm"
                            value={formData.locationNote}
                            onChange={(e) => setFormData({ ...formData, locationNote: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="col-sm-5">
                        <label className="form-label small fw-semibold text-secondary mb-1" style={{ minHeight: "20px" }}>
                          Hạn bảo hành / bảo trì
                        </label>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text bg-light text-secondary" style={{ width: "32px", justifyContent: "center", fontSize: "12px", padding: 0 }}>
                            <i className="fas fa-calendar-check"></i>
                          </span>
                          <input
                            type="date"
                            className="form-control form-control-sm"
                            value={formData.warrantyUntil}
                            onChange={(e) => setFormData({ ...formData, warrantyUntil: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Gợi ý lưu ý tự động hóa trạng thái */}
                      <div className="col-12 mt-2">
                        <div className="px-3 py-2 rounded-2 bg-success-subtle border border-success-subtle d-flex align-items-center gap-2 text-success-emphasis" style={{ fontSize: "12px" }}>
                          <i className="fas fa-info-circle flex-shrink-0 text-success"></i>
                          <span>Máy sẽ tự động đồng bộ trạng thái <strong>Đang hoạt động</strong> khi được gán vào khách hàng.</span>
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
          {/* Cột Trái: Form Thêm / Sửa Danh mục */}
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
                      <div className="fw-bold text-dark text-truncate" style={{ maxWidth: "220px" }}>
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
                      <div className="small text-muted text-truncate" style={{ maxWidth: "220px" }}>
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
                      <div className="fw-bold text-dark">
                        Danh mục gốc
                      </div>
                    </>
                  )}
                </div>
                {(editingCat || activeParentNode) && (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-secondary py-1 px-2"
                    style={{ fontSize: "11px" }}
                    onClick={() => resetCatForm("")}
                    title="Chuyển về tạo danh mục gốc"
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
                    <label className="form-label small fw-bold text-muted mb-1">
                      THỨ TỰ
                    </label>
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
                    {catSaving ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-1.5"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Đang lưu...
                      </>
                    ) : editingCat ? (
                      <>
                        <i className="fas fa-check me-1.5"></i>Cập nhật danh mục
                      </>
                    ) : activeParentNode ? (
                      <>
                        <i className="fas fa-plus me-1.5"></i>Thêm vào nhánh này
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plus me-1.5"></i>Thêm danh mục gốc
                      </>
                    )}
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

          {/* Cột Phải: Cây Danh mục Đa cấp */}
          <div className="col-md-7">
            <div
              className="border rounded p-2.5 bg-light h-100 d-flex flex-column"
              style={{ minHeight: "440px" }}
            >
              {/* Header: Tiêu đề + Thao tác cây danh mục */}
              <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom flex-wrap gap-2">
                <div className="d-flex align-items-center gap-1.5">
                  <i className="fas fa-sitemap text-primary"></i>
                  <span className="small fw-bold text-dark">
                    Cây danh mục
                  </span>
                  <span
                    className="badge bg-secondary-subtle text-secondary border"
                    style={{ fontSize: "11px" }}
                  >
                    {categoriesFlat.length} danh mục
                  </span>
                </div>

                <div className="d-flex align-items-center gap-1">
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-secondary py-1 px-2"
                    style={{ fontSize: "11px" }}
                    onClick={() => {
                      const hasCollapsed = Object.keys(collapsedCatIds).some(
                        (k) => collapsedCatIds[k]
                      );
                      if (hasCollapsed) {
                        expandAllCats();
                      } else {
                        collapseAllCats();
                      }
                    }}
                    title={
                      Object.keys(collapsedCatIds).some((k) => collapsedCatIds[k])
                        ? "Mở rộng tất cả các nhánh"
                        : "Thu gọn tất cả các nhánh"
                    }
                  >
                    <i
                      className={`fas fa-${
                        Object.keys(collapsedCatIds).some((k) => collapsedCatIds[k])
                          ? "expand-arrows-alt"
                          : "compress-arrows-alt"
                      } me-1`}
                    ></i>
                    {Object.keys(collapsedCatIds).some((k) => collapsedCatIds[k])
                      ? "Mở rộng"
                      : "Thu gọn"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-primary py-1 px-2 fw-semibold"
                    style={{ fontSize: "11px" }}
                    onClick={() => resetCatForm("")}
                    title="Tạo danh mục gốc mới"
                  >
                    <i className="fas fa-plus me-1"></i>Thêm danh mục gốc
                  </button>
                </div>
              </div>

              {/* Ô tìm kiếm nhanh nếu có trên 3 danh mục */}
              {categoriesFlat.length > 3 && (
                <div className="input-group input-group-sm mb-2">
                  <span className="input-group-text bg-white border-end-0 text-muted">
                    <i className="fas fa-search fa-xs"></i>
                  </span>
                  <input
                    type="text"
                    className="form-control border-start-0 ps-1"
                    placeholder="Tìm nhanh danh mục..."
                    value={catSearch}
                    onChange={(e) => setCatSearch(e.target.value)}
                  />
                  {catSearch && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary border-start-0"
                      onClick={() => setCatSearch("")}
                    >
                      <i className="fas fa-times fa-xs"></i>
                    </button>
                  )}
                </div>
              )}

              {/* Danh sách cây dạng phân cấp trực quan */}
              <div
                className="category-tree-scroll flex-grow-1 bg-white border rounded p-2"
                style={{ maxHeight: "430px", overflowY: "auto" }}
              >
                {categoriesTree.length === 0 ? (
                  <div className="text-center py-5 text-muted small">
                    <i className="fas fa-folder-open fa-2x mb-2 text-muted opacity-50 d-block"></i>
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

      {/* Modal Quản lý Hãng, Loại thiết bị & Nhóm máy (Simple CRUD) */}
      <ModalShell
        show={showTypeGroupModal}
        size="lg"
        title="Hãng, Loại & Nhóm máy"
        onClose={() => setShowTypeGroupModal(false)}
        footer={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowTypeGroupModal(false)}
          >
            Đóng
          </button>
        }
      >
        {/* Nav Tabs */}
        <ul className="nav nav-pills mb-3 border-bottom pb-2">
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link btn-sm py-1.5 px-3 ${
                typeGroupActiveTab === "brand" ? "active fw-bold" : "text-dark"
              }`}
              onClick={() => {
                setTypeGroupActiveTab("brand");
                setEditingBrand(null);
                setBrandForm({ name: "", description: "", sortOrder: "0" });
              }}
            >
              <i className="fas fa-copyright me-1.5 text-info"></i>
              Hãng sản xuất <span className="badge bg-light text-dark ms-1">{dbBrands.length}</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link btn-sm py-1.5 px-3 ms-2 ${
                typeGroupActiveTab === "type" ? "active fw-bold" : "text-dark"
              }`}
              onClick={() => {
                setTypeGroupActiveTab("type");
                setEditingType(null);
                setTypeForm({ name: "", description: "", sortOrder: "0" });
              }}
            >
              <i className="fas fa-tags me-1.5 text-primary"></i>
              Loại thiết bị <span className="badge bg-light text-dark ms-1">{dbTypes.length}</span>
            </button>
          </li>
          <li className="nav-item">
            <button
              type="button"
              className={`nav-link btn-sm py-1.5 px-3 ms-2 ${
                typeGroupActiveTab === "group" ? "active fw-bold" : "text-dark"
              }`}
              onClick={() => {
                setTypeGroupActiveTab("group");
                setEditingGroup(null);
                setGroupForm({ name: "", description: "", sortOrder: "0" });
              }}
            >
              <i className="fas fa-layer-group me-1.5 text-success"></i>
              Nhóm máy <span className="badge bg-light text-dark ms-1">{dbGroups.length}</span>
            </button>
          </li>
        </ul>

        {typeGroupActiveTab === "brand" ? (
          <div className="row g-3">
            {/* Form Thêm/Sửa Hãng */}
            <div className="col-md-5">
              <div className="bg-light p-3 rounded border h-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong className="small text-uppercase text-dark">
                    {editingBrand ? `Sửa hãng: ${editingBrand.name}` : "Thêm hãng sản xuất mới"}
                  </strong>
                  {editingBrand && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      onClick={() => {
                        setEditingBrand(null);
                        setBrandForm({ name: "", description: "", sortOrder: "0" });
                      }}
                    >
                      + Tạo mới
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveBrand}>
                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">
                      TÊN HÃNG SẢN XUẤT <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Ricoh, Canon, Toshiba, Xerox..."
                      className="form-control form-control-sm"
                      value={brandForm.name}
                      onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">
                      THỨ TỰ HIỂN THỊ
                    </label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={brandForm.sortOrder}
                      onChange={(e) => setBrandForm({ ...brandForm, sortOrder: e.target.value })}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted mb-1">MÔ TẢ</label>
                    <textarea
                      rows={2}
                      placeholder="Ghi chú về hãng..."
                      className="form-control form-control-sm"
                      value={brandForm.description}
                      onChange={(e) => setBrandForm({ ...brandForm, description: e.target.value })}
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="submit"
                      disabled={typeGroupSaving}
                      className="btn btn-primary btn-sm flex-grow-1 fw-bold"
                    >
                      {typeGroupSaving
                        ? "Đang lưu..."
                        : editingBrand
                          ? "Cập nhật hãng"
                          : "Thêm hãng sản xuất"}
                    </button>
                    {editingBrand && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          setEditingBrand(null);
                          setBrandForm({ name: "", description: "", sortOrder: "0" });
                        }}
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* Danh sách Hãng */}
            <div className="col-md-7">
              <div className="border rounded p-2.5 bg-white h-100" style={{ maxHeight: "420px", overflowY: "auto" }}>
                <div className="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                  <span className="small fw-bold text-dark">
                    <i className="fas fa-list me-1 text-primary"></i>
                    Danh sách Hãng sản xuất ({dbBrands.length})
                  </span>
                </div>

                {dbBrands.length === 0 ? (
                  <div className="text-center py-4 text-muted small">
                    Chưa có hãng sản xuất nào được lưu trong hệ thống.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "12.5px" }}>
                      <thead className="table-light">
                        <tr>
                          <th>Tên hãng</th>
                          <th>Mô tả</th>
                          <th className="text-center" style={{ width: "80px" }}>Số máy</th>
                          <th className="text-end" style={{ width: "90px" }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbBrands.map((b) => {
                          const isEditing = editingBrand?.id === b.id;
                          return (
                            <tr key={b.id} className={isEditing ? "table-primary" : ""}>
                              <td>
                                <span className="fw-semibold text-dark">{b.name}</span>
                              </td>
                              <td>
                                <span className="text-muted small">{b.description || "—"}</span>
                              </td>
                              <td className="text-center">
                                <span className="badge bg-light text-dark border">
                                  {b.equipmentCount ?? 0} máy
                                </span>
                              </td>
                              <td className="text-end">
                                <div className="btn-group btn-group-sm">
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary py-0 px-1.5"
                                    style={{ fontSize: "11px", height: "24px" }}
                                    title="Chỉnh sửa"
                                    onClick={() => {
                                      setEditingBrand(b);
                                      setBrandForm({
                                        name: b.name,
                                        description: b.description || "",
                                        sortOrder: String(b.sortOrder ?? 0),
                                      });
                                    }}
                                  >
                                    <i className="fas fa-edit"></i>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger py-0 px-1.5"
                                    style={{ fontSize: "11px", height: "24px" }}
                                    title={
                                      (b.equipmentCount ?? 0) > 0
                                        ? "Đang có thiết bị thuộc hãng này, không thể xóa"
                                        : "Xóa hãng sản xuất"
                                    }
                                    disabled={(b.equipmentCount ?? 0) > 0}
                                    onClick={() => handleDeleteBrand(b)}
                                  >
                                    <i className="fas fa-trash-alt"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : typeGroupActiveTab === "type" ? (
          <div className="row g-3">
            {/* Form Thêm/Sửa Loại */}
            <div className="col-md-5">
              <div className="bg-light p-3 rounded border h-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong className="small text-uppercase text-dark">
                    {editingType ? `Sửa loại: ${editingType.name}` : "Thêm loại thiết bị mới"}
                  </strong>
                  {editingType && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      onClick={() => {
                        setEditingType(null);
                        setTypeForm({ name: "", description: "", sortOrder: "0" });
                      }}
                    >
                      + Tạo mới
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveType}>
                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">
                      TÊN LOẠI THIẾT BỊ <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Máy Photocopy màu, Máy in..."
                      className="form-control form-control-sm"
                      value={typeForm.name}
                      onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">
                      THỨ TỰ HIỂN THỊ
                    </label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={typeForm.sortOrder}
                      onChange={(e) => setTypeForm({ ...typeForm, sortOrder: e.target.value })}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted mb-1">MÔ TẢ</label>
                    <textarea
                      rows={2}
                      placeholder="Mô tả công năng hoặc phân loại..."
                      className="form-control form-control-sm"
                      value={typeForm.description}
                      onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="submit"
                      disabled={typeGroupSaving}
                      className="btn btn-primary btn-sm flex-grow-1 fw-bold"
                    >
                      {typeGroupSaving
                        ? "Đang lưu..."
                        : editingType
                          ? "Cập nhật loại"
                          : "Thêm loại thiết bị"}
                    </button>
                    {editingType && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          setEditingType(null);
                          setTypeForm({ name: "", description: "", sortOrder: "0" });
                        }}
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* Danh sách Loại */}
            <div className="col-md-7">
              <div className="border rounded p-2.5 bg-white h-100" style={{ maxHeight: "420px", overflowY: "auto" }}>
                <div className="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                  <span className="small fw-bold text-dark">
                    <i className="fas fa-list me-1 text-primary"></i>
                    Danh sách Loại thiết bị ({dbTypes.length})
                  </span>
                </div>

                {dbTypes.length === 0 ? (
                  <div className="text-center py-4 text-muted small">
                    Chưa có loại thiết bị nào được lưu trong hệ thống.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "12.5px" }}>
                      <thead className="table-light">
                        <tr>
                          <th>Tên loại</th>
                          <th>Mô tả</th>
                          <th className="text-center" style={{ width: "80px" }}>Số máy</th>
                          <th className="text-end" style={{ width: "90px" }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbTypes.map((t) => {
                          const isEditing = editingType?.id === t.id;
                          return (
                            <tr key={t.id} className={isEditing ? "table-primary" : ""}>
                              <td>
                                <span className="fw-semibold text-dark">{t.name}</span>
                              </td>
                              <td>
                                <span className="text-muted small">{t.description || "—"}</span>
                              </td>
                              <td className="text-center">
                                <span className="badge bg-light text-dark border">
                                  {t.equipmentCount ?? 0} máy
                                </span>
                              </td>
                              <td className="text-end">
                                <div className="btn-group btn-group-sm">
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary py-0 px-1.5"
                                    style={{ fontSize: "11px", height: "24px" }}
                                    title="Chỉnh sửa"
                                    onClick={() => {
                                      setEditingType(t);
                                      setTypeForm({
                                        name: t.name,
                                        description: t.description || "",
                                        sortOrder: String(t.sortOrder ?? 0),
                                      });
                                    }}
                                  >
                                    <i className="fas fa-edit"></i>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger py-0 px-1.5"
                                    style={{ fontSize: "11px", height: "24px" }}
                                    title={
                                      (t.equipmentCount ?? 0) > 0
                                        ? "Đang có thiết bị thuộc loại này, không thể xóa"
                                        : "Xóa loại thiết bị"
                                    }
                                    disabled={(t.equipmentCount ?? 0) > 0}
                                    onClick={() => handleDeleteType(t)}
                                  >
                                    <i className="fas fa-trash-alt"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="row g-3">
            {/* Form Thêm/Sửa Nhóm */}
            <div className="col-md-5">
              <div className="bg-light p-3 rounded border h-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <strong className="small text-uppercase text-dark">
                    {editingGroup ? `Sửa nhóm: ${editingGroup.name}` : "Thêm nhóm máy mới"}
                  </strong>
                  {editingGroup && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-decoration-none"
                      onClick={() => {
                        setEditingGroup(null);
                        setGroupForm({ name: "", description: "", sortOrder: "0" });
                      }}
                    >
                      + Tạo mới
                    </button>
                  )}
                </div>

                <form onSubmit={handleSaveGroup}>
                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">
                      TÊN NHÓM MÁY <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Khối văn phòng, Máy tốc độ cao..."
                      className="form-control form-control-sm"
                      value={groupForm.name}
                      onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    />
                  </div>

                  <div className="mb-2">
                    <label className="form-label small fw-bold text-muted mb-1">
                      THỨ TỰ HIỂN THỊ
                    </label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={groupForm.sortOrder}
                      onChange={(e) => setGroupForm({ ...groupForm, sortOrder: e.target.value })}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted mb-1">MÔ TẢ</label>
                    <textarea
                      rows={2}
                      placeholder="Mô tả nhóm sử dụng, mục đích..."
                      className="form-control form-control-sm"
                      value={groupForm.description}
                      onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="submit"
                      disabled={typeGroupSaving}
                      className="btn btn-success btn-sm flex-grow-1 fw-bold"
                    >
                      {typeGroupSaving
                        ? "Đang lưu..."
                        : editingGroup
                          ? "Cập nhật nhóm"
                          : "Thêm nhóm máy"}
                    </button>
                    {editingGroup && (
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => {
                          setEditingGroup(null);
                          setGroupForm({ name: "", description: "", sortOrder: "0" });
                        }}
                      >
                        Hủy
                      </button>
                    )}
                  </div>
                </form>
              </div>
            </div>

            {/* Danh sách Nhóm */}
            <div className="col-md-7">
              <div className="border rounded p-2.5 bg-white h-100" style={{ maxHeight: "420px", overflowY: "auto" }}>
                <div className="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                  <span className="small fw-bold text-dark">
                    <i className="fas fa-layer-group me-1 text-success"></i>
                    Danh sách Nhóm máy ({dbGroups.length})
                  </span>
                </div>

                {dbGroups.length === 0 ? (
                  <div className="text-center py-4 text-muted small">
                    Chưa có nhóm máy nào được lưu trong hệ thống.
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "12.5px" }}>
                      <thead className="table-light">
                        <tr>
                          <th>Tên nhóm</th>
                          <th>Mô tả</th>
                          <th className="text-center" style={{ width: "80px" }}>Số máy</th>
                          <th className="text-end" style={{ width: "90px" }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbGroups.map((g) => {
                          const isEditing = editingGroup?.id === g.id;
                          return (
                            <tr key={g.id} className={isEditing ? "table-success" : ""}>
                              <td>
                                <span className="fw-semibold text-dark">{g.name}</span>
                              </td>
                              <td>
                                <span className="text-muted small">{g.description || "—"}</span>
                              </td>
                              <td className="text-center">
                                <span className="badge bg-light text-dark border">
                                  {g.equipmentCount ?? 0} máy
                                </span>
                              </td>
                              <td className="text-end">
                                <div className="btn-group btn-group-sm">
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary py-0 px-1.5"
                                    style={{ fontSize: "11px", height: "24px" }}
                                    title="Chỉnh sửa"
                                    onClick={() => {
                                      setEditingGroup(g);
                                      setGroupForm({
                                        name: g.name,
                                        description: g.description || "",
                                        sortOrder: String(g.sortOrder ?? 0),
                                      });
                                    }}
                                  >
                                    <i className="fas fa-edit"></i>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger py-0 px-1.5"
                                    style={{ fontSize: "11px", height: "24px" }}
                                    title={
                                      (g.equipmentCount ?? 0) > 0
                                        ? "Đang có thiết bị thuộc nhóm này, không thể xóa"
                                        : "Xóa nhóm máy"
                                    }
                                    disabled={(g.equipmentCount ?? 0) > 0}
                                    onClick={() => handleDeleteGroup(g)}
                                  >
                                    <i className="fas fa-trash-alt"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      {/* Modal Quản lý Kho bãi Công ty (CRUD Kho) */}
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
          {/* Form Thêm/Sửa Kho */}
          <div className="col-md-5">
            <div className="bg-light p-3 rounded border h-100">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong className="small text-uppercase text-dark">
                  {editingWarehouse ? `Sửa kho: ${editingWarehouse.name}` : "Tạo kho mới"}
                </strong>
                {editingWarehouse && (
                  <button
                    type="button"
                    className="btn btn-link btn-sm p-0 text-decoration-none"
                    onClick={() => {
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
                    }}
                  >
                    + Tạo mới
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveWarehouse}>
                <div className="mb-2">
                  <label className="form-label small fw-bold text-muted mb-1">
                    TÊN KHO <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Kho Tổng TP.HCM, Kho Hà Nội..."
                    className="form-control form-control-sm"
                    value={warehouseForm.name}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
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
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted mb-1">THỨ TỰ</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={warehouseForm.sortOrder}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, sortOrder: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mb-2">
                  <label className="form-label small fw-bold text-muted mb-1">ĐỊA CHỈ KHO</label>
                  <input
                    type="text"
                    placeholder="VD: 123 Nguyễn Văn Cừ, Quận 5..."
                    className="form-control form-control-sm"
                    value={warehouseForm.address}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, address: e.target.value })}
                  />
                </div>

                <div className="row g-2 mb-2">
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted mb-1">THỦ KHO / PHỤ TRÁCH</label>
                    <input
                      type="text"
                      placeholder="Tên người quản lý"
                      className="form-control form-control-sm"
                      value={warehouseForm.managerName}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, managerName: e.target.value })}
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-bold text-muted mb-1">SĐT LIÊN HỆ</label>
                    <input
                      type="text"
                      placeholder="09..."
                      className="form-control form-control-sm"
                      value={warehouseForm.managerPhone}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, managerPhone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="mb-2">
                  <div className="form-check form-switch mt-1">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="isDefaultWhSwitch"
                      checked={warehouseForm.isDefault}
                      onChange={(e) => setWarehouseForm({ ...warehouseForm, isDefault: e.target.checked })}
                    />
                    <label className="form-check-label small fw-semibold text-dark" htmlFor="isDefaultWhSwitch">
                      Đặt làm Kho mặc định (cho máy mới/thu hồi)
                    </label>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label small fw-bold text-muted mb-1">GHI CHÚ</label>
                  <textarea
                    rows={2}
                    placeholder="Ghi chú công năng kho, máy ưu tiên lưu trữ..."
                    className="form-control form-control-sm"
                    value={warehouseForm.notes}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, notes: e.target.value })}
                  />
                </div>

                <div className="d-flex gap-2">
                  <button
                    type="submit"
                    disabled={warehouseSaving}
                    className="btn btn-warning btn-sm flex-grow-1 fw-bold text-dark"
                  >
                    {warehouseSaving
                      ? "Đang lưu..."
                      : editingWarehouse
                        ? "Cập nhật kho"
                        : "Tạo kho mới"}
                  </button>
                  {editingWarehouse && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => {
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
                      }}
                    >
                      Hủy
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Danh sách Kho */}
          <div className="col-md-7">
            <div className="border rounded p-2.5 bg-white h-100" style={{ maxHeight: "450px", overflowY: "auto" }}>
              <div className="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                <span className="small fw-bold text-dark">
                  <i className="fas fa-warehouse me-1 text-warning"></i>
                  Danh sách Kho bãi công ty ({warehouses.length})
                </span>
              </div>

              {warehouses.length === 0 ? (
                <div className="text-center py-4 text-muted small">
                  Chưa có kho nào được tạo. Hãy tạo kho đầu tiên bên trái.
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "12.5px" }}>
                    <thead className="table-light">
                      <tr>
                        <th>Tên kho</th>
                        <th>Địa chỉ &amp; Thủ kho</th>
                        <th className="text-center" style={{ width: "90px" }}>Số máy</th>
                        <th className="text-end" style={{ width: "85px" }}>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {warehouses.map((w) => {
                        const isEditing = editingWarehouse?.id === w.id;
                        return (
                          <tr key={w.id} className={isEditing ? "table-warning" : ""}>
                            <td>
                              <div className="d-flex align-items-center gap-1.5 flex-wrap">
                                <span className="fw-semibold text-dark">{w.name}</span>
                                {w.isDefault && (
                                  <span className="badge bg-warning text-dark border" style={{ fontSize: "9.5px" }}>
                                    Mặc định
                                  </span>
                                )}
                              </div>
                              {w.code && (
                                <div className="text-muted font-monospace" style={{ fontSize: "10.5px" }}>
                                  #{w.code}
                                </div>
                              )}
                            </td>
                            <td>
                              <div className="text-dark small text-truncate" style={{ maxWidth: "200px" }} title={w.address || ""}>
                                {w.address || "—"}
                              </div>
                              {w.managerName && (
                                <div className="text-muted" style={{ fontSize: "11px" }}>
                                  <i className="fas fa-user-circle me-1"></i>
                                  {w.managerName} {w.managerPhone ? `(${w.managerPhone})` : ""}
                                </div>
                              )}
                            </td>
                            <td className="text-center">
                              <span className="badge bg-warning-subtle text-dark border border-warning">
                                {w.equipmentCount ?? 0} máy
                              </span>
                            </td>
                            <td className="text-end">
                              <div className="btn-group btn-group-sm">
                                <button
                                  type="button"
                                  className="btn btn-outline-primary py-0 px-1.5"
                                  style={{ fontSize: "11px", height: "24px" }}
                                  title="Chỉnh sửa kho"
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
                                <button
                                  type="button"
                                  className="btn btn-outline-danger py-0 px-1.5"
                                  style={{ fontSize: "11px", height: "24px" }}
                                  title={
                                    (w.equipmentCount ?? 0) > 0
                                      ? "Đang có máy lưu trữ tại kho này, không thể xóa"
                                      : "Xóa kho"
                                  }
                                  disabled={(w.equipmentCount ?? 0) > 0}
                                  onClick={() => handleDeleteWarehouse(w)}
                                >
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </ModalShell>

      {/* Modal Đổi trạng thái nhanh */}
      <ModalShell
        show={!!statusTarget}
        size="sm"
        title={`Đổi trạng thái: ${statusTarget ? `${statusTarget.model} (SN: ${statusTarget.serialNumber})` : ""}`}
        onClose={() => setStatusTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setStatusTarget(null)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="quick-status-form"
              className="btn btn-primary btn-sm fw-bold"
            >
              Cập nhật
            </button>
          </>
        }
      >
        <form id="quick-status-form" onSubmit={handleQuickStatus}>
          <div className="mb-2">
            <label className="form-label small fw-bold text-muted mb-1">TRẠNG THÁI MỚI</label>
            <select
              className="form-select form-select-sm"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label small fw-bold text-muted mb-1">
              LÝ DO / GHI CHÚ LỊCH SỬ
            </label>
            <input
              type="text"
              placeholder="VD: Bàn giao cho khách, Kẹt giấy..."
              className="form-control form-control-sm"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
            />
          </div>
        </form>
      </ModalShell>

      {/* Modal Tạo Phiếu Kỹ Thuật (Sửa chữa / Bảo trì) nhanh */}
      <ModalShell
        show={!!ticketTarget}
        size="md"
        title={`Tạo phiếu dịch vụ: ${ticketTarget?.brand || ""} ${ticketTarget?.model || ""} (${
          ticketTarget?.serialNumber || ""
        })`}
        onClose={() => setTicketTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setTicketTarget(null)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="quick-ticket-form"
              disabled={ticketSubmitting}
              className="btn btn-danger btn-sm fw-bold px-3"
            >
              {ticketSubmitting ? "Đang tạo..." : "Tạo phiếu kỹ thuật"}
            </button>
          </>
        }
      >
        <form id="quick-ticket-form" onSubmit={handleQuickTicketSubmit}>
          <div className="row g-2">
            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">LOẠI CÔNG VIỆC</label>
              <select
                className="form-select form-select-sm"
                value={ticketForm.type}
                onChange={(e) => setTicketForm({ ...ticketForm, type: e.target.value })}
              >
                <option value="REPAIR">Sửa chữa sự cố</option>
                <option value="MAINTENANCE">Bảo trì định kỳ</option>
                <option value="INSPECTION">Kiểm tra / Khảo sát</option>
                <option value="INSTALLATION">Lắp đặt bàn giao</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">MỨC ĐỘ ƯU TIÊN</label>
              <select
                className="form-select form-select-sm"
                value={ticketForm.priority}
                onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
              >
                <option value="LOW">Thấp</option>
                <option value="NORMAL">Bình thường</option>
                <option value="HIGH">Cao</option>
                <option value="URGENT">Khẩn cấp</option>
              </select>
            </div>
            <div className="col-12">
              <label className="form-label small fw-bold text-muted mb-1">
                MÔ TẢ YÊU CẦU / TRIỆU CHỨNG LỖI <span className="text-danger">*</span>
              </label>
              <textarea
                rows={3}
                required
                className="form-control form-control-sm"
                value={ticketForm.description}
                onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
              />
            </div>
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
