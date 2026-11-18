"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import { CreateEquipmentModal, type CreatedEquipmentResult } from "@/components/CreateEquipmentModal";
import { formatLocationPath } from "@/lib/location";
import {
  STATUS_LABELS,
  TICKET_TYPE_LABELS,
  TICKET_PRIORITY_LABELS,
  TICKET_SOURCE_LABELS,
} from "@/lib/labels";

export interface BranchHierarchyItem {
  id: string;
  name: string;
  buildings?: Array<{
    id: string;
    name: string;
    departments?: Array<{ id: string; name: string }>;
  }>;
}

export interface CustomerItem {
  id: string;
  code?: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  group?: string | null;
  contactName?: string | null;
  equipmentCount?: number;
  equipment?: Array<unknown>;
  branches?: Array<BranchHierarchyItem>;
}

export interface EquipmentItem {
  id: string;
  code?: string | null;
  serialNumber?: string | null;
  model: string;
  brand?: string | null;
  type?: string | null;
  group?: string | null;
  status: string;
  currentCounter: number;
  locationNote?: string | null;
  branchId?: string | null;
  buildingId?: string | null;
  departmentId?: string | null;
  branch?: { id?: string; name: string; address?: string | null } | null;
  building?: { id?: string; name: string; branch?: { name: string } | null } | null;
  department?: {
    id?: string;
    name: string;
    building?: { name: string; branch?: { name: string } | null } | null;
  } | null;
  taskWorkType?: string;
  taskNote?: string;
  taskCounter?: number | null;
}

export interface EquipmentTaskFormItem {
  workType: string;
  note: string;
  counter: string;
}

export interface TechItem {
  id: string;
  name: string;
  phone?: string | null;
  region: string | null;
  skills: string[];
  openTicketsCount: number;
}

interface CreateTicketModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (ticket?: unknown) => void;
  initialCustomerId?: string;
  initialEquipmentId?: string;
  editingTicket?: {
    id: string;
    code: string;
    customerId: string;
    equipmentId?: string | null;
    equipmentIds?: string[];
    equipmentTasks?: Record<
      string,
      { equipmentId: string; workType: string; note?: string; counter?: number | null }
    >;
    equipmentList?: EquipmentItem[];
    assigneeId?: string | null;
    type: string;
    priority: string;
    source?: string;
    description: string;
    createdAt: string;
    status?: string;
    customer?: CustomerItem;
  } | null;
}

