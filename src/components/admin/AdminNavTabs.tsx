"use client";

import React, { useState } from "react";
import Link from "next/link";
import { MailTestModal } from "@/components/MailTestModal";
import { ZaloTestModal } from "@/components/admin/ZaloTestModal";

export type AdminTabKey = "users" | "permissions" | "company" | "sla" | "audit";

interface AdminNavTabsProps {
  activeTab: AdminTabKey;
}

interface AdminTabItem {
  key: AdminTabKey;
  href: string;
  label: string;
  icon: string;
}

const ADMIN_TABS: AdminTabItem[] = [
  {
    key: "users",
    href: "/admin",
    label: "Tài khoản người dùng",
    icon: "fas fa-user-shield",
  },
  {
    key: "permissions",
    href: "/admin/permissions",
    label: "Phân quyền ma trận",
    icon: "fas fa-key",
  },
  {
    key: "company",
    href: "/admin/company",
    label: "Cấu hình Doanh nghiệp & VietQR",
    icon: "fas fa-building-circle-check",
  },
  {
    key: "sla",
    href: "/admin/sla",
    label: "Cấu hình cam kết SLA",
    icon: "fas fa-stopwatch",
  },
  {
    key: "audit",
    href: "/admin/audit-logs",
    label: "Nhật ký hoạt động",
    icon: "fas fa-history",
  },
];

export function AdminNavTabs({ activeTab }: AdminNavTabsProps) {
  const [showMailModal, setShowMailModal] = useState(false);
  const [showZaloModal, setShowZaloModal] = useState(false);

  return (
    <>
      <div className="bg-white p-2 px-3 rounded-3 shadow-sm border mb-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
        {/* Nhóm Tab Điều hướng Trang Quản trị Hệ Thống */}
        <div className="d-flex align-items-center gap-1.5 flex-wrap p-1 bg-light rounded-3 border">
          {ADMIN_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                className={`d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-2 text-decoration-none text-nowrap transition-all ${
                  isActive
                    ? "bg-primary text-white shadow-sm fw-bold"
                    : "text-secondary fw-semibold hover:text-dark hover:bg-white"
                }`}
                style={{
                  outline: "none",
                  fontSize: "13px",
                  boxShadow: isActive ? "0 2px 4px rgba(13, 110, 253, 0.25)" : undefined,
                }}
              >
                <i
                  className={`${tab.icon} ${
                    isActive ? "text-white" : "text-primary opacity-75"
                  }`}
                ></i>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Nhóm Công cụ Kiểm thử Hệ thống (Bên phải) */}
        <div className="d-flex align-items-center gap-2 ms-auto ms-lg-0">
          <button
            type="button"
            onClick={() => setShowMailModal(true)}
            className="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-2 py-1.5 px-3 fw-semibold rounded-2 shadow-xs"
            style={{ fontSize: "12.5px" }}
            title="Mở bảng kiểm tra kết nối máy chủ gửi Email SMTP"
          >
            <i className="fas fa-envelope"></i>
            <span>Test Email (SMTP)</span>
          </button>
          <button
            type="button"
            onClick={() => setShowZaloModal(true)}
            className="btn btn-sm btn-outline-info text-dark d-inline-flex align-items-center gap-2 py-1.5 px-3 fw-semibold rounded-2 shadow-xs"
            style={{ fontSize: "12.5px" }}
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
