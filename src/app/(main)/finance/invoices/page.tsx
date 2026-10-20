"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { ModalShell } from "@/components/ModalShell";
import { Loading } from "@/components/Loading";
import { INVOICE_STATUS_LABELS, METER_SOURCE_LABELS } from "@/lib/labels";
import { exportToCsv } from "@/lib/csv";

interface InvoiceItemRow {
  id: string;
  equipmentId: string | null;
  description: string;
  usage: number;
  quota: number;
  overage: number;
  amount: string | number;
}

interface InvoiceRecord {
  id: string;
  code: string;
  customerId: string;
  contractId: string;
  periodStart: string;
  periodEnd: string;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  status: string;
  dueDate: string | null;
  paidAt: string | null;
  sentAt: string | null;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    taxCode: string | null;
    address: string;
    phone: string;
    email: string | null;
  };
  contract: {
    id: string;
    code: string;
    basePrice: string | number;
    baseQuota: number;
    overagePrice: string | number;
  };
  items: InvoiceItemRow[];
}

interface MeterLogRecord {
  id: string;
  equipmentId: string;
  counterValue: number;
  source: string;
  photoUrl: string | null;
  logDate: string;
  isBilled: boolean;
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    currentCounter: number;
    baseQuota: number | null;
    overagePrice: string | number | null;
    customer?: { id: string; name: string } | null;
    contract?: {
      id: string;
      code: string;
      baseQuota: number;
      overagePrice: string | number;
    } | null;
  };
  recordedBy?: { id: string; name: string } | null;
  ticket?: { id: string; code: string } | null;
  invoiceItem?: {
    id: string;
    invoice: { id: string; code: string; status: string };
  } | null;
}

interface ContractOption {
  id: string;
  code: string;
  basePrice: string | number;
  baseQuota: number;
  overagePrice: string | number;
  customer: { id: string; name: string };
  equipment: {
    id: string;
    serialNumber: string;
    model: string;
    currentCounter: number;
    baseQuota: number | null;
    overagePrice: string | number | null;
  }[];
}

interface EquipmentOption {
  id: string;
  serialNumber: string;
  model: string;
  currentCounter: number;
  baseQuota: number | null;
  overagePrice: string | number | null;
  customer?: { id: string; name: string } | null;
  contract?: {
    id: string;
    code: string;
    baseQuota: number;
    overagePrice: string | number;
  } | null;
}

