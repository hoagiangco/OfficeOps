import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { getUserPermissions } from "@/lib/rbacService";
import type { Role } from "@/lib/rbac";
import { ROLE_LABELS } from "@/lib/rbac";

interface StatCardProps {
  title: string;
  value: string | number;
  footer: string;
  href: string;
  accent: "primary" | "success" | "warning" | "danger" | "info" | "secondary";
  hasPerm: boolean;
  lockedReason?: string;
  badge?: string;
}

/**
 * Component hiển thị ô chức năng (Quick Access Stat Tile):
 * - Nếu có quyền: Hiển thị thẻ màu sắc nét, chỉ số thực tế, bọc thẻ <Link> cho phép bấm tương tác.
 * - Nếu KHÔNG CÓ QUYỀN: Khoá thẻ (đổi màu xám, biểu tượng ổ khóa, giá trị "Đã khóa", cursor not-allowed,
 *   KHÔNG bọc thẻ <Link> để người dùng không bấm được, tránh tình trạng bấm vào rồi mới bị chặn/báo lỗi).
 */
function StatCardItem({
  title,
  value,
  footer,
  href,
  accent,
  hasPerm,
  lockedReason = "Chưa được phân quyền",
  badge,
}: StatCardProps) {
  if (!hasPerm) {
    return (
      <div className="col-xl-2 col-lg-4 col-md-6">
        <div
          className="stat-tile-compact stat-tile-locked position-relative h-100"
          style={{ cursor: "not-allowed" }}
          title={`Chức năng "${title}" đã bị khóa do tài khoản chưa được phân quyền. Vui lòng liên hệ Quản trị viên để được cấp quyền.`}
        >
          <div className="stat-tile-accent accent-secondary"></div>
          <div className="stat-tile-content">
            <div className="stat-tile-title d-flex justify-content-between align-items-center">
              <span className="text-muted">{title}</span>
              <span
                className="badge bg-secondary-subtle text-secondary border border-secondary-subtle font-monospace"
                style={{ fontSize: "9px" }}
              >
                <i className="fas fa-lock me-1"></i>ĐÃ KHÓA
              </span>
            </div>
            <div className="stat-tile-value text-secondary opacity-50 py-1" style={{ fontSize: "1.1rem" }}>
              <i className="fas fa-ban text-secondary me-1 fa-sm"></i>
              <span>Đã khóa</span>
            </div>
            <div
              className="stat-tile-footer text-muted d-flex align-items-center gap-1"
              style={{ fontSize: "10.5px" }}
            >
              <i className="fas fa-shield-alt text-secondary fa-xs"></i>
              <span className="text-truncate">{lockedReason}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-xl-2 col-lg-4 col-md-6">
      <Link href={href} className="text-decoration-none">
        <div className="stat-tile-compact h-100">
          <div className={`stat-tile-accent accent-${accent}`}></div>
          <div className="stat-tile-content">
            <div className="stat-tile-title d-flex justify-content-between align-items-center">
              <span>{title}</span>
              {badge && (
                <span
                  className={`badge bg-${accent}-subtle text-${accent} border border-${accent}-subtle`}
                  style={{ fontSize: "9px" }}
                >
                  {badge}
                </span>
              )}
            </div>
            <div className="stat-tile-value">{value}</div>
            <div className={`stat-tile-footer text-${accent}`}>{footer}</div>
          </div>
        </div>
      </Link>
    </div>
  );
}

interface AlertItemConfig {
  id: string;
  href: string;
  icon: string;
  borderClass: string;
  iconClass: string;
  title: string;
  sub: string;
  subClass?: string;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const userId = session.userId || "";
  const userName = session.name || "Người dùng";

  // Nạp ma trận phân quyền thực tế của người dùng từ DB (kèm cache)
  const userPerms = await getUserPermissions(userId);
  const role: Role = userPerms.role;
  const perms = userPerms.permissions;
  const isCustomized = userPerms.isCustomized;
  const isSuperAdmin = role === "SUPER_ADMIN";

  // Cờ kiểm tra quyền hạn từng phân hệ chức năng
  const canTicket =
    isSuperAdmin || !!perms["ticket:update"] || !!perms["ticket:create"] || !!perms["ticket:assign"];
  const canDispatch =
    isSuperAdmin || (role === "DISPATCHER" && !!perms["ticket:assign"]);
  const canEquipment = isSuperAdmin || !!perms["equipment:read"];
  const canCustomer = isSuperAdmin || !!perms["customer:read"];
  const canContract =
    isSuperAdmin ||
    ((role === "ADMIN" || role === "DISPATCHER") && !!perms["contract:read"]);
  const canInventory =
    isSuperAdmin ||
    ((role === "ADMIN" || role === "DISPATCHER") && !!perms["stock:read"]);
  const canStockIssue =
    isSuperAdmin ||
    !!perms["stock:request"] ||
    !!perms["stock:approve-technical"] ||
    !!perms["stock:approve-retail"] ||
    !!perms["stock:read"];
  const canStockRequest = isSuperAdmin || !!perms["stock:request"];
  const canStockApprove =
    isSuperAdmin ||
    ((role === "ADMIN" || role === "DISPATCHER") &&
      (!!perms["stock:approve-technical"] || !!perms["stock:approve-retail"]));
  const canFinance =
    isSuperAdmin ||
    (role === "ADMIN" &&
      (!!perms["finance:view"] || !!perms["invoice:manage"]));
  const canReports =
    isSuperAdmin || (role === "ADMIN" && !!perms["finance:view"]);
  const canMaintenance = isSuperAdmin || !!perms["equipment:read"];
  const canAdmin = isSuperAdmin && !!perms["user:manage"];
  const canAudit = isSuperAdmin && !!perms["audit:view"];

  // Chỉ truy vấn CSDL đối với các mục mà user CÓ QUYỀN TRUY CẬP (bảo mật dữ liệu & tối ưu hiệu năng)
  const [
    myOpenTickets,
    myUrgentTickets,
    myCompletedTickets,
    myPendingStockIssues,
    pendingDispatchCount,
    openTicketsCount,
    pendingStockIssuesCount,
    equipmentCount,
    activeEquipmentCount,
    faultyEquipmentCount,
    customerCount,
    activeContractCount,
    invoiceCount,
    unpaidInvoiceCount,
    userCount,
  ] = await Promise.all([
    // 1. Phiếu của riêng KTV
    role === "FIELD_TECH" && canTicket
      ? prisma.ticket.count({
          where: {
            assigneeId: userId,
            status: { in: ["ASSIGNED", "IN_PROGRESS", "WAITING_PARTS", "WAITING_CUSTOMER"] },
          },
        })
      : 0,
    // 2. Phiếu khẩn cấp của KTV
    role === "FIELD_TECH" && canTicket
      ? prisma.ticket.count({
          where: {
            assigneeId: userId,
            priority: { in: ["HIGH", "URGENT"] },
            status: { notIn: ["COMPLETED", "CANCELLED"] },
          },
        })
      : 0,
    // 3. Phiếu KTV đã hoàn thành
    role === "FIELD_TECH" && canTicket
      ? prisma.ticket.count({
          where: { assigneeId: userId, status: "COMPLETED" },
        })
      : 0,
    // 4. Yêu cầu vật tư của KTV chờ duyệt
    role === "FIELD_TECH" && canStockRequest
      ? prisma.stockIssue.count({
          where: { requesterId: userId, status: "PENDING" },
        })
      : 0,
    // 5. Phiếu chờ điều phối KTV
    canDispatch ? prisma.ticket.count({ where: { status: "PENDING" } }) : 0,
    // 6. Tổng phiếu đang xử lý toàn hệ thống
    canTicket && role !== "FIELD_TECH"
      ? prisma.ticket.count({
          where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
        })
      : 0,
    // 7. Yêu cầu xuất kho chờ duyệt (Dành cho người có quyền duyệt)
    canStockApprove ? prisma.stockIssue.count({ where: { status: "PENDING" } }) : 0,
    // 8. Thiết bị
    canEquipment ? prisma.equipment.count() : 0,
    // 9. Thiết bị hoạt động
    canEquipment ? prisma.equipment.count({ where: { status: "ACTIVE" } }) : 0,
    // 10. Thiết bị báo lỗi
    canEquipment
      ? prisma.equipment.count({ where: { status: { in: ["FAULTY", "WAITING_PARTS"] } } })
      : 0,
    // 11. Khách hàng
    canCustomer ? prisma.customer.count() : 0,
    // 12. Hợp đồng đang hiệu lực
    canContract ? prisma.contract.count({ where: { isActive: true } }) : 0,
    // 13. Hóa đơn
    canFinance ? prisma.invoice.count() : 0,
    // 14. Hóa đơn chưa thu / quá hạn
    canFinance
      ? prisma.invoice.count({ where: { status: { in: ["SENT", "OVERDUE"] } } })
      : 0,
    // 15. Tài khoản người dùng (Giám đốc)
    canAdmin ? prisma.user.count() : 0,
  ]);

  // Cấu hình các cảnh báo thuộc Alert Center:
  // NGUYÊN TẮC: Chức năng nào user không có quyền -> ẨN LUÔN KHỎI KHUNG CẢNH BÁO
  const activeAlerts: AlertItemConfig[] = [];

  if (role === "FIELD_TECH") {
    if (canTicket) {
      activeAlerts.push({
        id: "ft-open",
        href: "/tickets",
        icon: "fas fa-tools",
        borderClass: "border-left-info",
        iconClass: "text-info",
        title:
          myOpenTickets > 0
            ? `${myOpenTickets} phiếu kỹ thuật được giao đang cần xử lý`
            : "Bạn không có phiếu chờ xử lý",
        sub: "Phiếu kỹ thuật phụ trách hiện trường",
        subClass: "text-muted",
      });

      if (myUrgentTickets > 0) {
        activeAlerts.push({
          id: "ft-urgent",
          href: "/tickets",
          icon: "fas fa-exclamation-triangle",
          borderClass: "border-left-warning",
          iconClass: "text-warning",
          title: `${myUrgentTickets} phiếu mức ưu tiên Cao / Khẩn cấp`,
          sub: "Ưu tiên xử lý kịp thời hạn SLA",
          subClass: "text-danger fw-bold",
        });
      }
    }

    if (canStockRequest) {
      activeAlerts.push({
        id: "ft-stock",
        href: "/stock-issues",
        icon: "fas fa-dolly",
        borderClass: "border-left-success",
        iconClass: "text-success",
        title:
          myPendingStockIssues > 0
            ? `${myPendingStockIssues} yêu cầu xuất vật tư của bạn đang chờ kho duyệt`
            : "Tất cả yêu cầu vật tư đã được xử lý",
        sub: "Linh kiện phục vụ sửa chữa",
        subClass: "text-success",
      });
    }
  } else if (role === "DISPATCHER") {
    if (canDispatch) {
      activeAlerts.push({
        id: "disp-pending",
        href: "/dispatch",
        icon: "fas fa-bell",
        borderClass: "border-left-danger",
        iconClass: "text-danger",
        title:
          pendingDispatchCount > 0
            ? `${pendingDispatchCount} phiếu kỹ thuật đang CHỜ ĐIỀU PHỐI`
            : "Tất cả phiếu đã được phân công KTV",
        sub:
          pendingDispatchCount > 0
            ? "Cần phân công kỹ thuật viên ngay"
            : "Tiến độ điều phối hoàn thành",
        subClass: pendingDispatchCount > 0 ? "text-danger fw-bold" : "text-muted",
      });
    }

    if (canStockApprove) {
      activeAlerts.push({
        id: "disp-stock",
        href: "/stock-issues",
        icon: "fas fa-boxes",
        borderClass: "border-left-warning",
        iconClass: "text-warning",
        title:
          pendingStockIssuesCount > 0
            ? `${pendingStockIssuesCount} yêu cầu xuất kho kỹ thuật chờ duyệt`
            : "Kho vật tư ổn định",
        sub: "Duyệt xuất kho FIFO",
        subClass: "text-warning fw-bold",
      });
    }

    if (canTicket) {
      activeAlerts.push({
        id: "disp-open",
        href: "/tickets",
        icon: "fas fa-spinner fa-spin",
        borderClass: "border-left-info",
        iconClass: "text-info",
        title: `${openTicketsCount} phiếu kỹ thuật đang xử lý hiện trường`,
        sub: "Giám sát tiến độ & SLA",
        subClass: "text-muted",
      });
    }
  } else if (role === "ADMIN") {
    if (canFinance) {
      activeAlerts.push({
        id: "admin-invoice",
        href: "/finance/invoices",
        icon: "fas fa-receipt",
        borderClass: "border-left-success",
        iconClass: "text-success",
        title:
          unpaidInvoiceCount > 0
            ? `${unpaidInvoiceCount} hóa đơn cước đang chờ thu / quá hạn`
            : "Toàn bộ hóa đơn đã thanh toán",
        sub: unpaidInvoiceCount > 0 ? "Cần đối soát & thu nợ" : "Dòng tiền ổn định",
        subClass: unpaidInvoiceCount > 0 ? "text-danger fw-bold" : "text-success",
      });
    }

    if (canContract) {
      activeAlerts.push({
        id: "admin-contract",
        href: "/contracts",
        icon: "fas fa-file-contract",
        borderClass: "border-left-info",
        iconClass: "text-info",
        title: `${activeContractCount} hợp đồng dịch vụ đang hiệu lực`,
        sub: "Kỳ chốt cước & thanh toán",
        subClass: "text-muted",
      });
    }

    if (canCustomer) {
      activeAlerts.push({
        id: "admin-customer",
        href: "/customers",
        icon: "fas fa-building",
        borderClass: "border-left-warning",
        iconClass: "text-warning",
        title: `${customerCount} đối tác khách hàng`,
        sub: "Thông tin thuế & thanh toán",
        subClass: "text-muted",
      });
    }
  } else {
    // SUPER_ADMIN (Giám đốc)
    if (pendingDispatchCount > 0 && canDispatch) {
      activeAlerts.push({
        id: "sa-dispatch",
        href: "/dispatch",
        icon: "fas fa-bell",
        borderClass: "border-left-danger",
        iconClass: "text-danger",
        title: `${pendingDispatchCount} phiếu kỹ thuật đang chờ điều phối KTV`,
        sub: "Cần chỉ định kỹ thuật viên",
        subClass: "text-danger fw-bold",
      });
    }

    if (canTicket) {
      activeAlerts.push({
        id: "sa-ticket",
        href: "/tickets",
        icon: "fas fa-spinner fa-spin",
        borderClass: "border-left-info",
        iconClass: "text-info",
        title:
          openTicketsCount > 0
            ? `${openTicketsCount} phiếu kỹ thuật đang xử lý`
            : "Không có phiếu chờ xử lý",
        sub: "Dịch vụ & sửa chữa kỹ thuật",
        subClass: "text-muted",
      });
    }

    if (canEquipment) {
      if (faultyEquipmentCount > 0) {
        activeAlerts.push({
          id: "sa-faulty",
          href: "/equipment?status=FAULTY",
          icon: "fas fa-calendar-alt",
          borderClass: "border-left-warning",
          iconClass: "text-warning",
          title: `${faultyEquipmentCount} máy đang báo lỗi / cần bảo trì`,
          sub: "Cần lên lịch kỹ thuật viên",
          subClass: "text-warning fw-bold",
        });
      }

      activeAlerts.push({
        id: "sa-active-eq",
        href: "/equipment?status=ACTIVE",
        icon: "fas fa-check-double",
        borderClass: "border-left-success",
        iconClass: "text-success",
        title: `${activeEquipmentCount} máy đang vận hành bình thường`,
        sub: "Hiệu suất hoạt động tốt",
        subClass: "text-success",
      });
    }

    if (unpaidInvoiceCount > 0 && canFinance) {
      activeAlerts.push({
        id: "sa-unpaid",
        href: "/finance/invoices",
        icon: "fas fa-receipt",
        borderClass: "border-left-success",
        iconClass: "text-success",
        title: `${unpaidInvoiceCount} hóa đơn cước đang chờ thu`,
        sub: "Dòng tiền & thu hồi công nợ",
        subClass: "text-danger fw-bold",
      });
    }
  }

  return (
    <div className="dashboard-page-container">
      {/* 1. Welcome Banner */}
      <div className="d-flex justify-content-between align-items-center mb-3 bg-white p-3 rounded shadow-sm border">
        <div>
          <h5 className="mb-1 fw-bold text-dark d-flex align-items-center gap-2 flex-wrap">
            <i
              className={`fas ${
                role === "SUPER_ADMIN"
                  ? "fa-chart-line text-danger"
                  : role === "ADMIN"
                  ? "fa-file-invoice-dollar text-success"
                  : role === "DISPATCHER"
                  ? "fa-map-marked-alt text-warning"
                  : "fa-user-wrench text-primary"
              }`}
            ></i>
            <span>Xin chào, {userName}!</span>
            <span
              className={`badge ${
                role === "SUPER_ADMIN"
                  ? "bg-danger-subtle text-danger border border-danger-subtle"
                  : role === "ADMIN"
                  ? "bg-success-subtle text-success border border-success-subtle"
                  : role === "DISPATCHER"
                  ? "bg-warning-subtle text-warning-emphasis border border-warning-subtle"
                  : "bg-primary-subtle text-primary border border-primary-subtle"
              }`}
              style={{ fontSize: "11px" }}
            >
              {ROLE_LABELS[role]}
            </span>
            {isCustomized && (
              <span
                className="badge bg-info-subtle text-info border border-info-subtle"
                style={{ fontSize: "10px" }}
                title="Tài khoản của bạn đã được thiết lập phân quyền cá nhân"
              >
                <i className="fas fa-user-check me-1"></i>Phân quyền riêng
              </span>
            )}
          </h5>
          <div className="text-muted small">
            {role === "FIELD_TECH" &&
              "Không gian làm việc kỹ thuật viên - Giám sát nhiệm vụ hiện trường & vật tư của bạn"}
            {role === "DISPATCHER" &&
              "Bàn làm việc điều phối - Phân công KTV hiện trường & Quản trị kho linh kiện"}
            {role === "ADMIN" &&
              "Trung tâm tài chính & hợp đồng - Quản trị hóa đơn cước, hợp đồng thuê máy & công nợ"}
            {role === "SUPER_ADMIN" &&
              "Bảng điều hành tổng thể - Giám sát toàn bộ hoạt động dịch vụ, khách hàng, hợp đồng & tài chính"}
          </div>
        </div>
      </div>

      {/* 2. Alert Center: Chỉ hiển thị các cảnh báo thuộc phạm vi được phân quyền */}
      <div className="alert-center-container">
        <div className="section-heading-compact mb-2.5">
          <i className="fas fa-bolt text-danger"></i>
          <span>Thông báo & Cảnh báo nhiệm vụ</span>
        </div>

        {activeAlerts.length === 0 ? (
          <div className="alert alert-light border rounded-2 p-2.5 px-3 d-flex align-items-center gap-2 mb-0 shadow-xs">
            <i className="fas fa-shield-alt text-success fa-lg"></i>
            <span className="small text-muted">
              Hệ thống hoạt động bình thường. Không có thông báo phát sinh thuộc phạm vi phân quyền của bạn.
            </span>
          </div>
        ) : (
          <div className="row g-2">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="col-lg-4 col-md-6">
                <Link href={alert.href} className={`alert-item-compact ${alert.borderClass} h-100`}>
                  <i className={`${alert.icon} ${alert.iconClass}`}></i>
                  <div className="alert-item-text">
                    {alert.title}
                    <div className={`alert-item-sub ${alert.subClass || "text-muted"}`}>
                      {alert.sub}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Quick Access (Truy cập nhanh) - Các chức năng hệ thống:
          - Chức năng có quyền: Cho phép bấm, hiển thị chỉ số thực tế.
          - Chức năng KHÔNG có quyền: Khoá (hiển thị ổ khóa, icon cấm, không cho click, ngăn bấm vào rồi mới báo không có quyền).
      */}
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div className="section-heading-compact mb-0">
          <i className="fas fa-th-large text-primary"></i>
          <span>Truy cập nhanh chức năng</span>
        </div>
        <span className="badge bg-light text-secondary border font-monospace" style={{ fontSize: "10.5px" }}>
          <i className="fas fa-info-circle me-1"></i>Chức năng không có quyền sẽ được khóa tự động
        </span>
      </div>

      {/* Giao diện Thẻ Chức Năng theo Vai Trò */}
      {role === "FIELD_TECH" && (
        <div className="row g-2">
          {/* Card 1: Phiếu của tôi */}
          <StatCardItem
            title="Phiếu của tôi"
            value={canTicket ? myOpenTickets : 0}
            footer="Xử lý ngay"
            href="/tickets"
            accent="danger"
            hasPerm={canTicket}
            lockedReason="Chưa cấp quyền phiếu kỹ thuật"
          />

          {/* Card 2: Đã hoàn thành */}
          <StatCardItem
            title="Đã hoàn thành"
            value={canTicket ? myCompletedTickets : 0}
            footer="Nghiệm thu xong"
            href="/tickets"
            accent="success"
            hasPerm={canTicket}
            lockedReason="Chưa cấp quyền phiếu kỹ thuật"
          />

          {/* Card 3: Yêu cầu vật tư */}
          <StatCardItem
            title="Yêu cầu vật tư"
            value={canStockRequest ? myPendingStockIssues : 0}
            footer="Chờ duyệt kho"
            href="/stock-issues"
            accent="warning"
            hasPerm={canStockRequest}
            lockedReason="Chưa cấp quyền đề xuất vật tư"
          />

          {/* Card 4: Thiết bị */}
          <StatCardItem
            title="Thiết bị"
            value={canEquipment ? equipmentCount : 0}
            footer="Tra cứu máy & Counter"
            href="/equipment"
            accent="primary"
            hasPerm={canEquipment}
            lockedReason="Chưa cấp quyền xem thiết bị"
          />

          {/* Card 5: Khách hàng */}
          <StatCardItem
            title="Khách hàng"
            value={canCustomer ? customerCount : 0}
            footer="Địa chỉ & Liên hệ"
            href="/customers"
            accent="info"
            hasPerm={canCustomer}
            lockedReason="Chưa cấp quyền xem khách hàng"
          />

          {/* Card 6: Lịch bảo trì */}
          <StatCardItem
            title="Lịch bảo trì"
            value={canMaintenance ? "Định kỳ" : 0}
            footer="Kế hoạch bảo dưỡng"
            href="/maintenance"
            accent="success"
            hasPerm={canMaintenance}
            lockedReason="Chưa cấp quyền bảo trì thiết bị"
          />
        </div>
      )}

      {role === "DISPATCHER" && (
        <div className="row g-2">
          {/* Card 1: Bảng Điều phối */}
          <StatCardItem
            title="Bảng Điều phối"
            value={canDispatch ? pendingDispatchCount : 0}
            footer="Chờ giao việc"
            href="/dispatch"
            accent="danger"
            hasPerm={canDispatch}
            lockedReason="Chưa cấp quyền điều phối KTV"
          />

          {/* Card 2: Phiếu kỹ thuật */}
          <StatCardItem
            title="Phiếu kỹ thuật"
            value={canTicket ? openTicketsCount : 0}
            footer="Đang xử lý"
            href="/tickets"
            accent="info"
            hasPerm={canTicket}
            lockedReason="Chưa cấp quyền phiếu kỹ thuật"
          />

          {/* Card 3: Duyệt xuất kho */}
          <StatCardItem
            title="Duyệt xuất kho"
            value={canStockApprove ? pendingStockIssuesCount : 0}
            footer="Xuất kho FIFO"
            href="/stock-issues"
            accent="warning"
            hasPerm={canStockApprove}
            lockedReason="Chưa cấp quyền duyệt xuất kho"
          />

          {/* Card 4: Kho linh kiện */}
          <StatCardItem
            title="Kho linh kiện"
            value={canInventory ? "Vật tư" : 0}
            footer="Tồn kho & Định mức"
            href="/inventory"
            accent="primary"
            hasPerm={canInventory}
            lockedReason="Chưa cấp quyền xem kho vật tư"
          />

          {/* Card 5: Thiết bị */}
          <StatCardItem
            title="Thiết bị"
            value={canEquipment ? equipmentCount : 0}
            footer={canEquipment ? `${faultyEquipmentCount} máy cần sửa` : "Tài sản máy"}
            href="/equipment"
            accent="primary"
            hasPerm={canEquipment}
            lockedReason="Chưa cấp quyền xem thiết bị"
          />

          {/* Card 6: Khách hàng */}
          <StatCardItem
            title="Khách hàng"
            value={canCustomer ? customerCount : 0}
            footer="Đối tác & Địa điểm"
            href="/customers"
            accent="success"
            hasPerm={canCustomer}
            lockedReason="Chưa cấp quyền xem khách hàng"
          />
        </div>
      )}

      {role === "ADMIN" && (
        <div className="row g-2">
          {/* Card 1: Hóa đơn cước */}
          <StatCardItem
            title="Hóa đơn cước"
            value={canFinance ? invoiceCount : 0}
            footer={canFinance ? `${unpaidInvoiceCount} chờ thu` : "Công nợ"}
            href="/finance/invoices"
            accent="success"
            hasPerm={canFinance}
            lockedReason="Chưa cấp quyền quản lý hóa đơn"
          />

          {/* Card 2: Hợp đồng */}
          <StatCardItem
            title="Hợp đồng"
            value={canContract ? activeContractCount : 0}
            footer="Đang hiệu lực"
            href="/contracts"
            accent="info"
            hasPerm={canContract}
            lockedReason="Chưa cấp quyền quản lý hợp đồng"
          />

          {/* Card 3: Khách hàng */}
          <StatCardItem
            title="Khách hàng"
            value={canCustomer ? customerCount : 0}
            footer="Đối tác doanh nghiệp"
            href="/customers"
            accent="primary"
            hasPerm={canCustomer}
            lockedReason="Chưa cấp quyền xem khách hàng"
          />

          {/* Card 4: Thiết bị */}
          <StatCardItem
            title="Thiết bị"
            value={canEquipment ? equipmentCount : 0}
            footer="Tài sản cho thuê"
            href="/equipment"
            accent="primary"
            hasPerm={canEquipment}
            lockedReason="Chưa cấp quyền xem thiết bị"
          />

          {/* Card 5: Kho linh kiện */}
          <StatCardItem
            title="Kho linh kiện"
            value={canInventory ? "Vật tư" : 0}
            footer="Theo dõi xuất nhập"
            href="/inventory"
            accent="warning"
            hasPerm={canInventory}
            lockedReason="Chưa cấp quyền xem kho linh kiện"
          />

          {/* Card 6: Báo cáo */}
          <StatCardItem
            title="Báo cáo"
            value={canReports ? "Doanh thu" : 0}
            footer="Phân tích cước"
            href="/reports"
            accent="success"
            hasPerm={canReports}
            lockedReason="Chưa cấp quyền xem báo cáo tài chính"
          />
        </div>
      )}

      {role === "SUPER_ADMIN" && (
        /* SUPER_ADMIN (Giám đốc): Hiển thị toàn cảnh 12 module cốt lõi của hệ thống */
        <div className="row g-2">
          {/* 1. Phiếu kỹ thuật */}
          <StatCardItem
            title="Phiếu kỹ thuật"
            value={openTicketsCount}
            footer="Xử lý ngay"
            href="/tickets"
            accent="danger"
            hasPerm={canTicket}
          />

          {/* 2. Bảng Điều phối */}
          <StatCardItem
            title="Bảng Điều phối"
            value={pendingDispatchCount}
            footer="Chờ giao việc"
            href="/dispatch"
            accent="danger"
            hasPerm={canDispatch}
          />

          {/* 3. Duyệt xuất kho */}
          <StatCardItem
            title="Duyệt xuất kho"
            value={pendingStockIssuesCount}
            footer="Xuất kho FIFO"
            href="/stock-issues"
            accent="warning"
            hasPerm={canStockApprove}
          />

          {/* 4. Kho linh kiện */}
          <StatCardItem
            title="Kho linh kiện"
            value="Vật tư"
            footer="Tồn kho & Lô FIFO"
            href="/inventory"
            accent="warning"
            hasPerm={canInventory}
          />

          {/* 5. Thiết bị */}
          <StatCardItem
            title="Thiết bị"
            value={equipmentCount}
            footer={`${faultyEquipmentCount} máy cần sửa`}
            href="/equipment"
            accent="primary"
            hasPerm={canEquipment}
          />

          {/* 6. Lịch bảo trì */}
          <StatCardItem
            title="Lịch bảo trì"
            value="Định kỳ"
            footer="Quét Cron tự động"
            href="/maintenance"
            accent="primary"
            hasPerm={canMaintenance}
          />

          {/* 7. Khách hàng */}
          <StatCardItem
            title="Khách hàng"
            value={customerCount}
            footer="Đối tác doanh nghiệp"
            href="/customers"
            accent="info"
            hasPerm={canCustomer}
          />

          {/* 8. Hợp đồng */}
          <StatCardItem
            title="Hợp đồng"
            value={activeContractCount}
            footer="Đang hiệu lực"
            href="/contracts"
            accent="info"
            hasPerm={canContract}
          />

          {/* 9. Hóa đơn cước */}
          <StatCardItem
            title="Hóa đơn cước"
            value={invoiceCount}
            footer={`${unpaidInvoiceCount} chờ thu`}
            href="/finance/invoices"
            accent="success"
            hasPerm={canFinance}
          />

          {/* 10. Báo cáo tài chính */}
          <StatCardItem
            title="Báo cáo"
            value="Doanh thu"
            footer="Phân tích cước"
            href="/reports"
            accent="success"
            hasPerm={canReports}
          />

          {/* 11. Quản trị người dùng */}
          <StatCardItem
            title="Tài khoản"
            value={userCount}
            footer="Quản trị người dùng"
            href="/admin"
            accent="danger"
            hasPerm={canAdmin}
          />

          {/* 12. Nhật ký hệ thống */}
          <StatCardItem
            title="Nhật ký"
            value="Audit"
            footer="Truy vết thao tác"
            href="/admin/audit-logs"
            accent="secondary"
            hasPerm={canAudit}
          />
        </div>
      )}
    </div>
  );
}
