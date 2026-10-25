"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/rbac";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";

interface SidebarProps {
  user: {
    name: string;
    role: Role;
    permissions?: Record<string, boolean>;
  };
}

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export function SidebarLayout({
  user,
  children,
}: {
  user: SidebarProps["user"];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.items || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch {
      // ignore network error on background poll
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isMobile =
        window.innerWidth <= 768 ||
        /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const preferred = localStorage.getItem("preferred_view");
      
      // Mặc định kích hoạt giao diện mobile khi mở app trên mobile
      if (isMobile && preferred !== "desktop") {
        router.replace("/tech");
        return;
      }

      const savedCollapsed = localStorage.getItem("sidebarCollapsed");
      if (savedCollapsed === "true") {
        setSidebarCollapsed(true);
      }
    }
    loadNotifications();
    const timer = setInterval(loadNotifications, 30000);
    return () => clearInterval(timer);
  }, [router]);

  const handleMarkRead = async (id: string) => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    loadNotifications();
  };

  const handleMarkAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    loadNotifications();
  };

  const handleDeleteNotif = async (id: string) => {
    await fetch(`/api/notifications?id=${id}`, { method: "DELETE" });
    loadNotifications();
  };

  const toggleSidebar = () => {
    if (typeof window !== "undefined" && window.innerWidth <= 768) {
      setMobileMenuOpen(!mobileMenuOpen);
    } else {
      const newState = !sidebarCollapsed;
      setSidebarCollapsed(newState);
      localStorage.setItem("sidebarCollapsed", String(newState));
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

  // Cấu trúc phân nhóm chuẩn HoaGiangManager kèm điều kiện phân quyền
  const menuGroups = [
    {
      title: "Tổng quan",
      items: [
        { href: "/", label: "Trang chủ", icon: "fas fa-home", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"] },
        { href: "/reports", label: "Báo cáo", icon: "fas fa-chart-pie", roles: ["SUPER_ADMIN", "ADMIN"], perm: "finance:view" },
      ],
    },
    {
      title: "Tài sản",
      items: [
        { href: "/equipment", label: "Thiết bị", icon: "fas fa-laptop", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"], perm: "equipment:read" },
        { href: "/contracts", label: "Hợp đồng", icon: "fas fa-file-contract", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER"], perm: "contract:read" },
        { href: "/customers", label: "Khách hàng", icon: "fas fa-building", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"], perm: "customer:read" },
      ],
    },
    {
      title: "Dịch vụ",
      items: [
        { href: "/tickets", label: "Phiếu kỹ thuật", icon: "fas fa-tools", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"], perms: ["ticket:update", "ticket:create", "ticket:assign"] },
        { href: "/dispatch", label: "Điều phối", icon: "fas fa-map-marked-alt", roles: ["SUPER_ADMIN", "DISPATCHER"], perm: "ticket:assign" },
        { href: "/maintenance", label: "Bảo trì", icon: "fas fa-wrench", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"], perm: "equipment:read" },
      ],
    },
    {
      title: "Kho",
      items: [
        { href: "/inventory", label: "Kho linh kiện", icon: "fas fa-boxes", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER"], perm: "stock:read" },
        { href: "/stock-issues", label: "Xuất nhập kho", icon: "fas fa-exchange-alt", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"], perms: ["stock:read", "stock:request", "stock:approve-technical", "stock:approve-retail"] },
        { href: "/reports/stock", label: "Nhập xuất tồn", icon: "fas fa-dolly-flatbed", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER"], perm: "stock:read" },
      ],
    },
    {
      title: "Tài chính",
      items: [
        { href: "/finance/invoices", label: "Hóa đơn cước", icon: "fas fa-receipt", roles: ["SUPER_ADMIN", "ADMIN"], perms: ["finance:view", "invoice:manage"] },
        { href: "/meters", label: "Duyệt Counter", icon: "fas fa-tachometer-alt", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER"], perm: "finance:view" },
      ],
    },
    {
      title: "Hệ thống",
      items: [
        { href: "/media", label: "Thư viện Media", icon: "fas fa-photo-video", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"], perm: "media:view" },
        { href: "/admin", label: "Tài khoản", icon: "fas fa-user-shield", roles: ["SUPER_ADMIN"], perm: "user:manage" },
        { href: "/admin/permissions", label: "Phân quyền", icon: "fas fa-key", roles: ["SUPER_ADMIN"], perm: "user:manage" },
        { href: "/admin/audit-logs", label: "Nhật ký", icon: "fas fa-history", roles: ["SUPER_ADMIN"], perm: "audit:view" },
      ],
    },
  ];

  const isSidebarCollapsed = sidebarCollapsed && !mobileMenuOpen;

  return (
    <div className="dashboard-wrapper">
      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-overlay"
          onClick={() => setMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar chuẩn HoaGiang Manager */}
      <aside
        className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""} ${
          mobileMenuOpen ? "mobile-open" : ""
        }`}
      >
        <div className="sidebar-header d-flex justify-content-between align-items-center position-relative">
          {!isSidebarCollapsed && (
            <h4 className="sidebar-title m-0 text-white font-bold">
              <span>OfficeOps Manager</span>
            </h4>
          )}
          <button
            className={`sidebar-toggle ${
              isSidebarCollapsed ? "mx-auto" : "position-absolute end-0 me-2"
            }`}
            onClick={toggleSidebar}
            title={isSidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            <i
              className={`fas ${
                isSidebarCollapsed ? "fa-angle-right" : "fa-angle-left"
              }`}
            ></i>
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuGroups.map((group, groupIdx) => {
            const accessibleItems = group.items.filter((item) => {
              if (!item.roles.includes(user.role)) return false;
              if (user.role === "SUPER_ADMIN") return true;
              if (!user.permissions) return true;
              if ("perm" in item && item.perm && !user.permissions[item.perm as string]) return false;
              if ("perms" in item && Array.isArray(item.perms) && !item.perms.some((p: string) => user.permissions?.[p])) return false;
              return true;
            });
            if (accessibleItems.length === 0) return null;

            return (
              <div key={groupIdx} className="sidebar-menu-group">
                {!isSidebarCollapsed && (
                  <div className="sidebar-menu-title">{group.title}</div>
                )}
                <ul className="sidebar-menu">
                  {accessibleItems.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);

                    return (
                      <li key={item.href} className="sidebar-menu-item">
                        <Link
                          href={item.href}
                          className={`sidebar-menu-link ${
                            isActive ? "active" : ""
                          }`}
                          title={isSidebarCollapsed ? item.label : ""}
                          onClick={() => {
                            if (
                              typeof window !== "undefined" &&
                              window.innerWidth <= 768
                            ) {
                              setMobileMenuOpen(false);
                            }
                          }}
                        >
                          <i className={item.icon}></i>
                          {!isSidebarCollapsed && (
                            <span className="sidebar-menu-text">
                              {item.label}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Footer Sidebar phiên bản bản quyền */}
        {!isSidebarCollapsed && (
          <div className="p-3 text-center border-top border-secondary border-opacity-25 text-muted" style={{ fontSize: "11px" }}>
            v1.0 | © 2026 OfficeOps. All rights reserved.
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div
        className={`main-content ${
          isSidebarCollapsed ? "sidebar-collapsed" : ""
        }`}
      >
        {/* Top Navbar chuẩn HoaGiang */}
        <header className="navbar navbar-expand navbar-light bg-white topbar mb-3 static-top shadow-sm px-4 d-flex justify-content-between align-items-center" style={{ height: "60px" }}>
          <div className="d-flex align-items-center">
            <button
              className="btn btn-link d-md-none me-3 p-0 text-dark"
              onClick={() => setMobileMenuOpen(true)}
            >
              <i className="fa fa-bars fa-lg"></i>
            </button>
            <div className="d-flex align-items-center gap-2">
              <i className="fas fa-user-circle fa-2x text-secondary"></i>
              <div className="text-start leading-tight">
                <span className="fw-bold d-block text-dark text-sm">{user.name}</span>
                <small className="text-muted text-xs">{ROLE_LABELS[user.role]}</small>
              </div>
            </div>
          </div>

          <div className="d-flex align-items-center gap-3 position-relative">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  localStorage.removeItem("preferred_view");
                  document.cookie = "preferred_view=; path=/; max-age=0";
                }
                router.push("/tech");
              }}
              className="btn btn-sm btn-outline-success rounded-pill px-2.5 py-1 fw-semibold d-flex align-items-center gap-1 shadow-sm"
              style={{ fontSize: "12px" }}
              title="Mở ứng dụng Mobile PWA dành cho Kỹ thuật viên & Quản lý"
            >
              <i className="fas fa-mobile-alt text-success"></i>
              <span className="d-none d-sm-inline">App Kỹ thuật</span>
              <span className="d-sm-none">App Mobile</span>
            </button>

            <div className="position-relative">
              <button
                type="button"
                className="btn btn-link text-danger position-relative p-1"
                title="Thông báo hệ thống"
                onClick={() => {
                  const next = !notifOpen;
                  setNotifOpen(next);
                  if (next) loadNotifications();
                }}
              >
                <i className="fas fa-bell fa-lg"></i>
                {unreadCount > 0 && (
                  <span
                    className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger"
                    style={{ fontSize: "10px" }}
                  >
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div
                  className="card shadow-lg border position-absolute end-0 mt-2"
                  style={{ width: "360px", zIndex: 1080 }}
                >
                  <div className="card-header bg-dark text-white py-2 px-3 d-flex justify-content-between align-items-center">
                    <span className="fw-bold small">
                      <i className="fas fa-bell me-1 text-warning"></i> Thông báo ({unreadCount}{" "}
                      chưa đọc)
                    </span>
                    <div className="d-flex gap-2 align-items-center">
                      {unreadCount > 0 && (
                        <button
                          type="button"
                          className="btn btn-link btn-sm text-info text-decoration-none p-0 small"
                          onClick={handleMarkAllRead}
                        >
                          Đọc tất cả
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-close btn-close-white"
                        style={{ fontSize: "0.65rem" }}
                        onClick={() => setNotifOpen(false)}
                      ></button>
                    </div>
                  </div>
                  <div
                    className="list-group list-group-flush"
                    style={{ maxHeight: "340px", overflowY: "auto" }}
                  >
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-muted small">
                        Không có thông báo mới.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          className={`list-group-item list-group-item-action px-3 py-2 ${
                            !n.isRead ? "bg-info-subtle" : ""
                          }`}
                        >
                          <div className="d-flex justify-content-between align-items-start">
                            <div
                              className="fw-bold small text-dark"
                              style={{ cursor: "pointer" }}
                              onClick={() => !n.isRead && handleMarkRead(n.id)}
                            >
                              {!n.isRead && (
                                <span
                                  className="badge bg-primary me-1"
                                  style={{ fontSize: "9px" }}
                                >
                                  MỚI
                                </span>
                              )}
                              {n.title}
                            </div>
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-muted p-0 ms-2"
                              title="Xóa thông báo"
                              onClick={() => handleDeleteNotif(n.id)}
                            >
                              <i className="fas fa-times fa-xs"></i>
                            </button>
                          </div>
                          <div className="small text-secondary mt-1">{n.body}</div>
                          <div className="d-flex justify-content-between align-items-center mt-1">
                            <span className="text-muted" style={{ fontSize: "10px" }}>
                              {new Date(n.createdAt).toLocaleString("vi-VN")}
                            </span>
                            {!n.isRead && (
                              <button
                                type="button"
                                className="btn btn-link btn-sm p-0 text-decoration-none"
                                style={{ fontSize: "11px" }}
                                onClick={() => handleMarkRead(n.id)}
                              >
                                Đánh dấu đã đọc
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setChangePasswordOpen(true)}
              className="btn btn-outline-secondary btn-sm ms-2"
              title="Đổi mật khẩu"
            >
              <i className="fas fa-key"></i>
            </button>

            <button
              onClick={handleLogout}
              className="btn btn-outline-primary btn-sm ms-2"
              title="Đăng xuất"
            >
              <i className="fas fa-sign-out-alt"></i>
            </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <div className="container-fluid px-3 pb-4">{children}</div>
      </div>

      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </div>
  );
}
