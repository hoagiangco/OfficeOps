"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import FileManager from "@/components/FileManager";
import { ActiveFilterChips, type FilterChip } from "@/components/ActiveFilterChips";
import { Loading } from "@/components/Loading";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { exportToCsv } from "@/lib/csv";
import { formatLocationPath, getDirectionsUrl } from "@/lib/location";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_SOURCE_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  TICKET_ATTACHMENT_KIND_LABELS,
} from "@/lib/labels";

interface TicketItem {
  id: string;
  code: string;
  customerId: string;
  equipmentId: string;
  assigneeId: string | null;
  type: string;
  status: string;
  priority: string;
  source: string;
  description: string;
  diagnosis: string | null;
  checkInAt: string | null;
  checkInLat: number | null;
  checkInLng: number | null;
  counterAtClose: number | null;
  customerSignature: string | null;
  slaDueAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  customer: { id: string; name: string; phone: string; address: string; latitude?: number | null; longitude?: number | null };
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    brand: string | null;
    status: string;
    currentCounter: number;
    locationNote: string | null;
    branch?: { name: string } | null;
    building?: { name: string; branch?: { name: string } | null } | null;
    department?: {
      name: string;
      building?: {
        name: string;
        branch?: { name: string };
      };
    } | null;
  };
  assignee?: { id: string; name: string; phone: string | null; region: string | null } | null;
  _count?: { stockIssues: number; logs: number; partsUsed: number };
}

interface TicketAttachmentItem {
  id: string;
  ticketId: string;
  url: string;
  kind: string;
  createdAt: string;
}

interface TicketDetail extends TicketItem {
  logs: {
    id: string;
    fromStatus: string | null;
    toStatus: string;
    note: string | null;
    createdAt: string;
    user?: { id: string; name: string; role: string } | null;
  }[];
  stockIssues: {
    id: string;
    code: string;
    status: string;
    createdAt: string;
    items: { id: string; quantity: number; part: { partCode: string; name: string; unit: string } }[];
  }[];
  attachments?: TicketAttachmentItem[];
}

interface CustomerOption {
  id: string;
  name: string;
}

interface EquipmentOption {
  id: string;
  serialNumber: string;
  model: string;
  customerId: string | null;
  currentCounter: number;
}

interface TechOption {
  id: string;
  name: string;
  region: string | null;
  skills: string[];
  openTicketsCount: number;
}

interface PartOption {
  id: string;
  partCode: string;
  name: string;
  unit: string;
  currentQuantity: number;
}

interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

