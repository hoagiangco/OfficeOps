import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getSession();

  // Đếm dữ liệu thực tế trong Database
  const [
    equipmentCount,
    customerCount,
    contractCount,
    openTicketCount,
    activeEquipment,
    faultyEquipment,
    pendingStockIssues,
    invoiceCount,
  ] = await Promise.all([
    prisma.equipment.count(),
    prisma.customer.count(),
    prisma.contract.count({ where: { isActive: true } }),
    prisma.ticket.count({
      where: { status: { notIn: ["COMPLETED", "CANCELLED"] } },
    }),
    prisma.equipment.count({ where: { status: "ACTIVE" } }),
    prisma.equipment.count({
      where: { status: { in: ["FAULTY", "WAITING_PARTS"] } },
    }),
    prisma.stockIssue.count({ where: { status: "PENDING" } }),
    prisma.invoice.count(),
  ]);

  return (
    <div className="dashboard-page-container">
      {/* Alert Center - Hệ thống thông báo */}
      <div className="alert-center-container">
        <div className="section-heading-compact mb-3">
          <i className="fas fa-bolt text-danger"></i>
          <span>Hệ thống thông báo</span>
        </div>
        <div className="row g-2">
          <div className="col-lg-4 col-md-6">
            <Link
              href="/tickets"
              className="alert-item-compact border-left-info h-100"
            >
              <i className="fas fa-spinner fa-spin text-info"></i>
              <div className="alert-item-text">
                {openTicketCount > 0 ? `${openTicketCount} phiếu yêu cầu đang xử lý` : "Không có phiếu chờ xử lý"}
                <div className="alert-item-sub text-muted">
                  Yêu cầu dịch vụ & sự cố
                </div>
              </div>
            </Link>
          </div>

          <div className="col-lg-4 col-md-6">
            <Link
              href="/equipment?status=FAULTY"
              className="alert-item-compact border-left-warning h-100"
            >
              <i className="fas fa-calendar-alt text-warning"></i>
              <div className="alert-item-text">
                {faultyEquipment > 0 ? `${faultyEquipment} máy đang báo lỗi / cần bảo trì` : "Tất cả máy hoạt động ổn định"}
                <div className="alert-item-sub text-warning fw-bold">
                  Cần lên lịch kỹ thuật viên
                </div>
              </div>
            </Link>
          </div>

          <div className="col-lg-4 col-md-6">
            <Link
              href="/equipment?status=ACTIVE"
              className="alert-item-compact border-left-success h-100"
            >
              <i className="fas fa-check-double text-success"></i>
              <div className="alert-item-text">
                {activeEquipment} máy đang vận hành bình thường
                <div className="alert-item-sub text-success">
                  Hiệu suất hoạt động tốt
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Grid - Chức năng */}
      <div className="section-heading-compact">
        <i className="fas fa-chart-bar text-primary"></i>
        <span>Chức năng</span>
      </div>

      <div className="row g-2">
        {/* Card 1: Báo cáo / Phiếu sự cố */}
        <div className="col-xl-2 col-lg-4 col-md-6">
          <Link href="/tickets" className="text-decoration-none">
            <div className="stat-tile-compact">
              <div className="stat-tile-accent accent-danger"></div>
              <div className="stat-tile-content">
                <div className="stat-tile-title">Phiếu sự cố</div>
                <div className="stat-tile-value">{openTicketCount}</div>
                <div className="stat-tile-footer text-danger">Xử lý ngay</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Card 2: Báo cáo ngày / Counter */}
        <div className="col-xl-2 col-lg-4 col-md-6">
          <Link href="/finance/invoices" className="text-decoration-none">
            <div className="stat-tile-compact">
              <div className="stat-tile-accent accent-success"></div>
              <div className="stat-tile-content">
                <div className="stat-tile-title">Chốt Counter & HĐ</div>
                <div className="stat-tile-value">{invoiceCount}</div>
                <div className="stat-tile-footer text-success">Đối soát cước</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Card 3: Thiết bị */}
        <div className="col-xl-2 col-lg-4 col-md-6">
          <Link href="/equipment" className="text-decoration-none">
            <div className="stat-tile-compact">
              <div className="stat-tile-accent accent-primary"></div>
              <div className="stat-tile-content">
                <div className="stat-tile-title">Thiết bị</div>
                <div className="stat-tile-value">{equipmentCount}</div>
                <div className="stat-tile-footer text-primary">Xem toàn bộ</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Card 4: Khách hàng */}
        <div className="col-xl-2 col-lg-4 col-md-6">
          <Link href="/customers" className="text-decoration-none">
            <div className="stat-tile-compact">
              <div className="stat-tile-accent accent-success"></div>
              <div className="stat-tile-content">
                <div className="stat-tile-title">Khách hàng</div>
                <div className="stat-tile-value">{customerCount}</div>
                <div className="stat-tile-footer text-success">Xem chi tiết</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Card 5: Hợp đồng */}
        <div className="col-xl-2 col-lg-4 col-md-6">
          <Link href="/contracts" className="text-decoration-none">
            <div className="stat-tile-compact">
              <div className="stat-tile-accent accent-info"></div>
              <div className="stat-tile-content">
                <div className="stat-tile-title">Hợp đồng</div>
                <div className="stat-tile-value">{contractCount}</div>
                <div className="stat-tile-footer text-info">Quản lý</div>
              </div>
            </div>
          </Link>
        </div>

        {/* Card 6: Kho linh kiện */}
        <div className="col-xl-2 col-lg-4 col-md-6">
          <Link href="/stock-issues" className="text-decoration-none">
            <div className="stat-tile-compact">
              <div className="stat-tile-accent accent-warning"></div>
              <div className="stat-tile-content">
                <div className="stat-tile-title">Duyệt xuất kho</div>
                <div className="stat-tile-value">{pendingStockIssues}</div>
                <div className="stat-tile-footer text-warning">Xuất kho FIFO</div>
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
