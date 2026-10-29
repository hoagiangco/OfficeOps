"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
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
  branch?: { id: string; name: string; address?: string | null } | null;
  building?: { id: string; name: string; branch?: { name: string } | null } | null;
  department?: {
    id: string;
    name: string;
    building?: { name: string; branch?: { name: string } | null } | null;
  } | null;
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

  // Thiết bị của khách hàng & Loại phiếu
  const [ticketCategory, setTicketCategory] = useState<"GENERAL" | "EQUIPMENT">("GENERAL");
  const [customerMachines, setCustomerMachines] = useState<EquipmentItem[]>([]);
  const [loadingMachines, setLoadingMachines] = useState(false);
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string>("");
  const [machineSearchQuery, setMachineSearchQuery] = useState("");

  const selectedEquipment = useMemo(() => {
    return customerMachines.find((m) => m.id === selectedEquipmentId) || null;
  }, [customerMachines, selectedEquipmentId]);

  // Thông tin phiếu
  const [ticketDate, setTicketDate] = useState<string>(() => getTodayStr());
  const [type, setType] = useState<string>("REPAIR");
  const [priority, setPriority] = useState<string>("NORMAL");
  const [source, setSource] = useState<string>("CUSTOMER");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const customerDropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Quyền phân công ngay
  const canAssign =
    currentUser?.role === "SUPER_ADMIN" ||
    (currentUser?.permissions
      ? !!currentUser.permissions["ticket:assign"]
      : currentUser?.role === "DISPATCHER");

  // 1. Tải danh sách máy của khách hàng khi chọn khách hàng
  const loadCustomerEquipment = useCallback(async (customerId: string, targetEquipId?: string) => {
    setLoadingMachines(true);
    try {
      const res = await fetch(`/api/equipment?customerId=${customerId}&pageSize=100`);
      if (res.ok) {
        const data = await res.json();
        const list: EquipmentItem[] = Array.isArray(data) ? data : data.items || [];
        setCustomerMachines(list);

        if (targetEquipId && list.some((eq) => eq.id === targetEquipId)) {
          setTicketCategory("EQUIPMENT");
          setSelectedEquipmentId(targetEquipId);
        } else {
          setTicketCategory("GENERAL");
          setSelectedEquipmentId("");
        }
      } else {
        setCustomerMachines([]);
        setSelectedEquipmentId("");
        setTicketCategory("GENERAL");
      }
    } catch {
      setCustomerMachines([]);
      setSelectedEquipmentId("");
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
        setType(editingTicket.type || "REPAIR");
        setPriority(editingTicket.priority || "NORMAL");
        setSource(editingTicket.source || "CUSTOMER");
        setAssigneeId(editingTicket.assigneeId || "");
        setDescription(editingTicket.description || "");
        setTicketDate(formatDateStr(editingTicket.createdAt));
        if (editingTicket.customer) {
          setSelectedCustomer(editingTicket.customer);
        }
        loadCustomerEquipment(editingTicket.customerId, editingTicket.equipmentId || undefined);
      } else {
        setSelectedCustomer(null);
        setCustomerMachines([]);
        setSelectedEquipmentId("");
        setTicketCategory("GENERAL");
        setTicketDate(getTodayStr());
        setType("REPAIR");
        setPriority("NORMAL");
        setSource("CUSTOMER");
        setAssigneeId("");
        setDescription("");
      }
    });

    Promise.all([
      fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/customers?pageSize=1000").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/dispatch/technicians").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([me, custData, techData]) => {
        if (!isMounted) return;
        if (me) setCurrentUser(me);
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
    setSelectedEquipmentId("");
    setTicketCategory("GENERAL");
    setCustomerSearchQuery("");
    setMachineSearchQuery("");
    setTimeout(() => {
      searchInputRef.current?.focus();
      setIsCustomerDropdownOpen(true);
    }, 50);
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

  // 9. Submit tạo phiếu
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomer) {
      toast.warning("Vui lòng chọn khách hàng yêu cầu dịch vụ");
      setIsCustomerDropdownOpen(true);
      return;
    }

    if (!description.trim()) {
      toast.warning("Vui lòng nhập mô tả hiện tượng sự cố hoặc yêu cầu kỹ thuật");
      return;
    }

    if (ticketCategory === "EQUIPMENT" && customerMachines.length > 0 && !selectedEquipmentId) {
      toast.warning("Vui lòng chọn máy cho phiếu máy");
      return;
    }

    setSubmitting(true);
    try {
      const targetEquipmentId = ticketCategory === "EQUIPMENT" ? (selectedEquipmentId || null) : null;
      const res = await fetch(
        isEditMode && editingTicket ? `/api/tickets/${editingTicket.id}` : "/api/tickets",
        {
          method: isEditMode && editingTicket ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(isEditMode ? { action: "UPDATE" } : {}),
            customerId: selectedCustomer.id,
            equipmentId: targetEquipmentId,
            type,
            priority,
            source,
            assigneeId: assigneeId || null,
            description: description.trim(),
            createdAt: ticketDate || undefined,
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
      setSelectedEquipmentId("");
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
          <div className="small text-muted d-none d-md-block">
            {selectedCustomer && ticketCategory === "EQUIPMENT" && selectedEquipment ? (
              <span className="text-success fw-medium">
                <i className="fas fa-check-circle me-1"></i>
                {selectedEquipment.model}
                {selectedEquipment.serialNumber ? ` (${selectedEquipment.serialNumber})` : ""}
                {formatLocationPath(selectedEquipment, selectedCustomer ? { branches: selectedCustomer.branches } : null) && (
                  <span className="text-dark ms-1.5 fw-normal">
                    &bull; <i className="fas fa-map-marker-alt text-danger me-1"></i>
                    {formatLocationPath(selectedEquipment, selectedCustomer ? { branches: selectedCustomer.branches } : null)}
                  </span>
                )}
              </span>
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
              <div className="d-flex align-items-center justify-content-between p-1.5 px-2.5 rounded-2 bg-light border">
                <div className="d-flex align-items-center gap-2">
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
                        setSelectedEquipmentId("");
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
                        if (!selectedEquipmentId && customerMachines.length > 0) {
                          setSelectedEquipmentId(customerMachines[0].id);
                        }
                      }}
                    >
                      🖨️ Phiếu máy {customerMachines.length > 0 ? `(${customerMachines.length})` : ""}
                    </button>
                  </div>
                </div>

                {/* Ô tìm kiếm nhanh đặt ngay bên phải thanh Loại phiếu */}
                {ticketCategory === "EQUIPMENT" && customerMachines.length > 3 && (
                  <div style={{ width: "210px" }}>
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
              </div>
            </div>
          )}

          {/* ================= NẾU LÀ PHIẾU MÁY: HIỂN THỊ DANH SÁCH MÁY ================= */}
          {selectedCustomer && ticketCategory === "EQUIPMENT" && (
            <div className="col-12">
              {loadingMachines ? (
                <div className="text-center py-2 bg-light rounded-2 border">
                  <span className="spinner-border spinner-border-sm text-primary me-2" role="status"></span>
                  <span className="small text-muted">Đang tải thiết bị...</span>
                </div>
              ) : customerMachines.length === 0 ? (
                <div className="text-muted small py-2 px-3 bg-light rounded-2 border text-center">
                  Khách hàng này chưa có máy nào trong hệ thống.
                </div>
              ) : (
                <div className="border rounded-2 bg-white shadow-2xs overflow-hidden">
                  <div className="table-responsive" style={{ maxHeight: "200px" }}>
                    <table className="table table-hover table-sm align-middle mb-0" style={{ fontSize: "11.5px" }}>
                      <thead className="table-light border-bottom text-secondary" style={{ fontSize: "11px", position: "sticky", top: 0, zIndex: 1 }}>
                        <tr>
                          <th style={{ width: "38px" }} className="text-center py-1">Chọn</th>
                          <th className="py-1">Thiết bị</th>
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
                              Không tìm thấy máy phù hợp
                            </td>
                          </tr>
                        ) : (
                          filteredMachines.map((eq) => {
                            const isSelected = selectedEquipmentId === eq.id;
                            const locationPath = formatLocationPath(
                              eq,
                              selectedCustomer ? { branches: selectedCustomer.branches } : null
                            );

                            return (
                              <tr
                                key={eq.id}
                                onClick={() => setSelectedEquipmentId(eq.id)}
                                className={isSelected ? "table-primary" : ""}
                                style={{ cursor: "pointer" }}
                              >
                                <td className="text-center py-1">
                                  <input
                                    type="radio"
                                    name="selectedEquipmentRadio"
                                    className="form-check-input m-0 cursor-pointer"
                                    checked={isSelected}
                                    onChange={() => setSelectedEquipmentId(eq.id)}
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
                </div>
              )}
            </div>
          )}

          {/* ================= KHỐI 3: THÔNG TIN PHIẾU KỸ THUẬT ================= */}
          <div className={canAssign ? "col-lg col-sm-6 col-12" : "col-md-3 col-sm-6 col-12"}>
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

          <div className={canAssign ? "col-lg col-sm-6 col-12" : "col-md-3 col-sm-6 col-12"}>
            <label className="form-label small fw-bold mb-1">
              <i className="fas fa-tools text-primary me-1"></i>Loại công việc
            </label>
            <select
              className="form-select form-select-sm"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              {Object.entries(TICKET_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className={canAssign ? "col-lg col-sm-6 col-12" : "col-md-3 col-sm-6 col-12"}>
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

          <div className={canAssign ? "col-lg col-sm-6 col-12" : "col-md-3 col-sm-6 col-12"}>
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

          {/* Phân công ngay cho Kỹ thuật viên (Được đưa lên cùng hàng trên) */}
          {canAssign ? (
            <div className="col-lg col-sm-12 col-12">
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
            <div className="d-flex justify-content-between align-items-center mb-1.5">
              <label className="form-label small fw-bold text-dark mb-0 d-flex align-items-center gap-1.5">
                <i className="fas fa-comment-dots text-primary"></i>
                Nội dung chi tiết công việc / yêu cầu <span className="text-danger">*</span>
              </label>
              <span className="text-muted" style={{ fontSize: "11.5px" }}>
                Click gợi ý bên dưới để chèn nhanh nội dung:
              </span>
            </div>

            {/* Các tags gợi ý điền nhanh thoáng đãng, dễ nhìn */}
            <div className="d-flex flex-wrap gap-1.5 mb-2">
              {COMMON_ISSUE_TAGS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="btn btn-sm btn-outline-secondary py-1 px-2.5 rounded-pill shadow-2xs"
                  style={{ fontSize: "11.5px" }}
                  onClick={() => handleAppendIssueTag(tag)}
                >
                  + {tag}
                </button>
              ))}
            </div>

            <textarea
              className="form-control"
              rows={4}
              required
              placeholder="Nhập chi tiết hiện tượng lỗi, vị trí cụ thể, tình trạng máy hiện tại hoặc yêu cầu cần KTV hỗ trợ..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ fontSize: "13px", lineHeight: "1.5" }}
            />
          </div>
        </div>
      </form>
    </ModalShell>
  );
}

export default CreateTicketModal;
