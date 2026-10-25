"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { INVOICE_STATUS_LABELS } from "@/lib/labels";

interface InvoicePrintData {
  id: string;
  code: string;
  periodStart: string;
  periodEnd: string;
  subtotal: string | number;
  tax: string | number;
  total: string | number;
  status: string;
  dueDate: string | null;
  createdAt: string;
  paidAt: string | null;
  customer: {
    id: string;
    code: string | null;
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
  items: {
    id: string;
    equipmentId: string | null;
    description: string;
    usage: number;
    quota: number;
    overage: number;
    amount: string | number;
  }[];
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "---";
  return new Date(d).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const fmtMoney = (v: string | number) => Number(v).toLocaleString("vi-VN") + " ₫";

// Hàm chuyển số thành chữ tiếng Việt đơn giản cho hóa đơn
function numberToVietnameseWords(num: number): string {
  if (num === 0) return "Không đồng";
  const units = ["", "nghìn", "triệu", "tỷ", "nghìn tỷ", "triệu tỷ"];
  const digits = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];

  function readGroup(n: number): string {
    const h = Math.floor(n / 100);
    const t = Math.floor((n % 100) / 10);
    const u = n % 10;
    let res = "";

    if (h > 0 || t > 0 || u > 0) {
      res += digits[h] + " trăm ";
      if (t === 0 && u > 0) res += "lẻ ";
      if (t === 1) res += "mười ";
      if (t > 1) res += digits[t] + " mươi ";
      if (u === 1 && t > 1) res += "mốt ";
      else if (u === 5 && t > 0) res += "lăm ";
      else if (u > 0) res += digits[u] + " ";
    }
    return res.trim();
  }

  let n = Math.abs(num);
  let res = "";
  let unitIdx = 0;

  while (n > 0) {
    const g = n % 1000;
    if (g > 0) {
      const gStr = readGroup(g);
      res = gStr + (units[unitIdx] ? " " + units[unitIdx] : "") + (res ? " " + res : "");
    }
    n = Math.floor(n / 1000);
    unitIdx++;
  }

  const finalStr = res.trim();
  return (finalStr.charAt(0).toUpperCase() + finalStr.slice(1) + " đồng chẵn.").replace(/\s+/g, " ");
}

function InvoicePrintContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [invoice, setInvoice] = useState<InvoicePrintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadInvoice() {
      setLoading(true);
      try {
        const res = await fetch(`/api/invoices/${id}`);
        if (!res.ok) throw new Error("Không thể tải thông tin bảng kê cước");
        const data = await res.json();
        setInvoice(data);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Lỗi tải hóa đơn");
      } finally {
        setLoading(false);
      }
    }
    loadInvoice();
  }, [id]);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center bg-white p-4">
        <div className="spinner-border text-primary me-2" role="status"></div>
        <span>Đang nạp bảng kê quyết toán cước...</span>
      </div>
    );
  }

  if (errorMsg || !invoice) {
    return (
      <div className="container py-5 text-center">
        <div className="alert alert-danger mb-3">{errorMsg || "Không tìm thấy bảng kê cước"}</div>
        <button className="btn btn-secondary" onClick={() => window.close()}>
          Đóng cửa sổ
        </button>
      </div>
    );
  }

  const totalNum = Number(invoice.total);
  const wordsAmount = numberToVietnameseWords(totalNum);

  // Link mã VietQR động
  const bankAccount = "190366889999";
  const bankBin = "970407"; // Techcombank
  const vietQrUrl = `https://img.vietqr.io/image/${bankBin}-${bankAccount}-compact2.png?amount=${totalNum}&addInfo=TT%20${encodeURIComponent(invoice.code)}&accountName=OFFICEOPS`;

  return (
    <div className="bg-light min-vh-100 py-3 print-bg-white">
      {/* Thanh công cụ khi xem trên màn hình (Ẩn khi in) */}
      <div className="container no-print mb-3">
        <div className="card shadow-sm border-0 p-3 bg-white d-flex flex-row justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-primary fw-bold d-flex align-items-center gap-2 shadow-sm"
              onClick={() => window.print()}
            >
              <i className="fas fa-print"></i>
              <span>In Bảng Kê / Xuất PDF (Ctrl + P)</span>
            </button>
            <span className="text-muted small ms-2">
              Khổ in: <strong>A4</strong>, Tỷ lệ: <strong>Mặc định (100%)</strong>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-outline-secondary btn-sm"
            onClick={() => window.close()}
          >
            <i className="fas fa-times me-1"></i> Đóng
          </button>
        </div>
      </div>

      {/* TỜ IN BẢNG KÊ QUYẾT TOÁN CƯỚC KHỔ A4 */}
      <div className="a4-document-container mx-auto bg-white p-5 shadow rounded border">
        {/* Header Đơn vị cho thuê */}
        <div className="row border-bottom pb-3 mb-4 align-items-start">
          <div className="col-8">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div className="bg-primary text-white rounded p-1 px-2 fw-bold" style={{ fontSize: "14px", letterSpacing: "1px" }}>
                OFFICEOPS
              </div>
              <div className="fw-bold text-dark text-uppercase fs-6">
                CÔNG TY TNHH GIẢI PHÁP VĂN PHÒNG OFFICEOPS
              </div>
            </div>
            <div className="small text-muted" style={{ fontSize: "11px" }}>
              <div>MST: 0317899999 | Hotline Kế toán cước: 0908 123 456</div>
              <div>Địa chỉ: Tầng 5, Tòa nhà Innovation, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh</div>
              <div>Tài khoản ngân hàng: Techcombank - STK: 1903 6688 9999</div>
            </div>
          </div>
          <div className="col-4 text-end">
            <div className="fw-bold font-monospace text-primary fs-5 mb-0">{invoice.code}</div>
            <div className="small text-muted" style={{ fontSize: "11px" }}>
              Ngày lập: {fmtDate(invoice.createdAt)}
            </div>
            <div className="small text-danger fw-semibold" style={{ fontSize: "11px" }}>
              Hạn TT: {invoice.dueDate ? fmtDate(invoice.dueDate) : "Trước ngày 10 hàng tháng"}
            </div>
          </div>
        </div>

        {/* Tiêu đề Bảng kê */}
        <div className="text-center my-4">
          <h4 className="fw-bold text-uppercase mb-1" style={{ letterSpacing: "1px" }}>
            BẢNG KÊ QUYẾT TOÁN CƯỚC THUÊ MÁY PHOTOCOPY
          </h4>
          <div className="text-muted small">
            Kỳ thanh toán: từ ngày <strong>{fmtDate(invoice.periodStart)}</strong> đến ngày <strong>{fmtDate(invoice.periodEnd)}</strong>
          </div>
        </div>

        {/* Khối Thông tin Khách hàng */}
        <div className="border rounded p-3 bg-light mb-4 small">
          <div className="row g-2">
            <div className="col-8">
              <div className="d-flex mb-1">
                <span className="text-muted text-nowrap" style={{ width: "130px" }}>Đơn vị thuê:</span>
                <span className="fw-bold text-dark fs-6">{invoice.customer.name}</span>
              </div>
              <div className="d-flex mb-1">
                <span className="text-muted text-nowrap" style={{ width: "130px" }}>Địa chỉ:</span>
                <span>{invoice.customer.address}</span>
              </div>
              <div className="d-flex">
                <span className="text-muted text-nowrap" style={{ width: "130px" }}>Số điện thoại:</span>
                <span>{invoice.customer.phone} {invoice.customer.email ? ` | Email: ${invoice.customer.email}` : ""}</span>
              </div>
            </div>

            <div className="col-4 border-start ps-3">
              <div className="d-flex mb-1">
                <span className="text-muted text-nowrap" style={{ width: "110px" }}>Mã số thuế:</span>
                <span className="fw-bold font-monospace">{invoice.customer.taxCode || "---"}</span>
              </div>
              <div className="d-flex mb-1">
                <span className="text-muted text-nowrap" style={{ width: "110px" }}>Hợp đồng số:</span>
                <span className="fw-bold text-primary">{invoice.contract.code}</span>
              </div>
              <div className="d-flex">
                <span className="text-muted text-nowrap" style={{ width: "110px" }}>Trạng thái:</span>
                <span className="badge bg-secondary-subtle text-dark border">
                  {INVOICE_STATUS_LABELS[invoice.status] || invoice.status}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bảng Kê Chi Tiết Sản Lượng & Tiền Cước */}
        <div className="mb-4">
          <table className="table table-sm table-bordered small mb-0">
            <thead className="table-secondary text-center align-middle">
              <tr>
                <th style={{ width: "35px" }}>STT</th>
                <th>Nội dung thanh toán / Thiết bị</th>
                <th style={{ width: "85px" }}>Sản lượng (bản)</th>
                <th style={{ width: "85px" }}>Định mức (bản)</th>
                <th style={{ width: "80px" }}>Vượt ĐM (bản)</th>
                <th style={{ width: "95px" }}>Đơn giá vượt</th>
                <th style={{ width: "120px" }}>Thành tiền (VNĐ)</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, idx) => {
                const isBaseRental = !item.equipmentId;
                return (
                  <tr key={item.id} className={isBaseRental ? "bg-light" : ""}>
                    <td className="text-center">{idx + 1}</td>
                    <td>
                      <div className="fw-semibold text-dark">{item.description}</div>
                    </td>
                    <td className="text-end font-monospace">
                      {item.usage > 0 ? item.usage.toLocaleString("vi-VN") : "---"}
                    </td>
                    <td className="text-end font-monospace">
                      {item.quota > 0 ? item.quota.toLocaleString("vi-VN") : "---"}
                    </td>
                    <td className="text-end font-monospace text-danger fw-bold">
                      {item.overage > 0 ? item.overage.toLocaleString("vi-VN") : "0"}
                    </td>
                    <td className="text-end font-monospace">
                      {item.overage > 0
                        ? (Number(item.amount) / item.overage).toLocaleString("vi-VN") + " đ"
                        : "---"}
                    </td>
                    <td className="text-end fw-bold font-monospace">
                      {Number(item.amount).toLocaleString("vi-VN")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={6} className="text-end fw-semibold">Cộng tiền dịch vụ trước thuế:</td>
                <td className="text-end fw-bold font-monospace">{Number(invoice.subtotal).toLocaleString("vi-VN")} ₫</td>
              </tr>
              <tr>
                <td colSpan={6} className="text-end text-muted">Thuế giá trị gia tăng (VAT):</td>
                <td className="text-end font-monospace">{Number(invoice.tax).toLocaleString("vi-VN")} ₫</td>
              </tr>
              <tr className="table-light">
                <td colSpan={6} className="text-end fw-bold text-uppercase fs-6">
                  TỔNG CỘNG TIỀN THANH TOÁN:
                </td>
                <td className="text-end fw-bold text-danger fs-6 font-monospace">
                  {Number(invoice.total).toLocaleString("vi-VN")} ₫
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Số tiền viết bằng chữ */}
        <div className="p-2 px-3 rounded bg-light border small mb-4">
          <span className="text-muted">Số tiền viết bằng chữ: </span>
          <strong className="fst-italic text-dark">{wordsAmount}</strong>
        </div>

        {/* Khối Thanh toán Chuyển khoản Ngân hàng & Mã VietQR */}
        <div className="border rounded-3 p-3 bg-light mb-4">
          <div className="row align-items-center">
            <div className="col-8 small">
              <div className="fw-bold text-dark text-uppercase mb-2 d-flex align-items-center gap-2">
                <i className="fas fa-qrcode text-primary"></i>
                <span>THÔNG TIN THANH TOÁN CHUYỂN KHOẢN (VIETQR)</span>
              </div>
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr>
                    <td className="text-muted text-nowrap" style={{ width: "130px" }}>Ngân hàng:</td>
                    <td className="fw-bold">Techcombank (Ngân hàng TMCP Kỹ Thương Việt Nam)</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Số tài khoản:</td>
                    <td className="fw-bold font-monospace text-primary fs-6">1903 6688 9999</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Chủ tài khoản:</td>
                    <td className="fw-bold text-uppercase">CÔNG TY TNHH GIẢI PHÁP VĂN PHÒNG OFFICEOPS</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Nội dung CK:</td>
                    <td className="font-monospace fw-bold text-dark">
                      THANH TOAN {invoice.code} {invoice.customer.code || ""}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div className="text-muted mt-2" style={{ fontSize: "11px" }}>
                * Quý khách mở ứng dụng Ngân hàng trên điện thoại (VCB, MB, TCB, BIDV, VPB...) quét mã QR bên cạnh để chuyển tiền tự động điền đúng số tiền và nội dung.
              </div>
            </div>

            <div className="col-4 text-center">
              <div className="bg-white p-2 border rounded shadow-sm d-inline-block">
                <img
                  src={vietQrUrl}
                  alt="Mã VietQR Thanh Toán"
                  style={{ width: 140, height: 140, objectFit: "contain" }}
                />
                <div className="text-muted fw-bold mt-1" style={{ fontSize: "10px" }}>
                  QUÉT MÃ TRẢ TIỀN NHANH
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chữ ký các bên */}
        <div className="row text-center mt-5 pt-3">
          <div className="col-4">
            <div className="fw-bold text-uppercase mb-1" style={{ fontSize: "12px" }}>
              NGƯỜI LẬP BẢNG KÊ
            </div>
            <div className="text-muted small fst-italic mb-5">(Ký, ghi rõ họ tên)</div>
            <div className="mt-4 pt-4 fw-bold text-dark">Phòng Kế Toán Cước</div>
          </div>

          <div className="col-4">
            <div className="fw-bold text-uppercase mb-1" style={{ fontSize: "12px" }}>
              KẾ TOÁN TRƯỞNG
            </div>
            <div className="text-muted small fst-italic mb-5">(Ký, ghi rõ họ tên)</div>
            <div className="mt-4 pt-4 text-muted small">...................................</div>
          </div>

          <div className="col-4">
            <div className="fw-bold text-uppercase mb-1" style={{ fontSize: "12px" }}>
              GIÁM ĐỐC / ĐẠI DIỆN ĐƠN VỊ
            </div>
            <div className="text-muted small fst-italic mb-5">(Ký, đóng dấu)</div>
            <div className="mt-4 pt-4 fw-bold text-dark">Ban Giám Đốc OfficeOps</div>
          </div>
        </div>
      </div>

      {/* CSS In ấn A4 */}
      <style jsx global>{`
        @media screen {
          .a4-document-container {
            max-width: 820px;
            min-height: 1100px;
          }
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 15mm 12mm 15mm;
          }

          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            font-size: 11pt;
          }

          .no-print {
            display: none !important;
          }

          .print-bg-white {
            background-color: transparent !important;
            padding: 0 !important;
          }

          .a4-document-container {
            max-width: 100% !important;
            width: 100% !important;
            box-shadow: none !important;
            border: none !important;
            padding: 0 !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-vh-100 d-flex justify-content-center align-items-center bg-white p-4">
          <div className="spinner-border text-primary me-2" role="status"></div>
          <span>Đang nạp bảng kê quyết toán cước...</span>
        </div>
      }
    >
      <InvoicePrintContent params={params} />
    </React.Suspense>
  );
}
