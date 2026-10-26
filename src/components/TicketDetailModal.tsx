"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import { Loading } from "@/components/Loading";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import FileManager from "@/components/FileManager";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
  TICKET_ATTACHMENT_KIND_LABELS,
} from "@/lib/labels";

export interface TicketAttachmentItem {
  id: string;
  ticketId: string;
  url: string;
  kind: string;
  createdAt: string;
}

export interface TicketDetailData {
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
    locationNote?: string | null;
  };
  assignee?: { id: string; name: string; phone: string | null; region: string | null } | null;
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

export interface TechOption {
  id: string;
  name: string;
  region: string | null;
  skills?: string[];
  openTicketsCount?: number;
}

export interface PartOption {
  id: string;
  partCode: string;
  name: string;
  unit: string;
  currentQuantity: number;
}

export interface CurrentUser {
  id: string;
  name: string;
  role: string;
}

interface TicketDetailModalProps {
  ticketId: string | null;
  onClose: () => void;
  onTicketUpdated?: () => void;
  currentUser?: CurrentUser | null;
  technicians?: TechOption[];
  parts?: PartOption[];
}

export function TicketDetailModal({
  ticketId,
  onClose,
  onTicketUpdated,
  currentUser: initialUser,
  technicians: initialTechs,
  parts: initialParts,
}: TicketDetailModalProps) {
  const [ticket, setTicket] = useState<TicketDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"workflow" | "parts" | "logs" | "attachments">("workflow");

  // Auxiliary data
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(initialUser || null);
  const [techList, setTechList] = useState<TechOption[]>(initialTechs || []);
  const [partList, setPartList] = useState<PartOption[]>(initialParts || []);

  // Form states
  const [assignTechId, setAssignTechId] = useState("");
  const [diagnosisInput, setDiagnosisInput] = useState("");
  const [statusInput, setStatusInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [counterAtCloseInput, setCounterAtCloseInput] = useState<string>("");
  const [signatureInput, setSignatureInput] = useState("");

  // Submitting states
  const [submitting, setSubmitting] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [attachmentKind, setAttachmentKind] = useState<"PHOTO" | "COUNTER_PHOTO" | "REPORT" | "OTHER">("PHOTO");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Quick part request
  const [reqPartId, setReqPartId] = useState("");
  const [reqPartQty, setReqPartQty] = useState(1);
  const [reqPartNote, setReqPartNote] = useState("");

  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN";
  const canAssign = currentUser?.role === "SUPER_ADMIN" || currentUser?.role === "DISPATCHER";
  const isTicketCompleted = ticket?.status === "COMPLETED";
  const isLocked = isTicketCompleted && !isSuperAdmin;

  // Load auxiliary data if missing
  useEffect(() => {
    if (!currentUser) {
      fetch("/api/auth/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((me) => me && setCurrentUser(me))
        .catch(() => null);
    }
    if (techList.length === 0) {
      fetch("/api/dispatch/technicians")
        .then((r) => (r.ok ? r.json() : []))
        .then((techs) => Array.isArray(techs) && setTechList(techs))
        .catch(() => null);
    }
    if (partList.length === 0) {
      fetch("/api/parts?pageSize=100")
        .then((r) => (r.ok ? r.json() : []))
        .then((p) => {
          const list = Array.isArray(p) ? p : p?.items || [];
          setPartList(list);
        })
        .catch(() => null);
    }
  }, []);

  // Sync props if provided externally
  useEffect(() => {
    if (initialUser) setCurrentUser(initialUser);
  }, [initialUser]);
  useEffect(() => {
    if (initialTechs && initialTechs.length > 0) setTechList(initialTechs);
  }, [initialTechs]);
  useEffect(() => {
    if (initialParts && initialParts.length > 0) setPartList(initialParts);
  }, [initialParts]);

  const loadTicketDetail = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}`);
      if (!res.ok) throw new Error("Không tải được chi tiết phiếu kỹ thuật");
      const data: TicketDetailData = await res.json();
      setTicket(data);
      setAssignTechId(data.assigneeId || "");
      setDiagnosisInput(data.diagnosis || "");
      setStatusInput(data.status);
      setNoteInput("");
      setCounterAtCloseInput(
        data.counterAtClose != null
          ? String(data.counterAtClose)
          : String(data.equipment.currentCounter || 0)
      );
      const sig = data.customerSignature;
      setSignatureInput(
        sig && !sig.includes("[DEMO_SIGNATURE]") && !sig.includes("...")
          ? sig
          : `Đã xác nhận - ${data.customer.name}`
      );
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải chi tiết phiếu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId) {
      setActiveTab("workflow");
      loadTicketDetail(ticketId);
    } else {
      setTicket(null);
    }
  }, [ticketId]);

  const handleTicketAction = async (payload: Record<string, unknown>, successMsg: string) => {
    if (!ticket) return;
    if (ticket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền chỉnh sửa!");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Cập nhật thất bại");
      toast.success(successMsg);
      await loadTicketDetail(ticket.id);
      onTicketUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi xử lý phiếu");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestPartForTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !reqPartId || reqPartQty < 1) {
      toast.warning("Vui lòng chọn linh kiện và số lượng hợp lệ");
      return;
    }
    if (ticket.status === "COMPLETED" && !isSuperAdmin) {
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
          ticketId: ticket.id,
          note: reqPartNote || `Yêu cầu vật tư cho phiếu ${ticket.code}`,
          items: [{ partId: reqPartId, quantity: Number(reqPartQty) }],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể tạo phiếu yêu cầu vật tư");

      if (ticket.status !== "COMPLETED") {
        await fetch(`/api/tickets/${ticket.id}`, {
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
      await loadTicketDetail(ticket.id);
      onTicketUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi yêu cầu linh kiện");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ticket) return;
    if (ticket.status === "COMPLETED" && !isSuperAdmin) {
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

      const attRes = await fetch(`/api/tickets/${ticket.id}/attachments`, {
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
      await loadTicketDetail(ticket.id);
      onTicketUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi đính kèm file");
    } finally {
      setUploadingAttachment(false);
      e.target.value = "";
    }
  };

  const handleSelectMediaFiles = async (urls: string[]) => {
    if (!ticket || urls.length === 0) return;
    if (ticket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền tải tài liệu");
      return;
    }
    setUploadingAttachment(true);
    try {
      let count = 0;
      for (const url of urls) {
        const attRes = await fetch(`/api/tickets/${ticket.id}/attachments`, {
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
        await loadTicketDetail(ticket.id);
        onTicketUpdated?.();
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
    if (!ticket) return;
    if (ticket.status === "COMPLETED" && !isSuperAdmin) {
      toast.warning("Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc mới có quyền xóa tài liệu");
      return;
    }
    if (!confirm("Bạn có chắc chắn muốn xóa file đính kèm này?")) return;
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/attachments?attachmentId=${attId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Không thể xóa file đính kèm");
      toast.success("Đã xóa file đính kèm");
      await loadTicketDetail(ticket.id);
      onTicketUpdated?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi xóa file");
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
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

  if (!ticketId) return null;

  return (
    <>
      <ModalShell
        open={Boolean(ticketId)}
        onClose={onClose}
        title={
          ticket ? (
            <div className="d-flex align-items-center gap-2 flex-wrap">
              <span className="fw-bold">
                Xử lý Phiếu <span className="font-monospace text-primary">{ticket.code}</span>
              </span>
              <span className={`badge ${getStatusBadge(ticket.status)}`} style={{ fontSize: "12px" }}>
                {TICKET_STATUS_LABELS[ticket.status] || ticket.status}
              </span>
              <span
                className={`badge ${
                  ticket.priority === "URGENT"
                    ? "bg-danger"
                    : ticket.priority === "HIGH"
                    ? "bg-warning text-dark"
                    : "bg-secondary"
                }`}
                style={{ fontSize: "11px" }}
              >
                {TICKET_PRIORITY_LABELS[ticket.priority] || ticket.priority}
              </span>
            </div>
          ) : (
            "Đang tải hồ sơ phiếu kỹ thuật..."
          )
        }
        size="xl"
      >
        {loading || !ticket ? (
          <Loading text="Đang tải hồ sơ phiếu kỹ thuật..." />
        ) : (
          <div>
            {/* Header info tóm tắt */}
            <div className="bg-light p-3 rounded border mb-3">
              <div className="row g-2 small">
                <div className="col-md-4">
                  <div className="text-muted fw-semibold">Khách hàng & Địa chỉ:</div>
                  <div className="fw-bold text-dark">{ticket.customer.name}</div>
                  <div className="text-secondary">{ticket.customer.address}</div>
                  <div className="d-flex align-items-center gap-1">
                    <span>SĐT:</span>
                    {ticket.customer.phone ? (
                      ticket.customer.phone.includes("*") ? (
                        <span className="text-muted font-monospace" title="Số điện thoại bị ẩn do tài khoản chưa được cấp quyền xem SĐT">
                          <i className="fas fa-lock text-muted me-1 small"></i>
                          {ticket.customer.phone}
                        </span>
                      ) : (
                        <a href={`tel:${ticket.customer.phone}`} className="fw-bold text-decoration-none text-primary">
                          {ticket.customer.phone}
                        </a>
                      )
                    ) : (
                      <span className="text-muted fst-italic">Chưa có</span>
                    )}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted fw-semibold">Thiết bị & Counter hiện tại:</div>
                  <div className="fw-bold text-primary">
                    {ticket.equipment.model} (SN: {ticket.equipment.serialNumber})
                  </div>
                  <div>
                    Counter:{" "}
                    <strong className="font-monospace">
                      {ticket.equipment.currentCounter?.toLocaleString("vi-VN") || 0}
                    </strong>
                  </div>
                  <div className="text-danger-emphasis">
                    <i className="fas fa-exclamation-circle me-1"></i>
                    {TICKET_TYPE_LABELS[ticket.type] || ticket.type}: {ticket.description}
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="text-muted fw-semibold">Điều phối & Tiến độ SLA:</div>
                  <div>
                    KTV:{" "}
                    <strong>{ticket.assignee ? ticket.assignee.name : "Chưa giao"}</strong>
                  </div>
                  <div>
                    Check-in GPS:{" "}
                    {ticket.checkInAt ? (
                      <span className="text-success fw-semibold">
                        {new Date(ticket.checkInAt).toLocaleString("vi-VN")} (
                        {ticket.checkInLat?.toFixed(3)}, {ticket.checkInLng?.toFixed(3)})
                      </span>
                    ) : (
                      <span className="text-warning-emphasis">Chưa check-in</span>
                    )}
                  </div>
                  {ticket.slaDueAt && (
                    <div>
                      Hạn SLA:{" "}
                      <strong
                        className={
                          (ticket.resolvedAt
                            ? new Date(ticket.resolvedAt).getTime() > new Date(ticket.slaDueAt).getTime()
                            : new Date(ticket.slaDueAt).getTime() < Date.now())
                            ? "text-danger"
                            : "text-dark"
                        }
                      >
                        {new Date(ticket.slaDueAt).toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </strong>
                    </div>
                  )}
                  {ticket.resolvedAt && (
                    <div className="text-success fw-bold">
                      Hoàn thành:{" "}
                      {new Date(ticket.resolvedAt).toLocaleString("vi-VN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Thông báo nếu đã hoàn thành */}
            {isTicketCompleted && (
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
                      <strong>Giám đốc (Super Admin)</strong> mới có quyền điều chỉnh.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Thanh điều hướng Tabs & Actions */}
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3 border-bottom pb-2">
              <ul className="nav nav-tabs border-bottom-0 mb-0">
                <li className="nav-item">
                  <button
                    type="button"
                    className={`nav-link py-1 px-3 ${activeTab === "workflow" ? "active fw-bold" : ""}`}
                    onClick={() => setActiveTab("workflow")}
                  >
                    <i className="fas fa-tasks me-1"></i> Quy trình xử lý & Nghiệm thu
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    type="button"
                    className={`nav-link py-1 px-3 ${activeTab === "parts" ? "active fw-bold" : ""}`}
                    onClick={() => setActiveTab("parts")}
                  >
                    <i className="fas fa-cogs me-1"></i> Linh kiện xuất kho ({ticket.stockIssues.length})
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    type="button"
                    className={`nav-link py-1 px-3 ${activeTab === "logs" ? "active fw-bold" : ""}`}
                    onClick={() => setActiveTab("logs")}
                  >
                    <i className="fas fa-history me-1"></i> Nhật ký tiến độ ({ticket.logs.length})
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    type="button"
                    className={`nav-link py-1 px-3 ${activeTab === "attachments" ? "active fw-bold" : ""}`}
                    onClick={() => setActiveTab("attachments")}
                  >
                    <i className="fas fa-paperclip me-1"></i> Ảnh & Biên bản ({ticket.attachments?.length || 0})
                  </button>
                </li>
              </ul>

              <div className="d-flex gap-2">
                <a
                  href={`/tickets/${ticket.id}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline-dark fw-bold d-flex align-items-center gap-1 shadow-sm px-3"
                >
                  <i className="fas fa-print text-primary"></i>
                  <span>In Biên Bản (A4)</span>
                </a>
                <Link
                  href={`/tickets?ticketId=${ticket.id}`}
                  target="_blank"
                  className="btn btn-sm btn-outline-secondary d-flex align-items-center gap-1 shadow-sm"
                  title="Mở toàn trang trong danh sách phiếu"
                >
                  <i className="fas fa-external-link-alt"></i>
                  <span>Mở trang Phiếu</span>
                </Link>
              </div>
            </div>

            {/* Tab 1: Workflow */}
            {activeTab === "workflow" && (
              <div className="row g-3">
                {/* Bước 1: Giao việc & Check-in */}
                <div className="col-md-6">
                  <div className="card h-100 border">
                    <div className="card-header bg-light py-2 fw-bold small">
                      1. Điều phối KTV & Check-in GPS
                    </div>
                    <div className="card-body">
                      {canAssign && (!isTicketCompleted || isSuperAdmin) ? (
                        <div className="mb-3">
                          <label className="form-label small fw-bold">Kỹ thuật viên phụ trách</label>
                          <div className="input-group input-group-sm">
                            <select
                              className="form-select"
                              value={assignTechId}
                              disabled={isLocked}
                              onChange={(e) => setAssignTechId(e.target.value)}
                            >
                              <option value="">-- Chọn KTV --</option>
                              {techList.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name} ({t.region || "Toàn vùng"}
                                  {t.openTicketsCount != null ? ` - ${t.openTicketsCount} việc` : ""})
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              className="btn btn-outline-primary"
                              disabled={submitting || isLocked || !assignTechId}
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
                              {ticket.assignee?.name || "Chưa phân công"}
                            </div>
                            <span className="badge bg-secondary-subtle text-secondary small">
                              {isTicketCompleted ? "Phiếu đã đóng" : "Không có quyền giao việc"}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="d-flex justify-content-between align-items-center border-top pt-3">
                        <div className="small">
                          <div className="fw-bold">Xác nhận Check-in (GPS)</div>
                          <div className="text-muted">Ghi nhận thời gian bắt đầu xử lý thực tế</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm btn-info text-white"
                          disabled={
                            submitting ||
                            ticket.status === "COMPLETED" ||
                            ticket.status === "CANCELLED" ||
                            isLocked
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

                {/* Bước 2: Cập nhật chẩn đoán & trạng thái */}
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
                            isLocked
                              ? "Phiếu đã hoàn thành (Khóa chỉnh sửa)"
                              : "VD: Mòn trống hình + rách bao lụa sấy, cần xuất linh kiện thay thế..."
                          }
                          value={diagnosisInput}
                          disabled={isLocked}
                          onChange={(e) => setDiagnosisInput(e.target.value)}
                        />
                      </div>
                      <div className="row g-2 align-items-end">
                        <div className="col-md-5">
                          <label className="form-label small fw-bold">Trạng thái phiếu</label>
                          <select
                            className="form-select form-select-sm"
                            value={statusInput}
                            disabled={isLocked}
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
                              placeholder={isLocked ? "Phiếu đã hoàn thành..." : "Ghi chú tiến độ..."}
                              value={noteInput}
                              disabled={isLocked}
                              onChange={(e) => setNoteInput(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={submitting || isLocked}
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

                {/* Bước 3: Chốt Counter & Ký nhận */}
                <div className="col-12">
                  <div className="card border-success">
                    <div className="card-header bg-success-subtle text-success-emphasis py-2 fw-bold small d-flex justify-content-between align-items-center">
                      <span>
                        <i className="fas fa-check-double me-1"></i> 3. Nghiệm thu hoàn thành, Chốt Counter & Ký xác nhận khách hàng
                      </span>
                      {ticket.status === "COMPLETED" && (
                        <span className="badge bg-success">Phiếu đã hoàn thành</span>
                      )}
                    </div>
                    <div className="card-body">
                      <div className="row g-3 align-items-end">
                        <div className="col-md-4">
                          <label className="form-label small fw-bold">
                            Chỉ số Counter khi đóng phiếu (&ge;{" "}
                            {ticket.equipment.currentCounter?.toLocaleString("vi-VN") || 0})
                          </label>
                          <input
                            type="number"
                            className="form-control form-control-sm font-monospace mb-2"
                            min={ticket.equipment.currentCounter || 0}
                            value={counterAtCloseInput}
                            disabled={isLocked}
                            onChange={(e) => setCounterAtCloseInput(e.target.value)}
                          />
                          <label className="form-label small fw-bold">Ghi chú người ký nghiệm thu</label>
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            placeholder="Nhập họ tên người ký nhận..."
                            value={
                              signatureInput.startsWith("data:image/")
                                ? `Đã ký điện tử - ${ticket.customer.name}`
                                : signatureInput
                            }
                            disabled={isLocked}
                            onChange={(e) => setSignatureInput(e.target.value)}
                          />
                        </div>
                        <div className="col-md-5">
                          <label className="form-label small fw-bold">
                            Chữ ký điện tử của Khách hàng (Canvas cảm ứng/chuột)
                          </label>
                          <SignatureCanvas
                            value={signatureInput}
                            disabled={isLocked || (!isSuperAdmin && ticket.status === "COMPLETED")}
                            onChange={(dataUrl) =>
                              setSignatureInput(dataUrl || `Đã xác nhận - ${ticket.customer.name}`)
                            }
                          />
                        </div>
                        <div className="col-md-3">
                          {isTicketCompleted ? (
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
                                      counterAtClose: counterAtCloseInput ? Number(counterAtCloseInput) : null,
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
                              <button type="button" className="btn btn-sm btn-secondary w-100 py-2 fw-bold" disabled>
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
                                    diagnosis: diagnosisInput || "Đã khắc phục triệt để và bàn giao máy",
                                    counterAtClose: counterAtCloseInput ? Number(counterAtCloseInput) : null,
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

            {/* Tab 2: Parts */}
            {activeTab === "parts" && (
              <div>
                {isLocked ? (
                  <div className="alert alert-secondary py-2 px-3 small rounded border mb-3 d-flex align-items-center">
                    <i className="fas fa-lock me-2 text-secondary"></i>
                    <span>Phiếu kỹ thuật đã hoàn thành. Tính năng xin xuất kho linh kiện đã khóa (chỉ Giám đốc mới có quyền tạo yêu cầu).</span>
                  </div>
                ) : (
                  <form onSubmit={handleRequestPartForTicket} className="bg-light p-3 rounded border mb-3">
                    <div className="fw-bold small mb-2">
                      <i className="fas fa-plus-circle text-primary me-1"></i> Tạo nhanh yêu cầu xuất linh kiện cho phiếu {ticket.code}
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
                          {partList.map((p) => (
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
                        <button type="submit" className="btn btn-sm btn-warning w-100 fw-semibold" disabled={submitting}>
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
                    {ticket.stockIssues.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-muted py-3">
                          Chưa có phiếu xuất linh kiện nào gắn với phiếu kỹ thuật này.
                        </td>
                      </tr>
                    ) : (
                      ticket.stockIssues.map((si) => (
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

            {/* Tab 3: Attachments */}
            {activeTab === "attachments" && (
              <div>
                {isLocked ? (
                  <div className="alert alert-secondary py-2 px-3 small rounded border mb-3 d-flex align-items-center">
                    <i className="fas fa-lock me-2 text-secondary"></i>
                    <span>Phiếu kỹ thuật đã hoàn thành. Tính năng tải lên và xóa tài liệu/ảnh đã bị khóa.</span>
                  </div>
                ) : (
                  <div className="bg-light p-3 rounded border mb-3">
                    <div className="fw-bold small mb-2 d-flex align-items-center">
                      <i className="fas fa-cloud-upload-alt text-primary me-2"></i>
                      Đính kèm hình ảnh thực tế, chỉ số Counter hoặc biên bản cho phiếu {ticket.code}
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
                              accept="image/*,.pdf,.doc,.docx"
                              disabled={uploadingAttachment}
                              onChange={handleUploadAttachment}
                            />
                          </label>

                          {uploadingAttachment && (
                            <div className="text-primary small d-flex align-items-center">
                              <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                              <span>Đang xử lý...</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    {uploadingAttachment && (
                      <div className="mt-2 text-primary small d-flex align-items-center gap-2">
                        <div className="spinner-border spinner-border-sm" role="status"></div>
                        <span>Đang tải file lên máy chủ...</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Danh sách file đính kèm */}
                {(!ticket.attachments || ticket.attachments.length === 0) ? (
                  <div className="text-center py-4 text-muted bg-light rounded border">
                    <i className="fas fa-images fa-2x mb-2 text-secondary opacity-50"></i>
                    <div>Chưa có tài liệu hoặc hình ảnh đính kèm cho phiếu này.</div>
                  </div>
                ) : (
                  <div className="row g-3">
                    {ticket.attachments.map((att) => {
                      const kindCfg =
                        TICKET_ATTACHMENT_KIND_LABELS[att.kind] ||
                        TICKET_ATTACHMENT_KIND_LABELS.OTHER;
                      const isImage = att.url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i);

                      return (
                        <div key={att.id} className="col-sm-6 col-md-4 col-lg-3">
                          <div className="card h-100 shadow-sm border">
                            {isImage ? (
                              <div
                                style={{
                                  height: "140px",
                                  backgroundColor: "#f8f9fa",
                                  cursor: "pointer",
                                  position: "relative",
                                  overflow: "hidden",
                                }}
                                onClick={() => setPreviewImage(att.url)}
                                title="Nhấp để phóng to ảnh"
                              >
                                <img
                                  src={att.url}
                                  alt="Attachment"
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                  }}
                                />
                                <div
                                  className="position-absolute bottom-0 end-0 bg-dark bg-opacity-75 text-white p-1 rounded-start small"
                                  style={{ fontSize: "11px" }}
                                >
                                  <i className="fas fa-search-plus me-1"></i> Xem
                                </div>
                              </div>
                            ) : (
                              <div
                                className="d-flex align-items-center justify-content-center bg-light"
                                style={{ height: "140px" }}
                              >
                                <i className="fas fa-file-alt fa-3x text-secondary opacity-50"></i>
                              </div>
                            )}
                            <div className="card-body p-2 d-flex flex-column justify-content-between">
                              <div>
                                <span className={`badge ${kindCfg.badgeClass} mb-1`} style={{ fontSize: "11px" }}>
                                  <i className={`${kindCfg.icon} me-1`}></i>
                                  {kindCfg.label}
                                </span>
                                <div className="text-muted" style={{ fontSize: "11px" }}>
                                  {new Date(att.createdAt).toLocaleString("vi-VN")}
                                </div>
                              </div>
                              <div className="mt-2 pt-2 border-top d-flex justify-content-between align-items-center">
                                <a
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  download
                                  className="btn btn-outline-secondary btn-sm py-0 px-2"
                                  title="Tải file về máy"
                                >
                                  <i className="fas fa-download"></i>
                                </a>
                                {!isLocked && (
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

            {/* Tab 4: Logs */}
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
                    {ticket.logs.map((log) => (
                      <tr key={log.id}>
                        <td className="font-monospace">{new Date(log.createdAt).toLocaleString("vi-VN")}</td>
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

      {/* Lightbox xem ảnh phóng to */}
      <ModalShell
        open={Boolean(previewImage)}
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
      {ticket && (
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
      )}
    </>
  );
}

export default TicketDetailModal;
