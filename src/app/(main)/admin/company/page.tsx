"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import { MailTestModal } from "@/components/MailTestModal";
import {
  CompanyProfile,
  DEFAULT_COMPANY_PROFILE,
  BankInfo,
  generateVietQrUrl,
} from "@/lib/companyProfile";

export default function AdminCompanyPage() {
  const [profile, setProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [banks, setBanks] = useState<BankInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showMailModal, setShowMailModal] = useState(false);

  // Dữ liệu thử nghiệm xem trước VietQR
  const [testAmount, setTestAmount] = useState<number>(2500000);
  const [testContent, setTestContent] = useState<string>("THANH TOAN HD-2026-001");

  const loadProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/company");
      if (!res.ok) throw new Error("Không thể tải cấu hình doanh nghiệp");
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
      if (data.banks) setBanks(data.banks);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const handleBankSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedBin = e.target.value;
    const found = banks.find((b) => b.bin === selectedBin);
    if (found) {
      setProfile((prev) => ({
        ...prev,
        bankBin: found.bin,
        bankName: found.name,
      }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Không thể lưu cấu hình");
      setProfile(data.profile);
      toast.success("Đã cập nhật thông tin Doanh nghiệp & Tài khoản VietQR thành công!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi lưu cấu hình");
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefault = () => {
    if (confirm("Bạn có chắc chắn muốn đặt lại thông tin mẫu mặc định không?")) {
      setProfile(DEFAULT_COMPANY_PROFILE);
    }
  };

  // Sinh mã VietQR xem trước trực tiếp
  const liveVietQrUrl = generateVietQrUrl({
    bankBin: profile.bankBin,
    bankAccount: profile.bankAccount,
    amount: testAmount,
    content: testContent,
    accountName: profile.accountHolder,
    template: profile.qrTemplate,
  });

  return (
    <div className="container-fluid px-1 py-1">
      {/* Header Bar chuẩn HoaGiang */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center flex-wrap gap-2">
          <div
            className="bg-primary text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-building fa-sm"></i>
          </div>
          <div>
            <h1 className="h6 mb-0 text-dark fw-bold">Cấu hình Doanh nghiệp & VietQR</h1>
            <span className="small text-muted" style={{ fontSize: "11px" }}>
              Tùy chỉnh thông tin công ty, hotline, số tài khoản và mẫu in bảng kê A4
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
            type="button"
            className="btn btn-primary btn-sm px-3 fw-bold shadow-sm d-inline-flex align-items-center gap-1.5"
            disabled={saving || loading}
            onClick={handleSave}
          >
            <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-save"}`}></i>
            <span>{saving ? "Đang lưu..." : "Lưu cấu hình"}</span>
          </button>
        </div>
      </div>

      {/* Navigation Tabs giữa các trang Hệ Thống */}
      <div className="d-flex gap-2 mb-3 border-bottom bg-white px-3 pt-2 rounded-top border flex-wrap">
        <Link
          href="/admin"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-user-shield me-1"></i> Tài khoản người dùng
        </Link>
        <Link
          href="/admin/permissions"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-key me-1"></i> Phân quyền ma trận
        </Link>
        <Link
          href="/admin/company"
          className="pb-2 text-decoration-none small fw-bold text-primary border-bottom border-primary border-2 px-2"
        >
          <i className="fas fa-building-circle-check me-1"></i> Cấu hình Doanh nghiệp & VietQR
        </Link>
        <Link
          href="/admin/audit-logs"
          className="pb-2 text-decoration-none small fw-semibold text-secondary px-2"
        >
          <i className="fas fa-history me-1"></i> Nhật ký hoạt động
        </Link>
        <button
          type="button"
          onClick={() => setShowMailModal(true)}
          className="pb-2 btn btn-link text-decoration-none small fw-semibold text-secondary px-2 border-0 shadow-none"
        >
          <i className="fas fa-envelope me-1 text-primary"></i> Kiểm tra Email (SMTP)
        </button>
      </div>

      {loading ? (
        <Loading text="Đang tải thông tin cấu hình doanh nghiệp..." />
      ) : (
        <form onSubmit={handleSave}>
          <div className="row g-3">
            {/* Cột trái: Nhập liệu thông tin công ty và ngân hàng */}
            <div className="col-lg-7">
              {/* Card 1: Thông tin Pháp lý Doanh nghiệp */}
              <div className="card shadow-sm border mb-3">
                <div className="card-header bg-light py-2 px-3 fw-bold small text-dark d-flex align-items-center gap-2">
                  <i className="fas fa-id-card text-primary"></i>
                  <span>1. Thông tin Pháp lý Doanh nghiệp (Đơn vị cung cấp dịch vụ)</span>
                </div>
                <div className="card-body p-3">
                  <div className="row g-2 mb-2">
                    <div className="col-md-8">
                      <label className="form-label small fw-bold mb-1">
                        Tên đầy đủ công ty (In trên đầu bảng kê & Hóa đơn) <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm text-uppercase fw-semibold"
                        required
                        value={profile.companyName}
                        onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                        placeholder="VD: CÔNG TY TNHH GIẢI PHÁP VĂN PHÒNG OFFICEOPS"
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-bold mb-1">
                        Tên viết tắt / Thương hiệu <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm text-uppercase font-monospace fw-bold text-primary"
                        required
                        value={profile.shortName}
                        onChange={(e) => setProfile({ ...profile, shortName: e.target.value })}
                        placeholder="VD: OFFICEOPS"
                      />
                    </div>
                  </div>

                  <div className="row g-2 mb-2">
                    <div className="col-md-4">
                      <label className="form-label small fw-bold mb-1">
                        Mã số thuế (MST) <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm font-monospace"
                        required
                        value={profile.taxCode}
                        onChange={(e) => setProfile({ ...profile, taxCode: e.target.value })}
                        placeholder="VD: 0317899999"
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-bold mb-1">
                        Hotline Kỹ thuật / Kế toán <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        required
                        value={profile.hotline}
                        onChange={(e) => setProfile({ ...profile, hotline: e.target.value })}
                        placeholder="VD: 0908 123 456"
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-bold mb-1">
                        Email liên hệ cước <span className="text-danger">*</span>
                      </label>
                      <input
                        type="email"
                        className="form-control form-control-sm"
                        required
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        placeholder="contact@officeops.vn"
                      />
                    </div>
                  </div>

                  <div className="mb-2">
                    <label className="form-label small fw-bold mb-1">
                      Địa chỉ trụ sở công ty <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      required
                      value={profile.address}
                      onChange={(e) => setProfile({ ...profile, address: e.target.value })}
                      placeholder="VD: Tầng 5, Tòa nhà Innovation, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh"
                    />
                  </div>

                  <div className="row g-2">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold mb-1">Website</label>
                      <input
                        type="url"
                        className="form-control form-control-sm"
                        value={profile.website}
                        onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                        placeholder="https://officeops.vn"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold mb-1">Đường dẫn Logo công ty (Tùy chọn)</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={profile.logoUrl || ""}
                        onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })}
                        placeholder="/icons/logo.png hoặc URL ảnh"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Cấu hình Tài khoản Ngân hàng & VietQR */}
              <div className="card shadow-sm border mb-3">
                <div className="card-header bg-light py-2 px-3 fw-bold small text-dark d-flex align-items-center gap-2">
                  <i className="fas fa-university text-success"></i>
                  <span>2. Tài khoản Ngân hàng & Mã thanh toán VietQR</span>
                </div>
                <div className="card-body p-3">
                  <div className="mb-2">
                    <label className="form-label small fw-bold mb-1">
                      Ngân hàng thụ hưởng <span className="text-danger">*</span>
                    </label>
                    <select
                      className="form-select form-select-sm fw-semibold"
                      value={profile.bankBin}
                      onChange={handleBankSelect}
                    >
                      {banks.map((b) => (
                        <option key={b.bin} value={b.bin}>
                          {b.shortName} - {b.name} (Mã BIN: {b.bin})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row g-2 mb-2">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold mb-1">
                        Số tài khoản ngân hàng (STK) <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm font-monospace fw-bold fs-6 text-primary"
                        required
                        value={profile.bankAccount}
                        onChange={(e) => setProfile({ ...profile, bankAccount: e.target.value })}
                        placeholder="VD: 1903 6688 9999"
                      />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label small fw-bold mb-1">
                        Tên chủ tài khoản (In hoa không dấu) <span className="text-danger">*</span>
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm text-uppercase fw-bold"
                        required
                        value={profile.accountHolder}
                        onChange={(e) =>
                          setProfile({ ...profile, accountHolder: e.target.value.toUpperCase() })
                        }
                        placeholder="VD: CTY TNHH GIAI PHAP VAN PHONG OFFICEOPS"
                      />
                    </div>
                  </div>

                  <div className="row g-2">
                    <div className="col-md-6">
                      <label className="form-label small fw-bold mb-1">Kiểu hiển thị mã VietQR</label>
                      <select
                        className="form-select form-select-sm"
                        value={profile.qrTemplate}
                        onChange={(e) =>
                          setProfile({
                            ...profile,
                            qrTemplate: e.target.value as CompanyProfile["qrTemplate"],
                          })
                        }
                      >
                        <option value="compact2">Compact 2 (Chuẩn có logo & tên ngân hàng)</option>
                        <option value="compact">Compact (Gọn nhẹ)</option>
                        <option value="qr_only">QR Only (Chỉ có mã QR không khung)</option>
                        <option value="print">Print (Khung in hóa đơn chuyên nghiệp)</option>
                      </select>
                    </div>
                    <div className="col-md-6 d-flex align-items-end">
                      <div className="small text-muted py-1" style={{ fontSize: "11px" }}>
                        <i className="fas fa-check-circle text-success me-1"></i>
                        Mã VietQR được sinh tự động theo định dạng chuẩn quốc gia Napas.
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-end">
                <button
                  type="submit"
                  className="btn btn-primary px-4 fw-bold shadow-sm d-inline-flex align-items-center gap-1.5"
                  disabled={saving}
                >
                  <i className={`fas ${saving ? "fa-spinner fa-spin" : "fa-save"}`}></i>
                  <span>{saving ? "Đang lưu cấu hình..." : "Lưu thay đổi"}</span>
                </button>
              </div>
            </div>

            {/* Cột phải: Xem trước trực quan (Live Preview) */}
            <div className="col-lg-5">
              <div className="card shadow-sm border sticky-top" style={{ top: "80px" }}>
                <div className="card-header bg-dark text-white py-2 px-3 fw-bold small d-flex justify-content-between align-items-center">
                  <span>
                    <i className="fas fa-eye text-warning me-1.5"></i>
                    Xem trước hiển thị trên Bảng Kê In (A4)
                  </span>
                  <span className="badge bg-success">Thời gian thực</span>
                </div>
                <div className="card-body p-3 bg-light">
                  {/* Mô phỏng Header Tờ In */}
                  <div className="bg-white p-3 rounded border shadow-2xs mb-3">
                    <div className="d-flex align-items-center gap-2 mb-1 border-bottom pb-2">
                      <div className="bg-primary text-white rounded p-1 px-2 fw-bold" style={{ fontSize: "12px", letterSpacing: "1px" }}>
                        {profile.shortName || "LOGO"}
                      </div>
                      <div className="fw-bold text-dark text-uppercase small text-truncate" style={{ maxWidth: "260px" }}>
                        {profile.companyName || "TÊN CÔNG TY CHƯA CẬP NHẬT"}
                      </div>
                    </div>
                    <div className="text-muted" style={{ fontSize: "11px", lineHeight: "1.5" }}>
                      <div>MST: <strong>{profile.taxCode || "---"}</strong> | Hotline: <strong>{profile.hotline || "---"}</strong></div>
                      <div className="text-truncate">Địa chỉ: {profile.address || "---"}</div>
                      <div className="text-primary fw-semibold mt-1">
                        {profile.bankName} - STK: {profile.bankAccount}
                      </div>
                    </div>
                  </div>

                  {/* Mô phỏng Khối Quét Mã VietQR */}
                  <div className="bg-white p-3 rounded border shadow-2xs">
                    <h6 className="fw-bold text-dark text-uppercase small mb-2 d-flex align-items-center gap-1.5 border-bottom pb-1.5">
                      <i className="fas fa-qrcode text-primary"></i>
                      <span>Kiểm tra quét mã VietQR thực tế</span>
                    </h6>

                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label text-muted mb-0" style={{ fontSize: "11px" }}>
                          Số tiền thử nghiệm:
                        </label>
                        <div className="input-group input-group-sm">
                          <input
                            type="number"
                            className="form-control font-monospace fw-bold"
                            value={testAmount}
                            onChange={(e) => setTestAmount(Number(e.target.value) || 0)}
                          />
                          <span className="input-group-text">₫</span>
                        </div>
                      </div>
                      <div className="col-6">
                        <label className="form-label text-muted mb-0" style={{ fontSize: "11px" }}>
                          Nội dung chuyển khoản:
                        </label>
                        <input
                          type="text"
                          className="form-control form-control-sm font-monospace"
                          value={testContent}
                          onChange={(e) => setTestContent(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="text-center p-2 bg-light rounded border">
                      <img
                        src={liveVietQrUrl}
                        alt="Xem trước mã VietQR"
                        className="img-fluid rounded border shadow-2xs bg-white p-1"
                        style={{ maxHeight: "200px" }}
                      />
                      <div className="small text-muted mt-2 fw-semibold" style={{ fontSize: "11px" }}>
                        <i className="fas fa-mobile-alt me-1 text-primary"></i>
                        Dùng App Ngân hàng bất kỳ (VCB, TCB, MB, BIDV...) quét thử để kiểm tra đúng tài khoản nhận tiền!
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Modal Kiểm tra kết nối Email SMTP */}
      <MailTestModal isOpen={showMailModal} onClose={() => setShowMailModal(false)} />
    </div>
  );
}
