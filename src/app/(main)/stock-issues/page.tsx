"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ModalShell from "@/components/ModalShell";

interface PartOption {
  id: string;
  partCode: string;
  name: string;
  unit: string;
  currentQuantity: number;
}

interface TicketOption {
  id: string;
  code: string;
  equipment: { serialNumber: string; model: string };
}

interface StockIssueItem {
  id: string;
  code: string;
  type: "TECHNICAL" | "RETAIL" | "RETURN";
  status: "PENDING" | "APPROVED" | "REJECTED";
  note: string | null;
  rejectReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  requester: { id: string; name: string };
  approver: { id: string; name: string } | null;
  ticket: {
    id: string;
    code: string;
    equipment: { serialNumber: string; model: string };
  } | null;
  items: {
    id: string;
    quantity: number;
    part: { id: string; partCode: string; name: string; unit: string };
  }[];
}

const TYPE_LABEL: Record<string, string> = {
  TECHNICAL: "Xuất kỹ thuật (Sửa máy)",
  RETAIL: "Xuất bán lẻ",
  RETURN: "Hoàn trả linh kiện cũ",
};

export default function StockIssuesPage() {
  const [issues, setIssues] = useState<StockIssueItem[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [tickets, setTickets] = useState<TicketOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [issueType, setIssueType] = useState<"TECHNICAL" | "RETAIL" | "RETURN">("TECHNICAL");
  const [ticketId, setTicketId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<{ partId: string; quantity: string }[]>([
    { partId: "", quantity: "1" },
  ]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ pageSize: "50" });
      if (statusFilter) sp.set("status", statusFilter);
      if (typeFilter) sp.set("type", typeFilter);

      const [resI, resP, resT] = await Promise.all([
        fetch(`/api/stock-issues?${sp.toString()}`),
        fetch("/api/parts?pageSize=100"),
        fetch("/api/tickets?pageSize=50").catch(() => null),
      ]);

      if (resI.ok) {
        const d = await resI.json();
        setIssues(d.items || []);
        setTotal(d.total || 0);
      }
      if (resP.ok) {
        const dp = await resP.json();
        setParts(dp.items || []);
      }
      if (resT && resT.ok) {
        const dt = await resT.json();
        setTickets(dt.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setIssueType("TECHNICAL");
    setTicketId("");
    setNote("");
    setLines([{ partId: parts[0]?.id || "", quantity: "1" }]);
    setShowModal(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter((l) => l.partId && Number(l.quantity) > 0);
    if (validLines.length === 0) return toast.warning("Chọn ít nhất 1 linh kiện");
    setSaving(true);
    try {
      const res = await fetch("/api/stock-issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: issueType,
          ticketId: ticketId || undefined,
          note: note || undefined,
          items: validLines.map((l) => ({ partId: l.partId, quantity: Number(l.quantity) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể tạo phiếu xuất kho");
        return;
      }
      toast.success(`Đã lập phiếu ${data.code}, chờ phê duyệt`);
      setShowModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (iss: StockIssueItem, decision: "APPROVED" | "REJECTED") => {
    let rejectReason = "";
    if (decision === "REJECTED") {
      rejectReason = prompt("Nhập lý do từ chối phiếu xuất:") || "Không phê duyệt";
    } else {
      if (!confirm(`Duyệt phiếu ${iss.code} và tự động trừ tồn kho theo FIFO?`)) return;
    }

    const res = await fetch(`/api/stock-issues/${iss.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, rejectReason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xử lý phiếu");
      return;
    }
    toast.success(
      decision === "APPROVED"
        ? `Đã duyệt phiếu ${iss.code} & trừ tồn kho FIFO!`
        : `Đã từ chối phiếu ${iss.code}`
    );
    loadData();
  };

  const pendingCount = issues.filter((i) => i.status === "PENDING").length;

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-warning text-dark p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-exchange-alt fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">PHIẾU XUẤT / HOÀN TRẢ KHO &amp; PHÊ DUYỆT FIFO</h1>
          <div className="vr mx-2 d-none d-md-block" style={{ height: "20px" }}></div>
          <div className="d-none d-md-flex gap-3">
            <span className="small text-muted">
              Tổng phiếu: <strong>{total}</strong>
            </span>
            <span className="small text-danger">
              Chờ duyệt: <strong>{pendingCount}</strong>
            </span>
          </div>
        </div>
        <div className="d-flex gap-1">
          <button className="btn btn-outline-dark btn-sm px-3 fw-bold" onClick={loadData}>
            <i className="fas fa-sync-alt me-1"></i> Tải lại
          </button>
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={openNew}>
            <i className="fas fa-plus me-1"></i> Lập phiếu xuất / trả kho
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
        <div className="card-body p-2 bg-light bg-opacity-50">
          <div className="row g-2">
            <div className="col-md-6">
              <select
                className="form-select form-select-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">-- Mọi trạng thái phê duyệt --</option>
                <option value="PENDING">Chờ duyệt (PENDING)</option>
                <option value="APPROVED">Đã duyệt &amp; Trừ kho (APPROVED)</option>
                <option value="REJECTED">Đã từ chối (REJECTED)</option>
              </select>
            </div>
            <div className="col-md-6">
              <select
                className="form-select form-select-sm"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">-- Tất cả loại phiếu --</option>
                <option value="TECHNICAL">Xuất kỹ thuật (Đi sửa máy)</option>
                <option value="RETAIL">Xuất bán lẻ</option>
                <option value="RETURN">Hoàn trả linh kiện cũ/hỏng</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Dense Table */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
        <div className="card-body p-0">
          <div className="table-responsive table-sticky-container">
            <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-3 py-2 text-uppercase small">Mã phiếu</th>
                  <th className="py-2 text-uppercase small">Loại nghiệp vụ</th>
                  <th className="py-2 text-uppercase small">Chi tiết linh kiện</th>
                  <th className="py-2 text-uppercase small">Phiếu Ticket / Máy</th>
                  <th className="py-2 text-uppercase small">Người đề xuất</th>
                  <th className="py-2 text-uppercase small text-center">Trạng thái</th>
                  <th className="py-2 text-uppercase small text-end px-3" style={{ width: "160px" }}>
                    Phê duyệt
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7}>
                      <Loading />
                    </td>
                  </tr>
                ) : issues.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-5 text-muted small">
                      Chưa có phiếu xuất/nhập kho nào
                    </td>
                  </tr>
                ) : (
                  issues.map((iss) => (
                    <tr
                      key={iss.id}
                      className={iss.status === "PENDING" ? "bg-warning-subtle bg-opacity-10" : ""}
                    >
                      <td className="px-3">
                        <div className="fw-bold text-primary font-monospace small">{iss.code}</div>
                        <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                          {new Date(iss.createdAt).toLocaleString("vi-VN")}
                        </div>
                      </td>
                      <td className="small fw-semibold">{TYPE_LABEL[iss.type]}</td>
                      <td>
                        {iss.items.map((it) => (
                          <div key={it.id} className="small">
                            • <strong>{it.part.name}</strong> ({it.part.partCode}) ×{" "}
                            <span className="badge bg-dark">{it.quantity}</span>
                          </div>
                        ))}
                        {iss.note && (
                          <div className="text-muted fst-italic" style={{ fontSize: "0.73rem" }}>
                            Ghi chú: {iss.note}
                          </div>
                        )}
                      </td>
                      <td className="small">
                        {iss.ticket ? (
                          <div>
                            <span className="font-monospace fw-bold">{iss.ticket.code}</span>
                            <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                              {iss.ticket.equipment.model} #{iss.ticket.equipment.serialNumber}
                            </div>
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="small">
                        <div>{iss.requester.name}</div>
                        {iss.approver && (
                          <div className="text-muted" style={{ fontSize: "0.72rem" }}>
                            Duyệt bởi: {iss.approver.name}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        {iss.status === "PENDING" ? (
                          <span className="badge bg-warning text-dark">Chờ duyệt</span>
                        ) : iss.status === "APPROVED" ? (
                          <span className="badge bg-success">Đã xuất FIFO</span>
                        ) : (
                          <span className="badge bg-danger" title={iss.rejectReason || ""}>
                            Từ chối
                          </span>
                        )}
                      </td>
                      <td className="px-3 text-end">
                        {iss.status === "PENDING" ? (
                          <div className="btn-group btn-group-sm">
                            <button
                              className="btn btn-success btn-sm py-0 px-2"
                              onClick={() => handleDecision(iss, "APPROVED")}
                              title="Duyệt & Trừ kho FIFO"
                            >
                              <i className="fas fa-check me-1"></i> Duyệt
                            </button>
                            <button
                              className="btn btn-outline-danger btn-sm py-0 px-2"
                              onClick={() => handleDecision(iss, "REJECTED")}
                              title="Từ chối"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted small">Đã khóa</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal Lập phiếu xuất kho */}
      <ModalShell
        show={showModal}
        size="lg"
        title="Lập phiếu đề xuất Xuất kho / Hoàn trả linh kiện"
        onClose={() => setShowModal(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setShowModal(false)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="issue-form"
              disabled={saving}
              className="btn btn-primary btn-sm px-3 fw-bold"
            >
              {saving ? "Đang gửi..." : "Gửi phiếu đề xuất"}
            </button>
          </>
        }
      >
        <form id="issue-form" onSubmit={handleCreate}>
          <div className="row g-2 mb-3">
            <div className="col-md-5">
              <label className="form-label small fw-bold text-primary mb-1">
                LOẠI NGHIỆP VỤ KHO <span className="text-danger">*</span>
              </label>
              <select
                className="form-select form-select-sm border-primary"
                value={issueType}
                onChange={(e) =>
                  setIssueType(e.target.value as "TECHNICAL" | "RETAIL" | "RETURN")
                }
              >
                <option value="TECHNICAL">Xuất kỹ thuật (Thay linh kiện sửa máy)</option>
                <option value="RETAIL">Xuất bán lẻ cho khách</option>
                <option value="RETURN">Hoàn trả xác linh kiện cũ/hỏng</option>
              </select>
            </div>
            <div className="col-md-7">
              <label className="form-label small fw-bold text-muted mb-1">
                GẮN VỚI PHIẾU SỰ CỐ (TICKET - NẾU CÓ)
              </label>
              <select
                className="form-select form-select-sm"
                value={ticketId}
                onChange={(e) => setTicketId(e.target.value)}
              >
                <option value="">-- Không gắn Ticket --</option>
                {tickets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} – {t.equipment?.model} (#{t.equipment?.serialNumber})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12">
              <label className="form-label small fw-bold text-muted mb-1">GHI CHÚ ĐỀ XUẤT</label>
              <input
                type="text"
                placeholder="Lý do xuất kho, tình trạng linh kiện..."
                className="form-control form-control-sm"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          <div className="d-flex justify-content-between align-items-center mb-2">
            <strong className="small text-uppercase text-muted">Danh sách linh kiện yêu cầu</strong>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm py-0 px-2"
              onClick={() => setLines([...lines, { partId: parts[0]?.id || "", quantity: "1" }])}
            >
              + Thêm dòng
            </button>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} className="row g-2 mb-2 align-items-center">
              <div className="col-8">
                <select
                  required
                  className="form-select form-select-sm"
                  value={line.partId}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx].partId = e.target.value;
                    setLines(next);
                  }}
                >
                  <option value="">-- Chọn linh kiện --</option>
                  {parts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.partCode} – {p.name} (Tồn: {p.currentQuantity} {p.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-3">
                <input
                  type="number"
                  required
                  min={1}
                  className="form-control form-control-sm"
                  value={line.quantity}
                  onChange={(e) => {
                    const next = [...lines];
                    next[idx].quantity = e.target.value;
                    setLines(next);
                  }}
                />
              </div>
              <div className="col-1 text-end">
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-outline-danger btn-sm py-0 px-2"
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                  >
                    &times;
                  </button>
                )}
              </div>
            </div>
          ))}
        </form>
      </ModalShell>
    </div>
  );
}
