"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ModalShell from "@/components/ModalShell";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import { exportToCsv } from "@/lib/csv";
import CustomerImportModal from "@/components/CustomerImportModal";
import CustomerGroupModal from "@/components/CustomerGroupModal";
import CustomerDeleteModal from "@/components/CustomerDeleteModal";
import CustomerLocationTreeModal from "@/components/CustomerLocationTreeModal";
import QuickEquipmentModal from "@/components/QuickEquipmentModal";
import ChangeEquipmentLocationModal from "@/components/ChangeEquipmentLocationModal";
import LocationPickerModal from "@/components/LocationPickerModal";
import { formatLocationPath, resolveLocationConfig, getDirectionsUrl, parseCoordinates } from "@/lib/location";
import type { CustomerGroupItem } from "@/lib/customerGroupRepo";

interface DepartmentNode {
  id: string;
  name: string;
}

interface BuildingNode {
  id: string;
  name: string;
  departments: DepartmentNode[];
}

interface BranchNode {
  id: string;
  name: string;
  address: string | null;
  buildings: BuildingNode[];
}

interface EquipmentItem {
  id: string;
  code?: string | null;
  serialNumber: string;
  model: string;
  brand: string | null;
  type?: string;
  group?: string;
  relationType?: string;
  category?: { id?: string; name: string } | null;
  status: string;
  currentCounter: number;
  locationNote: string | null;
  warrantyUntil?: string | null;
  branchId?: string | null;
  buildingId?: string | null;
  departmentId?: string | null;
  branch?: { id: string; name: string } | null;
  building?: { id: string; name: string; branch?: { id?: string; name: string } | null } | null;
  department?: {
    id?: string;
    name: string;
    building?: {
      id?: string;
      name: string;
      branch?: { id?: string; name: string };
    };
  } | null;
  contract?: {
    id: string;
    code: string;
    basePrice: number | string;
    baseQuota: number;
  } | null;
}

interface AvailableEquipment {
  id: string;
  code?: string | null;
  serialNumber: string;
  model: string;
  brand: string | null;
  type?: string;
  group?: string;
  relationType?: string;
  category?: { id: string; name: string } | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string; code?: string | null; address?: string | null } | null;
  status: string;
  currentCounter: number;
  baseQuota: number | null;
  overagePrice: number | null;
  locationNote: string | null;
}

interface TicketItem {
  id: string;
  code: string;
  type: string;
  status: string;
  priority: string;
  description: string;
  createdAt: string;
  assignee?: { id: string; name: string; phone: string | null } | null;
  equipment?: { id: string; model: string; serialNumber: string } | null;
}

interface FeedbackItem {
  id: string;
  content: string;
  authorName: string | null;
  createdAt: string;
}

interface CustomerItem {
  id: string;
  code?: string | null;
  name: string;
  group?: string;
  status?: string;
  taxCode: string | null;
  phone?: string | null;
  email: string | null;
  zaloId: string | null;
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  managerName?: string | null;
  managerPhone?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  locationConfig?: unknown;
  createdAt: string;
  branches?: BranchNode[];
  equipment?: EquipmentItem[];
  _count?: {
    equipment: number;
    contracts: number;
    branches: number;
    tickets?: number;
    invoices?: number;
  };
}

interface CustomerDetailData extends CustomerItem {
  branches: BranchNode[];
  equipment: EquipmentItem[];
  tickets: TicketItem[];
  contracts: {
    id: string;
    code: string;
    basePrice: number | string;
    baseQuota: number;
    overagePrice: number | string;
    startDate: string;
    endDate: string | null;
    isActive: boolean;
  }[];
  invoices: {
    id: string;
    code: string;
    periodStart: string;
    periodEnd: string;
    total: number | string;
    status: string;
    dueDate: string | null;
    createdAt: string;
  }[];
  feedbacks: FeedbackItem[];
  totalDebt: number;
  unpaidCount: number;
}

const CUSTOMER_GROUPS = [
  "Khách thường",
  "Khách VIP",
  "Khách thuê máy",
  "Khách mua máy",
  "Khách bảo trì",
];

function formatCurrency(val: number | string | null | undefined): string {
  if (val === null || val === undefined) return "0 ₫";
  return Number(val).toLocaleString("vi-VN") + " ₫";
}

