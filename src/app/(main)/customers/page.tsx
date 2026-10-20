"use client";

import React, { useState, useEffect, useCallback } from "react";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import ModalShell from "@/components/ModalShell";

interface DepartmentNode {
  id: string;
  name: string;
}

interface BuildingNode {
  id: string;
  name: string;
  departments: DepartmentNode[];
}

interface BranchNode {
  id: string;
  name: string;
  address: string | null;
  buildings: BuildingNode[];
}

interface CustomerItem {
  id: string;
  name: string;
  taxCode: string | null;
  phone: string;
  email: string | null;
  zaloId: string | null;
  address: string;
  createdAt: string;
  _count?: {
    equipment: number;
    contracts: number;
    branches: number;
  };
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");

  // Modal Thêm / Sửa khách hàng
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CustomerItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    taxCode: "",
    phone: "",
    email: "",
    zaloId: "",
    address: "",
  });

  // Modal Quản lý cây Vị trí 3 cấp (Chi nhánh -> Tòa nhà -> Phòng ban)
  const [locCustomer, setLocCustomer] = useState<CustomerItem | null>(null);
  const [branches, setBranches] = useState<BranchNode[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchAddr, setNewBranchAddr] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [newBuildingName, setNewBuildingName] = useState("");
  const [selectedBuildingId, setSelectedBuildingId] = useState("");
  const [newDeptName, setNewDeptName] = useState("");
  const [editingLoc, setEditingLoc] = useState<{
    level: "branch" | "building" | "department";
    id: string;
    name: string;
    address?: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      const res = await fetch(`/api/customers?${sp.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách khách hàng");
      const data = await res.json();
      setCustomers(data.items || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openNew = () => {
    setEditing(null);
    setFormData({ name: "", taxCode: "", phone: "", email: "", zaloId: "", address: "" });
    setShowModal(true);
  };

  const openEdit = (c: CustomerItem) => {
    setEditing(c);
    setFormData({
      name: c.name,
      taxCode: c.taxCode || "",
      phone: c.phone,
      email: c.email || "",
      zaloId: c.zaloId || "",
      address: c.address,
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        taxCode: formData.taxCode || undefined,
        email: formData.email || undefined,
        zaloId: formData.zaloId || undefined,
      };
      const res = await fetch(editing ? `/api/customers/${editing.id}` : "/api/customers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể lưu khách hàng");
        return;
      }
      toast.success(editing ? "Đã cập nhật khách hàng" : "Đã thêm khách hàng mới");
      setShowModal(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: CustomerItem) => {
    if (!confirm(`Xóa khách hàng "${c.name}"?`)) return;
    const res = await fetch(`/api/customers/${c.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể xóa khách hàng");
      return;
    }
    toast.success("Đã xóa khách hàng");
    loadData();
  };

  const openLocationModal = async (c: CustomerItem) => {
    setLocCustomer(c);
    setLocLoading(true);
    try {
      const res = await fetch(`/api/customers/${c.id}`);
      const data = await res.json();
      const bList: BranchNode[] = data.branches || [];
      setBranches(bList);
      if (bList.length > 0) {
        setSelectedBranchId(bList[0].id);
        if (bList[0].buildings?.length > 0) {
          setSelectedBuildingId(bList[0].buildings[0].id);
        }
      }
    } finally {
      setLocLoading(false);
    }
  };

  const handleAddLocation = async (level: "branch" | "building" | "department") => {
    if (!locCustomer) return;
    let body: Record<string, unknown> = {};
    if (level === "branch") {
      if (!newBranchName.trim()) return toast.warning("Nhập tên chi nhánh");
      body = {
        level: "branch",
        customerId: locCustomer.id,
        name: newBranchName.trim(),
        address: newBranchAddr.trim() || undefined,
      };
    } else if (level === "building") {
      if (!selectedBranchId || !newBuildingName.trim())
        return toast.warning("Chọn chi nhánh và nhập tên tòa nhà");
      body = { level: "building", branchId: selectedBranchId, name: newBuildingName.trim() };
    } else {
      if (!selectedBuildingId || !newDeptName.trim())
        return toast.warning("Chọn tòa nhà và nhập tên phòng ban / tầng");
      body = { level: "department", buildingId: selectedBuildingId, name: newDeptName.trim() };
    }

    const res = await fetch("/api/locations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Không thể thêm vị trí");
      return;
    }
    toast.success("Đã thêm vị trí lắp đặt");
    setNewBranchName("");
    setNewBranchAddr("");
    setNewBuildingName("");
    setNewDeptName("");
    openLocationModal(locCustomer);
    loadData();
  };

  const handleSaveEditLocation = async () => {
    if (!editingLoc || !locCustomer) return;
    if (!editingLoc.name.trim()) {
      toast.warning("Tên vị trí không được để trống");
      return;
    }
    const res = await fetch("/api/locations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        level: editingLoc.level,
        id: editingLoc.id,
        name: editingLoc.name.trim(),
        ...(editingLoc.level === "branch"
          ? { address: editingLoc.address?.trim() || null }
          : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Không thể cập nhật vị trí");
      return;
    }
    toast.success("Đã cập nhật vị trí");
    setEditingLoc(null);
    openLocationModal(locCustomer);
  };

  const handleDeleteLocation = async (
    level: "branch" | "building" | "department",
    id: string,
    name: string
  ) => {
    if (!locCustomer) return;
    const label =
      level === "branch" ? "chi nhánh" : level === "building" ? "tòa nhà" : "phòng ban";
    if (!confirm(`Bạn có chắc muốn xóa ${label} "${name}"?`)) return;

    const res = await fetch(`/api/locations?level=${level}&id=${id}`, {
      method: "DELETE",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || `Không thể xóa ${label}`);
      return;
    }
    toast.success(`Đã xóa ${label}`);
    openLocationModal(locCustomer);
    loadData();
  };

  const chips: FilterChipItem[] = [];
  if (search.trim()) {
    chips.push({
      id: "q",
      label: "Tìm kiếm",
      value: search.trim(),
      onClear: () => {
        setSearch("");
        setPage(1);
      },
    });
  }

  const totalEquip = customers.reduce((sum, c) => sum + (c._count?.equipment || 0), 0);
  const totalContract = customers.reduce((sum, c) => sum + (c._count?.contracts || 0), 0);

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header chuẩn HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-success text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-building fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">DANH MỤC KHÁCH HÀNG &amp; ĐỊA ĐIỂM</h1>
          <div className="vr mx-2 d-none d-md-block" style={{ height: "20px" }}></div>
          <div className="d-none d-md-flex gap-3">
            <span className="small text-muted">
              Tổng khách: <strong>{total}</strong>
            </span>
            <span className="small text-info">
              Hợp đồng: <strong>{totalContract}</strong>
            </span>
            <span className="small text-primary">
              Máy đang đặt: <strong>{totalEquip}</strong>
            </span>
          </div>
        </div>
        <div className="d-flex gap-1">
          <button className="btn btn-outline-dark btn-sm px-3 fw-bold" onClick={loadData}>
            <i className="fas fa-sync-alt me-1"></i> Tải lại
          </button>
          <button className="btn btn-primary btn-sm px-3 fw-bold shadow-sm" onClick={openNew}>
            <i className="fas fa-plus me-1"></i> Thêm khách hàng
          </button>
        </div>
      </div>

      {/* Dense Filter */}
      <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
        <div className="card-body p-2 bg-light bg-opacity-50">
          <div className="row g-2">
            <div className="col-md-9">
              <div className="input-group input-group-sm border rounded-2 overflow-hidden bg-white">
                <span className="input-group-text bg-white border-0 pe-1">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-0 shadow-none"
                  placeholder="Tìm tên doanh nghiệp, mã số thuế, số điện thoại..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
                {search && (
                  <button
                    className="btn btn-link btn-sm text-muted text-decoration-none py-0 px-2"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    type="button"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            </div>
            <div className="col-md-3">
              <select
                className="form-select form-select-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={10}>10 dòng / trang</option>
                <option value={25}>25 dòng / trang</option>
                <option value={50}>50 dòng / trang</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <ActiveFilterChips
        chips={chips}
        onClearAll={() => {
          setSearch("");
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
                  <th className="px-3 py-2 text-uppercase small" style={{ width: "45px" }}>
                    STT
                  </th>
                  <th className="py-2 text-uppercase small">Tên khách hàng &amp; MST</th>
                  <th className="py-2 text-uppercase small">Liên hệ (SĐT / Email / Zalo)</th>
                  <th className="py-2 text-uppercase small">Địa chỉ trụ sở</th>
                  <th className="py-2 text-uppercase small text-center">Chi nhánh</th>
                  <th className="py-2 text-uppercase small text-center">Hợp đồng</th>
                  <th className="py-2 text-uppercase small text-center">Thiết bị</th>
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
                ) : customers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-5 text-muted small">
                      Chưa có khách hàng nào
                    </td>
                  </tr>
                ) : (
                  customers.map((c, idx) => (
                    <tr key={c.id}>
                      <td className="px-3 text-muted small">
                        {(page - 1) * pageSize + idx + 1}
                      </td>
                      <td className="py-1.5">
                        <div className="fw-bold text-dark small">{c.name}</div>
                        <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                          MST: <span className="font-monospace">{c.taxCode || "Chưa cập nhật"}</span>
                        </div>
                      </td>
                      <td>
                        <div className="small fw-semibold text-primary">
                          <i className="fas fa-phone-alt fa-xs me-1"></i>
                          {c.phone}
                        </div>
                        <div className="text-muted" style={{ fontSize: "0.73rem" }}>
                          {c.email || "—"} {c.zaloId ? `• Zalo: ${c.zaloId}` : ""}
                        </div>
                      </td>
                      <td className="small text-truncate" style={{ maxWidth: "260px" }}>
                        {c.address}
                      </td>
                      <td className="text-center">
                        <button
                          className="btn btn-outline-info btn-sm py-0 px-2"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => openLocationModal(c)}
                          title="Quản lý Chi nhánh -> Tòa nhà -> Phòng ban"
                        >
                          <i className="fas fa-sitemap me-1"></i>
                          {c._count?.branches ?? 0} CN
                        </button>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-light text-dark border">
                          {c._count?.contracts ?? 0}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-primary">{c._count?.equipment ?? 0}</span>
                      </td>
                      <td className="px-3 text-end">
                        <div className="btn-group btn-group-sm">
                          <button
                            className="btn btn-outline-info btn-sm py-0 px-2"
                            title="Cây vị trí lắp đặt"
                            onClick={() => openLocationModal(c)}
                          >
                            <i className="fas fa-map-marker-alt"></i>
                          </button>
                          <button
                            className="btn btn-outline-primary btn-sm py-0 px-2"
                            title="Sửa thông tin"
                            onClick={() => openEdit(c)}
                          >
                            <i className="fas fa-pen"></i>
                          </button>
                          <button
                            className="btn btn-outline-danger btn-sm py-0 px-2"
                            title="Xóa khách hàng"
                            onClick={() => handleDelete(c)}
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
        </div>
      </div>

      {/* Modal Thêm / Sửa Khách hàng */}
      <ModalShell
        show={showModal}
        title={editing ? `Cập nhật khách hàng: ${editing.name}` : "Thêm khách hàng mới"}
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
              form="customer-form"
              disabled={saving}
              className="btn btn-primary btn-sm px-3 fw-bold"
            >
              {saving ? "Đang lưu..." : "Lưu khách hàng"}
            </button>
          </>
        }
      >
        <form id="customer-form" onSubmit={handleSave}>
          <div className="row g-2">
            <div className="col-md-8">
              <label className="form-label small fw-bold text-muted mb-1">
                TÊN DOANH NGHIỆP / KHÁCH HÀNG <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                className="form-control form-control-sm"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">MÃ SỐ THUẾ</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={formData.taxCode}
                onChange={(e) => setFormData({ ...formData, taxCode: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">
                SỐ ĐIỆN THOẠI <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                className="form-control form-control-sm"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">EMAIL NHẬN HÓA ĐƠN</label>
              <input
                type="email"
                className="form-control form-control-sm"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>

            <div className="col-md-4">
              <label className="form-label small fw-bold text-muted mb-1">ZALO ID / SĐT ZALO</label>
              <input
                type="text"
                className="form-control form-control-sm"
                value={formData.zaloId}
                onChange={(e) => setFormData({ ...formData, zaloId: e.target.value })}
              />
            </div>

            <div className="col-12">
              <label className="form-label small fw-bold text-muted mb-1">
                ĐỊA CHỈ TRỤ SỞ <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                required
                className="form-control form-control-sm"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
          </div>
        </form>
      </ModalShell>

      {/* Modal Cây Vị trí Lắp đặt 3 cấp (Chi nhánh -> Tòa nhà -> Phòng ban) */}
      <ModalShell
        show={!!locCustomer}
        size="lg"
        title={`Cấu trúc Vị trí Lắp đặt – ${locCustomer?.name ?? ""}`}
        onClose={() => setLocCustomer(null)}
        footer={
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setLocCustomer(null)}
          >
            Đóng
          </button>
        }
      >
        {locLoading ? (
          <Loading message="Đang tải sơ đồ vị trí..." />
        ) : (
          <div className="row g-3">
            {/* Cột thêm nhanh 3 cấp */}
            <div className="col-md-5 border-end">
              <div className="mb-3 p-2 bg-light rounded border">
                <div className="small fw-bold text-primary mb-1">1. Thêm Chi nhánh</div>
                <input
                  type="text"
                  placeholder="Tên chi nhánh (VD: CN Hà Nội)"
                  className="form-control form-control-sm mb-1"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                />
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    placeholder="Địa chỉ chi nhánh..."
                    className="form-control"
                    value={newBranchAddr}
                    onChange={(e) => setNewBranchAddr(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => handleAddLocation("branch")}
                  >
                    + Thêm
                  </button>
                </div>
              </div>

              <div className="mb-3 p-2 bg-light rounded border">
                <div className="small fw-bold text-success mb-1">2. Thêm Tòa nhà</div>
                <select
                  className="form-select form-select-sm mb-1"
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                >
                  <option value="">-- Chọn Chi nhánh --</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    placeholder="Tên tòa nhà (VD: Tòa nhà A)"
                    className="form-control"
                    value={newBuildingName}
                    onChange={(e) => setNewBuildingName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleAddLocation("building")}
                  >
                    + Thêm
                  </button>
                </div>
              </div>

              <div className="p-2 bg-light rounded border">
                <div className="small fw-bold text-info mb-1">3. Thêm Phòng ban / Tầng</div>
                <select
                  className="form-select form-select-sm mb-1"
                  value={selectedBuildingId}
                  onChange={(e) => setSelectedBuildingId(e.target.value)}
                >
                  <option value="">-- Chọn Tòa nhà --</option>
                  {branches.flatMap((b) =>
                    b.buildings.map((bd) => (
                      <option key={bd.id} value={bd.id}>
                        {b.name} › {bd.name}
                      </option>
                    ))
                  )}
                </select>
                <div className="input-group input-group-sm">
                  <input
                    type="text"
                    placeholder="VD: Tầng 3 - P. Kế toán"
                    className="form-control"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-info text-white"
                    onClick={() => handleAddLocation("department")}
                  >
                    + Thêm
                  </button>
                </div>
              </div>
            </div>

            {/* Cột hiển thị sơ đồ cây */}
            <div className="col-md-7">
              <div className="small fw-bold text-uppercase text-muted mb-2">
                Sơ đồ vị trí hiện tại ({branches.length} chi nhánh)
              </div>
              {branches.length === 0 ? (
                <div className="text-muted small py-4 text-center border rounded bg-light">
                  Khách hàng này chưa khai báo Chi nhánh / Tòa nhà / Phòng ban
                </div>
              ) : (
                <div className="space-y-2" style={{ maxHeight: "360px", overflowY: "auto" }}>
                  {branches.map((b) => (
                    <div key={b.id} className="border rounded p-2 mb-2 bg-white shadow-2xs">
                      {/* Dòng Chi nhánh */}
                      {editingLoc?.level === "branch" && editingLoc.id === b.id ? (
                        <div className="d-flex flex-wrap gap-1 align-items-center mb-2 bg-light p-1 rounded border">
                          <input
                            type="text"
                            className="form-control form-control-sm"
                            style={{ maxWidth: "180px" }}
                            value={editingLoc.name}
                            onChange={(e) =>
                              setEditingLoc({ ...editingLoc, name: e.target.value })
                            }
                            placeholder="Tên chi nhánh"
                          />
                          <input
                            type="text"
                            className="form-control form-control-sm flex-grow-1"
                            value={editingLoc.address || ""}
                            onChange={(e) =>
                              setEditingLoc({ ...editingLoc, address: e.target.value })
                            }
                            placeholder="Địa chỉ chi nhánh"
                          />
                          <button
                            type="button"
                            className="btn btn-xs btn-primary py-0 px-2"
                            onClick={handleSaveEditLocation}
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            className="btn btn-xs btn-outline-secondary py-0 px-2"
                            onClick={() => setEditingLoc(null)}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="d-flex justify-content-between align-items-center">
                          <div className="fw-bold text-primary small">
                            <i className="fas fa-code-branch me-1"></i> {b.name}
                            {b.address && (
                              <span className="text-muted fw-normal ms-2">({b.address})</span>
                            )}
                          </div>
                          <div className="btn-group btn-group-sm">
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-secondary p-0 me-2"
                              title="Sửa chi nhánh"
                              onClick={() =>
                                setEditingLoc({
                                  level: "branch",
                                  id: b.id,
                                  name: b.name,
                                  address: b.address || "",
                                })
                              }
                            >
                              <i className="fas fa-edit"></i>
                            </button>
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-danger p-0"
                              title="Xóa chi nhánh"
                              onClick={() => handleDeleteLocation("branch", b.id, b.name)}
                            >
                              <i className="fas fa-trash-alt"></i>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Danh sách Tòa nhà */}
                      {b.buildings.length === 0 ? (
                        <div className="text-muted ms-3 small fst-italic">Chưa có tòa nhà</div>
                      ) : (
                        b.buildings.map((bd) => (
                          <div key={bd.id} className="ms-3 mt-2 border-start ps-2">
                            {editingLoc?.level === "building" && editingLoc.id === bd.id ? (
                              <div className="d-flex gap-1 align-items-center mb-1">
                                <input
                                  type="text"
                                  className="form-control form-control-sm"
                                  value={editingLoc.name}
                                  onChange={(e) =>
                                    setEditingLoc({ ...editingLoc, name: e.target.value })
                                  }
                                />
                                <button
                                  type="button"
                                  className="btn btn-xs btn-success py-0 px-2"
                                  onClick={handleSaveEditLocation}
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs btn-outline-secondary py-0 px-2"
                                  onClick={() => setEditingLoc(null)}
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <div className="d-flex justify-content-between align-items-center">
                                <div className="fw-semibold text-success small">
                                  <i className="fas fa-building me-1"></i> {bd.name}
                                </div>
                                <div>
                                  <button
                                    type="button"
                                    className="btn btn-link btn-sm text-secondary p-0 me-2"
                                    title="Sửa tòa nhà"
                                    onClick={() =>
                                      setEditingLoc({
                                        level: "building",
                                        id: bd.id,
                                        name: bd.name,
                                      })
                                    }
                                  >
                                    <i className="fas fa-pen fa-xs"></i>
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-link btn-sm text-danger p-0"
                                    title="Xóa tòa nhà"
                                    onClick={() =>
                                      handleDeleteLocation("building", bd.id, bd.name)
                                    }
                                  >
                                    <i className="fas fa-times"></i>
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Danh sách Phòng ban / Tầng */}
                            <div className="ms-2 d-flex flex-wrap gap-1 mt-1">
                              {bd.departments.length === 0 ? (
                                <span className="text-muted" style={{ fontSize: "0.75rem" }}>
                                  Chưa có phòng ban
                                </span>
                              ) : (
                                bd.departments.map((dp) =>
                                  editingLoc?.level === "department" &&
                                  editingLoc.id === dp.id ? (
                                    <div
                                      key={dp.id}
                                      className="d-inline-flex gap-1 align-items-center bg-light p-1 rounded border"
                                    >
                                      <input
                                        type="text"
                                        className="form-control form-control-sm py-0 px-1"
                                        style={{ width: "150px", fontSize: "0.75rem" }}
                                        value={editingLoc.name}
                                        onChange={(e) =>
                                          setEditingLoc({
                                            ...editingLoc,
                                            name: e.target.value,
                                          })
                                        }
                                      />
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-info text-white py-0 px-1"
                                        style={{ fontSize: "0.7rem" }}
                                        onClick={handleSaveEditLocation}
                                      >
                                        Lưu
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-xs btn-outline-secondary py-0 px-1"
                                        style={{ fontSize: "0.7rem" }}
                                        onClick={() => setEditingLoc(null)}
                                      >
                                        Hủy
                                      </button>
                                    </div>
                                  ) : (
                                    <span
                                      key={dp.id}
                                      className="badge bg-light text-dark border d-inline-flex align-items-center gap-1"
                                      style={{ fontSize: "0.75rem" }}
                                    >
                                      <i className="fas fa-door-open text-info"></i>
                                      <span>{dp.name}</span>
                                      <i
                                        className="fas fa-pen text-secondary ms-1"
                                        style={{ cursor: "pointer", fontSize: "0.65rem" }}
                                        title="Sửa phòng ban"
                                        onClick={() =>
                                          setEditingLoc({
                                            level: "department",
                                            id: dp.id,
                                            name: dp.name,
                                          })
                                        }
                                      ></i>
                                      <i
                                        className="fas fa-times text-danger ms-1"
                                        style={{ cursor: "pointer", fontSize: "0.75rem" }}
                                        title="Xóa phòng ban"
                                        onClick={() =>
                                          handleDeleteLocation("department", dp.id, dp.name)
                                        }
                                      ></i>
                                    </span>
                                  )
                                )
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ModalShell>
    </div>
  );
}
