"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import { Loading } from "@/components/Loading";
import { METER_SOURCE_LABELS } from "@/lib/labels";
import { exportToCsv } from "@/lib/csv";
import { MeterOcrModal } from "@/components/ocr/MeterOcrModal";
import SearchableSelect, { SelectOption } from "@/components/ui/SearchableSelect";

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
    serialNumber?: string | null;
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
  serialNumber?: string | null;
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

  // Modal 3: Từ chối duyệt counter
  const [rejectItem, setRejectItem] = useState<MeterLogItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedReasonPreset, setSelectedReasonPreset] = useState("");

  // Modal 4: Phê duyệt điều chỉnh counter
  const [approveItem, setApproveItem] = useState<MeterLogItem | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [metersRes, eqRes] = await Promise.all([
        fetch("/api/meters"),
        fetch("/api/equipment?pageSize=1000"),
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
    let ignore = false;
    (async () => {
      try {
        const [metersRes, eqRes] = await Promise.all([
          fetch("/api/meters"),
          fetch("/api/equipment?pageSize=1000"),
        ]);
        if (!ignore) {
          if (metersRes.ok) {
            const d = await metersRes.json();
            setLogs(Array.isArray(d) ? d : []);
          }
          if (eqRes.ok) {
            const d = await eqRes.json();
            setEquipments(d.items || []);
          }
        }
      } catch {
        if (!ignore) toast.error("Lỗi khi nạp dữ liệu chỉ số counter");
      } finally {
        if (!ignore) setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // Danh sách thiết bị dạng options cho SearchableSelect (hỗ trợ tìm nhanh model, serial, khách hàng)
  const equipmentSelectOptions: SelectOption[] = useMemo(() => {
    return equipments.map((eq) => ({
      value: eq.id,
      label: `${eq.model}${eq.serialNumber ? ` (SN: ${eq.serialNumber})` : ""}`,
      sublabel: `Khách hàng: ${eq.customer?.name || "Trong kho"}${eq.brand ? ` • Hãng: ${eq.brand}` : ""}`,
      badge: `Counter: ${eq.currentCounter.toLocaleString("vi-VN")}`,
      icon: "fas fa-print",
    }));
  }, [equipments]);

  // Danh sách nguồn ghi nhận
  const sourceSelectOptions: SelectOption[] = useMemo(() => [
    { value: "MANUAL", label: "Thủ công (Khai báo)", icon: "fas fa-keyboard", sublabel: "Nhập trực tiếp tại văn phòng" },
    { value: "OCR", label: "AI Quét ảnh (OCR)", icon: "fas fa-magic", sublabel: "Nhận diện từ ảnh đồng hồ" },
    { value: "TECH", label: "Kỹ thuật viên (Bảo trì)", icon: "fas fa-tools", sublabel: "Ghi nhận qua phiếu kỹ thuật" },
    { value: "CUSTOMER", label: "Khách hàng báo", icon: "fas fa-user-check", sublabel: "Khách tự chụp / báo số" },
  ], []);

  // Filter nguồn ghi nhận
  const filterSourceOptions: SelectOption[] = useMemo(() => [
    { value: "ALL", label: "Mọi nguồn", icon: "fas fa-layer-group" },
    ...sourceSelectOptions,
  ], [sourceSelectOptions]);

  // Các mẫu lý do từ chối thường gặp
  const rejectReasonPresets: SelectOption[] = useMemo(() => [
    {
      value: "Chỉ số không trùng khớp với đồng hồ thực tế / Thiếu bằng chứng",
      label: "Chỉ số không trùng khớp với đồng hồ thực tế",
      sublabel: "Ảnh minh chứng hoặc chỉ số không khớp với thực tế kiểm tra",
      icon: "fas fa-times-circle",
    },
    {
      value: "Ảnh chụp màn hình quá mờ, không xác thực được số counter",
      label: "Ảnh chụp màn hình mờ / không xem được",
      sublabel: "Yêu cầu chụp lại rõ nét cả góc máy và đồng hồ",
      icon: "fas fa-camera",
    },
    {
      value: "Chỉ số khai báo nhỏ hơn chỉ số chốt kỳ trước bất hợp lý mà không có biên bản",
      label: "Giảm counter bất hợp lý / Thiếu biên bản",
      sublabel: "Chỉ số giảm phải có biên bản kỹ thuật ký xác nhận",
      icon: "fas fa-file-invoice",
    },
    {
      value: "Kỹ thuật viên chọn nhầm máy hoặc nhầm số serial thiết bị",
      label: "Chọn nhầm máy hoặc số serial",
      sublabel: "Máy khai báo không tương ứng với phiếu kỹ thuật",
      icon: "fas fa-random",
    },
    {
      value: "Cần bổ sung biên bản bàn giao linh kiện / thay cụm sấy / thay bo mạch chính",
      label: "Thiếu biên bản thay linh kiện / bo mạch",
      sublabel: "Yêu cầu bổ sung tài liệu trước khi duyệt reset counter",
      icon: "fas fa-microchip",
    },
    {
      value: "Đồng hồ không có dấu hiệu reset, yêu cầu KTV xác minh lại tại hiện trường",
      label: "Yêu cầu KTV xác minh lại hiện trường",
      sublabel: "Cần kiểm tra kỹ cơ chế counter của máy",
      icon: "fas fa-search-location",
    },
    {
      value: "OTHER",
      label: "Lý do khác (Tự nhập chi tiết)",
      sublabel: "Tự viết nội dung lý do từ chối vào ô bên dưới",
      icon: "fas fa-pen",
    },
  ], []);

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
        (item.equipment.serialNumber ? item.equipment.serialNumber.toLowerCase().includes(kw) : false) ||
        item.equipment.model.toLowerCase().includes(kw) ||
        (item.equipment.customer?.name || "").toLowerCase().includes(kw) ||
        (item.recordedBy?.name || "").toLowerCase().includes(kw) ||
        (item.adjustmentReason || "").toLowerCase().includes(kw)
      );
    });
  }, [logs, statusTab, sourceFilter, q]);

  // Phê duyệt điều chỉnh counter - Mở modal xác nhận
  const handleApprove = (item: MeterLogItem) => {
    setApproveItem(item);
  };

  const handleConfirmApprove = async () => {
    if (!approveItem) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/meters/${approveItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVE" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể phê duyệt");

      toast.success(
        `Đã phê duyệt và cập nhật counter máy thành ${approveItem.counterValue.toLocaleString("vi-VN")}!`
      );
      setApproveItem(null);
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi phê duyệt counter");
    } finally {
      setSubmitting(false);
    }
  };

  // Từ chối yêu cầu điều chỉnh - Mở modal có dropdown chọn nhanh lý do
  const handleReject = (item: MeterLogItem) => {
    setRejectItem(item);
    const defaultReason = "Chỉ số không trùng khớp với đồng hồ thực tế / Thiếu bằng chứng";
    setRejectReason(defaultReason);
    setSelectedReasonPreset(defaultReason);
  };

  const handleConfirmReject = async () => {
    if (!rejectItem) return;
    if (!rejectReason.trim()) {
      toast.warning("Vui lòng nhập lý do từ chối yêu cầu điều chỉnh counter");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/meters/${rejectItem.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "REJECT", reason: rejectReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể từ chối");

      toast.warning("Đã từ chối yêu cầu điều chỉnh counter!");
      setRejectItem(null);
      setRejectReason("");
      setSelectedReasonPreset("");
      fetchData();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi từ chối counter");
    } finally {
      setSubmitting(false);
    }
  };

  // Ghi nhận counter từ form
  const handleSaveMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipmentId) {
      toast.warning("Vui lòng chọn thiết bị cần ghi nhận counter");
      return;
    }
    if (form.counterValue === "") {
      toast.warning("Vui lòng nhập chỉ số counter");
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
        l.equipment.serialNumber || "",
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

          <div className="d-flex gap-2 flex-grow-1 justify-content-end align-items-center" style={{ maxWidth: "520px" }}>
            <div style={{ width: "175px" }} className="flex-shrink-0">
              <SearchableSelect
                value={sourceFilter}
                onChange={setSourceFilter}
                options={filterSourceOptions}
                placeholder="Lọc theo nguồn..."
                searchPlaceholder="Tìm nguồn..."
              />
            </div>
            <div className="input-group input-group-sm flex-grow-1">
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
              {q && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setQ("")}
                  title="Xóa tìm kiếm"
                >
                  <i className="fas fa-times"></i>
                </button>
              )}
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
                        {item.equipment.serialNumber && (
                          <div className="small font-monospace text-muted">
                            SN: {item.equipment.serialNumber}
                          </div>
                        )}
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
            <SearchableSelect
              value={form.equipmentId}
              onChange={(val) => {
                const eq = equipments.find((x) => x.id === val);
                setForm({
                  ...form,
                  equipmentId: val,
                  counterValue: eq ? String(eq.currentCounter + 1000) : "",
                });
              }}
              options={equipmentSelectOptions}
              placeholder="-- Tìm & chọn thiết bị (Model, Serial, Khách hàng) --"
              searchPlaceholder="Tìm theo Model, Serial, Khách hàng..."
              allowClear
              menuMinWidth={450}
            />
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
              <label className="form-label small fw-bold mb-1">Nguồn ghi nhận</label>
              <SearchableSelect
                value={form.source}
                onChange={(val) => setForm({ ...form, source: val as "MANUAL" | "OCR" | "TECH" | "CUSTOMER" })}
                options={sourceSelectOptions}
                placeholder="-- Chọn nguồn ghi nhận --"
                searchPlaceholder="Tìm nguồn..."
              />
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

      {/* Modal 3: Từ chối yêu cầu điều chỉnh Counter (Hỗ trợ dropdown chọn nhanh lý do) */}
      <ModalShell
        open={Boolean(rejectItem)}
        onClose={() => !submitting && setRejectItem(null)}
        title="Từ chối yêu cầu điều chỉnh Counter"
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setRejectItem(null)}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger fw-semibold"
              disabled={submitting || !rejectReason.trim()}
              onClick={handleConfirmReject}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  Đang xử lý...
                </>
              ) : (
                <>
                  <i className="fas fa-times me-1"></i> Xác nhận Từ chối
                </>
              )}
            </button>
          </>
        }
      >
        {rejectItem && (
          <div>
            <div className="alert alert-warning py-2.5 px-3 small mb-3">
              <div className="fw-bold mb-1 d-flex align-items-center gap-1.5">
                <i className="fas fa-exclamation-triangle text-danger"></i>
                <span>Từ chối yêu cầu điều chỉnh chỉ số counter</span>
              </div>
              <div className="text-secondary mb-1">
                Thiết bị: <strong className="text-dark">{rejectItem.equipment.model}</strong>
                {rejectItem.equipment.serialNumber && (
                  <span className="font-monospace ms-1">(SN: {rejectItem.equipment.serialNumber})</span>
                )}
                {" — "}Khách hàng: <strong>{rejectItem.equipment.customer?.name || "Trong kho"}</strong>
              </div>
              <div className="d-flex justify-content-between align-items-center pt-1 border-top border-warning-subtle text-muted">
                <span>Chỉ số máy: <strong className="font-monospace text-dark">{rejectItem.equipment.currentCounter.toLocaleString("vi-VN")}</strong></span>
                <span>&rarr;</span>
                <span>Chỉ số đề xuất: <strong className="font-monospace text-danger">{rejectItem.counterValue.toLocaleString("vi-VN")}</strong></span>
              </div>
              {rejectItem.adjustmentReason && (
                <div className="mt-1.5 pt-1 border-top border-warning-subtle small text-danger-emphasis">
                  Lý do KTV khai: <em>&ldquo;{rejectItem.adjustmentReason}&rdquo;</em>
                </div>
              )}
            </div>

            <div className="mb-3">
              <label className="form-label small fw-bold">
                Chọn lý do từ chối mẫu <span className="text-muted fw-normal">(Tìm kiếm & chọn nhanh khi sổ ra)</span>
              </label>
              <SearchableSelect
                value={selectedReasonPreset}
                onChange={(val) => {
                  setSelectedReasonPreset(val);
                  if (val && val !== "OTHER") {
                    setRejectReason(val);
                  }
                }}
                options={rejectReasonPresets}
                placeholder="-- Gõ hoặc chọn lý do mẫu phù hợp --"
                searchPlaceholder="Tìm kiếm lý do từ chối..."
              />
            </div>

            <div className="mb-2">
              <label className="form-label small fw-bold">
                Nội dung lý do từ chối gửi KTV <span className="text-danger">*</span>
              </label>
              <textarea
                className="form-control form-control-sm"
                rows={3}
                required
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do từ chối cụ thể để thông báo cho người khai báo..."
              />
              <div className="form-text text-muted" style={{ fontSize: "11px" }}>
                Nội dung này sẽ được lưu vào lịch sử đối soát và gửi phản hồi đến Kỹ thuật viên/Khách hàng.
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      {/* Modal 4: Xác nhận Phê duyệt Counter */}
      <ModalShell
        open={Boolean(approveItem)}
        onClose={() => !submitting && setApproveItem(null)}
        title="Xác nhận Phê duyệt Chỉ số Counter"
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setApproveItem(null)}
              disabled={submitting}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn btn-sm btn-success fw-bold"
              disabled={submitting}
              onClick={handleConfirmApprove}
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
                  Đang phê duyệt...
                </>
              ) : (
                <>
                  <i className="fas fa-check me-1"></i> Xác nhận Phê duyệt
                </>
              )}
            </button>
          </>
        }
      >
        {approveItem && (
          <div>
            <div className="p-3 bg-light rounded-3 border mb-3">
              <div className="row g-2 align-items-center mb-2">
                <div className="col-sm-6">
                  <div className="small text-muted">Thiết bị:</div>
                  <div className="fw-bold text-primary fs-6">{approveItem.equipment.model}</div>
                  {approveItem.equipment.serialNumber && (
                    <div className="small font-monospace text-muted">SN: {approveItem.equipment.serialNumber}</div>
                  )}
                </div>
                <div className="col-sm-6">
                  <div className="small text-muted">Khách hàng:</div>
                  <div className="fw-semibold text-dark">{approveItem.equipment.customer?.name || "Trong kho"}</div>
                  {approveItem.equipment.contract && (
                    <span className="badge bg-light text-secondary border font-monospace mt-0.5" style={{ fontSize: "10px" }}>
                      HĐ: {approveItem.equipment.contract.code}
                    </span>
                  )}
                </div>
              </div>

              <div className="p-2.5 bg-white rounded border d-flex justify-content-between align-items-center">
                <div>
                  <div className="small text-muted">Chỉ số hiện tại</div>
                  <div className="fs-5 fw-bold font-monospace text-secondary">
                    {approveItem.equipment.currentCounter.toLocaleString("vi-VN")}
                  </div>
                </div>
                <div className="text-center px-2">
                  <i className="fas fa-arrow-right text-muted fa-lg"></i>
                  {approveItem.counterValue < approveItem.equipment.currentCounter ? (
                    <div className="badge bg-danger d-block mt-1">Giảm {(approveItem.counterValue - approveItem.equipment.currentCounter).toLocaleString("vi-VN")}</div>
                  ) : (
                    <div className="badge bg-success d-block mt-1">Tăng +{(approveItem.counterValue - approveItem.equipment.currentCounter).toLocaleString("vi-VN")}</div>
                  )}
                </div>
                <div className="text-end">
                  <div className="small text-muted">Chỉ số sau duyệt</div>
                  <div className="fs-5 fw-bold font-monospace text-success">
                    {approveItem.counterValue.toLocaleString("vi-VN")}
                  </div>
                </div>
              </div>
            </div>

            {approveItem.adjustmentReason && (
              <div className="alert alert-warning py-2 px-3 small mb-3">
                <strong>Lý do điều chỉnh của KTV:</strong> {approveItem.adjustmentReason}
              </div>
            )}

            {approveItem.photoUrl && (
              <div className="text-center p-2 bg-light rounded border mb-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setPreviewPhoto(approveItem.photoUrl)}
                >
                  <i className="fas fa-image me-1"></i> Xem ảnh minh chứng đồng hồ
                </button>
              </div>
            )}

            <div className="small text-muted">
              Ghi chú: Sau khi phê duyệt, chỉ số counter mới sẽ được cập nhật chính thức vào hệ thống quản lý thiết bị và sẵn sàng đối soát hóa đơn cước.
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
