"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { Loading } from "@/components/Loading";
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_TYPE_LABELS,
} from "@/lib/labels";

interface DispatchTicket {
  id: string;
  code: string;
  type: string;
  status: string;
  priority: string;
  description: string;
  slaDueAt: string | null;
  createdAt: string;
  assigneeId: string | null;
  customer: { id: string; name: string; phone: string; address: string };
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
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);

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
    return showOnlyUnassigned ? tickets.filter((t) => !t.assigneeId) : tickets;
  }, [tickets, showOnlyUnassigned]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  // Tính điểm gợi ý kỹ thuật viên thông minh theo Khu vực + Kỹ năng dòng máy + Tải công việc
  const rankedTechnicians = useMemo(() => {
    return technicians
      .map((tech) => {
        let score = 50;
        const reasons: string[] = [];

        if (selectedTicket) {
          const addr = selectedTicket.customer.address.toLowerCase();
          if (tech.region && addr.includes(tech.region.toLowerCase())) {
            score += 30;
            reasons.push(`Đúng tuyến (${tech.region})`);
          }
          const eqText = `${selectedTicket.equipment.brand || ""} ${
            selectedTicket.equipment.model
          }`.toLowerCase();
          const matchedSkill = tech.skills.find((s) => eqText.includes(s.toLowerCase()));
          if (matchedSkill) {
            score += 25;
            reasons.push(`Chuyên môn ${matchedSkill}`);
          }
        }

        // Trừ điểm nếu đang ôm nhiều phiếu
        score -= tech.openTicketsCount * 10;
        if (tech.openTicketsCount === 0) {
          reasons.push("Đang rảnh (0 phiếu)");
        }

        return { ...tech, matchScore: Math.max(10, Math.min(99, score)), reasons };
      })
      .sort((a, b) => b.matchScore - a.matchScore);
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
            <span>Bảng Điều phối Kỹ thuật viên Thông minh</span>
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

        <div className="d-flex gap-2 align-items-center">
          <div className="form-check form-switch mb-0 me-2">
            <input
              className="form-check-input"
              type="checkbox"
              id="unassignedSwitch"
              checked={showOnlyUnassigned}
              onChange={(e) => setShowOnlyUnassigned(e.target.checked)}
            />
            <label className="form-check-label small fw-semibold" htmlFor="unassignedSwitch">
              Chỉ hiện phiếu chưa giao
            </label>
          </div>
          <Link href="/tickets" className="btn btn-sm btn-outline-secondary">
            <i className="fas fa-list me-1"></i> Danh sách Ticket
          </Link>
        </div>
      </div>

      {loading ? (
        <Loading text="Đang phân tích tải công việc & vị trí kỹ thuật viên..." />
      ) : (
        <div className="row g-3">
          {/* Cột trái: Danh sách phiếu cần điều phối */}
          <div className="col-lg-7">
            <div className="card shadow-sm border h-100">
              <div className="card-header bg-dark text-white py-2 d-flex justify-content-between align-items-center">
                <span className="fw-bold small">
                  <i className="fas fa-clipboard-list me-2"></i>
                  1. Chọn Phiếu yêu cầu cần điều phối ({displayedTickets.length})
                </span>
                <small className="text-white-50">
                  Nhấp vào dòng để hệ thống gợi ý KTV tối ưu bên phải
                </small>
              </div>
              <div className="table-responsive" style={{ maxHeight: "calc(100vh - 220px)" }}>
                <table className="table table-hover table-bordered mb-0 custom-dense-table align-middle">
                  <thead className="bg-light">
                    <tr>
                      <th>Mã phiếu</th>
                      <th>Khách hàng & Khu vực</th>
                      <th>Thiết bị & Lỗi</th>
                      <th>KTV hiện tại</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTickets.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-4 text-muted">
                          Tất cả các phiếu đều đã được điều phối!
                        </td>
                      </tr>
                    ) : (
                      displayedTickets.map((t) => {
                        const isSelected = t.id === selectedTicketId;
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
                              <div className="fw-bold font-monospace text-primary">{t.code}</div>
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
                            </td>
                            <td>
                              <div className="fw-bold text-dark">{t.customer.name}</div>
                              <div className="small text-muted">
                                <i className="fas fa-map-marker-alt text-danger me-1"></i>
                                {t.customer.address}
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
                    <div className="fw-bold">
                      Phiếu đang chọn: {selectedTicket.code} - {selectedTicket.customer.name}
                    </div>
                    <div>
                      Địa chỉ: <strong>{selectedTicket.customer.address}</strong> | Máy:{" "}
                      <strong>{selectedTicket.equipment.model}</strong>
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
                        className={`p-3 rounded border ${
                          isCurrentAssignee
                            ? "border-success bg-success-subtle"
                            : idx === 0 && selectedTicket
                            ? "border-primary bg-light"
                            : "bg-white"
                        }`}
                      >
                        <div className="d-flex justify-content-between align-items-start">
                          <div>
                            <div className="d-flex align-items-center gap-2">
                              <span className="fw-bold text-dark">{tech.name}</span>
                              {idx === 0 && selectedTicket && (
                                <span className="badge bg-primary">
                                  <i className="fas fa-star me-1"></i>Gợi ý số 1 (
                                  {tech.matchScore}% phù hợp)
                                </span>
                              )}
                              {isCurrentAssignee && (
                                <span className="badge bg-success">Đang phụ trách phiếu này</span>
                              )}
                            </div>
                            <div className="small text-muted mt-1">
                              <span className="me-3">
                                <i className="fas fa-map-pin text-danger me-1"></i>
                                Khu vực: <strong>{tech.region || "Đa tuyến"}</strong>
                              </span>
                              <span>
                                <i className="fas fa-phone me-1"></i>
                                {tech.phone || "Chưa cập nhật"}
                              </span>
                            </div>
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

                          <div className="text-end">
                            <div className="mb-2">
                              <span
                                className={`badge ${
                                  tech.openTicketsCount === 0
                                    ? "bg-success"
                                    : tech.openTicketsCount <= 2
                                    ? "bg-warning text-dark"
                                    : "bg-danger"
                                }`}
                              >
                                Đang xử lý: {tech.openTicketsCount} phiếu
                              </span>
                            </div>
                            {selectedTicket && (
                              <button
                                type="button"
                                className={`btn btn-sm ${
                                  isCurrentAssignee ? "btn-outline-success" : "btn-primary"
                                }`}
                                disabled={assigningId === tech.id || !!isCurrentAssignee}
                                onClick={() =>
                                  handleAssign(selectedTicket.id, tech.id, tech.name)
                                }
                              >
                                <i className="fas fa-paper-plane me-1"></i>
                                {isCurrentAssignee ? "Đã giao" : "Giao ngay"}
                              </button>
                            )}
                          </div>
                        </div>

                        {tech.assignedTickets.length > 0 && (
                          <div className="mt-2 pt-2 border-top small">
                            <div className="text-muted mb-1" style={{ fontSize: "11px" }}>
                              Công việc đang đảm nhận:
                            </div>
                            <div className="d-flex flex-wrap gap-1">
                              {tech.assignedTickets.map((at) => (
                                <span
                                  key={at.id}
                                  className="badge bg-white text-dark border font-monospace"
                                  title={`${at.customer.name} - ${at.equipment.model}`}
                                >
                                  {at.code}: {at.customer.name}
                                </span>
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
    </div>
  );
}
