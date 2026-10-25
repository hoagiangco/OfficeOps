"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import { Loading } from "@/components/Loading";
import { exportToCsv } from "@/lib/csv";

interface MaintenanceScheduleItem {
  id: string;
  equipmentId: string;
  contractId: string | null;
  intervalDays: number;
  nextDueDate: string;
  lastRunAt: string | null;
  isActive: boolean;
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    brand: string | null;
    currentCounter: number;
    customer?: { id: string; name: string; phone: string; address: string } | null;
  };
  contract?: { id: string; code: string } | null;
}

interface EquipmentOption {
  id: string;
  serialNumber: string;
  model: string;
  contractId: string | null;
  customer?: { name: string } | null;
}

export default function MaintenancePage() {
  const [schedules, setSchedules] = useState<MaintenanceScheduleItem[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dueFilter, setDueFilter] = useState<"" | "OVERDUE" | "DUE_SOON">("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<MaintenanceScheduleItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [runningCron, setRunningCron] = useState(false);
  const [cronResult, setCronResult] = useState<{
    timestamp: string;
    maintenanceTicketsCreated: number;
    lowStockAlerts: number;
    expiringContractsAlerts: number;
    slaBreachAlerts: number;
    details: {
      tickets: string[];
      lowStockParts: string[];
      expiringContracts: string[];
      slaBreachedTickets: string[];
    };
  } | null>(null);

  const handleRunDailyCron = async () => {
    setRunningCron(true);
    try {
      const res = await fetch("/api/cron/daily", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể thực thi Cron Job");
      setCronResult(data);
      toast.success("Đã hoàn tất quét tự động toàn hệ thống!");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi khi chạy quét hệ thống");
    } finally {
      setRunningCron(false);
    }
  };
  const [form, setForm] = useState({
    equipmentId: "",
    intervalDays: 30,
    nextDueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10),
    isActive: true,
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [schRes, eqRes] = await Promise.all([
        fetch("/api/maintenance"),
        fetch("/api/equipment?pageSize=100"),
      ]);
      if (schRes.ok) {
        const d = await schRes.json();
        setSchedules(Array.isArray(d) ? d : d.items || []);
      }
      if (eqRes.ok) {
        const d = await eqRes.json();
        setEquipmentList(Array.isArray(d) ? d : d.items || []);
      }
    } catch {
      toast.error("Lỗi tải lịch bảo trì định kỳ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const enrichedSchedules = useMemo(() => {
    const now = Date.now();
    return schedules.map((s) => {
      const dueMs = new Date(s.nextDueDate).getTime();
      const daysUntilDue = Math.ceil((dueMs - now) / (24 * 3600 * 1000));
      const isOverdue = daysUntilDue < 0;
      const isDueSoon = daysUntilDue >= 0 && daysUntilDue <= 7;
      return { ...s, daysUntilDue, isOverdue, isDueSoon };
    });
  }, [schedules]);

  const filtered = useMemo(() => {
    return enrichedSchedules.filter((s) => {
      if (dueFilter === "OVERDUE" && !s.isOverdue) return false;
      if (dueFilter === "DUE_SOON" && !s.isDueSoon) return false;
      if (q.trim()) {
        const kw = q.trim().toLowerCase();
        const match =
          s.equipment.serialNumber.toLowerCase().includes(kw) ||
          s.equipment.model.toLowerCase().includes(kw) ||
          (s.equipment.customer?.name || "").toLowerCase().includes(kw) ||
          (s.contract?.code || "").toLowerCase().includes(kw);
        if (!match) return false;
      }
      return true;
    });
  }, [enrichedSchedules, dueFilter, q]);

  const handleGenerateTickets = async (scheduleId?: string) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "GENERATE_DUE",
          ...(scheduleId ? { scheduleId } : {}),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể sinh phiếu bảo trì");
      if (body.generatedCount === 0) {
        toast.info(body.message || "Chưa có lịch nào đến hạn cần sinh phiếu");
      } else {
        toast.success(`Đã tự động sinh ${body.generatedCount} phiếu bảo trì định kỳ!`);
      }
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi sinh phiếu bảo trì");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance", {
        method: editingSchedule ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingSchedule
            ? {
                id: editingSchedule.id,
                intervalDays: Number(form.intervalDays),
                nextDueDate: form.nextDueDate,
                isActive: form.isActive,
              }
            : {
                equipmentId: form.equipmentId,
                intervalDays: Number(form.intervalDays),
                nextDueDate: form.nextDueDate,
                isActive: form.isActive,
              }
        ),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể lưu lịch bảo trì");
      toast.success(
        editingSchedule ? "Đã cập nhật lịch bảo dưỡng" : "Đã tạo lịch bảo dưỡng định kỳ mới"
      );
      setShowCreateModal(false);
      setEditingSchedule(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu lịch");
    } finally {
      setSubmitting(false);
    }
  };

  const openEditSchedule = (s: MaintenanceScheduleItem) => {
    setEditingSchedule(s);
    setForm({
      equipmentId: s.equipmentId,
      intervalDays: s.intervalDays,
      nextDueDate: new Date(s.nextDueDate).toISOString().slice(0, 10),
      isActive: s.isActive,
    });
    setShowCreateModal(true);
  };

  const handleDeleteSchedule = async (s: MaintenanceScheduleItem) => {
    if (!confirm(`Xóa lịch bảo trì của máy ${s.equipment.model} (${s.equipment.serialNumber})?`))
      return;
    const res = await fetch(`/api/maintenance?id=${s.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || "Không thể xóa lịch bảo trì");
      return;
    }
    toast.success("Đã xóa lịch bảo trì");
    fetchData();
  };

  const handleExportCsv = () => {
    exportToCsv(
      "lich-bao-tri-dinh-ky.csv",
      ["Model", "Serial", "Khách hàng", "Mã Hợp đồng", "Chu kỳ (ngày)", "Kỳ tiếp theo", "Trạng thái"],
      filtered.map((s) => [
        s.equipment.model,
        s.equipment.serialNumber,
        s.equipment.customer?.name || "Trong kho",
        s.contract?.code || "",
        s.intervalDays,
        new Date(s.nextDueDate).toLocaleDateString("vi-VN"),
        s.isActive ? "Đang bật" : "Tạm dừng",
      ])
    );
  };

  const overdueCount = enrichedSchedules.filter((s) => s.isOverdue).length;
  const dueSoonCount = enrichedSchedules.filter((s) => s.isDueSoon).length;

  return (
    <div className="container-fluid px-0">
      {/* Header Bar chuẩn HoaGiang */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-white p-3 rounded shadow-sm border-bottom">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
            <i className="fas fa-wrench text-primary"></i>
            <span>Bảo trì định kỳ</span>
          </h5>
          <span className="badge bg-light text-dark border">
            Tổng lịch: <strong>{schedules.length}</strong>
          </span>
          <span className="badge bg-danger-subtle text-danger border border-danger-subtle">
            Quá hạn: <strong>{overdueCount}</strong>
          </span>
          <span className="badge bg-warning-subtle text-dark border border-warning-subtle">
            Sắp đến hạn (&le; 7 ngày): <strong>{dueSoonCount}</strong>
          </span>
        </div>

        <div className="d-flex gap-2 mt-2 mt-md-0">
          <button
            type="button"
            className="btn btn-sm btn-outline-success"
            onClick={handleExportCsv}
          >
            <i className="fas fa-file-excel me-1"></i> Xuất Excel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-dark fw-semibold shadow-sm d-flex align-items-center gap-1.5"
            disabled={runningCron || submitting}
            onClick={handleRunDailyCron}
            title="Kích hoạt Cron Job quét tự động: Sinh phiếu bảo trì, cảnh báo tồn kho, hợp đồng sắp hết hạn & SLA"
          >
            <i className={`fas fa-${runningCron ? "spinner fa-spin" : "bolt"} text-warning`}></i>
            <span>{runningCron ? "Đang quét..." : "Quét tự động (Cron)"}</span>
          </button>
          <button
            type="button"
            className="btn btn-sm btn-warning fw-semibold"
            disabled={submitting || runningCron}
            onClick={() => handleGenerateTickets()}
          >
            <i className="fas fa-magic me-1"></i> Tạo phiếu đến hạn
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={() => {
              setEditingSchedule(null);
              setForm({
                equipmentId: "",
                intervalDays: 30,
                nextDueDate: new Date(Date.now() + 7 * 24 * 3600 * 1000)
                  .toISOString()
                  .slice(0, 10),
                isActive: true,
              });
              setShowCreateModal(true);
            }}
          >
            <i className="fas fa-plus me-1"></i> Tạo lịch
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-light p-2 rounded border mb-2">
        <div className="row g-2 align-items-center">
          <div className="col-md-5">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-white">
                <i className="fas fa-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Tìm theo Serial, Model, Khách hàng, Mã hợp đồng..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
          </div>
          <div className="col-md-4">
            <select
              className="form-select form-select-sm"
              value={dueFilter}
              onChange={(e) => setDueFilter(e.target.value as "" | "OVERDUE" | "DUE_SOON")}
            >
              <option value="">-- Tất cả lịch bảo dưỡng --</option>
              <option value="OVERDUE">Đã quá hạn bảo dưỡng</option>
              <option value="DUE_SOON">Sắp đến hạn trong 7 ngày tới</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <Loading text="Đang tải lịch bảo trì định kỳ..." />
      ) : (
        <div className="table-responsive bg-white rounded shadow-sm border">
          <table className="table table-hover table-bordered mb-0 custom-dense-table table-sticky-header align-middle">
            <thead className="bg-dark text-white">
              <tr>
                <th>Thiết bị (Model / Serial)</th>
                <th>Khách hàng & Hợp đồng</th>
                <th className="text-center">Chu kỳ</th>
                <th>Lần bảo trì gần nhất</th>
                <th>Kỳ bảo trì tiếp theo</th>
                <th className="text-center">Trạng thái hạn</th>
                <th className="text-center" style={{ width: "160px" }}>
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-4 text-muted">
                    Chưa có lịch bảo dưỡng nào phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => (
                  <tr
                    key={s.id}
                    className={
                      s.isOverdue
                        ? "bg-danger-subtle"
                        : s.isDueSoon
                        ? "bg-warning-subtle"
                        : ""
                    }
                  >
                    <td>
                      <Link
                        href={`/equipment/${s.equipment.id}`}
                        className="fw-bold text-primary text-decoration-none"
                      >
                        {s.equipment.model}
                      </Link>
                      <div className="small text-muted font-monospace">
                        SN: {s.equipment.serialNumber} | Counter:{" "}
                        {s.equipment.currentCounter.toLocaleString("vi-VN")}
                      </div>
                    </td>
                    <td>
                      <div className="fw-semibold">
                        {s.equipment.customer?.name || "Chưa gán khách hàng"}
                      </div>
                      {s.contract && (
                        <span className="badge bg-light text-dark border font-monospace">
                          HĐ: {s.contract.code}
                        </span>
                      )}
                    </td>
                    <td className="text-center fw-bold">{s.intervalDays} ngày</td>
                    <td>
                      {s.lastRunAt
                        ? new Date(s.lastRunAt).toLocaleDateString("vi-VN")
                        : "Chưa chạy lần nào"}
                    </td>
                    <td className="fw-bold font-monospace">
                      {new Date(s.nextDueDate).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="text-center">
                      {s.isOverdue ? (
                        <span className="badge bg-danger">
                          Quá hạn {Math.abs(s.daysUntilDue)} ngày
                        </span>
                      ) : s.isDueSoon ? (
                        <span className="badge bg-warning text-dark">
                          Còn {s.daysUntilDue} ngày
                        </span>
                      ) : (
                        <span className="badge bg-success-subtle text-success border">
                          Còn {s.daysUntilDue} ngày
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          disabled={submitting || !s.equipment.customer}
                          onClick={() => handleGenerateTickets(s.id)}
                          title="Sinh phiếu bảo trì ngay cho máy này"
                        >
                          <i className="fas fa-calendar-plus"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => openEditSchedule(s)}
                          title="Sửa lịch bảo trì"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          onClick={() => handleDeleteSchedule(s)}
                          title="Xóa lịch bảo trì"
                        >
                          <i className="fas fa-trash-alt"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <ModalShell
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingSchedule(null);
        }}
        title={
          editingSchedule
            ? `Cập nhật Lịch Bảo dưỡng – ${editingSchedule.equipment.model}`
            : "Thiết lập Lịch Bảo dưỡng Định kỳ"
        }
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => {
                setShowCreateModal(false);
                setEditingSchedule(null);
              }}
            >
              Đóng
            </button>
            <button
              type="submit"
              form="create-maint-form"
              className="btn btn-sm btn-primary"
              disabled={submitting}
            >
              <i className="fas fa-save me-1"></i> Lưu lịch bảo dưỡng
            </button>
          </>
        }
      >
        <form id="create-maint-form" onSubmit={handleCreateSchedule}>
          <div className="mb-3">
            <label className="form-label small fw-bold">
              Chọn Thiết bị <span className="text-danger">*</span>
            </label>
            <select
              className="form-select form-select-sm"
              required
              disabled={!!editingSchedule}
              value={form.equipmentId}
              onChange={(e) => setForm({ ...form, equipmentId: e.target.value })}
            >
              <option value="">-- Chọn máy cần lập lịch --</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.model} - SN: {eq.serialNumber} (
                  {eq.customer?.name || "Trong kho"})
                </option>
              ))}
            </select>
          </div>
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-bold">Chu kỳ bảo dưỡng (Ngày)</label>
              <input
                type="number"
                className="form-control form-control-sm"
                min={7}
                max={365}
                required
                value={form.intervalDays}
                onChange={(e) =>
                  setForm({ ...form, intervalDays: Number(e.target.value) })
                }
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-bold">Ngày bảo dưỡng tiếp theo</label>
              <input
                type="date"
                className="form-control form-control-sm"
                required
                value={form.nextDueDate}
                onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })}
              />
            </div>
            <div className="col-12">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="schedActiveSwitch"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                <label className="form-check-label small fw-semibold" htmlFor="schedActiveSwitch">
                  Kích hoạt tự động theo dõi & sinh phiếu bảo trì
                </label>
              </div>
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal Kết Quả Quét Tự Động Toàn Hệ Thống (Cron Daily) */}
      <ModalShell
        open={!!cronResult}
        onClose={() => setCronResult(null)}
        title="Kết Quả Quét Tự Động Toàn Hệ Thống (Cron Job)"
        size="lg"
        footer={
          <button
            type="button"
            className="btn btn-sm btn-dark px-4 fw-bold"
            onClick={() => setCronResult(null)}
          >
            Đóng
          </button>
        }
      >
        {cronResult && (
          <div>
            <div className="alert alert-success d-flex align-items-center gap-2 py-2 mb-3 small">
              <i className="fas fa-check-circle fa-lg text-success"></i>
              <div>
                Tác vụ quét hệ thống đã chạy xong lúc <strong>{new Date(cronResult.timestamp).toLocaleString("vi-VN")}</strong>. Các cảnh báo và phiếu mới đã được phát hành tự động.
              </div>
            </div>

            <div className="row g-2 mb-3 text-center small">
              <div className="col-3">
                <div className="p-2 border rounded bg-light">
                  <div className="text-muted">Phiếu bảo trì tạo mới</div>
                  <div className="fs-5 fw-bold text-primary font-monospace">{cronResult.maintenanceTicketsCreated}</div>
                </div>
              </div>
              <div className="col-3">
                <div className="p-2 border rounded bg-light">
                  <div className="text-muted">Linh kiện tồn thấp</div>
                  <div className="fs-5 fw-bold text-danger font-monospace">{cronResult.lowStockAlerts}</div>
                </div>
              </div>
              <div className="col-3">
                <div className="p-2 border rounded bg-light">
                  <div className="text-muted">HĐ sắp hết hạn (&le;30d)</div>
                  <div className="fs-5 fw-bold text-warning font-monospace">{cronResult.expiringContractsAlerts}</div>
                </div>
              </div>
              <div className="col-3">
                <div className="p-2 border rounded bg-light">
                  <div className="text-muted">Phiếu quá hạn SLA</div>
                  <div className="fs-5 fw-bold text-danger font-monospace">{cronResult.slaBreachAlerts}</div>
                </div>
              </div>
            </div>

            {/* Danh sách chi tiết */}
            <div className="d-flex flex-column gap-2 small">
              {cronResult.details.tickets.length > 0 && (
                <div className="border rounded p-2 bg-light">
                  <strong className="text-primary d-block mb-1">
                    <i className="fas fa-wrench me-1"></i> Phiếu kỹ thuật bảo trì vừa sinh:
                  </strong>
                  <ul className="mb-0 ps-3">
                    {cronResult.details.tickets.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              {cronResult.details.lowStockParts.length > 0 && (
                <div className="border rounded p-2 bg-light">
                  <strong className="text-danger d-block mb-1">
                    <i className="fas fa-exclamation-triangle me-1"></i> Cảnh báo linh kiện dưới ngưỡng tồn:
                  </strong>
                  <ul className="mb-0 ps-3">
                    {cronResult.details.lowStockParts.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}

              {cronResult.details.expiringContracts.length > 0 && (
                <div className="border rounded p-2 bg-light">
                  <strong className="text-warning-emphasis d-block mb-1">
                    <i className="fas fa-file-contract me-1"></i> Hợp đồng cần lưu ý tái ký:
                  </strong>
                  <ul className="mb-0 ps-3">
                    {cronResult.details.expiringContracts.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