// Hàm chuẩn hóa tiếng Việt tìm kiếm không dấu
function normalizeText(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

// Các gợi ý mô tả sự cố nhanh phổ biến
const COMMON_ISSUE_TAGS = [
  "Kẹt giấy liên tục khay 1",
  "Bản in bị vệt đen dọc / mờ",
  "Máy báo lỗi mực (Toner Empty)",
  "Báo lỗi SC Code (SC-542 cụm sấy)",
  "Mất kết nối in / scan qua mạng",
  "Máy kêu to bất thường khi chạy",
  "Bảo trì định kỳ & vệ sinh máy",
];

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateStr(isoStr?: string) {
  if (!isoStr) return getTodayStr();
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return getTodayStr();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function CreateTicketModal({
  open,
  onClose,
  onSuccess,
  initialCustomerId,
  initialEquipmentId,
  editingTicket,
}: CreateTicketModalProps) {
  const isEditMode = Boolean(editingTicket);
  // Dữ liệu danh mục
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [technicians, setTechnicians] = useState<TechItem[]>([]);
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    role: string;
    permissions?: Record<string, boolean>;
  } | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(false);

  // Khách hàng đang chọn & tìm kiếm
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Thiết bị của khách hàng & Loại phiếu (Hỗ trợ chọn nhiều máy trên 1 phiếu máy)
  const [ticketCategory, setTicketCategory] = useState<"GENERAL" | "EQUIPMENT">("GENERAL");
  const [customerMachines, setCustomerMachines] = useState<EquipmentItem[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);
  const [equipmentTasksMap, setEquipmentTasksMap] = useState<Record<string, EquipmentTaskFormItem>>({});
  const [isAutoSyncDesc, setIsAutoSyncDesc] = useState<boolean>(true);
  const [targetEquipmentStatus, setTargetEquipmentStatus] = useState<string>("KEEP");
  const [machineSearchQuery, setMachineSearchQuery] = useState("");

  // Modal Thêm hồ sơ thiết bị mới (cùng UI với trang Thiết bị chính)
  const [showCreateEquipModal, setShowCreateEquipModal] = useState(false);
  const [prefillEquipModel, setPrefillEquipModel] = useState("");

  const selectedEquipments = useMemo(() => {
    const idSet = new Set(selectedEquipmentIds);
    return customerMachines.filter((m) => idSet.has(m.id));
  }, [customerMachines, selectedEquipmentIds]);

  const toggleEquipmentSelection = useCallback((equipId: string) => {
    setSelectedEquipmentIds((prev) =>
      prev.includes(equipId) ? prev.filter((id) => id !== equipId) : [...prev, equipId]
    );
  }, []);

  // Thông tin phiếu
  const [ticketDate, setTicketDate] = useState<string>(() => getTodayStr());
  const [type, setType] = useState<string>("REPAIR");
  const [workTypes, setWorkTypes] = useState<Array<{ code: string; label: string; isSystem?: boolean }>>(() =>
    Object.entries(TICKET_TYPE_LABELS).map(([code, label]) => ({ code, label, isSystem: true }))
  );
  const [workTypeMode, setWorkTypeMode] = useState<"add" | "edit" | null>(null);
  const [workTypeInput, setWorkTypeInput] = useState<string>("");
  const [savingWorkType, setSavingWorkType] = useState<boolean>(false);
  const [priority, setPriority] = useState<string>("NORMAL");
  const [source, setSource] = useState<string>("CUSTOMER");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Hàm dựng nội dung tổng hợp tự động từ danh sách thiết bị đã chọn & công việc riêng từng máy
  const buildSynthesizedDescription = useCallback(
    (
      equipList: EquipmentItem[],
      tasksMap: Record<string, EquipmentTaskFormItem>,
      defaultWorkType: string
    ): string => {
      if (equipList.length === 0) return "";
      const lines = equipList.map((eq) => {
        const task = tasksMap[eq.id];
        const wtCode = task?.workType || defaultWorkType || "REPAIR";
        const wtLabel =
          workTypes.find((w) => w.code === wtCode)?.label ||
          TICKET_TYPE_LABELS[wtCode] ||
          wtCode;
        const noteText = task?.note?.trim() || "";
        const counterNum =
          task?.counter && !isNaN(Number(task.counter)) && Number(task.counter) > 0
            ? Number(task.counter)
            : null;
        const locLabel =
          eq.locationNote?.trim() ||
          eq.department?.name ||
          formatLocationPath(eq, selectedCustomer ? { branches: selectedCustomer.branches } : null) ||
          "";
        const modelDisplay =
          eq.brand && !eq.model.toLowerCase().startsWith(eq.brand.toLowerCase())
            ? `${eq.brand} ${eq.model}`
            : eq.model;
        const snPart = eq.serialNumber ? ` (${eq.serialNumber})` : "";
        const counterPart = counterNum ? ` (Counter: ${counterNum.toLocaleString("vi-VN")})` : "";

        return `${locLabel ? `[${locLabel}] ` : ""}${modelDisplay}${snPart} - ${wtLabel}${
          noteText ? `: ${noteText}` : ""
        }${counterPart}`;
      });
      return lines.join(" + ");
    },
    [workTypes, selectedCustomer]
  );

  const updateEquipmentTask = useCallback(
    (equipId: string, patch: Partial<EquipmentTaskFormItem>) => {
      setEquipmentTasksMap((prev) => {
        const current = prev[equipId] || { workType: type || "REPAIR", note: "", counter: "" };
        const nextItem = { ...current, ...patch };
        const nextMap = { ...prev, [equipId]: nextItem };

        // Nếu đang bật tự động tổng hợp (hoặc nội dung chung đang trống), cập nhật tự động vào ô Nội dung phiếu
        if (isAutoSyncDesc || !description.trim()) {
          const synthesized = buildSynthesizedDescription(selectedEquipments, nextMap, type);
          if (synthesized) {
            setDescription(synthesized);
            setIsAutoSyncDesc(true);
          }
        }
        return nextMap;
      });
    },
    [type, isAutoSyncDesc, description, buildSynthesizedDescription, selectedEquipments]
  );

  const handleManualSyncDescription = useCallback(() => {
    const synthesized = buildSynthesizedDescription(selectedEquipments, equipmentTasksMap, type);
    if (synthesized) {
      setDescription(synthesized);
      setIsAutoSyncDesc(true);
      toast.info("Đã tổng hợp tự động nội dung công việc từ danh sách máy đã chọn");
    }
  }, [selectedEquipments, equipmentTasksMap, type, buildSynthesizedDescription]);

  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Quyền phân công ngay
  const canAssign =
    currentUser?.role === "SUPER_ADMIN" ||
    (currentUser?.permissions
      ? !!currentUser.permissions["ticket:assign"]
      : currentUser?.role === "DISPATCHER");

  // 1. Tải danh sách máy của khách hàng khi chọn khách hàng
  const loadCustomerEquipment = useCallback(async (customerId: string, targetEquipIds?: string | string[]) => {
    setLoadingMachines(true);
    try {
      const res = await fetch(`/api/equipment?customerId=${customerId}&pageSize=100`);
      if (res.ok) {
        const data = await res.json();
        const list: EquipmentItem[] = Array.isArray(data) ? data : data.items || [];
        setCustomerMachines(list);

        const desiredIds = Array.isArray(targetEquipIds)
          ? targetEquipIds.filter(Boolean)
          : targetEquipIds
          ? [targetEquipIds]
          : [];
        const validIds = desiredIds.filter((tid) => list.some((eq) => eq.id === tid));

        if (validIds.length > 0) {
          setTicketCategory("EQUIPMENT");
          setSelectedEquipmentIds(validIds);
        } else {
          setTicketCategory("GENERAL");
          setSelectedEquipmentIds([]);
        }
      } else {
        setCustomerMachines([]);
        setSelectedEquipmentIds([]);
        setTicketCategory("GENERAL");
      }
    } catch {
      setCustomerMachines([]);
      setSelectedEquipmentIds([]);
      setTicketCategory("GENERAL");
    } finally {
      setLoadingMachines(false);
    }
  }, []);

  // 2. Xử lý khi chọn khách hàng
  const handleSelectCustomer = useCallback((cust: CustomerItem) => {
    setSelectedCustomer(cust);
    setIsCustomerDropdownOpen(false);
    setCustomerSearchQuery("");
    setMachineSearchQuery("");
    loadCustomerEquipment(cust.id, initialEquipmentId);
  }, [initialEquipmentId, loadCustomerEquipment]);

  // 3. Tải danh sách khách hàng & KTV khi mở modal
  useEffect(() => {
    if (!open) return;
    let isMounted = true;

    Promise.resolve().then(() => {
      if (!isMounted) return;
      setLoadingInitial(true);
      if (editingTicket) {
        const defaultEditType = editingTicket.type || "REPAIR";
        setType(defaultEditType);
        setPriority(editingTicket.priority || "NORMAL");
        setSource(editingTicket.source || "CUSTOMER");
        setAssigneeId(editingTicket.assigneeId || "");
        setDescription(editingTicket.description || "");
        setIsAutoSyncDesc(false);
        setTicketDate(formatDateStr(editingTicket.createdAt));
        if (editingTicket.customer) {
          setSelectedCustomer(editingTicket.customer);
        }
        const editEquipIds =
          editingTicket.equipmentIds && editingTicket.equipmentIds.length > 0
            ? editingTicket.equipmentIds
            : editingTicket.equipmentId
            ? [editingTicket.equipmentId]
            : undefined;
        const initTasksMap: Record<string, EquipmentTaskFormItem> = {};
        if (editingTicket.equipmentTasks) {
          for (const [eqId, t] of Object.entries(editingTicket.equipmentTasks)) {
            initTasksMap[eqId] = {
              workType: t.workType || defaultEditType,
              note: t.note || "",
              counter: t.counter != null ? String(t.counter) : "",
            };
          }
        } else if (Array.isArray(editingTicket.equipmentList)) {
          for (const eq of editingTicket.equipmentList) {
            initTasksMap[eq.id] = {
              workType: eq.taskWorkType || defaultEditType,
              note: eq.taskNote || "",
              counter: eq.taskCounter != null ? String(eq.taskCounter) : "",
            };
          }
        }
        setEquipmentTasksMap(initTasksMap);
        loadCustomerEquipment(editingTicket.customerId, editEquipIds);
      } else {
        setSelectedCustomer(null);
        setCustomerMachines([]);
        setSelectedEquipmentIds([]);
        setEquipmentTasksMap({});
        setIsAutoSyncDesc(true);
        setTargetEquipmentStatus("KEEP");
        setTicketCategory("GENERAL");
        setTicketDate(getTodayStr());
        setType("REPAIR");
        setPriority("NORMAL");
        setSource("CUSTOMER");
        setAssigneeId("");
        setDescription("");
      }
      setWorkTypeMode(null);
      setWorkTypeInput("");
      setShowCreateEquipModal(false);
      setPrefillEquipModel("");
    });

    Promise.all([
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/customers?pageSize=1000").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/dispatch/technicians").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/tickets/work-types").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([me, custData, techData, wtData]) => {
        if (!isMounted) return;
        if (me) setCurrentUser(me);
        if (wtData?.items && Array.isArray(wtData.items)) {
          setWorkTypes(wtData.items);
          for (const it of wtData.items) {
            TICKET_TYPE_LABELS[it.code] = it.label;
          }
        }
        const custList: CustomerItem[] = custData
          ? Array.isArray(custData)
            ? custData
            : custData.items || []
          : [];
        setCustomers(custList);

        const techList: TechItem[] = techData
          ? Array.isArray(techData)
            ? techData
            : techData.items || []
          : [];
        setTechnicians(techList);

        if (editingTicket) {
          const found = custList.find((c) => c.id === editingTicket.customerId);
          if (found) {
            setSelectedCustomer(found);
          }
        } else if (initialCustomerId) {
          const found = custList.find((c) => c.id === initialCustomerId);
          if (found) {
            handleSelectCustomer(found);
          }
        }
      })
      .catch((err) => {
        console.error("Lỗi tải dữ liệu tạo phiếu:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingInitial(false);
      });

    return () => {
      isMounted = false;
    };
  }, [open, initialCustomerId, editingTicket, loadCustomerEquipment, handleSelectCustomer]);

  // 4. Click bên ngoài để đóng dropdown tìm kiếm khách hàng
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        customerDropdownRef.current &&
        !customerDropdownRef.current.contains(e.target as Node)
      ) {
        setIsCustomerDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 5. Đổi khách hàng khác
  const handleResetCustomer = () => {
    setSelectedCustomer(null);
    setCustomerMachines([]);
    setSelectedEquipmentIds([]);
    setTargetEquipmentStatus("KEEP");
    setTicketCategory("GENERAL");
    setCustomerSearchQuery("");
    setMachineSearchQuery("");
    setShowCreateEquipModal(false);
    setTimeout(() => {
      searchInputRef.current?.focus();
      setIsCustomerDropdownOpen(true);
    }, 50);
  };

  // 5b. Mở modal Thêm hồ sơ thiết bị mới (giống UI trang Thiết bị chính)
  const handleOpenAddEquipmentModal = (prefillText?: string) => {
    setPrefillEquipModel(prefillText ? prefillText.trim() : "");
    setShowCreateEquipModal(true);
  };

  const handleEquipmentCreated = (data: CreatedEquipmentResult) => {
    const newEq: EquipmentItem = {
      id: data.id,
      code: data.code,
      serialNumber: data.serialNumber,
      model: data.model,
      brand: data.brand,
      type: data.type,
      group: data.group,
      status: data.status || "ACTIVE",
      currentCounter: data.currentCounter ?? 0,
      locationNote: data.locationNote,
      branchId: data.branchId,
      buildingId: data.buildingId,
      departmentId: data.departmentId,
      branch: data.branch || null,
      building: data.building || null,
      department: data.department || null,
    };

    setCustomerMachines((prev) => [newEq, ...prev]);
    setTicketCategory("EQUIPMENT");
    setSelectedEquipmentIds((prev) => Array.from(new Set([...prev, newEq.id])));
    setMachineSearchQuery("");

    if (selectedCustomer) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === selectedCustomer.id
            ? { ...c, equipmentCount: (c.equipmentCount ?? customerMachines.length) + 1 }
            : c
        )
      );
    }
  };

  // 6. Lọc khách hàng theo từ khóa tìm kiếm (Tên, Mã KH, SĐT, Địa chỉ)
  const filteredCustomers = useMemo(() => {
    const q = normalizeText(customerSearchQuery);
    if (!q) return customers.slice(0, 30); // Hiển thị 30 KH đầu tiên khi chưa gõ

    return customers
      .filter((c) => {
        const nameNorm = normalizeText(c.name);
        const codeNorm = normalizeText(c.code || "");
        const phoneNorm = normalizeText(c.phone || "");
        const addrNorm = normalizeText(c.address || "");
        const groupNorm = normalizeText(c.group || "");
        return (
          nameNorm.includes(q) ||
          codeNorm.includes(q) ||
          phoneNorm.includes(q) ||
          addrNorm.includes(q) ||
          groupNorm.includes(q)
        );
      })
      .slice(0, 50); // Tối đa 50 kết quả để giao diện mượt
  }, [customers, customerSearchQuery]);

  // 7. Lọc danh sách máy của khách hàng (khi khách có nhiều máy)
  const filteredMachines = useMemo(() => {
    const q = normalizeText(machineSearchQuery);
    if (!q) return customerMachines;

    return customerMachines.filter((eq) => {
      const modelNorm = normalizeText(eq.model);
      const snNorm = normalizeText(eq.serialNumber || "");
      const codeNorm = normalizeText(eq.code || "");
      const brandNorm = normalizeText(eq.brand || "");
      const noteNorm = normalizeText(eq.locationNote || "");
      const locPath = normalizeText(
        formatLocationPath(eq, selectedCustomer ? { branches: selectedCustomer.branches } : null)
      );

      return (
        modelNorm.includes(q) ||
        snNorm.includes(q) ||
        codeNorm.includes(q) ||
        brandNorm.includes(q) ||
        noteNorm.includes(q) ||
        locPath.includes(q)
      );
    });
  }, [customerMachines, machineSearchQuery, selectedCustomer]);

  // 8. Chèn nhanh gợi ý mô tả sự cố
  const handleAppendIssueTag = (tagText: string) => {
    setDescription((prev) => {
      if (!prev.trim()) return tagText;
      if (prev.includes(tagText)) return prev;
      return `${prev.trim()}, ${tagText}`;
    });
  };

  // 8b. Thêm / Sửa Loại công việc (Không cho phép xóa)
  const handleStartAddWorkType = () => {
    setWorkTypeMode("add");
    setWorkTypeInput("");
  };

  const handleStartEditWorkType = () => {
    const current = workTypes.find((w) => w.code === type);
    setWorkTypeMode("edit");
    setWorkTypeInput(current ? current.label : TICKET_TYPE_LABELS[type] || type);
  };

  const handleSaveWorkType = async () => {
    const trimmed = workTypeInput.trim();
    if (trimmed.length < 2) {
      toast.warning("Tên loại công việc phải từ 2 ký tự trở lên");
      return;
    }

    setSavingWorkType(true);
    try {
      const isAdd = workTypeMode === "add";
      const res = await fetch("/api/tickets/work-types", {
        method: isAdd ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAdd ? { label: trimmed } : { code: type, label: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Không thể lưu loại công việc");
      }

      if (Array.isArray(data.items)) {
        setWorkTypes(data.items);
        for (const it of data.items) {
          TICKET_TYPE_LABELS[it.code] = it.label;
        }
      }
      if (data.item?.code) {
        setType(data.item.code);
      }

      toast.success(
        isAdd
          ? `Đã thêm loại công việc "${trimmed}"`
          : `Đã cập nhật tên loại công việc thành "${trimmed}"`
      );
      setWorkTypeMode(null);
      setWorkTypeInput("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu loại công việc");
    } finally {
      setSavingWorkType(false);
    }
  };

  // 9. Submit tạo phiếu
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      toast.warning("Vui lòng chọn khách hàng yêu cầu dịch vụ");
      setIsCustomerDropdownOpen(true);
      return;
    }

    if (ticketCategory === "EQUIPMENT" && customerMachines.length > 0 && selectedEquipmentIds.length === 0) {
      toast.warning("Vui lòng tích chọn ít nhất 1 máy cho phiếu máy");
      return;
    }

    const finalDescription =
      description.trim() ||
      (ticketCategory === "EQUIPMENT"
        ? buildSynthesizedDescription(selectedEquipments, equipmentTasksMap, type)
        : "");

    if (!finalDescription.trim()) {
      toast.warning("Vui lòng nhập mô tả hiện tượng sự cố hoặc yêu cầu kỹ thuật");
      return;
    }

    setSubmitting(true);
    try {
      const targetEquipmentIds = ticketCategory === "EQUIPMENT" ? selectedEquipmentIds : [];
      const targetEquipmentId = targetEquipmentIds[0] || null;
      const equipmentTasksPayload = targetEquipmentIds.map((eqId) => {
        const task = equipmentTasksMap[eqId];
        const parsedCounter =
          task?.counter && task.counter.trim() !== "" && !isNaN(Number(task.counter)) && Number(task.counter) >= 0
            ? Math.round(Number(task.counter))
            : null;
        return {
          equipmentId: eqId,
          workType: task?.workType || type || "REPAIR",
          note: task?.note?.trim() || "",
          counter: parsedCounter,
        };
      });
      const effectivePrimaryType = equipmentTasksPayload[0]?.workType || type || "REPAIR";

      const res = await fetch(
        isEditMode && editingTicket ? `/api/tickets/${editingTicket.id}` : "/api/tickets",
        {
          method: isEditMode && editingTicket ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEditMode ? { action: "UPDATE" } : {}),
            customerId: selectedCustomer.id,
            equipmentId: targetEquipmentId,
            equipmentIds: targetEquipmentIds,
            equipmentTasks: equipmentTasksPayload,
            type: effectivePrimaryType,
            priority,
            source,
            assigneeId: assigneeId || null,
            description: finalDescription.trim(),
            createdAt: ticketDate || undefined,
            equipmentStatus: targetEquipmentStatus === "KEEP" ? null : targetEquipmentStatus,
          }),
        }
      );

      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể lưu phiếu kỹ thuật");

      toast.success(
        isEditMode && editingTicket
          ? `Đã cập nhật thành công phiếu kỹ thuật ${editingTicket.code}!`
          : `Đã tạo thành công phiếu kỹ thuật ${body.code}!`
      );

      // Reset form
      setSelectedCustomer(null);
      setCustomerMachines([]);
      setSelectedEquipmentIds([]);
      setEquipmentTasksMap({});
      setIsAutoSyncDesc(true);
      setTicketCategory("GENERAL");
      setTicketDate(getTodayStr());
      setDescription("");
      setType("REPAIR");
      setPriority("NORMAL");
      setSource("CUSTOMER");
      setAssigneeId("");

      onSuccess?.(body);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi phát hành phiếu");
    } finally {
      setSubmitting(false);
    }
  };

  // Badge trạng thái máy
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "bg-success-subtle text-success border border-success-subtle";
      case "FAULTY":
        return "bg-danger text-white border border-danger";
      case "WAITING_PARTS":
        return "bg-warning-subtle text-dark border border-warning-subtle";
      case "RECALLED":
        return "bg-secondary text-white";
      case "IN_STOCK":
        return "bg-info-subtle text-info-emphasis border border-info-subtle";
      default:
        return "bg-light text-secondary border";
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          <div
            className="rounded-circle bg-white text-primary d-flex align-items-center justify-content-center shadow-xs"
            style={{ width: "32px", height: "32px", fontSize: "15px" }}
          >
            <i className={`fas ${isEditMode ? "fa-edit" : "fa-file-invoice"}`}></i>
          </div>
          <div>
            <div className="fw-bold fs-6">
              {isEditMode && editingTicket
                ? `Chỉnh sửa phiếu kỹ thuật ${editingTicket.code}`
                : "Tạo phiếu kỹ thuật"}
            </div>
            <div className="text-white-50" style={{ fontSize: "11px", fontWeight: "normal" }}>
              {isEditMode
                ? "Cập nhật thông tin phiếu • Đổi máy • Điều chỉnh ngày lập"
                : "Tiếp nhận sự cố • Khảo sát • Phân công"}
            </div>
          </div>
        </div>
      }
      size="xl"
      fixedHeight="min(690px, 90vh)"
      bodyClass="p-2.5"
      headerClass="bg-primary text-white py-2 px-3"
      footer={
        <div className="d-flex justify-content-between align-items-center w-100">
          <div className="small text-muted d-none d-md-block text-truncate pe-2" style={{ maxWidth: "65%" }}>
            {selectedCustomer && ticketCategory === "EQUIPMENT" && selectedEquipments.length > 0 ? (
              selectedEquipments.length === 1 ? (
                <span className="text-success fw-medium">
                  <i className="fas fa-check-circle me-1"></i>
                  {selectedEquipments[0].model}
                  {selectedEquipments[0].serialNumber ? ` (${selectedEquipments[0].serialNumber})` : ""}
                  {formatLocationPath(selectedEquipments[0], selectedCustomer ? { branches: selectedCustomer.branches } : null) && (
                    <span className="text-dark ms-1.5 fw-normal">
                      &bull; <i className="fas fa-map-marker-alt text-danger me-1"></i>
                      {formatLocationPath(selectedEquipments[0], selectedCustomer ? { branches: selectedCustomer.branches } : null)}
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-success fw-medium" title={selectedEquipments.map((m) => `${m.model}${m.serialNumber ? ` (${m.serialNumber})` : ""}`).join(", ")}>
                  <i className="fas fa-check-double me-1"></i>
                  Đã chọn <strong>{selectedEquipments.length} máy</strong>:{" "}
                  <span className="text-dark fw-normal">
                    {selectedEquipments
                      .map((m) => `${m.model}${m.serialNumber ? ` (${m.serialNumber})` : ""}`)
                      .join(", ")}
                  </span>
                </span>
              )
            ) : selectedCustomer && ticketCategory === "GENERAL" ? (
              <span className="text-primary fw-medium">
                <i className="fas fa-file-alt me-1"></i>
                Phiếu dịch vụ
              </span>
            ) : (
              <span>* Vui lòng chọn khách hàng</span>
            )}
          </div>
          <div className="d-flex gap-2 ms-auto">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary px-3"
              onClick={onClose}
              disabled={submitting}
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              form="create-ticket-form-advanced"
              className="btn btn-sm btn-primary px-4 fw-bold shadow-sm d-inline-flex align-items-center gap-1.5"
              disabled={submitting || !selectedCustomer}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <i className="fas fa-check"></i>
                  {isEditMode ? "Lưu thay đổi" : "Lưu phiếu"}
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <form id="create-ticket-form-advanced" onSubmit={handleSubmit}>
        <div className="row g-2">
          {/* ================= KHỐI 1: CHỌN KHÁCH HÀNG (SEARCHABLE COMBOBOX) ================= */}
          <div className="col-12">
            <label className="form-label small fw-bold text-dark d-flex justify-content-between align-items-center mb-1">
              <span>
                <i className="fas fa-building text-primary me-1.5"></i>
                Khách hàng yêu cầu dịch vụ <span className="text-danger">*</span>
              </span>
              {selectedCustomer && (
                <button
                  type="button"
                  className="btn btn-link text-primary p-0 text-decoration-none small fw-semibold"
                  style={{ fontSize: "11px" }}
                  onClick={handleResetCustomer}
                >
                  <i className="fas fa-sync-alt me-1"></i>Chọn khách hàng khác
                </button>
              )}
            </label>

            {/* Khi chưa chọn khách hàng: Dropdown Tìm kiếm nhanh */}
            {!selectedCustomer ? (
              <div className="position-relative" ref={customerDropdownRef}>
                <div className="input-group input-group-sm">
                  <span className="input-group-text bg-white border-end-0 text-muted">
                    <i className="fas fa-search text-primary"></i>
                  </span>
                  <input
                    ref={searchInputRef}
                    type="text"
                    className="form-control form-control-sm border-start-0 ps-1"
                    placeholder="Nhập tên khách hàng, mã KH (VD: KH001), số điện thoại hoặc địa chỉ để tìm nhanh..."
                    value={customerSearchQuery}
                    onChange={(e) => {
                      setCustomerSearchQuery(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    autoFocus
                  />
                  {customerSearchQuery && (
                    <button
                      type="button"
                      className="btn btn-outline-secondary border-start-0 bg-white"
                      onClick={() => setCustomerSearchQuery("")}
                    >
                      <i className="fas fa-times text-muted"></i>
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline-primary d-flex align-items-center gap-1"
                    onClick={() => setIsCustomerDropdownOpen(!isCustomerDropdownOpen)}
                  >
                    <span>{isCustomerDropdownOpen ? "Đóng danh sách" : "Xem tất cả"}</span>
                    <i className={`fas fa-chevron-${isCustomerDropdownOpen ? "up" : "down"} small`}></i>
                  </button>
                </div>

                {/* Danh sách thả xuống khách hàng */}
                {isCustomerDropdownOpen && (
                  <div
                    className="position-absolute start-0 end-0 bg-white border rounded-3 shadow-lg z-3 mt-1 overflow-auto"
                    style={{ maxHeight: "290px", zIndex: 1050 }}
                  >
                    {loadingInitial ? (
                      <div className="py-4 text-center text-muted">
                        <span className="spinner-border spinner-border-sm me-2 text-primary" role="status"></span>
                        Đang tải danh sách khách hàng...
                      </div>
                    ) : filteredCustomers.length === 0 ? (
                      <div className="py-4 text-center text-muted">
                        <i className="fas fa-user-slash fs-4 text-secondary opacity-50 mb-1"></i>
                        <div className="small fw-semibold">Không tìm thấy khách hàng phù hợp</div>
                        <div className="text-secondary" style={{ fontSize: "11px" }}>
                          Thử tìm bằng từ khóa khác hoặc số điện thoại
                        </div>
                      </div>
                    ) : (
                      <div className="list-group list-group-flush">
                        {filteredCustomers.map((cust) => (
                          <button
                            key={cust.id}
                            type="button"
                            className="list-group-item list-group-item-action p-2.5 d-flex justify-content-between align-items-center text-start border-bottom-subtle"
                            onClick={() => handleSelectCustomer(cust)}
                          >
                            <div className="min-w-0 pe-2">
                              <div className="d-flex align-items-center gap-2 mb-0.5 flex-wrap">
                                <span className="fw-bold text-dark text-truncate" style={{ fontSize: "13px" }}>
                                  {cust.name}
                                </span>
                                {cust.code && (
                                  <span className="badge bg-secondary-subtle text-secondary font-monospace" style={{ fontSize: "11px" }}>
                                    {cust.code}
                                  </span>
                                )}
                                {cust.group && (
                                  <span className="badge bg-info-subtle text-info-emphasis" style={{ fontSize: "10px" }}>
                                    {cust.group}
                                  </span>
                                )}
                              </div>
                              <div className="text-muted d-flex flex-wrap gap-x-3 gap-y-1" style={{ fontSize: "11.5px" }}>
                                {cust.phone && (
                                  <span className="text-nowrap">
                                    <i className="fas fa-phone-alt me-1 text-primary"></i>
                                    {cust.phone}
                                  </span>
                                )}
                                {cust.contactName && (
                                  <span className="text-nowrap">
                                    <i className="fas fa-user-tie me-1 text-secondary"></i>
                                    {cust.contactName}
                                  </span>
                                )}
                                {cust.address && (
                                  <span className="text-truncate d-inline-block" style={{ maxWidth: "420px" }}>
                                    <i className="fas fa-map-marker-alt me-1 text-danger"></i>
                                    {cust.address}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-end flex-shrink-0 ms-2">
                              <span
                                className="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1"
                                style={{ fontSize: "11px" }}
                              >
                                <i className="fas fa-print me-1"></i>
                                {cust.equipmentCount ?? cust.equipment?.length ?? 0} máy
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              /* Thẻ khách hàng đã chọn rất gọn gàng */
              <div className="card border-primary border-opacity-50 bg-primary-subtle bg-opacity-10 shadow-2xs">
                <div className="card-body py-1.5 px-2.5">
                  <div className="d-flex justify-content-between align-items-center gap-2">
                    <div className="min-w-0 d-flex align-items-center gap-2 flex-wrap">
                      <span className="fw-bold text-dark text-truncate" style={{ fontSize: "13.5px" }}>
                        {selectedCustomer.name}
                      </span>
                      {selectedCustomer.code && (
                        <span className="badge bg-secondary-subtle text-secondary font-monospace" style={{ fontSize: "10.5px" }}>
                          {selectedCustomer.code}
                        </span>
                      )}
                      {selectedCustomer.phone && (
                        <span className="text-secondary small" style={{ fontSize: "11.5px" }}>
                          <i className="fas fa-phone text-primary me-1"></i>
                          <strong>{selectedCustomer.phone}</strong>
                        </span>
                      )}
                      {selectedCustomer.address && (
                        <span className="text-secondary small text-truncate d-inline-block" style={{ fontSize: "11.5px", maxWidth: "400px" }}>
                          <i className="fas fa-map-pin text-danger me-1"></i>
                          {selectedCustomer.address}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm py-0.5 px-2 text-nowrap d-flex align-items-center gap-1 shadow-2xs"
                      onClick={handleResetCustomer}
                      style={{ fontSize: "11px" }}
                      title="Chọn lại khách hàng khác"
                    >
                      <i className="fas fa-times"></i>
                      <span>Đổi</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ================= KHỐI 2: CHỌN LOẠI PHIẾU (PHIẾU DỊCH VỤ / PHIẾU MÁY) ================= */}
          {selectedCustomer && (
            <div className="col-12">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 p-1.5 px-2.5 rounded-2 bg-light border">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <span className="small fw-bold text-dark d-flex align-items-center gap-1">
                    <i className="fas fa-layer-group text-primary"></i>
                    Loại phiếu:
                  </span>
                  <div className="btn-group btn-group-sm" role="group">
                    <button
                      type="button"
                      className={`btn px-3 py-1 fw-semibold ${
                        ticketCategory === "GENERAL"
                          ? "btn-primary shadow-xs"
                          : "btn-outline-secondary bg-white text-dark"
                      }`}
                      onClick={() => {
                        setTicketCategory("GENERAL");
                        setSelectedEquipmentIds([]);
                      }}
                    >
                      📄 Phiếu dịch vụ
                    </button>
                    <button
                      type="button"
                      className={`btn px-3 py-1 fw-semibold ${
                        ticketCategory === "EQUIPMENT"
                          ? "btn-primary shadow-xs"
                          : "btn-outline-secondary bg-white text-dark"
                      }`}
                      onClick={() => {
                        setTicketCategory("EQUIPMENT");
                        if (selectedEquipmentIds.length === 0 && customerMachines.length > 0) {
                          setSelectedEquipmentIds([customerMachines[0].id]);
                        }
                      }}
                    >
                      🖨️ Phiếu máy {customerMachines.length > 0 ? `(${customerMachines.length})` : ""}
                    </button>
                  </div>

                  {ticketCategory === "EQUIPMENT" && customerMachines.length > 0 && (
                    <span
                      className={`badge rounded-pill px-2.5 py-1 ${
                        selectedEquipmentIds.length > 0
                          ? "bg-success-subtle text-success border border-success-subtle"
                          : "bg-warning-subtle text-dark border border-warning-subtle"
                      }`}
                      style={{ fontSize: "11px" }}
                    >
                      <i className="fas fa-check-square me-1"></i>
                      Đã chọn {selectedEquipmentIds.length}/{customerMachines.length} máy
                    </span>
                  )}
                </div>

                {/* Cụm bên phải: Tìm kiếm nhanh máy + Nút Thêm thiết bị mới */}
                <div className="d-flex align-items-center gap-2 ms-auto">
                  {ticketCategory === "EQUIPMENT" && customerMachines.length > 3 && (
                    <div style={{ width: "195px" }}>
                      <input
                        type="text"
                        className="form-control form-control-sm py-0.5 px-2"
                        style={{ fontSize: "11px" }}
                        placeholder="🔍 Lọc Model, SN..."
                        value={machineSearchQuery}
                        onChange={(e) => setMachineSearchQuery(e.target.value)}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary bg-white py-0.5 px-2.5 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                    style={{ fontSize: "11.5px" }}
                    onClick={() => handleOpenAddEquipmentModal()}
                    title="Thêm hồ sơ thiết bị mới cho khách hàng này"
                  >
                    <i className="fas fa-plus-circle"></i>
                    <span>+ Thêm thiết bị mới</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= NẾU LÀ PHIẾU MÁY: HIỂN THỊ DANH SÁCH MÁY (CHO PHÉP CHỌN NHIỀU MÁY) ================= */}
          {selectedCustomer && ticketCategory === "EQUIPMENT" && (
            <div className="col-12">
              {loadingMachines ? (
                <div className="text-center py-2 bg-light rounded-2 border">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status"></span>
                  <span className="small text-muted">Đang tải thiết bị...</span>
                </div>
              ) : customerMachines.length === 0 ? (
                <div className="text-muted small py-2.5 px-3 bg-light rounded-2 border d-flex align-items-center justify-content-between flex-wrap gap-2">
                  <span>
                    <i className="fas fa-info-circle text-secondary me-1.5"></i>
                    Khách hàng này chưa có máy nào trong hệ thống.
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary py-0.5 px-2.5 fw-semibold"
                    style={{ fontSize: "11.5px" }}
                    onClick={() => handleOpenAddEquipmentModal()}
                  >
                    <i className="fas fa-plus me-1"></i>Thêm thiết bị đầu tiên
                  </button>
                </div>
              ) : (
                <div className="border rounded-2 bg-white shadow-2xs overflow-hidden">
                  <div className="table-responsive" style={{ maxHeight: "200px" }}>
                    <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "11.5px" }}>
                      <thead className="table-light border-bottom text-secondary" style={{ fontSize: "11px", position: "sticky", top: 0, zIndex: 1 }}>
                        <tr>
                          <th style={{ width: "42px" }} className="text-center py-1">
                            {filteredMachines.length > 0 ? (
                              <input
                                type="checkbox"
                                className="form-check-input m-0 cursor-pointer"
                                title="Chọn tất cả / Bỏ chọn tất cả máy đang hiển thị"
                                checked={
                                  filteredMachines.length > 0 &&
                                  filteredMachines.every((eq) => selectedEquipmentIds.includes(eq.id))
                                }
                                onChange={(e) => {
                                  const visibleIds = filteredMachines.map((eq) => eq.id);
                                  if (e.target.checked) {
                                    setSelectedEquipmentIds((prev) =>
                                      Array.from(new Set([...prev, ...visibleIds]))
                                    );
                                  } else {
                                    setSelectedEquipmentIds((prev) =>
                                      prev.filter((id) => !visibleIds.includes(id))
                                    );
                                  }
                                }}
                              />
                            ) : (
                              "Chọn"
                            )}
                          </th>
                          <th className="py-1">
                            Thiết bị{" "}
                            {customerMachines.length > 1 && (
                              <span className="text-muted fw-normal" style={{ fontSize: "10.5px" }}>
                                (Có thể tích chọn nhiều máy trên 1 phiếu)
                              </span>
                            )}
                          </th>
                          <th className="py-1">Số Seri (SN)</th>
                          <th className="py-1">Vị trí lắp đặt</th>
                          <th className="py-1 text-end" style={{ width: "95px" }}>Counter</th>
                          <th className="py-1 text-center" style={{ width: "95px" }}>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMachines.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-2 text-muted small">
                              <span className="me-2">Không tìm thấy máy phù hợp.</span>
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                                style={{ fontSize: "11.5px" }}
                                onClick={() => handleOpenAddEquipmentModal(machineSearchQuery)}
                              >
                                + Thêm máy mới {machineSearchQuery ? `"${machineSearchQuery}"` : ""}
                              </button>
                            </td>
                          </tr>
                        ) : (
                          filteredMachines.map((eq) => {
                            const isSelected = selectedEquipmentIds.includes(eq.id);
                            const locationPath = formatLocationPath(
                              eq,
                              selectedCustomer ? { branches: selectedCustomer.branches } : null
                            );

                            return (
                              <tr
                                key={eq.id}
                                onClick={() => toggleEquipmentSelection(eq.id)}
                                className={isSelected ? "table-primary" : ""}
                                style={{ cursor: "pointer" }}
                              >
                                <td className="text-center py-1">
                                  <input
                                    type="checkbox"
                                    className="form-check-input m-0 cursor-pointer"
                                    checked={isSelected}
                                    onChange={() => toggleEquipmentSelection(eq.id)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                </td>
                                <td className="py-1">
                                  <span className={`fw-bold ${isSelected ? "text-primary" : "text-dark"}`}>
                                    {eq.brand ? `${eq.brand} ` : ""}{eq.model}
                                  </span>
                                </td>
                                <td className="py-1">
                                  {eq.serialNumber ? (
                                    <span className="badge bg-dark text-white font-monospace" style={{ fontSize: "10.5px" }}>
                                      {eq.serialNumber}
                                    </span>
                                  ) : (
                                    <span className="text-muted fst-italic small">—</span>
                                  )}
                                </td>
                                <td className="py-1">
                                  <span className="fw-medium text-dark">
                                    {locationPath || <span className="text-muted fst-italic">Trụ sở chính</span>}
                                  </span>
                                  {eq.locationNote && (
                                    <span className="text-secondary ms-1">({eq.locationNote})</span>
                                  )}
                                </td>
                                <td className="py-1 text-end font-monospace">
                                  {eq.currentCounter?.toLocaleString("vi-VN") || 0}
                                </td>
                                <td className="py-1 text-center">
                                  <span className={`badge ${getStatusBadge(eq.status)}`} style={{ fontSize: "9.5px" }}>
                                    {STATUS_LABELS[eq.status] || eq.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* BẢNG PHÂN CÔNG VIỆC, NỘI DUNG & COUNTER RIÊNG CHO TỪNG THIẾT BỊ ĐÃ CHỌN */}
                  {selectedEquipments.length > 0 && (
                    <div className="border-top bg-primary-subtle bg-opacity-10 p-2.5">
                      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1.5">
                        <span className="small fw-bold text-primary d-flex align-items-center gap-1.5" style={{ fontSize: "12px" }}>
                          <i className="fas fa-tasks"></i>
                          Chi tiết công việc &amp; Sự kiện riêng cho từng máy đã chọn ({selectedEquipments.length} máy):
                        </span>
                        <div className="d-flex align-items-center gap-2">
                          <span
                            className="badge bg-white text-secondary border fw-normal"
                            style={{ fontSize: "10.5px" }}
                          >
                            <i className="fas fa-history text-success me-1"></i>
                            Lưu chính xác vào Lịch sử &amp; Counter riêng của từng máy
                          </span>
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-primary bg-white py-0.5 px-2 fw-semibold"
                            style={{ fontSize: "11px" }}
                            onClick={handleManualSyncDescription}
                            title="Tổng hợp nội dung các máy bên dưới vào ô Nội dung phiếu chung"
                          >
                            <i className="fas fa-magic me-1"></i>Tổng hợp vào Nội dung phiếu
                          </button>
                        </div>
                      </div>

                      {/* Thanh Thêm / Sửa Loại công việc nhanh ngay tại bảng máy */}
                      {workTypeMode && (
                        <div className="p-2 mb-2 bg-white border border-primary rounded-2 shadow-2xs d-flex align-items-center gap-2 flex-wrap">
                          <span className="small fw-bold text-primary d-flex align-items-center gap-1" style={{ fontSize: "11px" }}>
                            <i className="fas fa-tools"></i>
                            {workTypeMode === "add" ? "Thêm loại công việc mới:" : "Sửa tên loại công việc:"}
                          </span>
                          <div className="input-group input-group-sm" style={{ maxWidth: "340px" }}>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder={
                                workTypeMode === "add"
                                  ? "Nhập loại công việc mới..."
                                  : "Sửa tên loại công việc..."
                              }
                              value={workTypeInput}
                              onChange={(e) => setWorkTypeInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleSaveWorkType();
                                } else if (e.key === "Escape") {
                                  e.stopPropagation();
                                  setWorkTypeMode(null);
                                  setWorkTypeInput("");
                                }
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              className="btn btn-primary fw-bold px-2.5"
                              disabled={savingWorkType || workTypeInput.trim().length < 2}
                              onClick={handleSaveWorkType}
                              title="Lưu loại công việc"
                            >
                              {savingWorkType ? (
                                <span className="spinner-border spinner-border-sm" role="status"></span>
                              ) : (
                                <i className="fas fa-check"></i>
                              )}
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-secondary px-2"
                              disabled={savingWorkType}
                              onClick={() => {
                                setWorkTypeMode(null);
                                setWorkTypeInput("");
                              }}
                              title="Hủy"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="table-responsive rounded-2 border bg-white">
                        <table className="table table-sm align-middle mb-0" style={{ fontSize: "11.5px" }}>
                          <thead className="table-light text-secondary" style={{ fontSize: "10.5px" }}>
                            <tr>
                              <th className="py-1 ps-2" style={{ minWidth: "180px", width: "27%" }}>
                                Thiết bị &amp; Vị trí
                              </th>
                              <th className="py-1" style={{ minWidth: "165px", width: "23%" }}>
                                <div className="d-flex align-items-center justify-content-between pe-1">
                                  <span>Loại công việc</span>
                                  {!workTypeMode && (
                                    <div className="d-flex align-items-center gap-1">
                                      <button
                                        type="button"
                                        className="btn btn-link p-0 text-decoration-none text-primary fw-semibold"
                                        style={{ fontSize: "10px" }}
                                        onClick={handleStartAddWorkType}
                                        title="Thêm loại công việc mới vào danh mục"
                                      >
                                        +Thêm
                                      </button>
                                      <span className="text-muted opacity-50" style={{ fontSize: "9px" }}>|</span>
                                      <button
                                        type="button"
                                        className="btn btn-link p-0 text-decoration-none text-secondary fw-semibold"
                                        style={{ fontSize: "10px" }}
                                        onClick={handleStartEditWorkType}
                                        title="Sửa tên loại công việc đang chọn (Không cho phép xóa)"
                                      >
                                        Sửa
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </th>
                              <th className="py-1" style={{ minWidth: "210px", width: "34%" }}>
                                Nội dung / Vật tư / Yêu cầu riêng của máy
                              </th>
                              <th className="py-1 pe-2" style={{ minWidth: "120px", width: "16%" }}>
                                Counter ghi nhận
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedEquipments.map((eq, idx) => {
                              const task = equipmentTasksMap[eq.id] || {
                                workType: type || "REPAIR",
                                note: "",
                                counter: "",
                              };
                              const locPath = formatLocationPath(
                                eq,
                                selectedCustomer ? { branches: selectedCustomer.branches } : null
                              );
                              return (
                                <tr key={eq.id}>
                                  <td className="py-1.5 ps-2">
                                    <div className="d-flex align-items-center justify-content-between gap-1">
                                      <div className="min-w-0">
                                        <div className="fw-bold text-dark text-truncate">
                                          <span className="text-primary me-1">{idx + 1}.</span>
                                          {eq.brand ? `${eq.brand} ` : ""}
                                          {eq.model}
                                          {eq.serialNumber && (
                                            <span
                                              className="badge bg-dark text-white font-monospace ms-1.5"
                                              style={{ fontSize: "10px" }}
                                            >
                                              {eq.serialNumber}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-muted text-truncate" style={{ fontSize: "10.5px" }}>
                                          <i className="fas fa-map-marker-alt text-danger me-1"></i>
                                          {locPath || "Trụ sở chính"}
                                          {eq.locationNote && (
                                            <strong className="text-dark ms-1">({eq.locationNote})</strong>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-1.5">
                                    <select
                                      className="form-select form-select-sm py-0.5 px-2 fw-semibold text-primary"
                                      style={{ fontSize: "11.5px" }}
                                      value={task.workType || type}
                                      onChange={(e) => {
                                        const newWt = e.target.value;
                                        updateEquipmentTask(eq.id, { workType: newWt });
                                        if (idx === 0) {
                                          setType(newWt);
                                        }
                                      }}
                                    >
                                      {workTypes.map((wt) => (
                                        <option key={wt.code} value={wt.code}>
                                          {wt.label}
                                        </option>
                                      ))}
                                      {!workTypes.some((wt) => wt.code === (task.workType || type)) &&
                                        (task.workType || type) && (
                                          <option value={task.workType || type}>
                                            {TICKET_TYPE_LABELS[task.workType || type] || task.workType || type}
                                          </option>
                                        )}
                                    </select>
                                  </td>
                                  <td className="py-1.5">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm py-0.5 px-2"
                                      style={{ fontSize: "11.5px" }}
                                      placeholder="VD: Nạp mực máy in, thay hộp mực 26A Kogon, thay Drum..."
                                      value={task.note}
                                      onChange={(e) => updateEquipmentTask(eq.id, { note: e.target.value })}
                                    />
                                  </td>
                                  <td className="py-1.5 pe-2">
                                    <input
                                      type="number"
                                      min={0}
                                      className="form-control form-control-sm py-0.5 px-2 font-monospace text-end"
                                      style={{ fontSize: "11.5px" }}
                                      placeholder={`HT: ${(eq.currentCounter || 0).toLocaleString("vi-VN")}`}
                                      title={`Counter hiện tại: ${(eq.currentCounter || 0).toLocaleString("vi-VN")}. Nhập nếu khách báo sẵn chỉ số counter mới.`}
                                      value={task.counter}
                                      onChange={(e) => updateEquipmentTask(eq.id, { counter: e.target.value })}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Gợi ý & Cập nhật trạng thái máy khi tạo phiếu */}
                  <div className="mt-2.5 p-2.5 rounded-3 border bg-light-subtle">
                    <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-1.5">
                      <span className="small fw-bold text-dark d-flex align-items-center gap-1.5" style={{ fontSize: "12px" }}>
                        <i className="fas fa-microchip text-primary"></i>
                        Trạng thái thiết bị khi tạo phiếu:
                      </span>
                      <span className="badge bg-secondary-subtle text-secondary border fw-normal" style={{ fontSize: "10.5px" }}>
                        Không tự động áp đặt • Gợi ý theo tình trạng thực tế
                      </span>
                    </div>

                    <div className="row g-2 align-items-center">
                      <div className="col-md-5 col-12">
                        <select
                          className="form-select form-select-sm fw-medium"
                          value={targetEquipmentStatus}
                          onChange={(e) => setTargetEquipmentStatus(e.target.value)}
                          style={{ fontSize: "12px" }}
                        >
                          <option value="KEEP">
                            🟢 Giữ nguyên trạng thái hiện tại (Mặc định - Khuyến nghị)
                          </option>
                          <option value="FAULTY">
                            🔴 Chuyển sang: Lỗi / Cần bảo trì (FAULTY)
                          </option>
                          <option value="WAITING_PARTS">
                            🟠 Chuyển sang: Chờ linh kiện (WAITING_PARTS)
                          </option>
                          <option value="ACTIVE">
                            🟢 Chuyển sang: Đang hoạt động (ACTIVE)
                          </option>
                        </select>
                      </div>
                      <div className="col-md-7 col-12">
                        {targetEquipmentStatus === "KEEP" ? (
                          <div className="small text-muted d-flex align-items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                            <i className="fas fa-info-circle text-primary"></i>
                            <span>
                              Thiết bị giữ nguyên trạng thái hoạt động hiện tại (không chuyển sang báo lỗi).
                            </span>
                          </div>
                        ) : targetEquipmentStatus === "FAULTY" ? (
                          <div className="small text-danger d-flex align-items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                            <i className="fas fa-exclamation-triangle"></i>
                            <span>
                              Thiết bị sẽ chuyển sang <strong>Lỗi / Cần bảo trì</strong> (báo hỏng trên sơ đồ thiết bị).
                            </span>
                          </div>
                        ) : targetEquipmentStatus === "WAITING_PARTS" ? (
                          <div className="small text-warning-emphasis d-flex align-items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                            <i className="fas fa-clock"></i>
                            <span>Thiết bị sẽ chuyển sang <strong>Đang chờ linh kiện</strong>.</span>
                          </div>
                        ) : (
                          <div className="small text-success d-flex align-items-center gap-1.5" style={{ fontSize: "11.5px" }}>
                            <i className="fas fa-check-circle"></i>
                            <span>Thiết bị sẽ chuyển sang <strong>Đang hoạt động</strong> bình thường.</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {type === "REPAIR" && targetEquipmentStatus === "KEEP" && (
                      <div className="mt-1.5 pt-1.5 border-top border-light-subtle d-flex align-items-center justify-content-between flex-wrap gap-2 text-muted" style={{ fontSize: "11px" }}>
                        <span>
                          <i className="fas fa-lightbulb text-warning me-1"></i>
                          <em>Gợi ý: Nếu sự cố này làm máy dừng hoạt động hoàn toàn, bạn có thể chọn chuyển sang "Lỗi / Cần bảo trì".</em>
                        </span>
                        <button
                          type="button"
                          className="btn btn-link p-0 text-danger text-decoration-none fw-semibold"
                          style={{ fontSize: "11px" }}
                          onClick={() => setTargetEquipmentStatus("FAULTY")}
                        >
                          Chuyển sang "Lỗi / Cần bảo trì" &raquo;
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ================= KHỐI 3: THÔNG TIN PHIẾU KỸ THUẬT ================= */}
          {/* Cột 1: Ngày lập phiếu */}
          <div
            className={
              selectedEquipments.length > 0 && ticketCategory === "EQUIPMENT"
                ? canAssign
                  ? "col-md-3 col-sm-6 col-12"
                  : "col-md-4 col-sm-6 col-12"
                : canAssign
                ? "col-lg col-sm-6 col-12"
                : "col-md-3 col-sm-6 col-12"
            }
          >
            <label className="form-label small fw-bold mb-1">
              <i className="far fa-calendar-alt text-primary me-1"></i>Ngày lập phiếu
            </label>
            <input
              type="date"
              className="form-control form-control-sm"
              value={ticketDate}
              onChange={(e) => setTicketDate(e.target.value)}
              title="Có thể chọn lùi ngày để bổ sung phiếu cũ"
            />
          </div>

          {/* Cột 2: Loại công việc chung (Chỉ hiển thị khi là Phiếu dịch vụ hoặc chưa chọn máy - Đã chọn máy thì phân loại trực tiếp tại từng dòng máy ở bảng trên) */}
          {(ticketCategory !== "EQUIPMENT" || selectedEquipments.length === 0) && (
            <div className={canAssign ? "col-lg col-sm-6 col-12" : "col-md-3 col-sm-6 col-12"}>
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small fw-bold mb-0">
                  <i className="fas fa-tools text-primary me-1"></i>Loại công việc
                </label>
                {!workTypeMode && (
                  <div className="d-flex align-items-center gap-1.5">
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-primary fw-semibold"
                      style={{ fontSize: "11px" }}
                      onClick={handleStartAddWorkType}
                      title="Thêm loại công việc mới"
                    >
                      <i className="fas fa-plus me-0.5"></i>Thêm
                    </button>
                    <span className="text-muted opacity-50" style={{ fontSize: "10px" }}>|</span>
                    <button
                      type="button"
                      className="btn btn-link p-0 text-decoration-none text-secondary fw-semibold"
                      style={{ fontSize: "11px" }}
                      onClick={handleStartEditWorkType}
                      title="Sửa tên loại công việc đang chọn (Không cho phép xóa)"
                    >
                      <i className="fas fa-pen me-0.5" style={{ fontSize: "9.5px" }}></i>Sửa
                    </button>
                  </div>
                )}
              </div>

              {workTypeMode ? (
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder={
                      workTypeMode === "add"
                        ? "Nhập loại công việc mới..."
                        : "Sửa tên loại công việc..."
                    }
                    value={workTypeInput}
                    onChange={(e) => setWorkTypeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleSaveWorkType();
                      } else if (e.key === "Escape") {
                        e.stopPropagation();
                        setWorkTypeMode(null);
                        setWorkTypeInput("");
                      }
                    }}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn btn-primary fw-bold px-2"
                    disabled={savingWorkType || workTypeInput.trim().length < 2}
                    onClick={handleSaveWorkType}
                    title="Lưu loại công việc"
                  >
                    {savingWorkType ? (
                      <span className="spinner-border spinner-border-sm" role="status"></span>
                    ) : (
                      <i className="fas fa-check"></i>
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary px-2"
                    disabled={savingWorkType}
                    onClick={() => {
                      setWorkTypeMode(null);
                      setWorkTypeInput("");
                    }}
                    title="Hủy"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              ) : (
                <select
                  className="form-select form-select-sm"
                  value={type}
                  onChange={(e) => {
                    const newType = e.target.value;
                    setType(newType);
                  }}
                >
                  {workTypes.map((wt) => (
                    <option key={wt.code} value={wt.code}>
                      {wt.label}
                    </option>
                  ))}
                  {!workTypes.some((wt) => wt.code === type) && type && (
                    <option value={type}>{TICKET_TYPE_LABELS[type] || type}</option>
                  )}
                </select>
              )}
            </div>
          )}

          {/* Cột 3: Mức độ ưu tiên (SLA) */}
          <div
            className={
              selectedEquipments.length > 0 && ticketCategory === "EQUIPMENT"
                ? canAssign
                  ? "col-md-3 col-sm-6 col-12"
                  : "col-md-4 col-sm-6 col-12"
                : canAssign
                ? "col-lg col-sm-6 col-12"
                : "col-md-3 col-sm-6 col-12"
            }
          >
            <label className="form-label small fw-bold mb-1">
              <i className="fas fa-stopwatch text-warning me-1"></i>Mức độ ưu tiên (SLA)
            </label>
            <select
              className={`form-select form-select-sm ${
                priority === "URGENT"
                  ? "border-danger text-danger fw-bold"
                  : priority === "HIGH"
                  ? "border-warning text-dark fw-bold"
                  : ""
              }`}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Cột 4: Nguồn tiếp nhận */}
          <div
            className={
              selectedEquipments.length > 0 && ticketCategory === "EQUIPMENT"
                ? canAssign
                  ? "col-md-3 col-sm-6 col-12"
                  : "col-md-4 col-sm-6 col-12"
                : canAssign
                ? "col-lg col-sm-6 col-12"
                : "col-md-3 col-sm-6 col-12"
            }
          >
            <label className="form-label small fw-bold mb-1">
              <i className="fas fa-bullhorn text-info me-1"></i>Nguồn tiếp nhận
            </label>
            <select
              className="form-select form-select-sm"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {Object.entries(TICKET_SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {/* Cột 5: Phân công ngay cho Kỹ thuật viên (Tùy chọn) */}
          {canAssign ? (
            <div
              className={
                selectedEquipments.length > 0 && ticketCategory === "EQUIPMENT"
                  ? "col-md-3 col-sm-6 col-12"
                  : "col-lg col-sm-12 col-12"
              }
            >
              <label
                className="form-label small fw-bold text-truncate w-100 mb-1"
                title="Phân công ngay cho Kỹ thuật viên (Tùy chọn - để trống để Điều phối phân bổ sau)"
              >
                <i className="fas fa-user-hard-hat text-success me-1"></i>
                Phân công KTV (Tùy chọn)
              </label>
              <select
                className="form-select form-select-sm"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">-- Để trống (Điều phối) --</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.openTicketsCount} phiếu)
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="col-12">
              <div className="alert alert-info py-2 px-3 small mb-0 d-flex align-items-center gap-2">
                <i className="fas fa-info-circle text-primary"></i>
                <span>Phiếu kỹ thuật tạo mới sẽ tự động được gửi tới Điều phối viên để sắp xếp KTV phù hợp.</span>
              </div>
            </div>
          )}

          {/* Mô tả chi tiết hiện tượng / yêu cầu */}
          <div className="col-12 mt-3 pt-2 border-top border-light-subtle">
            <div className="d-flex justify-content-between align-items-center flex-wrap gap-1 mb-1.5">
              <label className="form-label small fw-bold text-dark mb-0 d-flex align-items-center gap-1.5">
                <i className="fas fa-comment-dots text-primary"></i>
                Nội dung chi tiết công việc / yêu cầu <span className="text-danger">*</span>
                {ticketCategory === "EQUIPMENT" && selectedEquipments.length > 0 && isAutoSyncDesc && (
                  <span
                    className="badge bg-success-subtle text-success border border-success-subtle fw-normal"
                    style={{ fontSize: "10.5px" }}
                  >
                    <i className="fas fa-sync-alt me-1"></i>Tự động tổng hợp từ bảng máy
                  </span>
                )}
              </label>
              <div className="d-flex align-items-center gap-2">
                {ticketCategory === "EQUIPMENT" && selectedEquipments.length > 0 && !isAutoSyncDesc && (
                  <button
                    type="button"
                    className="btn btn-xs btn-outline-primary py-0 px-2 fw-semibold"
                    style={{ fontSize: "11px" }}
                    onClick={handleManualSyncDescription}
                  >
                    <i className="fas fa-magic me-1"></i>Đồng bộ lại từ bảng máy
                  </button>
                )}
                <span className="text-muted" style={{ fontSize: "11.5px" }}>
                  Click gợi ý bên dưới để chèn nhanh nội dung:
                </span>
              </div>
            </div>

            {/* Các tags gợi ý điền nhanh thoáng đãng, dễ nhìn */}
            <div className="d-flex flex-wrap gap-1.5 mb-2">
              {COMMON_ISSUE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="btn btn-sm btn-outline-secondary py-1 px-2.5 rounded-pill shadow-2xs"
                  style={{ fontSize: "11.5px" }}
                  onClick={() => {
                    setIsAutoSyncDesc(false);
                    handleAppendIssueTag(tag);
                  }}
                >
                  + {tag}
                </button>
              ))}
            </div>

            <textarea
              className="form-control"
              rows={3}
              required={ticketCategory !== "EQUIPMENT" || selectedEquipments.length === 0}
              placeholder={
                ticketCategory === "EQUIPMENT" && selectedEquipments.length > 0
                  ? "Nội dung tổng hợp tự động từ bảng chi tiết từng máy ở trên (hoặc bạn có thể gõ ghi chú bổ sung tại đây)..."
                  : "Nhập chi tiết hiện tượng lỗi, vị trí cụ thể, tình trạng máy hiện tại hoặc yêu cầu cần KTV hỗ trợ..."
              }
              value={description}
              onChange={(e) => {
                setIsAutoSyncDesc(false);
                setDescription(e.target.value);
              }}
              style={{ fontSize: "13px", lineHeight: "1.5" }}
            />
          </div>
        </div>
      </form>

      {/* Modal Thêm hồ sơ thiết bị mới (đồng bộ 100% UI với trang Thiết bị chính) */}
      <CreateEquipmentModal
        open={showCreateEquipModal}
        onClose={() => setShowCreateEquipModal(false)}
        onSuccess={handleEquipmentCreated}
        initialCustomerId={selectedCustomer?.id}
        initialCustomerGroup={selectedCustomer?.group}
        initialModel={prefillEquipModel}
        customersList={customers.map((c) => ({ id: c.id, name: c.name }))}
      />
    </ModalShell>
  );
}

export default CreateTicketModal;
