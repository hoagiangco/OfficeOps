# HƯỚNG DẪN PHONG CÁCH UX/UI – OfficeOps

> Trạng thái: **DRAFT chờ xác nhận.** Ghi nhận theo lựa chọn của chủ dự án.
> ⚠ Câu 1 ("demo mẫu 2ERP") được hiểu là **phong cách ERP / công cụ nội bộ dày đặc thông tin**. Cần xác nhận nếu có mẫu tham chiếu cụ thể (tên hệ thống, ảnh chụp).

## 1. Quyết định đã chốt
| Hạng mục | Quyết định |
| :--- | :--- |
| Phong cách tổng thể | ERP / công cụ nội bộ: dày thông tin, bảng gọn, ít trang trí |
| Màu chủ đạo | Xanh dương |
| Chế độ sáng/tối | Sáng mặc định, có nút chuyển sang tối (lưu theo người dùng) |
| Điều hướng desktop | Sidebar dọc bên trái, thu gọn được |
| Kỹ thuật viên (mobile) | Giao diện riêng mobile-first: nút lớn, thanh điều hướng dưới đáy, quét QR nổi bật |
| Thư viện thành phần | shadcn/ui + Tailwind (mã nằm trong dự án) |
| Ngôn ngữ | Chỉ tiếng Việt |

## 2. Nguyên tắc thiết kế (áp dụng cho kiểu ERP)
- **Mật độ cao nhưng đọc được:** hàng bảng cao ~36px, cỡ chữ 13–14px, khoảng cách nhỏ; ưu tiên hiển thị nhiều cột và lọc nhanh.
- **Bảng là thành phần chính:** header cố định, sắp xếp theo cột, lọc theo cột, phân trang, chọn cột hiển thị, xuất Excel.
- **Thao tác nhanh:** tìm kiếm toàn cục (Ctrl+K), phím tắt, thao tác hàng loạt, bộ lọc lưu sẵn.
- **Trạng thái bằng màu + nhãn chữ** (không chỉ dựa vào màu): dùng badge.
- **Nhất quán:** một mẫu cho danh sách → chi tiết → biểu mẫu trên mọi module.
- **Phân quyền thể hiện trên giao diện:** ẩn mục menu và nút không có quyền (API vẫn kiểm tra riêng).
- **Phản hồi rõ ràng:** toast cho thành công/lỗi, xác nhận khi thao tác không thể hoàn tác (thanh lý, hủy phiếu, duyệt xuất kho).
- **Trợ năng:** tương phản đạt WCAG AA, điều hướng bằng bàn phím, focus rõ.

## 3. Hệ thống thiết kế (design tokens – đề xuất)
### Màu
| Vai trò | Sáng | Tối |
| :--- | :--- | :--- |
| Primary (xanh dương) | `#2563EB` (blue-600) | `#3B82F6` |
| Primary hover | `#1D4ED8` | `#60A5FA` |
| Nền trang | `#F8FAFC` | `#0B1220` |
| Nền thẻ/bảng | `#FFFFFF` | `#111827` |
| Viền | `#E2E8F0` | `#1F2937` |
| Chữ chính / phụ | `#0F172A` / `#64748B` | `#E5E7EB` / `#94A3B8` |
| Thành công | `#16A34A` | `#22C55E` |
| Cảnh báo | `#D97706` | `#F59E0B` |
| Lỗi | `#DC2626` | `#EF4444` |

### Màu trạng thái nghiệp vụ
| Đối tượng | Giá trị → màu |
| :--- | :--- |
| Thiết bị | Hoạt động = xanh lá · Lỗi = đỏ · Chờ linh kiện = vàng · Thu hồi = xám · Trong kho = xanh dương nhạt · Thanh lý = xám đậm |
| Ticket | Chờ = xám · Đã giao = xanh dương · Đang xử lý = tím · Chờ linh kiện = vàng · Chờ khách ký = cam · Hoàn tất = xanh lá · Hủy = đỏ nhạt |
| Ưu tiên | Thấp = xám · Thường = xanh dương · Cao = cam · Khẩn = đỏ |

