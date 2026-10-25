const fs = require('fs');

function replaceInFile(file, replacements) {
  if (!fs.existsSync(file)) {
    console.error(`File not found: ${file}`);
    return;
  }
  let content = fs.readFileSync(file, 'utf8');
  let count = 0;
  for (const [target, replacement] of replacements) {
    if (content.includes(target)) {
      content = content.replaceAll(target, replacement);
      count++;
    } else {
      console.warn(`Target not found in ${file}: "${target.slice(0, 50)}..."`);
    }
  }
  fs.writeFileSync(file, content, 'utf8');
  console.log(`Updated ${file} (${count} patterns matched)`);
}

// 1. Sidebar menu
replaceInFile('src/components/layout/SidebarLayout.tsx', [
  ['title: "Tổng quan"', 'title: "Tổng quan"'],
  ['label: "Thống kê tổng hợp"', 'label: "Báo cáo"'],
  ['title: "Quản lý tài sản"', 'title: "Tài sản"'],
  ['title: "Công việc & Dịch vụ"', 'title: "Dịch vụ"'],
  ['label: "Điều phối kỹ thuật"', 'label: "Điều phối"'],
  ['label: "Bảo trì định kỳ"', 'label: "Bảo trì"'],
  ['title: "Quản lý kho"', 'title: "Kho"'],
  ['label: "Vật tư dự phòng"', 'label: "Kho linh kiện"'],
  ['label: "Nhập / Xuất kho"', 'label: "Xuất nhập kho"'],
  ['title: "Tài chính & Thanh toán"', 'title: "Tài chính"'],
  ['label: "Chốt Counter & Hóa đơn"', 'label: "Hóa đơn cước"'],
  ['label: "Tài khoản người dùng"', 'label: "Tài khoản"'],
  ['label: "Nhật ký thao tác"', 'label: "Nhật ký"'],
]);

// 2. Dashboard src/app/(main)/page.tsx
replaceInFile('src/app/(main)/page.tsx', [
  ['<span>Hệ thống thông báo</span>', '<span>Thông báo</span>'],
  ['<span>Chức năng</span>', '<span>Truy cập nhanh</span>'],
  ['<div className="stat-tile-title">Chốt Counter & HĐ</div>', '<div className="stat-tile-title">Hóa đơn cước</div>'],
  ['<div className="stat-tile-footer text-success">Đối soát cước</div>', '<div className="stat-tile-footer text-success">Thu tiền & Cước</div>'],
]);

// 3. Equipment page src/app/(main)/equipment/page.tsx
replaceInFile('src/app/(main)/equipment/page.tsx', [
  ['<span>Danh mục Thiết bị</span>', '<span>Thiết bị</span>'],
  ['title="Quản lý Cây Danh mục Thiết bị Đa cấp (Cha › Con › Cháu)"', 'title="Cây danh mục thiết bị"'],
  ['title="Quản lý Loại thiết bị & Nhóm máy"', 'title="Loại & Nhóm máy"'],
  ['title="Quản lý Kho bãi & Lưu trữ Thiết bị Công ty"', 'title="Kho bãi"'],
  ['<i className="fas fa-plus me-1"></i> Thêm mới Thiết bị', '<i className="fas fa-plus me-1"></i> Thêm thiết bị'],
]);

// 4. Contracts page src/app/(main)/contracts/page.tsx
replaceInFile('src/app/(main)/contracts/page.tsx', [
  ['QUẢN LÝ HỢP ĐỒNG CHO THUÊ &amp; BẢO TRÌ', 'Hợp đồng'],
  ['<i className="fas fa-plus me-1"></i> Thêm mới Hợp đồng', '<i className="fas fa-plus me-1"></i> Tạo hợp đồng'],
]);

// 5. Customers page src/app/(main)/customers/page.tsx
replaceInFile('src/app/(main)/customers/page.tsx', [
  ['<span>Khách hàng &amp; Máy dịch vụ</span>', '<span>Khách hàng</span>'],
  ['<i className="fas fa-plus me-1"></i> Thêm mới Khách hàng', '<i className="fas fa-plus me-1"></i> Thêm khách hàng'],
]);

