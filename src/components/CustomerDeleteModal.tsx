"use client";

import React, { useState } from "react";
import { toast } from "react-toastify";
import ModalShell from "@/components/ModalShell";

interface CustomerDeleteModalProps {
  isOpen: boolean;
  customer: {
    id: string;
    code?: string | null;
    name: string;
    group?: string;
    status?: string;
    _count?: {
      contracts?: number;
      equipment?: number;
      tickets?: number;
      invoices?: number;
      branches?: number;
    };
    equipment?: Array<{ id: string }>;
  } | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CustomerDeleteModal({
  isOpen,
  customer,
  onClose,
  onSuccess,
}: CustomerDeleteModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (!customer) return null;

  const contracts = customer._count?.contracts ?? 0;
  const equipment = customer._count?.equipment ?? (customer.equipment?.length ?? 0);
  const tickets = customer._count?.tickets ?? 0;
  const invoices = customer._count?.invoices ?? 0;
  const branches = customer._count?.branches ?? 0;

  const hasConstraints = contracts > 0 || equipment > 0 || tickets > 0 || invoices > 0 || branches > 0;

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Không thể xóa khách hàng");
        return;
      }

      toast.success(`Đã xóa vĩnh viễn khách hàng "${customer.name}"`);
      onClose();
      onSuccess();
    } catch {
      toast.error("Lỗi kết nối khi xóa khách hàng");
    } finally {
      setDeleting(false);
    }
  };

  const handleUpdateStatus = async (newStatus: "SUSPENDED" | "INACTIVE") => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data.error || "Không thể cập nhật trạng thái");
        return;
      }

      const label = newStatus === "SUSPENDED" ? "Tạm ngưng" : "Ngừng dịch vụ";
      toast.success(`Đã chuyển trạng thái khách hàng sang "${label}"`);
      onClose();
      onSuccess();
    } catch {
      toast.error("Lỗi kết nối khi cập nhật");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="d-flex align-items-center gap-2">
          {hasConstraints ? (
            <>
              <i className="fas fa-shield-alt text-warning fs-5"></i>
              <span>Cảnh báo ràng buộc dữ liệu khách hàng</span>
            </>
          ) : (
            <>
              <i className="fas fa-trash-alt text-danger fs-5"></i>
              <span>Xác nhận xóa khách hàng</span>
            </>
          )}
        </div>
      }
      size="md"
      headerClass={hasConstraints ? "bg-dark text-white" : "bg-danger text-white"}
    >
      <div className="d-flex flex-column gap-3">
        {/* Thông tin khách hàng */}
        <div className="p-3 bg-light rounded border">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <span className="badge bg-secondary font-monospace mb-1">
                #{customer.code || customer.id.slice(-8).toUpperCase()}
              </span>
              <h6 className="fw-bold text-dark mb-1">{customer.name}</h6>
              <div className="small text-muted">
                Phân nhóm: <strong>{customer.group || "Khách thường"}</strong> • Trạng thái:{" "}
                <span
                  className={`badge ${
                    customer.status === "ACTIVE"
                      ? "bg-success"
                      : customer.status === "SUSPENDED"
                      ? "bg-warning text-dark"
                      : "bg-secondary"
                  }`}
                  style={{ fontSize: "10.5px" }}
                >
                  {customer.status === "ACTIVE"
                    ? "Đang dùng"
                    : customer.status === "SUSPENDED"
                    ? "Tạm ngưng"
                    : "Ngừng DV"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {hasConstraints ? (
          /* TRƯỜNG HỢP CÓ RÀNG BUỘC DỮ LIỆU */
          <>
            <div className="alert alert-danger py-2 px-3 mb-0 small border-danger d-flex align-items-start gap-2">
              <i className="fas fa-exclamation-triangle text-danger fs-5 flex-shrink-0 mt-0.5"></i>
              <div>
                <strong>Không thể xóa vĩnh viễn khách hàng này!</strong>
                <div className="mt-1">
                  Khách hàng đang có các dữ liệu nghiệp vụ quan trọng liên kết. Để bảo đảm tính toàn vẹn lịch sử máy,
                  chứng từ kế toán và bảo hành, hệ thống chặn hành động xóa.
                </div>
              </div>
            </div>

            {/* Chi tiết các ràng buộc */}
            <div>
              <div className="fw-bold small text-uppercase text-secondary mb-2">
                <i className="fas fa-link me-1"></i> Dữ liệu ràng buộc đang tồn tại:
              </div>
              <div className="row g-2">
                <div className="col-6">
                  <div className={`p-2 rounded border ${contracts > 0 ? "bg-warning bg-opacity-10 border-warning" : "bg-light text-muted"}`}>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small">
                        <i className="fas fa-file-contract text-primary me-1"></i> Hợp đồng:
                      </span>
                      <strong className={contracts > 0 ? "text-danger" : "text-muted"}>
                        {contracts} HĐ
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="col-6">
                  <div className={`p-2 rounded border ${equipment > 0 ? "bg-warning bg-opacity-10 border-warning" : "bg-light text-muted"}`}>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small">
                        <i className="fas fa-print text-success me-1"></i> Thiết bị:
                      </span>
                      <strong className={equipment > 0 ? "text-danger" : "text-muted"}>
                        {equipment} máy
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="col-6">
                  <div className={`p-2 rounded border ${tickets > 0 ? "bg-warning bg-opacity-10 border-warning" : "bg-light text-muted"}`}>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small">
                        <i className="fas fa-ticket-alt text-info me-1"></i> Phiếu sự cố:
                      </span>
                      <strong className={tickets > 0 ? "text-danger" : "text-muted"}>
                        {tickets} phiếu
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="col-6">
                  <div className={`p-2 rounded border ${invoices > 0 ? "bg-warning bg-opacity-10 border-warning" : "bg-light text-muted"}`}>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="small">
                        <i className="fas fa-file-invoice-dollar text-warning me-1"></i> Hóa đơn:
                      </span>
                      <strong className={invoices > 0 ? "text-danger" : "text-muted"}>
                        {invoices} bảng kê
                      </strong>
                    </div>
                  </div>
                </div>

                {branches > 0 && (
                  <div className="col-12">
                    <div className="p-2 rounded border bg-light">
                      <div className="d-flex justify-content-between align-items-center small">
                        <span>
                          <i className="fas fa-sitemap text-secondary me-1"></i> Chi nhánh / Vị trí phòng ban:
                        </span>
                        <strong>{branches} chi nhánh</strong>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Hướng dẫn giải pháp thay thế */}
            <div className="bg-light p-2.5 rounded border small">
              <div className="fw-bold text-dark mb-1">
                <i className="fas fa-lightbulb text-warning me-1"></i> Giải pháp đề xuất:
              </div>
              <div className="text-muted mb-2">
                Nếu khách hàng này không còn sử dụng dịch vụ, bạn có thể chuyển trạng thái để ẩn khỏi danh sách phục vụ
                mà vẫn lưu trữ lịch sử máy và kế toán:
              </div>
              <div className="d-flex gap-2">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning text-dark fw-semibold flex-fill"
                  disabled={updatingStatus || customer.status === "SUSPENDED"}
                  onClick={() => handleUpdateStatus("SUSPENDED")}
                >
                  <i className="fas fa-pause-circle me-1"></i> Chuyển sang Tạm ngưng
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger fw-semibold flex-fill"
                  disabled={updatingStatus || customer.status === "INACTIVE"}
                  onClick={() => handleUpdateStatus("INACTIVE")}
                >
                  <i className="fas fa-ban me-1"></i> Chuyển sang Ngừng DV
                </button>
              </div>
            </div>

            <div className="d-flex justify-content-end pt-2 border-top">
              <button type="button" className="btn btn-secondary btn-sm px-4 fw-bold" onClick={onClose}>
                Đã hiểu &amp; Đóng
              </button>
            </div>
          </>
        ) : (
          /* TRƯỜNG HỢP KHÔNG CÓ RÀNG BUỘC - CHO PHÉP XÓA */
          <>
            <div className="alert alert-success py-2 px-3 mb-0 small border-success d-flex align-items-start gap-2">
              <i className="fas fa-check-circle text-success fs-5 flex-shrink-0 mt-0.5"></i>
              <div>
                <strong>Không phát hiện ràng buộc dữ liệu:</strong>
                <div className="mt-1">
                  Khách hàng này chưa gắn máy photocopy, chưa có hợp đồng, phiếu sự cố hay hóa đơn nào trong hệ thống.
                </div>
              </div>
            </div>

            <div className="text-secondary small">
              <i className="fas fa-info-circle me-1 text-danger"></i>
              Thao tác này sẽ xóa hoàn toàn thông tin khách hàng khỏi hệ thống và <strong>không thể hoàn tác</strong>.
              Bạn có chắc chắn muốn xóa vĩnh viễn?
            </div>

            <div className="d-flex justify-content-end gap-2 pt-2 border-top">
              <button type="button" className="btn btn-outline-secondary btn-sm px-3" onClick={onClose} disabled={deleting}>
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm px-4 fw-bold shadow-sm d-inline-flex align-items-center gap-1"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                    Đang xóa...
                  </>
                ) : (
                  <>
                    <i className="fas fa-trash-alt me-1"></i>
                    Xác nhận xóa vĩnh viễn
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