export default function TicketsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [tickets, setTickets] = useState<TicketItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [technicians, setTechnicians] = useState<TechOption[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  // Filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");

  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [createForm, setCreateForm] = useState({
    customerId: "",
    equipmentId: "",
    assigneeId: "",
    type: "REPAIR",
    priority: "NORMAL",
    source: "CUSTOMER",
    description: "",
  });

  // Detail & Workflow Modal
  const [selectedTicket, setSelectedTicket] = useState<TicketDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<"workflow" | "parts" | "logs" | "attachments">("workflow");
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [attachmentKind, setAttachmentKind] = useState<"PHOTO" | "COUNTER_PHOTO" | "REPORT" | "OTHER">("PHOTO");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Workflow sub-forms
  const [assignTechId, setAssignTechId] = useState("");
  const [diagnosisInput, setDiagnosisInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [counterAtCloseInput, setCounterAtCloseInput] = useState<string>("");
  const [signatureInput, setSignatureInput] = useState("");

  // Quick part request inside Ticket modal
  const [reqPartId, setReqPartId] = useState("");
  const [reqPartQty, setReqPartQty] = useState(1);
  const [reqPartNote, setReqPartNote] = useState("");

  const isFieldTech = currentUser?.role === "FIELD_TECH";
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const canAssign = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "DISPATCHER";

  const isSelectedCompleted = selectedTicket?.status === "COMPLETED";
  const isSelectedLocked = isSelectedCompleted && !isSuperAdmin;

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [meRes, tkRes, custRes, eqRes, techRes, partRes] = await Promise.all([
        fetch("/api/auth/me"),
        fetch("/api/tickets"),
        fetch("/api/customers?pageSize=100"),
        fetch("/api/equipment?pageSize=100"),
        fetch("/api/dispatch/technicians"),
        fetch("/api/parts?pageSize=100"),
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        setCurrentUser(me);
      }
      if (tkRes.ok) {
        const d = await tkRes.json();
        setTickets(Array.isArray(d) ? d : d.items || []);
      }
      if (custRes.ok) {
        const d = await custRes.json();
        setCustomers(Array.isArray(d) ? d : d.items || []);
      }
      if (eqRes.ok) {
        const d = await eqRes.json();
        setEquipmentList(Array.isArray(d) ? d : d.items || []);
      }
      if (techRes.ok) {
        const d = await techRes.json();
        setTechnicians(Array.isArray(d) ? d : d.items || []);
      }
      if (partRes.ok) {
        const d = await partRes.json();
        setParts(Array.isArray(d) ? d : d.items || []);
      }
    } catch {
      toast.error("Lỗi tải danh sách phiếu kỹ thuật");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const tid = sp.get("ticketId") || sp.get("id");
      if (tid) {
        openDetailModal(tid);
      }
    }
  }, []);

  const openDetailModal = async (ticketId: string) => {
    setLoadingDetail(true);
    setActiveTab("workflow");
    try {
      const res = await fetch(`/api/tickets/${ticketId}`);
      if (!res.ok) throw new Error("Không tải được chi tiết phiếu");
      const detail: TicketDetail = await res.json();
      setSelectedTicket(detail);
      setAssignTechId(detail.assigneeId || "");
      setDiagnosisInput(detail.diagnosis || "");
      setStatusInput(detail.status);
      setNoteInput("");
      setCounterAtCloseInput(
        detail.counterAtClose != null
          ? String(detail.counterAtClose)
          : String(detail.equipment.currentCounter)
      );
      const sig = detail.customerSignature;
      setSignatureInput(
        sig && !sig.includes("[DEMO_SIGNATURE]") && !sig.includes("...")
          ? sig
          : `Đã xác nhận - ${detail.customer.name}`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải chi tiết");
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter) {
        if (statusFilter === "IN_PROGRESS") {
          if (!["ASSIGNED", "IN_PROGRESS"].includes(t.status)) return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
      }
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (typeFilter && t.type !== typeFilter) return false;
      if (assigneeFilter === "UNASSIGNED" && t.assigneeId !== null) return false;
      if (assigneeFilter && assigneeFilter !== "UNASSIGNED" && t.assigneeId !== assigneeFilter)
        return false;
      if (q.trim()) {
        const kw = q.trim().toLowerCase();
        const match =
          t.code.toLowerCase().includes(kw) ||
          t.description.toLowerCase().includes(kw) ||
          t.customer.name.toLowerCase().includes(kw) ||
          t.equipment.serialNumber.toLowerCase().includes(kw) ||
          t.equipment.model.toLowerCase().includes(kw);
        if (!match) return false;
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, typeFilter, assigneeFilter, q]);

  const toggleStatusFilter = (targetStatus: string) => {
    if (targetStatus === "ALL") {
      setStatusFilter("");
      return;
    }
    if (targetStatus === "IN_PROGRESS") {
      if (statusFilter === "IN_PROGRESS" || statusFilter === "ASSIGNED") {
        setStatusFilter("");
      } else {
        setStatusFilter("IN_PROGRESS");
      }
      return;
    }
    setStatusFilter((prev) => (prev === targetStatus ? "" : targetStatus));
  };

  const togglePriorityFilter = (targetPriority: string) => {
    setPriorityFilter((prev) => (prev === targetPriority ? "" : targetPriority));
  };

  const toggleTypeFilter = (targetType: string) => {
    setTypeFilter((prev) => (prev === targetType ? "" : targetType));
  };

  const toggleAssigneeFilter = (targetAssignee: string) => {
    if (isFieldTech) return;
    setAssigneeFilter((prev) => (prev === targetAssignee ? "" : targetAssignee));
  };

  const filterChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];
    if (q) chips.push({ key: "q", label: "Từ khóa", value: q });
    if (statusFilter)
      chips.push({
        key: "status",
        label: "Trạng thái",
        value: TICKET_STATUS_LABELS[statusFilter] || statusFilter,
      });
    if (priorityFilter)
      chips.push({
        key: "priority",
        label: "Ưu tiên",
        value: TICKET_PRIORITY_LABELS[priorityFilter] || priorityFilter,
      });
    if (typeFilter)
      chips.push({
        key: "type",
        label: "Loại phiếu",
        value: TICKET_TYPE_LABELS[typeFilter] || typeFilter,
      });
    if (!isFieldTech && assigneeFilter) {
      const techName =
        assigneeFilter === "UNASSIGNED"
          ? "Chưa phân công"
          : technicians.find((x) => x.id === assigneeFilter)?.name || assigneeFilter;
      chips.push({ key: "assignee", label: "KTV", value: techName });
    }
    return chips;
  }, [q, statusFilter, priorityFilter, typeFilter, assigneeFilter, technicians, isFieldTech]);

  const handleRemoveChip = (key: string) => {
    if (key === "q") setQ("");
    if (key === "status") setStatusFilter("");
    if (key === "priority") setPriorityFilter("");
    if (key === "type") setTypeFilter("");
    if (key === "assignee") setAssigneeFilter("");
  };

  const clearAllFilters = () => {
    setQ("");
    setStatusFilter("");
    setPriorityFilter("");
    setTypeFilter("");
    setAssigneeFilter("");
  };

  const availableEquipmentForCreate = useMemo(() => {
    if (!createForm.customerId) return equipmentList;
    return equipmentList.filter((e) => e.customerId === createForm.customerId);
  }, [equipmentList, createForm.customerId]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.customerId || !createForm.equipmentId) {
      toast.warning("Vui lòng chọn khách hàng và thiết bị");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          assigneeId: createForm.assigneeId || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể tạo phiếu");
      toast.success(`Đã tạo phiếu ${body.code}`);
      setShowCreateModal(false);
      setCreateForm({
        customerId: "",
        equipmentId: "",
        assigneeId: "",
        type: "REPAIR",
        priority: "NORMAL",
        source: "CUSTOMER",
        description: "",
      });
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tạo phiếu");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTicketAction = async (payload: Record<string, unknown>, successMsg: string) => {
    if (!selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền chỉnh sửa!");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Cập nhật thất bại");
      toast.success(successMsg);
      await openDetailModal(selectedTicket.id);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi xử lý phiếu");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestPartForTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !reqPartId || reqPartQty < 1) {
      toast.warning("Vui lòng chọn linh kiện và số lượng hợp lệ");
      return;
    }
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, không thể tạo yêu cầu xuất linh kiện");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/stock-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TECHNICAL",
          ticketId: selectedTicket.id,
          note: reqPartNote || `Yêu cầu vật tư cho phiếu ${selectedTicket.code}`,
          items: [{ partId: reqPartId, quantity: Number(reqPartQty) }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể tạo phiếu yêu cầu vật tư");

      // Chuyển trạng thái ticket sang WAITING_PARTS nếu chưa hoàn thành
      if (selectedTicket.status !== "COMPLETED") {
        await fetch(`/api/tickets/${selectedTicket.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "UPDATE",
            status: "WAITING_PARTS",
            note: `Tạo phiếu xin xuất linh kiện ${body.code}`,
          }),
        });
      }

      toast.success(`Đã tạo phiếu xuất kho kỹ thuật ${body.code} (Chờ duyệt FIFO)`);
      setReqPartId("");
      setReqPartQty(1);
      setReqPartNote("");
      await openDetailModal(selectedTicket.id);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi yêu cầu linh kiện");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền tải tài liệu");
      return;
    }
    setUploadingAttachment(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "tickets");
      const upRes = await fetch("/api/upload", {
        method: "POST",
        body: fd,
      });
      const upData = await upRes.json();
      if (!upRes.ok) throw new Error(upData.error || "Lỗi tải file lên máy chủ");

      const attRes = await fetch(`/api/tickets/${selectedTicket.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: upData.url,
          kind: attachmentKind,
        }),
      });
      const attData = await attRes.json();
      if (!attRes.ok) throw new Error(attData.error || "Lỗi lưu thông tin đính kèm");

      toast.success("Đã đính kèm ảnh / tài liệu thành công!");
      await openDetailModal(selectedTicket.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi đính kèm file");
    } finally {
      setUploadingAttachment(false);
      e.target.value = "";
    }
  };

  const handleSelectMediaFiles = async (urls: string[]) => {
    if (!selectedTicket || urls.length === 0) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền tải tài liệu");
      return;
    }
    setUploadingAttachment(true);
    try {
      let count = 0;
      for (const url of urls) {
        const attRes = await fetch(`/api/tickets/${selectedTicket.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url,
            kind: attachmentKind,
          }),
        });
        if (attRes.ok) count++;
      }
      if (count > 0) {
        toast.success(`Đã đính kèm ${count} tệp tin thành công!`);
        await openDetailModal(selectedTicket.id);
      } else {
        toast.error("Không thể lưu file đính kèm");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi đính kèm file");
    } finally {
      setUploadingAttachment(false);
      setShowMediaPicker(false);
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!selectedTicket) return;
    if (selectedTicket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền xóa tài liệu");
      return;
    }
    if (!confirm("Bạn có chắc chắn muốn xóa file đính kèm này?")) return;
    try {
      const res = await fetch(`/api/tickets/${selectedTicket.id}/attachments?attachmentId=${attId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Không thể xóa file đính kèm");
      toast.success("Đã xóa file đính kèm");
      await openDetailModal(selectedTicket.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi xóa file");
    }
  };

  // Counts
  const stats = useMemo(() => {
    return {
      total: tickets.length,
      pending: tickets.filter((t) => t.status === "PENDING").length,
      inProgress: tickets.filter((t) => ["ASSIGNED", "IN_PROGRESS"].includes(t.status)).length,
      waitingParts: tickets.filter((t) => t.status === "WAITING_PARTS").length,
      completed: tickets.filter((t) => t.status === "COMPLETED").length,
    };
  }, [tickets]);

  const handleExportCsv = () => {
    exportToCsv(
      "danh-sach-phieu-ky-thuat.csv",
      [
        "Mã phiếu",
        "Ngày tạo",
        "Loại phiếu",
        "Ưu tiên",
        "Khách hàng",
        "Thiết bị",
        "Serial",
        "Kỹ thuật viên",
        "Trạng thái",
        "Hạn SLA",
        "Thời gian hoàn thành",
        "Mô tả sự cố",
      ],
      filteredTickets.map((t) => [
        t.code,
        formatCompactDateTime(t.createdAt),
        TICKET_TYPE_LABELS[t.type] || t.type,
        TICKET_PRIORITY_LABELS[t.priority] || t.priority,
        t.customer.name,
        t.equipment.model,
        t.equipment.serialNumber,
        t.assignee?.name || "Chưa giao",
        TICKET_STATUS_LABELS[t.status] || t.status,
        formatCompactDateTime(t.slaDueAt),
        formatCompactDateTime(t.resolvedAt),
        t.description,
      ])
    );
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "bg-danger text-white";
      case "HIGH":
        return "bg-warning text-dark";
      case "NORMAL":
        return "bg-primary-subtle text-primary border border-primary-subtle";
      default:
        return "bg-secondary-subtle text-secondary";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "PENDING":
        return "bg-danger-subtle text-danger border border-danger-subtle";
      case "ASSIGNED":
        return "bg-info-subtle text-info border border-info-subtle";
      case "IN_PROGRESS":
        return "bg-primary text-white";
      case "WAITING_PARTS":
        return "bg-warning-subtle text-warning-emphasis border border-warning-subtle";
      case "WAITING_CUSTOMER":
        return "bg-purple-subtle text-dark border";
      case "COMPLETED":
        return "bg-success-subtle text-success border border-success-subtle";
      case "CANCELLED":
        return "bg-secondary-subtle text-secondary";
      default:
        return "bg-light text-dark";
    }
  };

  const formatCompactDateTime = (dStr?: string | null) => {
    if (!dStr) return "";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${time} ${day}/${month}`;
  };

  const formatCompactDateOnly = (dStr?: string | null) => {
    if (!dStr) return "";
    const d = new Date(dStr);
    if (isNaN(d.getTime())) return dStr;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  };

  const renderSlaAndCompletion = (t: TicketItem) => {
    const isLateCompleted = Boolean(
      t.status === "COMPLETED" &&
      t.resolvedAt &&
      t.slaDueAt &&
      new Date(t.resolvedAt).getTime() > new Date(t.slaDueAt).getTime()
    );

    const isPendingOverdue = Boolean(
      t.status !== "COMPLETED" &&
      t.status !== "CANCELLED" &&
      t.slaDueAt &&
      new Date(t.slaDueAt).getTime() < Date.now()
    );

    const isOverdue = isLateCompleted || isPendingOverdue;

    return (
      <div className="d-flex align-items-center gap-1.5 flex-nowrap text-nowrap">
        {/* Trạng thái SLA hiển thị Date rút gọn */}
        {t.slaDueAt && (
          <span
            className={`text-nowrap d-inline-flex align-items-center gap-1 ${
              isOverdue ? "text-danger fw-bold" : "text-muted"
            }`}
            style={{ fontSize: "11px" }}
            title={isOverdue ? `Trễ hạn SLA: ${new Date(t.slaDueAt).toLocaleString("vi-VN")}` : `Hạn SLA: ${new Date(t.slaDueAt).toLocaleString("vi-VN")}`}
          >
            <i
              className={`far fa-clock flex-shrink-0 ${isOverdue ? "text-danger" : "text-secondary"}`}
              style={{ fontSize: "10px" }}
            ></i>
            <span>{formatCompactDateOnly(t.slaDueAt)}</span>
          </span>
        )}

        {t.slaDueAt && t.status === "COMPLETED" && t.resolvedAt && (
          <span className="text-muted" style={{ fontSize: "9px" }}>•</span>
        )}

        {/* Đối với ticket đã xong: Hiển thị ngày hoàn thành rút gọn */}
        {t.status === "COMPLETED" && t.resolvedAt && (
          <span
            className="text-success text-nowrap d-inline-flex align-items-center gap-1 fw-semibold"
            style={{ fontSize: "11px" }}
            title={`Hoàn thành lúc: ${new Date(t.resolvedAt).toLocaleString("vi-VN")}`}
          >
            <i className="fas fa-check-circle text-success flex-shrink-0" style={{ fontSize: "10px" }}></i>
            <span>{formatCompactDateOnly(t.resolvedAt)}</span>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="container-fluid px-0">
      {/* Header Bar chuẩn HoaGiang */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-white p-3 rounded shadow-sm border-bottom">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
            <i className="fas fa-exclamation-triangle text-danger"></i>
            <span>Phiếu kỹ thuật</span>
            {isFieldTech && (
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle small fw-normal ms-1" style={{ fontSize: "11px" }}>
                <i className="fas fa-user-check me-1"></i>
                Phiếu của tôi
              </span>
            )}
          </h5>
          <div className="d-flex gap-2 flex-wrap align-items-center">
            <span
              role="button"
              tabIndex={0}
              className={`badge user-select-none ${
                !statusFilter
                  ? "bg-dark text-white border border-dark shadow-sm"
                  : "bg-light text-dark border"
              }`}
              style={{ cursor: "pointer", transition: "all 0.15s ease-in-out" }}
              onClick={() => toggleStatusFilter("ALL")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleStatusFilter("ALL");
                }
              }}
              title="Xem tất cả phiếu kỹ thuật"
            >
              {!statusFilter && <i className="fas fa-check me-1 small"></i>}
              Tổng: <strong>{stats.total}</strong>
            </span>

            <span
              role="button"
              tabIndex={0}
              className={`badge user-select-none ${
                statusFilter === "PENDING"
                  ? "bg-danger text-white border border-danger shadow-sm"
                  : "bg-danger-subtle text-danger border border-danger-subtle"
              }`}
              style={{ cursor: "pointer", transition: "all 0.15s ease-in-out" }}
              onClick={() => toggleStatusFilter("PENDING")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleStatusFilter("PENDING");
                }
              }}
              title="Lọc phiếu: Chờ điều phối (Nhấn lại để bỏ lọc)"
            >
              {statusFilter === "PENDING" && <i className="fas fa-check me-1 small"></i>}
              Chờ điều phối: <strong>{stats.pending}</strong>
            </span>

            <span
              role="button"
              tabIndex={0}
              className={`badge user-select-none ${
                statusFilter === "IN_PROGRESS" || statusFilter === "ASSIGNED"
                  ? "bg-primary text-white border border-primary shadow-sm"
                  : "bg-primary-subtle text-primary border border-primary-subtle"
              }`}
              style={{ cursor: "pointer", transition: "all 0.15s ease-in-out" }}
              onClick={() => toggleStatusFilter("IN_PROGRESS")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleStatusFilter("IN_PROGRESS");
                }
              }}
              title="Lọc phiếu: Đang xử lý (Nhấn lại để bỏ lọc)"
            >
              {(statusFilter === "IN_PROGRESS" || statusFilter === "ASSIGNED") && (
                <i className="fas fa-check me-1 small"></i>
              )}
              Đang xử lý: <strong>{stats.inProgress}</strong>
            </span>

            <span
              role="button"
              tabIndex={0}
              className={`badge user-select-none ${
                statusFilter === "WAITING_PARTS"
                  ? "bg-warning text-dark border border-warning shadow-sm fw-bold"
                  : "bg-warning-subtle text-dark border border-warning-subtle"
              }`}
              style={{ cursor: "pointer", transition: "all 0.15s ease-in-out" }}
              onClick={() => toggleStatusFilter("WAITING_PARTS")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleStatusFilter("WAITING_PARTS");
                }
              }}
              title="Lọc phiếu: Chờ linh kiện (Nhấn lại để bỏ lọc)"
            >
              {statusFilter === "WAITING_PARTS" && <i className="fas fa-check me-1 small"></i>}
              Chờ linh kiện: <strong>{stats.waitingParts}</strong>
            </span>

            <span
              role="button"
              tabIndex={0}
              className={`badge user-select-none ${
                statusFilter === "COMPLETED"
                  ? "bg-success text-white border border-success shadow-sm"
                  : "bg-success-subtle text-success border border-success-subtle"
              }`}
              style={{ cursor: "pointer", transition: "all 0.15s ease-in-out" }}
              onClick={() => toggleStatusFilter("COMPLETED")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggleStatusFilter("COMPLETED");
                }
              }}
              title="Lọc phiếu: Hoàn thành (Nhấn lại để bỏ lọc)"
            >
              {statusFilter === "COMPLETED" && <i className="fas fa-check me-1 small"></i>}
              Hoàn thành: <strong>{stats.completed}</strong>
            </span>
          </div>
        </div>

        <div className="d-flex gap-2 mt-2 mt-md-0">
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className={`btn ${viewMode === "table" ? "btn-dark" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("table")}
              title="Chế độ bảng ERP"
            >
              <i className="fas fa-table me-1"></i> Bảng
            </button>
            <button
              type="button"
              className={`btn ${viewMode === "card" ? "btn-dark" : "btn-outline-secondary"}`}
              onClick={() => setViewMode("card")}
              title="Chế độ thẻ Mobile cho Kỹ thuật viên"
            >
              <i className="fas fa-mobile-alt me-1"></i> Thẻ KTV
            </button>
          </div>

          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={handleExportCsv}
          >
            <i className="fas fa-file-excel me-1"></i> Xuất Excel
          </button>

          {canAssign && (
            <Link href="/dispatch" className="btn btn-sm btn-outline-primary">
              <i className="fas fa-map-marked-alt me-1"></i> Bảng Điều phối
            </Link>
          )}

          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => setShowCreateModal(true)}
          >
            <i className="fas fa-plus me-1"></i> Tạo phiếu mới
          </button>
        </div>
      </div>

      {/* Dense Filter Bar */}
      <div className="bg-light p-2 rounded border mb-2">
        <div className="row g-2 align-items-center">
          <div className={isFieldTech ? "col-md-5" : "col-md-3"}>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white">
                <i className="fas fa-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Tìm mã phiếu, khách hàng, serial, mô tả..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>

          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">-- Mọi trạng thái --</option>
              {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="col-md-2">
            <select
              className="form-select form-select-sm"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="">-- Mọi mức ưu tiên --</option>
              {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className={isFieldTech ? "col-md-3" : "col-md-2"}>
            <select
              className="form-select form-select-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">-- Mọi loại phiếu --</option>
              {Object.entries(TICKET_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {!isFieldTech && (
            <div className="col-md-3">
              <select
                className="form-select form-select-sm"
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
              >
                <option value="">-- Mọi kỹ thuật viên --</option>
                <option value="UNASSIGNED">Chưa phân công KTV</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.region || "Toàn vùng"})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <ActiveFilterChips
          chips={filterChips}
          onRemove={handleRemoveChip}
          onClearAll={clearAllFilters}
        />
      </div>

      {/* Main Content */}
      {loading ? (
        <Loading text="Đang tải danh sách phiếu kỹ thuật..." />
      ) : viewMode === "table" ? (
        <div
          className="table-responsive bg-white rounded shadow-sm border"
          style={{ maxHeight: "calc(100vh - 250px)" }}
        >
          <table className="table table-hover table-bordered mb-0 custom-dense-table table-sticky-header align-middle">
            <thead className="bg-dark text-white">
              <tr>
                <th style={{ width: "135px" }} className="text-nowrap">Mã phiếu</th>
                <th style={{ width: "145px" }} className="text-nowrap">Loại & Ưu tiên</th>
                <th className="text-nowrap" style={{ minWidth: "260px" }}>Khách hàng & Sự cố</th>
                <th className="text-nowrap" style={{ minWidth: "180px" }}>Thiết bị & Vị trí</th>
                <th style={{ width: "175px" }} className="text-nowrap">Kỹ thuật viên</th>
                <th style={{ width: "135px" }} className="text-nowrap">Trạng thái / SLA</th>
                <th className="text-center text-nowrap" style={{ width: "95px" }}>
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    Không có phiếu kỹ thuật nào phù hợp bộ lọc.
                  </td>
                </tr>
              ) : (
                filteredTickets.map((t) => {
                  const isOverdue =
                    t.slaDueAt &&
                    !["COMPLETED", "CANCELLED"].includes(t.status) &&
                    new Date(t.slaDueAt).getTime() < Date.now();
                  const rowClass =
                    t.priority === "URGENT" && t.status !== "COMPLETED"
                      ? "bg-danger-subtle"
                      : t.status === "WAITING_PARTS"
                      ? "bg-warning-subtle"
                      : "";

                  return (
                    <tr key={t.id} className={rowClass}>
                      <td className="fw-bold font-monospace text-nowrap" style={{ width: "135px" }}>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openDetailModal(t.id);
                          }}
                          className="text-decoration-none text-primary d-inline-block text-nowrap"
                        >
                          {t.code}
                        </a>
                        <div className="text-muted text-nowrap" style={{ fontSize: "11px" }}>
                          <i className="far fa-calendar-alt me-1 text-secondary opacity-75"></i>
                          {new Date(t.createdAt).toLocaleDateString("vi-VN")}
                        </div>
                      </td>
                      <td>
                        <div className="d-flex flex-column gap-1 align-items-start">
                          <span
                            role="button"
                            className="badge bg-light text-dark border text-nowrap user-select-none"
                            style={{ cursor: "pointer", fontSize: "11.5px", fontWeight: 600 }}
                            onClick={() => toggleTypeFilter(t.type)}
                            title={`Lọc theo loại phiếu: ${TICKET_TYPE_LABELS[t.type] || t.type} (Nhấn lại để bỏ lọc)`}
                          >
                            <i className="fas fa-wrench me-1 text-muted small"></i>
                            {TICKET_TYPE_LABELS[t.type] || t.type}
                            {typeFilter === t.type && <i className="fas fa-check text-success ms-1 small"></i>}
                          </span>
                          <span
                            role="button"
                            className={`badge ${getPriorityBadge(t.priority)} user-select-none text-nowrap`}
                            style={{ cursor: "pointer", fontSize: "11px" }}
                            onClick={() => togglePriorityFilter(t.priority)}
                            title={`Lọc theo mức ưu tiên: ${TICKET_PRIORITY_LABELS[t.priority] || t.priority} (Nhấn lại để bỏ lọc)`}
                          >
                            {priorityFilter === t.priority && <i className="fas fa-check me-1 small"></i>}
                            {TICKET_PRIORITY_LABELS[t.priority] || t.priority}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="fw-bold text-dark">{t.customer.name}</div>
                        <div className="text-muted small">
                          {t.description}
                        </div>
                        {t.diagnosis && (
                          <div className="text-info-emphasis small">
                            <i className="fas fa-stethoscope me-1"></i>
                            {t.diagnosis}
                          </div>
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/equipment/${t.equipment.id}`}
                          className="fw-semibold text-decoration-none"
                        >
                          {t.equipment.model}
                        </Link>
                        <div className="small text-muted font-monospace">
                          SN: {t.equipment.serialNumber} | Counter:{" "}
                          {t.equipment.currentCounter.toLocaleString("vi-VN")}
                        </div>
                        {formatLocationPath(t.equipment) && (
                          <div className="small text-secondary">
                            <i className="fas fa-map-pin me-1"></i>
                            {formatLocationPath(t.equipment)}


                          </div>
                        )}
                      </td>
                      <td>
                        {t.assignee ? (
                          <div className="d-flex flex-column gap-1 align-items-start">
                            {/* Dòng 1: Tên KTV - Tuyệt đối chỉ trên 1 dòng */}
                            <div
                              role="button"
                              className="fw-bold text-dark text-nowrap d-flex align-items-center gap-1 user-select-none"
                              style={{ cursor: "pointer", fontSize: "12.5px" }}
                              onClick={() => toggleAssigneeFilter(t.assignee!.id)}
                              title={`KTV: ${t.assignee.name}${t.assignee.region ? ` (${t.assignee.region})` : ""} (Nhấn lại để bỏ lọc)`}
                            >
                              <i className="fas fa-user-cog text-primary flex-shrink-0"></i>
                              <span className="text-truncate text-nowrap" style={{ maxWidth: "165px" }}>
                                {t.assignee.name}
                              </span>
                              {assigneeFilter === t.assignee.id && (
                                <i className="fas fa-check text-success flex-shrink-0 small"></i>
                              )}
                            </div>

                            {/* GPS Check-in nếu có */}
                            {t.checkInAt && (
                              <div className="text-success text-nowrap d-flex align-items-center gap-1" style={{ fontSize: "11px" }}>
                                <i className="fas fa-check-circle flex-shrink-0" style={{ fontSize: "10px" }}></i>
                                <span>Đã check-in GPS</span>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span
                            role="button"
                            className="badge bg-secondary-subtle text-secondary user-select-none text-nowrap border"
                            style={{ cursor: "pointer", fontSize: "11px" }}
                            onClick={() => toggleAssigneeFilter("UNASSIGNED")}
                            title="Lọc phiếu chưa phân công KTV (Nhấn lại để bỏ lọc)"
                          >
                            {assigneeFilter === "UNASSIGNED" && <i className="fas fa-check me-1 small"></i>}
                            <i className="fas fa-user-slash me-1 small"></i>
                            Chưa giao KTV
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="d-flex flex-column gap-1 align-items-start">
                          <span
                            role="button"
                            className={`badge ${getStatusBadge(t.status)} user-select-none text-nowrap`}
                            style={{ cursor: "pointer", fontSize: "11.5px" }}
                            onClick={() => toggleStatusFilter(t.status)}
                            title={`Lọc theo trạng thái: ${TICKET_STATUS_LABELS[t.status] || t.status} (Nhấn lại để bỏ lọc)`}
                          >
                            {statusFilter === t.status && <i className="fas fa-check me-1 small"></i>}
                            {TICKET_STATUS_LABELS[t.status] || t.status}
                          </span>

                          {/* Dòng 2: Hiển thị SLA & thời gian hoàn thành rút gọn */}
                          {renderSlaAndCompletion(t)}
                        </div>
                      </td>
                      <td className="text-center">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => openDetailModal(t.id)}
                          title="Mở xử lý phiếu"
                        >
                          <i className="fas fa-tools me-1"></i> Xử lý
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Chế độ Thẻ Mobile cho Kỹ thuật viên */
        <div className="row g-3">
          {filteredTickets.map((t) => (
            <div key={t.id} className="col-md-6 col-lg-4">
              <div className="card shadow-sm h-100 border">
                <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="fw-bold font-monospace text-primary text-nowrap">{t.code}</span>
                    <span className="text-muted small text-nowrap" style={{ fontSize: "11px" }}>
                      <i className="far fa-calendar-alt me-1 text-secondary"></i>
                      {new Date(t.createdAt).toLocaleDateString("vi-VN", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="d-flex gap-1">
                    <span
                      role="button"
                      className={`badge ${getPriorityBadge(t.priority)} user-select-none`}
                      style={{ cursor: "pointer" }}
                      onClick={() => togglePriorityFilter(t.priority)}
                      title={`Lọc theo ưu tiên: ${TICKET_PRIORITY_LABELS[t.priority]} (Nhấn lại để bỏ lọc)`}
                    >
                      {priorityFilter === t.priority && <i className="fas fa-check me-1 small"></i>}
                      {TICKET_PRIORITY_LABELS[t.priority]}
                    </span>
                    <span
                      role="button"
                      className={`badge ${getStatusBadge(t.status)} user-select-none`}
                      style={{ cursor: "pointer" }}
                      onClick={() => toggleStatusFilter(t.status)}
                      title={`Lọc theo trạng thái: ${TICKET_STATUS_LABELS[t.status]} (Nhấn lại để bỏ lọc)`}
                    >
                      {statusFilter === t.status && <i className="fas fa-check me-1 small"></i>}
                      {TICKET_STATUS_LABELS[t.status]}
                    </span>
                  </div>
                </div>
                <div className="card-body py-2">
                  <h6 className="fw-bold mb-1">{t.customer.name}</h6>
                  <p className="text-muted small mb-2">
                    <i className="fas fa-map-marker-alt text-danger me-1"></i>
                    {t.customer.address}
                  </p>
                  <div className="bg-light p-2 rounded border mb-2 small">
                    <div>
                      <strong>Máy:</strong> {t.equipment.model} ({t.equipment.serialNumber})
                    </div>
                    <div>
                      <strong>Sự cố:</strong> {t.description}
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center small text-muted">
                    <span
                      role="button"
                      className="d-flex align-items-center gap-1 text-nowrap text-truncate"
                      style={{ cursor: "pointer", maxWidth: "60%" }}
                      onClick={() => toggleAssigneeFilter(t.assignee ? t.assignee.id : "UNASSIGNED")}
                      title={
                        t.assignee
                          ? `Lọc theo KTV: ${t.assignee.name} (Nhấn lại để bỏ lọc)`
                          : "Lọc phiếu chưa phân công (Nhấn lại để bỏ lọc)"
                      }
                    >
                      <i className="fas fa-user-wrench me-1 flex-shrink-0"></i>
                      <span className="text-truncate">{t.assignee ? t.assignee.name : "Chưa phân công"}</span>
                      {((t.assignee && assigneeFilter === t.assignee.id) ||
                        (!t.assignee && assigneeFilter === "UNASSIGNED")) && (
                        <i className="fas fa-check text-success ms-1 small flex-shrink-0"></i>
                      )}
                    </span>
                    {t.checkInAt && (
                      <span className="text-success fw-semibold">
                        <i className="fas fa-check-circle me-1"></i>Đã Check-in
                      </span>
                    )}
                  </div>
                </div>
                <div className="card-footer bg-white border-top-0 pt-0 pb-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary w-100"
                    onClick={() => openDetailModal(t.id)}
                  >
                    <i className="fas fa-play-circle me-1"></i> Mở thao tác KTV
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal 1: Tạo Ticket mới */}
      <ModalShell
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Tiếp nhận & Tạo phiếu kỹ thuật"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setShowCreateModal(false)}
            >
              Đóng
            </button>
            <button
              type="submit"
              form="create-ticket-form"
              className="btn btn-sm btn-primary"
              disabled={submitting}
            >
              <i className="fas fa-save me-1"></i> Lưu & Phát hành phiếu
            </button>
          </>
        }
      >
        <form id="create-ticket-form" onSubmit={handleCreateTicket}>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-bold">
                Khách hàng <span className="text-danger">*</span>
              </label>
              <select
                className="form-select form-select-sm"
                required
                value={createForm.customerId}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    customerId: e.target.value,
                    equipmentId: "",
                  })
                }
              >
                <option value="">-- Chọn khách hàng --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold">
                Thiết bị gặp sự cố / bảo trì <span className="text-danger">*</span>
              </label>
              <select
                className="form-select form-select-sm"
                required
                value={createForm.equipmentId}
                onChange={(e) =>
                  setCreateForm({ ...createForm, equipmentId: e.target.value })
                }
              >
                <option value="">-- Chọn máy --</option>
                {availableEquipmentForCreate.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.model} - SN: {eq.serialNumber} (Counter:{" "}
                    {eq.currentCounter.toLocaleString("vi-VN")})
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold">Loại công việc</label>
              <select
                className="form-select form-select-sm"
                value={createForm.type}
                onChange={(e) => setCreateForm({ ...createForm, type: e.target.value })}
              >
                {Object.entries(TICKET_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold">Mức độ ưu tiên (SLA)</label>
              <select
                className="form-select form-select-sm"
                value={createForm.priority}
                onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
              >
                {Object.entries(TICKET_PRIORITY_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold">Nguồn tiếp nhận</label>
              <select
                className="form-select form-select-sm"
                value={createForm.source}
                onChange={(e) => setCreateForm({ ...createForm, source: e.target.value })}
              >
                {Object.entries(TICKET_SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {canAssign ? (
              <div className="col-md-12">
                <label className="form-label small fw-bold">
                  Phân công ngay cho Kỹ thuật viên (Tùy chọn)
                </label>
                <select
                  className="form-select form-select-sm"
                  value={createForm.assigneeId}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, assigneeId: e.target.value })
                  }
                >
                  <option value="">-- Để trống (Chuyển sang Bảng Điều phối) --</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} | Khu vực: {t.region || "Toàn vùng"} | Đang xử lý:{" "}
                      {t.openTicketsCount} phiếu
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="col-md-12">
                <div className="alert alert-info py-2 px-3 small mb-0 d-flex align-items-center gap-2">
                  <i className="fas fa-info-circle text-primary"></i>
                  <span>Phiếu kỹ thuật tạo mới sẽ được chuyển đến Điều phối viên để xem xét và giao việc.</span>
                </div>
              </div>
            )}

            <div className="col-md-12">
              <label className="form-label small fw-bold">
                Mô tả chi tiết hiện tượng / yêu cầu <span className="text-danger">*</span>
              </label>
              <textarea
                className="form-control form-control-sm"
                rows={3}
                required
                placeholder="VD: Máy báo lỗi SC-542, kẹt giấy khay 2, bản in bị vệt đen dọc..."
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
              />
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal 2: Xử lý toàn trình Ticket */}
      <ModalShell
        open={!!selectedTicket || loadingDetail}
        onClose={() => setSelectedTicket(null)}
        title={
          selectedTicket
            ? `Xử lý Phiếu ${selectedTicket.code} - ${
                TICKET_STATUS_LABELS[selectedTicket.status] || selectedTicket.status
              }`
            : "Đang tải..."
        }
        size="xl"
      >
        {loadingDetail || !selectedTicket ? (
          <Loading text="Đang tải hồ sơ phiếu kỹ thuật..." />
        ) : (
          <div>
            {/* Thông tin tóm tắt đầu phiếu */}
            <div className="bg-light p-3 rounded border mb-3">
              <div className="row g-2 small">
                <div className="col-md-4">
                  <div className="text-muted">Khách hàng & Địa chỉ:</div>
                  <div className="fw-bold text-dark">{selectedTicket.customer.name}</div>
                  <div>{selectedTicket.customer.address}</div>
                  <div className="d-flex align-items-center gap-1">
                    <span>SĐT:</span>
                    {selectedTicket.customer.phone ? (
                      selectedTicket.customer.phone.includes("*") ? (
                        <span className="text-muted font-monospace" title="Số điện thoại bị ẩn do tài khoản chưa được cấp quyền xem SĐT">
                          <i className="fas fa-lock text-muted me-1 small"></i>
                          {selectedTicket.customer.phone}
                        </span>
                      ) : (
                        <a href={`tel:${selectedTicket.customer.phone}`} className="fw-semibold text-decoration-none">
                          {selectedTicket.customer.phone}
                        </a>
                      )
                    ) : (
                      <span className="text-muted fst-italic">Chưa có</span>
                    )}
                  </div>
                  <div className="mt-1">
                    <a
                      href={getDirectionsUrl(selectedTicket.customer)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-xs btn-outline-primary py-0.5 px-2 fw-semibold d-inline-flex align-items-center gap-1 shadow-2xs"
                      style={{ fontSize: "11px" }}
                      title="Mở chỉ đường Google Maps"
                    >
                      <i className="fas fa-location-arrow text-danger"></i>
                      <span>Chỉ đường</span>
                    </a>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted">Thiết bị & Counter hiện tại:</div>
                  <div className="fw-bold text-primary">
                    {selectedTicket.equipment.model} (SN: {selectedTicket.equipment.serialNumber})
                  </div>
                  <div>
                    Counter hiện tại:{" "}
                    <strong className="font-monospace">
                      {selectedTicket.equipment.currentCounter.toLocaleString("vi-VN")}
                    </strong>
                  </div>
                  <div> Mô tả lỗi: {selectedTicket.description}</div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted">Điều phối & Tiến độ:</div>
                  <div>
                    KTV phụ trách:{" "}
                    <strong>
                      {selectedTicket.assignee ? selectedTicket.assignee.name : "Chưa giao"}
                    </strong>
                  </div>
                  <div>
                    Check-in GPS:{" "}
                    {selectedTicket.checkInAt ? (
                      <span className="text-success fw-semibold">
                        {formatCompactDateTime(selectedTicket.checkInAt)} (
                        {selectedTicket.checkInLat?.toFixed(3)},{" "}
                        {selectedTicket.checkInLng?.toFixed(3)})
                      </span>
                    ) : (
                      <span className="text-warning-emphasis">Chưa check-in</span>
                    )}
                  </div>
                  {selectedTicket.slaDueAt && (
                    <div>
                      Hạn SLA:{" "}
                      <strong
                        className={
                          (selectedTicket.resolvedAt
                            ? new Date(selectedTicket.resolvedAt).getTime() > new Date(selectedTicket.slaDueAt).getTime()
                            : new Date(selectedTicket.slaDueAt).getTime() < Date.now())
                            ? "text-danger"
                            : "text-dark"
                        }
                      >
                        {formatCompactDateTime(selectedTicket.slaDueAt)}
                      </strong>
                    </div>
                  )}
                  {selectedTicket.resolvedAt && (
                    <div className="text-success fw-bold">
                      Hoàn thành: {formatCompactDateTime(selectedTicket.resolvedAt)}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cảnh báo trạng thái phiếu đã hoàn thành */}
            {isSelectedCompleted && (
              <div
                className={`alert ${
                  isSuperAdmin ? "alert-info border-info" : "alert-secondary border-secondary"
                } d-flex align-items-center mb-3 py-2 px-3 small`}
              >
                <i
                  className={`fas ${
                    isSuperAdmin ? "fa-shield-alt text-primary" : "fa-lock text-danger"
                  } fa-lg me-2`}
                ></i>
                <div>
                  {isSuperAdmin ? (
                    <span>
                      <strong>Phiếu kỹ thuật đã hoàn thành</strong> — Bạn đang đăng nhập quyền{" "}
                      <strong className="text-primary">Giám đốc (Super Admin)</strong> nên có thể điều chỉnh lại nội dung khi cần thiết.
                    </span>
                  ) : (
                    <span>
                      <strong>Phiếu kỹ thuật đã hoàn thành (Khóa nội dung)</strong> — Phiếu đã nghiệm thu đóng nên không thể chỉnh sửa thông tin hoặc đính kèm thêm dữ liệu. Chỉ{" "}
                      <strong>Giám đốc (Super Admin)</strong> mới có quyền điều chỉnh phiếu đã hoàn thành.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Tabs điều hướng trong Modal */}
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 border-bottom pb-2">
              <ul className="nav nav-tabs border-bottom-0 mb-0">
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link py-1 px-3 ${
                    activeTab === "workflow" ? "active fw-bold" : ""
                  }`}
                  onClick={() => setActiveTab("workflow")}
                >
                  <i className="fas fa-tasks me-1"></i> Quy trình xử lý & Nghiệm thu
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link py-1 px-3 ${
                    activeTab === "parts" ? "active fw-bold" : ""
                  }`}
                  onClick={() => setActiveTab("parts")}
                >
                  <i className="fas fa-cogs me-1"></i> Linh kiện xuất kho (
                  {selectedTicket.stockIssues.length})
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link py-1 px-3 ${
                    activeTab === "logs" ? "active fw-bold" : ""
                  }`}
                  onClick={() => setActiveTab("logs")}
                >
                  <i className="fas fa-history me-1"></i> Nhật ký tiến độ (
                  {selectedTicket.logs.length})
                </button>
              </li>
              <li className="nav-item">
                <button
                  type="button"
                  className={`nav-link py-1 px-3 ${
                    activeTab === "attachments" ? "active fw-bold" : ""
                  }`}
                  onClick={() => setActiveTab("attachments")}
                >
                  <i className="fas fa-paperclip me-1"></i> Ảnh &amp; Biên bản (
                  {selectedTicket.attachments?.length || 0})
                </button>
              </li>
            </ul>

              <a
                href={`/tickets/${selectedTicket.id}/print`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-outline-dark fw-bold d-flex align-items-center gap-1 shadow-sm px-3"
              >
                <i className="fas fa-print text-primary"></i>
                <span>In Biên Bản Nghiệm Thu (A4)</span>
              </a>
            </div>

            {activeTab === "workflow" && (
              <div className="row g-3">
                {/* Bước 1 & 2: Phân công KTV + Check-in GPS */}
                <div className="col-md-6">
                  <div className="card h-100 border">
                    <div className="card-header bg-light py-2 fw-bold small">
                      1. Điều phối KTV & Check-in GPS
                    </div>
                    <div className="card-body">
                      {canAssign && (!isSelectedCompleted || isSuperAdmin) ? (
                        <div className="mb-3">
                          <label className="form-label small fw-bold">Kỹ thuật viên phụ trách</label>
                          <div className="input-group input-group-sm">
                            <select
                              className="form-select"
                              value={assignTechId}
                              disabled={isSelectedLocked}
                              onChange={(e) => setAssignTechId(e.target.value)}
                            >
                              <option value="">-- Chọn KTV --</option>
                              {technicians.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.region || "Toàn vùng"} - {t.openTicketsCount} việc)
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-outline-primary"
                              disabled={submitting || isSelectedLocked || !assignTechId}
                              onClick={() =>
                                handleTicketAction(
                                  { action: "ASSIGN", assigneeId: assignTechId },
                                  "Đã phân công kỹ thuật viên"
                                )
                              }
                            >
                              Giao việc
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-3 p-2 bg-light rounded border">
                          <div className="small text-muted mb-1 fw-bold">Kỹ thuật viên phụ trách</div>
                          <div className="d-flex align-items-center justify-content-between">
                            <div className="fw-semibold text-dark">
                              <i className="fas fa-user-cog text-primary me-1"></i>
                              {selectedTicket.assignee?.name || "Chưa phân công"}
                            </div>
                            <span className="badge bg-secondary-subtle text-secondary small">
                              {isSelectedCompleted ? "Phiếu đã đóng" : "Không có quyền giao việc"}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="d-flex justify-content-between align-items-center border-top pt-3">
                        <div className="small">
                          <div className="fw-bold">Xác nhận Check-in (GPS)</div>
                          <div className="text-muted">
                            Ghi nhận thời gian bắt đầu xử lý thực tế (SLA)
                          </div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-info text-white"
                          disabled={
                            submitting ||
                            selectedTicket.status === "COMPLETED" ||
                            selectedTicket.status === "CANCELLED" ||
                            isSelectedLocked
                          }
                          onClick={() =>
                            handleTicketAction(
                              {
                                action: "CHECK_IN",
                                checkInLat: 10.7769,
                                checkInLng: 106.7009,
                              },
                              "Đã Check-in GPS và bắt đầu xử lý!"
                            )
                          }
                        >
                          <i className="fas fa-location-arrow me-1"></i> Check-in GPS ngay
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bước 3: Cập nhật chẩn đoán & trạng thái */}
                <div className="col-md-6">
                  <div className="card h-100 border">
                    <div className="card-header bg-light py-2 fw-bold small">
                      2. Khảo sát, Chẩn đoán kỹ thuật & Cập nhật tiến độ
                    </div>
                    <div className="card-body">
                      <div className="mb-2">
                        <label className="form-label small fw-bold">
                          Kết quả chẩn đoán / phương án xử lý
                        </label>
                        <textarea
                          className="form-control form-control-sm"
                          rows={2}
                          placeholder={
                            isSelectedLocked
                              ? "Phiếu đã hoàn thành (Khóa chỉnh sửa chẩn đoán)"
                              : "VD: Mòn trống hình + rách bao lụa sấy, cần xuất linh kiện thay thế..."
                          }
                          value={diagnosisInput}
                          disabled={isSelectedLocked}
                          onChange={(e) => setDiagnosisInput(e.target.value)}
                        />
                      </div>
                      <div className="row g-2 align-items-end">
                        <div className="col-md-5">
                          <label className="form-label small fw-bold">Trạng thái phiếu</label>
                          <select
                            className="form-select form-select-sm"
                            value={statusInput}
                            disabled={isSelectedLocked}
                            onChange={(e) => setStatusInput(e.target.value)}
                          >
                            {Object.entries(TICKET_STATUS_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>
                                {v}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-md-7">
                          <label className="form-label small fw-bold">Ghi chú nhật ký</label>
                          <div className="input-group input-group-sm">
                            <input
                              type="text"
                              className="form-control"
                              placeholder={
                                isSelectedLocked ? "Phiếu đã hoàn thành..." : "Ghi chú tiến độ..."
                              }
                              value={noteInput}
                              disabled={isSelectedLocked}
                              onChange={(e) => setNoteInput(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={submitting || isSelectedLocked}
                              onClick={() =>
                                handleTicketAction(
                                  {
                                    action: "UPDATE",
                                    diagnosis: diagnosisInput,
                                    status: statusInput,
                                    note: noteInput,
                                  },
                                  "Đã cập nhật thông tin chẩn đoán & trạng thái"
                                )
                              }
                            >
                              Lưu tiến độ
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bước 4: Nghiệm thu hoàn thành (Chốt Counter + Chữ ký khách hàng) */}
                <div className="col-12">
                  <div className="card border-success">
                    <div className="card-header bg-success-subtle text-success-emphasis py-2 fw-bold small d-flex justify-content-between align-items-center">
                      <span>
                        <i className="fas fa-check-double me-1"></i> 3. Nghiệm thu hoàn thành, Chốt
                        Counter & Ký xác nhận khách hàng
                      </span>
                      {selectedTicket.status === "COMPLETED" && (
                        <span className="badge bg-success">Phiếu đã hoàn thành</span>
                      )}
                    </div>
                    <div className="card-body">
                      <div className="row g-3 align-items-end">
                        <div className="col-md-4">
                          <label className="form-label small fw-bold">
                            Chỉ số Counter khi đóng phiếu (&ge;{" "}
                            {selectedTicket.equipment.currentCounter.toLocaleString("vi-VN")})
                          </label>
                          <input
                            type="number"
                            className="form-control form-control-sm font-monospace mb-2"
                            min={selectedTicket.equipment.currentCounter}
                            value={counterAtCloseInput}
                            disabled={isSelectedLocked}
                            onChange={(e) => setCounterAtCloseInput(e.target.value)}
                          />
                          <label className="form-label small fw-bold">
                            Ghi chú người ký nghiệm thu
                          </label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Nhập họ tên người ký nhận..."
                            value={
                              signatureInput.startsWith("data:image/")
                                ? `Đã ký điện tử - ${selectedTicket.customer.name}`
                                : signatureInput
                            }
                            disabled={isSelectedLocked}
                            onChange={(e) => setSignatureInput(e.target.value)}
                          />
                        </div>
                        <div className="col-md-5">
                          <label className="form-label small fw-bold">
                            Chữ ký điện tử của Khách hàng (Canvas cảm ứng/chuột)
                          </label>
                          <SignatureCanvas
                            value={signatureInput}
                            disabled={isSelectedLocked || (!isSuperAdmin && selectedTicket.status === "COMPLETED")}
                            onChange={(dataUrl) =>
                              setSignatureInput(
                                dataUrl || `Đã xác nhận - ${selectedTicket.customer.name}`
                              )
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          {isSelectedCompleted ? (
                            isSuperAdmin ? (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary w-100 py-2 fw-bold"
                                disabled={submitting}
                                onClick={() =>
                                  handleTicketAction(
                                    {
                                      action: "UPDATE",
                                      diagnosis: diagnosisInput,
                                      counterAtClose: counterAtCloseInput
                                        ? Number(counterAtCloseInput)
                                        : null,
                                      customerSignature: signatureInput,
                                      note:
                                        noteInput ||
                                        "Giám đốc (Super Admin) cập nhật nghiệm thu phiếu đã hoàn thành",
                                    },
                                    "Đã cập nhật lại thông tin nghiệm thu phiếu hoàn thành!"
                                  )
                                }
                              >
                                <i className="fas fa-save me-1"></i> Cập nhật nghiệm thu
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary w-100 py-2 fw-bold"
                                disabled
                              >
                                <i className="fas fa-lock me-1"></i> Đã hoàn thành (Khóa)
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              className="btn btn-sm btn-success w-100 py-2 fw-bold"
                              disabled={submitting}
                              onClick={() =>
                                handleTicketAction(
                                  {
                                    action: "COMPLETE",
                                    diagnosis:
                                      diagnosisInput || "Đã khắc phục triệt để và bàn giao máy",
                                    counterAtClose: counterAtCloseInput
                                      ? Number(counterAtCloseInput)
                                      : null,
                                    customerSignature: signatureInput,
                                  },
                                  "Đã hoàn thành phiếu, lưu chữ ký & Counter, khôi phục trạng thái máy!"
                                )
                              }
                            >
                              <i className="fas fa-check-circle me-1"></i> Hoàn thành & Đóng phiếu
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "parts" && (
              <div>
                {isSelectedLocked ? (
                  <div className="alert alert-secondary py-2 px-3 small rounded border mb-3 d-flex align-items-center">
                    <i className="fas fa-lock me-2 text-secondary"></i>
                    <span>Phiếu kỹ thuật đã hoàn thành. Tính năng xin xuất kho linh kiện đã khóa (chỉ Giám đốc mới có quyền tạo yêu cầu).</span>
                  </div>
                ) : (
                  <form
                    onSubmit={handleRequestPartForTicket}
                    className="bg-light p-3 rounded border mb-3"
                  >
                    <div className="fw-bold small mb-2">
                      <i className="fas fa-plus-circle text-primary me-1"></i> Tạo nhanh yêu cầu xuất
                      linh kiện kỹ thuật cho phiếu kỹ thuật {selectedTicket.code}
                    </div>
                    <div className="row g-2 align-items-end">
                      <div className="col-md-5">
                        <label className="form-label small mb-1">Chọn vật tư / linh kiện</label>
                        <select
                          className="form-select form-select-sm"
                          value={reqPartId}
                          onChange={(e) => setReqPartId(e.target.value)}
                          required
                        >
                          <option value="">-- Chọn linh kiện trong kho --</option>
                          {parts.map((p) => (
                            <option key={p.id} value={p.id}>
                              [{p.partCode}] {p.name} (Tồn: {p.currentQuantity} {p.unit})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-md-2">
                        <label className="form-label small mb-1">Số lượng</label>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          min={1}
                          value={reqPartQty}
                          onChange={(e) => setReqPartQty(Number(e.target.value))}
                          required
                        />
                      </div>
                      <div className="col-md-3">
                        <label className="form-label small mb-1">Ghi chú xuất</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="Thay thế tại chỗ..."
                          value={reqPartNote}
                          onChange={(e) => setReqPartNote(e.target.value)}
                        />
                      </div>
                      <div className="col-md-2">
                        <button
                          type="submit"
                          className="btn btn-sm btn-warning w-100 fw-semibold"
                          disabled={submitting}
                        >
                          Xin xuất kho
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                <table className="table table-sm table-bordered custom-dense-table mb-0">
                  <thead className="bg-dark text-white">
                    <tr>
                      <th>Mã phiếu xuất</th>
                      <th>Ngày tạo</th>
                      <th>Chi tiết linh kiện</th>
                      <th>Trạng thái duyệt FIFO</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTicket.stockIssues.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted py-3">
                          Chưa có phiếu xuất linh kiện nào gắn với phiếu kỹ thuật này.
                        </td>
                      </tr>
                    ) : (
                      selectedTicket.stockIssues.map((si) => (
                        <tr key={si.id}>
                          <td className="fw-bold font-monospace">{si.code}</td>
                          <td>{new Date(si.createdAt).toLocaleString("vi-VN")}</td>
                          <td>
                            {si.items.map((it) => (
                              <div key={it.id}>
                                [{it.part.partCode}] {it.part.name} &times;{" "}
                                <strong>
                                  {it.quantity} {it.part.unit}
                                </strong>
                              </div>
                            ))}
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                si.status === "APPROVED"
                                  ? "bg-success"
                                  : si.status === "REJECTED"
                                  ? "bg-danger"
                                  : "bg-warning text-dark"
                              }`}
                            >
                              {si.status === "APPROVED"
                                ? "Đã duyệt & Trừ kho FIFO"
                                : si.status === "REJECTED"
                                ? "Từ chối"
                                : "Chờ Thủ kho / Kế toán duyệt"}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "attachments" && (
              <div>
                {/* Form Upload ảnh & tài liệu mới */}
                {isSelectedLocked ? (
                  <div className="alert alert-secondary py-2 px-3 small rounded border mb-3 d-flex align-items-center">
                    <i className="fas fa-lock me-2 text-secondary"></i>
                    <span>Phiếu kỹ thuật đã hoàn thành. Tính năng tải lên và xóa tài liệu/ảnh đã bị khóa (chỉ Giám đốc mới có quyền thay đổi).</span>
                  </div>
                ) : (
                  <div className="bg-light p-3 rounded border mb-3">
                    <div className="fw-bold small mb-2 d-flex align-items-center">
                      <i className="fas fa-cloud-upload-alt text-primary me-2"></i>
                      Đính kèm hình ảnh thực tế, chỉ số Counter hoặc biên bản cho phiếu kỹ thuật {selectedTicket.code}
                    </div>
                    <div className="row g-2 align-items-end">
                      <div className="col-md-4">
                        <label className="form-label small mb-1 fw-semibold text-muted">Phân loại tài liệu / ảnh</label>
                        <select
                          className="form-select form-select-sm"
                          value={attachmentKind}
                          onChange={(e) => setAttachmentKind(e.target.value as any)}
                          disabled={uploadingAttachment}
                        >
                          <option value="PHOTO">Ảnh chụp thực tế thiết bị</option>
                          <option value="COUNTER_PHOTO">Ảnh chỉ số Counter</option>
                          <option value="REPORT">Biên bản sửa chữa / nghiệm thu</option>
                          <option value="OTHER">Tài liệu khác</option>
                        </select>
                      </div>
                      <div className="col-md-8">
                        <label className="form-label small mb-1 fw-semibold text-muted">Chọn từ Thư viện Media hoặc tải file lên</label>
                        <div className="d-flex flex-wrap gap-2 align-items-center">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm d-inline-flex align-items-center gap-2 shadow-sm"
                            disabled={uploadingAttachment}
                            onClick={() => setShowMediaPicker(true)}
                          >
                            <i className="fas fa-photo-video"></i>
                            <span>Chọn từ Thư viện Media (Pickup)</span>
                          </button>

                          <label className="btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-1 cursor-pointer mb-0">
                            <i className="fas fa-upload"></i>
                            <span>Tải trực tiếp</span>
                            <input
                              type="file"
                              className="d-none"
                              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                              disabled={uploadingAttachment}
                              onChange={handleUploadAttachment}
                            />
                          </label>

                          {uploadingAttachment && (
                            <span className="text-primary small d-flex align-items-center">
                              <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                              Đang xử lý...
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Danh sách ảnh & tài liệu đã đính kèm */}
                {(!selectedTicket.attachments || selectedTicket.attachments.length === 0) ? (
                  <div className="text-center py-5 text-muted bg-white border rounded">
                    <i className="fas fa-images fa-3x mb-3 text-secondary opacity-50"></i>
                    <div className="fw-bold">Chưa có ảnh hoặc biên bản nào được đính kèm</div>
                    <div className="small">Kỹ thuật viên hoặc Điều phối có thể tải ảnh máy hỏng, ảnh counter hoặc biên bản nghiệm thu lên tại đây.</div>
                  </div>
                ) : (
                  <div className="row g-3">
                    {selectedTicket.attachments.map((att) => {
                      const kindMeta = TICKET_ATTACHMENT_KIND_LABELS[att.kind] || {
                        label: att.kind,
                        icon: "fas fa-paperclip",
                        badgeClass: "bg-secondary",
                      };
                      const isPdf = att.url.toLowerCase().endsWith(".pdf");
                      return (
                        <div key={att.id} className="col-6 col-md-4 col-lg-3">
                          <div className="card h-100 border shadow-sm rounded-3 overflow-hidden">
                            <div className="position-relative bg-light text-center" style={{ height: "160px" }}>
                              {isPdf ? (
                                <div className="d-flex flex-column align-items-center justify-content-center h-100 text-danger p-2">
                                  <i className="fas fa-file-pdf fa-4x mb-2"></i>
                                  <span className="small text-truncate w-100 px-2 fw-semibold text-dark">
                                    Tài liệu PDF
                                  </span>
                                </div>
                              ) : (
                                <img
                                  src={att.url}
                                  alt="Ticket attachment"
                                  className="w-100 h-100 object-fit-cover cursor-pointer"
                                  onClick={() => setPreviewImage(att.url)}
                                  title="Bấm để phóng to xem chi tiết"
                                />
                              )}
                              <span
                                className={`position-absolute top-0 start-0 m-2 badge ${kindMeta.badgeClass} shadow-sm`}
                                style={{ fontSize: "0.68rem" }}
                              >
                                <i className={`${kindMeta.icon} me-1`}></i>
                                {kindMeta.label}
                              </span>
                            </div>
                            <div className="card-body p-2 d-flex justify-content-between align-items-center bg-white border-top">
                              <span className="text-muted font-monospace" style={{ fontSize: "0.72rem" }}>
                                {new Date(att.createdAt).toLocaleDateString("vi-VN", {
                                  day: "2-digit",
                                  month: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                              <div className="btn-group btn-group-sm">
                                {isPdf ? (
                                  <a
                                    href={att.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn-outline-primary btn-sm py-0 px-2"
                                    title="Mở xem file PDF"
                                  >
                                    <i className="fas fa-external-link-alt"></i>
                                  </a>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-outline-primary btn-sm py-0 px-2"
                                    onClick={() => setPreviewImage(att.url)}
                                    title="Xem phóng to"
                                  >
                                    <i className="fas fa-search-plus"></i>
                                  </button>
                                )}
                                <a
                                  href={att.url}
                                  download
                                  className="btn btn-outline-secondary btn-sm py-0 px-2"
                                  title="Tải file về máy"
                                >
                                  <i className="fas fa-download"></i>
                                </a>
                                {!isSelectedLocked && (
                                  <button
                                    type="button"
                                    className="btn btn-outline-danger btn-sm py-0 px-2"
                                    onClick={() => handleDeleteAttachment(att.id)}
                                    title="Xóa file đính kèm"
                                  >
                                    <i className="fas fa-trash-alt"></i>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "logs" && (
              <div className="table-responsive">
                <table className="table table-sm table-bordered custom-dense-table mb-0">
                  <thead className="bg-dark text-white">
                    <tr>
                      <th style={{ width: "160px" }}>Thời gian</th>
                      <th style={{ width: "160px" }}>Người thực hiện</th>
                      <th style={{ width: "220px" }}>Chuyển trạng thái</th>
                      <th>Ghi chú chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTicket.logs.map((log) => (
                      <tr key={log.id}>
                        <td className="font-monospace">
                          {new Date(log.createdAt).toLocaleString("vi-VN")}
                        </td>
                        <td className="fw-semibold">{log.user?.name || "Hệ thống"}</td>
                        <td>
                          {log.fromStatus ? (
                            <>
                              <span className="badge bg-light text-dark border">
                                {TICKET_STATUS_LABELS[log.fromStatus] || log.fromStatus}
                              </span>{" "}
                              &rarr;{" "}
                            </>
                          ) : null}
                          <span className={`badge ${getStatusBadge(log.toStatus)}`}>
                            {TICKET_STATUS_LABELS[log.toStatus] || log.toStatus}
                          </span>
                        </td>
                        <td>{log.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </ModalShell>
      {/* Modal Phóng to xem ảnh (Lightbox) */}
      <ModalShell
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        title="Xem ảnh chi tiết"
        size="lg"
      >
        {previewImage && (
          <div className="text-center p-1">
            <img
              src={previewImage}
              alt="Preview"
              className="img-fluid rounded border shadow-sm"
              style={{ maxHeight: "75vh" }}
            />
            <div className="mt-2 d-flex justify-content-center gap-2">
              <a
                href={previewImage}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary btn-sm fw-bold"
              >
                <i className="fas fa-external-link-alt me-1"></i> Mở ảnh trong tab mới
              </a>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setPreviewImage(null)}
              >
                Đóng
              </button>
            </div>
          </div>
        )}
      </ModalShell>
      {/* Modal Thư viện Media Pickup */}
      <FileManager
        isOpen={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        mode="all"
        multiSelect={true}
        onSelectFiles={handleSelectMediaFiles}
        onSelectFile={(url) => handleSelectMediaFiles([url])}
        zIndex={1150}
        title={`Chọn tài liệu / hình ảnh đính kèm (${TICKET_ATTACHMENT_KIND_LABELS[attachmentKind]?.label || attachmentKind})`}
      />
    </div>
  );
}
