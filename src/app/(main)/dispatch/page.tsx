"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { Loading } from "@/components/Loading";
import { TicketDetailModal } from "@/components/TicketDetailModal";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
} from "@/lib/labels";
import {
  getDirectionsUrl,
  calculateDistanceKm,
  estimateCoordinatesFromAddress,
} from "@/lib/location";
import { DispatchMap, MapTicket, MapTechnician } from "@/components/dispatch/DispatchMap";

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return "Vừa xong";
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Vừa xong";
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays <= 3) return `${diffDays} ngày trước`;
  return new Date(dateStr).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

function formatCompactDateTime(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${time} ${day}/${month}`;
}

function formatCompactDateOnly(dateStr?: string | null): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

function getSlaStatus(slaDueAt: string | null, resolvedAt?: string | null) {
  if (!slaDueAt) return null;
  const dueTime = new Date(slaDueAt).getTime();
  const slaFormatted = formatCompactDateOnly(slaDueAt);

  if (resolvedAt) {
    const isLate = new Date(resolvedAt).getTime() > dueTime;
    return {
      isOverdue: isLate,
      text: slaFormatted,
      className: isLate ? "badge bg-danger text-white" : "badge bg-secondary-subtle text-secondary border",
    };
  }

  const now = Date.now();
  const diffMs = dueTime - now;

  if (diffMs < 0) {
    return {
      isOverdue: true,
      text: slaFormatted,
      className: "badge bg-danger text-white",
    };
  }

  const remainingMins = Math.floor(diffMs / 60000);
  const remainingHours = Math.floor(remainingMins / 60);
  if (remainingHours < 3) {
    return {
      isOverdue: false,
      text: `${slaFormatted} (còn ${remainingHours > 0 ? `${remainingHours}h` : ""}${remainingMins % 60}p)`,
      className: "badge bg-warning text-dark",
    };
  }

  return {
    isOverdue: false,
    text: slaFormatted,
    className: "badge bg-secondary-subtle text-secondary border",
  };
}

interface DispatchTicket {
  id: string;
  code: string;
  type: string;
  status: string;
  priority: string;
  description: string;
  slaDueAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  assigneeId: string | null;
  customer: { id: string; name: string; phone: string; address: string; latitude?: number | null; longitude?: number | null };
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    brand: string | null;
    department?: {
      name: string;
      building?: { name: string; branch?: { name: string } };
    } | null;
  };
  assignee?: { id: string; name: string; region: string | null } | null;
}

interface Technician {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  region: string | null;
  skills: string[];
  openTicketsCount: number;
  lastLocation?: {
    latitude: number;
    longitude: number;
    checkInAt: string;
    ticketCode?: string;
    customerName?: string;
    customerAddress?: string;
  } | null;
  assignedTickets: {
    id: string;
    code: string;
    status: string;
    priority: string;
    customer: { name: string };
    equipment: { model: string; serialNumber: string };
  }[];
}

export default function DispatchPage() {
  const [tickets, setTickets] = useState<DispatchTicket[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [leftView, setLeftView] = useState<"map" | "table">("table");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [sortBy, setSortBy] = useState<"urgent" | "oldest" | "newest">("urgent");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [viewTicketId, setViewTicketId] = useState<string | null>(null);

  const fetchDispatchData = async () => {
    setLoading(true);
    try {
      const [tkRes, techRes] = await Promise.all([
        fetch("/api/tickets"),
        fetch("/api/dispatch/technicians"),
      ]);
      if (tkRes.ok) {
        const all: DispatchTicket[] = await tkRes.json();
        const active = all.filter((t) => !["COMPLETED", "CANCELLED"].includes(t.status));
        setTickets(active);
        if (!selectedTicketId && active.length > 0) {
          const firstUnassigned = active.find((t) => !t.assigneeId);
          setSelectedTicketId((firstUnassigned || active[0]).id);
        }
      }
      if (techRes.ok) {
        setTechnicians(await techRes.json());
      }
    } catch {
      toast.error("Lỗi tải dữ liệu bảng điều phối");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatchData();
  }, []);

  const displayedTickets = useMemo(() => {
    const list = showOnlyUnassigned ? tickets.filter((t) => !t.assigneeId) : [...tickets];

    const priorityWeight: Record<string, number> = {
      URGENT: 4,
      HIGH: 3,
      NORMAL: 2,
      LOW: 1,
    };

    return list.sort((a, b) => {
      if (sortBy === "urgent") {
        // 1. Chưa giao KTV ưu tiên trước
        const aUnassigned = !a.assigneeId ? 1 : 0;
        const bUnassigned = !b.assigneeId ? 1 : 0;
        if (aUnassigned !== bUnassigned) return bUnassigned - aUnassigned;

        // 2. SLA quá hạn hoặc gần hạn nhất lên trước
        const aDue = a.slaDueAt ? new Date(a.slaDueAt).getTime() : Infinity;
        const bDue = b.slaDueAt ? new Date(b.slaDueAt).getTime() : Infinity;
        if (aDue !== bDue) return aDue - bDue;

        // 3. Mức độ ưu tiên cao hơn lên trước
        const pwDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        if (pwDiff !== 0) return pwDiff;

        // 4. Tạo lâu hơn (cũ hơn) lên trước
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      if (sortBy === "oldest") {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }

      // newest
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [tickets, showOnlyUnassigned, sortBy]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  // Tính điểm gợi ý kỹ thuật viên thông minh theo Khoảng cách GPS + Khu vực + Kỹ năng dòng máy + Tải công việc
  const rankedTechnicians = useMemo(() => {
    return technicians
      .map((tech) => {
        let score = 50;
        const reasons: string[] = [];
        let distKm: number | null = null;

        if (selectedTicket) {
          // 1. Khoảng cách địa lý thực tế (GPS)
          let tLat = selectedTicket.customer.latitude;
          let tLng = selectedTicket.customer.longitude;
          if (!tLat || !tLng) {
            const est = estimateCoordinatesFromAddress(selectedTicket.customer.address, selectedTicket.id);
            tLat = est.latitude;
            tLng = est.longitude;
          }

          let techLat = tech.lastLocation?.latitude;
          let techLng = tech.lastLocation?.longitude;
          if (!techLat || !techLng) {
            const est = estimateCoordinatesFromAddress(tech.region || "Quận 1", tech.id);
            techLat = est.latitude;
            techLng = est.longitude;
          }

          distKm = calculateDistanceKm(tLat, tLng, techLat, techLng);

          if (distKm <= 3) {
            score += 40;
            reasons.push(`Rất gần (${distKm} km)`);
          } else if (distKm <= 7) {
            score += 25;
            reasons.push(`Gần (${distKm} km)`);
          } else if (distKm <= 15) {
            score += 10;
            reasons.push(`Cách ${distKm} km`);
          } else {
            score -= 10;
            reasons.push(`Khá xa (${distKm} km)`);
          }

          // 2. Tuyến phụ trách
          const addr = selectedTicket.customer.address.toLowerCase();
          if (tech.region && addr.includes(tech.region.toLowerCase())) {
            score += 20;
            reasons.push(`Đúng tuyến (${tech.region})`);
          }

          // 3. Kỹ năng chuyên môn
          const eqText = `${selectedTicket.equipment.brand || ""} ${
            selectedTicket.equipment.model
          }`.toLowerCase();
          const matchedSkill = tech.skills.find((s) => eqText.includes(s.toLowerCase()));
          if (matchedSkill) {
            score += 20;
            reasons.push(`Chuyên môn ${matchedSkill}`);
          }
        }

        // Trừ điểm nếu đang ôm nhiều phiếu
        score -= tech.openTicketsCount * 10;
        if (tech.openTicketsCount === 0) {
          reasons.push("Đang rảnh (0 phiếu)");
        }

        return { ...tech, matchScore: Math.max(10, Math.min(99, score)), reasons, distKm };
      })
      .sort((a, b) => {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        if (a.distKm != null && b.distKm != null) return a.distKm - b.distKm;
        return 0;
      });
  }, [technicians, selectedTicket]);

  const handleAssign = async (ticketId: string, techId: string, techName: string) => {
    setAssigningId(techId);
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ASSIGN",
          assigneeId: techId,
          note: `Phân công từ Bảng Điều phối thông minh cho KTV ${techName}`,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Phân công thất bại");
      toast.success(`Đã giao phiếu ${body.code} cho KTV ${techName}`);
      fetchDispatchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi phân công");
    } finally {
      setAssigningId(null);
    }
  };

  const unassignedCount = tickets.filter((t) => !t.assigneeId).length;

  return (
    <div className="container-fluid px-0">
      {/* Header Bar chuẩn HoaGiang */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-white p-3 rounded shadow-sm border-bottom">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
            <i className="fas fa-map-marked-alt text-primary"></i>
            <span>Điều phối kỹ thuật</span>
          </h5>
          <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
            Chưa giao KTV: <strong>{unassignedCount}</strong>
          </span>
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
            Đang mở: <strong>{tickets.length}</strong>
          </span>
          <span className="badge bg-success-subtle text-success border border-success-subtle">
            KTV sẵn sàng: <strong>{technicians.length}</strong>
          </span>
        </div>

        <div className="d-flex gap-2 align-items-center flex-wrap">
          <div className="d-flex align-items-center gap-1">
            <span className="small text-muted text-nowrap">
              <i className="fas fa-sort me-1"></i>Xếp theo:
            </span>
            <select
              className="form-select form-select-sm py-0"
              style={{ width: "auto", fontSize: "12px", height: "31px" }}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "urgent" | "oldest" | "newest")}
            >
              <option value="urgent">Cấp bách & Hạn SLA</option>
              <option value="oldest">Chờ lâu nhất (Cũ nhất)</option>
              <option value="newest">Mới phát sinh</option>
            </select>
          </div>

          <div className="form-check form-switch mb-0 ms-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="unassignedSwitch"
              checked={showOnlyUnassigned}
              onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
            />
            <label className="form-check-label small fw-semibold text-nowrap" htmlFor="unassignedSwitch">
              Chỉ chưa giao
            </label>
          </div>
          <Link href="/tickets" className="btn btn-sm btn-outline-secondary text-nowrap">
            <i className="fas fa-list me-1"></i> DS Phiếu kỹ thuật
          </Link>
        </div>
      </div>

      {loading ? (
        <Loading text="Đang phân tích tải công việc & vị trí kỹ thuật viên..." />
      ) : (
        <div className="row g-3">
          {/* Cột trái: Bản đồ điều phối Leaflet hoặc Danh sách phiếu */}
          <div className="col-lg-7">
            <div className="card shadow-sm border h-100">
              <div className="card-header bg-dark text-white py-1.5 px-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div className="d-flex align-items-center gap-2">
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        leftView === "table" ? "btn-primary fw-bold" : "btn-outline-light text-white"
                      }`}
                      onClick={() => setLeftView("table")}
                    >
                      <i className="fas fa-list me-1"></i> Danh sách ({displayedTickets.length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${
                        leftView === "map" ? "btn-primary fw-bold" : "btn-outline-light text-white"
                      }`}
                      onClick={() => setLeftView("map")}
                    >
                      <i className="fas fa-map-marked-alt me-1"></i> Bản đồ điều phối
                    </button>
                  </div>
                </div>
                <small className="text-white-50">
                  {leftView === "map"
                    ? "Nhấp vào điểm sự cố trên bản đồ để xem gợi ý KTV gần nhất"
                    : "Nhấp vào dòng để xem gợi ý KTV tối ưu bên phải"}
                </small>
              </div>

              {leftView === "map" ? (
                <div className="p-2">
                  <DispatchMap
                    tickets={displayedTickets}
                    technicians={technicians}
                    selectedTicketId={selectedTicketId}
                    onSelectTicket={(id) => setSelectedTicketId(id)}
                    onAssignTicket={(tId, techId, techName) => handleAssign(tId, techId, techName)}
                    onViewTicketDetail={(tId) => setViewTicketId(tId)}
                    height="calc(100vh - 240px)"
                  />
                </div>
              ) : (
                <div className="table-responsive" style={{ maxHeight: "calc(100vh - 220px)" }}>
                <table className="table table-hover table-bordered mb-0 custom-dense-table align-middle">
                  <thead className="bg-light">
                    <tr>
                      <th style={{ minWidth: "155px" }}>Mã phiếu & Thời gian</th>
                      <th>Khách hàng & Khu vực</th>
                      <th>Thiết bị & Lỗi</th>
                      <th style={{ minWidth: "135px" }}>KTV hiện tại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTickets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-muted">
                          Tất cả các phiếu kỹ thuật đều đã được điều phối!
                        </td>
                      </tr>
                    ) : (
                      displayedTickets.map((t) => {
                        const isSelected = t.id === selectedTicketId;
                        const sla = getSlaStatus(t.slaDueAt, t.resolvedAt);

                        return (
                          <tr
                            key={t.id}
                            onClick={() => setSelectedTicketId(t.id)}
                            style={{ cursor: "pointer" }}
                            className={
                              isSelected
                                ? "table-primary border-primary"
                                : !t.assigneeId
                                ? "bg-warning-subtle"
                                : ""
                            }
                          >
                            <td>
                              <button
                                type="button"
                                className="btn btn-link p-0 fw-bold font-monospace text-primary text-decoration-none border-0 text-start d-inline-flex align-items-center gap-1"
                                style={{ fontSize: "14px", cursor: "pointer" }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTicketId(t.id);
                                  setViewTicketId(t.id);
                                }}
                                title="Nhấp để mở xem chi tiết phiếu kỹ thuật"
                                onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                                onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                              >
                                <span>{t.code}</span>
                                <i className="fas fa-external-link-alt text-primary opacity-50" style={{ fontSize: "10px" }}></i>
                              </button>
                              <div className="d-flex flex-wrap gap-1 align-items-center mt-1">
                                <span
                                  className={`badge ${
                                    t.priority === "URGENT"
                                      ? "bg-danger"
                                      : t.priority === "HIGH"
                                      ? "bg-warning text-dark"
                                      : "bg-secondary"
                                  }`}
                                >
                                  {TICKET_PRIORITY_LABELS[t.priority]}
                                </span>
                                {sla && (
                                  <span
                                    className={sla.className}
                                    style={{ fontSize: "10.5px" }}
                                    title={
                                      t.slaDueAt
                                        ? (sla.isOverdue
                                            ? `Trễ hạn SLA: ${new Date(t.slaDueAt).toLocaleString("vi-VN")}`
                                            : `Hạn SLA: ${new Date(t.slaDueAt).toLocaleString("vi-VN")}`)
                                        : undefined
                                    }
                                  >
                                    <i className="far fa-clock me-1"></i>
                                    {sla.text}
                                  </span>
                                )}
                                {t.resolvedAt && (
                                  <span
                                    className="badge bg-success-subtle text-success border border-success-subtle"
                                    style={{ fontSize: "10.5px" }}
                                    title={`Thời gian hoàn thành: ${new Date(t.resolvedAt).toLocaleString("vi-VN")}`}
                                  >
                                    <i className="fas fa-check-circle me-1"></i>
                                    {formatCompactDateOnly(t.resolvedAt)}
                                  </span>
                                )}
                              </div>
                              <div
                                className="text-muted mt-1 d-flex align-items-center gap-1"
                                style={{ fontSize: "11px" }}
                                title={`Thời gian phát sinh: ${new Date(t.createdAt).toLocaleString("vi-VN")}`}
                              >
                                <i className="far fa-clock text-secondary"></i>
                                <span className="fw-medium text-dark">{formatRelativeTime(t.createdAt)}</span>
                                <span className="text-muted">
                                  ({new Date(t.createdAt).toLocaleDateString("vi-VN", {
                                    day: "2-digit",
                                    month: "2-digit",
                                  })})
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="fw-bold text-dark">{t.customer.name}</div>
                              <div className="small text-muted d-flex align-items-center gap-1.5 flex-wrap">
                                <span>
                                  <i className="fas fa-map-marker-alt text-danger me-1"></i>
                                  {t.customer.address}
                                </span>
                                {t.customer.address && (
                                  <a
                                    href={getDirectionsUrl(t.customer)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary fw-semibold text-decoration-none d-inline-flex align-items-center gap-0.5 ms-1"
                                    style={{ fontSize: "11px" }}
                                    title="Mở chỉ đường Google Maps"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <i className="fas fa-location-arrow text-danger" style={{ fontSize: "9px" }}></i>
                                    <span>Chỉ đường</span>
                                  </a>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="fw-semibold">{t.equipment.model}</div>
                              <div className="small text-muted">
                                {TICKET_TYPE_LABELS[t.type]}: {t.description}
                              </div>
                            </td>
                            <td>
                              {t.assignee ? (
                                <div>
                                  <span className="badge bg-info-subtle text-info-emphasis border">
                                    <i className="fas fa-user-check me-1"></i>
                                    {t.assignee.name}
                                  </span>
                                  <div className="small text-muted mt-1">
                                    {TICKET_STATUS_LABELS[t.status]}
                                  </div>
                                </div>
                              ) : (
                                <span className="badge bg-danger">Chưa phân công</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </div>

          {/* Cột phải: Gợi ý Kỹ thuật viên theo Khu vực, Kỹ năng & Tải công việc */}
          <div className="col-lg-5">
            <div className="card shadow-sm border h-100">
              <div className="card-header bg-dark text-white py-2 d-flex justify-content-between align-items-center">
                <span className="fw-bold small">
                  <i className="fas fa-users-cog me-2"></i>
                  2. Đề xuất Kỹ thuật viên phù hợp
                </span>
                {selectedTicket && (
                  <span className="badge bg-warning text-dark">
                    Đang chọn: {selectedTicket.code}
                  </span>
                )}
              </div>
              <div className="card-body p-2" style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
                {selectedTicket && (
                  <div className="alert alert-primary py-2 px-3 mb-2 small">
                    <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                      <div className="fw-bold d-flex align-items-center gap-1 flex-wrap">
                        <span>Phiếu đang chọn:</span>
                        <button
                          type="button"
                          className="btn btn-link p-0 fw-bold font-monospace text-primary border-0 text-decoration-underline"
                          onClick={() => setViewTicketId(selectedTicket.id)}
                          title="Nhấp để mở chi tiết phiếu này"
                        >
                          {selectedTicket.code}
                        </button>
                        <span>- {selectedTicket.customer.name}</span>
                        <button
                          type="button"
                          className="btn btn-xs btn-outline-primary py-0 px-2 fw-semibold ms-1"
                          style={{ fontSize: "11px" }}
                          onClick={() => setViewTicketId(selectedTicket.id)}
                          title="Mở toàn bộ hồ sơ xử lý phiếu kỹ thuật"
                        >
                          <i className="fas fa-folder-open me-1"></i>Xem phiếu
                        </button>
                      </div>
                      <span
                        className="badge bg-white text-dark border text-nowrap"
                        title="Thời điểm phát sinh yêu cầu"
                      >
                        <i className="far fa-clock me-1 text-primary"></i>
                        {new Date(selectedTicket.createdAt).toLocaleString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div>
                      Địa chỉ: <strong>{selectedTicket.customer.address}</strong> | Máy:{" "}
                      <strong>{selectedTicket.equipment.model}</strong>
                      {selectedTicket.slaDueAt && (
                        <span className="ms-2">
                          | Hạn SLA:{" "}
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
                        </span>
                      )}
                      {selectedTicket.resolvedAt && (
                        <span className="ms-2 text-success">
                          | Hoàn thành:{" "}
                          <strong>{formatCompactDateTime(selectedTicket.resolvedAt)}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="d-flex flex-column gap-2">
                  {rankedTechnicians.map((tech, idx) => {
                    const isCurrentAssignee =
                      selectedTicket && selectedTicket.assigneeId === tech.id;

                    return (
                      <div
                        key={tech.id}
                        className={`p-3 rounded border overflow-hidden ${
                          isCurrentAssignee
                            ? "border-success bg-success-subtle"
                            : idx === 0 && selectedTicket
                            ? "border-primary bg-light"
                            : "bg-white"
                        }`}
                      >
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div style={{ minWidth: 0 }} className="flex-grow-1">
                            <div className="d-flex align-items-center gap-1.5 flex-wrap mb-1">
                              <span className="fw-bold text-dark fs-6">{tech.name}</span>
                              {idx === 0 && selectedTicket && (
                                <span className="badge bg-primary" style={{ fontSize: "11px" }}>
                                  <i className="fas fa-star me-1"></i>Gợi ý số 1 ({tech.matchScore}% phù hợp)
                                </span>
                              )}
                              {isCurrentAssignee && (
                                <span className="badge bg-success" style={{ fontSize: "11px" }}>
                                  <i className="fas fa-check me-1"></i>Đang phụ trách phiếu này
                                </span>
                              )}
                            </div>
                            <div className="small text-muted d-flex flex-wrap gap-2 align-items-center">
                              <span>
                                <i className="fas fa-map-pin text-danger me-1"></i>
                                Khu vực: <strong>{tech.region || "Đa tuyến"}</strong>
                              </span>
                              {tech.distKm != null && (
                                <span className="badge bg-primary-subtle text-primary border border-primary-subtle" style={{ fontSize: "11px" }}>
                                  <i className="fas fa-motorcycle me-1"></i>
                                  Cách ~{tech.distKm} km
                                </span>
                              )}
                              <span>
                                <i className="fas fa-phone me-1"></i>
                                {tech.phone || "Chưa cập nhật"}
                              </span>
                            </div>
                            {tech.lastLocation && (
                              <div className="text-secondary mt-1 text-truncate" style={{ fontSize: "11px" }}>
                                <i className="fas fa-map-marker-alt text-success me-1"></i>
                                <span>Vị trí check-in: </span>
                                <strong>{tech.lastLocation.customerName || tech.lastLocation.customerAddress || "GPS"}</strong>
                                <span className="ms-1 text-muted">({formatRelativeTime(tech.lastLocation.checkInAt)})</span>
                              </div>
                            )}
                            <div className="mt-1 d-flex flex-wrap gap-1">
                              {tech.skills.map((sk) => (
                                <span
                                  key={sk}
                                  className="badge bg-secondary-subtle text-secondary border"
                                  style={{ fontSize: "11px" }}
                                >
                                  {sk}
                                </span>
                              ))}
                              {tech.reasons.map((r) => (
                                <span
                                  key={r}
                                  className="badge bg-info-subtle text-info-emphasis border"
                                  style={{ fontSize: "11px" }}
                                >
                                  <i className="fas fa-check me-1"></i>
                                  {r}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="text-end flex-shrink-0 d-flex flex-column align-items-end justify-content-start" style={{ minWidth: "125px" }}>
                            <div className="mb-2">
                              <span
                                className={`badge py-1.5 px-2.5 ${
                                  tech.openTicketsCount === 0
                                    ? "bg-success"
                                    : tech.openTicketsCount <= 2
                                    ? "bg-warning text-dark"
                                    : "bg-danger"
                                }`}
                                style={{ fontSize: "11.5px" }}
                              >
                                Đang xử lý: {tech.openTicketsCount} phiếu
                              </span>
                            </div>
                            {selectedTicket && (
                              <button
                                type="button"
                                className={`btn btn-sm px-3 py-1 fw-semibold shadow-2xs ${
                                  isCurrentAssignee ? "btn-outline-success" : "btn-primary"
                                }`}
                                style={{ marginTop: "4px" }}
                                disabled={assigningId === tech.id || !!isCurrentAssignee}
                                onClick={() =>
                                  handleAssign(selectedTicket.id, tech.id, tech.name)
                                }
                              >
                                <i className={`fas ${isCurrentAssignee ? "fa-check" : "fa-paper-plane"} me-1.5`}></i>
                                {isCurrentAssignee ? "Đã giao" : "Giao ngay"}
                              </button>
                            )}
                          </div>
                        </div>

                        {tech.assignedTickets.length > 0 && (
                          <div className="mt-2.5 pt-2 border-top small">
                            <div className="text-muted mb-1.5 fw-semibold d-flex align-items-center justify-content-between" style={{ fontSize: "11px" }}>
                              <span>
                                <i className="fas fa-tasks text-primary me-1"></i>
                                Công việc đang đảm nhận ({tech.assignedTickets.length}):
                              </span>
                            </div>
                            <div className="d-flex flex-column gap-1.5 w-100">
                              {tech.assignedTickets.map((at) => (
                                <button
                                  key={at.id}
                                  type="button"
                                  className="btn btn-sm btn-light border text-start d-flex align-items-center gap-1.5 py-1 px-2 text-decoration-none w-100 shadow-2xs"
                                  style={{ cursor: "pointer", fontSize: "12px", minWidth: 0 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setViewTicketId(at.id);
                                  }}
                                  title={`Nhấp để mở chi tiết phiếu: ${at.code} - ${at.customer.name} - ${at.equipment.model}`}
                                >
                                  <i className="fas fa-ticket-alt text-primary flex-shrink-0" style={{ fontSize: "11px" }}></i>
                                  <span className="font-monospace fw-bold text-primary flex-shrink-0">{at.code}:</span>
                                  <span className="text-dark text-truncate flex-grow-1" style={{ minWidth: 0 }}>
                                    {at.customer.name}
                                  </span>
                                  <span className="badge bg-secondary-subtle text-secondary border flex-shrink-0 ms-auto" style={{ fontSize: "10.5px" }}>
                                    {at.equipment.model}
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal xem / xử lý chi tiết phiếu kỹ thuật */}
      <TicketDetailModal
        ticketId={viewTicketId}
        onClose={() => setViewTicketId(null)}
        onTicketUpdated={fetchDispatchData}
      />
    </div>
  );
}
