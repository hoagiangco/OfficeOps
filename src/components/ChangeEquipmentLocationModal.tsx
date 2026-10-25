"use client";

import React, { useState, useEffect, useMemo } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";
import Loading from "@/components/Loading";
import { formatLocationPath } from "@/lib/location";

interface BranchNode {
  id: string;
  name: string;
  buildings?: Array<{
    id: string;
    name: string;
    departments?: Array<{ id: string; name: string }>;
  }>;
}

interface CustomerInfo {
  id: string;
  name: string;
  branches?: BranchNode[];
}

interface EquipmentInfo {
  id: string;
  model: string;
  brand?: string | null;
  serialNumber: string;
  branchId?: string | null;
  buildingId?: string | null;
  departmentId?: string | null;
  locationNote?: string | null;
  branch?: { id?: string; name: string } | null;
  building?: { id?: string; name: string } | null;
  department?: { id?: string; name: string } | null;
}

interface ChangeEquipmentLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  equipment: EquipmentInfo | null;
  customer: CustomerInfo | null;
  onSuccess: () => void;
  onOpenOrgChart?: () => void;
}

export default function ChangeEquipmentLocationModal({
  isOpen,
  onClose,
  equipment,
  customer,
  onSuccess,
  onOpenOrgChart,
}: ChangeEquipmentLocationModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [custDetail, setCustDetail] = useState<CustomerInfo | null>(null);
  const [loadingCust, setLoadingCust] = useState(false);

  const [locationTarget, setLocationTarget] = useState("");
  const [locationNote, setLocationNote] = useState("");

  // Nạp dữ liệu khi mở modal
  useEffect(() => {
    if (isOpen && equipment) {
      // Xác định locationTarget ban đầu từ thiết bị
      let initialTarget = "";
      if (equipment.departmentId) {
        initialTarget = `department:${equipment.departmentId}`;
      } else if (equipment.buildingId) {
        initialTarget = `building:${equipment.buildingId}`;
      } else if (equipment.branchId) {
        initialTarget = `branch:${equipment.branchId}`;
      }
      setLocationTarget(initialTarget);
      setLocationNote(equipment.locationNote || "");

      // Luôn đồng bộ sơ đồ vị trí mới nhất của khách hàng từ máy chủ
      if (customer?.id) {
        setLoadingCust(true);
        fetch(`/api/customers/${customer.id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data) setCustDetail(data);
            else setCustDetail(customer);
          })
          .catch(() => {
            setCustDetail(customer);
          })
          .finally(() => setLoadingCust(false));
      }
    }
  }, [isOpen, equipment, customer]);

  const activeCustomer = custDetail || customer;

  // Danh sách các cấp vị trí trong sơ đồ tổ chức
  const locationOptions = useMemo(() => {
    if (!activeCustomer?.branches) return [];
    const options: { targetKey: string; label: string }[] = [];

    activeCustomer.branches.forEach((b) => {
      // Cấp 1
      options.push({
        targetKey: `branch:${b.id}`,
        label: `📁 ${b.name}`,
      });

      b.buildings?.forEach((bu) => {
        // Cấp 2
        options.push({
          targetKey: `building:${bu.id}`,
          label: `   └── 📂 ${bu.name}`,
        });

        bu.departments?.forEach((d) => {
          // Cấp 3
          options.push({
            targetKey: `department:${d.id}`,
            label: `        └── 📍 ${d.name}`,
          });
        });
      });
    });
    return options;
  }, [activeCustomer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!equipment) return;

    setSubmitting(true);
    try {
      const [level, targetId] = locationTarget
        ? locationTarget.split(":")
        : ["", ""];

      const payload = {
        branchId: level === "branch" ? targetId : null,
        buildingId: level === "building" ? targetId : null,
        departmentId: level === "department" ? targetId : null,
        locationNote: locationNote.trim() || null,
      };

      const res = await fetch(`/api/equipment/${equipment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Không thể cập nhật vị trí thiết bị");
        return;
      }

      toast.success(
        `Đã cập nhật vị trí thiết bị ${equipment.model} (${equipment.serialNumber}) thành công!`
      );
      onSuccess();
      onClose();
    } catch {
      toast.error("Lỗi kết nối khi cập nhật vị trí thiết bị");
    } finally {
      setSubmitting(false);
    }
  };

  if (!equipment) return null;

  const currentPath = formatLocationPath(equipment, activeCustomer);
  const currentFull =
    [currentPath, equipment.locationNote].filter(Boolean).join(" • ") ||
    "Tại trụ sở chính";

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={
        <div className="d-flex align-items-center gap-2">
          <i className="fas fa-map-marker-alt text-white fs-6"></i>
          <span>Đổi vị trí lắp đặt máy dịch vụ</span>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        {/* Thông tin thiết bị hiện tại */}
        <div className="card bg-light-subtle border rounded-3 p-3 mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <span className="fw-bold text-dark" style={{ fontSize: "14px" }}>
              {equipment.brand ? `${equipment.brand} ` : ""}
              {equipment.model}
            </span>
            <span className="font-monospace text-primary fw-bold" style={{ fontSize: "12px" }}>
              SN: {equipment.serialNumber}
            </span>
          </div>
          {customer && (
            <div className="small text-secondary mb-1">
              Khách hàng: <strong className="text-dark">{customer.name}</strong>
            </div>
          )}
          <div className="small text-muted d-flex align-items-center gap-1.5 pt-1 border-top">
            <i className="fas fa-location-arrow text-danger opacity-75" style={{ fontSize: "10px" }}></i>
            <span>Vị trí hiện tại:</span>
            <span className="fw-semibold text-dark">{currentFull}</span>
          </div>
        </div>

        {/* 1. Vị trí phân cấp theo sơ đồ tổ chức */}
        <div className="mb-3">
          <div className="d-flex justify-content-between align-items-center mb-1">
            <label className="form-label small fw-bold text-secondary mb-0">
              Vị trí theo sơ đồ tổ chức (Chi nhánh / Tòa nhà / Phòng ban)
            </label>
            {onOpenOrgChart && (
              <button
                type="button"
                className="btn btn-link btn-sm p-0 text-decoration-none fw-semibold"
                style={{ fontSize: "11px" }}
                onClick={() => {
                  onClose();
                  onOpenOrgChart();
                }}
              >
                <i className="fas fa-sitemap me-1"></i>Chỉnh sửa sơ đồ
              </button>
            )}
          </div>

          {loadingCust ? (
            <div className="py-2 text-center text-muted small">
              <Loading size="sm" /> Đang tải sơ đồ vị trí...
            </div>
          ) : (
            <select
              className="form-select form-select-sm border-secondary-subtle"
              value={locationTarget}
              onChange={(e) => setLocationTarget(e.target.value)}
            >
              <option value="">-- Không phân cấp / Trụ sở chính --</option>
              {locationOptions.map((opt) => (
                <option key={opt.targetKey} value={opt.targetKey}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {(!locationOptions || locationOptions.length === 0) && !loadingCust && (
            <div className="form-text text-muted" style={{ fontSize: "11.5px" }}>
              <i className="fas fa-info-circle me-1 text-info"></i>
              Khách hàng này chưa tạo sơ đồ vị trí phân nhánh. Bạn có thể nhập nhanh vào ô
              &quot;Vị trí chi tiết&quot; bên dưới.
            </div>
          )}
        </div>

        {/* 2. Vị trí chi tiết tự do (Ghi chú / Lầu / Bàn) */}
        <div className="mb-3">
          <label className="form-label small fw-bold text-secondary mb-1">
            Vị trí chi tiết tại điểm đặt
          </label>
          <input
            type="text"
            className="form-control form-control-sm border-secondary-subtle"
            placeholder="VD: Lầu 4 - Nhân Sự, Bàn kế toán số 1..."
            value={locationNote}
            onChange={(e) => setLocationNote(e.target.value)}
          />
          <div className="form-text text-muted" style={{ fontSize: "11.5px" }}>
            Nếu có cả sơ đồ phân cấp và vị trí chi tiết, hệ thống sẽ tự động ghép hiển thị:{" "}
            <strong>[Chi nhánh] (Vị trí chi tiết)</strong>.
          </div>
        </div>

        {/* Nút tác vụ */}
        <div className="d-flex justify-content-end gap-2 pt-2 border-top">
          <button
            type="button"
            className="btn btn-sm btn-secondary px-3"
            onClick={onClose}
            disabled={submitting}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="btn btn-sm btn-primary px-3 fw-bold d-inline-flex align-items-center gap-1.5"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loading size="sm" />
                <span>Đang lưu...</span>
              </>
            ) : (
              <>
                <i className="fas fa-check"></i>
                <span>Cập nhật vị trí</span>
              </>
            )}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
