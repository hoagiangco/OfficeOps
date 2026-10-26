"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { TICKET_TYPE_LABELS, TICKET_STATUS_LABELS } from "@/lib/labels";
import { formatLocationPath } from "@/lib/location";
import { exportElementToPdf } from "@/lib/pdfExport";
import { CompanyProfile, DEFAULT_COMPANY_PROFILE } from "@/lib/companyProfile";
import { isValidSignatureDataUrl } from "@/components/SignatureCanvas";

interface TicketPrintData {
  id: string;
  code: string;
  type: string;
  status: string;
  priority: string;
  source: string;
  description: string;
  diagnosis: string | null;
  checkInAt: string | null;
  counterAtClose: number | null;
  customerSignature: string | null;
  createdAt: string;
  resolvedAt: string | null;
  customer: {
    id: string;
    code: string | null;
    name: string;
    phone: string;
    address: string;
    contactName: string | null;
    contactPhone: string | null;
  };
  equipment: {
    id: string;
    code: string | null;
    serialNumber: string;
    model: string;
    brand: string | null;
    currentCounter: number;
    locationNote: string | null;
    branch?: { name: string } | null;
    building?: {
      name: string;
      branch?: { name: string };
    } | null;
    department?: {
      name: string;
      building?: {
        name: string;
        branch?: { name: string };
      };
    } | null;
  };
  assignee?: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  partsUsed: {
    id: string;
    quantity: number;
    oldPartReturned: boolean;
    replacedAt: string;
    part: {
      partCode: string;
      name: string;
      unit: string;
    };
  }[];
  attachments?: {
    id: string;
    url: string;
    kind: string;
  }[];
}

