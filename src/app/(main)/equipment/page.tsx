"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import BatchActionBar from "@/components/BatchActionBar";
import ModalShell from "@/components/ModalShell";
import { STATUS_LABELS } from "@/lib/labels";
import { exportToCsv } from "@/lib/csv";

interface EquipmentItem {
  id: string;
  serialNumber: string;
  qrCode: string;
  model: string;
  brand: string | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
  contractId: string | null;
  contract: { id: string; code: string } | null;
  departmentId: string | null;
  department: {
    id: string;
    name: string;
    building: { name: string; branch: { name: string } };
  } | null;
  locationNote: string | null;
  status: string;
  healthScore: number;
  currentCounter: number;
  baseQuota: number | null;
  overagePrice: string | number | null;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface ContractOption {
  id: string;
  code: string;
  customerId: string;
  customer: { id: string; name: string };
}

interface DepartmentOption {
  id: string;
  label: string;
}

const getStatusBadgeClass = (st: string) => {
  switch (st) {
    case "ACTIVE":
      return "badge bg-success";
    case "FAULTY":
      return "badge bg-danger";
    case "WAITING_PARTS":
      return "badge bg-warning text-dark";
    case "RECALLED":
      return "badge bg-secondary";
    case "IN_STOCK":
      return "badge bg-info text-white";
    case "SCRAPPED":
      return "badge bg-dark";
    default:
      return "badge bg-light text-dark border";
  }
};

export default function EquipmentPage() {
  const [items, setItems] = useState<EquipmentItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [contracts, setContracts] = useState<ContractOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [saving, setSaving] = useState(false);

  // Modal đổi trạng thái nhanh
  const [statusTarget, setStatusTarget] = useState<EquipmentItem | null>(null);
  const [newStatus, setNewStatus] = useState("ACTIVE");
  const [statusNote, setStatusNote] = useState("");

  const [formData, setFormData] = useState({
    serialNumber: "",
    model: "",
    brand: "",
    customerId: "",
    contractId: "",
    departmentId: "",
    locationNote: "",
    status: "IN_STOCK",
    healthScore: "100",
    baseQuota: "",
    overagePrice: "",
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      const st = sp.get("status");
      if (st) setStatusFilter(st);
      if (window.innerWidth <= 768) setViewMode("card");
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      if (statusFilter) sp.set("status", statusFilter);
      if (customerFilter) sp.set("customerId", customerFilter);

      const [resEq, resCust, resCt] = await Promise.all([
        fetch(`/api/equipment?${sp.toString()}`),
        fetch("/api/customers?pageSize=100"),
        fetch("/api/contracts?pageSize=100"),
      ]);
      if (resEq.ok) {
        const d = await resEq.json();
        setItems(d.items || []);
        setTotal(d.total || 0);
      }
      if (resCust.ok) {
        const dc = await resCust.json();
        setCustomers(dc.items || []);
      }
      if (resCt.ok) {
        const dct = await resCt.json();
        setContracts(dct.items || []);
      }
    } catch {
      toast.error("Lỗi khi tải danh sách thiết bị");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, statusFilter, customerFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadCustomerDepartments = async (custId: string) => {
    if (!custId) {
      setDepartments([]);
      return;
    }
    const res = await fetch(`/api/customers/${custId}`);
    if (!res.ok) return;
    const data = await res.json();
    const list: DepartmentOption[] = [];
    for (const b of data.branches || []) {
      for (const bd of b.buildings || []) {
        for (const dp of bd.departments || []) {
          list.push({ id: dp.id, label: `${b.name} › ${bd.name} › ${dp.name}` });
        }
      }
    }
    setDepartments(list);
  };

  const openNew = () => {
    setEditing(null);
    setFormData({
      serialNumber: "",
      model: "",
      brand: "",
      customerId: "",
      contractId: "",
      departmentId: "",
      locationNote: "",
      status: "IN_STOCK",
      healthScore: "100",
      baseQuota: "",
      overagePrice: "",
    });
    setDepartments([]);
    setShowModal(true);
  };

  const openEdit = (eq: EquipmentItem) => {
    setEditing(eq);
    setFormData({
      serialNumber: eq.serialNumber,
      model: eq.model,
      brand: eq.brand || "",
      customerId: eq.customerId || "",
      contractId: eq.contractId || "",
      departmentId: eq.departmentId || "",
      locationNote: eq.locationNote || "",
      status: eq.status,
      healthScore: String(eq.healthScore),
      baseQuota: eq.baseQuota !== null ? String(eq.baseQuota) : "",
      overagePrice: eq.overagePrice !== null ? String(eq.overagePrice) : "",
    });
    if (eq.customerId) loadCustomerDepartments(eq.customerId);
    else setDepartments([]);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...(editing ? {} : { serialNumber: formData.serialNumber }),
        model: formData.model,
        brand: formData.brand || (editing ? null : undefined),
        customerId: formData.customerId || (editing ? null : undefined),
        contractId: formData.contractId || (editing ? null : undefined),
        departmentId: formData.departmentId || (editing ? null : undefined),
        locationNote: formData.locationNote || (editing ? null : undefined),
        status: formData.status,
        ...(editing ? { healthScore: Number(formData.healthScore) } : {}),
        baseQuota: formData.baseQuota ? Number(formData.baseQuota) : editing ? null : undefined,
        overagePrice: formData.overagePrice
          ? Number(formData.overagePrice)
          : editing
            ? null
            : undefined,
      };

      const res = await fetch(editing ? `/api/equipment/${editing.id}` : "/api/equipment", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu thiết bị");
        return;
      }
      toast.success(editing ? "Đã cập nhật thiết bị" : "Đã thêm thiết bị mới");
      setShowModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusTarget) return;
    const res = await fetch(`/api/equipment/${statusTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, statusNote }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể đổi trạng thái");
      return;
    }
    toast.success("Đã cập nhật trạng thái thiết bị");
    setStatusTarget(null);
    setStatusNote("");
    loadData();
  };

  const handleBatchStatus = async (st: string) => {
    for (const id of selectedIds) {
      await fetch(`/api/equipment/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: st, statusNote: "Cập nhật hàng loạt" }),
      });
    }
    toast.success(`Đã chuyển ${selectedIds.length} máy sang ${STATUS_LABELS[st]}`);
    setSelectedIds([]);
    loadData();
  };

  const handleDeleteEquipment = async (eq: EquipmentItem) => {
    if (!confirm(`Bạn có chắc muốn xóa thiết bị "${eq.model} (SN: ${eq.serialNumber})"?`))
      return;
    const res = await fetch(`/api/equipment/${eq.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa thiết bị");
      return;
    }
    toast.success(`Đã xóa thiết bị ${eq.serialNumber}`);
    loadData();
  };

  const handleExportCsv = () => {
    exportToCsv(
      "danh-sach-thiet-bi.csv",
      [
        "Serial Number",
        "Hãng",
        "Model",
        "Khách hàng",
        "Mã Hợp đồng",
        "Trạng thái",
        "Counter hiện tại",
        "Sức khỏe (%)",
      ],
      items.map((eq) => [
        eq.serialNumber,
        eq.brand || "",
        eq.model,
        eq.customer?.name || "Trong kho",
        eq.contract?.code || "",
        STATUS_LABELS[eq.status] || eq.status,
        eq.currentCounter,
        eq.healthScore,
      ])
    );
  };

  const chips: FilterChipItem[] = [];
  if (search.trim()) {
    chips.push({
      id: "q",
      label: "Serial/Model",
      value: search.trim(),
      onClear: () => {
        setSearch("");
        setPage(1);
      },
    });
  }
  if (statusFilter) {
    chips.push({
      id: "status",
      label: "Trạng thái",
      value: STATUS_LABELS[statusFilter] || statusFilter,
      onClear: () => {
        setStatusFilter("");
        setPage(1);
      },
    });
  }
  if (customerFilter) {
    const c = customers.find((x) => x.id === customerFilter);
    chips.push({
      id: "customer",
      label: "Khách hàng",
      value: c?.name || customerFilter,
      onClear: () => {
        setCustomerFilter("");
        setPage(1);
      },
    });
  }

  const activeCount = items.filter((i) => i.status === "ACTIVE").length;
  const faultyCount = items.filter((i) => i.status === "FAULTY").length;
  const filteredContracts = contracts.filter(
    (c) => !formData.customerId || c.customerId === formData.customerId
  );

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header chuẩn HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-primary text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-print fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">HỒ SƠ THIẾT BỊ &amp; VÒNG ĐỜI MÁY</h1>
          <div className="vr mx-2 d-none d-md-block" style={{ height: "20px" }}></div>
          <div className="d-none d-md-flex gap-3">
            <span className="small text-muted">
              Tổng: <strong>{total}</strong>
            </span>
            <span className="small text-success">
              Đang hoạt động: <strong>{activeCount}</strong>
            </span>
            <span className="small text-danger">
              Lỗi / Bảo trì: <strong>{faultyCount}</strong>
            </span>
          </div>
        </div>
        <div className="d-flex gap-1">
          <div className="btn-group btn-group-sm">
            <button
              type="button"
              className={`btn ${viewMode === "table" ? "btn-dark" : "btn-outline-dark"}`}
              onClick={() => setViewMode("table")}
              title="Xem dạng bảng"
            >
              <i className="fas fa-table"></i>
            </button>
            <button
              type="button"
              className={`btn ${viewMode === "card" ? "btn-dark" : "btn-outline-dark"}`}
              onClick={() => setViewMode("card")}
              title="Xem dạng thẻ"
            >
              <i className="fas fa-th-large"></i>
            </button>
          </div>
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
            <i className="fas fa-plus me-1"></i> Thêm thiết bị
          </button>
        </div>
      </div>

      {/* Dense Filters */}
      <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
        <div className="card-body p-2 bg-light bg-opacity-50">
          <div className="row g-2">
            <div className="col-md-4">
              <div className="input-group input-group-sm border rounded-2 overflow-hidden bg-white">
                <span className="input-group-text bg-white border-0 pe-1">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-0 shadow-none"
                  placeholder="Tìm theo Serial Number hoặc Model..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="col-md-3">
              <select
                className="form-select form-select-sm"
                value={customerFilter}
                onChange={(e) => {
                  setCustomerFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Mọi khách hàng --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-3">
              <select
                className="form-select form-select-sm"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Tất cả trạng thái --</option>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
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
          setStatusFilter("");
          setCustomerFilter("");
          setPage(1);
        }}
      />

      {/* View Mode: Table or Card */}
      {viewMode === "table" ? (
        <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
          <div className="card-body p-0">
            <div className="table-responsive table-sticky-container">
              <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
                <thead className="bg-dark text-white">
                  <tr>
                    <th className="px-3 py-2" style={{ width: "36px" }}>
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={(e) =>
                          setSelectedIds(e.target.checked ? items.map((x) => x.id) : [])
                        }
                      />
                    </th>
                    <th className="py-2 text-uppercase small">Serial &amp; Model</th>
                    <th className="py-2 text-uppercase small">Khách hàng &amp; Vị trí</th>
                    <th className="py-2 text-uppercase small">Hợp đồng</th>
                    <th className="py-2 text-uppercase small text-center">Trạng thái</th>
                    <th className="py-2 text-uppercase small text-end">Counter</th>
                    <th className="py-2 text-uppercase small text-center">Sức khỏe</th>
                    <th className="py-2 text-uppercase small text-end px-3" style={{ width: "145px" }}>
                      Thao tác
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={8}>
                        <Loading />
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-5 text-muted small">
                        Không tìm thấy thiết bị nào
                      </td>
                    </tr>
                  ) : (
                    items.map((eq) => {
                      const loc = eq.department
                        ? `${eq.department.building.branch.name} › ${eq.department.building.name} › ${eq.department.name}`
                        : eq.locationNote || "—";
                      const rowClass =
                        eq.status === "FAULTY"
                          ? "bg-danger-subtle bg-opacity-10"
                          : eq.status === "WAITING_PARTS"
                            ? "bg-warning-subtle bg-opacity-10"
                            : "";

                      return (
                        <tr key={eq.id} className={rowClass}>
                          <td className="px-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(eq.id)}
                              onChange={() =>
                                setSelectedIds((prev) =>
                                  prev.includes(eq.id)
                                    ? prev.filter((x) => x !== eq.id)
                                    : [...prev, eq.id]
                                )
                              }
                            />
                          </td>
                          <td className="py-1.5">
                            <Link
                              href={`/equipment/${eq.id}`}
                              className="fw-bold text-primary font-monospace text-decoration-none small"
                            >
                              {eq.serialNumber}
                            </Link>
                            <div className="text-dark small">
                              {eq.brand ? `${eq.brand} ` : ""}
                              <strong>{eq.model}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="fw-semibold text-dark small">
                              {eq.customer?.name || "Trong kho công ty"}
                            </div>
                            <div className="text-muted" style={{ fontSize: "0.74rem" }}>
                              <i className="fas fa-map-pin me-1"></i>
                              {loc}
                            </div>
                          </td>
                          <td className="small font-monospace">
                            {eq.contract?.code || "—"}
                          </td>
                          <td className="text-center">
                            <span className={getStatusBadgeClass(eq.status)}>
                              {STATUS_LABELS[eq.status]}
                            </span>
                          </td>
                          <td className="text-end font-monospace fw-bold text-dark small">
                            {eq.currentCounter.toLocaleString("vi-VN")}
                          </td>
                          <td className="text-center small">
                            <span
                              className={`fw-bold ${
                                eq.healthScore >= 80
                                  ? "text-success"
                                  : eq.healthScore >= 50
                                    ? "text-warning-emphasis"
                                    : "text-danger"
                              }`}
                            >
                              {eq.healthScore}%
                            </span>
                          </td>
                          <td className="px-3 text-end">
                            <div className="btn-group btn-group-sm">
                              <Link
                                href={`/equipment/${eq.id}`}
                                className="btn btn-outline-secondary btn-sm py-0 px-2"
                                title="Xem hồ sơ chi tiết"
                              >
                                <i className="fas fa-eye"></i>
                              </Link>
                              <button
                                className="btn btn-outline-warning btn-sm py-0 px-2 text-dark"
                                title="Đổi trạng thái nhanh"
                                onClick={() => {
                                  setStatusTarget(eq);
                                  setNewStatus(eq.status);
                                  setStatusNote("");
                                }}
                              >
                                <i className="fas fa-exchange-alt"></i>
                              </button>
                              <button
                                className="btn btn-outline-primary btn-sm py-0 px-2"
                                title="Sửa thiết bị"
                                onClick={() => openEdit(eq)}
                              >
                                <i className="fas fa-pen"></i>
                              </button>
                              <Link
                                href={`/api/equipment/${eq.id}/qr`}
                                target="_blank"
                                className="btn btn-outline-dark btn-sm py-0 px-2"
                                title="In mã QR Code"
                              >
                                <i className="fas fa-qrcode"></i>
                              </Link>
                              <button
                                className="btn btn-outline-danger btn-sm py-0 px-2"
                                title="Xóa thiết bị"
                                onClick={() => handleDeleteEquipment(eq)}
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
      ) : (
        <div className="row g-2">
          {items.map((eq) => (
            <div key={eq.id} className="col-12 col-md-6 col-lg-4">
              <div className="card shadow-sm border rounded-3 h-100">
                <div className="card-body p-3">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <Link
                        href={`/equipment/${eq.id}`}
                        className="fw-bold text-primary font-monospace text-decoration-none"
                      >
                        {eq.serialNumber}
                      </Link>
                      <div className="fw-semibold text-dark">{eq.model}</div>
                    </div>
                    <span className={getStatusBadgeClass(eq.status)}>
                      {STATUS_LABELS[eq.status]}
                    </span>
                  </div>
                  <div className="small text-muted mb-2">
                    <div>
                      <i className="fas fa-building me-1"></i>
                      {eq.customer?.name || "Trong kho"}
                    </div>
                    <div>
                      <i className="fas fa-tachometer-alt me-1"></i>
                      Counter: <strong>{eq.currentCounter.toLocaleString("vi-VN")}</strong>
                    </div>
                  </div>
                  <div className="d-flex justify-content-between align-items-center pt-2 border-top">
                    <Link href={`/equipment/${eq.id}`} className="btn btn-outline-primary btn-sm">
                      Hồ sơ máy
                    </Link>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => openEdit(eq)}
                    >
                      <i className="fas fa-pen me-1"></i> Sửa
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIds.length}
        onClearSelection={() => setSelectedIds([])}
      >
        <button
          className="btn btn-success btn-sm rounded-pill px-3"
          onClick={() => handleBatchStatus("ACTIVE")}
        >
          Chuyển: Đang hoạt động
        </button>
        <button
          className="btn btn-danger btn-sm rounded-pill px-3"
          onClick={() => handleBatchStatus("FAULTY")}
        >
          Chuyển: Báo lỗi
        </button>
        <button
          className="btn btn-info text-white btn-sm rounded-pill px-3"
          onClick={() => handleBatchStatus("IN_STOCK")}
        >
          Thu về kho
        </button>
      </BatchActionBar>

      {/* Modal Thêm / Sửa Thiết bị */}
      <ModalShell
        show={showModal}
        size="lg"
        title={
          editing ? `Cập nhật thiết bị: ${editing.serialNumber}` : "Thêm hồ sơ thiết bị mới"
        }
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
              form="equipment-form"
              disabled={saving}
              className="btn btn-primary btn-sm px-3 fw-bold"
            >
              {saving ? "Đang lưu..." : "Lưu thiết bị"}
            </button>
          </>
        }
      >
        <form id="equipment-form" onSubmit={handleSave}>
          <div className="row g-2">
            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                SERIAL NUMBER <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                disabled={!!editing}
                className="form-control form-control-sm font-monospace"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
              />
            </div>

            <div className="col-md-5">
              <label className="form-label small fw-bold text-muted mb-1">
                DÒNG MÁY (MODEL) <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="VD: Ricoh MP 3055"
                className="form-control form-control-sm"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              />
            </div>

            <div className="col-md-3">
              <label className="form-label small fw-bold text-muted mb-1">HÃNG SẢN XUẤT</label>
              <input
                type="text"
                placeholder="Ricoh, Canon..."
                className="form-control form-control-sm"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              />
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-primary mb-1">
                KHÁCH HÀNG SỬ DỤNG
              </label>
              <select
                className="form-select form-select-sm border-primary"
                value={formData.customerId}
                onChange={(e) => {
                  const cid = e.target.value;
                  setFormData({ ...formData, customerId: cid, contractId: "", departmentId: "" });
                  loadCustomerDepartments(cid);
                }}
              >
                <option value="">-- Để trong kho (Chưa giao khách) --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                HỢP ĐỒNG ÁP DỤNG
              </label>
              <select
                className="form-select form-select-sm"
                value={formData.contractId}
                onChange={(e) => setFormData({ ...formData, contractId: e.target.value })}
              >
                <option value="">-- Chọn hợp đồng --</option>
                {filteredContracts.map((ct) => (
                  <option key={ct.id} value={ct.id}>
                    {ct.code} ({ct.customer.name})
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                VỊ TRÍ (CHI NHÁNH › TÒA NHÀ › PHÒNG BAN)
              </label>
              <select
                className="form-select form-select-sm"
                value={formData.departmentId}
                onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
              >
                <option value="">-- Chọn phòng ban --</option>
                {departments.map((dp) => (
                  <option key={dp.id} value={dp.id}>
                    {dp.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-6">
              <label className="form-label small fw-bold text-muted mb-1">
                GHI CHÚ VỊ TRÍ LẮP ĐẶT
              </label>
              <input
                type="text"
                placeholder="VD: Cạnh phòng họp lầu 2..."
                className="form-control form-control-sm"
                value={formData.locationNote}
                onChange={(e) => setFormData({ ...formData, locationNote: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">TRẠNG THÁI MÁY</label>
              <select
                className="form-select form-select-sm"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                ĐỊNH MỨC RIÊNG (BẢN/THÁNG)
              </label>
              <input
                type="number"
                min={0}
                placeholder="Trống = theo HĐ"
                className="form-control form-control-sm"
                value={formData.baseQuota}
                onChange={(e) => setFormData({ ...formData, baseQuota: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                GIÁ VƯỢT RIÊNG (₫/BẢN)
              </label>
              <input
                type="number"
                min={0}
                step="any"
                placeholder="Trống = theo HĐ"
                className="form-control form-control-sm"
                value={formData.overagePrice}
                onChange={(e) => setFormData({ ...formData, overagePrice: e.target.value })}
              />
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal Đổi trạng thái nhanh */}
      <ModalShell
        show={!!statusTarget}
        size="sm"
        title={`Đổi trạng thái: ${statusTarget?.serialNumber ?? ""}`}
        onClose={() => setStatusTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setStatusTarget(null)}
            >
              Hủy
            </button>
            <button
              type="submit"
              form="quick-status-form"
              className="btn btn-primary btn-sm fw-bold"
            >
              Cập nhật
            </button>
          </>
        }
      >
        <form id="quick-status-form" onSubmit={handleQuickStatus}>
          <div className="mb-2">
            <label className="form-label small fw-bold text-muted mb-1">TRẠNG THÁI MỚI</label>
            <select
              className="form-select form-select-sm"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label small fw-bold text-muted mb-1">
              LÝ DO / GHI CHÚ LỊCH SỬ
            </label>
            <input
              type="text"
              placeholder="VD: Bàn giao cho khách, Kẹt giấy..."
              className="form-control form-control-sm"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
            />
          </div>
        </form>
      </ModalShell>
    </div>
  );
}
