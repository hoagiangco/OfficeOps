"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MailTestModal } from "@/components/MailTestModal";
import { ZaloTestModal } from "@/components/admin/ZaloTestModal";

export type AdminTabKey = "users" | "permissions" | "company" | "audit";

interface AdminNavTabsProps {
  activeTab: AdminTabKey;
}

export function AdminNavTabs({ activeTab }: AdminNavTabsProps) {
  const [showMailModal, setShowMailModal] = useState(false);
  const [showZaloModal, setShowZaloModal] = useState(false);

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3 border-bottom bg-white px-3 pt-2 rounded-top border flex-wrap gap-2">
        {/* Nhóm Tab Điều hướng Trang Quản trị (Bên trái) */}
        <div className="d-flex gap-1 flex-wrap">
          <Link
            href="/admin"
            className={`pb-2 text-decoration-none small px-2.5 ${
              activeTab === "users"
                ? "fw-bold text-primary border-bottom border-primary border-2"
                : "fw-semibold text-secondary hover-text-primary"
            }`}
          >
            <i className="fas fa-user-shield me-1.5"></i> Tài khoản người dùng
          </Link>
          <Link
            href="/admin/permissions"
            className={`pb-2 text-decoration-none small px-2.5 ${
              activeTab === "permissions"
                ? "fw-bold text-primary border-bottom border-primary border-2"
                : "fw-semibold text-secondary hover-text-primary"
            }`}
          >
            <i className="fas fa-key me-1.5"></i> Phân quyền ma trận
          </Link>
          <Link
            href="/admin/company"
            className={`pb-2 text-decoration-none small px-2.5 ${
              activeTab === "company"
                ? "fw-bold text-primary border-bottom border-primary border-2"
                : "fw-semibold text-secondary hover-text-primary"
            }`}
          >
            <i className="fas fa-building-circle-check me-1.5"></i> Cấu hình Doanh nghiệp & VietQR
          </Link>
          <Link
            href="/admin/audit-logs"
            className={`pb-2 text-decoration-none small px-2.5 ${
              activeTab === "audit"
                ? "fw-bold text-primary border-bottom border-primary border-2"
                : "fw-semibold text-secondary hover-text-primary"
            }`}
          >
            <i className="fas fa-history me-1.5"></i> Nhật ký hoạt động
          </Link>
        </div>

        {/* Nhóm Công cụ Kiểm thử Hệ thống (Bên phải, phân cách rõ ràng) */}
        <div className="d-flex align-items-center gap-1.5 pb-2">
          <button
            type="button"
            onClick={() => setShowMailModal(true)}
            className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1.5 shadow-2xs py-1 px-2.5 fw-semibold"
            style={{ fontSize: "12px" }}
            title="Mở bảng kiểm tra kết nối máy chủ gửi Email SMTP"
          >
            <i className="fas fa-envelope text-primary"></i>
            <span>Test Email (SMTP)</span>
          </button>
          <button
            type="button"
            onClick={() => setShowZaloModal(true)}
            className="btn btn-sm btn-outline-info text-dark d-inline-flex align-items-center gap-1.5 shadow-2xs py-1 px-2.5 fw-semibold"
            style={{ fontSize: "12px" }}
            title="Mở bảng kiểm tra kết nối dịch vụ thông báo Zalo OA & ZNS"
          >
            <i className="fas fa-comment-dots text-info"></i>
            <span>Test Zalo (ZNS)</span>
          </button>
        </div>
      </div>

      {/* Modal Kiểm tra kết nối Email SMTP */}
      <MailTestModal isOpen={showMailModal} onClose={() => setShowMailModal(false)} />

      {/* Modal Kiểm tra kết nối Zalo OA / ZNS */}
      <ZaloTestModal isOpen={showZaloModal} onClose={() => setShowZaloModal(false)} />
    </>
  );
}
