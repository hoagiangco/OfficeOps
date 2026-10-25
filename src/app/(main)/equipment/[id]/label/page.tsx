"use client";

import React, { useState, useEffect, use } from "react";
import Link from "next/link";

interface EquipmentLabelData {
  id: string;
  code: string | null;
  serialNumber: string;
  qrCode: string;
  model: string;
  brand: string | null;
  type: string;
  status: string;
  customer?: {
    id: string;
    name: string;
    phone: string;
  } | null;
  department?: {
    name: string;
    building?: {
      name: string;
      branch?: { name: string };
    };
  } | null;
  locationNote: string | null;
}

function EquipmentLabelPrintContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const [equipment, setEquipment] = useState<EquipmentLabelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copies, setCopies] = useState<number>(4); // Số lượng tem in trên 1 trang

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const res = await fetch(`/api/equipment/${id}`);
        if (!res.ok) throw new Error("Không thể tải thông tin thiết bị");
        const data = await res.json();
        setEquipment(data);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : "Lỗi tải thiết bị");
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
        <span>Đang tạo mẫu tem nhãn Decal thiết bị...</span>
      </div>
    );
  }

  if (errorMsg || !equipment) {
    return (
      <div className="container py-5 text-center">
        <div className="alert alert-danger mb-3">{errorMsg || "Không tìm thấy thiết bị"}</div>
        <button className="btn btn-secondary" onClick={() => window.close()}>
          Đóng cửa sổ
        </button>
      </div>
    );
  }

  const qrImageUrl = `/api/equipment/${equipment.id}/qr`;

  return (
    <div className="bg-light min-vh-100 py-3 print-bg-white">
      {/* Thanh điều khiển (Ẩn khi in) */}
      <div className="container no-print mb-4" style={{ maxWidth: 840 }}>
        <div className="card shadow-sm border-0 p-3 bg-white d-flex flex-row justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-3">
            <button
              type="button"
              className="btn btn-primary fw-bold d-flex align-items-center gap-2 shadow-sm"
              onClick={() => window.print()}
            >
              <i className="fas fa-print"></i>
              <span>In Tem Nhãn Decal (Ctrl + P)</span>
            </button>
            <div className="d-flex align-items-center gap-2 small">
              <span className="text-muted">Số lượng tem in:</span>
              <select
                className="form-select form-select-sm"
                style={{ width: "80px" }}
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
              >
                <option value={1}>1 tem</option>
                <option value={2}>2 tem</option>
                <option value={4}>4 tem</option>
                <option value={6}>6 tem</option>
                <option value={8}>8 tem</option>
              </select>
            </div>
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

      {/* KHUNG HIỂN THỊ CÁC TEM IN */}
      <div className="container print-container" style={{ maxWidth: 840 }}>
        <div className="row g-3 justify-content-center">
          {Array.from({ length: copies }).map((_, index) => (
            <div key={index} className="col-md-6 col-12 label-card-col">
              <div className="equipment-decal-label p-3 bg-white border border-2 border-dark rounded-3 shadow-sm d-flex flex-column justify-content-between position-relative">
                {/* Viền góc tem chuyên nghiệp */}
                <div className="corner-accent top-0 start-0 border-top border-start border-3 border-dark"></div>
                <div className="corner-accent top-0 end-0 border-top border-end border-3 border-dark"></div>
                <div className="corner-accent bottom-0 start-0 border-bottom border-start border-3 border-dark"></div>
                <div className="corner-accent bottom-0 end-0 border-bottom border-end border-3 border-dark"></div>

                {/* Header Tem */}
                <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-2">
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-dark text-white px-2 py-1 fw-bold text-uppercase" style={{ fontSize: "11px", letterSpacing: "1px" }}>
                      OFFICEOPS
                    </span>
                    <span className="fw-bold text-dark text-uppercase small" style={{ fontSize: "11px" }}>
                      Dịch Vụ Máy Văn Phòng
                    </span>
                  </div>
                  <div className="text-end">
                    <div className="fw-bold text-danger" style={{ fontSize: "12px" }}>
                      <i className="fas fa-phone-alt me-1"></i> 0908 123 456
                    </div>
                  </div>
                </div>

                {/* Thân Tem: Thông tin máy & Mã QR */}
                <div className="d-flex align-items-center gap-3 my-1">
                  {/* Mã QR */}
                  <div className="text-center">
                    <div className="border p-1 bg-white rounded d-inline-block">
                      <img
                        src={qrImageUrl}
                        alt="QR Code Thiết bị"
                        style={{ width: "105px", height: "105px", objectFit: "contain", display: "block" }}
                      />
                    </div>
                    <div className="text-muted fw-bold mt-1" style={{ fontSize: "9px" }}>
                      QUÉT BÁO HỎNG
                    </div>
                  </div>

                  {/* Thông tin máy */}
                  <div className="flex-grow-1" style={{ fontSize: "12px", lineHeight: "1.4" }}>
                    <div className="fw-bold text-dark fs-6 text-uppercase mb-1">
                      {equipment.brand ? `${equipment.brand} ` : ""}{equipment.model}
                    </div>

                    <div className="d-flex gap-1 mb-1">
                      <span className="text-muted">Serial:</span>
                      <strong className="font-monospace text-dark">{equipment.serialNumber}</strong>
                    </div>

                    {equipment.code && (
                      <div className="d-flex gap-1 mb-1">
                        <span className="text-muted">Mã TB:</span>
                        <span className="font-monospace fw-semibold">{equipment.code}</span>
                      </div>
                    )}

                    <div className="d-flex gap-1 mb-1">
                      <span className="text-muted">Khách hàng:</span>
                      <span className="fw-bold text-truncate" style={{ maxWidth: "150px" }}>
                        {equipment.customer?.name || "Chưa bàn giao"}
                      </span>
                    </div>

                    <div className="text-muted small fst-italic" style={{ fontSize: "10px" }}>
                      Loại máy: {equipment.type}
                    </div>
                  </div>
                </div>

                {/* Footer Tem */}
                <div className="border-top pt-1 mt-2 text-center text-muted" style={{ fontSize: "10px" }}>
                  * Quét mã QR bằng Camera điện thoại để báo hỏng / hết mực nhanh 24/7
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Style in ấn tem nhãn */}
      <style jsx global>{`
        .equipment-decal-label {
          min-height: 195px;
          position: relative;
        }

        .corner-accent {
          position: absolute;
          width: 8px;
          height: 8px;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          body {
            background-color: #ffffff !important;
          }

          .no-print {
            display: none !important;
          }

          .print-bg-white {
            background-color: transparent !important;
            padding: 0 !important;
          }

          .print-container {
            max-width: 100% !important;
            width: 100% !important;
            padding: 0 !important;
          }

          .label-card-col {
            page-break-inside: avoid;
            margin-bottom: 15px;
          }

          .equipment-decal-label {
            box-shadow: none !important;
            border: 2px solid #000000 !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function EquipmentLabelPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <React.Suspense
      fallback={
        <div className="min-vh-100 d-flex justify-content-center align-items-center bg-white p-4">
          <div className="spinner-border text-primary me-2" role="status"></div>
          <span>Đang tạo mẫu tem nhãn Decal thiết bị...</span>
        </div>
      }
    >
      <EquipmentLabelPrintContent params={params} />
    </React.Suspense>
  );
}