const fmtDate = (d: string | null | undefined) => {
  if (!d) return "---";
  const dt = new Date(d);
  return dt.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

function TicketPrintContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [ticket, setTicket] = useState<TicketPrintData | null>(null);
  const [company, setCompany] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [res, compRes] = await Promise.all([
          fetch(`/api/tickets/${id}`),
          fetch("/api/settings/company"),
        ]);
        if (!res.ok) throw new Error("Không thể tải thông tin phiếu kỹ thuật");
        const data = await res.json();
        setTicket(data);

        if (compRes.ok) {
          const compData = await compRes.json();
          if (compData.profile) setCompany(compData.profile);
        }
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Lỗi tải dữ liệu");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-vh-100 d-flex justify-content-center align-items-center bg-white p-4">
        <div className="spinner-border text-primary me-2" role="status"></div>
        <span>Đang nạp mẫu in Biên bản nghiệm thu kỹ thuật...</span>
      </div>
    );
  }

  if (errorMsg || !ticket) {
    return (
      <div className="container py-5 text-center">
        <div className="alert alert-danger mb-3">{errorMsg || "Không tìm thấy phiếu"}</div>
        <button className="btn btn-secondary" onClick={() => window.close()}>
          Đóng cửa sổ
        </button>
      </div>
    );
  }

  // Vị trí lắp đặt
  const locPath = formatLocationPath(ticket.equipment);
  const locationDetail =
    [locPath, ticket.equipment.locationNote].filter(Boolean).join(" - ") || "---";

  return (
    <div className="bg-light min-vh-100 py-3 print-bg-white">
      {/* Thanh công cụ khi xem trên màn hình (Sẽ ẩn khi in) */}
      <div className="container no-print mb-3">
        <div className="card shadow-sm border-0 p-3 bg-white d-flex flex-row justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className="btn btn-primary fw-bold d-flex align-items-center gap-2 shadow-sm"
              onClick={() => window.print()}
            >
              <i className="fas fa-print"></i>
              <span>In Biên Bản (Ctrl + P)</span>
            </button>
            <button
              type="button"
              className="btn btn-success fw-bold d-flex align-items-center gap-2 shadow-sm text-white"
              disabled={downloadingPdf}
              onClick={async () => {
                setDownloadingPdf(true);
                try {
                  await exportElementToPdf("ticket-print-content", `Bien_ban_${ticket.code}.pdf`);
                  toast.success("Tải file PDF thành công!");
                } catch {
                  toast.error("Không thể tạo file PDF");
                } finally {
                  setDownloadingPdf(false);
                }
              }}
            >
              <i className={`fas ${downloadingPdf ? "fa-spinner fa-spin" : "fa-file-pdf"}`}></i>
              <span>{downloadingPdf ? "Đang tạo PDF..." : "Tải file PDF"}</span>
            </button>
            <span className="text-muted small ms-2 d-none d-md-inline">
              Khổ giấy: <strong>A4</strong>, Tỷ lệ: <strong>Mặc định (100%)</strong>
            </span>
          </div>
          <div className="d-flex gap-2">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              onClick={() => window.close()}
            >
              <i className="fas fa-times me-1"></i> Đóng
            </button>
          </div>
        </div>
      </div>

      {/* TỜ IN KHỔ A4 CHUẨN */}
      <div id="ticket-print-content" className="a4-document-container mx-auto bg-white p-5 shadow rounded border">
        {/* Header Công ty & Tiêu đề */}
        <div className="row border-bottom pb-3 mb-4 align-items-start">
          <div className="col-7">
            <div className="d-flex align-items-center gap-2 mb-1">
              <div className="bg-dark text-white rounded p-1 px-2 fw-bold" style={{ fontSize: "14px", letterSpacing: "1px" }}>
                {company.shortName || "OFFICEOPS"}
              </div>
              <div className="fw-bold text-dark text-uppercase" style={{ fontSize: "13px" }}>
                {company.companyName}
              </div>
            </div>
            <div className="small text-muted" style={{ fontSize: "11px" }}>
              <div>Địa chỉ: {company.address}</div>
              <div>Hotline Kỹ thuật: {company.hotline} | Email: {company.email}</div>
            </div>
          </div>
          <div className="col-5 text-end">
            <div className="fw-bold font-monospace text-primary fs-5 mb-0">{ticket.code}</div>
            <div className="small text-muted" style={{ fontSize: "11px" }}>
              Loại phiếu: <strong>{TICKET_TYPE_LABELS[ticket.type] || ticket.type}</strong>
            </div>
            <div className="small text-muted" style={{ fontSize: "11px" }}>
              Ngày tạo: {fmtDate(ticket.createdAt)}
            </div>
          </div>
        </div>

        {/* Tiêu đề chính */}
        <div className="text-center my-4">
          <h4 className="fw-bold text-uppercase mb-1" style={{ letterSpacing: "1px" }}>
            BIÊN BẢN NGHIỆM THU KỸ THUẬT & BÀN GIAO
          </h4>
          <div className="text-muted small fst-italic">
            (Kèm theo Phiếu kỹ thuật số: {ticket.code})
          </div>
        </div>

        {/* Khối I: Thông tin Khách hàng & Thiết bị */}
        <div className="section-block mb-4">
          <div className="section-title fw-bold text-uppercase border-bottom pb-1 mb-2 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
            <span className="badge bg-dark rounded-pill">I</span>
            <span>THÔNG TIN KHÁCH HÀNG & THIẾT BỊ VĂN PHÒNG</span>
          </div>
          <div className="row g-2 small">
            <div className="col-6">
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr>
                    <td className="text-muted text-nowrap" style={{ width: "120px" }}>Đơn vị sử dụng:</td>
                    <td className="fw-bold">{ticket.customer.name}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Địa chỉ:</td>
                    <td>{ticket.customer.address}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Người liên hệ:</td>
                    <td>{ticket.customer.contactName || "Phòng Hành chính / IT"} {ticket.customer.contactPhone ? `(${ticket.customer.contactPhone})` : ""}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Vị trí đặt máy:</td>
                    <td>{locationDetail || "Tại văn phòng"}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="col-6">
              <table className="table table-sm table-borderless mb-0">
                <tbody>
                  <tr>
                    <td className="text-muted text-nowrap" style={{ width: "130px" }}>Dòng máy (Model):</td>
                    <td className="fw-bold text-dark">{ticket.equipment.brand ? `${ticket.equipment.brand} ` : ""}{ticket.equipment.model}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Số Serial (SN):</td>
                    <td className="font-monospace fw-bold">{ticket.equipment.serialNumber}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Mã quản lý máy:</td>
                    <td>{ticket.equipment.code || "---"}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Chỉ số Counter chốt:</td>
                    <td className="fw-bold text-primary">
                      {ticket.counterAtClose ? ticket.counterAtClose.toLocaleString("vi-VN") : ticket.equipment.currentCounter.toLocaleString("vi-VN")} bản in
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Khối II: Nội dung công việc thực hiện */}
        <div className="section-block mb-4">
          <div className="section-title fw-bold text-uppercase border-bottom pb-1 mb-2 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
            <span className="badge bg-dark rounded-pill">II</span>
            <span>NỘI DUNG YÊU CẦU & KẾT QUẢ XỬ LÝ KỸ THUẬT</span>
          </div>
          <div className="border rounded p-3 bg-light small mb-2">
            <div className="mb-2">
              <span className="text-muted fw-semibold">1. Hiện tượng / Yêu cầu ban đầu:</span>
              <div className="ms-3 mt-1 fw-medium text-dark">{ticket.description}</div>
            </div>
            <div>
              <span className="text-muted fw-semibold">2. Kết quả khảo sát & Biện pháp khắc phục của Kỹ thuật viên:</span>
              <div className="ms-3 mt-1 text-dark">
                {ticket.diagnosis ? (
                  <span className="fw-medium">{ticket.diagnosis}</span>
                ) : (
                  <span className="fst-italic text-muted">Đã tiến hành vệ sinh dàn gương, bảo dưỡng khay nạp giấy, kiểm tra hộp mực và chạy thử bản in mẫu đạt tiêu chuẩn chất lượng.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Khối III: Linh kiện & Vật tư đã thay thế */}
        <div className="section-block mb-4">
          <div className="section-title fw-bold text-uppercase border-bottom pb-1 mb-2 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
            <span className="badge bg-dark rounded-pill">III</span>
            <span>DANH MỤC LINH KIỆN & VẬT TƯ THAY THẾ</span>
          </div>
          {ticket.partsUsed.length > 0 ? (
            <table className="table table-sm table-bordered small mb-0">
              <thead className="table-secondary">
                <tr className="text-center">
                  <th style={{ width: "40px" }}>STT</th>
                  <th>Tên Linh Kiện / Vật Tư</th>
                  <th style={{ width: "130px" }}>Mã Vật Tư</th>
                  <th style={{ width: "70px" }}>ĐVT</th>
                  <th style={{ width: "80px" }}>Số Lượng</th>
                  <th style={{ width: "140px" }}>Thu hồi linh kiện cũ</th>
                </tr>
              </thead>
              <tbody>
                {ticket.partsUsed.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="text-center">{idx + 1}</td>
                    <td className="fw-bold">{p.part.name}</td>
                    <td className="font-monospace text-center">{p.part.partCode}</td>
                    <td className="text-center">{p.part.unit}</td>
                    <td className="text-center fw-bold">{p.quantity}</td>
                    <td className="text-center">
                      {p.oldPartReturned ? (
                        <span className="text-success fw-bold">✓ Đã thu hồi</span>
                      ) : (
                        <span className="text-muted">Không thu hồi</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="border rounded p-2 text-center text-muted small fst-italic bg-light">
              Không phát sinh thay thế linh kiện trong ca dịch vụ này (Đã bảo trì, vệ sinh và hiệu chỉnh).
            </div>
          )}
        </div>

        {/* Khối IV: Kết luận Nghiệm thu */}
        <div className="section-block mb-4 small">
          <div className="section-title fw-bold text-uppercase border-bottom pb-1 mb-2 d-flex align-items-center gap-2" style={{ fontSize: "13px" }}>
            <span className="badge bg-dark rounded-pill">IV</span>
            <span>KẾT QUẢ NGHIỆM THU TẠI CHỖ</span>
          </div>
          <div className="d-flex flex-column gap-1 ms-2">
            <div>☑ Máy đã được khắc phục hoàn toàn sự cố, vận hành êm ái, kéo giấy trơn tru.</div>
            <div>☑ Chất lượng bản in/photo rõ nét, không bị đen, sọc mờ hoặc lem mực.</div>
            <div>☑ Khách hàng đã kiểm tra thực tế và đồng ý nghiệm thu đưa máy vào hoạt động bình thường.</div>
          </div>
        </div>

        {/* Khối V: Chữ ký xác nhận */}
        <div className="section-block mt-5 pt-3">
          <div className="row text-center">
            {/* Đại diện Kỹ thuật viên */}
            <div className="col-6">
              <div className="fw-bold text-uppercase mb-1" style={{ fontSize: "13px" }}>
                KỸ THUẬT VIÊN PHỤ TRÁCH
              </div>
              <div className="text-muted small fst-italic mb-5">(Ký và ghi rõ họ tên)</div>
              <div className="mt-4 pt-4">
                <div className="fw-bold text-dark fs-6">
                  {ticket.assignee?.name || "Kỹ thuật viên OfficeOps"}
                </div>
                {ticket.assignee?.phone && (
                  <div className="text-muted small">SĐT: {ticket.assignee.phone}</div>
                )}
              </div>
            </div>

            {/* Đại diện Khách hàng */}
            <div className="col-6">
              <div className="fw-bold text-uppercase mb-1" style={{ fontSize: "13px" }}>
                ĐẠI DIỆN KHÁCH HÀNG NGHIỆM THU
              </div>
              <div className="text-muted small fst-italic mb-2">(Ký và xác nhận chất lượng dịch vụ)</div>

              {/* Nếu có chữ ký số điện tử của khách hàng */}
              {ticket.customerSignature && isValidSignatureDataUrl(ticket.customerSignature) ? (
                <div className="my-2 d-flex flex-column align-items-center">
                  <div className="border rounded bg-white p-1 shadow-sm d-inline-block">
                    <img
                      src={ticket.customerSignature}
                      alt="Chữ ký khách hàng"
                      style={{ maxHeight: 75, maxWidth: 200, objectFit: "contain" }}
                    />
                  </div>
                  <div className="badge bg-success-subtle text-success small mt-1">
                    ✓ Đã ký xác nhận điện tử
                  </div>
                </div>
              ) : (
                <div className="mt-5 pt-4">
                  <div className="text-muted small fst-italic">...................................................</div>
                </div>
              )}

              <div className="mt-3">
                <div className="fw-bold text-dark">
                  {ticket.customer.contactName || ticket.customer.name}
                </div>
                <div className="text-muted small">
                  Thời gian: {fmtDate(ticket.resolvedAt || ticket.createdAt)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer ghi chú nhỏ */}
        <div className="text-center text-muted small mt-5 pt-4 border-top" style={{ fontSize: "10px" }}>
          Biên bản này được lập thành 02 bản có giá trị pháp lý như nhau, mỗi bên giữ 01 bản để làm căn cứ theo dõi và quyết toán hợp đồng.
        </div>
      </div>

      {/* CSS dành riêng cho In ấn Khổ A4 */}
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
            font-size: 12pt;
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

          /* Tránh ngắt trang giữa chừng các khối */
          .section-block {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

export default function TicketPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-vh-100 d-flex justify-content-center align-items-center bg-white p-4">
          <div className="spinner-border text-primary me-2" role="status"></div>
          <span>Đang nạp mẫu in Biên bản nghiệm thu kỹ thuật...</span>
        </div>
      }
    >
      <TicketPrintContent params={params} />
    </React.Suspense>
  );
}
