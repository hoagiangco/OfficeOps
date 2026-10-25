"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { toast } from "react-toastify";
import Loading from "@/components/Loading";
import ActiveFilterChips, { FilterChipItem } from "@/components/ActiveFilterChips";
import { ROLE_LABELS, type Role } from "@/lib/rbac";

interface AuditLogItem {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: Role;
  } | null;
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) sp.set("q", search.trim());
      if (entityFilter) sp.set("entity", entityFilter);

      const res = await fetch(`/api/audit-logs?${sp.toString()}`);
      if (!res.ok) throw new Error("Không tải được nhật ký thao tác");
      const data = await res.json();
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải nhật ký");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, entityFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const chips: FilterChipItem[] = [];
  if (search.trim()) {
    chips.push({
      id: "q",
      label: "Tìm kiếm",
      value: search.trim(),
      onClear: () => {
        setSearch("");
        setPage(1);
      },
    });
  }
  if (entityFilter) {
    chips.push({
      id: "entity",
      label: "Đối tượng",
      value: entityFilter,
      onClear: () => {
        setEntityFilter("");
        setPage(1);
      },
    });
  }

  return (
    <div className="container-fluid px-1 py-1">
      {/* Compact Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-2 gap-2 bg-white p-2 px-3 rounded-3 shadow-sm border">
        <div className="d-flex align-items-center gap-2">
          <div
            className="bg-dark text-white p-2 rounded-2 d-flex align-items-center justify-content-center shadow-sm"
            style={{ width: "32px", height: "32px" }}
          >
            <i className="fas fa-history fa-sm"></i>
          </div>
          <h1 className="h6 mb-0 text-dark fw-bold">Nhật ký thao tác</h1>
          <div className="vr mx-2 d-none d-md-block" style={{ height: "20px" }}></div>
          <span className="small text-muted d-none d-md-inline">
            Tổng bản ghi: <strong>{total}</strong>
          </span>
        </div>
        <button className="btn btn-outline-dark btn-sm px-3 fw-bold" onClick={loadData}>
          <i className="fas fa-sync-alt me-1"></i> Làm mới
        </button>
      </div>

      {/* Navigation Tabs giữa các trang Hệ Thống */}
      <div className="d-flex gap-2 mb-2 border-bottom bg-white px-3 pt-2 rounded-top border">
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
          href="/admin/audit-logs"
          className="pb-2 text-decoration-none small fw-bold text-primary border-bottom border-primary border-2 px-2"
        >
          <i className="fas fa-history me-1"></i> Nhật ký hoạt động
        </Link>
      </div>

      {/* Filters */}
      <div className="card shadow-sm border-0 mb-2 rounded-3 overflow-hidden border">
        <div className="card-body p-2 bg-light bg-opacity-50">
          <div className="row g-2">
            <div className="col-md-6">
              <div className="input-group input-group-sm border rounded-2 overflow-hidden bg-white">
                <span className="input-group-text bg-white border-0 pe-1">
                  <i className="fas fa-search text-muted"></i>
                </span>
                <input
                  type="text"
                  className="form-control border-0 shadow-none"
                  placeholder="Tìm người thực hiện, hành động, mã bản ghi..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>
            </div>
            <div className="col-md-4">
              <select
                className="form-select form-select-sm"
                value={entityFilter}
                onChange={(e) => {
                  setEntityFilter(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">-- Mọi phân hệ (Entity) --</option>
                <option value="User">Tài khoản (User)</option>
                <option value="Customer">Khách hàng (Customer)</option>
                <option value="Contract">Hợp đồng (Contract)</option>
                <option value="Equipment">Thiết bị (Equipment)</option>
                <option value="Ticket">Phiếu kỹ thuật</option>
                <option value="StockIssue">Xuất kho (StockIssue)</option>
                <option value="Invoice">Hóa đơn (Invoice)</option>
              </select>
            </div>
            <div className="col-md-2">
              <select
                className="form-select form-select-sm"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value={30}>30 dòng</option>
                <option value={50}>50 dòng</option>
                <option value={100}>100 dòng</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <ActiveFilterChips
        chips={chips}
        onClearAll={() => {
          setSearch("");
          setEntityFilter("");
          setPage(1);
        }}
      />

      {/* Table */}
      <div className="card shadow-sm border-0 rounded-3 overflow-hidden border">
        <div className="card-body p-0">
          <div className="table-responsive table-sticky-container">
            <table className="table table-sm table-hover align-middle mb-0 custom-dense-table table-sticky-header">
              <thead className="bg-dark text-white">
                <tr>
                  <th className="px-3 py-2 text-uppercase small" style={{ width: "160px" }}>
                    Thời gian
                  </th>
                  <th className="py-2 text-uppercase small">Người thực hiện</th>
                  <th className="py-2 text-uppercase small">Hành động</th>
                  <th className="py-2 text-uppercase small">Đối tượng</th>
                  <th className="py-2 text-uppercase small px-3">Chi tiết (Meta)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5}>
                      <Loading />
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-5 text-muted small">
                      Chưa có nhật ký thao tác nào
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td className="px-3 text-muted font-monospace" style={{ fontSize: "0.78rem" }}>
                        {new Date(log.createdAt).toLocaleString("vi-VN")}
                      </td>
                      <td>
                        {log.user ? (
                          <div>
                            <span className="fw-bold text-dark small">{log.user.name}</span>{" "}
                            <span className="badge bg-light text-dark border ms-1" style={{ fontSize: "0.68rem" }}>
                              {ROLE_LABELS[log.user.role]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted small">Hệ thống</span>
                        )}
                      </td>
                      <td>
                        <span className="badge bg-primary bg-opacity-10 text-primary border border-primary-subtle font-monospace">
                          {log.action}
                        </span>
                      </td>
                      <td className="small">
                        <strong>{log.entity}</strong>
                        {log.entityId && (
                          <span className="text-muted font-monospace ms-1" style={{ fontSize: "0.75rem" }}>
                            #{log.entityId.slice(-8)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 text-muted font-monospace" style={{ fontSize: "0.75rem" }}>
                        {log.meta ? JSON.stringify(log.meta) : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
