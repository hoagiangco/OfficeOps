"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";

interface EquipmentScanInfo {
  id: string;
  code: string | null;
  serialNumber: string;
  qrCode: string;
  model: string;
  brand: string | null;
  type: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  location: string;
  activeTicket: {
    id: string;
    code: string;
    status: string;
    type: string;
    description: string;
    createdAt: string;
  } | null;
  supportHotline: string;
  supportEmail: string;
}

const COMMON_ISSUES = [
  { id: "JAM", icon: "fas fa-copy", label: "Kẹt giấy liên tục" },
  { id: "TONER", icon: "fas fa-tint", label: "Hết mực / Thay mực" },
  { id: "QUALITY", icon: "fas fa-file-alt", label: "Bản in bị đen / sọc mờ" },
  { id: "ERROR_CODE", icon: "fas fa-exclamation-triangle", label: "Báo lỗi SC / Service" },
  { id: "NETWORK", icon: "fas fa-wifi", label: "Mất kết nối mạng / Không in được" },
  { id: "OTHER", icon: "fas fa-wrench", label: "Sự cố khác" },
];

function PublicScanContent({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const resolvedParams = use(params);
  const code = resolvedParams.code;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<EquipmentScanInfo | null>(null);

  // Form State
  const [selectedIssue, setSelectedIssue] = useState<string>("JAM");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [description, setDescription] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Submit State
  const [submitting, setSubmitting] = useState(false);
  const [createdResult, setCreatedResult] = useState<{
    ticketCode: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    async function fetchEquipment() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/scan/${encodeURIComponent(code)}`);
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || "Không tìm thấy thiết bị tương ứng với mã QR này");
        }
        const data = await res.json();
        setEquipment(data);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Lỗi khi tải thông tin thiết bị");
      } finally {
        setLoading(false);
      }
    }
    fetchEquipment();
  }, [code]);

  // Upload ảnh chụp lỗi
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/scan/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Không thể tải ảnh lên");
      }

      const resData = await res.json();
      setPhotoUrl(resData.url);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Lỗi upload ảnh chụp");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Submit form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName.trim()) {
      alert("Vui lòng nhập họ tên người liên hệ");
      return;
    }
    if (!contactPhone.trim() || contactPhone.trim().length < 9) {
      alert("Vui lòng nhập số điện thoại hợp lệ để kỹ thuật viên liên hệ lại");
      return;
    }
    if (!description.trim()) {
      alert("Vui lòng mô tả thêm hiện tượng hư hỏng");
      return;
    }

    const issueObj = COMMON_ISSUES.find((i) => i.id === selectedIssue);
    const issueLabel = issueObj ? issueObj.label : "Sự cố kỹ thuật";

    setSubmitting(true);
    try {
      const res = await fetch(`/api/scan/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactName: contactName.trim(),
          contactPhone: contactPhone.trim(),
          issueType: issueLabel,
          description: description.trim(),
          priority: isUrgent ? "URGENT" : "NORMAL",
          photoUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gửi yêu cầu thất bại. Vui lòng thử lại");
      }

      setCreatedResult({
        ticketCode: data.ticket?.code || "TK-NEW",
        message: data.message,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Đã có lỗi xảy ra");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-vh-100 d-flex flex-column justify-content-center align-items-center bg-light p-4">
        <div className="spinner-border text-primary mb-3" role="status" style={{ width: "3rem", height: "3rem" }}>
          <span className="visually-hidden">Đang tải...</span>
        </div>
        <p className="text-muted fw-semibold">Đang nhận diện thiết bị văn phòng...</p>
      </div>
    );
  }

  if (errorMsg || !equipment) {
    return (
      <div className="min-vh-100 d-flex flex-column justify-content-center align-items-center bg-light p-4">
        <div className="card shadow-sm border-0 text-center p-4" style={{ maxWidth: 440 }}>
          <div className="text-danger mb-3">
            <i className="fas fa-exclamation-circle fa-4x"></i>
          </div>
          <h5 className="fw-bold text-dark mb-2">Không tìm thấy máy</h5>
          <p className="text-muted small mb-4">
            {errorMsg || "Mã QR không hợp lệ hoặc thiết bị chưa được đăng ký trong hệ thống."}
          </p>
          <div className="d-grid gap-2">
            <a href="tel:0908123456" className="btn btn-primary fw-bold py-2">
              <i className="fas fa-phone-alt me-2"></i> Gọi Hotline Kỹ Thuật (0908 123 456)
            </a>
            <Link href="/login" className="btn btn-outline-secondary btn-sm">
              Đăng nhập tài khoản nội bộ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-slate-50 pb-5" style={{ backgroundColor: "#f8fafc" }}>
      {/* Top Header Bar */}
      <header className="bg-primary text-white py-3 px-3 shadow-sm sticky-top">
        <div className="container-sm d-flex justify-content-between align-items-center" style={{ maxWidth: 640 }}>
          <div className="d-flex align-items-center gap-2">
            <div className="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center" style={{ width: 36, height: 36 }}>
              <i className="fas fa-print fa-lg"></i>
            </div>
            <div>
              <h6 className="mb-0 fw-bold">OfficeOps Service</h6>
              <small className="opacity-75" style={{ fontSize: "11px" }}>Cổng Tiếp Nhận Phiếu Kỹ Thuật & Hỗ Trợ</small>
            </div>
          </div>
          <a
            href={`tel:${equipment.supportHotline.replace(/\s+/g, "")}`}
            className="btn btn-sm btn-light text-primary fw-bold rounded-pill px-3 shadow-sm d-flex align-items-center gap-1"
          >
            <i className="fas fa-phone-alt"></i>
            <span>Hotline</span>
          </a>
        </div>
      </header>

      <main className="container-sm px-3 pt-3" style={{ maxWidth: 640 }}>
        {/* Kết quả khi đã gửi thành công */}
        {createdResult ? (
          <div className="card shadow-sm border-0 rounded-4 p-4 text-center bg-white my-3 animate__animated animate__fadeIn">
            <div className="mx-auto mb-3 text-success d-flex align-items-center justify-content-center bg-success-subtle rounded-circle" style={{ width: 80, height: 80 }}>
              <i className="fas fa-check fa-3x"></i>
            </div>
            <h4 className="fw-bold text-dark mb-1">Đã Tiếp Nhận Yêu Cầu!</h4>
            <div className="badge bg-primary-subtle text-primary fs-6 px-3 py-2 my-2 align-self-center rounded-pill">
              Mã Phiếu Kỹ Thuật: <strong>{createdResult.ticketCode}</strong>
            </div>
            <p className="text-secondary small mt-2 mb-4">
              {createdResult.message}
            </p>

            <div className="bg-light rounded-3 p-3 text-start small mb-4 border">
              <div className="row g-2">
                <div className="col-5 text-muted">Thiết bị:</div>
                <div className="col-7 fw-bold">{equipment.brand} {equipment.model}</div>
                <div className="col-5 text-muted">Mã Serial:</div>
                <div className="col-7 font-monospace">{equipment.serialNumber}</div>
                <div className="col-5 text-muted">Người liên hệ:</div>
                <div className="col-7">{contactName} ({contactPhone})</div>
                <div className="col-5 text-muted">Hiện tượng:</div>
                <div className="col-7 text-danger fw-semibold">{description}</div>
              </div>
            </div>

            <div className="d-grid gap-2">
              <a
                href={`tel:${equipment.supportHotline.replace(/\s+/g, "")}`}
                className="btn btn-success fw-bold py-2 shadow-sm rounded-pill"
              >
                <i className="fas fa-phone-volume me-2"></i> Gọi Trực Tiếp Kỹ Thuật Viên ({equipment.supportHotline})
              </a>
              <button
                type="button"
                className="btn btn-outline-secondary py-2 rounded-pill mt-1"
                onClick={() => {
                  setCreatedResult(null);
                  setDescription("");
                  setPhotoUrl(null);
                }}
              >
                <i className="fas fa-redo me-1"></i> Báo thêm sự cố khác
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Thẻ Thông Tin Máy (Asset Card) */}
            <div className="card shadow-sm border-0 rounded-4 overflow-hidden mb-3 bg-white">
              <div className="card-header bg-gradient bg-light border-bottom py-2 px-3 d-flex justify-content-between align-items-center">
                <span className="badge bg-secondary-subtle text-dark border">
                  <i className="fas fa-barcode me-1"></i> SN: {equipment.serialNumber}
                </span>
                <span className={`badge ${equipment.status === "ACTIVE" ? "bg-success" : "bg-warning text-dark"}`}>
                  {equipment.status === "ACTIVE" ? "Đang vận hành" : "Cần bảo trì / Báo hỏng"}
                </span>
              </div>
              <div className="card-body p-3">
                <div className="d-flex align-items-start gap-3">
                  <div className="bg-primary-subtle text-primary p-3 rounded-3 d-flex align-items-center justify-content-center" style={{ width: 56, height: 56 }}>
                    <i className="fas fa-print fa-2x"></i>
                  </div>
                  <div className="flex-grow-1">
                    <h5 className="fw-bold text-dark mb-0">
                      {equipment.brand ? `${equipment.brand} ` : ""}{equipment.model}
                    </h5>
                    <div className="text-muted small mt-1">
                      <i className="fas fa-building me-1 text-secondary"></i>
                      <strong>{equipment.customerName}</strong>
                    </div>
                    {equipment.location && (
                      <div className="text-secondary small mt-0">
                        <i className="fas fa-map-marker-alt me-1 text-danger"></i>
                        {equipment.location}
                      </div>
                    )}
                  </div>
                </div>

                {/* Thông báo nếu máy đã có phiếu đang mở */}
                {equipment.activeTicket && (
                  <div className="alert alert-warning border-0 rounded-3 mt-3 mb-0 p-2 d-flex align-items-center gap-2 small">
                    <i className="fas fa-info-circle fa-lg text-warning"></i>
                    <div>
                      Máy đang có phiếu kỹ thuật <strong>{equipment.activeTicket.code}</strong> trong tiến trình xử lý. Kỹ thuật viên sẽ hỗ trợ trong thời gian sớm nhất.
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Form Gửi Báo Hỏng Nhanh */}
            <div className="card shadow-sm border-0 rounded-4 bg-white p-3 mb-3">
              <h6 className="fw-bold text-dark d-flex align-items-center gap-2 mb-3">
                <i className="fas fa-exclamation-circle text-danger"></i>
                <span>Gửi Yêu Cầu Hỗ Trợ Kỹ Thuật</span>
              </h6>

              <form onSubmit={handleSubmit}>
                {/* Lựa chọn loại lỗi thường gặp */}
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary mb-2">
                    1. Chọn loại sự cố gặp phải:
                  </label>
                  <div className="row g-2">
                    {COMMON_ISSUES.map((issue) => {
                      const active = selectedIssue === issue.id;
                      return (
                        <div key={issue.id} className="col-6">
                          <button
                            type="button"
                            className={`btn w-100 text-start p-2 rounded-3 small d-flex align-items-center gap-2 border transition ${
                              active
                                ? "btn-primary shadow-sm"
                                : "btn-light text-dark hover-bg"
                            }`}
                            onClick={() => setSelectedIssue(issue.id)}
                            style={{ minHeight: "44px" }}
                          >
                            <i className={`${issue.icon} ${active ? "text-white" : "text-primary"}`}></i>
                            <span className="fw-semibold text-truncate">{issue.label}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Mô tả chi tiết hiện tượng */}
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary">
                    2. Mô tả chi tiết hiện tượng / Mã lỗi hiển thị: <span className="text-danger">*</span>
                  </label>
                  <textarea
                    className="form-control rounded-3 small"
                    rows={3}
                    placeholder="Ví dụ: Máy báo mã SC542, kẹt giấy ở khay 1, in ra có vệt sọc đen giữa trang..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  ></textarea>
                </div>

                {/* Họ tên & Số điện thoại */}
                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">
                      Họ tên của bạn: <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm rounded-3"
                      placeholder="Nguyễn Văn A"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-semibold text-secondary">
                      Số điện thoại: <span className="text-danger">*</span>
                    </label>
                    <input
                      type="tel"
                      className="form-control form-control-sm rounded-3"
                      placeholder="0912 345 678"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Tải ảnh chụp sự cố / máy lỗi */}
                <div className="mb-3">
                  <label className="form-label small fw-semibold text-secondary d-flex justify-content-between">
                    <span>3. Chụp ảnh màn hình lỗi / bản in hỏng (nếu có):</span>
                    {uploadingPhoto && <span className="text-primary small">Đang tải ảnh...</span>}
                  </label>
                  {photoUrl ? (
                    <div className="position-relative d-inline-block rounded-3 overflow-hidden border">
                      <img src={photoUrl} alt="Ảnh lỗi" style={{ maxHeight: 140, objectFit: "cover" }} />
                      <button
                        type="button"
                        className="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 rounded-circle p-1"
                        style={{ width: 24, height: 24, lineHeight: "10px" }}
                        onClick={() => setPhotoUrl(null)}
                      >
                        &times;
                      </button>
                    </div>
                  ) : (
                    <label className="btn btn-outline-secondary w-100 py-3 rounded-3 border-dashed d-flex flex-column align-items-center justify-content-center cursor-pointer bg-light">
                      <i className="fas fa-camera fa-2x text-primary mb-1"></i>
                      <span className="small fw-semibold text-dark">Chụp ảnh hoặc Chọn từ thư viện ảnh</span>
                      <small className="text-muted" style={{ fontSize: "11px" }}>Hỗ trợ JPG, PNG (tối đa 10MB)</small>
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="d-none"
                        onChange={handlePhotoUpload}
                        disabled={uploadingPhoto}
                      />
                    </label>
                  )}
                </div>

                {/* Chọn ưu tiên khẩn cấp */}
                <div className="form-check form-switch mb-4 p-2 bg-light rounded-3 d-flex align-items-center justify-content-between">
                  <div>
                    <label className="form-check-label fw-bold text-dark small" htmlFor="urgentSwitch">
                      Cần xử lý khẩn cấp (Ưu tiên cao)
                    </label>
                    <div className="text-muted" style={{ fontSize: "11px" }}>
                      Bật khi công việc văn phòng bị ngưng trệ hoàn toàn
                    </div>
                  </div>
                  <input
                    className="form-check-input ms-0 me-2"
                    type="checkbox"
                    role="switch"
                    id="urgentSwitch"
                    checked={isUrgent}
                    onChange={(e) => setIsUrgent(e.target.checked)}
                    style={{ width: "2.5em", height: "1.3em" }}
                  />
                </div>

                {/* Nút gửi yêu cầu */}
                <div className="d-grid gap-2">
                  <button
                    type="submit"
                    className="btn btn-primary fw-bold py-3 rounded-pill shadow d-flex align-items-center justify-content-center gap-2"
                    disabled={submitting || uploadingPhoto}
                    style={{ fontSize: "15px" }}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                        <span>Đang gửi yêu cầu...</span>
                      </>
                    ) : (
                      <>
                        <i className="fas fa-paper-plane"></i>
                        <span>GỬI YÊU CẦU HỖ TRỢ KỸ THUẬT</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Khối Hỗ trợ Hotline Trực Tiếp */}
            <div className="card shadow-sm border-0 rounded-4 bg-white p-3 text-center mb-4">
              <small className="text-muted mb-1">Cần hỗ trợ gấp qua điện thoại?</small>
              <a
                href={`tel:${equipment.supportHotline.replace(/\s+/g, "")}`}
                className="text-danger text-decoration-none fw-bold fs-5 d-flex align-items-center justify-content-center gap-2"
              >
                <i className="fas fa-headset"></i>
                <span>{equipment.supportHotline}</span>
              </a>
              <small className="text-muted mt-1" style={{ fontSize: "11px" }}>
                Hỗ trợ kỹ thuật 8:00 - 18:00 (Thứ 2 - Thứ 7)
              </small>
            </div>
          </>
        )}
      </main>

      <footer className="text-center text-muted small py-3" style={{ fontSize: "11px" }}>
        © {new Date().getFullYear()} OfficeOps • Hệ Thống Vận Hành Dịch Vụ Thiết Bị Văn Phòng
      </footer>
    </div>
  );
}

export default function PublicScanPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-vh-100 d-flex flex-column justify-content-center align-items-center bg-light p-4">
          <div className="spinner-border text-primary mb-3" role="status" style={{ width: "3rem", height: "3rem" }}></div>
          <p className="text-muted fw-semibold">Đang nhận diện thiết bị văn phòng...</p>
        </div>
      }
    >
      <PublicScanContent params={params} />
    </React.Suspense>
  );
}
