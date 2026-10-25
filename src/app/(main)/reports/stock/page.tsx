"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import { Loading } from "@/components/Loading";
import { exportToXlsx } from "@/lib/excelExport";
import {
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  FileSpreadsheet,
  Printer,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
} from "lucide-react";

interface StockReportItem {
  partId: string;
  partCode: string;
  name: string;
  category: string;
  unit: string;
  minThreshold: number;
  openingStock: number;
  inPeriod: number;
  outPeriod: number;
  closingStock: number;
  costPrice: number;
  totalValue: number;
  currentBatchStock: number;
}

interface StockReportResponse {
  period: { from: string; to: string };
  summary: {
    totalItems: number;
    totalInQuantity: number;
    totalOutQuantity: number;
    totalClosingValue: number;
  };
  items: StockReportItem[];
}

export default function StockReportPage() {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];
  const defaultTo = now.toISOString().split("T")[0];

  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [search, setSearch] = useState("");
  const [data, setData] = useState<StockReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        from: fromDate,
        to: toDate,
      });
      if (search.trim()) sp.set("q", search.trim());

      const res = await fetch(`/api/reports/stock?${sp.toString()}`);
      if (!res.ok) throw new Error("Không tải được báo cáo nhập - xuất - tồn");
      const json: StockReportResponse = await res.json();
      setData(json);
    } catch (err: any) {
      toast.error(err.message || "Lỗi tải báo cáo kho");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportExcel = () => {
    if (!data || data.items.length === 0) {
      toast.warn("Không có dữ liệu để xuất Excel");
      return;
    }

    exportToXlsx<StockReportItem>({
      filename: `Bao_cao_Nhap_Xuat_Ton_${fromDate}_den_${toDate}.xlsx`,
      sheetName: "NhapXuatTon",
      title: `BÁO CÁO NHẬP - XUẤT - TỒN KHO LINH KIỆN (Từ ${new Date(
        fromDate
      ).toLocaleDateString("vi-VN")} Đến ${new Date(toDate).toLocaleDateString("vi-VN")})`,
      columns: [
        { header: "Mã linh kiện", key: "partCode", width: 14 },
        { header: "Tên vật tư / Linh kiện", key: "name", width: 32 },
        { header: "ĐVT", key: "unit", width: 8 },
        { header: "Danh mục", key: "category", width: 16 },
        {
          header: "Tồn đầu kỳ",
          key: "openingStock",
          width: 12,
          formatter: (v) => Number(v).toLocaleString("vi-VN"),
        },
        {
          header: "Tổng nhập",
          key: "inPeriod",
          width: 12,
          formatter: (v) => Number(v).toLocaleString("vi-VN"),
        },
        {
          header: "Tổng xuất",
          key: "outPeriod",
          width: 12,
          formatter: (v) => Number(v).toLocaleString("vi-VN"),
        },
        {
          header: "Tồn cuối kỳ",
          key: "closingStock",
          width: 12,
          formatter: (v) => Number(v).toLocaleString("vi-VN"),
        },
        {
          header: "Đơn giá vốn (đ)",
          key: "costPrice",
          width: 16,
          formatter: (v) => Number(v).toLocaleString("vi-VN"),
        },
        {
          header: "Thành tiền tồn (đ)",
          key: "totalValue",
          width: 18,
          formatter: (v) => Number(v).toLocaleString("vi-VN"),
        },
      ],
      data: data.items,
    });

    toast.success("Đã xuất file Excel thành công!");
  };

  return (
    <div className="container-fluid px-0">
      {/* Header bar */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-white p-3 rounded shadow-sm border-bottom">
        <div>
          <h5 className="mb-1 fw-bold text-dark d-flex align-items-center gap-2">
            <Boxes className="text-primary w-5 h-5" />
            <span>Báo Cáo Nhập - Xuất - Tồn Kho</span>
          </h5>
          <p className="text-muted small mb-0">
            Theo dõi chi tiết luồng vật tư, thẻ kho và giá trị vốn tồn kho theo kỳ
          </p>
        </div>

        <div className="d-flex gap-2 align-items-center mt-2 mt-md-0">
          <Link href="/reports" className="btn btn-sm btn-outline-secondary">
            <i className="fas fa-chart-line me-1"></i> Báo cáo tổng hợp
          </Link>
          <button
            type="button"
            className="btn btn-sm btn-success text-white fw-semibold"
            onClick={handleExportExcel}
            disabled={loading || !data || data.items.length === 0}
          >
            <FileSpreadsheet className="w-4 h-4 me-1 d-inline" /> Xuất Excel (.xlsx)
          </button>
          <button
            type="button"
            className="btn btn-sm btn-dark"
            onClick={() => window.print()}
          >
            <Printer className="w-4 h-4 me-1 d-inline" /> In Báo Cáo
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card shadow-sm border-0 mb-3 rounded-3 border">
        <div className="card-body p-3 bg-light bg-opacity-50">
          <div className="row g-2 align-items-end">
            <div className="col-md-3">
              <label className="form-label small text-muted mb-1 d-flex align-items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Từ ngày
              </label>
              <input
                type="date"
                className="form-control form-control-sm bg-white"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small text-muted mb-1 d-flex align-items-center gap-1">
                <Calendar className="w-3.5 h-3.5" /> Đến ngày
              </label>
              <input
                type="date"
                className="form-control form-control-sm bg-white"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="col-md-4">
              <label className="form-label small text-muted mb-1 d-flex align-items-center gap-1">
                <Search className="w-3.5 h-3.5" /> Tìm mã hoặc tên vật tư
              </label>
              <input
                type="text"
                placeholder="Nhập mã linh kiện, tên linh kiện..."
                className="form-control form-control-sm bg-white"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="col-md-2">
              <button
                type="button"
                className="btn btn-primary btn-sm w-100 fw-semibold"
                onClick={fetchData}
              >
                <Filter className="w-3.5 h-3.5 me-1 d-inline" /> Lọc Báo Cáo
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Thẻ KPI Tổng hợp */}
      {data && (
        <div className="row g-2 mb-3">
          <div className="col-sm-6 col-xl-3">
            <div className="bg-white p-3 rounded-3 border shadow-sm h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted small fw-semibold">Tổng mặt hàng</div>
                  <div className="h4 mb-0 fw-bold text-dark mt-1">
                    {data.summary.totalItems.toLocaleString("vi-VN")}
                  </div>
                </div>
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                  <Package className="w-5 h-5" />
                </div>
              </div>
              <div className="text-xs text-muted mt-2">Linh kiện đang hoạt động</div>
            </div>
          </div>

          <div className="col-sm-6 col-xl-3">
            <div className="bg-white p-3 rounded-3 border shadow-sm h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted small fw-semibold">Tổng nhập trong kỳ</div>
                  <div className="h4 mb-0 fw-bold text-success mt-1">
                    +{data.summary.totalInQuantity.toLocaleString("vi-VN")}
                  </div>
                </div>
                <div className="p-2.5 bg-green-50 text-green-600 rounded-xl">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
              </div>
              <div className="text-xs text-success mt-2">Nhập kho & Hoàn trả</div>
            </div>
          </div>

          <div className="col-sm-6 col-xl-3">
            <div className="bg-white p-3 rounded-3 border shadow-sm h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted small fw-semibold">Tổng xuất trong kỳ</div>
                  <div className="h4 mb-0 fw-bold text-danger mt-1">
                    -{data.summary.totalOutQuantity.toLocaleString("vi-VN")}
                  </div>
                </div>
                <div className="p-2.5 bg-red-50 text-red-600 rounded-xl">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
              </div>
              <div className="text-xs text-danger mt-2">Xuất kỹ thuật & Bán lẻ</div>
            </div>
          </div>

          <div className="col-sm-6 col-xl-3">
            <div className="bg-white p-3 rounded-3 border shadow-sm h-100">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="text-muted small fw-semibold">Tổng giá trị tồn kho</div>
                  <div className="h4 mb-0 fw-bold text-primary mt-1">
                    {data.summary.totalClosingValue.toLocaleString("vi-VN")} đ
                  </div>
                </div>
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Boxes className="w-5 h-5" />
                </div>
              </div>
              <div className="text-xs text-primary mt-2">Giá trị vốn kho cuối kỳ</div>
            </div>
          </div>
        </div>
      )}

      {/* Bảng Dữ Liệu Báo Cáo */}
      <div className="card shadow-sm border rounded-3 overflow-hidden">
        <div className="table-responsive">
          {loading ? (
            <div className="p-5 text-center">
              <Loading text="Đang tính toán số liệu thẻ kho..." />
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-5 text-center text-muted">
              Không có dữ liệu phát sinh trong khoảng thời gian đã chọn.
            </div>
          ) : (
            <table className="table table-hover table-striped align-middle mb-0 text-sm">
              <thead className="table-light text-secondary small text-uppercase">
                <tr>
                  <th className="py-2.5 ps-3" style={{ width: "120px" }}>Mã VT</th>
                  <th className="py-2.5">Tên vật tư / Linh kiện</th>
                  <th className="py-2.5 text-center" style={{ width: "70px" }}>ĐVT</th>
                  <th className="py-2.5 text-end" style={{ width: "100px" }}>Tồn đầu</th>
                  <th className="py-2.5 text-end text-success" style={{ width: "100px" }}>Tổng nhập</th>
                  <th className="py-2.5 text-end text-danger" style={{ width: "100px" }}>Tổng xuất</th>
                  <th className="py-2.5 text-end fw-bold" style={{ width: "110px" }}>Tồn cuối</th>
                  <th className="py-2.5 text-end" style={{ width: "130px" }}>Đơn giá vốn</th>
                  <th className="py-2.5 text-end pe-3" style={{ width: "150px" }}>Thành tiền tồn</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const isLowStock = item.closingStock <= item.minThreshold;
                  return (
                    <tr key={item.partId}>
                      <td className="ps-3 font-mono font-bold text-primary">
                        {item.partCode}
                      </td>
                      <td>
                        <div className="fw-semibold text-dark">{item.name}</div>
                        <span className="badge bg-light text-secondary border">
                          {item.category}
                        </span>
                      </td>
                      <td className="text-center text-muted">{item.unit}</td>
                      <td className="text-end text-muted">
                        {item.openingStock.toLocaleString("vi-VN")}
                      </td>
                      <td className="text-end text-success fw-semibold">
                        {item.inPeriod > 0 ? `+${item.inPeriod.toLocaleString("vi-VN")}` : "-"}
                      </td>
                      <td className="text-end text-danger fw-semibold">
                        {item.outPeriod > 0 ? `-${item.outPeriod.toLocaleString("vi-VN")}` : "-"}
                      </td>
                      <td className="text-end">
                        <span
                          className={`fw-bold px-2 py-0.5 rounded ${
                            isLowStock
                              ? "bg-danger-subtle text-danger"
                              : "text-dark"
                          }`}
                        >
                          {item.closingStock.toLocaleString("vi-VN")}
                          {isLowStock && (
                            <AlertTriangle className="w-3 h-3 ms-1 d-inline" />
                          )}
                        </span>
                      </td>
                      <td className="text-end text-muted font-mono">
                        {item.costPrice.toLocaleString("vi-VN")} đ
                      </td>
                      <td className="text-end pe-3 fw-bold text-dark font-mono">
                        {item.totalValue.toLocaleString("vi-VN")} đ
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="table-light fw-bold">
                <tr>
                  <td colSpan={3} className="ps-3 text-uppercase">Tổng cộng ({data.items.length} mặt hàng)</td>
                  <td className="text-end">
                    {data.items.reduce((s, x) => s + x.openingStock, 0).toLocaleString("vi-VN")}
                  </td>
                  <td className="text-end text-success">
                    +{data.summary.totalInQuantity.toLocaleString("vi-VN")}
                  </td>
                  <td className="text-end text-danger">
                    -{data.summary.totalOutQuantity.toLocaleString("vi-VN")}
                  </td>
                  <td className="text-end">
                    {data.items.reduce((s, x) => s + x.closingStock, 0).toLocaleString("vi-VN")}
                  </td>
                  <td className="text-end text-muted">-</td>
                  <td className="text-end pe-3 text-primary font-mono" style={{ fontSize: "1rem" }}>
                    {data.summary.totalClosingValue.toLocaleString("vi-VN")} đ
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
