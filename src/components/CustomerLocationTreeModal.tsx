"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import Loading from "@/components/Loading";

interface EquipmentBrief {
  id: string;
  model: string;
  serialNumber: string;
}

interface DepartmentNode {
  id: string;
  name: string;
  equipment?: EquipmentBrief[];
}

interface BuildingNode {
  id: string;
  name: string;
  departments: DepartmentNode[];
  equipment?: EquipmentBrief[];
}

interface BranchNode {
  id: string;
  name: string;
  address: string | null;
  buildings: BuildingNode[];
  equipment?: EquipmentBrief[];
}

interface CustomerItem {
  id: string;
  name: string;
  code?: string | null;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerItem | null;
  onChanged: () => void;
}

export default function CustomerLocationTreeModal({
  isOpen,
  onClose,
  customer,
  onChanged,
}: Props) {
  const [branches, setBranches] = useState<BranchNode[]>([]);
  const [loading, setLoading] = useState(false);

  // Mở/thu gọn nhánh
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // Thêm vị trí gốc (Cấp 1)
  const [addingRoot, setAddingRoot] = useState(false);
  const [rootName, setRootName] = useState("");

  // Thêm cấp con dưới 1 node
  const [addingChildUnder, setAddingChildUnder] = useState<{
    parentLevel: "branch" | "building";
    parentId: string;
    parentName: string;
  } | null>(null);
  const [childName, setChildName] = useState("");

  // Chỉnh sửa inline
  const [editingItem, setEditingItem] = useState<{
    level: "branch" | "building" | "department";
    id: string;
    name: string;
  } | null>(null);

  // Tải danh sách vị trí của khách hàng
  const loadLocations = useCallback(async () => {
    if (!customer) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/locations?customerId=${customer.id}`);
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
      } else {
        toast.error("Không thể tải sơ đồ vị trí");
      }
    } catch {
      toast.error("Lỗi kết nối khi tải vị trí");
    } finally {
      setLoading(false);
    }
  }, [customer]);

  useEffect(() => {
    if (isOpen && customer) {
      setAddingRoot(false);
      setAddingChildUnder(null);
      setEditingItem(null);
      loadLocations();
    }
  }, [isOpen, customer, loadLocations]);

  // Thống kê tổng số vị trí & máy
  const stats = useMemo(() => {
    let totalNodes = 0;
    let totalEq = 0;

    branches.forEach((b) => {
      totalNodes += 1;
      totalEq += b.equipment?.length || 0;

      b.buildings?.forEach((bld) => {
        totalNodes += 1;
        totalEq += bld.equipment?.length || 0;

        bld.departments?.forEach((dp) => {
          totalNodes += 1;
          totalEq += dp.equipment?.length || 0;
        });
      });
    });

    return { totalNodes, totalEq };
  }, [branches]);

  const hasAnyChildren = useMemo(() => {
    return branches.some(
      (b) =>
        (b.buildings && b.buildings.length > 0) ||
        b.buildings?.some((bu) => bu.departments && bu.departments.length > 0)
    );
  }, [branches]);

  const toggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => {
    const allIds = new Set<string>();
    branches.forEach((b) => {
      allIds.add(b.id);
      b.buildings?.forEach((bu) => allIds.add(bu.id));
    });
    setCollapsedIds(allIds);
  };

  // Thêm vị trí gốc (Cấp 1)
  const handleCreateRoot = async () => {
    if (!customer || !rootName.trim()) {
      toast.warning("Vui lòng nhập tên vị trí");
      return;
    }
    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: "branch",
          customerId: customer.id,
          name: rootName.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Đã thêm vị trí");
        setRootName("");
        setAddingRoot(false);
        loadLocations();
        onChanged();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Không thể thêm vị trí");
      }
    } catch {
      toast.error("Lỗi kết nối");
    }
  };

  // Thêm cấp con (Level 2 hoặc Level 3)
  const handleCreateChild = async () => {
    if (!addingChildUnder || !childName.trim()) {
      toast.warning("Vui lòng nhập tên cấp con");
      return;
    }
    const isLevel2 = addingChildUnder.parentLevel === "branch";
    const body = isLevel2
      ? {
          level: "building",
          branchId: addingChildUnder.parentId,
          name: childName.trim(),
        }
      : {
          level: "department",
          buildingId: addingChildUnder.parentId,
          name: childName.trim(),
        };

    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Đã thêm cấp con");
        setChildName("");
        setAddingChildUnder(null);
        // Tự động mở nhánh cha nếu đang đóng
        setCollapsedIds((prev) => {
          const next = new Set(prev);
          next.delete(addingChildUnder.parentId);
          return next;
        });
        loadLocations();
        onChanged();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Không thể thêm vị trí");
      }
    } catch {
      toast.error("Lỗi kết nối");
    }
  };

  // Chỉnh sửa inline
  const handleSaveEdit = async () => {
    if (!editingItem || !editingItem.name.trim()) {
      toast.warning("Tên vị trí không được để trống");
      return;
    }
    try {
      const res = await fetch("/api/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          level: editingItem.level,
          id: editingItem.id,
          name: editingItem.name.trim(),
        }),
      });
      if (res.ok) {
        toast.success("Đã cập nhật");
        setEditingItem(null);
        loadLocations();
        onChanged();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || "Không thể cập nhật");
      }
    } catch {
      toast.error("Lỗi kết nối");
    }
  };

  // Xóa vị trí
  const handleDelete = async (
    level: "branch" | "building" | "department",
    id: string,
    name: string
  ) => {
    if (!confirm(`Xóa vị trí "${name}"? Các cấp con trực thuộc cũng sẽ bị xóa nếu không có máy.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/locations?level=${level}&id=${id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Đã xóa vị trí thành công");
        loadLocations();
        onChanged();
      } else {
        toast.error(data.error || "Không thể xóa vị trí này");
      }
    } catch {
      toast.error("Lỗi kết nối khi xóa vị trí");
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="lg"
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-sitemap text-primary"></i>
          <span>
            Sơ đồ vị trí: <strong>{customer?.name}</strong>
          </span>
        </div>
      }
    >
      <div>
        {/* THANH CÔNG CỤ TINH GỌN */}
        <div className="d-flex align-items-center justify-content-between pb-2 mb-3 border-bottom">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm fw-bold px-3 shadow-sm"
              onClick={() => {
                setAddingRoot(true);
                setAddingChildUnder(null);
                setEditingItem(null);
              }}
            >
              <i className="fas fa-plus me-1"></i> Thêm vị trí
            </button>
            <span className="text-secondary small ms-1">
              {stats.totalNodes} vị trí • {stats.totalEq} máy
            </span>
          </div>

          {/* Nút mở/thu tất cả nhánh cây (chỉ hiện khi có ít nhất 1 nhánh con) */}
          {hasAnyChildren && (
            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary py-1 px-2.5"
                onClick={expandAll}
                title="Mở rộng tất cả nhánh"
              >
                <i className="fas fa-folder-open me-1"></i> Mở tất cả nhánh
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary py-1 px-2.5"
                onClick={collapseAll}
                title="Thu gọn tất cả nhánh"
              >
                <i className="fas fa-folder me-1"></i> Thu tất cả nhánh
              </button>
            </div>
          )}
        </div>

        {/* FORM THÊM VỊ TRÍ GỐC (CẤP 1) */}
        {addingRoot && (
          <div className="d-flex align-items-center gap-2 p-2 bg-light rounded border mb-3">
            <input
              type="text"
              className="form-control form-control-sm"
              placeholder="Nhập tên vị trí (VD: Phòng 1, Kho A, Chi nhánh Kiên Giang)..."
              value={rootName}
              autoFocus
              onChange={(e) => setRootName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateRoot();
                if (e.key === "Escape") setAddingRoot(false);
              }}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary fw-bold text-nowrap px-3"
              onClick={handleCreateRoot}
            >
              Thêm
            </button>
            <button
              type="button"
              className="btn btn-sm btn-light border text-nowrap"
              onClick={() => {
                setAddingRoot(false);
                setRootName("");
              }}
            >
              Hủy
            </button>
          </div>
        )}

        {/* NỘI DUNG CÂY VỊ TRÍ */}
        {loading ? (
          <div className="py-4 text-center">
            <Loading />
          </div>
        ) : branches.length === 0 ? (
          <div className="text-center py-4 border rounded bg-light">
            <div className="text-muted small mb-2">Chưa có vị trí nào.</div>
            <button
              type="button"
              className="btn btn-outline-primary btn-sm fw-bold"
              onClick={() => setAddingRoot(true)}
            >
              <i className="fas fa-plus me-1"></i> Thêm vị trí đầu tiên
            </button>
          </div>
        ) : (
          <div
            className="tree-view overflow-auto pe-1"
            style={{ maxHeight: "calc(100vh - 200px)" }}
          >
            {branches.map((b) => {
              const isCollapsed = collapsedIds.has(b.id);
              const hasChildren = b.buildings && b.buildings.length > 0;
              const directEqCount = b.equipment?.length || 0;
              const bldEqCount = (b.buildings || []).reduce(
                (sum, bu) =>
                  sum +
                  (bu.equipment?.length || 0) +
                  (bu.departments || []).reduce((s, dp) => s + (dp.equipment?.length || 0), 0),
                0
              );
              const totalBCount = directEqCount + bldEqCount;

              return (
                <div key={b.id} className="tree-node-l1 mb-1">
                  {/* DÒNG CẤP 1 */}
                  <div className="d-flex align-items-center justify-content-between p-1.5 px-2 rounded border bg-white tree-row">
                    <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                      {/* Nút toggle */}
                      {hasChildren ? (
                        <button
                          type="button"
                          className="btn btn-sm btn-link text-secondary p-0"
                          style={{ width: "18px", height: "18px" }}
                          onClick={() => toggleCollapse(b.id)}
                        >
                          <i
                            className={`fas fa-chevron-${isCollapsed ? "right" : "down"} fa-xs`}
                          ></i>
                        </button>
                      ) : (
                        <span style={{ width: "18px" }}></span>
                      )}

                      {/* Icon Cấp 1 */}
                      <i className="fas fa-folder text-primary fs-6"></i>

                      {/* Tên Cấp 1 (hoặc ô input inline edit) */}
                      {editingItem?.id === b.id ? (
                        <div className="d-flex align-items-center gap-1.5 flex-grow-1">
                          <input
                            type="text"
                            className="form-control form-control-sm py-0"
                            style={{ height: "26px", maxWidth: "320px" }}
                            value={editingItem.name}
                            autoFocus
                            onChange={(e) =>
                              setEditingItem({ ...editingItem, name: e.target.value })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") setEditingItem(null);
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-sm btn-success py-0 px-2 fw-bold"
                            style={{ height: "26px" }}
                            onClick={handleSaveEdit}
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-light border py-0 px-1.5"
                            style={{ height: "26px" }}
                            onClick={() => setEditingItem(null)}
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <span className="fw-bold text-dark">{b.name}</span>
                      )}

                      {/* Badge đếm máy (chỉ hiện khi có máy) */}
                      {totalBCount > 0 && (
                        <span
                          className="badge bg-primary-subtle text-primary border border-primary-subtle px-1.5 py-0.5"
                          style={{ fontSize: "11px" }}
                        >
                          {totalBCount} máy
                        </span>
                      )}
                    </div>

                    {/* Nút thao tác Cấp 1 */}
                    <div className="d-flex align-items-center gap-1">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary py-0 px-2 text-nowrap"
                        style={{ height: "24px", fontSize: "11.5px" }}
                        onClick={() => {
                          setAddingChildUnder({
                            parentLevel: "branch",
                            parentId: b.id,
                            parentName: b.name,
                          });
                          setChildName("");
                        }}
                        title="Thêm cấp con"
                      >
                        <i className="fas fa-plus me-1"></i> Cấp con
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-secondary p-1"
                        onClick={() =>
                          setEditingItem({ level: "branch", id: b.id, name: b.name })
                        }
                        title="Đổi tên"
                      >
                        <i className="fas fa-edit"></i>
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-1"
                        onClick={() => handleDelete("branch", b.id, b.name)}
                        title="Xóa"
                      >
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>

                  {/* FORM THÊM CẤP CON DƯỚI CẤP 1 */}
                  {addingChildUnder?.parentId === b.id && (
                    <div className="ms-4 ps-2 my-1">
                      <div className="d-flex align-items-center gap-2 p-1.5 bg-light rounded border">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder={`Thêm cấp con dưới "${b.name}"...`}
                          value={childName}
                          autoFocus
                          onChange={(e) => setChildName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateChild();
                            if (e.key === "Escape") setAddingChildUnder(null);
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-primary fw-bold text-nowrap px-2.5"
                          onClick={handleCreateChild}
                        >
                          Thêm
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-light border text-nowrap"
                          onClick={() => setAddingChildUnder(null)}
                        >
                          Hủy
                        </button>
                      </div>
                    </div>
                  )}

                  {/* CÁC CẤP CON (CẤP 2) */}
                  {!isCollapsed && hasChildren && (
                    <div className="ms-3 ps-3 tree-branch-l2 my-1">
                      {b.buildings.map((bld) => {
                        const isBldCollapsed = collapsedIds.has(bld.id);
                        const hasSubChildren = bld.departments && bld.departments.length > 0;
                        const bldDirectEq = bld.equipment?.length || 0;
                        const deptEqCount = (bld.departments || []).reduce(
                          (sum, dp) => sum + (dp.equipment?.length || 0),
                          0
                        );
                        const totalBldCount = bldDirectEq + deptEqCount;

                        return (
                          <div key={bld.id} className="tree-node-l2 mb-1">
                            {/* DÒNG CẤP 2 */}
                            <div className="d-flex align-items-center justify-content-between p-1.5 px-2 rounded border bg-white tree-row">
                              <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                                {hasSubChildren ? (
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-link text-secondary p-0"
                                    style={{ width: "16px", height: "16px" }}
                                    onClick={() => toggleCollapse(bld.id)}
                                  >
                                    <i
                                      className={`fas fa-chevron-${
                                        isBldCollapsed ? "right" : "down"
                                      } fa-xs`}
                                    ></i>
                                  </button>
                                ) : (
                                  <span style={{ width: "16px" }}></span>
                                )}

                                {/* Icon Cấp 2 */}
                                <i
                                  className="fas fa-folder-open fs-6"
                                  style={{ color: "#4f46e5" }}
                                ></i>

                                {/* Tên Cấp 2 */}
                                {editingItem?.id === bld.id ? (
                                  <div className="d-flex align-items-center gap-1.5 flex-grow-1">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm py-0"
                                      style={{ height: "26px", maxWidth: "320px" }}
                                      value={editingItem.name}
                                      autoFocus
                                      onChange={(e) =>
                                        setEditingItem({ ...editingItem, name: e.target.value })
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSaveEdit();
                                        if (e.key === "Escape") setEditingItem(null);
                                      }}
                                    />
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-success py-0 px-2 fw-bold"
                                      style={{ height: "26px" }}
                                      onClick={handleSaveEdit}
                                    >
                                      Lưu
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-sm btn-light border py-0 px-1.5"
                                      style={{ height: "26px" }}
                                      onClick={() => setEditingItem(null)}
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                ) : (
                                  <span className="fw-semibold text-dark">{bld.name}</span>
                                )}

                                {/* Badge đếm máy */}
                                {totalBldCount > 0 && (
                                  <span
                                    className="badge bg-indigo-subtle border border-indigo-subtle px-1.5 py-0.5"
                                    style={{ fontSize: "11px", color: "#4f46e5" }}
                                  >
                                    {totalBldCount} máy
                                  </span>
                                )}
                              </div>

                              {/* Nút thao tác Cấp 2 */}
                              <div className="d-flex align-items-center gap-1">
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-success py-0 px-2 text-nowrap"
                                  style={{ height: "24px", fontSize: "11.5px" }}
                                  onClick={() => {
                                    setAddingChildUnder({
                                      parentLevel: "building",
                                      parentId: bld.id,
                                      parentName: bld.name,
                                    });
                                    setChildName("");
                                  }}
                                  title="Thêm cấp con"
                                >
                                  <i className="fas fa-plus me-1"></i> Cấp con
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-link text-secondary p-1"
                                  onClick={() =>
                                    setEditingItem({
                                      level: "building",
                                      id: bld.id,
                                      name: bld.name,
                                    })
                                  }
                                  title="Đổi tên"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-link text-danger p-1"
                                  onClick={() => handleDelete("building", bld.id, bld.name)}
                                  title="Xóa"
                                >
                                  <i className="fas fa-trash-alt"></i>
                                </button>
                              </div>
                            </div>

                            {/* FORM THÊM CẤP CON DƯỚI CẤP 2 */}
                            {addingChildUnder?.parentId === bld.id && (
                              <div className="ms-4 ps-2 my-1">
                                <div className="d-flex align-items-center gap-2 p-1.5 bg-light rounded border">
                                  <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    placeholder={`Thêm cấp con dưới "${bld.name}"...`}
                                    value={childName}
                                    autoFocus
                                    onChange={(e) => setChildName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") handleCreateChild();
                                      if (e.key === "Escape") setAddingChildUnder(null);
                                    }}
                                  />
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-success fw-bold text-nowrap px-2.5"
                                    onClick={handleCreateChild}
                                  >
                                    Thêm
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-light border text-nowrap"
                                    onClick={() => setAddingChildUnder(null)}
                                  >
                                    Hủy
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* CÁC CẤP CON (CẤP 3) */}
                            {!isBldCollapsed && hasSubChildren && (
                              <div className="ms-3 ps-3 tree-branch-l3 my-1">
                                {bld.departments.map((dept) => {
                                  const deptEqCount = dept.equipment?.length || 0;
                                  return (
                                    <div
                                      key={dept.id}
                                      className="d-flex align-items-center justify-content-between p-1.5 px-2 rounded border bg-white tree-row mb-1"
                                    >
                                      <div className="d-flex align-items-center gap-2 min-w-0 flex-grow-1">
                                        {/* Icon Cấp 3 */}
                                        <i className="fas fa-map-pin text-success fa-sm"></i>

                                        {/* Tên Cấp 3 */}
                                        {editingItem?.id === dept.id ? (
                                          <div className="d-flex align-items-center gap-1.5 flex-grow-1">
                                            <input
                                              type="text"
                                              className="form-control form-control-sm py-0"
                                              style={{ height: "26px", maxWidth: "320px" }}
                                              value={editingItem.name}
                                              autoFocus
                                              onChange={(e) =>
                                                setEditingItem({
                                                  ...editingItem,
                                                  name: e.target.value,
                                                })
                                              }
                                              onKeyDown={(e) => {
                                                if (e.key === "Enter") handleSaveEdit();
                                                if (e.key === "Escape") setEditingItem(null);
                                              }}
                                            />
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-success py-0 px-2 fw-bold"
                                              style={{ height: "26px" }}
                                              onClick={handleSaveEdit}
                                            >
                                              Lưu
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-sm btn-light border py-0 px-1.5"
                                              style={{ height: "26px" }}
                                              onClick={() => setEditingItem(null)}
                                            >
                                              Hủy
                                            </button>
                                          </div>
                                        ) : (
                                          <span className="text-dark small">{dept.name}</span>
                                        )}

                                        {/* Badge đếm máy */}
                                        {deptEqCount > 0 && (
                                          <span
                                            className="badge bg-success-subtle text-success border border-success-subtle px-1.5 py-0.5"
                                            style={{ fontSize: "10.5px" }}
                                          >
                                            {deptEqCount} máy
                                          </span>
                                        )}
                                      </div>

                                      {/* Nút thao tác Cấp 3 (tối đa 3 cấp nên không có nút thêm con nữa) */}
                                      <div className="d-flex align-items-center gap-1">
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-link text-secondary p-1"
                                          onClick={() =>
                                            setEditingItem({
                                              level: "department",
                                              id: dept.id,
                                              name: dept.name,
                                            })
                                          }
                                          title="Đổi tên"
                                        >
                                          <i className="fas fa-edit"></i>
                                        </button>
                                        <button
                                          type="button"
                                          className="btn btn-sm btn-link text-danger p-1"
                                          onClick={() =>
                                            handleDelete("department", dept.id, dept.name)
                                          }
                                          title="Xóa"
                                        >
                                          <i className="fas fa-trash-alt"></i>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        .tree-row {
          transition: all 0.15s ease-in-out;
        }
        .tree-row:hover {
          background-color: #f1f5f9 !important;
          border-color: #cbd5e1 !important;
        }
        .tree-branch-l2 {
          border-left: 2px dashed #94a3b8;
        }
        .tree-branch-l3 {
          border-left: 2px dashed #cbd5e1;
        }
      `}</style>
    </ModalShell>
  );
}