// 6. Dispatch page src/app/(main)/dispatch/page.tsx
replaceInFile('src/app/(main)/dispatch/page.tsx', [
  ['<span>Bảng Điều phối Kỹ thuật viên Thông minh</span>', '<span>Điều phối kỹ thuật</span>'],
  ['1. Chọn Phiếu kỹ thuật cần điều phối', '1. Chọn phiếu điều phối'],
  ['2. Phân công Kỹ thuật viên (Gợi ý thông minh theo Vùng &amp; Tải)', '2. Chọn kỹ thuật viên phụ trách'],
]);

// 7. Inventory page src/app/(main)/inventory/page.tsx
replaceInFile('src/app/(main)/inventory/page.tsx', [
  ['QUẢN LÝ VẬT TƯ DỰ PHÒNG &amp; THẺ KHO FIFO', 'Kho linh kiện'],
  ['<i className="fas fa-boxes me-1"></i> Tồn kho &amp; Lô FIFO', '<i className="fas fa-boxes me-1"></i> Tồn kho'],
  ['<i className="fas fa-history me-1"></i> Sổ cái biến động kho (Thẻ kho)', '<i className="fas fa-history me-1"></i> Thẻ kho'],
  ['<i className="fas fa-plus me-1"></i> Thêm linh kiện mới', '<i className="fas fa-plus me-1"></i> Thêm linh kiện'],
  ['<i className="fas fa-truck-loading me-1"></i> Nhập lô hàng mới (FIFO)', '<i className="fas fa-truck-loading me-1"></i> Nhập kho'],
]);

// 8. Stock Issues page src/app/(main)/stock-issues/page.tsx
replaceInFile('src/app/(main)/stock-issues/page.tsx', [
  ['PHIẾU XUẤT / HOÀN TRẢ KHO &amp; PHÊ DUYỆT FIFO', 'Xuất nhập kho'],
  ['<i className="fas fa-plus me-1"></i> Lập phiếu xuất / trả kho', '<i className="fas fa-plus me-1"></i> Lập phiếu xuất kho'],
]);

// 9. Finance Invoices page src/app/(main)/finance/invoices/page.tsx
replaceInFile('src/app/(main)/finance/invoices/page.tsx', [
  ['<span>Chốt Counter & Bảng kê Hóa đơn Tự động</span>', '<span>Hóa đơn cước</span>'],
  ['<i className="fas fa-receipt me-1"></i> Danh sách Bảng kê Hóa đơn', '<i className="fas fa-receipt me-1"></i> Hóa đơn'],
  ['<i className="fas fa-tachometer-alt me-1"></i> Nhật ký Counter Máy (Meter Logs)', '<i className="fas fa-tachometer-alt me-1"></i> Nhật ký Counter'],
  ['<i className="fas fa-magic me-1"></i> Tự động Tính cước &amp; Lập Hóa đơn', '<i className="fas fa-calculator me-1"></i> Lập hóa đơn cước'],
]);

// 10. Maintenance page src/app/(main)/maintenance/page.tsx
replaceInFile('src/app/(main)/maintenance/page.tsx', [
  ['<span>Kế hoạch Bảo trì & Bảo dưỡng Định kỳ</span>', '<span>Bảo trì định kỳ</span>'],
  ['<i className="fas fa-plus me-1"></i> Lên lịch bảo trì', '<i className="fas fa-plus me-1"></i> Tạo lịch bảo trì'],
]);

// 11. Reports page src/app/(main)/reports/page.tsx
replaceInFile('src/app/(main)/reports/page.tsx', [
  ['<span>Thống kê Tổng hợp & Phân tích Hiệu quả Vận hành</span>', '<span>Báo cáo tổng hợp</span>'],
]);

// 12. Admin Users page src/app/(main)/admin/page.tsx
replaceInFile('src/app/(main)/admin/page.tsx', [
  ['QUẢN LÝ TÀI KHOẢN &amp; PHÂN QUYỀN', 'Tài khoản người dùng'],
  ['<i className="fas fa-user-plus me-1"></i> Thêm người dùng mới', '<i className="fas fa-user-plus me-1"></i> Thêm người dùng'],
]);

// 13. Audit logs page src/app/(main)/admin/audit-logs/page.tsx
replaceInFile('src/app/(main)/admin/audit-logs/page.tsx', [
  ['NHẬT KÝ THAO TÁC HỆ THỐNG (AUDIT LOG)', 'Nhật ký thao tác'],
]);

console.log('SIMPLIFICATION COMPLETE!');
