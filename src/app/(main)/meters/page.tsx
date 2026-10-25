"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import { Loading } from "@/components/Loading";
import { METER_SOURCE_LABELS } from "@/lib/labels";
import { exportToCsv } from "@/lib/csv";
import { MeterOcrModal } from "@/components/ocr/MeterOcrModal";

interface MeterLogItem {
  id: string;
  equipmentId: string;
  counterValue: number;
  source: "MANUAL" | "OCR" | "TECH" | "CUSTOMER";
  photoUrl: string | null;
  logDate: string;
  isBilled: boolean;
  status: "APPROVED" | "PENDING_APPROVAL" | "REJECTED";
  adjustmentReason?: string | null;
  approvedById?: string | null;
  approvedBy?: { id: string; name: string; role: string } | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    brand: string | null;
    currentCounter: number;
    baseQuota: number | null;
    overagePrice: string | number | null;
    customer?: { id: string; name: string; code: string } | null;
    contract?: {
      id: string;
      code: string;
      baseQuota: number;
      overagePrice: string | number;
    } | null;
  };
  recordedBy?: { id: string; name: string; role: string } | null;
  ticket?: { id: string; code: string; title: string } | null;
}

interface EquipmentOption {
  id: string;
  serialNumber: string;
  model: string;
  brand?: string | null;
  currentCounter: number;
  customer?: { id: string; name: string } | null;
}