function formatDate(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalAll, setTotalAll] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  // Filters
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [equipFilter, setEquipFilter] = useState<string>("");
  const [debtFilter, setDebtFilter] = useState<string>("");

  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [totalReceivable, setTotalReceivable] = useState(0);
  const [globalStats, setGlobalStats] = useState({
    activeCount: 0,
    totalEquipCount: 0,
  });

  // Modal Thêm / Sửa khách hàng
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerItem | null>(null);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroupItem[]>([]);
  const [editing, setEditing] = useState<CustomerItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    group: "Khách thường",
    status: "ACTIVE",
    taxCode: "",
    phone: "",
    email: "",
    zaloId: "",
    address: "",
    latitude: "",
    longitude: "",
    managerName: "",
    managerPhone: "",
    contactName: "",
    contactPhone: "",
    notes: "",
  });

  // Modal Hồ sơ chi tiết 360°
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailCustomer, setDetailCustomer] = useState<CustomerDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<
    "equipment" | "tickets" | "info" | "contracts" | "invoices"
  >("equipment");
  const [quickFeedback, setQuickFeedback] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);

  // Modal Chọn / Ghim vị trí trên bản đồ vệ tinh
  const [showLocationPickerModal, setShowLocationPickerModal] = useState(false);
  const [locationPickerTarget, setLocationPickerTarget] = useState<"form" | "detail">("form");
  const [quickGpsPaste, setQuickGpsPaste] = useState("");

  // Modal Gán thiết bị máy dịch vụ
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showQuickCreateModal, setShowQuickCreateModal] = useState(false);
  const [quickCreateCustomer, setQuickCreateCustomer] = useState<CustomerItem | null>(null);

  // Modal Đổi vị trí thiết bị
  const [showChangeLocModal, setShowChangeLocModal] = useState(false);
  const [changeLocEquipment, setChangeLocEquipment] = useState<EquipmentItem | null>(null);
  const [changeLocCustomer, setChangeLocCustomer] = useState<CustomerItem | null>(null);
  const [availableEquipments, setAvailableEquipments] = useState<AvailableEquipment[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [assignForm, setAssignForm] = useState({
    equipmentId: "",
    relationType: "Cho thuê",
    locationTarget: "", // "branch:id" | "building:id" | "department:id"
    contractId: "",
    locationNote: "",
    initialCounter: 0,
    warrantyUntil: "",
    note: "",
  });

  // Bộ lọc và tìm kiếm máy trong kho khi gán thiết bị
  const [assignSearch, setAssignSearch] = useState("");
  const [assignWarehouseFilter, setAssignWarehouseFilter] = useState("");
  const [assignBrandFilter, setAssignBrandFilter] = useState("");
  const [assignTypeFilter, setAssignTypeFilter] = useState("");

  const assignAvailableWarehouses = useMemo(() => {
    const map = new Map<string, string>();
    availableEquipments.forEach((eq) => {
      if (eq.warehouse) {
        map.set(eq.warehouse.id, eq.warehouse.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [availableEquipments]);

  const assignAvailableBrands = useMemo(() => {
    const set = new Set<string>();
    availableEquipments.forEach((eq) => {
      if (eq.brand) set.add(eq.brand);
    });
    return Array.from(set).sort();
  }, [availableEquipments]);

  const assignAvailableTypes = useMemo(() => {
    const set = new Set<string>();
    availableEquipments.forEach((eq) => {
      if (eq.type) set.add(eq.type);
    });
    return Array.from(set).sort();
  }, [availableEquipments]);

  const filteredAvailableEquipments = useMemo(() => {
    return availableEquipments.filter((eq) => {
      if (assignWarehouseFilter && eq.warehouse?.id !== assignWarehouseFilter) {
        return false;
      }
      if (assignBrandFilter && eq.brand?.toLowerCase() !== assignBrandFilter.toLowerCase()) {
        return false;
      }
      if (assignTypeFilter && eq.type !== assignTypeFilter) {
        return false;
      }
      if (assignSearch.trim()) {
        const q = assignSearch.trim().toLowerCase();
        const matchSerial = eq.serialNumber?.toLowerCase().includes(q);
        const matchModel = eq.model?.toLowerCase().includes(q);
        const matchBrand = eq.brand?.toLowerCase().includes(q);
        const matchCode = eq.code?.toLowerCase().includes(q);
        const matchType = eq.type?.toLowerCase().includes(q);
        const matchCategory = eq.category?.name?.toLowerCase().includes(q);
        if (!matchSerial && !matchModel && !matchBrand && !matchCode && !matchType && !matchCategory) {
          return false;
        }
      }
      return true;
    });
  }, [availableEquipments, assignSearch, assignWarehouseFilter, assignBrandFilter, assignTypeFilter]);

  const selectedAvailableEquipment = useMemo(() => {
    return availableEquipments.find((eq) => eq.id === assignForm.equipmentId) || null;
  }, [availableEquipments, assignForm.equipmentId]);

  const getEquipmentDisplayName = (brand?: string | null, model?: string) => {
    if (!model) return brand || "";
    if (!brand) return model;
    const b = brand.trim().toLowerCase();
    const m = model.trim().toLowerCase();
    if (m.startsWith(b)) return model;
    return `${brand} ${model}`;
  };

  // Cây danh sách vị trí phân cấp của khách hàng hiện tại (hỗ trợ gán máy ở mọi cấp)
  const allLocationOptions = useMemo(() => {
    const targetCust = detailCustomer || quickCreateCustomer;
    if (!targetCust?.branches) return [];
    const options: { targetKey: string; label: string; level: string }[] = [];

    targetCust.branches.forEach((b) => {
      // Cấp 1
      options.push({
        targetKey: `branch:${b.id}`,
        level: "branch",
        label: `📁 ${b.name}`,
      });

      b.buildings?.forEach((bu) => {
        // Cấp 2
        options.push({
          targetKey: `building:${bu.id}`,
          level: "building",
          label: `   └── 📂 ${bu.name}`,
        });

        bu.departments?.forEach((d) => {
          // Cấp 3
          options.push({
            targetKey: `department:${d.id}`,
            level: "department",
            label: `        └── 📍 ${d.name}`,
          });
        });
      });
    });
    return options;
  }, [detailCustomer, quickCreateCustomer]);

  // Quản lý các dòng bảng đang mở rộng (Sổ ra chi tiết)
  const [expandedRowIds, setExpandedRowIds] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAllRows = () => {
    if (expandedRowIds.size === customers.length && customers.length > 0) {
      setExpandedRowIds(new Set());
    } else {
      setExpandedRowIds(new Set(customers.map((c) => c.id)));
    }
  };

  // Modal Thu hồi thiết bị
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [unassignEquipment, setUnassignEquipment] = useState<EquipmentItem | null>(null);
  const [unassignSubmitting, setUnassignSubmitting] = useState(false);
  const [unassignForm, setUnassignForm] = useState({
    targetStatus: "IN_STOCK",
    finalCounter: 0,
    note: "",
  });

  // Modal Báo sửa / Ticket nhanh
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [ticketEquipment, setTicketEquipment] = useState<EquipmentItem | null>(null);
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    type: "REPAIR",
    priority: "NORMAL",
    description: "",
  });

  // Modal Quản lý cấu trúc vị trí tổ chức (Tree View 3 cấp)
  const [showLocModal, setShowLocModal] = useState(false);
  const [locCustomer, setLocCustomer] = useState<CustomerItem | null>(null);

  // Load danh sách khách hàng
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      if (groupFilter) sp.set("group", groupFilter);
      if (statusFilter) sp.set("status", statusFilter);
      if (equipFilter) sp.set("equipFilter", equipFilter);
      if (debtFilter) sp.set("debtFilter", debtFilter);

      const res = await fetch(`/api/customers?${sp.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách khách hàng");
      const data = await res.json();
      let list: CustomerItem[] = data.items || [];

      // Lọc theo thiết bị
      if (equipFilter === "HAS_EQUIP") {
        list = list.filter((c) => (c._count?.equipment ?? c.equipment?.length ?? 0) > 0);
      } else if (equipFilter === "NO_EQUIP") {
        list = list.filter((c) => (c._count?.equipment ?? c.equipment?.length ?? 0) === 0);
      }

      setCustomers(list);
      setTotal(data.total || 0);
      if (typeof data.totalAll === "number") {
        setTotalAll(data.totalAll);
      } else if (!totalAll) {
        setTotalAll(data.total || 0);
      }
      setGroupCounts(data.groupCounts || {});
      setTotalReceivable(data.totalReceivable || 0);
      if (typeof data.activeCount === "number" || typeof data.totalEquipCount === "number") {
        setGlobalStats({
          activeCount: data.activeCount ?? 0,
          totalEquipCount: data.totalEquipCount ?? 0,
        });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, groupFilter, statusFilter, equipFilter, debtFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadCustomerGroups = useCallback(async () => {
    try {
      const res = await fetch("/api/customer-groups");
      if (res.ok) {
        const data = await res.json();
        setCustomerGroups(data.groups || []);
      }
    } catch {
      // fallback
    }
  }, []);

  useEffect(() => {
    loadCustomerGroups();
  }, [loadCustomerGroups]);

  const groupOptions = useMemo(() => {
    if (customerGroups.length > 0) {
      return customerGroups.map((g) => g.name);
    }
    return CUSTOMER_GROUPS;
  }, [customerGroups]);

  const renderGroupBadge = (groupName?: string) => {
    if (!groupName || groupName === "Khách thường") {
      const g = customerGroups.find((x) => x.name === groupName);
      if (g && g.color && g.color !== "#64748b") {
        return (
          <span
            className="badge shadow-xs"
            style={{ backgroundColor: g.color, color: "#fff", fontSize: "11px", padding: "3px 8px" }}
          >
            {groupName}
          </span>
        );
      }
      return (
        <span className="badge bg-light text-secondary border" style={{ fontSize: "11px", padding: "3px 8px" }}>
          Khách thường
        </span>
      );
    }

    const g = customerGroups.find((x) => x.name === groupName);
    if (g && g.color) {
      return (
        <span
          className="badge shadow-xs d-inline-flex align-items-center gap-1"
          style={{ backgroundColor: g.color, color: "#fff", fontSize: "11px", padding: "3px 8px" }}
        >
          {groupName === "Khách VIP" && <i className="fas fa-crown text-warning me-1"></i>}
          {groupName}
        </span>
      );
    }

    const cls =
      groupName === "Khách VIP"
        ? "bg-warning text-dark border border-warning fw-bold"
        : groupName === "Khách thuê máy"
        ? "bg-primary text-white"
        : groupName === "Khách mua máy"
        ? "bg-success-subtle text-success border border-success-subtle"
        : "bg-info-subtle text-info border border-info-subtle";

    return (
      <span className={`badge ${cls}`} style={{ fontSize: "11px", padding: "3px 8px" }}>
        {groupName === "Khách VIP" && <i className="fas fa-crown text-danger me-1"></i>}
        {groupName}
      </span>
    );
  };

  // Mở hồ sơ chi tiết 360°
  const openDetail = async (
    c: CustomerItem,
    defaultTab: "equipment" | "tickets" | "info" | "contracts" | "invoices" = "equipment"
  ) => {
    setShowDetailModal(true);
    setDetailLoading(true);
    setDetailTab(defaultTab);
    try {
      const res = await fetch(`/api/customers/${c.id}`);
      if (!res.ok) throw new Error("Không thể tải hồ sơ khách hàng");
      const data = await res.json();
      setDetailCustomer(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải hồ sơ khách hàng");
      setShowDetailModal(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshDetailCustomer = async (customerId: string) => {
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailCustomer(data);
      }
    } catch {
      // ignore
    }
  };

  // Mở modal Thêm mới khách hàng
  const openNew = () => {
    setEditing(null);
    setQuickGpsPaste("");
    setFormData({
      code: "",
      name: "",
      group: groupFilter || "Khách thường",
      status: "ACTIVE",
      taxCode: "",
      phone: "",
      email: "",
      zaloId: "",
      address: "",
      latitude: "",
      longitude: "",
      managerName: "",
      managerPhone: "",
      contactName: "",
      contactPhone: "",
      notes: "",
    });
    setShowModal(true);
  };

  // Mở modal Sửa khách hàng
  const openEdit = (c: CustomerItem) => {
    setEditing(c);
    setQuickGpsPaste("");
    setFormData({
      code: c.code || "",
      name: c.name,
      group: c.group || "Khách thường",
      status: c.status || "ACTIVE",
      taxCode: c.taxCode || "",
      phone: c.phone || "",
      email: c.email || "",
      zaloId: c.zaloId || "",
      address: c.address,
      latitude: c.latitude != null ? String(c.latitude) : "",
      longitude: c.longitude != null ? String(c.longitude) : "",
      managerName: c.managerName || "",
      managerPhone: c.managerPhone || "",
      contactName: c.contactName || "",
      contactPhone: c.contactPhone || "",
      notes: c.notes || "",
    });
    setShowModal(true);
  };

  // Lấy tọa độ GPS từ thiết bị hiện tại với kiểm tra độ chính xác (accuracy)
  const handleGetLocationGPS = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      toast.warning("Thiết bị hoặc trình duyệt không hỗ trợ định vị GPS");
      return;
    }
    toast.info("Đang dò tọa độ GPS vệ tinh...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        const acc = Math.round(pos.coords.accuracy);
        setFormData((prev) => ({
          ...prev,
          latitude: lat,
          longitude: lng,
        }));
        if (acc <= 30) {
          toast.success(`Đã lấy GPS vệ tinh chính xác: ${lat}, ${lng} (Sai số ±${acc}m)`);
        } else {
          toast.warning(
            `Đã lấy tọa độ: ${lat}, ${lng} (Sai số ±${acc}m do thiết bị dùng định vị Wi-Fi/mạng). Khuyên dùng tính năng "Ghim bản đồ" để chỉnh đúng nóc nhà!`
          );
        }
      },
      (err) => {
        let msg = "Không thể lấy vị trí GPS";
        if (err.code === 1) msg = "Vui lòng cho phép quyền truy cập vị trí trên trình duyệt";
        else if (err.code === 2) msg = "Không thể xác định vị trí vệ tinh GPS";
        else if (err.code === 3) msg = "Quá thời gian lấy tọa độ GPS";
        toast.error(msg);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // Xử lý dán tọa độ hoặc link Google Maps vào form khách hàng
  const handleApplyQuickGpsPaste = () => {
    if (!quickGpsPaste.trim()) {
      toast.warning("Vui lòng dán tọa độ hoặc link Google Maps vào ô");
      return;
    }
    const parsed = parseCoordinates(quickGpsPaste);
    if (parsed) {
      setFormData((prev) => ({
        ...prev,
        latitude: String(parsed.latitude),
        longitude: String(parsed.longitude),
      }));
      toast.success(`Nhận diện tọa độ thành công: ${parsed.latitude}, ${parsed.longitude}`);
      setQuickGpsPaste("");
    } else {
      toast.error("Không nhận diện được tọa độ. Vui lòng dán định dạng: 10.024567, 105.083124 hoặc link Google Maps");
    }
  };

  // Lưu thông tin khách hàng
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const latNum = formData.latitude !== "" && !isNaN(Number(formData.latitude)) ? Number(formData.latitude) : null;
      const lngNum = formData.longitude !== "" && !isNaN(Number(formData.longitude)) ? Number(formData.longitude) : null;

      const payload: Record<string, unknown> = {
        name: formData.name,
        code: formData.code.trim() || undefined,
        group: formData.group,
        status: formData.status,
        phone: formData.phone.trim(),
        address: formData.address,
        latitude: latNum,
        longitude: lngNum,
        taxCode: formData.taxCode || undefined,
        email: formData.email || undefined,
        zaloId: formData.zaloId || undefined,
        managerName: formData.managerName || undefined,
        managerPhone: formData.managerPhone || undefined,
        contactName: formData.contactName || undefined,
        contactPhone: formData.contactPhone || undefined,
        notes: formData.notes || undefined,
      };

      const res = await fetch(editing ? `/api/customers/${editing.id}` : "/api/customers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu thông tin khách hàng");
        return;
      }
      toast.success(editing ? "Đã cập nhật khách hàng" : "Đã tạo khách hàng thành công");
      setShowModal(false);
      loadData();
      if (detailCustomer && editing && detailCustomer.id === editing.id) {
        refreshDetailCustomer(editing.id);
      }
    } finally {
      setSaving(false);
    }
  };

  // Mở hộp thoại kiểm tra ràng buộc & xác nhận xóa khách hàng
  const handleDelete = (c: CustomerItem) => {
    setCustomerToDelete(c);
    setShowDeleteModal(true);
  };

  // Xuất file CSV
  const handleExportCsv = () => {
    exportToCsv(
      "danh-sach-khach-hang.csv",
      [
        "Mã KH",
        "Tên khách hàng",
        "Phân nhóm",
        "Trạng thái",
        "Số điện thoại",
        "Email",
        "Mã số thuế",
        "Địa chỉ",
        "Người liên hệ",
        "Người quản lý",
        "Số máy dịch vụ",
      ],
      customers.map((c) => [
        c.code || "",
        c.name,
        c.group || "Khách thường",
        c.status === "ACTIVE" ? "Đang dùng" : c.status === "SUSPENDED" ? "Tạm ngưng" : "Ngừng DV",
        c.phone || "",
        c.email || "",
        c.taxCode || "",
        c.address,
        c.contactName ? `${c.contactName} (${c.contactPhone || ""})` : "",
        c.managerName ? `${c.managerName} (${c.managerPhone || ""})` : "",
        c._count?.equipment ?? c.equipment?.length ?? 0,
      ])
    );
  };

  // Gửi ghi chú tương tác
  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCustomer || !quickFeedback.trim()) return;
    setSendingFeedback(true);
    try {
      const res = await fetch(`/api/customers/${detailCustomer.id}/feedbacks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: quickFeedback.trim() }),
      });
      if (!res.ok) throw new Error("Không thể gửi phản hồi");
      toast.success("Đã lưu ghi chú tương tác với khách hàng");
      setQuickFeedback("");
      refreshDetailCustomer(detailCustomer.id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi khi gửi phản hồi");
    } finally {
      setSendingFeedback(false);
    }
  };

  // Mở modal Gán thiết bị cho khách hàng
  const openAssignModal = async (customer: CustomerItem) => {
    setQuickCreateCustomer(customer);
    setShowAssignModal(true);
    setAssignLoading(true);
    setAssignSearch("");
    setAssignWarehouseFilter("");
    setAssignBrandFilter("");
    setAssignTypeFilter("");

    const initialLocation =
      customer.branches &&
      customer.branches.length === 1 &&
      (!customer.branches[0].buildings || customer.branches[0].buildings.length === 0)
        ? `branch:${customer.branches[0].id}`
        : "";

    setAssignForm({
      equipmentId: "",
      relationType: "Cho thuê",
      locationTarget: initialLocation,
      contractId: "",
      locationNote: "",
      initialCounter: 0,
      warrantyUntil: "",
      note: "",
    });
    try {
      const res = await fetch("/api/equipment/available");
      if (!res.ok) throw new Error("Không tải được danh mục máy sẵn sàng trong kho");
      const data = await res.json();
      setAvailableEquipments(data.items || []);

      const cRes = await fetch(`/api/customers/${customer.id}`);
      if (cRes.ok) {
        const cData = await cRes.json();
        setDetailCustomer(cData);
        setQuickCreateCustomer(cData);
        if (
          !initialLocation &&
          cData.branches &&
          cData.branches.length === 1 &&
          (!cData.branches[0].buildings || cData.branches[0].buildings.length === 0)
        ) {
          setAssignForm((prev) => ({
            ...prev,
            locationTarget: `branch:${cData.branches[0].id}`,
          }));
        }
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải thiết bị có sẵn");
    } finally {
      setAssignLoading(false);
    }
  };

  // Xử lý Gán thiết bị
  const handleAssignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCustomer || !assignForm.equipmentId) {
      toast.warning("Vui lòng chọn thiết bị cần gán");
      return;
    }
    setAssignSubmitting(true);
    try {
      const [level, targetId] = assignForm.locationTarget
        ? assignForm.locationTarget.split(":")
        : ["", ""];
      const body = {
        equipmentId: assignForm.equipmentId,
        relationType: assignForm.relationType,
        branchId: level === "branch" ? targetId : null,
        buildingId: level === "building" ? targetId : null,
        departmentId: level === "department" ? targetId : null,
        contractId: assignForm.contractId || null,
        locationNote: assignForm.locationNote || null,
        initialCounter: assignForm.initialCounter,
        warrantyUntil: assignForm.warrantyUntil || null,
        note: assignForm.note || "",
      };
      const res = await fetch(`/api/customers/${detailCustomer.id}/assign-equipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Gán thiết bị thất bại");
        return;
      }
      toast.success("Đã gán thiết bị máy dịch vụ thành công!");
      setShowAssignModal(false);
      refreshDetailCustomer(detailCustomer.id);
      loadData();
    } finally {
      setAssignSubmitting(false);
    }
  };

  // Mở modal Đổi vị trí thiết bị
  const openChangeLocationModal = (eq: EquipmentItem, cust: CustomerItem) => {
    setChangeLocEquipment(eq);
    setChangeLocCustomer(cust);
    setShowChangeLocModal(true);
  };

  // Mở modal Nhập nhanh thiết bị mới trực tiếp tại khách hàng
  const openQuickCreateEquipmentModal = (c?: CustomerItem | null) => {
    const target = c || detailCustomer || quickCreateCustomer;
    setQuickCreateCustomer(target || null);
    setShowQuickCreateModal(true);
  };

  const handleQuickEquipmentSuccess = async (newEq: any, assignedDirectly: boolean) => {
    loadData();
    const targetCustId = quickCreateCustomer?.id || detailCustomer?.id;
    if (targetCustId) {
      refreshDetailCustomer(targetCustId);
    }
    if (assignedDirectly) {
      setShowAssignModal(false);
    } else {
      const res = await fetch("/api/equipment/available");
      if (res.ok) {
        const data = await res.json();
        const items = data.items || [];
        setAvailableEquipments(items);
        if (newEq && newEq.id) {
          setAssignForm((prev) => ({
            ...prev,
            equipmentId: newEq.id,
            initialCounter: newEq.currentCounter ?? 0,
            relationType: prev.relationType || newEq.relationType || "Cho thuê",
          }));
        }
      }
    }
  };

  // Mở modal Thu hồi thiết bị
  const openUnassignModal = (eq: EquipmentItem) => {
    setUnassignEquipment(eq);
    setUnassignForm({
      targetStatus: "IN_STOCK",
      finalCounter: eq.currentCounter || 0,
      note: "",
    });
    setShowUnassignModal(true);
  };

  // Xử lý Thu hồi thiết bị
  const handleUnassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCustomer || !unassignEquipment) return;
    setUnassignSubmitting(true);
    try {
      const res = await fetch(`/api/customers/${detailCustomer.id}/unassign-equipment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: unassignEquipment.id,
          targetStatus: unassignForm.targetStatus,
          finalCounter: unassignForm.finalCounter,
          note: unassignForm.note,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Thu hồi thiết bị thất bại");
        return;
      }
      toast.success("Đã thu hồi thiết bị về kho thành công");
      setShowUnassignModal(false);
      refreshDetailCustomer(detailCustomer.id);
      loadData();
    } finally {
      setUnassignSubmitting(false);
    }
  };

  // Mở modal tạo Ticket nhanh cho máy
  const openQuickTicket = (eq: EquipmentItem) => {
    setTicketEquipment(eq);
    setTicketForm({
      type: "REPAIR",
      priority: "NORMAL",
      description: `Báo sửa chữa cho máy ${eq.model} (S/N: ${eq.serialNumber})`,
    });
    setShowTicketModal(true);
  };

  // Xử lý tạo Ticket nhanh
  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailCustomer || !ticketEquipment) return;
    setTicketSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: detailCustomer.id,
          equipmentId: ticketEquipment.id,
          type: ticketForm.type,
          priority: ticketForm.priority,
          description: ticketForm.description,
          source: "CUSTOMER",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Tạo yêu cầu công việc thất bại");
        return;
      }
      toast.success("Đã tạo công việc xử lý cho kỹ thuật viên");
      setShowTicketModal(false);
      refreshDetailCustomer(detailCustomer.id);
      loadData();
    } finally {
      setTicketSubmitting(false);
    }
  };

  // Modal Vị trí sơ đồ tổ chức 3 cấp
  const openLocationModal = (c: CustomerItem) => {
    setLocCustomer(c);
    setShowLocModal(true);
  };

  // Active filter chips
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
  if (groupFilter) {
    chips.push({
      id: "group",
      label: "Phân nhóm",
      value: groupFilter,
      onClear: () => {
        setGroupFilter("");
        setPage(1);
      },
    });
  }
  if (statusFilter) {
    chips.push({
      id: "status",
      label: "Trạng thái",
      value: statusFilter === "ACTIVE" ? "Đang dùng" : statusFilter === "SUSPENDED" ? "Tạm ngưng" : "Ngừng DV",
      onClear: () => {
        setStatusFilter("");
        setPage(1);
      },
    });
  }
  if (equipFilter) {
    chips.push({
      id: "equip",
      label: "Thiết bị",
      value: equipFilter === "HAS_EQUIP" ? "Có máy dịch vụ" : "Chưa có máy",
      onClear: () => {
        setEquipFilter("");
        setPage(1);
      },
    });
  }
  if (debtFilter) {
    chips.push({
      id: "debt",
      label: "Công nợ",
      value: "Có công nợ cần thu",
      onClear: () => {
        setDebtFilter("");
        setPage(1);
      },
    });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeCount = globalStats.activeCount || customers.filter((c) => c.status === "ACTIVE").length;
  const vipCount = groupCounts["Khách VIP"] || 0;
  const rentCount = groupCounts["Khách thuê máy"] || 0;
  const totalEquipCount = globalStats.totalEquipCount || customers.reduce(
    (acc, cur) => acc + (cur._count?.equipment ?? cur.equipment?.length ?? 0),
    0
  );

  const isAllActive = !statusFilter && !groupFilter && !equipFilter && !debtFilter && !search.trim();
  const isActiveFilter = statusFilter === "ACTIVE";
  const isVipFilter = groupFilter === "Khách VIP";
  const isRentFilter = groupFilter === "Khách thuê máy";
  const isEquipFilter = equipFilter === "HAS_EQUIP";
  const isDebtFilter = debtFilter === "HAS_DEBT";

  return (
    <div className="container-fluid px-0">
      {/* 1. Header Bar trên 1 hàng duy nhất */}
      <div className="bg-white px-3 py-2 rounded shadow-sm border mb-2 d-flex align-items-center justify-content-between gap-2 flex-nowrap overflow-x-auto">
        {/* Cụm trái: Tiêu đề + Thống kê nhanh (Bấm để lọc) */}
        <div className="d-flex align-items-center gap-2 flex-nowrap flex-shrink-0">
          <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-1.5 text-nowrap" style={{ fontSize: "16px" }}>
            <i className="fas fa-users text-primary"></i>
            <span>Khách hàng</span>
          </h5>
          <div className="d-flex align-items-center gap-1.5 flex-nowrap">
            {/* 1. Tổng số khách - Bấm để xem tất cả / xóa lọc */}
            <button
              type="button"
              className={`badge px-2 py-1 text-nowrap d-inline-flex align-items-center gap-1 transition-all ${
                isAllActive
                  ? "bg-dark text-white border-dark shadow-xs"
                  : "bg-light text-dark border-secondary-subtle"
              }`}
              style={{
                fontSize: "11.5px",
                cursor: "pointer",
                border: "1px solid",
                transform: isAllActive ? "scale(1.03)" : "none",
              }}
              onClick={() => {
                setStatusFilter("");
                setGroupFilter("");
                setEquipFilter("");
                setDebtFilter("");
                setSearch("");
                setPage(1);
              }}
              title="Xem tất cả khách hàng (Xóa mọi bộ lọc)"
            >
              <span>Tổng:</span>
              <strong>{totalAll || total}</strong>
              {isAllActive && <i className="fas fa-check text-white ms-0.5" style={{ fontSize: "9px" }}></i>}
            </button>

            {/* 2. Đang dùng - Bấm để lọc / bỏ lọc ACTIVE */}
            <button
              type="button"
              className={`badge px-2 py-1 text-nowrap d-inline-flex align-items-center gap-1 transition-all ${
                isActiveFilter
                  ? "bg-success text-white border-success shadow-xs fw-bold"
                  : "bg-success-subtle text-success border-success-subtle"
              }`}
              style={{
                fontSize: "11.5px",
                cursor: "pointer",
                border: isActiveFilter ? "2px solid #16a34a" : "1px solid #bbf7d0",
                transform: isActiveFilter ? "scale(1.04)" : "none",
              }}
              onClick={() => {
                setStatusFilter((prev) => (prev === "ACTIVE" ? "" : "ACTIVE"));
                setPage(1);
              }}
              title="Lọc khách hàng đang hoạt động (Bấm để bật/tắt)"
            >
              <span>Đang dùng:</span>
              <strong>{activeCount}</strong>
              {isActiveFilter && <i className="fas fa-check text-white ms-0.5" style={{ fontSize: "9px" }}></i>}
            </button>

            {/* 3. Khách VIP - Bấm để lọc / bỏ lọc VIP */}
            <button
              type="button"
              className={`badge px-2 py-1 text-nowrap d-inline-flex align-items-center gap-1 transition-all ${
                isVipFilter
                  ? "bg-warning text-dark border-dark shadow-xs fw-bold"
                  : "bg-warning text-dark border-warning fw-bold shadow-xs"
              }`}
              style={{
                fontSize: "11.5px",
                cursor: "pointer",
                border: isVipFilter ? "2px solid #000" : "1px solid #f59e0b",
                transform: isVipFilter ? "scale(1.04)" : "none",
              }}
              onClick={() => {
                setGroupFilter((prev) => (prev === "Khách VIP" ? "" : "Khách VIP"));
                setPage(1);
              }}
              title="Lọc phân nhóm Khách VIP (Bấm để bật/tắt)"
            >
              <i className="fas fa-crown text-danger"></i>
              <span>Khách VIP:</span>
              <strong>{vipCount}</strong>
              {isVipFilter && <i className="fas fa-check text-dark ms-0.5" style={{ fontSize: "9px" }}></i>}
            </button>

            {/* 4. Khách thuê máy - Bấm để lọc / bỏ lọc Khách thuê máy */}
            <button
              type="button"
              className={`badge px-2 py-1 text-nowrap d-inline-flex align-items-center gap-1 transition-all ${
                isRentFilter
                  ? "bg-primary text-white border-primary shadow-xs fw-bold"
                  : "bg-primary-subtle text-primary border-primary-subtle"
              }`}
              style={{
                fontSize: "11.5px",
                cursor: "pointer",
                border: isRentFilter ? "2px solid #1d4ed8" : "1px solid #bfdbfe",
                transform: isRentFilter ? "scale(1.04)" : "none",
              }}
              onClick={() => {
                setGroupFilter((prev) => (prev === "Khách thuê máy" ? "" : "Khách thuê máy"));
                setPage(1);
              }}
              title="Lọc phân nhóm Khách thuê máy (Bấm để bật/tắt)"
            >
              <span>Khách thuê máy:</span>
              <strong>{rentCount}</strong>
              {isRentFilter && <i className="fas fa-check text-white ms-0.5" style={{ fontSize: "9px" }}></i>}
            </button>

            {/* 5. Máy dịch vụ - Bấm để lọc khách có máy dịch vụ */}
            <button
              type="button"
              className={`badge px-2 py-1 text-nowrap d-inline-flex align-items-center gap-1 transition-all ${
                isEquipFilter
                  ? "bg-info text-white border-info shadow-xs fw-bold"
                  : "bg-info-subtle text-info border-info-subtle"
              }`}
              style={{
                fontSize: "11.5px",
                cursor: "pointer",
                border: isEquipFilter ? "2px solid #0891b2" : "1px solid #a5f3fc",
                transform: isEquipFilter ? "scale(1.04)" : "none",
              }}
              onClick={() => {
                setEquipFilter((prev) => (prev === "HAS_EQUIP" ? "" : "HAS_EQUIP"));
                setPage(1);
              }}
              title="Lọc khách hàng đang có máy dịch vụ (Bấm để bật/tắt)"
            >
              <span>Máy dịch vụ:</span>
              <strong>{totalEquipCount}</strong>
              {isEquipFilter && <i className="fas fa-check text-white ms-0.5" style={{ fontSize: "9px" }}></i>}
            </button>

            {/* 6. Công nợ (nếu có) */}
            {totalReceivable > 0 && (
              <button
                type="button"
                className={`badge px-2 py-1 text-nowrap d-inline-flex align-items-center gap-1 transition-all ${
                  isDebtFilter
                    ? "bg-danger text-white border-danger shadow-xs fw-bold"
                    : "bg-danger-subtle text-danger border-danger-subtle fw-bold"
                }`}
                style={{
                  fontSize: "11.5px",
                  cursor: "pointer",
                  border: isDebtFilter ? "2px solid #dc2626" : "1px solid #fecaca",
                  transform: isDebtFilter ? "scale(1.04)" : "none",
                }}
                onClick={() => {
                  setDebtFilter((prev) => (prev === "HAS_DEBT" ? "" : "HAS_DEBT"));
                  setPage(1);
                }}
                title="Lọc khách hàng đang có công nợ cần thu (Bấm để bật/tắt)"
              >
                <i className="fas fa-receipt me-0.5"></i>
                <span>Công nợ:</span>
                <strong>{formatCurrency(totalReceivable)}</strong>
                {isDebtFilter && <i className="fas fa-check text-white ms-0.5" style={{ fontSize: "9px" }}></i>}
              </button>
            )}
          </div>
        </div>

        {/* Cụm phải: Điều khiển hiển thị + Thao tác Excel + Thêm mới */}
        <div className="d-flex align-items-center gap-1.5 flex-nowrap flex-shrink-0">
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

          {viewMode === "table" && customers.length > 0 && (
            <button
              type="button"
              className="btn btn-sm btn-light border text-secondary fw-semibold px-2 d-flex align-items-center gap-1 text-nowrap"
              onClick={toggleAllRows}
              title={expandedRowIds.size === customers.length ? "Thu gọn tất cả dòng" : "Sổ ra tất cả thông tin phụ"}
              style={{ height: "30px", fontSize: "12px" }}
            >
              <i className={`fas fa-${expandedRowIds.size === customers.length ? "compress-alt text-danger" : "expand-alt text-primary"} me-1`}></i>
              <span>{expandedRowIds.size === customers.length ? "Thu gọn" : "Sổ tất cả"}</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-sm btn-outline-success fw-semibold text-nowrap px-2.5 d-flex align-items-center gap-1"
            onClick={() => setShowImportModal(true)}
            title="Nhập danh sách khách hàng từ file mẫu Excel"
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className="fas fa-file-import"></i>
            <span>Nhập Excel</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary fw-semibold text-nowrap px-2.5 d-flex align-items-center gap-1"
            onClick={handleExportCsv}
            title="Xuất danh sách khách hàng ra file Excel"
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className="fas fa-file-excel text-success"></i>
            <span>Xuất Excel</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-secondary fw-semibold text-nowrap px-2.5 d-flex align-items-center gap-1"
            onClick={() => setShowGroupModal(true)}
            title="Quản lý tùy chỉnh Loại & Phân nhóm khách hàng"
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className="fas fa-layer-group text-primary"></i>
            <span>Loại khách hàng</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-outline-primary fw-semibold text-nowrap px-2.5 d-flex align-items-center gap-1"
            onClick={loadData}
            title="Tải lại danh sách"
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className="fas fa-sync-alt"></i>
            <span>Tải lại</span>
          </button>

          <button
            type="button"
            className="btn btn-sm btn-primary fw-bold text-nowrap px-2.5 shadow-sm d-flex align-items-center gap-1"
            onClick={openNew}
            style={{ height: "30px", fontSize: "12px" }}
          >
            <i className="fas fa-plus"></i>
            <span>Thêm khách hàng</span>
          </button>
        </div>
      </div>

      {/* 2. Dense Filter Bar chuẩn phong cách Ticket */}
      <div className="bg-light p-2 rounded border mb-2">
        <div className="row g-2 align-items-center">
          <div className="col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white">
                <i className="fas fa-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Tìm mã KH, tên khách hàng, số điện thoại, MST..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={groupFilter}
              onChange={(e) => {
                setGroupFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">-- Mọi phân nhóm --</option>
              {groupOptions.map((grp) => (
                <option key={grp} value={grp}>
                  {grp} {groupCounts[grp] ? `(${groupCounts[grp]})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">-- Mọi trạng thái --</option>
              <option value="ACTIVE">Đang dùng / Hoạt động</option>
              <option value="SUSPENDED">Tạm ngưng</option>
              <option value="INACTIVE">Ngừng dịch vụ</option>
            </select>
          </div>

          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={equipFilter}
              onChange={(e) => {
                setEquipFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">-- Mọi máy dịch vụ --</option>
              <option value="HAS_EQUIP">Có máy dịch vụ</option>
              <option value="NO_EQUIP">Chưa có máy dịch vụ</option>
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
              <option value={15}>15 dòng / trang</option>
              <option value={25}>25 dòng / trang</option>
              <option value={50}>50 dòng / trang</option>
            </select>
          </div>
        </div>

        {/* Active Filter Chips */}
        {chips.length > 0 && (
          <div className="mt-2 pt-2 border-top">
            <ActiveFilterChips
              chips={chips}
              totalCount={total}
              totalAll={totalAll}
              countLabel="khách hàng"
              filterTotalLabel="Tổng filter"
              onClearAll={() => {
                setSearch("");
                setGroupFilter("");
                setStatusFilter("");
                setEquipFilter("");
                setDebtFilter("");
                setPage(1);
              }}
            />
          </div>
        )}
      </div>

      {/* 3. Bảng Dữ Liệu Tương Phản Cao - THEAD BG-DARK TEXT-WHITE */}
      {loading ? (
        <Loading text="Đang tải danh sách khách hàng..." />
      ) : viewMode === "table" ? (
        <div
          className="table-responsive bg-white rounded shadow-sm border"
          style={{ maxHeight: "calc(100vh - 240px)" }}
        >
          <table className="table table-hover table-bordered mb-0 custom-dense-table table-sticky-header align-middle">
            <thead className="bg-dark text-white text-nowrap align-middle">
              <tr>
                <th className="py-2.5 px-3">Khách hàng &amp; Thông tin liên hệ</th>
                <th style={{ width: "140px" }} className="text-center py-2.5">Máy dịch vụ</th>
                <th style={{ width: "160px" }} className="text-center py-2.5">Hợp đồng &amp; Phiếu kỹ thuật</th>
                <th style={{ width: "130px" }} className="text-center py-2.5">Trạng thái</th>
                <th style={{ width: "160px" }} className="text-center py-2.5">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-4 text-muted">
                    Không có khách hàng nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const equipCount = c._count?.equipment ?? c.equipment?.length ?? 0;
                  const contractCount = c._count?.contracts ?? 0;
                  const branchCount = c._count?.branches ?? 0;
                  const ticketCount = c._count?.tickets ?? 0;
                  const isExpanded = expandedRowIds.has(c.id);

                  const rowClass =
                    c.status === "SUSPENDED"
                      ? "table-danger bg-danger-subtle"
                      : c.group === "Khách VIP"
                      ? "table-warning bg-warning-subtle"
                      : "";

                  return (
                    <React.Fragment key={c.id}>
                      <tr className={rowClass}>
                        {/* 1. Khách hàng & Thông tin liên hệ */}
                        <td className="align-middle py-2.5">
                          <div className="d-flex align-items-start gap-2.5">
                            <button
                              type="button"
                              className={`btn btn-sm ${isExpanded ? "btn-dark text-white" : "btn-light text-secondary border"} p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0 mt-0.5`}
                              style={{ width: "24px", height: "24px", borderRadius: "5px" }}
                              onClick={() => toggleRow(c.id)}
                              title={isExpanded ? "Thu gọn" : "Mở xem máy dịch vụ & chi tiết phụ"}
                            >
                              <i className={`fas fa-chevron-${isExpanded ? "down" : "right"}`} style={{ fontSize: "10px" }}></i>
                            </button>

                            <div className="min-w-0 flex-grow-1">
                              {/* Dòng 1: Tên khách hàng + Badge phân nhóm (Ẩn ID/Mã trên danh sách) */}
                              <div className="d-flex align-items-center gap-2 flex-wrap">
                                <span
                                  className="fw-bold text-dark hover-primary"
                                  style={{ fontSize: "14.5px", cursor: "pointer" }}
                                  onClick={() => openDetail(c, "equipment")}
                                >
                                  {c.name}
                                </span>

                                {renderGroupBadge(c.group)}
                              </div>

                              {/* Dòng 2: SĐT + Người liên hệ + MST */}
                              <div className="d-flex align-items-center gap-2 mt-1 flex-wrap" style={{ fontSize: "12.5px" }}>
                                {c.phone ? (
                                  c.phone.includes("*") ? (
                                    <span
                                      className="text-muted font-monospace d-inline-flex align-items-center gap-1"
                                      title="Số điện thoại bị ẩn do tài khoản chưa được cấp quyền xem SĐT"
                                    >
                                      <i className="fas fa-lock text-muted" style={{ fontSize: "10px" }}></i>
                                      {c.phone}
                                    </span>
                                  ) : (
                                    <a
                                      href={`tel:${c.phone}`}
                                      className="fw-bold text-primary text-decoration-none font-monospace d-inline-flex align-items-center gap-1"
                                    >
                                      <i className="fas fa-phone-alt text-success" style={{ fontSize: "11px" }}></i>
                                      {c.phone}
                                    </a>
                                  )
                                ) : (
                                  <span className="text-muted fst-italic" style={{ fontSize: "11px" }}>
                                    <i className="fas fa-phone-slash text-muted me-1"></i>
                                    Chưa có SĐT
                                  </span>
                                )}

                                {(c.contactName || c.managerName) && (
                                  <span className="text-secondary">
                                    <span className="text-muted mx-1">•</span>
                                    <i className="fas fa-user text-muted me-1" style={{ fontSize: "11px" }}></i>
                                    {c.contactName || c.managerName}
                                  </span>
                                )}

                                {c.taxCode && (
                                  <span className="text-secondary font-monospace" style={{ fontSize: "12px" }}>
                                    <span className="text-muted mx-1">•</span>
                                    MST: <strong className="text-danger">{c.taxCode}</strong>
                                  </span>
                                )}
                              </div>

                              {/* Dòng 3: Địa chỉ + Chỉ đường */}
                              <div className="text-secondary d-flex align-items-center gap-1.5 mt-0.5 flex-wrap" style={{ fontSize: "12.5px" }}>
                                <span className="text-truncate" style={{ maxWidth: "560px" }} title={c.address}>
                                  <i className="fas fa-map-marker-alt text-danger me-1.5" style={{ fontSize: "11px" }}></i>
                                  {c.address}
                                </span>
                                {c.address && (
                                  <a
                                    href={getDirectionsUrl(c)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-link p-0 text-primary text-decoration-none fw-semibold small d-inline-flex align-items-center gap-1 ms-1"
                                    style={{ fontSize: "11.5px" }}
                                    onClick={(e) => e.stopPropagation()}
                                    title="Mở chỉ đường Google Maps dẫn đến địa chỉ khách hàng"
                                  >
                                    <i className="fas fa-location-arrow text-danger" style={{ fontSize: "10px" }}></i>
                                    <span>Chỉ đường</span>
                                    {c.latitude != null && c.longitude != null && (
                                      <span
                                        className="badge bg-success-subtle text-success border border-success-subtle py-0 px-1 font-monospace"
                                        style={{ fontSize: "9px" }}
                                        title={`Tọa độ GPS: ${c.latitude}, ${c.longitude}`}
                                      >
                                        GPS
                                      </span>
                                    )}
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 2. Máy dịch vụ */}
                        <td className="text-center align-middle">
                          {equipCount > 0 ? (
                            <button
                              type="button"
                              className={`btn btn-sm ${isExpanded ? "btn-dark text-white" : "btn-outline-dark"} fw-semibold d-inline-flex align-items-center justify-content-center gap-1.5 text-nowrap`}
                              style={{ height: "30px", padding: "0 10px", fontSize: "12px", borderRadius: "6px" }}
                              onClick={() => toggleRow(c.id)}
                              title="Xem danh sách máy dịch vụ đang vận hành"
                            >
                              <i className="fas fa-print text-warning"></i>
                              <span>{equipCount} máy</span>
                              <i className={`fas fa-chevron-${isExpanded ? "up" : "down"} opacity-75`} style={{ fontSize: "9px" }}></i>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-success fw-semibold d-inline-flex align-items-center justify-content-center gap-1 text-nowrap"
                              style={{ height: "28px", padding: "0 10px", fontSize: "11.5px", borderRadius: "6px" }}
                              onClick={() => openAssignModal(c)}
                              title="Gán máy dịch vụ cho khách hàng này"
                            >
                              <i className="fas fa-plus" style={{ fontSize: "10px" }}></i>
                              <span>Gán máy</span>
                            </button>
                          )}
                        </td>

                        {/* 3. Hợp đồng & Phiếu kỹ thuật */}
                        <td className="text-center align-middle">
                          {contractCount === 0 && ticketCount === 0 ? (
                            <span className="text-muted small">—</span>
                          ) : (
                            <div className="d-inline-flex align-items-center justify-content-center gap-1.5 flex-wrap">
                              {contractCount > 0 && (
                                <span
                                  className="badge bg-primary-subtle text-primary border border-primary-subtle"
                                  style={{ fontSize: "11.5px", padding: "4px 8px" }}
                                  title="Số hợp đồng dịch vụ"
                                >
                                  {contractCount} HĐ
                                </span>
                              )}
                              {ticketCount > 0 && (
                                <span
                                  className="badge bg-danger text-white"
                                  style={{ fontSize: "11.5px", padding: "4px 8px" }}
                                  title="Số phiếu kỹ thuật"
                                >
                                  <i className="fas fa-wrench me-1" style={{ fontSize: "10px" }}></i>
                                  {ticketCount}
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* 4. Trạng thái */}
                        <td className="text-center align-middle">
                          <span
                            className={`badge ${
                              c.status === "ACTIVE"
                                ? "bg-success-subtle text-success border border-success-subtle"
                                : c.status === "SUSPENDED"
                                ? "bg-danger text-white border border-danger fw-bold"
                                : "bg-secondary-subtle text-secondary border"
                            }`}
                            style={{ fontSize: "11.5px", padding: "5px 10px" }}
                          >
                            {c.status === "ACTIVE" ? "Đang dùng" : c.status === "SUSPENDED" ? "Tạm ngưng" : "Ngừng DV"}
                          </span>
                        </td>

                        {/* 5. Thao tác (Cân đối chiều cao 30px đồng nhất, không xuống dòng) */}
                        <td className="text-center align-middle">
                          <div className="d-inline-flex align-items-center justify-content-center gap-1.5 flex-nowrap">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-primary fw-semibold d-inline-flex align-items-center justify-content-center gap-1 text-nowrap"
                              style={{ height: "30px", padding: "0 10px", fontSize: "12px" }}
                              onClick={() => openDetail(c, "equipment")}
                              title="Mở hồ sơ khách hàng 360°"
                            >
                              <i className="fas fa-id-card" style={{ fontSize: "11px" }}></i>
                              <span>Hồ sơ</span>
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0"
                              style={{ width: "30px", height: "30px" }}
                              onClick={() => openEdit(c)}
                              title="Chỉnh sửa thông tin"
                            >
                              <i className="fas fa-pen" style={{ fontSize: "11px" }}></i>
                            </button>

                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger p-0 d-inline-flex align-items-center justify-content-center flex-shrink-0"
                              style={{ width: "30px", height: "30px" }}
                              onClick={() => handleDelete(c)}
                              title="Xóa khách hàng"
                            >
                              <i className="fas fa-trash-alt" style={{ fontSize: "11px" }}></i>
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* KHỐI SỔ RA: CHỈ HIỂN THỊ THÔNG TIN PHỤ CHƯA CÓ Ở DÒNG CHÍNH */}
                      {isExpanded && (
                        <tr key={`${c.id}-expanded`} className="table-light">
                          <td colSpan={5} className="p-3 bg-light border-top border-bottom">
                            <div className="row g-3">
                              {/* Cột Trái: Danh sách máy dịch vụ đang vận hành */}
                              <div className="col-12 col-xl-8">
                                <div className="bg-white rounded border p-2.5 h-100">
                                  <div className="d-flex justify-content-between align-items-center mb-2">
                                    <span className="fw-bold text-dark" style={{ fontSize: "13px" }}>
                                      <i className="fas fa-print text-primary me-1.5"></i>
                                      Danh mục máy dịch vụ đang vận hành ({c.equipment?.length || 0})
                                    </span>
                                    <div className="d-flex align-items-center gap-1.5">
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary fw-semibold d-inline-flex align-items-center gap-1"
                                        style={{ height: "26px", padding: "0 10px", fontSize: "11.5px" }}
                                        onClick={() => openQuickCreateEquipmentModal(c)}
                                        title="Thêm nhanh máy mới để gán trực tiếp hoặc nhập kho"
                                      >
                                        <i className="fas fa-plus-circle" style={{ fontSize: "10px" }}></i>
                                        <span>Thêm máy mới</span>
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-success fw-semibold d-inline-flex align-items-center gap-1"
                                        style={{ height: "26px", padding: "0 10px", fontSize: "11.5px" }}
                                        onClick={() => openAssignModal(c)}
                                        title="Gán thiết bị có sẵn từ kho cho khách hàng"
                                      >
                                        <i className="fas fa-boxes" style={{ fontSize: "10px" }}></i>
                                        <span>Gán từ kho</span>
                                      </button>
                                    </div>
                                  </div>

                                  {c.equipment && c.equipment.length > 0 ? (
                                    <div className="table-responsive rounded border">
                                      <table className="table table-sm table-hover mb-0 align-middle" style={{ fontSize: "12px" }}>
                                        <thead className="bg-light text-secondary">
                                          <tr>
                                            <th>Model</th>
                                            <th>Serial Number</th>
                                            <th>Hình thức &amp; Danh mục</th>
                                            <th>Vị trí lắp đặt</th>
                                            <th className="text-end">Counter</th>
                                            <th className="text-center">Trạng thái</th>
                                            <th className="text-center text-nowrap" style={{ width: "160px", minWidth: "160px" }}>Tác vụ</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {c.equipment.map((eq) => {
                                            const locPath = formatLocationPath(eq, c);
                                            const locStr =
                                              [locPath, eq.locationNote].filter(Boolean).join(" • ") ||
                                              "Tại trụ sở chính";

                                            return (
                                              <tr key={eq.id}>
                                                <td className="fw-semibold text-dark">
                                                  {eq.model}
                                                </td>
                                                <td className="font-monospace text-primary fw-bold">
                                                  {eq.serialNumber}
                                                </td>
                                                <td>
                                                  <div className="d-flex align-items-center gap-1 flex-wrap">
                                                    <span
                                                      className={`badge ${
                                                        (eq.relationType || "").toLowerCase().includes("thuê")
                                                          ? "bg-primary text-white"
                                                          : (eq.relationType || "").toLowerCase().includes("bảo trì")
                                                          ? "bg-info text-dark"
                                                          : (eq.relationType || "").toLowerCase().includes("bảo hành")
                                                          ? "bg-success text-white"
                                                          : "bg-warning text-dark border border-warning"
                                                      }`}
                                                      style={{ fontSize: "10px" }}
                                                    >
                                                      {eq.relationType || "Cho thuê"}
                                                    </span>
                                                    {eq.category?.name && (
                                                      <span className="badge bg-light text-secondary border" style={{ fontSize: "10px" }}>
                                                        {eq.category.name}
                                                      </span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td
                                                  className="text-secondary text-truncate"
                                                  style={{ minWidth: "160px", maxWidth: "260px" }}
                                                  title={locStr}
                                                >
                                                  <div className="d-flex align-items-center gap-1.5 text-truncate">
                                                    <i className="fas fa-map-marker-alt text-danger opacity-75 flex-shrink-0" style={{ fontSize: "11px" }}></i>
                                                    {locPath ? (
                                                      <span className="text-truncate">
                                                        <span className="text-dark fw-semibold">{locPath}</span>
                                                        {eq.locationNote && (
                                                          <span className="text-secondary small ms-1">({eq.locationNote})</span>
                                                        )}
                                                      </span>
                                                    ) : eq.locationNote ? (
                                                      <span className="text-dark fw-medium text-truncate">{eq.locationNote}</span>
                                                    ) : (
                                                      <span className="text-muted fst-italic">Tại trụ sở chính</span>
                                                    )}
                                                  </div>
                                                </td>
                                                <td className="font-monospace fw-semibold text-end">
                                                  {eq.currentCounter ? eq.currentCounter.toLocaleString("vi-VN") : "0"}
                                                </td>
                                                <td className="text-center">
                                                  <span
                                                    className={`badge ${
                                                      eq.status === "ACTIVE"
                                                        ? "bg-success-subtle text-success border border-success-subtle"
                                                        : "bg-warning-subtle text-dark border border-warning-subtle"
                                                    }`}
                                                    style={{ fontSize: "10.5px" }}
                                                  >
                                                    {eq.status === "ACTIVE" ? "Hoạt động" : eq.status}
                                                  </span>
                                                </td>
                                                <td className="text-center align-middle text-nowrap">
                                                  <div className="d-inline-flex gap-1 justify-content-center align-items-center flex-nowrap">
                                                    <button
                                                      type="button"
                                                      className="btn btn-outline-primary fw-semibold text-nowrap"
                                                      style={{ height: "24px", padding: "0 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                                                      onClick={() => openQuickTicket(eq as EquipmentItem)}
                                                    >
                                                      Báo sửa
                                                    </button>
                                                    <button
                                                      type="button"
                                                      className="btn btn-outline-danger fw-semibold text-nowrap"
                                                      style={{ height: "24px", padding: "0 8px", fontSize: "11px", whiteSpace: "nowrap" }}
                                                      onClick={() => openUnassignModal(eq as EquipmentItem)}
                                                    >
                                                      Thu hồi
                                                    </button>
                                                  </div>
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="p-3 bg-light rounded border text-center text-muted small">
                                      Chưa có máy dịch vụ nào đang lắp đặt tại khách hàng này.
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Cột Phải: Thông tin mở rộng (Quản lý, Email, Zalo, Vị trí 3 cấp, Ghi chú) */}
                              <div className="col-12 col-xl-4">
                                <div className="bg-white rounded border p-2.5 h-100 d-flex flex-column justify-content-between">
                                  <div>
                                    <div className="d-flex justify-content-between align-items-center mb-2">
                                      <span className="fw-bold text-dark" style={{ fontSize: "13px" }}>
                                        <i className="fas fa-info-circle text-primary me-1.5"></i>
                                        Thông tin bổ sung
                                      </span>
                                      <button
                                        type="button"
                                        className="btn btn-sm btn-outline-primary fw-semibold d-inline-flex align-items-center gap-1 shadow-xs"
                                        style={{ height: "26px", padding: "0 10px", fontSize: "11.5px" }}
                                        onClick={() => openLocationModal(c)}
                                        title="Xem và chỉnh sửa sơ đồ vị trí phân nhánh của khách hàng"
                                      >
                                        <i className="fas fa-sitemap" style={{ fontSize: "10px" }}></i>
                                        <span>Sơ đồ vị trí</span>
                                      </button>
                                    </div>

                                    <div className="row g-2 small">
                                      <div className="col-6">
                                        <span className="text-muted d-block" style={{ fontSize: "11px" }}>Người quản lý:</span>
                                        <strong className="text-dark">{c.managerName || "—"}</strong>
                                        {c.managerPhone && <div className="font-monospace text-secondary">{c.managerPhone}</div>}
                                      </div>
                                      <div className="col-6">
                                        <span className="text-muted d-block" style={{ fontSize: "11px" }}>Email / Zalo:</span>
                                        <div className="text-truncate" title={c.email || ""}>{c.email || "—"}</div>
                                        {c.zaloId && <div className="font-monospace text-info">Zalo: {c.zaloId}</div>}
                                      </div>
                                      {c.notes && (
                                        <div className="col-12 mt-1">
                                          <span className="text-muted d-block" style={{ fontSize: "11px" }}>Ghi chú nội bộ:</span>
                                          <div className="text-secondary bg-light p-2 rounded border mt-0.5">{c.notes}</div>
                                        </div>
                                      )}
                                    </div>
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
        /* CARD VIEW */
        <div className="bg-white p-3 rounded shadow-sm border">
          <div className="row g-3">
            {customers.map((c) => {
              const equipCount = c._count?.equipment ?? c.equipment?.length ?? 0;
              const contractCount = c._count?.contracts ?? 0;
              const isVip = c.group === "Khách VIP";

              return (
                <div key={c.id} className="col-12 col-md-6 col-xl-4">
                  <div className={`card h-100 border shadow-sm rounded ${isVip ? "border-warning border-2" : ""}`}>
                    <div className="card-header bg-white d-flex justify-content-between align-items-center py-2 border-bottom">
                      <div
                        className="fw-bold text-dark text-truncate me-2 cursor-pointer"
                        style={{ fontSize: "13.5px" }}
                        onClick={() => openDetail(c, "equipment")}
                        title={c.name}
                      >
                        {c.name}
                      </div>
                      <div className="d-flex gap-1 align-items-center flex-shrink-0">
                        {renderGroupBadge(c.group)}
                        <span
                          className={`badge ${
                            c.status === "ACTIVE"
                              ? "bg-success-subtle text-success border border-success-subtle"
                              : c.status === "SUSPENDED"
                              ? "bg-danger text-white"
                              : "bg-secondary-subtle text-secondary"
                          }`}
                        >
                          {c.status === "ACTIVE" ? "Đang dùng" : c.status === "SUSPENDED" ? "Tạm ngưng" : "Ngừng DV"}
                        </span>
                      </div>
                    </div>

                    <div className="card-body p-3">
                      <h6 className="fw-bold mb-1 text-dark">
                        <button
                          type="button"
                          className="btn btn-link p-0 text-dark fw-bold text-decoration-none text-start fs-6"
                          onClick={() => openDetail(c, "equipment")}
                        >
                          {c.name}
                        </button>
                      </h6>

                      <div className="small text-muted mb-2 text-truncate" title={c.address}>
                        <i className="fas fa-map-marker-alt text-danger me-1"></i>
                        {c.address}
                      </div>

                      {/* Deployed machines list box */}
                      <div className="bg-light p-2 rounded border mb-2 small">
                        <div className="fw-bold text-dark mb-1 d-flex justify-content-between align-items-center">
                          <span>
                            <i className="fas fa-print me-1 text-primary"></i>
                            Máy dịch vụ ({equipCount}):
                          </span>
                          <button
                            type="button"
                            className="btn btn-link p-0 text-decoration-none small text-success fw-bold"
                            onClick={() => openAssignModal(c)}
                          >
                            + Gán máy
                          </button>
                        </div>
                        {c.equipment && c.equipment.length > 0 ? (
                          <div className="d-flex flex-column gap-1">
                            {c.equipment.map((eq) => (
                              <div
                                key={eq.id}
                                className="d-flex justify-content-between align-items-center font-monospace"
                                style={{ fontSize: "11px" }}
                              >
                                <span>
                                  <strong className="text-dark">{eq.model}</strong> ({eq.serialNumber})
                                </span>
                                <span className="badge bg-success-subtle text-success">Hoạt động</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-muted fst-italic">Chưa có máy dịch vụ</div>
                        )}
                      </div>

                      <div className="d-flex justify-content-between align-items-center small text-secondary pt-2 border-top">
                        {c.phone ? (
                          c.phone.includes("*") ? (
                            <span className="text-muted font-monospace small" title="Số điện thoại bị ẩn do tài khoản chưa được cấp quyền xem SĐT">
                              <i className="fas fa-lock text-muted me-1"></i>
                              {c.phone}
                            </span>
                          ) : (
                            <a
                              href={`tel:${c.phone}`}
                              className="fw-bold text-primary text-decoration-none font-monospace"
                            >
                              <i className="fas fa-phone-alt text-success me-1"></i>
                              {c.phone}
                            </a>
                          )
                        ) : (
                          <span className="text-muted small fst-italic">
                            <i className="fas fa-phone-slash text-muted me-1"></i>
                            Chưa có SĐT
                          </span>
                        )}
                        <span className="badge bg-light text-dark border">
                          <i className="fas fa-file-contract me-1 text-primary"></i>
                          {contractCount} Hợp đồng
                        </span>
                      </div>
                    </div>

                    <div className="card-footer bg-white border-top-0 pt-0 pb-3 d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-primary flex-grow-1 fw-bold"
                        onClick={() => openDetail(c, "equipment")}
                      >
                        <i className="fas fa-id-card me-1"></i> Xem hồ sơ 360°
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger px-2.5"
                        onClick={() => handleDelete(c)}
                        title="Xóa khách hàng"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Phân trang */}
      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center py-2 px-3 mt-2 bg-white rounded border shadow-sm">
          <span className="small text-muted" style={{ fontSize: "12px" }}>
            Hiển thị trang {page} / {totalPages} ({total} khách hàng)
          </span>
          <div className="btn-group btn-group-sm">
            <button
              className="btn btn-outline-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <i className="fas fa-chevron-left me-1"></i> Trước
            </button>
            <button
              className="btn btn-outline-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau <i className="fas fa-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      )}

      {/* 4. MODAL HỒ SƠ KHÁCH HÀNG 360° */}
      <ModalShell
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title={
          detailCustomer ? (
            <div className="d-flex align-items-center gap-2">
              <span className="fw-bold">{detailCustomer.name}</span>
              {detailCustomer.code && (
                <div className="d-inline-flex align-items-center font-monospace small text-primary ms-1">
                  #{detailCustomer.code}
                  <button
                    className="btn btn-sm btn-link p-0 text-muted ms-1"
                    title="Sao chép mã khách hàng"
                    onClick={() => {
                      navigator.clipboard.writeText(detailCustomer.code || "");
                      toast.info("Đã sao chép mã khách hàng!");
                    }}
                  >
                    <i className="fas fa-copy"></i>
                  </button>
                </div>
              )}
              <span
                className={`badge ms-2 ${
                  detailCustomer.status === "ACTIVE"
                    ? "bg-success-subtle text-success border border-success-subtle"
                    : detailCustomer.status === "SUSPENDED"
                    ? "bg-warning-subtle text-warning-emphasis border border-warning-subtle"
                    : "bg-secondary-subtle text-secondary"
                }`}
              >
                {detailCustomer.status === "ACTIVE"
                  ? "Đang dùng"
                  : detailCustomer.status === "SUSPENDED"
                  ? "Tạm ngưng"
                  : "Ngừng dịch vụ"}
              </span>
              <span className="badge bg-light text-dark border">
                {detailCustomer.group || "Khách thường"}
              </span>
            </div>
          ) : (
            "Hồ sơ khách hàng"
          )
        }
        size="xxl"
        dialogStyle={{ maxWidth: "min(1440px, 96vw)", width: "100%" }}
      >
        {detailLoading || !detailCustomer ? (
          <div className="py-5 text-center">
            <Loading />
          </div>
        ) : (
          <div>
            {/* Top Hub Nav Tabs */}
            <ul className="nav nav-pills nav-fill mb-3 bg-light p-1 rounded">
              <li className="nav-item">
                <button
                  className={`nav-link py-1.5 fw-semibold small ${
                    detailTab === "equipment" ? "active shadow-sm" : ""
                  }`}
                  onClick={() => setDetailTab("equipment")}
                >
                  <i className="fas fa-print me-1"></i> Danh mục máy dịch vụ ({detailCustomer.equipment?.length || 0})
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link py-1.5 fw-semibold small ${
                    detailTab === "tickets" ? "active shadow-sm" : ""
                  }`}
                  onClick={() => setDetailTab("tickets")}
                >
                  <i className="fas fa-tools me-1"></i> Phiếu kỹ thuật ({detailCustomer.tickets?.length || 0})
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link py-1.5 fw-semibold small ${
                    detailTab === "info" ? "active shadow-sm" : ""
                  }`}
                  onClick={() => setDetailTab("info")}
                >
                  <i className="fas fa-id-card-alt me-1"></i> Thông tin &amp; Vị trí
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link py-1.5 fw-semibold small ${
                    detailTab === "contracts" ? "active shadow-sm" : ""
                  }`}
                  onClick={() => setDetailTab("contracts")}
                >
                  <i className="fas fa-file-contract me-1"></i> Hợp đồng ({detailCustomer.contracts?.length || 0})
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link py-1.5 fw-semibold small ${
                    detailTab === "invoices" ? "active shadow-sm" : ""
                  }`}
                  onClick={() => setDetailTab("invoices")}
                >
                  <i className="fas fa-receipt me-1"></i> Công nợ &amp; Hóa đơn
                  {detailCustomer.totalDebt > 0 && (
                    <span className="badge bg-danger ms-1">
                      {formatCurrency(detailCustomer.totalDebt)}
                    </span>
                  )}
                </button>
              </li>
            </ul>

            {/* TAB 1: DANH MỤC MÁY DỊCH VỤ */}
            {detailTab === "equipment" && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h6 className="fw-bold text-dark mb-0">
                      Tổng máy dịch vụ: <span className="text-primary">{detailCustomer.equipment?.length || 0}</span>
                    </h6>
                    <span className="small text-muted">
                      Danh sách máy in, photocopy và thiết bị khách hàng đang vận hành
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm px-3 fw-bold shadow-sm d-inline-flex align-items-center gap-1.5"
                      onClick={() => openQuickCreateEquipmentModal(detailCustomer)}
                    >
                      <i className="fas fa-plus-circle"></i>
                      <span>Thêm máy mới</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-primary btn-sm px-3 fw-semibold shadow-sm d-inline-flex align-items-center gap-1.5"
                      onClick={() => openAssignModal(detailCustomer)}
                    >
                      <i className="fas fa-boxes"></i>
                      <span>Gán máy từ kho</span>
                    </button>
                  </div>
                </div>

                {(!detailCustomer.equipment || detailCustomer.equipment.length === 0) ? (
                  <div className="card border-dashed p-5 text-center text-muted">
                    <i className="fas fa-print fa-3x mb-3 text-secondary opacity-50"></i>
                    <p className="mb-2">Khách hàng này hiện chưa được gán máy dịch vụ nào.</p>
                    <div className="d-flex justify-content-center align-items-center gap-2 mt-2">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-3 fw-bold shadow-xs d-inline-flex align-items-center gap-1.5"
                        onClick={() => openQuickCreateEquipmentModal(detailCustomer)}
                      >
                        <i className="fas fa-plus-circle"></i>
                        <span>Thêm máy mới &amp; gán ngay</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-primary btn-sm px-3 fw-semibold d-inline-flex align-items-center gap-1.5"
                        onClick={() => openAssignModal(detailCustomer)}
                      >
                        <i className="fas fa-boxes"></i>
                        <span>Chọn thiết bị từ kho để bàn giao</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="table-responsive bg-white rounded border">
                    <table className="table table-hover table-bordered mb-0 align-middle" style={{ minWidth: "1050px" }}>
                      <thead className="bg-dark text-white small">
                        <tr>
                          <th style={{ minWidth: "120px" }}>Model</th>
                          <th style={{ minWidth: "120px" }}>Serial Number</th>
                          <th style={{ minWidth: "130px" }}>Hình thức &amp; Danh mục</th>
                          <th style={{ minWidth: "180px", maxWidth: "280px" }}>Vị trí lắp đặt</th>
                          <th className="text-end" style={{ minWidth: "100px" }}>Chỉ số Counter</th>
                          <th style={{ minWidth: "90px" }}>Hợp đồng</th>
                          <th className="text-center" style={{ minWidth: "95px" }}>Trạng thái</th>
                          <th className="text-center text-nowrap" style={{ width: "245px", minWidth: "245px" }}>Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailCustomer.equipment.map((eq) => {
                          const locPath = formatLocationPath(eq, detailCustomer);
                          const locStr =
                            [locPath, eq.locationNote].filter(Boolean).join(" • ") ||
                            detailCustomer.address ||
                            "Tại trụ sở chính";

                          return (
                            <tr key={eq.id}>
                              <td className="fw-bold text-dark text-nowrap">
                                {eq.model}
                              </td>
                              <td className="font-monospace text-primary fw-semibold text-nowrap">
                                {eq.serialNumber}
                              </td>
                              <td>
                                <div className="d-flex align-items-center gap-1 flex-wrap">
                                  <span
                                    className={`badge ${
                                      (eq.relationType || "").toLowerCase().includes("thuê")
                                        ? "bg-primary text-white"
                                        : (eq.relationType || "").toLowerCase().includes("bảo trì")
                                        ? "bg-info text-dark"
                                        : (eq.relationType || "").toLowerCase().includes("bảo hành")
                                        ? "bg-success text-white"
                                        : "bg-warning text-dark border border-warning"
                                    }`}
                                    style={{ fontSize: "10px" }}
                                  >
                                    {eq.relationType || "Cho thuê"}
                                  </span>
                                  {eq.category?.name && (
                                    <span className="badge bg-light text-secondary border" style={{ fontSize: "10px" }}>
                                      {eq.category.name}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td
                                className="small text-secondary cursor-pointer"
                                style={{ minWidth: "180px", maxWidth: "280px" }}
                                title={`Vị trí: ${locStr} (Bấm để đổi vị trí)`}
                                onClick={() => openChangeLocationModal(eq, detailCustomer)}
                              >
                                <div className="d-flex align-items-center justify-content-between gap-1">
                                  <div className="d-flex align-items-center gap-1.5 text-truncate">
                                    <i className="fas fa-map-marker-alt text-danger opacity-75 flex-shrink-0" style={{ fontSize: "11px" }}></i>
                                    {locPath ? (
                                      <span className="text-truncate">
                                        <span className="text-dark fw-semibold">{locPath}</span>
                                        {eq.locationNote && (
                                          <span className="text-secondary small ms-1">({eq.locationNote})</span>
                                        )}
                                      </span>
                                    ) : eq.locationNote ? (
                                      <span className="text-dark fw-medium text-truncate">{eq.locationNote}</span>
                                    ) : (
                                      <span className="text-muted fst-italic">{detailCustomer.address || "Tại trụ sở chính"}</span>
                                    )}
                                  </div>
                                  <i className="fas fa-pen text-muted opacity-50 flex-shrink-0" style={{ fontSize: "10px" }} title="Đổi vị trí"></i>
                                </div>
                              </td>
                              <td className="fw-semibold text-end text-nowrap">
                                {eq.currentCounter.toLocaleString("vi-VN")} bản
                              </td>
                              <td className="text-nowrap">
                                {eq.contract ? (
                                  <span className="font-monospace text-primary small fw-semibold">
                                    {eq.contract.code}
                                  </span>
                                ) : (
                                  <span className="text-muted small">—</span>
                                )}
                              </td>
                              <td className="text-center text-nowrap">
                                <span className={`badge ${eq.status === "ACTIVE" ? "bg-success-subtle text-success border border-success-subtle" : "bg-warning-subtle text-warning-emphasis"}`}>
                                  {eq.status === "ACTIVE" ? "Hoạt động" : eq.status}
                                </span>
                              </td>
                              <td className="text-center align-middle text-nowrap" style={{ width: "245px", minWidth: "245px" }}>
                                <div className="d-inline-flex gap-1.5 justify-content-center align-items-center flex-nowrap">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-secondary py-1 px-2 fw-semibold text-nowrap d-inline-flex align-items-center gap-1 shadow-none"
                                    style={{ fontSize: "11px", height: "26px", whiteSpace: "nowrap" }}
                                    onClick={() => openChangeLocationModal(eq, detailCustomer)}
                                    title="Chuyển / đổi vị trí lắp đặt máy này"
                                  >
                                    <i className="fas fa-map-marker-alt" style={{ fontSize: "10px" }}></i>
                                    <span>Vị trí</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary py-1 px-2 fw-semibold text-nowrap d-inline-flex align-items-center gap-1 shadow-none"
                                    style={{ fontSize: "11px", height: "26px", whiteSpace: "nowrap" }}
                                    onClick={() => openQuickTicket(eq)}
                                    title="Tạo yêu cầu sửa chữa/bảo trì cho máy này"
                                  >
                                    <i className="fas fa-wrench" style={{ fontSize: "10px" }}></i>
                                    <span>Báo sửa</span>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-danger py-1 px-2 fw-semibold text-nowrap d-inline-flex align-items-center gap-1 shadow-none"
                                    style={{ fontSize: "11px", height: "26px", whiteSpace: "nowrap" }}
                                    onClick={() => openUnassignModal(eq)}
                                    title="Thu hồi máy về kho"
                                  >
                                    <i className="fas fa-undo" style={{ fontSize: "10px" }}></i>
                                    <span>Thu hồi</span>
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
            )}

            {/* TAB 2: LỊCH SỬ CÔNG VIỆC */}
            {detailTab === "tickets" && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h6 className="fw-bold text-dark mb-0">Lịch sử công việc kỹ thuật</h6>
                    <span className="small text-muted">Nhật ký xử lý kỹ thuật, sửa chữa, bảo trì</span>
                  </div>
                  {detailCustomer.equipment?.length > 0 && (
                    <button
                      className="btn btn-outline-primary btn-sm"
                      onClick={() => openQuickTicket(detailCustomer.equipment[0])}
                    >
                      <i className="fas fa-plus me-1"></i> Tạo công việc mới
                    </button>
                  )}
                </div>

                {(!detailCustomer.tickets || detailCustomer.tickets.length === 0) ? (
                  <div className="text-center py-5 text-muted">
                    <i className="fas fa-clipboard-check fa-3x mb-3 text-secondary opacity-50"></i>
                    <p>Chưa có lịch sử công việc nào ghi nhận cho khách hàng này.</p>
                  </div>
                ) : (
                  <div className="table-responsive bg-white rounded border">
                    <table className="table table-hover table-bordered mb-0 align-middle">
                      <thead className="bg-dark text-white small">
                        <tr>
                          <th>Mã phiếu</th>
                          <th>Loại công việc</th>
                          <th>Thiết bị</th>
                          <th>Kỹ thuật viên</th>
                          <th>Thời gian</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailCustomer.tickets.map((tk) => (
                          <tr key={tk.id}>
                            <td className="fw-bold font-monospace text-primary">
                              {tk.code}
                            </td>
                            <td className="fw-semibold text-dark">
                              {tk.type === "REPAIR"
                                ? "Sửa chữa máy"
                                : tk.type === "MAINTENANCE"
                                ? "Bảo trì định kỳ"
                                : tk.type === "INSTALLATION"
                                ? "Lắp mới thiết bị"
                                : tk.description || "Nạp mực máy in"}
                            </td>
                            <td>
                              {tk.equipment ? (
                                <span className="small text-secondary">
                                  {tk.equipment.model} ({tk.equipment.serialNumber})
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {tk.assignee ? (
                                <span className="small fw-semibold text-dark">
                                  {tk.assignee.name}
                                </span>
                              ) : (
                                <span className="badge bg-secondary-subtle text-secondary">
                                  Chưa giao KTV
                                </span>
                              )}
                            </td>
                            <td className="small text-muted">
                              {formatDateTime(tk.createdAt)}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  tk.status === "COMPLETED"
                                    ? "bg-success-subtle text-success border border-success-subtle"
                                    : tk.status === "IN_PROGRESS"
                                    ? "bg-primary text-white"
                                    : tk.status === "PENDING"
                                    ? "bg-danger-subtle text-danger border border-danger-subtle"
                                    : "bg-secondary-subtle text-secondary"
                                }`}
                              >
                                {tk.status === "COMPLETED"
                                  ? "Hoàn thành"
                                  : tk.status === "IN_PROGRESS"
                                  ? "Đang xử lý"
                                  : tk.status === "PENDING"
                                  ? "Chờ điều phối"
                                  : tk.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: THÔNG TIN & VỊ TRÍ */}
            {detailTab === "info" && (
              <div className="row g-3">
                <div className="col-12 col-md-6">
                  <div className="card border shadow-sm p-3 rounded">
                    <h6 className="fw-bold text-dark border-bottom pb-2 mb-3">
                      <i className="fas fa-building text-primary me-2"></i>Thông tin doanh nghiệp
                    </h6>
                    <div className="mb-2">
                      <span className="text-muted small">Tên khách hàng:</span>
                      <div className="fw-bold">{detailCustomer.name}</div>
                    </div>
                    <div className="mb-2">
                      <span className="text-muted small">Mã khách hàng:</span>
                      <div className="fw-semibold font-monospace text-primary">#{detailCustomer.code}</div>
                    </div>
                    <div className="mb-2">
                      <span className="text-muted small">Mã số thuế:</span>
                      <div>{detailCustomer.taxCode || "Chưa có"}</div>
                    </div>
                    <div className="mb-2">
                      <span className="text-muted small">Địa chỉ chính:</span>
                      <div className="fw-semibold text-dark">{detailCustomer.address}</div>
                      <div className="mt-1.5 d-flex align-items-center gap-2 flex-wrap">
                        <a
                          href={getDirectionsUrl(detailCustomer)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline-primary py-0.5 px-2.5 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                          style={{ fontSize: "11.5px" }}
                          title="Mở Google Maps dẫn đường tới địa chỉ này"
                        >
                          <i className="fas fa-location-arrow text-danger"></i>
                          <span>Chỉ đường Google Maps</span>
                        </a>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-success py-0.5 px-2.5 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                          style={{ fontSize: "11.5px" }}
                          onClick={() => {
                            setLocationPickerTarget("detail");
                            setShowLocationPickerModal(true);
                          }}
                          title="Mở bản đồ vệ tinh ESRI siêu nét để kéo ghim đúng nóc nhà"
                        >
                          <i className="fas fa-satellite"></i>
                          <span>{detailCustomer.latitude != null ? "Chỉnh vị trí vệ tinh" : "Ghim bản đồ vệ tinh"}</span>
                        </button>
                        {detailCustomer.latitude != null && detailCustomer.longitude != null && (
                          <span className="badge bg-success-subtle text-success border border-success-subtle small font-monospace py-1 px-2">
                            <i className="fas fa-crosshairs me-1"></i>
                            GPS: {detailCustomer.latitude.toFixed(5)}, {detailCustomer.longitude.toFixed(5)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mb-2">
                      <span className="text-muted small">Ghi chú quản lý:</span>
                      <div className="p-2 bg-light rounded text-secondary small">
                        {detailCustomer.notes || "Chưa có ghi chú"}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-12 col-md-6">
                  <div className="card border shadow-sm p-3 rounded">
                    <h6 className="fw-bold text-dark border-bottom pb-2 mb-3">
                      <i className="fas fa-address-book text-success me-2"></i>Thông tin liên hệ &amp; Quản lý
                    </h6>
                    <div className="mb-2">
                      <span className="text-muted small">Số điện thoại liên hệ chính:</span>
                      <div>
                        {detailCustomer.phone ? (
                          detailCustomer.phone.includes("*") ? (
                            <span className="fw-semibold text-muted font-monospace d-inline-flex align-items-center gap-1" title="Số điện thoại bị ẩn do tài khoản chưa được cấp quyền xem SĐT">
                              <i className="fas fa-lock text-muted small"></i>
                              {detailCustomer.phone}
                            </span>
                          ) : (
                            <a href={`tel:${detailCustomer.phone}`} className="fw-bold text-decoration-none text-primary">
                              {detailCustomer.phone}
                            </a>
                          )
                        ) : (
                          <span className="text-muted fst-italic">Chưa có</span>
                        )}
                      </div>
                    </div>
                    <div className="mb-2">
                      <span className="text-muted small">Email:</span>
                      <div>{detailCustomer.email || "Chưa có"}</div>
                    </div>
                    <div className="mb-2">
                      <span className="text-muted small">Zalo:</span>
                      <div>{detailCustomer.zaloId || "Chưa có"}</div>
                    </div>
                    <div className="row g-2 pt-2 border-top">
                      <div className="col-6">
                        <span className="text-muted small">Người quản lý:</span>
                        <div className="fw-semibold">{detailCustomer.managerName || "—"}</div>
                        <div className="small text-muted">{detailCustomer.managerPhone || ""}</div>
                      </div>
                      <div className="col-6">
                        <span className="text-muted small">Người liên hệ trực tiếp:</span>
                        <div className="fw-semibold">{detailCustomer.contactName || "—"}</div>
                        <div className="small text-muted">{detailCustomer.contactPhone || ""}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Khối Sơ đồ vị trí tổ chức */}
                <div className="col-12 mt-2">
                  <div className="card border shadow-sm rounded-3 p-3 bg-white">
                    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                      <div className="d-flex align-items-center gap-2.5">
                        <div
                          className="rounded-circle bg-primary-subtle text-primary d-flex align-items-center justify-content-center shadow-xs"
                          style={{ width: "38px", height: "38px" }}
                        >
                          <i className="fas fa-sitemap fs-6"></i>
                        </div>
                        <div>
                          <div className="fw-bold text-dark" style={{ fontSize: "14px" }}>
                            Sơ đồ cấu trúc vị trí &amp; Chi nhánh
                          </div>
                          <div className="small text-muted">
                            {detailCustomer.branches && detailCustomer.branches.length > 0 ? (
                              <span>
                                Đã thiết lập <strong className="text-primary">{detailCustomer.branches.length}</strong> chi nhánh / điểm đặt máy
                              </span>
                            ) : (
                              <span>Chưa thiết lập chi nhánh phân cấp (vận hành tại trụ sở chính)</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-3 py-1.5 fw-bold shadow-sm d-inline-flex align-items-center gap-1.5"
                        onClick={() => openLocationModal(detailCustomer)}
                      >
                        <i className="fas fa-sitemap"></i>
                        <span>Sơ đồ vị trí</span>
                        {detailCustomer.branches && detailCustomer.branches.length > 0 && (
                          <span className="badge bg-white text-primary rounded-pill ms-1">
                            {detailCustomer.branches.length}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: HỢP ĐỒNG & DỊCH VỤ */}
            {detailTab === "contracts" && (
              <div>
                <h6 className="fw-bold text-dark mb-3">Hợp đồng dịch vụ &amp; cho thuê</h6>
                {(!detailCustomer.contracts || detailCustomer.contracts.length === 0) ? (
                  <div className="text-center py-4 text-muted">
                    Chưa có hợp đồng nào với khách hàng này.
                  </div>
                ) : (
                  <div className="table-responsive bg-white rounded border">
                    <table className="table table-sm table-hover table-bordered mb-0 align-middle">
                      <thead className="bg-dark text-white small">
                        <tr>
                          <th>Mã HĐ</th>
                          <th>Ngày bắt đầu</th>
                          <th>Ngày kết thúc</th>
                          <th>Giá thuê / tháng</th>
                          <th>Định mức (bản)</th>
                          <th>Giá vượt</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailCustomer.contracts.map((ct) => (
                          <tr key={ct.id}>
                            <td className="fw-bold font-monospace text-primary">{ct.code}</td>
                            <td>{formatDate(ct.startDate)}</td>
                            <td>{ct.endDate ? formatDate(ct.endDate) : "Vô thời hạn"}</td>
                            <td className="fw-semibold">{formatCurrency(ct.basePrice)}</td>
                            <td>{ct.baseQuota.toLocaleString("vi-VN")}</td>
                            <td>{formatCurrency(ct.overagePrice)}</td>
                            <td>
                              <span className={`badge ${ct.isActive ? "bg-success-subtle text-success border border-success-subtle" : "bg-secondary-subtle text-secondary"}`}>
                                {ct.isActive ? "Hiệu lực" : "Hết hạn"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 5: CÔNG NỢ & HÓA ĐƠN */}
            {detailTab === "invoices" && (
              <div>
                <div className="card bg-light border-0 p-3 mb-3 rounded">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <span className="text-muted small">Tổng công nợ cần thu hiện tại</span>
                      <h4 className="fw-bold text-danger mb-0">
                        {formatCurrency(detailCustomer.totalDebt)}
                      </h4>
                    </div>
                    <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle p-2">
                      {detailCustomer.unpaidCount || 0} hóa đơn chưa thanh toán
                    </span>
                  </div>
                </div>

                <h6 className="fw-bold text-dark mb-2">Lịch sử hóa đơn</h6>
                {(!detailCustomer.invoices || detailCustomer.invoices.length === 0) ? (
                  <div className="text-center py-4 text-muted">Chưa có hóa đơn phát sinh.</div>
                ) : (
                  <div className="table-responsive bg-white rounded border">
                    <table className="table table-sm table-hover table-bordered mb-0 align-middle">
                      <thead className="bg-dark text-white small">
                        <tr>
                          <th>Mã HĐ</th>
                          <th>Kỳ tính cước</th>
                          <th>Tổng tiền</th>
                          <th>Hạn thanh toán</th>
                          <th>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailCustomer.invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td className="fw-bold font-monospace text-primary">{inv.code}</td>
                            <td>
                              {formatDate(inv.periodStart)} - {formatDate(inv.periodEnd)}
                            </td>
                            <td className="fw-bold text-danger">{formatCurrency(inv.total)}</td>
                            <td>{inv.dueDate ? formatDate(inv.dueDate) : "—"}</td>
                            <td>
                              <span
                                className={`badge ${
                                  inv.status === "PAID"
                                    ? "bg-success-subtle text-success border border-success-subtle"
                                    : inv.status === "OVERDUE"
                                    ? "bg-danger text-white"
                                    : "bg-warning-subtle text-warning-emphasis border border-warning-subtle"
                                }`}
                              >
                                {inv.status === "PAID"
                                  ? "Đã thanh toán"
                                  : inv.status === "OVERDUE"
                                  ? "Quá hạn"
                                  : "Chưa thanh toán"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* GHI CHÚ TƯƠNG TÁC / TRAO ĐỔI NHANH */}
            <div className="mt-4 pt-3 border-top">
              <div className="fw-bold small text-dark mb-2 d-flex align-items-center gap-1">
                <i className="fas fa-comments text-primary"></i> Ghi nhận trao đổi &amp; Chăm sóc khách hàng:
              </div>

              {detailCustomer.feedbacks && detailCustomer.feedbacks.length > 0 && (
                <div
                  className="bg-light p-2 rounded mb-2 overflow-auto"
                  style={{ maxHeight: "140px" }}
                >
                  {detailCustomer.feedbacks.map((fb) => (
                    <div key={fb.id} className="mb-2 pb-1 border-bottom small last-border-0">
                      <div className="d-flex justify-content-between text-muted" style={{ fontSize: "11px" }}>
                        <strong>{fb.authorName || "Nhân viên"}</strong>
                        <span>{formatDateTime(fb.createdAt)}</span>
                      </div>
                      <div className="text-dark">{fb.content}</div>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSendFeedback} className="d-flex gap-2">
                <input
                  type="text"
                  className="form-control form-control-sm shadow-none"
                  placeholder="Ghi nhận trao đổi của khách hàng, hẹn lịch, yêu cầu linh kiện…"
                  value={quickFeedback}
                  onChange={(e) => setQuickFeedback(e.target.value)}
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm px-3 fw-bold text-nowrap"
                  disabled={sendingFeedback || !quickFeedback.trim()}
                >
                  <i className="fas fa-paper-plane me-1"></i> Lưu ghi chú
                </button>
              </form>
            </div>
          </div>
        )}
      </ModalShell>

      {/* 5. MODAL GÁN MÁY DỊCH VỤ TỪ KHO */}
      <ModalShell
        isOpen={showAssignModal}
        onClose={() => setShowAssignModal(false)}
        title={
          <div className="d-flex align-items-center justify-content-between w-100 pe-2">
            <div className="d-flex align-items-center gap-2">
              <i className="fas fa-truck-ramp-box text-white"></i>
              <span>Gán máy dịch vụ từ kho cho khách hàng</span>
            </div>
            {detailCustomer && (
              <span
                className="badge bg-white text-primary fw-semibold px-2.5 py-1 text-truncate shadow-xs"
                style={{ maxWidth: "360px", fontSize: "12px" }}
              >
                <i className="fas fa-user-tie me-1"></i>
                {detailCustomer.name}
              </span>
            )}
          </div>
        }
        size="xxl"
        dialogStyle={{ maxWidth: "min(1440px, 96vw)", width: "100%" }}
      >
        {assignLoading ? (
          <div className="py-5 text-center">
            <Loading />
            <div className="small text-muted mt-2">Đang tải danh sách thiết bị có sẵn trong kho...</div>
          </div>
        ) : (
          <form onSubmit={handleAssignSubmit}>
            <div className="row g-0">
              {/* CỘT TRÁI: DANH MỤC THIẾT BỊ TRONG KHO */}
              <div
                className="col-12 col-lg-6 p-3 pe-lg-4 border-end"
                style={{ backgroundColor: "#f8fafc" }}
              >
                <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom flex-wrap gap-2">
                  <div className="d-flex align-items-center gap-2">
                    <i className="fas fa-boxes-stacked text-primary fs-6"></i>
                    <span className="fw-bold text-dark text-uppercase small">
                      1. Chọn thiết bị trong kho
                    </span>
                  </div>
                  <div className="d-flex align-items-center gap-1.5">
                    <span className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1 fw-semibold">
                      {availableEquipments.length} máy sẵn sàng
                    </span>
                    <button
                      type="button"
                      className="btn btn-sm btn-success py-0.5 px-2.5 fw-bold d-inline-flex align-items-center gap-1 shadow-xs"
                      style={{ fontSize: "11.5px", height: "26px" }}
                      onClick={() => openQuickCreateEquipmentModal()}
                      title="Nhập nhanh thiết bị mới vào kho hoặc gán luôn cho khách"
                    >
                      <i className="fas fa-plus"></i>
                      <span>Thêm máy mới</span>
                    </button>
                  </div>
                </div>

                {/* Thanh tìm kiếm tức thì */}
                <div className="position-relative mb-2">
                  <i
                    className="fas fa-search position-absolute top-50 start-0 translate-middle-y ms-3 text-primary"
                    style={{ fontSize: "13px" }}
                  ></i>
                  <input
                    type="text"
                    className="form-control form-control-sm ps-5 pe-4 rounded-2 border-secondary-subtle"
                    style={{ height: "34px", fontSize: "13px" }}
                    placeholder="Tìm theo Serial, Model, Hãng, Mã máy..."
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                  />
                  {assignSearch && (
                    <button
                      type="button"
                      className="btn btn-sm btn-link text-muted position-absolute top-50 end-0 translate-middle-y me-2 p-0 text-decoration-none"
                      onClick={() => setAssignSearch("")}
                    >
                      <i className="fas fa-times-circle"></i>
                    </button>
                  )}
                </div>

                {/* Bộ lọc nhanh: Kho, Hãng, Loại máy */}
                <div className="row g-2 mb-2">
                  <div className="col-4">
                    <select
                      className="form-select form-select-sm rounded-2 text-dark border-secondary-subtle fw-medium"
                      style={{ fontSize: "12px", height: "32px" }}
                      value={assignWarehouseFilter}
                      onChange={(e) => setAssignWarehouseFilter(e.target.value)}
                    >
                      <option value="">Tất cả kho</option>
                      {assignAvailableWarehouses.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-4">
                    <select
                      className="form-select form-select-sm rounded-2 text-dark border-secondary-subtle fw-medium"
                      style={{ fontSize: "12px", height: "32px" }}
                      value={assignBrandFilter}
                      onChange={(e) => setAssignBrandFilter(e.target.value)}
                    >
                      <option value="">Tất cả hãng</option>
                      {assignAvailableBrands.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-4">
                    <select
                      className="form-select form-select-sm rounded-2 text-dark border-secondary-subtle fw-medium"
                      style={{ fontSize: "12px", height: "32px" }}
                      value={assignTypeFilter}
                      onChange={(e) => setAssignTypeFilter(e.target.value)}
                    >
                      <option value="">Tất cả loại máy</option>
                      {assignAvailableTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Đếm kết quả & nút đặt lại bộ lọc */}
                <div
                  className="d-flex justify-content-between align-items-center mb-2 px-1 text-muted"
                  style={{ fontSize: "12px" }}
                >
                  <span>
                    Hiển thị:{" "}
                    <strong className="text-primary">
                      {filteredAvailableEquipments.length}
                    </strong>{" "}
                    máy phù hợp
                  </span>
                  {(assignSearch ||
                    assignWarehouseFilter ||
                    assignBrandFilter ||
                    assignTypeFilter) && (
                    <button
                      type="button"
                      className="btn btn-link btn-sm p-0 text-danger text-decoration-none fw-semibold"
                      style={{ fontSize: "11px" }}
                      onClick={() => {
                        setAssignSearch("");
                        setAssignWarehouseFilter("");
                        setAssignBrandFilter("");
                        setAssignTypeFilter("");
                      }}
                    >
                      <i className="fas fa-arrow-rotate-left me-1"></i>Đặt lại bộ lọc
                    </button>
                  )}
                </div>

                {/* Danh sách cuộn chọn máy dạng compact */}
                <div
                  className="pe-1"
                  style={{ maxHeight: "460px", overflowY: "auto" }}
                >
                  {availableEquipments.length === 0 ? (
                    <div className="alert alert-warning small py-4 text-center rounded-2">
                      <i className="fas fa-box-open fa-2x mb-2 d-block text-warning opacity-75"></i>
                      <div className="fw-semibold text-dark mb-1">Hiện không có thiết bị nào trong kho sẵn sàng để gán.</div>
                      <p className="text-muted small mb-3">Bạn có thể tạo nhanh thiết bị mới để gán trực tiếp hoặc nhập vào kho ngay tại đây.</p>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm px-3 fw-bold shadow-xs d-inline-flex align-items-center gap-1.5"
                        onClick={() => openQuickCreateEquipmentModal()}
                      >
                        <i className="fas fa-plus-circle"></i>
                        <span>Thêm thiết bị mới ngay</span>
                      </button>
                    </div>
                  ) : filteredAvailableEquipments.length === 0 ? (
                    <div className="text-center py-4 text-muted bg-white rounded-2 border">
                      <i className="fas fa-search fa-2x mb-2 text-secondary opacity-40"></i>
                      <p className="small mb-3 text-secondary">
                        Không tìm thấy thiết bị nào khớp với bộ lọc hiện tại.
                      </p>
                      <div className="d-flex justify-content-center gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-secondary btn-sm px-3 rounded-pill"
                          style={{ fontSize: "12px" }}
                          onClick={() => {
                            setAssignSearch("");
                            setAssignWarehouseFilter("");
                            setAssignBrandFilter("");
                            setAssignTypeFilter("");
                          }}
                        >
                          Xóa bộ lọc
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm px-3 rounded-pill fw-semibold d-inline-flex align-items-center gap-1"
                          style={{ fontSize: "12px" }}
                          onClick={() => openQuickCreateEquipmentModal()}
                        >
                          <i className="fas fa-plus-circle"></i>
                          <span>Thêm máy mới</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    filteredAvailableEquipments.map((eq) => {
                      const isSelected = assignForm.equipmentId === eq.id;
                      return (
                        <div
                          key={eq.id}
                          onClick={() => {
                            setAssignForm((prev) => ({
                              ...prev,
                              equipmentId: eq.id,
                              initialCounter: eq.currentCounter ?? 0,
                              relationType: prev.relationType || eq.relationType || "Cho thuê",
                            }));
                          }}
                          className="p-2 mb-1.5 rounded border transition-all"
                          style={{
                            cursor: "pointer",
                            transition: "all 0.15s ease-in-out",
                            backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                            borderColor: isSelected ? "#3b82f6" : "#cbd5e1",
                            borderLeft: isSelected
                              ? "4px solid #2563eb"
                              : "1px solid #cbd5e1",
                          }}
                        >
                          {/* Hàng 1: Tên máy + S/N + Loại + Nút chọn */}
                          <div className="d-flex justify-content-between align-items-center">
                            <div className="d-flex align-items-center gap-1.5 text-truncate me-2">
                              <span
                                className={`fw-bold text-truncate ${
                                  isSelected ? "text-primary" : "text-dark"
                                }`}
                                style={{ fontSize: "13px" }}
                              >
                                {getEquipmentDisplayName(eq.brand, eq.model)}
                              </span>
                              <span
                                className="badge font-monospace text-primary bg-primary-subtle border border-primary-subtle px-1.5 py-0.5 fw-semibold"
                                style={{ fontSize: "11px" }}
                              >
                                S/N: {eq.serialNumber}
                              </span>
                              {eq.type && (
                                <span
                                  className="badge bg-light text-secondary border font-normal"
                                  style={{ fontSize: "10px" }}
                                >
                                  {eq.type}
                                </span>
                              )}
                            </div>

                            <div>
                              {isSelected ? (
                                <span
                                  className="badge bg-primary text-white px-2.5 py-1 rounded-pill shadow-xs"
                                  style={{ fontSize: "11px" }}
                                >
                                  <i className="fas fa-check-circle me-1"></i>Đang chọn
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-outline-primary btn-sm py-0.5 px-2.5 rounded-pill fw-semibold"
                                  style={{ fontSize: "11px" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setAssignForm((prev) => ({
                                      ...prev,
                                      equipmentId: eq.id,
                                      initialCounter: eq.currentCounter ?? 0,
                                      relationType:
                                        prev.relationType || eq.relationType || "Cho thuê",
                                    }));
                                  }}
                                >
                                  Chọn
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Hàng 2: Kho bãi + Counter */}
                          <div
                            className="d-flex justify-content-between align-items-center mt-1 text-muted"
                            style={{ fontSize: "11.5px" }}
                          >
                            <span className="text-truncate me-2">
                              <i className="fas fa-warehouse text-warning me-1"></i>
                              <span className="text-dark fw-medium">
                                {eq.warehouse?.name || "Kho mặc định"}
                              </span>
                              {eq.locationNote ? (
                                <span className="text-secondary ms-1">
                                  ({eq.locationNote})
                                </span>
                              ) : null}
                            </span>
                            <span
                              className="badge font-monospace bg-info-subtle text-info-emphasis border border-info-subtle px-1.5 py-0.5"
                              style={{ fontSize: "11px" }}
                            >
                              <i className="fas fa-tachometer-alt me-1 text-info"></i>
                              {eq.currentCounter.toLocaleString("vi-VN")}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* CỘT PHẢI: THÔNG TIN BÀN GIAO & LẮP ĐẶT */}
              <div className="col-12 col-lg-6 p-3 ps-lg-4 bg-white">
                <div className="d-flex justify-content-between align-items-center mb-2 pb-2 border-bottom">
                  <div className="d-flex align-items-center gap-2">
                    <i className="fas fa-clipboard-check text-success fs-6"></i>
                    <span className="fw-bold text-dark text-uppercase small">
                      2. Thông tin bàn giao &amp; Lắp đặt
                    </span>
                  </div>
                </div>

                {/* Thẻ hiển thị máy đã chọn (Trực quan, hài hòa) */}
                {selectedAvailableEquipment ? (
                  <div
                    className="p-2.5 rounded-2 border mb-3 shadow-xs"
                    style={{
                      backgroundColor: "#f0fdf4",
                      borderColor: "#86efac",
                      borderLeft: "4px solid #16a34a",
                    }}
                  >
                    <div className="d-flex justify-content-between align-items-center mb-1.5">
                      <div className="d-flex align-items-center gap-2 flex-wrap">
                        <span
                          className="badge bg-success text-white"
                          style={{ fontSize: "10.5px" }}
                        >
                          <i className="fas fa-check-circle me-1"></i>Đã chọn
                        </span>
                        <span className="fw-bold text-dark" style={{ fontSize: "14px" }}>
                          {getEquipmentDisplayName(
                            selectedAvailableEquipment.brand,
                            selectedAvailableEquipment.model
                          )}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger py-0 px-2 rounded-pill text-nowrap"
                        style={{ fontSize: "11px" }}
                        onClick={() =>
                          setAssignForm((prev) => ({ ...prev, equipmentId: "" }))
                        }
                      >
                        <i className="fas fa-times me-1"></i>Bỏ chọn
                      </button>
                    </div>

                    <div
                      className="d-flex flex-wrap gap-2 pt-1"
                      style={{ fontSize: "12px" }}
                    >
                      <span className="badge bg-white text-primary border border-primary-subtle font-monospace px-2 py-1">
                        S/N: <strong>{selectedAvailableEquipment.serialNumber}</strong>
                      </span>
                      <span className="badge bg-white text-dark border px-2 py-1">
                        <i className="fas fa-warehouse text-warning me-1"></i>
                        {selectedAvailableEquipment.warehouse?.name || "Kho mặc định"}
                      </span>
                      <span className="badge bg-white text-info-emphasis border border-info-subtle font-monospace px-2 py-1">
                        <i className="fas fa-tachometer-alt text-info me-1"></i>
                        Counter kho:{" "}
                        <strong>
                          {selectedAvailableEquipment.currentCounter.toLocaleString("vi-VN")}
                        </strong>
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-2.5 rounded-2 border mb-3 d-flex align-items-center gap-2"
                    style={{
                      backgroundColor: "#fffbeb",
                      borderColor: "#fde68a",
                      color: "#92400e",
                    }}
                  >
                    <i className="fas fa-hand-pointer text-warning fs-6"></i>
                    <div className="small">
                      <strong>Bước 1:</strong> Vui lòng click chọn 1 máy từ danh sách bên trái để tiến hành bàn giao.
                    </div>
                  </div>
                )}

                {/* Các trường nhập liệu bàn giao */}
                <div className="row g-2.5 mb-2.5">
                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Hình thức dịch vụ <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select form-select-sm border-secondary-subtle"
                      value={assignForm.relationType}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, relationType: e.target.value })
                      }
                    >
                      <option value="Cho thuê">Cho thuê (Máy công ty)</option>
                      <option value="Bảo trì định kỳ">Bảo trì định kỳ (Máy khách)</option>
                      <option value="Sửa chữa dịch vụ">Sửa chữa dịch vụ (Máy khách)</option>
                      <option value="Bảo hành máy bán">Bảo hành máy bán</option>
                      <option value="Cho mượn / Dùng thử">Cho mượn / Dùng thử</option>
                    </select>
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Hợp đồng áp dụng
                    </label>
                    <select
                      className="form-select form-select-sm border-secondary-subtle"
                      value={assignForm.contractId}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, contractId: e.target.value })
                      }
                    >
                      <option value="">-- Dịch vụ lẻ / Không gắn HĐ --</option>
                      {detailCustomer?.contracts?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} {c.baseQuota ? `(${c.baseQuota} bản)` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Hạn bảo hành / bảo trì
                    </label>
                    <input
                      type="date"
                      className="form-control form-control-sm border-secondary-subtle"
                      value={assignForm.warrantyUntil}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, warrantyUntil: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="row g-2.5 mb-2.5">
                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Vị trí lắp đặt (Sơ đồ tổ chức - Mọi cấp)
                    </label>
                    <select
                      className="form-select form-select-sm border-secondary-subtle"
                      value={assignForm.locationTarget}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, locationTarget: e.target.value })
                      }
                    >
                      <option value="">-- Chọn vị trí lắp đặt (Bất kỳ cấp nào) --</option>
                      {allLocationOptions.map((opt) => (
                        <option key={opt.targetKey} value={opt.targetKey}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Vị trí chi tiết tại khách
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm border-secondary-subtle"
                      placeholder="VD: Phòng Kế toán Lầu 2, Cạnh cửa..."
                      value={assignForm.locationNote}
                      onChange={(e) =>
                        setAssignForm({ ...assignForm, locationNote: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* Hàng kết hợp: Counter bàn giao & Ghi chú hiện trạng */}
                <div className="row g-2.5 mb-3">
                  <div className="col-12 col-md-4">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Counter bàn giao <span className="text-danger">*</span>
                    </label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-info-subtle text-info-emphasis border-secondary-subtle font-monospace">
                        <i className="fas fa-tachometer-alt"></i>
                      </span>
                      <input
                        type="number"
                        className="form-control form-control-sm font-monospace fw-bold text-primary"
                        min={0}
                        value={assignForm.initialCounter}
                        onChange={(e) =>
                          setAssignForm({
                            ...assignForm,
                            initialCounter: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="text-muted mt-1 text-truncate" style={{ fontSize: "11px" }}>
                      Theo Counter trong kho
                    </div>
                  </div>

                  <div className="col-12 col-md-8">
                    <label className="form-label small fw-semibold text-secondary mb-1">
                      Ghi chú bàn giao &amp; hiện trạng máy
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm border-secondary-subtle"
                      placeholder="Ghi chú ngoại quan, phụ kiện kèm theo (dây nguồn, khay giấy...)..."
                      value={assignForm.note}
                      onChange={(e) => setAssignForm({ ...assignForm, note: e.target.value })}
                    />
                  </div>
                </div>

                {/* Footer buttons với trạng thái trực quan */}
                <div className="d-flex justify-content-between align-items-center border-top pt-3 mt-3">
                  <div className="small text-truncate me-2">
                    {selectedAvailableEquipment ? (
                      <span className="text-success fw-bold text-nowrap">
                        <i className="fas fa-circle-check me-1.5"></i>Sẵn sàng gán
                      </span>
                    ) : (
                      <span className="text-warning-emphasis fw-semibold text-nowrap">
                        <i className="fas fa-circle-exclamation me-1.5"></i>Chưa chọn máy
                      </span>
                    )}
                  </div>

                  <div className="d-flex align-items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm px-3 rounded-2 text-nowrap"
                      onClick={() => setShowAssignModal(false)}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm px-3 fw-bold rounded-2 shadow-sm text-nowrap d-inline-flex align-items-center gap-1.5"
                      disabled={assignSubmitting || !assignForm.equipmentId}
                    >
                      {assignSubmitting ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          <span>Đang gán...</span>
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check"></i>
                          <span>Xác nhận gán</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>
        )}
      </ModalShell>

      {/* 6. MODAL THU HỒI MÁY VỀ KHO */}
      <ModalShell
        isOpen={showUnassignModal}
        onClose={() => setShowUnassignModal(false)}
        title="Thu hồi máy dịch vụ về kho"
        size="md"
      >
        {unassignEquipment && (
          <form onSubmit={handleUnassignSubmit}>
            <div className="alert alert-info small py-2 mb-3">
              Bạn đang thực hiện thu hồi máy <strong>{unassignEquipment.model}</strong> (S/N:{" "}
              {unassignEquipment.serialNumber}) từ khách hàng <strong>{detailCustomer?.name}</strong>.
            </div>

            <div className="mb-3">
              <label className="form-label small fw-bold">Chỉ số Counter chốt khi thu hồi</label>
              <input
                type="number"
                className="form-control form-control-sm"
                min={unassignEquipment.currentCounter || 0}
                value={unassignForm.finalCounter}
                onChange={(e) =>
                  setUnassignForm({ ...unassignForm, finalCounter: Number(e.target.value) })
                }
              />
              <div className="form-text small">
                Counter ghi nhận gần nhất: {unassignEquipment.currentCounter.toLocaleString("vi-VN")}
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-bold">Trạng thái sau thu hồi</label>
              <select
                className="form-select form-select-sm"
                value={unassignForm.targetStatus}
                onChange={(e) => setUnassignForm({ ...unassignForm, targetStatus: e.target.value })}
              >
                <option value="IN_STOCK">Trong kho sẵn sàng (IN_STOCK)</option>
                <option value="RECALLED">Đã thu hồi chờ kiểm tra (RECALLED)</option>
                <option value="FAULTY">Máy hỏng cần sửa chữa (FAULTY)</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-bold">Lý do thu hồi / Ghi chú</label>
              <textarea
                className="form-control form-control-sm"
                rows={2}
                placeholder="VD: Hết hạn hợp đồng, đổi dòng máy, khách trả máy…"
                value={unassignForm.note}
                onChange={(e) => setUnassignForm({ ...unassignForm, note: e.target.value })}
              ></textarea>
            </div>

            <div className="d-flex justify-content-end gap-2 border-top pt-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setShowUnassignModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn btn-danger btn-sm px-3 fw-bold"
                disabled={unassignSubmitting}
              >
                <i className="fas fa-undo me-1"></i> Xác nhận thu hồi
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* 7. MODAL TẠO PHIẾU KỸ THUẬT */}
      <ModalShell
        isOpen={showTicketModal}
        onClose={() => setShowTicketModal(false)}
        title="Tạo phiếu kỹ thuật &amp; Sửa chữa"
        size="md"
      >
        {ticketEquipment && (
          <form onSubmit={handleCreateTicketSubmit}>
            <div className="mb-3">
              <span className="small text-muted">Thiết bị:</span>
              <div className="fw-bold">
                {ticketEquipment.model} ({ticketEquipment.serialNumber})
              </div>
            </div>

            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label small fw-bold">Loại công việc</label>
                <select
                  className="form-select form-select-sm"
                  value={ticketForm.type}
                  onChange={(e) => setTicketForm({ ...ticketForm, type: e.target.value })}
                >
                  <option value="REPAIR">Sửa chữa sự cố</option>
                  <option value="MAINTENANCE">Bảo trì định kỳ</option>
                  <option value="INSPECTION">Kiểm tra máy</option>
                  <option value="OTHER">Nạp mực / Khác</option>
                </select>
              </div>

              <div className="col-6">
                <label className="form-label small fw-bold">Mức độ ưu tiên</label>
                <select
                  className="form-select form-select-sm"
                  value={ticketForm.priority}
                  onChange={(e) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                >
                  <option value="NORMAL">Bình thường</option>
                  <option value="HIGH">Ưu tiên cao</option>
                  <option value="URGENT">Khẩn cấp</option>
                  <option value="LOW">Thấp</option>
                </select>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-bold">Mô tả hiện tượng sự cố</label>
              <textarea
                className="form-control form-control-sm"
                rows={3}
                required
                placeholder="VD: Kẹt giấy khay 1, bản in bị sọc đen, máy không lên nguồn…"
                value={ticketForm.description}
                onChange={(e) => setTicketForm({ ...ticketForm, description: e.target.value })}
              ></textarea>
            </div>

            <div className="d-flex justify-content-end gap-2 border-top pt-3">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setShowTicketModal(false)}
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm px-3 fw-bold"
                disabled={ticketSubmitting}
              >
                <i className="fas fa-paper-plane me-1"></i> Tạo phiếu kỹ thuật
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* 8. MODAL THÊM / SỬA KHÁCH HÀNG */}
      <ModalShell
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? `Sửa thông tin: ${editing.name}` : "Thêm khách hàng mới"}
        size="lg"
      >
        <form onSubmit={handleSave}>
          <div className="row g-2 mb-3">
            <div className="col-12 col-md-8">
              <label className="form-label small fw-bold">
                Tên khách hàng / Doanh nghiệp <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                required
                placeholder="VD: Công Ty Cổ Phần Tập Đoàn ABC"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small fw-bold">Mã khách hàng</label>
              <input
                type="text"
                className="form-control form-control-sm font-monospace"
                placeholder="Tự sinh nếu bỏ trống (VD: KH20261234)"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>
          </div>

          <div className="row g-2 mb-3">
            <div className="col-12 col-md-6">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small fw-bold mb-0">Phân nhóm khách hàng</label>
                <button
                  type="button"
                  className="btn btn-link btn-sm p-0 text-decoration-none"
                  style={{ fontSize: "12px" }}
                  onClick={() => setShowGroupModal(true)}
                >
                  <i className="fas fa-cog me-1"></i> Quản lý loại KH
                </button>
              </div>
              <select
                className="form-select form-select-sm"
                value={formData.group}
                onChange={(e) => setFormData({ ...formData, group: e.target.value })}
              >
                {groupOptions.map((grp) => (
                  <option key={grp} value={grp}>
                    {grp}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label small fw-bold">Trạng thái dịch vụ</label>
              <select
                className="form-select form-select-sm"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                <option value="ACTIVE">Đang dùng / Hoạt động (ACTIVE)</option>
                <option value="SUSPENDED">Tạm ngưng (SUSPENDED)</option>
                <option value="INACTIVE">Ngừng dịch vụ (INACTIVE)</option>
              </select>
            </div>
          </div>

          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center mb-1 flex-wrap gap-1">
              <label className="form-label small fw-bold mb-0">
                Địa chỉ chính <span className="text-danger">*</span>
              </label>
              <div className="d-flex align-items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  className="btn btn-xs btn-primary py-0.5 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                  style={{ fontSize: "11px" }}
                  onClick={() => {
                    setLocationPickerTarget("form");
                    setShowLocationPickerModal(true);
                  }}
                  title="Mở bản đồ vệ tinh ESRI độ nét cao để kéo thả ghim chính xác từng nóc nhà"
                >
                  <i className="fas fa-satellite"></i>
                  <span>Ghim bản đồ vệ tinh</span>
                </button>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-primary py-0.5 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                  style={{ fontSize: "11px" }}
                  onClick={handleGetLocationGPS}
                  title="Lấy tọa độ GPS từ cảm biến vị trí thiết bị hiện tại của bạn"
                >
                  <i className="fas fa-location-arrow text-danger"></i>
                  <span>Lấy GPS thiết bị</span>
                </button>
                {Boolean(formData.address || (formData.latitude && formData.longitude)) && (
                  <a
                    href={getDirectionsUrl({
                      latitude: formData.latitude ? Number(formData.latitude) : null,
                      longitude: formData.longitude ? Number(formData.longitude) : null,
                      address: formData.address,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-xs btn-outline-secondary py-0.5 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                    style={{ fontSize: "11px" }}
                    title="Mở Google Maps để kiểm tra vị trí và đường đi"
                  >
                    <i className="fas fa-map-marked-alt text-primary"></i>
                    <span>Xem Google Maps</span>
                  </a>
                )}
              </div>
            </div>
            <input
              type="text"
              className="form-control form-control-sm"
              required
              placeholder="VD: Số 123 Đường 3/2, Phường An Hòa, TP. Rạch Giá, Kiên Giang"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />

            {/* Tọa độ GPS chuẩn xác phục vụ Google Maps navigation */}
            <div className="bg-light p-2.5 rounded-3 border mt-2">
              <div className="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-1">
                <span className="small fw-semibold text-secondary d-flex align-items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                  <i className="fas fa-crosshairs text-danger"></i>
                  <span className="fw-bold text-dark">Tọa độ GPS dẫn đường Google Maps:</span>
                </span>
                {formData.latitude && formData.longitude ? (
                  <div className="d-flex align-items-center gap-1.5">
                    <span className="badge bg-success-subtle text-success border border-success-subtle d-inline-flex align-items-center gap-1" style={{ fontSize: "10.5px" }}>
                      <i className="fas fa-check-circle"></i> Đã có tọa độ chuẩn
                    </span>
                    <button
                      type="button"
                      className="btn btn-link btn-xs text-danger p-0 text-decoration-none"
                      style={{ fontSize: "11px" }}
                      onClick={() => setFormData((prev) => ({ ...prev, latitude: "", longitude: "" }))}
                      title="Xóa tọa độ GPS này"
                    >
                      Xóa
                    </button>
                  </div>
                ) : (
                  <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" style={{ fontSize: "10px" }}>
                    Chưa có GPS (Sẽ chỉ đường theo tên địa chỉ)
                  </span>
                )}
              </div>

              {/* Dán nhanh tọa độ hoặc link chia sẻ Google Maps */}
              <div className="input-group input-group-sm mb-2 shadow-2xs">
                <span className="input-group-text bg-white text-muted" style={{ fontSize: "11px" }}>
                  <i className="fas fa-paste text-primary me-1"></i> Dán nhanh
                </span>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="Dán link Google Maps hoặc tọa độ (VD: 10.024567, 105.083124 hoặc link chia sẻ từ Maps)..."
                  value={quickGpsPaste}
                  onChange={(e) => setQuickGpsPaste(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplyQuickGpsPaste();
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn btn-outline-primary btn-sm px-2.5 fw-semibold"
                  style={{ fontSize: "11px" }}
                  onClick={handleApplyQuickGpsPaste}
                >
                  Nhận diện GPS
                </button>
              </div>

              <div className="row g-2">
                <div className="col-6">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white text-muted" style={{ fontSize: "11px" }}>
                      Vĩ độ (Lat)
                    </span>
                    <input
                      type="number"
                      step="any"
                      className="form-control form-control-sm font-monospace"
                      placeholder="VD: 10.024567"
                      value={formData.latitude}
                      onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                    />
                  </div>
                </div>
                <div className="col-6">
                  <div className="input-group input-group-sm">
                    <span className="input-group-text bg-white text-muted" style={{ fontSize: "11px" }}>
                      Kinh độ (Lng)
                    </span>
                    <input
                      type="number"
                      step="any"
                      className="form-control form-control-sm font-monospace"
                      placeholder="VD: 105.083124"
                      value={formData.longitude}
                      onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="text-muted mt-2" style={{ fontSize: "11px", lineHeight: "1.4" }}>
                <i className="fas fa-info-circle text-primary me-1"></i>
                <strong>Mẹo chỉ đường chuẩn từng mét:</strong> Bạn hãy bấm nút <span className="text-primary fw-semibold">Ghim bản đồ vệ tinh</span> để nhìn thấy nóc nhà và kéo thả ghim, hoặc mở Google Maps &gt; Chia sẻ vị trí &gt; dán link vào ô <em>Dán nhanh</em>.
              </div>
            </div>
          </div>

          <div className="row g-2 mb-3">
            <div className="col-12 col-md-4">
              <label className="form-label small fw-bold">
                Số điện thoại liên hệ
              </label>
              <input
                type="tel"
                className="form-control form-control-sm"
                placeholder="0912345678"
                value={formData.phone}
                disabled={Boolean(formData.phone && formData.phone.includes("*"))}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
              {formData.phone && formData.phone.includes("*") && (
                <span className="text-muted d-block mt-0.5" style={{ fontSize: "11px" }}>
                  <i className="fas fa-lock me-1"></i>SĐT bị ẩn theo phân quyền
                </span>
              )}
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small fw-bold">Mã số thuế</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="MST…"
                value={formData.taxCode}
                onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
              />
            </div>

            <div className="col-12 col-md-4">
              <label className="form-label small fw-bold">Email</label>
              <input
                type="email"
                className="form-control form-control-sm"
                placeholder="contact@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>

          <div className="row g-2 mb-3">
            <div className="col-12 col-md-6">
              <label className="form-label small fw-bold">Người quản lý</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Họ tên người quản lý…"
                value={formData.managerName}
                onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
              />
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label small fw-bold">SĐT quản lý</label>
              <input
                type="tel"
                className="form-control form-control-sm"
                placeholder="SĐT người quản lý…"
                value={formData.managerPhone}
                disabled={Boolean(formData.managerPhone && formData.managerPhone.includes("*"))}
                onChange={(e) => setFormData({ ...formData, managerPhone: e.target.value })}
              />
              {formData.managerPhone && formData.managerPhone.includes("*") && (
                <span className="text-muted d-block mt-0.5" style={{ fontSize: "11px" }}>
                  <i className="fas fa-lock me-1"></i>SĐT bị ẩn theo phân quyền
                </span>
              )}
            </div>
          </div>

          <div className="row g-2 mb-3">
            <div className="col-12 col-md-6">
              <label className="form-label small fw-bold">Người liên hệ trực tiếp</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Họ tên người liên hệ…"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              />
            </div>

            <div className="col-12 col-md-6">
              <label className="form-label small fw-bold">SĐT người liên hệ</label>
              <input
                type="tel"
                className="form-control form-control-sm"
                placeholder="SĐT người liên hệ…"
                value={formData.contactPhone}
                disabled={Boolean(formData.contactPhone && formData.contactPhone.includes("*"))}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
              />
              {formData.contactPhone && formData.contactPhone.includes("*") && (
                <span className="text-muted d-block mt-0.5" style={{ fontSize: "11px" }}>
                  <i className="fas fa-lock me-1"></i>SĐT bị ẩn theo phân quyền
                </span>
              )}
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label small fw-bold">Ghi chú quản lý</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              placeholder="Yêu cầu giờ vào tòa nhà, thói quen in ấn, người duyệt…"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            ></textarea>
          </div>

          <div className="d-flex justify-content-end gap-2 border-top pt-3">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => setShowModal(false)}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-sm px-4 fw-bold"
              disabled={saving}
            >
              {saving ? <Loading size="sm" /> : <><i className="fas fa-save me-1"></i> Lưu thông tin</>}
            </button>
          </div>
        </form>
      </ModalShell>

      {/* 9. MODAL QUẢN LÝ CẤU TRÚC VỊ TRÍ TỔ CHỨC (CÂY SƠ ĐỒ 3 CẤP TÙY CHỈNH) */}
      <CustomerLocationTreeModal
        isOpen={showLocModal}
        onClose={() => setShowLocModal(false)}
        customer={locCustomer}
        onChanged={() => {
          loadData();
          if (detailCustomer && locCustomer && detailCustomer.id === locCustomer.id) {
            refreshDetailCustomer(locCustomer.id);
          }
        }}
      />

      {/* Modal Nhập khách hàng từ Excel */}
      <CustomerImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadData}
        availableGroups={groupOptions}
      />

      {/* Modal Quản lý Loại / Phân nhóm khách hàng */}
      <CustomerGroupModal
        isOpen={showGroupModal}
        onClose={() => setShowGroupModal(false)}
        onChanged={() => {
          loadCustomerGroups();
          loadData();
        }}
      />

      {/* Modal Cảnh báo ràng buộc dữ liệu & Xác nhận xóa khách hàng */}
      <CustomerDeleteModal
        isOpen={showDeleteModal}
        customer={customerToDelete}
        onClose={() => {
          setShowDeleteModal(false);
          setCustomerToDelete(null);
        }}
        onSuccess={() => {
          loadData();
        }}
      />

      {/* Modal Thêm nhanh thiết bị trực tiếp từ trang Khách hàng */}
      <QuickEquipmentModal
        isOpen={showQuickCreateModal}
        onClose={() => {
          setShowQuickCreateModal(false);
          setQuickCreateCustomer(null);
        }}
        customer={quickCreateCustomer || detailCustomer}
        onSuccess={handleQuickEquipmentSuccess}
      />

      {/* Modal Đổi vị trí lắp đặt thiết bị */}
      <ChangeEquipmentLocationModal
        isOpen={showChangeLocModal}
        onClose={() => {
          setShowChangeLocModal(false);
          setChangeLocEquipment(null);
          setChangeLocCustomer(null);
        }}
        equipment={changeLocEquipment}
        customer={changeLocCustomer || detailCustomer}
        onSuccess={() => {
          loadData();
          if (changeLocCustomer?.id) {
            refreshDetailCustomer(changeLocCustomer.id);
          } else if (detailCustomer?.id) {
            refreshDetailCustomer(detailCustomer.id);
          }
        }}
        onOpenOrgChart={() => {
          const target = changeLocCustomer || detailCustomer;
          if (target) {
            openLocationModal(target);
          }
        }}
      />

      {/* Modal Chọn / Ghim vị trí trên bản đồ vệ tinh Leaflet/ESRI */}
      <LocationPickerModal
        isOpen={showLocationPickerModal}
        onClose={() => setShowLocationPickerModal(false)}
        initialLat={
          locationPickerTarget === "detail"
            ? (detailCustomer?.latitude ?? null)
            : (formData.latitude ? Number(formData.latitude) : null)
        }
        initialLng={
          locationPickerTarget === "detail"
            ? (detailCustomer?.longitude ?? null)
            : (formData.longitude ? Number(formData.longitude) : null)
        }
        initialAddress={
          locationPickerTarget === "detail"
            ? (detailCustomer?.address || "")
            : formData.address
        }
        onConfirm={async ({ latitude, longitude, address }) => {
          if (locationPickerTarget === "detail" && detailCustomer) {
            try {
              const res = await fetch(`/api/customers/${detailCustomer.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  latitude,
                  longitude,
                  ...(address && (!detailCustomer.address || detailCustomer.address.length < 5) ? { address } : {}),
                }),
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || "Không thể cập nhật tọa độ");
              }
              const updated = await res.json();
              setDetailCustomer((prev) =>
                prev
                  ? {
                      ...prev,
                      latitude: updated.latitude ?? latitude,
                      longitude: updated.longitude ?? longitude,
                      address: updated.address ?? (address || prev.address),
                    }
                  : null
              );
              setCustomers((prev) =>
                prev.map((c) =>
                  c.id === detailCustomer.id
                    ? {
                        ...c,
                        latitude: updated.latitude ?? latitude,
                        longitude: updated.longitude ?? longitude,
                        address: updated.address ?? (address || c.address),
                      }
                    : c
                )
              );
              toast.success(`Đã cập nhật tọa độ GPS vệ tinh cho ${detailCustomer.name}`);
            } catch (err: unknown) {
              toast.error(err instanceof Error ? err.message : "Lỗi lưu tọa độ");
            }
          } else {
            setFormData((prev) => ({
              ...prev,
              latitude: String(latitude),
              longitude: String(longitude),
              address: (!prev.address || prev.address.trim().length < 5) && address ? address : prev.address,
            }));
            toast.success(`Đã chọn tọa độ chuẩn: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
          }
        }}
      />
    </div>
  );
}
