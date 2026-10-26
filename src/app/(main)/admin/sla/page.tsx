"use client";

import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import { AdminNavTabs } from "@/components/admin/AdminNavTabs";
import {
  SlaSettings,
  DEFAULT_SLA_SETTINGS,
  computeSlaDueAt,
} from "@/lib/slaSettings";
import type { TicketPriority } from "@prisma/client";

export default function AdminSlaPage() {
  const [settings, setSettings] = useState<SlaSettings>(DEFAULT_SLA_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Xem trước mô phỏng SLA
  const [simPriority, setSimPriority] = useState<TicketPriority>("URGENT");
  const [simNow, setSimNow] = useState<Date>(new Date());

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/sla");
      if (!res.ok) throw new Error("Không thể tải cấu hình SLA");
      const data = await res.json();
      if (data.settings) setSettings(data.settings);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải cấu hình SLA");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/sla", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu cấu hình");
      setSettings(data.settings);
      toast.success("Đã cập nhật cấu hình cam kết SLA thành công!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    if (confirm("Bạn có chắc chắn muốn đặt lại cấu hình SLA mặc định không?")) {
      setSettings(DEFAULT_SLA_SETTINGS);
    }
  };

  // Tính toán thời gian mẫu trực tiếp
  const simulatedDueDate = useMemo(() => {
    return computeSlaDueAt(simPriority, settings, simNow);
  }, [simPriority, settings, simNow]);

  const formatDateTimeFull = (d: Date) => {
    return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} - ${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}`;
  };

  return (
    <div className="container-fluid px-1 py-1">
      {/* Header Bar */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-primary text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-stopwatch fa-sm"></i>
          </div>
          <div>
            <h1 className="h6 mb-0 text-dark fw-bold">Cấu hình Cam kết Chất lượng Dịch vụ (SLA)</h1>
            <span className="small text-muted" style={{ fontSize: "11px" }}>
              Tùy chỉnh thời gian xử lý sự cố kỹ thuật theo mức độ ưu tiên và khung giờ làm việc
            </span>
          </div>
        </div>

        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm px-3"
            onClick={handleResetDefault}
            disabled={saving || loading}
          >
            <i className="fas fa-undo me-1"></i> Mặc định
          </button>
          <button
            type="submit"
            form="sla-form"
            className="btn btn-primary btn-sm px-3 fw-bold"
            disabled={saving || loading}
          >
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin me-1"></i> Đang lưu...
              </>
            ) : (
              <>
                <i className="fas fa-save me-1"></i> Lưu cấu hình SLA
              </>
            )}
          </button>
        </div>
      </div>

      {/* Admin Nav Tabs */}
      <AdminNavTabs activeTab="sla" />

      {loading ? (
        <div className="card shadow-sm border-0 p-5 text-center">
          <Loading />
          <span className="text-muted mt-2 small">Đang tải cấu hình SLA...</span>
        </div>
      ) : (
        <form id="sla-form" onSubmit={handleSave}>
          <div className="row g-3">
            {/* Cột trái: Form cấu hình SLA */}
            <div className="col-lg-8">
              {/* Card 1: Thời gian xử lý theo mức độ ưu tiên */}
              <div className="card shadow-sm border-0 mb-3">
                <div className="card-header bg-white py-2.5 px-3 border-bottom">
                  <h6 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                    <i className="fas fa-layer-group text-primary"></i>
                    <span>Thời gian hoàn tất cam kết theo Mức độ ưu tiên</span>
                  </h6>
                </div>
                <div className="card-body p-3">
                  <p className="text-muted small mb-3">
                    Hệ thống sẽ dựa vào số giờ cam kết này để tự động tính thời hạn chót (<strong className="text-dark">Hạn SLA</strong>) cho mỗi phiếu khi kỹ thuật viên tiếp nhận.
                  </p>

                  <div className="row g-3">
                    {/* Khẩn cấp */}
                    <div className="col-md-6">
                      <div className="p-3 border rounded-3 bg-light-subtle h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="badge bg-danger text-white px-2 py-1 fw-bold">
                            <i className="fas fa-bolt me-1"></i> KHẨN CẤP (URGENT)
                          </span>
                          <span className="small text-muted">Sự cố máy ngưng toàn bộ</span>
                        </div>
                        <div className="input-group">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="720"
                            className="form-control fw-bold fs-5 text-danger"
                            value={settings.urgentHours}
                            onChange={(e) =>
                              setSettings({ ...settings, urgentHours: parseFloat(e.target.value) || 0 })
                            }
                            required
                          />
                          <span className="input-group-text fw-semibold">giờ</span>
                        </div>
                        <div className="form-text small mt-1 text-muted">
                          Mặc định: <strong>4 giờ</strong>
                        </div>
                      </div>
                    </div>

                    {/* Mức Cao */}
                    <div className="col-md-6">
                      <div className="p-3 border rounded-3 bg-light-subtle h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="badge bg-warning text-dark px-2 py-1 fw-bold">
                            <i className="fas fa-exclamation-triangle me-1"></i> MỨC CAO (HIGH)
                          </span>
                          <span className="small text-muted">Ảnh hưởng nhiều bộ phận</span>
                        </div>
                        <div className="input-group">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="720"
                            className="form-control fw-bold fs-5 text-warning-emphasis"
                            value={settings.highHours}
                            onChange={(e) =>
                              setSettings({ ...settings, highHours: parseFloat(e.target.value) || 0 })
                            }
                            required
                          />
                          <span className="input-group-text fw-semibold">giờ</span>
                        </div>
                        <div className="form-text small mt-1 text-muted">
                          Mặc định: <strong>8 giờ</strong> (trong ngày)
                        </div>
                      </div>
                    </div>

                    {/* Bình thường */}
                    <div className="col-md-6">
                      <div className="p-3 border rounded-3 bg-light-subtle h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="badge bg-primary text-white px-2 py-1 fw-bold">
                            <i className="fas fa-clock me-1"></i> BÌNH THƯỜNG (NORMAL)
                          </span>
                          <span className="small text-muted">Sự cố thông thường, vật tư</span>
                        </div>
                        <div className="input-group">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="720"
                            className="form-control fw-bold fs-5 text-primary"
                            value={settings.normalHours}
                            onChange={(e) =>
                              setSettings({ ...settings, normalHours: parseFloat(e.target.value) || 0 })
                            }
                            required
                          />
                          <span className="input-group-text fw-semibold">giờ</span>
                        </div>
                        <div className="form-text small mt-1 text-muted">
                          Mặc định: <strong>24 giờ</strong> (1 ngày)
                        </div>
                      </div>
                    </div>

                    {/* Mức Thấp */}
                    <div className="col-md-6">
                      <div className="p-3 border rounded-3 bg-light-subtle h-100">
                        <div className="d-flex align-items-center justify-content-between mb-2">
                          <span className="badge bg-secondary text-white px-2 py-1 fw-bold">
                            <i className="fas fa-calendar-check me-1"></i> MỨC THẤP (LOW)
                          </span>
                          <span className="small text-muted">Khảo sát, bảo dưỡng định kỳ</span>
                        </div>
                        <div className="input-group">
                          <input
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="720"
                            className="form-control fw-bold fs-5 text-secondary"
                            value={settings.lowHours}
                            onChange={(e) =>
                              setSettings({ ...settings, lowHours: parseFloat(e.target.value) || 0 })
                            }
                            required
                          />
                          <span className="input-group-text fw-semibold">giờ</span>
                        </div>
                        <div className="form-text small mt-1 text-muted">
                          Mặc định: <strong>48 giờ</strong> (2 ngày)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Quy tắc giờ làm việc hành chính */}
              <div className="card shadow-sm border-0">
                <div className="card-header bg-white py-2.5 px-3 border-bottom">
                  <h6 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                    <i className="fas fa-business-time text-success"></i>
                    <span>Quy tắc tính toán theo Giờ làm việc hành chính</span>
                  </h6>
                </div>
                <div className="card-body p-3">
                  <div className="form-check form-switch mb-3">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id="businessHoursOnly"
                      checked={settings.businessHoursOnly}
                      onChange={(e) =>
                        setSettings({ ...settings, businessHoursOnly: e.target.checked })
                      }
                      style={{ cursor: "pointer", width: "2.5em", height: "1.25em" }}
                    />
                    <label
                      className="form-check-label fw-bold ms-2"
                      htmlFor="businessHoursOnly"
                      style={{ cursor: "pointer" }}
                    >
                      Chỉ tính thời gian trong khung giờ làm việc hành chính
                    </label>
                    <div className="text-muted small ms-2">
                      Nếu bật: Các khoảng thời gian ngoài giờ (buổi tối, Chủ Nhật) sẽ không bị trừ vào thời gian cam kết của kỹ thuật viên.
                    </div>
                  </div>

                  {settings.businessHoursOnly ? (
                    <div className="p-3 bg-light rounded-3 border mt-3">
                      <div className="row g-3 align-items-center">
                        <div className="col-sm-6">
                          <label className="form-label small fw-bold text-dark">
                            Giờ bắt đầu làm việc:
                          </label>
                          <div className="input-group">
                            <input
                              type="number"
                              min="0"
                              max="23"
                              className="form-control"
                              value={settings.businessStartHour}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  businessStartHour: parseInt(e.target.value) || 8,
                                })
                              }
                            />
                            <span className="input-group-text">:00</span>
                          </div>
                        </div>

                        <div className="col-sm-6">
                          <label className="form-label small fw-bold text-dark">
                            Giờ kết thúc làm việc:
                          </label>
                          <div className="input-group">
                            <input
                              type="number"
                              min="1"
                              max="24"
                              className="form-control"
                              value={settings.businessEndHour}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  businessEndHour: parseInt(e.target.value) || 17,
                                })
                              }
                            />
                            <span className="input-group-text">:00</span>
                          </div>
                        </div>

                        <div className="col-12 mt-2">
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id="includeSaturday"
                              checked={settings.includeSaturday}
                              onChange={(e) =>
                                setSettings({ ...settings, includeSaturday: e.target.checked })
                              }
                            />
                            <label className="form-check-label small fw-semibold" htmlFor="includeSaturday">
                              Tính cả ngày Thứ Bảy là ngày làm việc (Chủ Nhật luôn nghỉ)
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 bg-light-subtle rounded-3 border text-secondary small d-flex align-items-center gap-2">
                      <i className="fas fa-info-circle text-primary"></i>
                      <span>
                        Chế độ hiện tại: <strong>Tính liên tục 24/7</strong> (Thời gian SLA được cộng dồn trực tiếp liên tục kể từ lúc tạo phiếu).
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cột phải: Mô phỏng & Hướng dẫn */}
            <div className="col-lg-4">
              {/* Card Mô phỏng tính toán */}
              <div className="card shadow-sm border-0 mb-3 border-top border-4 border-primary">
                <div className="card-header bg-white py-2.5 px-3 border-bottom">
                  <h6 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                    <i className="fas fa-calculator text-primary"></i>
                    <span>Mô phỏng hạn SLA thực tế</span>
                  </h6>
                </div>
                <div className="card-body p-3">
                  <div className="mb-3">
                    <label className="form-label small fw-bold text-muted">
                      Chọn mức ưu tiên thử nghiệm:
                    </label>
                    <div className="d-flex flex-wrap gap-1">
                      {(["URGENT", "HIGH", "NORMAL", "LOW"] as TicketPriority[]).map((p) => {
                        const labels: Record<TicketPriority, string> = {
                          URGENT: "Khẩn cấp",
                          HIGH: "Mức cao",
                          NORMAL: "Bình thường",
                          LOW: "Mức thấp",
                        };
                        return (
                          <button
                            key={p}
                            type="button"
                            className={`btn btn-sm ${
                              simPriority === p ? "btn-primary fw-bold" : "btn-outline-secondary"
                            }`}
                            style={{ fontSize: "12px" }}
                            onClick={() => setSimPriority(p)}
                          >
                            {labels[p]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-3 bg-light rounded-3 border">
                    <div className="small text-muted mb-1">
                      Thời điểm tiếp nhận (mẫu):
                    </div>
                    <div className="fw-semibold text-dark mb-2">
                      <i className="far fa-clock me-1 text-secondary"></i>
                      {formatDateTimeFull(simNow)}
                    </div>

                    <div className="small text-muted mb-1">
                      Thời hạn cam kết hoàn tất:
                    </div>
                    <div className="h5 fw-bold text-danger mb-2">
                      <i className="fas fa-flag-checkered me-1.5"></i>
                      {formatDateTimeFull(simulatedDueDate)}
                    </div>

                    <div className="border-top pt-2 mt-2">
                      <span className="small text-muted d-block mb-1">Giao diện kỹ thuật viên sẽ thấy:</span>
                      <span className="badge bg-light text-dark border p-2 d-inline-flex align-items-center gap-1.5">
                        <i className="far fa-clock text-secondary"></i>
                        <span>
                          Hạn SLA: {simulatedDueDate.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}{" "}
                          {simulatedDueDate.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })}
                        </span>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm w-100 mt-2"
                    onClick={() => setSimNow(new Date())}
                    style={{ fontSize: "11.5px" }}
                  >
                    <i className="fas fa-sync-alt me-1"></i> Cập nhật thời điểm hiện tại
                  </button>
                </div>
              </div>

              {/* Card Hướng dẫn vận hành */}
              <div className="card shadow-sm border-0 bg-light-subtle">
                <div className="card-header bg-white py-2.5 px-3 border-bottom">
                  <h6 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                    <i className="fas fa-lightbulb text-warning"></i>
                    <span>Lưu ý vận hành SLA</span>
                  </h6>
                </div>
                <div className="card-body p-3 small text-muted" style={{ lineHeight: "1.6" }}>
                  <ul className="ps-3 mb-0">
                    <li className="mb-1.5">
                      Cấu hình mới sẽ áp dụng ngay cho các phiếu kỹ thuật được tạo tiếp theo.
                    </li>
                    <li className="mb-1.5">
                      Các phiếu đang xử lý dở dang sẽ giữ nguyên mốc thời gian đã cam kết ban đầu để đảm bảo tính minh bạch.
                    </li>
                    <li>
                      Khi vượt quá mốc SLA, hệ thống sẽ tự động chuyển màu cảnh báo sang <strong>màu đỏ</strong> trên cả màn hình di động của Kỹ thuật viên và bàn Điều phối.
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