export default function FinanceInvoicesPage() {
  const [activeTab, setActiveTab] = useState<"invoices" | "meters">("invoices");
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [meterLogs, setMeterLogs] = useState<MeterLogRecord[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Modal 1: Ghi nhận Counter mới
  const [showMeterModal, setShowMeterModal] = useState(false);
  const [meterForm, setMeterForm] = useState({
    equipmentId: "",
    counterValue: "",
    source: "MANUAL",
    photoUrl: "",
  });

  // Modal 2: Tính cước & phát hành bảng kê hóa đơn tự động
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const todayStr = now.toISOString().slice(0, 10);
  const [genForm, setGenForm] = useState({
    contractId: "",
    periodStart: firstOfMonth,
    periodEnd: todayStr,
    taxPercent: 8,
  });

  // Modal 3: Xem chi tiết & In bảng kê Hóa đơn A4
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [invRes, meterRes, contractRes, eqRes] = await Promise.all([
        fetch("/api/invoices"),
        fetch("/api/meters"),
        fetch("/api/contracts?pageSize=100"),
        fetch("/api/equipment?pageSize=100"),
      ]);
      if (invRes.ok) {
        const d = await invRes.json();
        setInvoices(Array.isArray(d) ? d : d.items || []);
      }
      if (meterRes.ok) {
        const d = await meterRes.json();
        setMeterLogs(Array.isArray(d) ? d : d.items || []);
      }
      if (contractRes.ok) {
        const d = await contractRes.json();
        setContracts(Array.isArray(d) ? d : d.items || []);
      }
      if (eqRes.ok) {
        const d = await eqRes.json();
        setEquipmentList(Array.isArray(d) ? d : d.items || []);
      }
    } catch {
      toast.error("Lỗi tải dữ liệu tài chính & counter");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const selectedEquipmentForMeter = useMemo(
    () => equipmentList.find((e) => e.id === meterForm.equipmentId) || null,
    [equipmentList, meterForm.equipmentId]
  );

  const selectedContractForGen = useMemo(
    () => contracts.find((c) => c.id === genForm.contractId) || null,
    [contracts, genForm.contractId]
  );

  const handleRecordMeter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meterForm.equipmentId || meterForm.counterValue === "") {
      toast.warning("Vui lòng chọn thiết bị và nhập chỉ số counter");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/meters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: meterForm.equipmentId,
          counterValue: Number(meterForm.counterValue),
          source: meterForm.source,
          photoUrl: meterForm.photoUrl || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể ghi nhận counter");
      toast.success(
        `Đã chốt counter mới (${Number(meterForm.counterValue).toLocaleString("vi-VN")}) cho máy ${body.equipment.serialNumber}`
      );
      setShowMeterModal(false);
      setMeterForm({ equipmentId: "", counterValue: "", source: "MANUAL", photoUrl: "" });
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi chốt counter");
    } finally {
      setSubmitting(false);
    }
  };

  const handleGenerateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!genForm.contractId) {
      toast.warning("Vui lòng chọn hợp đồng cần tính cước");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: genForm.contractId,
          periodStart: genForm.periodStart,
          periodEnd: genForm.periodEnd,
          taxPercent: Number(genForm.taxPercent),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể lập bảng kê hóa đơn");
      toast.success(`Đã lập bảng kê hóa đơn ${body.code} thành công!`);
      setShowGenerateModal(false);
      setSelectedInvoice(body);
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tính cước");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvoiceStatusChange = async (
    invoiceId: string,
    newStatus: string,
    successMsg: string
  ) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Không thể cập nhật trạng thái");
      toast.success(successMsg);
      if (selectedInvoice?.id === invoiceId) {
        setSelectedInvoice(body);
      }
      fetchAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật hóa đơn");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (statusFilter && inv.status !== statusFilter) return false;
      if (q.trim()) {
        const kw = q.trim().toLowerCase();
        const match =
          inv.code.toLowerCase().includes(kw) ||
          inv.customer.name.toLowerCase().includes(kw) ||
          inv.contract.code.toLowerCase().includes(kw);
        if (!match) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, q]);

  const filteredMeters = useMemo(() => {
    return meterLogs.filter((m) => {
      if (!q.trim()) return true;
      const kw = q.trim().toLowerCase();
      return (
        m.equipment.serialNumber.toLowerCase().includes(kw) ||
        m.equipment.model.toLowerCase().includes(kw) ||
        (m.equipment.customer?.name || "").toLowerCase().includes(kw) ||
        (m.equipment.contract?.code || "").toLowerCase().includes(kw)
      );
    });
  }, [meterLogs, q]);

  const financeStats = useMemo(() => {
    const totalPaid = invoices
      .filter((i) => i.status === "PAID")
      .reduce((s, i) => s + Number(i.total), 0);
    const totalReceivable = invoices
      .filter((i) => ["SENT", "OVERDUE", "DRAFT"].includes(i.status))
      .reduce((s, i) => s + Number(i.total), 0);
    const unbilledLogs = meterLogs.filter((m) => !m.isBilled).length;
    return { totalPaid, totalReceivable, unbilledLogs };
  }, [invoices, meterLogs]);

  const handleExportCsv = () => {
    if (activeTab === "invoices") {
      exportToCsv(
        "bang-ke-hoa-don.csv",
        [
          "Mã Hóa đơn",
          "Khách hàng",
          "Mã Hợp đồng",
          "Từ ngày",
          "Đến ngày",
          "Trước thuế",
          "Thuế GTGT",
          "Tổng cộng",
          "Trạng thái",
        ],
        filteredInvoices.map((inv) => [
          inv.code,
          inv.customer.name,
          inv.contract.code,
          new Date(inv.periodStart).toLocaleDateString("vi-VN"),
          new Date(inv.periodEnd).toLocaleDateString("vi-VN"),
          inv.subtotal,
          inv.tax,
          inv.total,
          INVOICE_STATUS_LABELS[inv.status] || inv.status,
        ])
      );
    } else {
      exportToCsv(
        "so-chot-counter.csv",
        [
          "Thời gian chốt",
          "Model",
          "Serial",
          "Khách hàng",
          "Hợp đồng",
          "Chỉ số Counter",
          "Nguồn",
          "Đã tính cước",
        ],
        filteredMeters.map((m) => [
          new Date(m.logDate).toLocaleString("vi-VN"),
          m.equipment.model,
          m.equipment.serialNumber,
          m.equipment.customer?.name || "Trong kho",
          m.equipment.contract?.code || "",
          m.counterValue,
          METER_SOURCE_LABELS[m.source] || m.source,
          m.isBilled ? "Đã lên bảng kê" : "Chờ tính cước",
        ])
      );
    }
  };

  const getInvoiceStatusBadge = (status: string) => {
    switch (status) {
      case "PAID":
        return "bg-success text-white";
      case "SENT":
        return "bg-primary text-white";
      case "OVERDUE":
        return "bg-danger text-white";
      case "DRAFT":
        return "bg-warning text-dark";
      case "CANCELLED":
        return "bg-secondary text-white";
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
            <i className="fas fa-receipt text-success"></i>
            <span>Chốt Counter & Bảng kê Hóa đơn Tự động</span>
          </h5>
          <span className="badge bg-success-subtle text-success border border-success-subtle">
            Đã thu: <strong>{financeStats.totalPaid.toLocaleString("vi-VN")} đ</strong>
          </span>
          <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
             Phải thu / Nháp:{" "}
            <strong>{financeStats.totalReceivable.toLocaleString("vi-VN")} đ</strong>
          </span>
          <span className="badge bg-warning-subtle text-dark border border-warning-subtle">
            Bản ghi Counter chờ tính cước: <strong>{financeStats.unbilledLogs}</strong>
          </span>
        </div>

        <div className="d-flex gap-2 mt-2 mt-md-0">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={handleExportCsv}
          >
            <i className="fas fa-file-excel text-success me-1"></i> Xuất Excel
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline-success fw-semibold"
            onClick={() => setShowMeterModal(true)}
          >
            <i className="fas fa-tachometer-alt me-1"></i> Ghi nhận Counter mới
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary fw-semibold"
            onClick={() => setShowGenerateModal(true)}
          >
            <i className="fas fa-calculator me-1"></i> Tự động tính cước & Lập Hóa đơn
          </button>
        </div>
      </div>

      {/* Tabs + Filter Bar */}
      <div className="bg-light p-2 rounded border mb-2 d-flex flex-wrap justify-content-between align-items-center gap-2">
        <div className="btn-group btn-group-sm">
          <button
            type="button"
            className={`btn ${
              activeTab === "invoices" ? "btn-dark fw-bold" : "btn-outline-secondary bg-white"
            }`}
            onClick={() => setActiveTab("invoices")}
          >
            <i className="fas fa-file-invoice-dollar me-1"></i> Danh sách Bảng kê & Hóa đơn (
            {invoices.length})
          </button>
          <button
            type="button"
            className={`btn ${
              activeTab === "meters" ? "btn-dark fw-bold" : "btn-outline-secondary bg-white"
            }`}
            onClick={() => setActiveTab("meters")}
          >
            <i className="fas fa-list-ol me-1"></i> Sổ nhật ký Chốt Counter ({meterLogs.length})
          </button>
        </div>

        <div className="d-flex gap-2 flex-grow-1 justify-content-end" style={{ maxWidth: "600px" }}>
          <div className="input-group input-group-sm">
            <span className="input-group-text bg-white">
              <i className="fas fa-search text-muted"></i>
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="Tìm mã hóa đơn, khách hàng, mã hợp đồng, serial máy..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {activeTab === "invoices" && (
            <select
              className="form-select form-select-sm"
              style={{ maxWidth: "180px" }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">-- Mọi trạng thái --</option>
              {Object.entries(INVOICE_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading ? (
        <Loading text="Đang tải dữ liệu bảng kê & chỉ số counter..." />
      ) : activeTab === "invoices" ? (
        <div className="table-responsive bg-white rounded shadow-sm border">
          <table className="table table-hover table-bordered mb-0 custom-dense-table table-sticky-header align-middle">
            <thead className="bg-dark text-white">
              <tr>
                <th>Mã Hóa đơn</th>
                <th>Khách hàng & Hợp đồng</th>
                <th>Kỳ cước đối soát</th>
                <th className="text-end">Tiền trước thuế</th>
                <th className="text-end">Thuế GTGT</th>
                <th className="text-end">Tổng thanh toán</th>
                <th className="text-center">Trạng thái</th>
                <th className="text-center" style={{ width: "210px" }}>
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-muted">
                    Chưa có bảng kê hóa đơn nào. Nhấn &ldquo;Tự động tính cước &amp; Lập Hóa
                    đơn&rdquo; để tạo mới.
                  </td>
                </tr>
              ) : (
                filteredInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className={
                      inv.status === "OVERDUE"
                        ? "bg-danger-subtle"
                        : inv.status === "DRAFT"
                        ? "bg-warning-subtle"
                        : ""
                    }
                  >
                    <td className="fw-bold font-monospace">
                      <a
                        href="#"
                        className="text-primary text-decoration-none"
                        onClick={(e) => {
                          e.preventDefault();
                          setSelectedInvoice(inv);
                        }}
                      >
                        {inv.code}
                      </a>
                      <div className="text-muted" style={{ fontSize: "11px" }}>
                        Ngày lập: {new Date(inv.createdAt).toLocaleDateString("vi-VN")}
                      </div>
                    </td>
                    <td>
                      <div className="fw-bold text-dark">{inv.customer.name}</div>
                      <span className="badge bg-light text-dark border font-monospace">
                        HĐ: {inv.contract.code}
                      </span>
                    </td>
                    <td className="font-monospace small">
                      {new Date(inv.periodStart).toLocaleDateString("vi-VN")} &rarr;{" "}
                      {new Date(inv.periodEnd).toLocaleDateString("vi-VN")}
                    </td>
                    <td className="text-end font-monospace">
                      {Number(inv.subtotal).toLocaleString("vi-VN")} đ
                    </td>
                    <td className="text-end font-monospace text-muted">
                      {Number(inv.tax).toLocaleString("vi-VN")} đ
                    </td>
                    <td className="text-end font-monospace fw-bold text-danger">
                      {Number(inv.total).toLocaleString("vi-VN")} đ
                    </td>
                    <td className="text-center">
                      <span className={`badge ${getInvoiceStatusBadge(inv.status)}`}>
                        {INVOICE_STATUS_LABELS[inv.status] || inv.status}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="btn-group btn-group-sm">
                        <button
                          type="button"
                          className="btn btn-outline-primary"
                          onClick={() => setSelectedInvoice(inv)}
                          title="Xem chi tiết bảng kê & In A4"
                        >
                          <i className="fas fa-print me-1"></i> Bảng kê
                        </button>
                        {inv.status === "DRAFT" && (
                          <button
                            type="button"
                            className="btn btn-outline-info"
                            disabled={submitting}
                            onClick={() =>
                              handleInvoiceStatusChange(
                                inv.id,
                                "SENT",
                                `Đã phát hành & gửi bảng kê ${inv.code} cho khách hàng`
                              )
                            }
                            title="Duyệt & Gửi khách hàng"
                          >
                            Gửi khách
                          </button>
                        )}
                        {(inv.status === "SENT" || inv.status === "OVERDUE") && (
                          <button
                            type="button"
                            className="btn btn-success"
                            disabled={submitting}
                            onClick={() =>
                              handleInvoiceStatusChange(
                                inv.id,
                                "PAID",
                                `Đã xác nhận thu tiền hóa đơn ${inv.code}`
                              )
                            }
                            title="Xác nhận khách đã thanh toán"
                          >
                            Thu tiền
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Tab 2: Sổ nhật ký Chốt Counter */
        <div className="table-responsive bg-white rounded shadow-sm border">
          <table className="table table-hover table-bordered mb-0 custom-dense-table table-sticky-header align-middle">
            <thead className="bg-dark text-white">
              <tr>
                <th>Thời gian chốt</th>
                <th>Thiết bị (Model / Serial)</th>
                <th>Khách hàng & Hợp đồng</th>
                <th className="text-end">Chỉ số Counter</th>
                <th className="text-end">Định mức / Đơn giá vượt</th>
                <th className="text-center">Nguồn chốt</th>
                <th>Người ghi nhận</th>
                <th className="text-center">Trạng thái tính cước</th>
              </tr>
            </thead>
            <tbody>
              {filteredMeters.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-4 text-muted">
                    Chưa có bản ghi chốt counter nào.
                  </td>
                </tr>
              ) : (
                filteredMeters.map((m) => {
                  const quota =
                    m.equipment.baseQuota ?? m.equipment.contract?.baseQuota ?? 0;
                  const overagePrice = Number(
                    m.equipment.overagePrice ?? m.equipment.contract?.overagePrice ?? 0
                  );

                  return (
                    <tr key={m.id}>
                      <td className="font-monospace small">
                        {new Date(m.logDate).toLocaleString("vi-VN")}
                      </td>
                      <td>
                        <div className="fw-bold text-primary">{m.equipment.model}</div>
                        <div className="small text-muted font-monospace">
                          SN: {m.equipment.serialNumber}
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold">
                          {m.equipment.customer?.name || "Trong kho"}
                        </div>
                        {m.equipment.contract && (
                          <span className="badge bg-light text-dark border font-monospace">
                            {m.equipment.contract.code}
                          </span>
                        )}
                      </td>
                      <td className="text-end font-monospace fw-bold fs-6 text-dark">
                        {m.counterValue.toLocaleString("vi-VN")}
                      </td>
                      <td className="text-end small font-monospace">
                        <div>ĐM: {quota.toLocaleString("vi-VN")} bản</div>
                        <div className="text-muted">
                          Vượt: {overagePrice.toLocaleString("vi-VN")} đ/bản
                        </div>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-info-subtle text-info-emphasis border">
                          {METER_SOURCE_LABELS[m.source] || m.source}
                        </span>
                        {m.ticket && (
                          <div className="small font-monospace text-muted mt-1">
                            {m.ticket.code}
                          </div>
                        )}
                      </td>
                      <td>{m.recordedBy?.name || "Hệ thống"}</td>
                      <td className="text-center">
                        {m.isBilled ? (
                          <span className="badge bg-success-subtle text-success border">
                            Đã lên bảng kê{" "}
                            {m.invoiceItem?.invoice?.code
                              ? `(${m.invoiceItem.invoice.code})`
                              : ""}
                          </span>
                        ) : (
                          <span className="badge bg-warning-subtle text-dark border">
                            Chờ kết chuyển cước
                          </span>
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
        open={showMeterModal}
        onClose={() => setShowMeterModal(false)}
        title="Ghi nhận Chỉ số Counter Thiết bị"
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setShowMeterModal(false)}
            >
              Đóng
            </button>
            <button
              type="submit"
              form="record-meter-form"
              className="btn btn-sm btn-success"
              disabled={submitting}
            >
              <i className="fas fa-check me-1"></i> Lưu chỉ số Counter
            </button>
          </>
        }
      >
        <form id="record-meter-form" onSubmit={handleRecordMeter}>
          <div className="mb-3">
            <label className="form-label small fw-bold">
              Chọn Thiết bị cần chốt Counter <span className="text-danger">*</span>
            </label>
            <select
              className="form-select form-select-sm"
              required
              value={meterForm.equipmentId}
              onChange={(e) => {
                const eq = equipmentList.find((x) => x.id === e.target.value);
                setMeterForm({
                  ...meterForm,
                  equipmentId: e.target.value,
                  counterValue: eq ? String(eq.currentCounter + 1200) : "",
                });
              }}
            >
              <option value="">-- Chọn máy --</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.model} - SN: {eq.serialNumber} | Khách:{" "}
                  {eq.customer?.name || "Kho"} (Hiện tại:{" "}
                  {eq.currentCounter.toLocaleString("vi-VN")})
                </option>
              ))}
            </select>
          </div>

          {selectedEquipmentForMeter && (
            <div className="alert alert-info py-2 px-3 small mb-3">
              <div>
                Chỉ số Counter gần nhất:{" "}
                <strong className="font-monospace">
                  {selectedEquipmentForMeter.currentCounter.toLocaleString("vi-VN")}
                </strong>{" "}
                bản
              </div>
              <div>
                Định mức áp dụng cho máy:{" "}
                <strong>
                  {(
                    selectedEquipmentForMeter.baseQuota ??
                    selectedEquipmentForMeter.contract?.baseQuota ??
                    0
                  ).toLocaleString("vi-VN")}{" "}
                  bản/tháng
                </strong>{" "}
                | Đơn giá vượt:{" "}
                <strong>
                  {Number(
                    selectedEquipmentForMeter.overagePrice ??
                      selectedEquipmentForMeter.contract?.overagePrice ??
                      0
                  ).toLocaleString("vi-VN")}{" "}
                  đ/bản
                </strong>
              </div>
            </div>
          )}

          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-bold">
                Chỉ số Counter mới <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                className="form-control form-control-sm font-monospace fw-bold"
                required
                min={selectedEquipmentForMeter ? selectedEquipmentForMeter.currentCounter : 0}
                value={meterForm.counterValue}
                onChange={(e) =>
                  setMeterForm({ ...meterForm, counterValue: e.target.value })
                }
              />
              {selectedEquipmentForMeter &&
                Number(meterForm.counterValue) >=
                  selectedEquipmentForMeter.currentCounter && (
                  <small className="text-success fw-semibold">
                    Sản lượng tăng thêm:{" "}
                    {(
                      Number(meterForm.counterValue) -
                      selectedEquipmentForMeter.currentCounter
                    ).toLocaleString("vi-VN")}{" "}
                    bản in
                  </small>
                )}
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold">Nguồn thu thập</label>
              <select
                className="form-select form-select-sm"
                value={meterForm.source}
                onChange={(e) => setMeterForm({ ...meterForm, source: e.target.value })}
              >
                {Object.entries(METER_SOURCE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-12">
              <label className="form-label small fw-bold">
                Đường dẫn ảnh chụp màn hình Counter / Chứng từ (Tùy chọn)
              </label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="VD: https://.../counter-photo.jpg hoặc ghi chú đối chiếu..."
                value={meterForm.photoUrl}
                onChange={(e) => setMeterForm({ ...meterForm, photoUrl: e.target.value })}
              />
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal 2: Tự động tính cước & Lập bảng kê Hóa đơn theo Hợp đồng */}
      <ModalShell
        open={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        title="Tự động Tính cước & Phát hành Bảng kê Hóa đơn"
        size="lg"
        footer={
          <>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setShowGenerateModal(false)}
            >
              Đóng
            </button>
            <button
              type="submit"
              form="generate-invoice-form"
              className="btn btn-sm btn-primary"
              disabled={submitting}
            >
              <i className="fas fa-bolt me-1"></i> Tính cước & Sinh Bảng kê ngay
            </button>
          </>
        }
      >
        <form id="generate-invoice-form" onSubmit={handleGenerateInvoice}>
          <div className="row g-3">
            <div className="col-md-12">
              <label className="form-label small fw-bold">
                Chọn Hợp đồng thuê máy <span className="text-danger">*</span>
              </label>
              <select
                className="form-select form-select-sm"
                required
                value={genForm.contractId}
                onChange={(e) => setGenForm({ ...genForm, contractId: e.target.value })}
              >
                <option value="">-- Chọn hợp đồng đang hiệu lực --</option>
                {contracts.map((c) => (
                  <option key={c.id} value={c.id}>
                    [{c.code}] {c.customer.name} | Giá thuê gốc:{" "}
                    {Number(c.basePrice).toLocaleString("vi-VN")} đ/tháng ({c.equipment.length}{" "}
                    máy)
                  </option>
                ))}
              </select>
            </div>

            {selectedContractForGen && (
              <div className="col-12">
                <div className="bg-light p-2 rounded border small">
                  <div className="fw-bold mb-1 text-primary">
                    Quy tắc tính cước tự động cho Hợp đồng {selectedContractForGen.code}:
                  </div>
                  <div className="mb-2">
                    Cước cố định hợp đồng:{" "}
                    <strong>
                      {Number(selectedContractForGen.basePrice).toLocaleString("vi-VN")} đ/tháng
                    </strong>{" "}
                    | Định mức mặc định:{" "}
                    <strong>
                      {selectedContractForGen.baseQuota.toLocaleString("vi-VN")} bản/máy
                    </strong>{" "}
                    | Đơn giá vượt mặc định:{" "}
                    <strong>
                      {Number(selectedContractForGen.overagePrice).toLocaleString("vi-VN")} đ/bản
                    </strong>
                  </div>
                  <table className="table table-sm table-bordered mb-0 bg-white">
                    <thead className="table-secondary">
                      <tr>
                        <th>Thiết bị trong hợp đồng</th>
                        <th className="text-end">Counter hiện tại</th>
                        <th className="text-end">Định mức áp dụng</th>
                        <th className="text-end">Đơn giá vượt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedContractForGen.equipment.map((eq) => (
                        <tr key={eq.id}>
                          <td>
                            <strong>{eq.model}</strong> ({eq.serialNumber})
                          </td>
                          <td className="text-end font-monospace">
                            {eq.currentCounter.toLocaleString("vi-VN")}
                          </td>
                          <td className="text-end font-monospace">
                            {(
                              eq.baseQuota ?? selectedContractForGen.baseQuota
                            ).toLocaleString("vi-VN")}{" "}
                            {eq.baseQuota != null && (
                              <span className="badge bg-info text-dark">Riêng</span>
                            )}
                          </td>
                          <td className="text-end font-monospace">
                            {Number(
                              eq.overagePrice ?? selectedContractForGen.overagePrice
                            ).toLocaleString("vi-VN")}{" "}
                            đ
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="col-md-4">
              <label className="form-label small fw-bold">Từ ngày (Đầu kỳ)</label>
              <input
                type="date"
                className="form-control form-control-sm"
                required
                value={genForm.periodStart}
                onChange={(e) => setGenForm({ ...genForm, periodStart: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold">Đến ngày (Cuối kỳ)</label>
              <input
                type="date"
                className="form-control form-control-sm"
                required
                value={genForm.periodEnd}
                onChange={(e) => setGenForm({ ...genForm, periodEnd: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold">Thuế suất GTGT (%)</label>
              <select
                className="form-select form-select-sm"
                value={genForm.taxPercent}
                onChange={(e) =>
                  setGenForm({ ...genForm, taxPercent: Number(e.target.value) })
                }
              >
                <option value={8}>8% (Ưu đãi Nghị định)</option>
                <option value={10}>10% (Tiêu chuẩn)</option>
                <option value={0}>0% (Không chịu thuế)</option>
              </select>
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal 3: Phiếu Bảng kê Đối soát & Hóa đơn A4 (Printable) */}
      <ModalShell
        open={!!selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
        title={
          selectedInvoice
            ? `Bảng kê Đối soát & Đề nghị Thanh toán - ${selectedInvoice.code}`
            : ""
        }
        size="xl"
        footer={
          selectedInvoice && (
            <div className="d-flex justify-content-between w-100">
              <div className="d-flex gap-2">
                {selectedInvoice.status === "DRAFT" && (
                  <button
                    type="button"
                    className="btn btn-sm btn-info text-white"
                    disabled={submitting}
                    onClick={() =>
                      handleInvoiceStatusChange(
                        selectedInvoice.id,
                        "SENT",
                        "Đã duyệt & gửi bảng kê cho khách hàng"
                      )
                    }
                  >
                    <i className="fas fa-paper-plane me-1"></i> Duyệt & Gửi khách
                  </button>
                )}
                {(selectedInvoice.status === "SENT" ||
                  selectedInvoice.status === "OVERDUE") && (
                  <button
                    type="button"
                    className="btn btn-sm btn-success"
                    disabled={submitting}
                    onClick={() =>
                      handleInvoiceStatusChange(
                        selectedInvoice.id,
                        "PAID",
                        "Đã xác nhận thu tiền thành công"
                      )
                    }
                  >
                    <i className="fas fa-check-double me-1"></i> Xác nhận Đã thu tiền
                  </button>
                )}
                {selectedInvoice.status !== "CANCELLED" &&
                  selectedInvoice.status !== "PAID" && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      disabled={submitting}
                      onClick={() =>
                        handleInvoiceStatusChange(
                          selectedInvoice.id,
                          "CANCELLED",
                          "Đã hủy bảng kê và mở khóa lại các bản ghi Counter"
                        )
                      }
                    >
                      Hủy bảng kê
                    </button>
                  )}
              </div>

              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-dark"
                  onClick={() => window.print()}
                >
                  <i className="fas fa-print me-1"></i> In Bảng kê / Xuất PDF A4
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setSelectedInvoice(null)}
                >
                  Đóng
                </button>
              </div>
            </div>
          )
        }
      >
        {selectedInvoice && (
          <div className="p-3 bg-white border rounded">
            <div className="d-flex justify-content-between align-items-start border-bottom pb-3 mb-3">
              <div>
                <h5 className="fw-bold text-uppercase mb-1">
                  CÔNG TY DỊCH VỤ THIẾT BỊ VĂN PHÒNG OFFICEOPS
                </h5>
                <div className="small text-muted">
                  Hệ thống Quản lý Cho thuê & Vận hành Máy Photocopy / Máy in Chuyên nghiệp
                </div>
              </div>
              <div className="text-end">
                <h5 className="fw-bold text-primary mb-1 font-monospace">
                  {selectedInvoice.code}
                </h5>
                <span className={`badge ${getInvoiceStatusBadge(selectedInvoice.status)}`}>
                  {INVOICE_STATUS_LABELS[selectedInvoice.status]}
                </span>
              </div>
            </div>

            <div className="text-center mb-3">
              <h5 className="fw-bold mb-1">
                BẢNG KÊ ĐỐI SOÁT COUNTER & ĐỀ NGHỊ THANH TOÁN
              </h5>
              <div className="small text-muted">
                Kỳ cước từ ngày{" "}
                <strong>
                  {new Date(selectedInvoice.periodStart).toLocaleDateString("vi-VN")}
                </strong>{" "}
                đến ngày{" "}
                <strong>
                  {new Date(selectedInvoice.periodEnd).toLocaleDateString("vi-VN")}
                </strong>
              </div>
            </div>

            <div className="row g-2 mb-3 small bg-light p-2 rounded border">
              <div className="col-md-7">
                <div>
                  Khách hàng: <strong>{selectedInvoice.customer.name}</strong>
                </div>
                <div>Mã số thuế: {selectedInvoice.customer.taxCode || "---"}</div>
                <div>Địa chỉ: {selectedInvoice.customer.address}</div>
              </div>
              <div className="col-md-5">
                <div>
                  Căn cứ Hợp đồng số:{" "}
                  <strong className="font-monospace">{selectedInvoice.contract.code}</strong>
                </div>
                <div>Điện thoại: {selectedInvoice.customer.phone}</div>
                <div>
                  Hạn thanh toán:{" "}
                  <strong>
                    {selectedInvoice.dueDate
                      ? new Date(selectedInvoice.dueDate).toLocaleDateString("vi-VN")
                      : "Trong vòng 10 ngày"}
                  </strong>
                </div>
              </div>
            </div>

            <table className="table table-sm table-bordered mb-3 align-middle">
              <thead className="table-dark">
                <tr>
                  <th style={{ width: "45px" }} className="text-center">
                    STT
                  </th>
                  <th>Diễn giải chi tiết hạng mục / Thiết bị</th>
                  <th className="text-end" style={{ width: "110px" }}>
                    Sử dụng (Bản)
                  </th>
                  <th className="text-end" style={{ width: "110px" }}>
                    Định mức
                  </th>
                  <th className="text-end" style={{ width: "110px" }}>
                    Vượt ĐM
                  </th>
                  <th className="text-end" style={{ width: "140px" }}>
                    Thành tiền (VNĐ)
                  </th>
                </tr>
              </thead>
              <tbody>
                {selectedInvoice.items.map((it, i) => (
                  <tr key={it.id}>
                    <td className="text-center">{i + 1}</td>
                    <td>{it.description}</td>
                    <td className="text-end font-monospace">
                      {it.equipmentId ? it.usage.toLocaleString("vi-VN") : "-"}
                    </td>
                    <td className="text-end font-monospace">
                      {it.equipmentId ? it.quota.toLocaleString("vi-VN") : "-"}
                    </td>
                    <td className="text-end font-monospace fw-semibold text-danger">
                      {it.equipmentId ? it.overage.toLocaleString("vi-VN") : "-"}
                    </td>
                    <td className="text-end font-monospace fw-bold">
                      {Number(it.amount).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="text-end fw-semibold">
                    Cộng tiền dịch vụ trước thuế:
                  </td>
                  <td className="text-end font-monospace fw-bold">
                    {Number(selectedInvoice.subtotal).toLocaleString("vi-VN")} đ
                  </td>
                </tr>
                <tr>
                  <td colSpan={5} className="text-end fw-semibold">
                    Thuế Giá trị gia tăng (GTGT):
                  </td>
                  <td className="text-end font-monospace">
                    {Number(selectedInvoice.tax).toLocaleString("vi-VN")} đ
                  </td>
                </tr>
                <tr className="table-warning">
                  <td colSpan={5} className="text-end fw-bold fs-6">
                    TỔNG CỘNG THANH TOÁN:
                  </td>
                  <td className="text-end font-monospace fw-bold fs-6 text-danger">
                    {Number(selectedInvoice.total).toLocaleString("vi-VN")} đ
                  </td>
                </tr>
              </tfoot>
            </table>

            <div className="row text-center small mt-4 pt-2">
              <div className="col-6">
                <div className="fw-bold">ĐẠI DIỆN KHÁCH HÀNG</div>
                <div className="text-muted">(Ký, ghi rõ họ tên & đóng dấu)</div>
                <div style={{ height: "60px" }}></div>
              </div>
              <div className="col-6">
                <div className="fw-bold">ĐẠI DIỆN OFFICEOPS</div>
                <div className="text-muted">(Ký, ghi rõ họ tên)</div>
                <div style={{ height: "60px" }}></div>
              </div>
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