export default function MeterManagementPage() {
  const [logs, setLogs] = useState<MeterLogItem[]>([]);
  const [equipments, setEquipments] = useState<EquipmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [statusTab, setStatusTab] = useState<"ALL" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED">("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");

  // Modal 1: Ghi nhận counter mới
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState<{
    equipmentId: string;
    counterValue: string;
    source: "MANUAL" | "OCR" | "TECH" | "CUSTOMER";
    photoUrl: string;
    adjustmentReason: string;
  }>({
    equipmentId: "",
    counterValue: "",
    source: "MANUAL",
    photoUrl: "",
    adjustmentReason: "",
  });

  // Modal 2: Phóng to ảnh minh chứng counter
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [showOcrModal, setShowOcrModal] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [metersRes, eqRes] = await Promise.all([
        fetch("/api/meters"),
        fetch("/api/equipment?pageSize=100"),
      ]);

      if (metersRes.ok) {
        const d = await metersRes.json();
        setLogs(Array.isArray(d) ? d : []);
      }
      if (eqRes.ok) {
        const d = await eqRes.json();
        setEquipments(d.items || []);
      }
    } catch {
      toast.error("Lỗi khi nạp dữ liệu chỉ số counter");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const selectedEquipment = useMemo(() => {
    return equipments.find((e) => e.id === form.equipmentId);
  }, [equipments, form.equipmentId]);

  const stats = useMemo(() => {
    const total = logs.length;
    const pending = logs.filter((l) => l.status === "PENDING_APPROVAL").length;
    const approved = logs.filter((l) => l.status === "APPROVED").length;
    const rejected = logs.filter((l) => l.status === "REJECTED").length;
    return { total, pending, approved, rejected };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      // Tab filter
      if (statusTab !== "ALL" && item.status !== statusTab) return false;

      // Source filter
      if (sourceFilter !== "ALL" && item.source !== sourceFilter) return false;

      // Search keyword
      if (!q.trim()) return true;
      const kw = q.trim().toLowerCase();
      return (
        item.equipment.serialNumber.toLowerCase().includes(kw) ||
        item.equipment.model.toLowerCase().includes(kw) ||
        (item.equipment.customer?.name || "").toLowerCase().includes(kw) ||
        (item.recordedBy?.name || "").toLowerCase().includes(kw) ||
        (item.adjustmentReason || "").toLowerCase().includes(kw)
      );
    });
  }, [logs, statusTab, sourceFilter, q]);

  // Phê duyệt điều chỉnh counter
  const handleApprove = async (item: MeterLogItem) => {
    const isLower = item.counterValue < item.equipment.currentCounter;
    const confirmMsg = isLower
      ? `Xác nhận DUYỆT điều chỉnh giảm chỉ số máy ${item.equipment.model} (SN: ${item.equipment.serialNumber}) từ ${item.equipment.currentCounter.toLocaleString("vi-VN")} xuống ${item.counterValue.toLocaleString("vi-VN")} bản?\n\nLý do KTV khai báo: ${item.adjustmentReason || "Không có"}`
      : `Xác nhận duyệt chỉ số counter ${item.counterValue.toLocaleString("vi-VN")} cho thiết bị ${item.equipment.model}?`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await fetch(`/api/meters/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể phê duyệt");

      toast.success(
        `Đã phê duyệt và cập nhật counter máy thành ${item.counterValue.toLocaleString("vi-VN")}!`
      );
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi phê duyệt counter");
    }
  };

  // Từ chối yêu cầu điều chỉnh
  const handleReject = async (item: MeterLogItem) => {
    const reason = prompt(
      `Nhập lý do TỪ CHỐI điều chỉnh counter cho máy ${item.equipment.model}:`,
      "Chỉ số không trùng khớp với đồng hồ thực tế / Thiếu bằng chứng"
    );
    if (!reason || !reason.trim()) return;

    try {
      const res = await fetch(`/api/meters/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", reason: reason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể từ chối");

      toast.warning("Đã từ chối yêu cầu điều chỉnh counter!");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi từ chối counter");
    }
  };

  // Ghi nhận counter từ form
  const handleSaveMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipmentId || form.counterValue === "") {
      toast.warning("Vui lòng chọn thiết bị và nhập chỉ số counter");
      return;
    }

    const counterNum = Number(form.counterValue);
    const isLower = selectedEquipment && counterNum < selectedEquipment.currentCounter;

    if (isLower) {
      if (!form.adjustmentReason.trim()) {
        toast.warning("Chỉ số mới nhỏ hơn hiện tại. Vui lòng nhập Lý do điều chỉnh giảm!");
        return;
      }
      if (!form.photoUrl.trim()) {
        toast.warning("Chỉ số mới nhỏ hơn hiện tại. Yêu cầu đính kèm link ảnh chụp màn hình counter!");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: form.equipmentId,
          counterValue: counterNum,
          source: form.source,
          photoUrl: form.photoUrl || null,
          adjustmentReason: isLower ? form.adjustmentReason.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu chỉ số");

      if (data.pendingApproval) {
        toast.info(data.message || "Đã lưu bản ghi ở trạng thái Chờ duyệt.");
      } else {
        toast.success(`Đã cập nhật chỉ số ${counterNum.toLocaleString("vi-VN")} thành công!`);
      }

      setShowAddModal(false);
      setForm({
        equipmentId: "",
        counterValue: "",
        source: "MANUAL",
        photoUrl: "",
        adjustmentReason: "",
      });
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi ghi nhận counter");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = () => {
    exportToCsv(
      "nhat-ky-counter.csv",
      [
        "Thời gian",
        "Thiết bị",
        "Serial",
        "Khách hàng",
        "Chỉ số Counter",
        "Nguồn ghi nhận",
        "Người ghi",
        "Trạng thái duyệt",
        "Lý do điều chỉnh",
      ],
      filteredLogs.map((l) => [
        new Date(l.logDate).toLocaleString("vi-VN"),
        l.equipment.model,
        l.equipment.serialNumber,
        l.equipment.customer?.name || "Trong kho",
        l.counterValue,
        METER_SOURCE_LABELS[l.source] || l.source,
        l.recordedBy?.name || "Hệ thống",
        l.status === "PENDING_APPROVAL"
          ? "Chờ duyệt"
          : l.status === "APPROVED"
          ? "Đã duyệt"
          : "Từ chối",
        l.adjustmentReason || "",
      ])
    );
  };

  return (
    <div className="container-fluid p-4">
      {/* Tiêu đề & Hành động chính */}
      <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h4 className="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
            <i className="fas fa-tachometer-alt text-primary"></i>
            Quản lý Chỉ số Counter & Phê duyệt
          </h4>
          <p className="text-muted small mb-0">
            Theo dõi nhật ký chốt counter toàn hệ thống và phê duyệt các yêu cầu điều chỉnh giảm số counter.
          </p>
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={handleExport}
            title="Xuất CSV"
          >
            <i className="fas fa-download me-1"></i> Xuất CSV
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary shadow-sm"
            onClick={() => setShowAddModal(true)}
          >
            <i className="fas fa-plus me-1"></i> Ghi nhận Counter mới
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-3 p-3 bg-white">
            <div className="small text-muted mb-1">Tổng lượt ghi nhận</div>
            <div className="fs-4 fw-bold text-dark">{stats.total}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div
            className={`card border-0 shadow-sm rounded-3 p-3 cursor-pointer ${
              stats.pending > 0 ? "bg-warning-subtle border border-warning" : "bg-white"
            }`}
            onClick={() => setStatusTab("PENDING_APPROVAL")}
            style={{ cursor: "pointer" }}
          >
            <div className="small text-warning-emphasis fw-semibold mb-1">
              <i className="fas fa-clock me-1"></i> Chờ duyệt điều chỉnh
            </div>
            <div className="fs-4 fw-bold text-warning-emphasis">
              {stats.pending} {stats.pending > 0 && <span className="badge bg-danger fs-6 align-middle ms-1">Cần duyệt</span>}
            </div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-3 p-3 bg-white">
            <div className="small text-success fw-semibold mb-1">
              <i className="fas fa-check-circle me-1"></i> Đã phê duyệt / Hợp lệ
            </div>
            <div className="fs-4 fw-bold text-success">{stats.approved}</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-3 p-3 bg-white">
            <div className="small text-danger fw-semibold mb-1">
              <i className="fas fa-times-circle me-1"></i> Bị từ chối
            </div>
            <div className="fs-4 fw-bold text-danger">{stats.rejected}</div>
          </div>
        </div>
      </div>

      {/* Bộ lọc & Tìm kiếm */}
      <div className="card border-0 shadow-sm rounded-3 p-3 mb-3 bg-white">
        <div className="d-flex flex-wrap gap-2 justify-content-between align-items-center">
          <div className="d-flex flex-wrap gap-1">
            <button
              className={`btn btn-sm ${statusTab === "ALL" ? "btn-dark fw-bold" : "btn-light"}`}
              onClick={() => setStatusTab("ALL")}
            >
              Tất cả ({stats.total})
            </button>
            <button
              className={`btn btn-sm ${
                statusTab === "PENDING_APPROVAL" ? "btn-warning text-dark fw-bold" : "btn-light"
              }`}
              onClick={() => setStatusTab("PENDING_APPROVAL")}
            >
              Chờ duyệt ({stats.pending})
            </button>
            <button
              className={`btn btn-sm ${statusTab === "APPROVED" ? "btn-success fw-bold" : "btn-light"}`}
              onClick={() => setStatusTab("APPROVED")}
            >
              Đã duyệt ({stats.approved})
            </button>
            <button
              className={`btn btn-sm ${statusTab === "REJECTED" ? "btn-danger fw-bold" : "btn-light"}`}
              onClick={() => setStatusTab("REJECTED")}
            >
              Từ chối ({stats.rejected})
            </button>
          </div>

          <div className="d-flex gap-2 flex-grow-1 justify-content-end" style={{ maxWidth: "450px" }}>
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: "160px" }}
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="ALL">Mọi nguồn</option>
              {Object.entries(METER_SOURCE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white">
                <i className="fas fa-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Tìm Serial, Model, Khách hàng..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bảng danh sách */}
      {loading ? (
        <Loading text="Đang tải danh sách chỉ số Counter..." />
      ) : (
        <div className="table-responsive bg-white rounded shadow-sm border">
          <table className="table table-hover table-bordered mb-0 align-middle custom-dense-table">
            <thead className="bg-dark text-white">
              <tr>
                <th style={{ width: "135px" }}>Thời gian</th>
                <th>Thiết bị & Serial</th>
                <th>Khách hàng</th>
                <th className="text-end" style={{ width: "120px" }}>
                  Chỉ số Counter
                </th>
                <th>Lý do & Minh chứng</th>
                <th className="text-center" style={{ width: "110px" }}>
                  Nguồn
                </th>
                <th style={{ width: "130px" }}>Người ghi</th>
                <th className="text-center" style={{ width: "140px" }}>
                  Trạng thái
                </th>
                <th className="text-center" style={{ width: "150px" }}>
                  Thao tác duyệt
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-5 text-muted">
                    <i className="fas fa-tachometer-alt fa-2x mb-2 d-block text-secondary opacity-50"></i>
                    Không tìm thấy bản ghi chỉ số Counter nào phù hợp.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((item) => {
                  const isDeltaDown = item.counterValue < item.equipment.currentCounter;
                  return (
                    <tr
                      key={item.id}
                      className={item.status === "PENDING_APPROVAL" ? "table-warning" : ""}
                    >
                      <td className="font-monospace small">
                        {new Date(item.logDate).toLocaleString("vi-VN", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </td>
                      <td>
                        <div className="fw-bold text-primary">{item.equipment.model}</div>
                        <div className="small font-monospace text-muted">
                          SN: {item.equipment.serialNumber}
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold text-dark">
                          {item.equipment.customer?.name || "Trong kho"}
                        </div>
                        {item.equipment.contract && (
                          <span className="badge bg-light text-dark border font-monospace" style={{ fontSize: "10px" }}>
                            {item.equipment.contract.code}
                          </span>
                        )}
                      </td>
                      <td className="text-end font-monospace">
                        <div className="fw-bold fs-6 text-dark">
                          {item.counterValue.toLocaleString("vi-VN")}
                        </div>
                        {isDeltaDown && (
                          <div className="text-danger fw-semibold" style={{ fontSize: "11px" }}>
                            <i className="fas fa-arrow-down me-0.5"></i>
                            {(item.counterValue - item.equipment.currentCounter).toLocaleString("vi-VN")}
                          </div>
                        )}
                      </td>
                      <td>
                        {item.adjustmentReason ? (
                          <div className="small text-danger fw-semibold mb-1">
                            <i className="fas fa-info-circle me-1"></i>
                            {item.adjustmentReason}
                          </div>
                        ) : (
                          <div className="small text-muted">—</div>
                        )}

                        {item.photoUrl && (
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-primary py-0 px-1.5 rounded"
                            style={{ fontSize: "11px" }}
                            onClick={() => setPreviewPhoto(item.photoUrl)}
                          >
                            <i className="fas fa-image me-1"></i> Xem ảnh counter
                          </button>
                        )}
                      </td>
                      <td className="text-center">
                        <span className="badge bg-info-subtle text-info-emphasis border">
                          {METER_SOURCE_LABELS[item.source] || item.source}
                        </span>
                        {item.ticket && (
                          <div className="small font-monospace text-muted mt-0.5">
                            {item.ticket.code}
                          </div>
                        )}
                      </td>
                      <td className="small">{item.recordedBy?.name || "Hệ thống"}</td>
                      <td className="text-center">
                        {item.status === "PENDING_APPROVAL" ? (
                          <span className="badge bg-warning text-dark border border-warning fw-bold">
                            Chờ duyệt
                          </span>
                        ) : item.status === "APPROVED" ? (
                          <span className="badge bg-success-subtle text-success border border-success">
                            Đã duyệt
                          </span>
                        ) : (
                          <span
                            className="badge bg-danger-subtle text-danger border border-danger"
                            title={item.rejectionReason || "Bị từ chối"}
                          >
                            Từ chối
                          </span>
                        )}
                        {item.approvedBy && (
                          <div className="text-muted mt-1" style={{ fontSize: "10px" }}>
                            bởi {item.approvedBy.name}
                          </div>
                        )}
                      </td>
                      <td className="text-center">
                        {item.status === "PENDING_APPROVAL" ? (
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-success btn-sm px-2"
                              title="Duyệt điều chỉnh chỉ số này"
                              onClick={() => handleApprove(item)}
                            >
                              <i className="fas fa-check me-1"></i> Duyệt
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm px-2"
                              title="Từ chối yêu cầu"
                              onClick={() => handleReject(item)}
                            >
                              <i className="fas fa-times me-1"></i> Từ chối
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted small">—</span>
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

      {/* Modal 1: Ghi nhận Counter mới */}
      <ModalShell
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Ghi nhận Chỉ số Counter Thiết bị"
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setShowAddModal(false)}
            >
              Đóng
            </button>
            <button
              type="submit"
              form="add-meter-form"
              className="btn btn-sm btn-primary"
              disabled={submitting}
            >
              <i className="fas fa-save me-1"></i> Lưu chỉ số
            </button>
          </>
        }
      >
        <form id="add-meter-form" onSubmit={handleSaveMeter}>
          <div className="mb-3">
            <label className="form-label small fw-bold">
              Chọn Thiết bị <span className="text-danger">*</span>
            </label>
            <select
              className="form-select form-select-sm"
              required
              value={form.equipmentId}
              onChange={(e) => {
                const eq = equipments.find((x) => x.id === e.target.value);
                setForm({
                  ...form,
                  equipmentId: e.target.value,
                  counterValue: eq ? String(eq.currentCounter + 1000) : "",
                });
              }}
            >
              <option value="">-- Chọn máy --</option>
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.model} (SN: {eq.serialNumber}) — Khách: {eq.customer?.name || "Trong kho"} [Counter: {eq.currentCounter.toLocaleString("vi-VN")}]
                </option>
              ))}
            </select>
          </div>

          {selectedEquipment && (
            <div className="alert alert-info py-2 px-3 small mb-3">
              Chỉ số Counter hiện tại của máy:{" "}
              <strong className="font-monospace text-primary">
                {selectedEquipment.currentCounter.toLocaleString("vi-VN")}
              </strong>{" "}
              bản
            </div>
          )}

          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <label className="form-label small fw-bold mb-0">
                  Chỉ số Counter mới <span className="text-danger">*</span>
                </label>
                <button
                  type="button"
                  className="btn btn-xs btn-outline-warning text-dark fw-bold py-0 px-2 shadow-2xs"
                  style={{ fontSize: "11px" }}
                  onClick={() => setShowOcrModal(true)}
                  title="Tải ảnh hoặc quét số tự động từ ảnh qua AI OCR"
                >
                  <i className="fas fa-magic text-warning me-1"></i>Quét OCR
                </button>
              </div>
              <input
                type="number"
                className="form-control form-control-sm font-monospace fw-bold"
                required
                min={0}
                value={form.counterValue}
                onChange={(e) => setForm({ ...form, counterValue: e.target.value })}
                placeholder="Nhập số counter..."
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold">Nguồn ghi nhận</label>
              <select
                className="form-select form-select-sm"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as any })}
              >
                {Object.entries(METER_SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Cảnh báo khi hạ counter */}
          {selectedEquipment &&
            form.counterValue !== "" &&
            Number(form.counterValue) < selectedEquipment.currentCounter && (
              <div className="p-3 rounded-3 border border-warning bg-warning-subtle mb-3">
                <div className="small fw-bold text-warning-emphasis mb-1">
                  <i className="fas fa-exclamation-triangle me-1"></i>
                  Chỉ số mới thấp hơn chỉ số hiện tại ({selectedEquipment.currentCounter.toLocaleString("vi-VN")})
                </div>
                <div className="text-muted small mb-2">
                  Trường hợp thay bo mạch/reset đồng hồ sẽ được lưu ở trạng thái <strong>Chờ duyệt</strong> và yêu cầu cấp trên phê duyệt trước khi cập nhật vào máy.
                </div>
                <div className="mb-2">
                  <label className="form-label small fw-bold text-dark">
                    Lý do điều chỉnh giảm (*):
                  </label>
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    required
                    value={form.adjustmentReason}
                    onChange={(e) => setForm({ ...form, adjustmentReason: e.target.value })}
                    placeholder="VD: Thay bo mạch chính mới, reset counter..."
                  />
                </div>
                <div>
                  <label className="form-label small fw-bold text-dark">
                    Link ảnh chụp màn hình Counter (*):
                  </label>
                  <input
                    type="url"
                    className="form-control form-control-sm"
                    required
                    value={form.photoUrl}
                    onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
            )}

          {(!selectedEquipment ||
            form.counterValue === "" ||
            Number(form.counterValue) >= (selectedEquipment?.currentCounter ?? 0)) && (
            <div className="mb-3">
              <label className="form-label small fw-bold">Link ảnh chụp đồng hồ Counter (Tùy chọn)</label>
              <input
                type="url"
                className="form-control form-control-sm"
                placeholder="https://..."
                value={form.photoUrl}
                onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
              />
            </div>
          )}
        </form>
      </ModalShell>

      {/* Modal 2: Phóng to ảnh minh chứng */}
      {previewPhoto && (
        <div
          className="modal fade show d-block"
          tabIndex={-1}
          style={{ backgroundColor: "rgba(0,0,0,0.8)" }}
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-content rounded-4 border-0 overflow-hidden shadow-lg bg-dark">
              <div className="modal-header border-0 py-2 px-3 text-white">
                <h6 className="modal-title fw-bold">
                  <i className="fas fa-camera text-warning me-1"></i> Ảnh minh chứng chỉ số Counter
                </h6>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setPreviewPhoto(null)}
                />
              </div>
              <div className="modal-body p-0 text-center bg-black">
                <img
                  src={previewPhoto}
                  alt="Minh chứng Counter"
                  className="img-fluid"
                  style={{ maxHeight: "75vh", objectFit: "contain" }}
                />
              </div>
              <div className="modal-footer border-0 py-2 px-3 justify-content-between text-white-50 small">
                <span>Kiểm tra số trên màn hình có khớp với chỉ số khai báo</span>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setPreviewPhoto(null)}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal AI OCR Quét số Counter */}
      <MeterOcrModal
        isOpen={showOcrModal}
        onClose={() => setShowOcrModal(false)}
        imageSrc={form.photoUrl || null}
        previousCounter={selectedEquipment?.currentCounter ?? null}
        equipmentModel={
          selectedEquipment
            ? `${selectedEquipment.brand || ""} ${selectedEquipment.model}`.trim()
            : null
        }
        onApplyCounter={(val, _src, details) => {
          setForm((prev) => ({
            ...prev,
            counterValue: String(val),
            source: "OCR",
          }));
          toast.success(
            `Đã nhận diện thành công: ${val.toLocaleString("vi-VN")}${
              details?.candidateLabel ? ` (${details.candidateLabel})` : ""
            }`
          );
        }}
      />
    </div>
  );
}
