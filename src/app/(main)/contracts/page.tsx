"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import ModalShell from "@/components/ModalShell";
import { exportToCsv } from "@/lib/csv";

interface ContractItem {
  id: string;
  code: string;
  customerId: string;
  customer: { id: string; name: string };
  startDate: string;
  endDate: string;
  basePrice: string | number;
  baseQuota: number;
  overagePrice: string | number;
  billingDay: number;
  maintenanceIntervalDays: number | null;
  isActive: boolean;
  note: string | null;
  _count?: { equipment: number };
}

interface CustomerOption {
  id: string;
  name: string;
}

const fmtDate = (s: string) => new Date(s).toLocaleDateString("vi-VN");
const fmtMoney = (v: string | number) => Number(v).toLocaleString("vi-VN") + " ₫";

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ContractItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ContractItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    code: "",
    customerId: "",
    startDate: "",
    endDate: "",
    basePrice: "1500000",
    baseQuota: "5000",
    overagePrice: "250",
    billingDay: "1",
    maintenanceIntervalDays: "30",
    isActive: true,
    note: "",
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      if (customerFilter) sp.set("customerId", customerFilter);

      const [resC, resCust] = await Promise.all([
        fetch(`/api/contracts?${sp.toString()}`),
        fetch("/api/customers?pageSize=100"),
      ]);
      if (resC.ok) {
        const d = await resC.json();
        setContracts(d.items || []);
        setTotal(d.total || 0);
      }
      if (resCust.ok) {
        const dc = await resCust.json();
        setCustomers(dc.items || []);
      }
    } catch {
      toast.error("Lỗi khi tải danh sách hợp đồng");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, customerFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditing(null);
    const today = new Date().toISOString().slice(0, 10);
    const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
    setFormData({
      code: `HD-${new Date().getFullYear()}-${String(total + 1).padStart(3, "0")}`,
      customerId: customers[0]?.id || "",
      startDate: today,
      endDate: nextYear,
      basePrice: "1500000",
      baseQuota: "5000",
      overagePrice: "250",
      billingDay: "1",
      maintenanceIntervalDays: "30",
      isActive: true,
      note: "",
    });
    setShowModal(true);
  };

  const openEdit = (c: ContractItem) => {
    setEditing(c);
    setFormData({
      code: c.code,
      customerId: c.customerId,
      startDate: c.startDate.slice(0, 10),
      endDate: c.endDate.slice(0, 10),
      basePrice: String(c.basePrice),
      baseQuota: String(c.baseQuota),
      overagePrice: String(c.overagePrice),
      billingDay: String(c.billingDay),
      maintenanceIntervalDays: c.maintenanceIntervalDays ? String(c.maintenanceIntervalDays) : "",
      isActive: c.isActive,
      note: c.note || "",
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(editing ? {} : { code: formData.code, customerId: formData.customerId }),
        startDate: formData.startDate,
        endDate: formData.endDate,
        basePrice: Number(formData.basePrice),
        baseQuota: Number(formData.baseQuota),
        overagePrice: Number(formData.overagePrice),
        billingDay: Number(formData.billingDay),
        maintenanceIntervalDays: formData.maintenanceIntervalDays
          ? Number(formData.maintenanceIntervalDays)
          : null,
        isActive: formData.isActive,
        note: formData.note || null,
      };
      const res = await fetch(editing ? `/api/contracts/${editing.id}` : "/api/contracts", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu hợp đồng");
        return;
      }
      toast.success(editing ? "Đã cập nhật hợp đồng" : "Đã tạo hợp đồng mới");
      setShowModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContract = async (c: ContractItem) => {
    if (!confirm(`Bạn có chắc muốn xóa hợp đồng "${c.code}"?`)) return;
    const res = await fetch(`/api/contracts/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa hợp đồng");
      return;
    }
    toast.success(`Đã xóa hợp đồng ${c.code}`);
    loadData();
  };

  const handleExportCsv = () => {
    exportToCsv(
      "danh-sach-hop-dong.csv",
      [
        "Mã Hợp đồng",
        "Khách hàng",
        "Từ ngày",
        "Đến ngày",
        "Giá thuê/tháng",
        "Định mức/máy",
        "Đơn giá vượt",
        "Ngày chốt sổ",
        "Số máy",
      ],
      contracts.map((c) => [
        c.code,
        c.customer.name,
        fmtDate(c.startDate),
        fmtDate(c.endDate),
        c.basePrice,
        c.baseQuota,
        c.overagePrice,
        c.billingDay,
        c._count?.equipment ?? 0,
      ])
    );
  };

  const chips: FilterChipItem[] = [];
  if (search.trim()) {
    chips.push({
      id: "q",
      label: "Mã HĐ",
      value: search.trim(),
      onClear: () => {
        setSearch("");
        setPage(1);
      },
    });
  }
  if (customerFilter) {
    const cust = customers.find((x) => x.id === customerFilter);
    chips.push({
      id: "customer",
      label: "Khách hàng",
      value: cust?.name || customerFilter,
      onClear: () => {
        setCustomerFilter("");
        setPage(1);
      },
    });
  }

  const now = Date.now();
  const soonThreshold = now + 30 * 86400000;
  const expiredCount = contracts.filter((c) => new Date(c.endDate).getTime() < now).length;
  const expiringSoonCount = contracts.filter((c) => {
    const t = new Date(c.endDate).getTime();
    return t >= now && t <= soonThreshold;
  }).length;

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header chuẩn HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-info text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-file-contract fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">Hợp đồng</h1>
          <div className="vr mx-2 d-none d-md-block" style={{ height: "20px" }}></div>
          <div className="d-none d-md-flex gap-3">
            <span className="small text-muted">
              Tổng: <strong>{total}</strong>
            </span>
            <span className="small text-warning-emphasis">
              Sắp hết hạn (30 ngày): <strong>{expiringSoonCount}</strong>
            </span>
            <span className="small text-danger">
              Đã hết hạn: <strong>{expiredCount}</strong>
            </span>
          </div>
        </div>
        <div className="d-flex gap-1">
          <button
            className="btn btn-outline-success btn-sm px-3 fw-bold"
            onClick={handleExportCsv}
          >
            <i className="fas fa-file-excel me-1"></i> Xuất Excel
          </button>
          <button className="btn btn-outline-dark btn-sm px-3 fw-bold" onClick={loadData}>
            <i className="fas fa-sync-alt me-1"></i> Tải lại
          </button>
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={openNew}>
            <i className="fas fa-plus me-1"></i> Tạo hợp đồng
          </button>
        </div>
      </div>

      {/* Dense Filters */}
      <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
        <div className="card-body p-2 bg-light bg-opacity-50">
          <div className="row g-2">
            <div className="col-md-5">
              <div className="input-group input-group-sm border rounded-2 overflow-hidden bg-white">
                <span className="input-group-text bg-white border-0 pe-1">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-0 shadow-none"
                  placeholder="Tìm theo mã hợp đồng..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="col-md-5">
              <select
                className="form-select form-select-sm"
                value={customerFilter}
                onChange={(e) => {
                  setCustomerFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Tất cả khách hàng --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <select
                className="form-select form-select-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10 dòng</option>
                <option value={25}>25 dòng</option>
                <option value={50}>50 dòng</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <ActiveFilterChips
        chips={chips}
        onClearAll={() => {
          setSearch("");
          setCustomerFilter("");
          setPage(1);
        }}
      />

      {/* Dense Table */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
        <div className="card-body p-0">
          <div className="table-responsive table-sticky-container">
            <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-3 py-2 text-uppercase small">Mã HĐ</th>
                  <th className="py-2 text-uppercase small">Khách hàng</th>
                  <th className="py-2 text-uppercase small">Thời hạn</th>
                  <th className="py-2 text-uppercase small text-end">Giá thuê / tháng</th>
                  <th className="py-2 text-uppercase small text-end">Định mức / máy</th>
                  <th className="py-2 text-uppercase small text-end">Đơn giá vượt</th>
                  <th className="py-2 text-uppercase small text-center">Chốt sổ</th>
                  <th className="py-2 text-uppercase small text-center">Số máy</th>
                  <th className="py-2 text-uppercase small text-center">Trạng thái</th>
                  <th className="py-2 text-uppercase small text-end px-3" style={{ width: "110px" }}>
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={10}>
                      <Loading />
                    </td>
                  </tr>
                ) : contracts.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-5 text-muted small">
                      Chưa có hợp đồng nào
                    </td>
                  </tr>
                ) : (
                  contracts.map((c) => {
                    const endT = new Date(c.endDate).getTime();
                    const isExpired = endT < now;
                    const isExpiringSoon = endT >= now && endT <= soonThreshold;
                    const rowClass =
                      !c.isActive || isExpired
                        ? "bg-danger-subtle bg-opacity-10"
                        : isExpiringSoon
                          ? "bg-warning-subtle bg-opacity-10"
                          : "";

                    return (
                      <tr key={c.id} className={rowClass}>
                        <td className="px-3 fw-bold text-primary font-monospace small">{c.code}</td>
                        <td className="fw-semibold text-dark small">{c.customer.name}</td>
                        <td className="small">
                          {fmtDate(c.startDate)} – {fmtDate(c.endDate)}
                        </td>
                        <td className="text-end fw-bold font-monospace small">
                          {fmtMoney(c.basePrice)}
                        </td>
                        <td className="text-end font-monospace small">
                          {c.baseQuota.toLocaleString("vi-VN")} bản
                        </td>
                        <td className="text-end font-monospace small">
                          {fmtMoney(c.overagePrice)}
                        </td>
                        <td className="text-center small">Ngày {c.billingDay}</td>
                        <td className="text-center">
                          <span className="badge bg-primary">{c._count?.equipment ?? 0}</span>
                        </td>
                        <td className="text-center">
                          {!c.isActive ? (
                            <span className="badge bg-secondary">Tạm dừng</span>
                          ) : isExpired ? (
                            <span className="badge bg-danger">Hết hạn</span>
                          ) : isExpiringSoon ? (
                            <span className="badge bg-warning text-dark">Sắp hết hạn</span>
                          ) : (
                            <span className="badge bg-success">Hiệu lực</span>
                          )}
                        </td>
                        <td className="px-3 text-end">
                          <div className="btn-group btn-group-sm">
                            <button
                              className="btn btn-outline-primary btn-sm py-0 px-2"
                              onClick={() => openEdit(c)}
                              title="Sửa hợp đồng"
                            >
                              <i className="fas fa-pen"></i>
                            </button>
                            <button
                              className="btn btn-outline-danger btn-sm py-0 px-2"
                              onClick={() => handleDeleteContract(c)}
                              title="Xóa hợp đồng"
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </div>
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

      {/* Modal Thêm / Sửa Hợp đồng */}
      <ModalShell
        show={showModal}
        size="lg"
        title={editing ? `Cập nhật hợp đồng: ${editing.code}` : "Thêm hợp đồng cho thuê mới"}
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
              form="contract-form"
              disabled={saving}
              className="btn btn-primary btn-sm px-3 fw-bold"
            >
              {saving ? "Đang lưu..." : "Lưu hợp đồng"}
            </button>
          </>
        }
      >
        <form id="contract-form" onSubmit={handleSave}>
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                MÃ HỢP ĐỒNG <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!!editing}
                className="form-control form-control-sm font-monospace"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              />
            </div>

            <div className="col-md-8">
              <label className="form-label small fw-bold text-primary mb-1">
                KHÁCH HÀNG <span className="text-danger">*</span>
              </label>
              <select
                required
                disabled={!!editing}
                className="form-select form-select-sm border-primary"
                value={formData.customerId}
                onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
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
              <label className="form-label small fw-bold text-muted mb-1">
                NGÀY BẮT ĐẦU <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                required
                className="form-control form-control-sm"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                NGÀY KẾT THÚC <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                required
                className="form-control form-control-sm"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                GIÁ THUÊ CỐ ĐỊNH / THÁNG (₫) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                className="form-control form-control-sm"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                ĐỊNH MỨC MẶC ĐỊNH / MÁY (BẢN) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                className="form-control form-control-sm"
                value={formData.baseQuota}
                onChange={(e) => setFormData({ ...formData, baseQuota: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                ĐƠN GIÁ VƯỢT ĐỊNH MỨC (₫/BẢN) <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                required
                min={0}
                step="any"
                className="form-control form-control-sm"
                value={formData.overagePrice}
                onChange={(e) => setFormData({ ...formData, overagePrice: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                NGÀY CHỐT COUNTER HÀNG THÁNG (1–28)
              </label>
              <input
                type="number"
                min={1}
                max={28}
                className="form-control form-control-sm"
                value={formData.billingDay}
                onChange={(e) => setFormData({ ...formData, billingDay: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                CHU KỲ BẢO DƯỠNG ĐỊNH KỲ (NGÀY)
              </label>
              <input
                type="number"
                min={1}
                placeholder="VD: 30 ngày"
                className="form-control form-control-sm"
                value={formData.maintenanceIntervalDays}
                onChange={(e) =>
                  setFormData({ ...formData, maintenanceIntervalDays: e.target.value })
                }
              />
            </div>

            <div className="col-12">
              <label className="form-label small fw-bold text-muted mb-1">GHI CHÚ ĐIỀU KHOẢN</label>
              <textarea
                rows={2}
                className="form-control form-control-sm"
                value={formData.note}
                onChange={(e) => setFormData({ ...formData, note: e.target.value })}
              />
            </div>

            {editing && (
              <div className="col-12 mt-1">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="contractActiveSwitch"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <label className="form-check-label small fw-medium" htmlFor="contractActiveSwitch">
                    Hợp đồng đang có hiệu lực
                  </label>
                </div>
              </div>
            )}
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
