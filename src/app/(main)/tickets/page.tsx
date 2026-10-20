"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import { ActiveFilterChips, type FilterChip } from "@/components/ActiveFilterChips";
import { Loading } from "@/components/Loading";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import { exportToCsv } from "@/lib/csv";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_SOURCE_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
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
  customer: { id: string; name: string; phone: string; address: string };
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    brand: string | null;
    status: string;
    currentCounter: number;
    locationNote: string | null;
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

export default function TicketsPage() {
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
  const [activeTab, setActiveTab] = useState<"workflow" | "parts" | "logs">("workflow");

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

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [tkRes, custRes, eqRes, techRes, partRes] = await Promise.all([
        fetch("/api/tickets"),
        fetch("/api/customers?pageSize=100"),
        fetch("/api/equipment?pageSize=100"),
        fetch("/api/dispatch/technicians"),
        fetch("/api/parts?pageSize=100"),
      ]);
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
      toast.error("Lỗi tải danh sách phiếu công việc");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
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
      setSignatureInput(
        detail.customerSignature || `Đã xác nhận - ${detail.customer.name}`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải chi tiết");
    } finally {
      setLoadingDetail(false);
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter && t.status !== statusFilter) return false;
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
    if (assigneeFilter) {
      const techName =
        assigneeFilter === "UNASSIGNED"
          ? "Chưa phân công"
          : technicians.find((x) => x.id === assigneeFilter)?.name || assigneeFilter;
      chips.push({ key: "assignee", label: "KTV", value: techName });
    }
    return chips;
  }, [q, statusFilter, priorityFilter, typeFilter, assigneeFilter, technicians]);

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
      await fetch(`/api/tickets/${selectedTicket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "UPDATE",
          status: "WAITING_PARTS",
          note: `Tạo phiếu xin xuất linh kiện ${body.code}`,
        }),
      });

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
      "danh-sach-ticket.csv",
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
        "Mô tả sự cố",
      ],
      filteredTickets.map((t) => [
        t.code,
        new Date(t.createdAt).toLocaleString("vi-VN"),
        TICKET_TYPE_LABELS[t.type] || t.type,
        TICKET_PRIORITY_LABELS[t.priority] || t.priority,
        t.customer.name,
        t.equipment.model,
        t.equipment.serialNumber,
        t.assignee?.name || "Chưa giao",
        TICKET_STATUS_LABELS[t.status] || t.status,
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

  return (
    <div className="container-fluid px-0">
      {/* Header Bar chuẩn HoaGiang */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-white p-3 rounded shadow-sm border-bottom">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
            <i className="fas fa-exclamation-triangle text-danger"></i>
            <span>Phiếu yêu cầu & Sự cố (Ticket)</span>
          </h5>
          <div className="d-flex gap-2 flex-wrap">
            <span className="badge bg-light text-dark border">
              Tổng: <strong>{stats.total}</strong>
            </span>
            <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
              Chờ điều phối: <strong>{stats.pending}</strong>
            </span>
            <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
              Đang xử lý: <strong>{stats.inProgress}</strong>
            </span>
            <span className="badge bg-warning-subtle text-dark border border-warning-subtle">
              Chờ linh kiện: <strong>{stats.waitingParts}</strong>
            </span>
            <span className="badge bg-success-subtle text-success border border-success-subtle">
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

          <Link href="/dispatch" className="btn btn-sm btn-outline-primary">
            <i className="fas fa-map-marked-alt me-1"></i> Bảng Điều phối
          </Link>

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
          <div className="col-md-3">
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

          <div className="col-md-2">
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
        </div>

        <ActiveFilterChips
          chips={filterChips}
          onRemove={handleRemoveChip}
          onClearAll={clearAllFilters}
        />
      </div>

      {/* Main Content */}
      {loading ? (
        <Loading text="Đang tải danh sách phiếu công việc..." />
      ) : viewMode === "table" ? (
        <div
          className="table-responsive bg-white rounded shadow-sm border"
          style={{ maxHeight: "calc(100vh - 250px)" }}
        >
          <table className="table table-hover table-bordered mb-0 custom-dense-table table-sticky-header align-middle">
            <thead className="bg-dark text-white">
              <tr>
                <th style={{ width: "120px" }}>Mã phiếu</th>
                <th style={{ width: "130px" }}>Loại & Ưu tiên</th>
                <th>Khách hàng & Sự cố</th>
                <th>Thiết bị & Vị trí</th>
                <th style={{ width: "160px" }}>Kỹ thuật viên</th>
                <th style={{ width: "150px" }}>Trạng thái / SLA</th>
                <th className="text-center" style={{ width: "110px" }}>
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    Không có phiếu yêu cầu nào phù hợp bộ lọc.
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
                      <td className="fw-bold font-monospace">
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            openDetailModal(t.id);
                          }}
                          className="text-decoration-none text-primary"
                        >
                          {t.code}
                        </a>
                        <div className="text-muted" style={{ fontSize: "11px" }}>
                          {new Date(t.createdAt).toLocaleDateString("vi-VN")}
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold" style={{ fontSize: "12px" }}>
                          {TICKET_TYPE_LABELS[t.type] || t.type}
                        </div>
                        <span className={`badge ${getPriorityBadge(t.priority)}`}>
                          {TICKET_PRIORITY_LABELS[t.priority] || t.priority}
                        </span>
                      </td>
                      <td>
                        <div className="fw-bold text-dark">{t.customer.name}</div>
                        <div className="text-muted small text-truncate" style={{ maxWidth: "320px" }}>
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
                        {t.equipment.department && (
                          <div className="small text-secondary">
                            <i className="fas fa-map-pin me-1"></i>
                            {t.equipment.department.building?.branch?.name} &rsaquo;{" "}
                            {t.equipment.department.building?.name} &rsaquo;{" "}
                            {t.equipment.department.name}
                          </div>
                        )}
                      </td>
                      <td>
                        {t.assignee ? (
                          <div>
                            <div className="fw-semibold text-dark">
                              <i className="fas fa-user-cog text-primary me-1"></i>
                              {t.assignee.name}
                            </div>
                            <small className="text-muted">{t.assignee.region || "Đa vùng"}</small>
                            {t.checkInAt && (
                              <div className="text-success" style={{ fontSize: "11px" }}>
                                <i className="fas fa-map-marker-alt me-1"></i>Đã check-in GPS
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="badge bg-secondary-subtle text-secondary">
                            Chưa giao KTV
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadge(t.status)}`}>
                          {TICKET_STATUS_LABELS[t.status] || t.status}
                        </span>
                        {t.slaDueAt && (
                          <div
                            className={`mt-1 ${
                              isOverdue ? "text-danger fw-bold" : "text-muted"
                            }`}
                            style={{ fontSize: "11px" }}
                          >
                            <i className="far fa-clock me-1"></i>
                            SLA: {new Date(t.slaDueAt).toLocaleString("vi-VN")}
                          </div>
                        )}
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
        /* Chế độ Thẻ Mobile cho Kỹ thuật viên hiện trường */
        <div className="row g-3">
          {filteredTickets.map((t) => (
            <div key={t.id} className="col-md-6 col-lg-4">
              <div className="card shadow-sm h-100 border">
                <div className="card-header bg-white d-flex justify-content-between align-items-center py-2">
                  <span className="fw-bold font-monospace text-primary">{t.code}</span>
                  <div className="d-flex gap-1">
                    <span className={`badge ${getPriorityBadge(t.priority)}`}>
                      {TICKET_PRIORITY_LABELS[t.priority]}
                    </span>
                    <span className={`badge ${getStatusBadge(t.status)}`}>
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
                    <span>
                      <i className="fas fa-user-wrench me-1"></i>
                      {t.assignee ? t.assignee.name : "Chưa phân công"}
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
                    <i className="fas fa-play-circle me-1"></i> Mở thao tác KTV hiện trường
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
        title="Tiếp nhận & Tạo phiếu yêu cầu (Ticket)"
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
          <Loading text="Đang tải hồ sơ phiếu công việc..." />
        ) : (
          <div>
            {/* Thông tin tóm tắt đầu phiếu */}
            <div className="bg-light p-3 rounded border mb-3">
              <div className="row g-2 small">
                <div className="col-md-4">
                  <div className="text-muted">Khách hàng & Địa chỉ:</div>
                  <div className="fw-bold text-dark">{selectedTicket.customer.name}</div>
                  <div>{selectedTicket.customer.address}</div>
                  <div>SĐT: {selectedTicket.customer.phone}</div>
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
                  <div className="text-muted">Điều phối & Hiện trường:</div>
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
                        {new Date(selectedTicket.checkInAt).toLocaleString("vi-VN")} (
                        {selectedTicket.checkInLat?.toFixed(3)},{" "}
                        {selectedTicket.checkInLng?.toFixed(3)})
                      </span>
                    ) : (
                      <span className="text-warning-emphasis">Chưa check-in</span>
                    )}
                  </div>
                  {selectedTicket.resolvedAt && (
                    <div className="text-success fw-bold">
                      Hoàn thành: {new Date(selectedTicket.resolvedAt).toLocaleString("vi-VN")}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Tabs điều hướng trong Modal */}
            <ul className="nav nav-tabs mb-3">
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
            </ul>

            {activeTab === "workflow" && (
              <div className="row g-3">
                {/* Bước 1 & 2: Phân công KTV + Check-in GPS */}
                <div className="col-md-6">
                  <div className="card h-100 border">
                    <div className="card-header bg-light py-2 fw-bold small">
                      1. Điều phối KTV & Check-in GPS Hiện trường
                    </div>
                    <div className="card-body">
                      <div className="mb-3">
                        <label className="form-label small fw-bold">Kỹ thuật viên phụ trách</label>
                        <div className="input-group input-group-sm">
                          <select
                            className="form-select"
                            value={assignTechId}
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
                            disabled={submitting || !assignTechId}
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

                      <div className="d-flex justify-content-between align-items-center border-top pt-3">
                        <div className="small">
                          <div className="fw-bold">Xác nhận đến hiện trường (GPS)</div>
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
                            selectedTicket.status === "CANCELLED"
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
                          placeholder="VD: Mòn trống hình + rách bao lụa sấy, cần xuất linh kiện thay thế..."
                          value={diagnosisInput}
                          onChange={(e) => setDiagnosisInput(e.target.value)}
                        />
                      </div>
                      <div className="row g-2 align-items-end">
                        <div className="col-md-5">
                          <label className="form-label small fw-bold">Trạng thái phiếu</label>
                          <select
                            className="form-select form-select-sm"
                            value={statusInput}
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
                              placeholder="Ghi chú tiến độ..."
                              value={noteInput}
                              onChange={(e) => setNoteInput(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={submitting}
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
                            onChange={(e) => setSignatureInput(e.target.value)}
                          />
                        </div>
                        <div className="col-md-5">
                          <label className="form-label small fw-bold">
                            Chữ ký điện tử của Khách hàng (Canvas cảm ứng/chuột)
                          </label>
                          <SignatureCanvas
                            value={signatureInput}
                            disabled={selectedTicket.status === "COMPLETED"}
                            onChange={(dataUrl) =>
                              setSignatureInput(
                                dataUrl || `Đã xác nhận - ${selectedTicket.customer.name}`
                              )
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          <button
                            type="button"
                            className="btn btn-sm btn-success w-100 py-2 fw-bold"
                            disabled={submitting || selectedTicket.status === "COMPLETED"}
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
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "parts" && (
              <div>
                <form
                  onSubmit={handleRequestPartForTicket}
                  className="bg-light p-3 rounded border mb-3"
                >
                  <div className="fw-bold small mb-2">
                    <i className="fas fa-plus-circle text-primary me-1"></i> Tạo nhanh yêu cầu xuất
                    linh kiện kỹ thuật cho phiếu {selectedTicket.code}
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
                          Chưa có phiếu xuất linh kiện nào gắn với Ticket này.
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
    </div>
  );
}