### Chữ, khoảng cách, bo góc
- Font: **Inter** (hỗ trợ tiếng Việt tốt); số liệu dùng `tabular-nums`.
- Cỡ chữ: 12 (chú thích) / 13–14 (nội dung, bảng) / 16 (tiêu đề phần) / 20–24 (tiêu đề trang).
- Bo góc 6px; đổ bóng rất nhẹ; dùng viền thay vì bóng đậm.
- Định dạng: ngày `dd/MM/yyyy HH:mm`, tiền `1.234.567 ₫`, số có dấu chấm ngăn cách nghìn.

## 4. Bố cục
### Desktop (≥ 1024px)
- **Sidebar trái** 240px, thu gọn còn 56px (chỉ biểu tượng), nhóm menu theo module, hiển thị theo vai trò.
- **Thanh trên:** tiêu đề trang / breadcrumb, tìm kiếm toàn cục, chuông thông báo, nút sáng-tối, menu người dùng.
- **Vùng nội dung:** tiêu đề + nút hành động chính góc phải → thanh lọc → bảng.
- Chi tiết bản ghi: tiêu đề + trạng thái + hành động, các tab (Thông tin · Lịch sử · Tài liệu…); form dài dùng drawer bên phải.

### Tablet (640–1024px)
Sidebar mặc định thu gọn; bảng cuộn ngang, cột ít quan trọng ẩn.

### Mobile cho Kỹ thuật viên (PWA, < 640px)
- Thanh điều hướng dưới đáy: **Việc của tôi · Quét QR (nút nổi, trung tâm) · Kho/Linh kiện · Cá nhân**.
- Danh sách ticket dạng thẻ; sắp xếp theo ưu tiên và hạn SLA; vuốt/chạm lớn (≥ 44px).
- Luồng xử lý từng bước: Nhận việc → Check-in GPS → Khảo sát → Đề xuất linh kiện → Ghi counter + ảnh → Khách ký → Hoàn tất.
- Quét QR mở ngay hồ sơ thiết bị và các thao tác nhanh (tạo ticket, ghi counter).
- Chịu mạng yếu: trạng thái tải, thử lại, lưu nháp biểu mẫu.

## 5. Điều hướng theo vai trò
| Vai trò | Menu chính |
| :--- | :--- |
| Giám đốc | Tổng quan · Khách hàng · Hợp đồng · Thiết bị · Ticket · Kho · Hóa đơn · Báo cáo · Quản trị |
| Kế toán | Tổng quan · Khách hàng · Hợp đồng · Thiết bị (xem) · Kho (duyệt xuất bán) · Hóa đơn · Báo cáo |
| Điều phối / Thủ kho | Tổng quan · Điều phối · Ticket · Thiết bị · Kho · Khách hàng (xem) |
| Kỹ thuật viên | Giao diện mobile riêng (mục 4) |

## 6. Thành phần shadcn/ui dự kiến dùng
Button, Input, Select, Combobox, Textarea, Checkbox, Switch, Form, Dialog, Sheet (drawer), Dropdown Menu, Tabs, Table (+ TanStack Table), Badge, Tooltip, Toast (Sonner), Command (Ctrl+K), Calendar/Date picker, Skeleton, Avatar, Breadcrumb.

## 7. Kế hoạch áp dụng
1. Cài shadcn/ui, thiết lập token màu và chế độ sáng/tối (next-themes), font Inter.
2. Dựng khung ứng dụng: sidebar + thanh trên, thay layout hiện tại.
3. Dựng thành phần dùng chung: `DataTable`, `PageHeader`, `StatusBadge`, `FormDrawer`.
4. Làm lại 3 trang danh mục (Khách hàng, Hợp đồng, Thiết bị) theo hệ thống mới.
5. Dựng khung mobile cho kỹ thuật viên (`/tech/*`) cùng Bước 4 (Ticket).
