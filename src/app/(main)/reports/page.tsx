"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { Loading } from "@/components/Loading";
import { STATUS_LABELS } from "@/lib/labels";

interface SummaryReport {
  finance: {
    paidRevenue: number;
    receivableRevenue: number;
    draftRevenue: number;
    monthlyContractRecurring: number;
    totalInvoices: number;
  };
  inventory: {
    inventoryValuation: number;
    lowStockCount: number;
    totalParts: number;
    totalBatches: number;
  };
  equipment: {
    total: number;
    byStatus: Record<string, number>;
    attentionEquipment: {
      id: string;
      serialNumber: string;
      model: string;
      status: string;
      healthScore: number;
      currentCounter: number;
      customerName: string;
      ticketCount: number;
      partReplacedCount: number;
    }[];
  };
  tickets: {
    total: number;
    completed: number;
    open: number;
    slaRate: number;
    techPerformance: {
      id: string;
      name: string;
      region: string;
      total: number;
      completed: number;
      inProgress: number;
    }[];
  };
}

export default function ReportsPage() {
  const [report, setReport] = useState<SummaryReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/reports/summary");
      if (!res.ok) throw new Error("Không tải được dữ liệu báo cáo");
      setReport(await res.json());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải báo cáo");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  if (loading || !report) {
    return <Loading text="Đang tổng hợp số liệu tài chính, kho FIFO & hiệu suất kỹ thuật..." />;
  }

  return (
    <div className="container-fluid px-0">
      {/* Header Bar chuẩn HoaGiang */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-white p-3 rounded shadow-sm border-bottom">
        <div className="d-flex align-items-center gap-2">
          <h5 className="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
            <i className="fas fa-chart-pie text-primary"></i>
            <span>Thống kê Tổng hợp & Phân tích Hiệu quả Vận hành</span>
          </h5>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={fetchSummary}
          >
            <i className="fas fa-sync-alt me-1"></i> Làm mới số liệu
          </button>
          <button
            type="button"
            className="btn btn-sm btn-dark"
            onClick={() => window.print()}
          >
            <i className="fas fa-print me-1"></i> In Báo cáo
          </button>
        </div>
      </div>

      {/* Hàng 1: Stat Tiles chuẩn HoaGiang */}
      <div className="row g-2 mb-3">
        <div className="col-xl-2 col-lg-4 col-md-6">
          <div className="stat-tile-compact h-100">
            <div className="stat-tile-accent accent-primary"></div>
            <div className="stat-tile-content">
              <div className="stat-tile-title">Cước HĐ cố định/tháng</div>
              <div className="stat-tile-value" style={{ fontSize: "1.1rem" }}>
                {report.finance.monthlyContractRecurring.toLocaleString("vi-VN")} đ
              </div>
              <div className="stat-tile-footer text-primary">Doanh thu nền định kỳ</div>
            </div>
          </div>
        </div>

        <div className="col-xl-2 col-lg-4 col-md-6">
          <div className="stat-tile-compact h-100">
            <div className="stat-tile-accent accent-success"></div>
            <div className="stat-tile-content">
              <div className="stat-tile-title">Hóa đơn đã thu</div>
              <div className="stat-tile-value" style={{ fontSize: "1.1rem" }}>
                {report.finance.paidRevenue.toLocaleString("vi-VN")} đ
              </div>
              <div className="stat-tile-footer text-success">Đã thanh toán (PAID)</div>
            </div>
          </div>
        </div>

        <div className="col-xl-2 col-lg-4 col-md-6">
          <div className="stat-tile-compact h-100">
            <div className="stat-tile-accent accent-danger"></div>
            <div className="stat-tile-content">
              <div className="stat-tile-title">Công nợ phải thu</div>
              <div className="stat-tile-value" style={{ fontSize: "1.1rem" }}>
                {report.finance.receivableRevenue.toLocaleString("vi-VN")} đ
              </div>
              <div className="stat-tile-footer text-danger">Đã gửi khách / Quá hạn</div>
            </div>
          </div>
        </div>

        <div className="col-xl-2 col-lg-4 col-md-6">
          <div className="stat-tile-compact h-100">
            <div className="stat-tile-accent accent-warning"></div>
            <div className="stat-tile-content">
              <div className="stat-tile-title">Giá trị Kho FIFO</div>
              <div className="stat-tile-value" style={{ fontSize: "1.1rem" }}>
                {report.inventory.inventoryValuation.toLocaleString("vi-VN")} đ
              </div>
              <div className="stat-tile-footer text-warning">
                {report.inventory.lowStockCount} mã chạm đáy tồn
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-2 col-lg-4 col-md-6">
          <div className="stat-tile-compact h-100">
            <div className="stat-tile-accent accent-info"></div>
            <div className="stat-tile-content">
              <div className="stat-tile-title">Đạt chuẩn SLA KTV</div>
              <div className="stat-tile-value">{report.tickets.slaRate}%</div>
              <div className="stat-tile-footer text-info">
                Hoàn thành {report.tickets.completed}/{report.tickets.total} phiếu
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-2 col-lg-4 col-md-6">
          <div className="stat-tile-compact h-100">
            <div className="stat-tile-accent accent-primary"></div>
            <div className="stat-tile-content">
              <div className="stat-tile-title">Tổng Thiết bị</div>
              <div className="stat-tile-value">{report.equipment.total}</div>
              <div className="stat-tile-footer text-primary">
                Đang chạy: {report.equipment.byStatus["ACTIVE"] || 0} máy
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hàng 2: Bảng phân tích sâu */}
      <div className="row g-3">
        {/* Cột trái: Thiết bị cần chú ý & Cơ cấu trạng thái */}
        <div className="col-lg-7">
          <div className="card shadow-sm border h-100">
            <div className="card-header bg-dark text-white py-2 d-flex justify-content-between align-items-center">
              <span className="fw-bold small">
                <i className="fas fa-heartbeat text-danger me-2"></i>
                Giám sát Sức khỏe Thiết bị & Tần suất Sự cố
              </span>
              <div className="d-flex gap-1">
                {Object.entries(report.equipment.byStatus).map(([st, count]) => (
                  <span key={st} className="badge bg-secondary border">
                    {STATUS_LABELS[st] || st}: {count}
                  </span>
                ))}
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-hover table-bordered mb-0 custom-dense-table align-middle">
                <thead className="bg-light">
                  <tr>
                    <th>Thiết bị (Model / SN)</th>
                    <th>Khách hàng đang thuê</th>
                    <th className="text-end">Counter</th>
                    <th className="text-center">Điểm Sức khỏe</th>
                    <th className="text-center">Số lần lỗi / Thay thế</th>
                  </tr>
                </thead>
                <tbody>
                  {report.equipment.attentionEquipment.map((eq) => (
                    <tr
                      key={eq.id}
                      className={
                        eq.healthScore < 70 || eq.status === "FAULTY"
                          ? "bg-danger-subtle"
                          : eq.healthScore < 85
                          ? "bg-warning-subtle"
                          : ""
                      }
                    >
                      <td>
                        <Link
                          href={`/equipment/${eq.id}`}
                          className="fw-bold text-primary text-decoration-none"
                        >
                          {eq.model}
                        </Link>
                        <div className="small text-muted font-monospace">
                          SN: {eq.serialNumber}
                        </div>
                      </td>
                      <td>{eq.customerName}</td>
                      <td className="text-end font-monospace">
                        {eq.currentCounter.toLocaleString("vi-VN")}
                      </td>
                      <td className="text-center">
                        <span
                          className={`badge ${
                            eq.healthScore >= 85
                              ? "bg-success"
                              : eq.healthScore >= 70
                              ? "bg-warning text-dark"
                              : "bg-danger"
                          }`}
                        >
                          {eq.healthScore}/100
                        </span>
                      </td>
                      <td className="text-center small">
                        <span className="fw-bold text-danger">{eq.ticketCount}</span> sự cố |{" "}
                        <span className="fw-bold text-primary">{eq.partReplacedCount}</span>{" "}
                        lần thay vật tư
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Cột phải: Bảng xếp hạng hiệu suất Kỹ thuật viên */}
        <div className="col-lg-5">
          <div className="card shadow-sm border h-100">
            <div className="card-header bg-dark text-white py-2 d-flex justify-content-between align-items-center">
              <span className="fw-bold small">
                <i className="fas fa-user-check text-info me-2"></i>
                Năng suất Đội ngũ Kỹ thuật viên Hiện trường
              </span>
              <Link href="/dispatch" className="btn btn-xs btn-outline-light py-0 px-2 small">
                Điều phối
              </Link>
            </div>
            <div className="table-responsive">
              <table className="table table-hover table-bordered mb-0 custom-dense-table align-middle">
                <thead className="bg-light">
                  <tr>
                    <th>Kỹ thuật viên</th>
                    <th>Tuyến phụ trách</th>
                    <th className="text-center">Đang mở</th>
                    <th className="text-center">Đã hoàn thành</th>
                    <th className="text-center">Tổng giao</th>
                  </tr>
                </thead>
                <tbody>
                  {report.tickets.techPerformance.map((tp) => (
                    <tr key={tp.id}>
                      <td className="fw-bold text-dark">{tp.name}</td>
                      <td className="small text-muted">{tp.region}</td>
                      <td className="text-center">
                        <span
                          className={`badge ${
                            tp.inProgress > 0 ? "bg-warning text-dark" : "bg-light text-muted border"
                          }`}
                        >
                          {tp.inProgress}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="badge bg-success">{tp.completed}</span>
                      </td>
                      <td className="text-center fw-bold">{tp.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
