# TÀI LIỆU YÊU CẦU SẢN PHẨM (PRD)
# Hệ Thống Quản Lý Máy Văn Phòng & Dịch Vụ Kỹ Thuật Tập Trung

## 1. TỔNG QUAN SẢN PHẨM
### 1.1 Mục đích
Hệ thống Quản lý Máy văn phòng được xây dựng nhằm tối ưu hóa toàn bộ quy trình vận hành dịch vụ cho thuê, bảo trì và sửa chữa thiết bị văn phòng (máy in, máy photocopy, máy quét...). Hệ thống giải quyết các bài toán về theo dõi tình trạng máy, tự động hóa tính phí thuê theo số bản in (counter Meter), quản lý tồn kho linh kiện chính xác và điều phối kỹ thuật viên tức thời.

### 1.2 Mục tiêu chiến lược
- Giảm 40% thời gian xử lý sự cố từ khi khách hàng báo lỗi đến khi kỹ thuật hoàn thành.
- Tự động hóa 90% quy trình chốt số Counter và xuất hóa đơn dịch vụ hàng tháng.
- Kiểm soát chính xác 100% lịch sử vòng đời thiết bị và tình trạng xuất-nhập-tồn kho vật tư.
- Phân quyền chặt chẽ (RBAC) đảm bảo tính bảo mật dữ liệu tài chính và vận hành.

## 2. DANH SÁCH MODULE CỐT LÕI
### 2.1 Module Hồ Sơ Thiết Bị (Asset Dossier & Lifecycle)
- **Quản lý Định danh:** Mỗi máy được gán một mã QR Code/BarCode duy nhất và Serial Number để truy xuất nhanh.
- **Theo dõi Vòng đời:** Ghi nhận toàn bộ thông tin từ khi nhập kho, bán/cho thuê, lịch sử bảo trì, thay thế linh kiện, đến khi thanh lý.
- **Thông số Kỹ thuật & Vị trí:** Lưu trữ cấu hình, dòng máy, hợp đồng sở hữu, vị trí lắp đặt thực tế tại văn phòng khách hàng (Chi nhánh -> Tòa nhà -> Phòng ban).

### 2.2 Module Quản Lý Thiết Bị & Hợp Đồng (Equipment & Contract)
- **Quản lý Hợp đồng cho thuê/bảo trì:** Lưu trữ giá thuê cố định, đơn giá bản in/chụp vượt định mức, thời hạn hợp đồng, lịch bảo dưỡng định kỳ.
- **Theo dõi Tình trạng vận hành:** Trạng thái máy (Đang hoạt động, Lỗi/Cần bảo trì, Đang chờ linh kiện, Đã thu hồi).

### 2.3 Module Kho Thông Minh (Smart Inventory)
- **Quản lý Linh kiện & Vật tư:** Phân loại linh kiện theo mã, dòng máy tương thích, cảnh báo ngưỡng tồn kho tối thiểu.
- **Nghiệp vụ Kho:** Nhập kho, xuất kho kỹ thuật (để đi sửa chữa), xuất kho bán lẻ, hoàn trả linh kiện cũ/hỏng. Cấp mã Lô (Batch) để xuất kho theo FIFO.
- **Đồng bộ Thời gian thực:** Tự động trừ tồn kho ngay khi phiếu xuất kho được phê duyệt hoặc kỹ thuật viên xác nhận thay thế linh kiện trên mobile.

### 2.4 Module Điều Phối Kỹ Thuật (Dispatch & Field Service)
- **Tạo & Tiếp nhận Phiếu Yêu cầu (Ticket):** Tạo phiếu tự động từ yêu cầu của khách hàng hoặc lịch bảo trì định kỳ. Phân loại Ticket: Lắp mới, Kiểm tra, Sửa chữa, Bảo trì.
- **Điều phối Thông minh:** Giao việc cho Kỹ thuật viên dựa trên khu vực địa lý, tải công việc hiện tại và trình độ chuyên môn.
- **Cập nhật Field Tech:** Kỹ thuật viên nhận ticket trên ứng dụng, check-in địa điểm, ghi nhận số Counter, chụp ảnh biên bản và báo cáo linh kiện đã thay.

### 2.5 Module Tự Động Hóa Thanh Toán (Billing Automation)
- **Ghi nhận Số Meter/Counter:** Hỗ trợ nhập tay số bản in/chụp hoặc quét ảnh số Counter (OCR) do Kỹ thuật viên/Khách hàng cung cấp.
- **Tính toán Cước phí Tự động:** Áp công thức tính cước dựa trên hợp đồng.
- **Tạo Bảng kê & Hóa đơn:** Tự động xuất bảng kê chi tiết và gửi thông báo thanh toán cho khách hàng qua Email/Zalo.

## 3. QUẢN LÝ PHÂN QUYỀN TRUY CẬP (RBAC - ROLE-BASED ACCESS CONTROL)
### 3.1 Mô tả Vai trò (Roles)
1. **Giám đốc (Super Admin):** Quản trị toàn bộ hệ thống, xem báo cáo doanh thu, chi phí, lợi nhuận và phê duyệt chính sách.
2. **Kế toán (Admin):** Quản lý tài chính, hợp đồng, số liệu thanh toán, duyệt xuất kho bán hàng/thay thế và theo dõi công nợ.
3. **Điều phối viên / Thủ kho (Dispatcher / Warehouse):** Quản lý tồn kho thực tế, tiếp nhận yêu cầu sự cố, điều phối kỹ thuật viên và duyệt phiếu xuất kho kỹ thuật.
4. **Kỹ thuật viên (Field Tech):** Tiếp nhận nhiệm vụ được giao, thực hiện xử lý tại hiện trường, lập đề xuất linh kiện và cập nhật trạng thái phiếu.

### 3.2 Ma trận Phân quyền Chức năng
| Chức năng / Hành động | Giám đốc | Kế toán | Điều phối / Thủ kho | Kỹ thuật viên |
| :--- | :--- | :--- | :--- | :--- |
| **Xem Báo cáo Tài chính** | Toàn quyền | Xem & Xuất file | Không | Không |
| **Tạo Phiếu Sửa chữa/Bảo trì** | Có quyền | Có quyền | Chính | Phụ (Tạo ca phát sinh) |
| **Duyệt Phiếu Xuất kho** | Có quyền | Có quyền | Chính | Không |
| **Cập nhật Phiếu Yêu cầu** | Có quyền | Cập nhật thanh toán | Cập nhật & Điều phối | Cập nhật tiến độ |
| **Xem Hồ sơ Thiết bị** | Toàn bộ | Thông tin & Hợp đồng | Thông tin & Vị trí | Lịch sử sửa chữa |

## 4. QUY TRÌNH PHỐI HỢP XỬ LÝ SỰ CỐ & THAY THẾ LINH KIỆN
1. **Tiếp nhận & Tạo phiếu:** Điều phối viên nhận báo lỗi -> Tạo Phiếu sửa chữa -> Giao việc cho Kỹ thuật viên.
2. **Khảo sát & Đề xuất:** Kỹ thuật viên kiểm tra máy -> Cập nhật tình trạng -> Tạo Yêu cầu xuất linh kiện trên app.
3. **Xuất kho & Xác nhận:** Thủ kho kiểm tra tồn kho (FIFO) -> Duyệt phiếu xuất kho -> Kỹ thuật viên nhận linh kiện thay thế.
4. **Hoàn tất & Lưu hồ sơ:** Kỹ thuật viên ghi nhận số Counter mới, chụp ảnh -> Khách hàng ký trên App -> Đóng phiếu. Hệ thống tự động lưu lịch sử và trừ tồn kho.
5. **Thanh toán:** Kế toán kiểm tra chi phí phát sinh -> Xác nhận chu kỳ thanh toán.

---
# PHỤ LỤC V2 – RÀ SOÁT, SỬA LỖI & BỔ SUNG

## 5. LỖI / THIẾU SÓT ĐÃ PHÁT HIỆN VÀ CÁCH XỬ LÝ
| # | Vấn đề | Xử lý |
| :-- | :--- | :--- |
| 1 | Schema v1 bị cắt dở ở `PartReplacement.quantity` | Hoàn thiện model |
| 2 | `role`, `status` dùng String, thiếu trạng thái "Chờ linh kiện/Thu hồi" | Chuyển sang enum, đủ 6 trạng thái thiết bị |
| 3 | Tiền tệ dùng Float (sai số làm tròn) | Dùng Decimal |
| 4 | `Part.stockQuantity` trùng `InventoryBatch.quantity` | Bỏ cột, tồn = tổng lô |
| 5 | Vị trí chỉ là chuỗi | Cấu trúc Branch → Building → Department |
| 6 | Thiếu phiếu xuất kho/duyệt, hóa đơn, lịch bảo trì, file đính kèm, check-in GPS, chữ ký | Thêm model tương ứng |
| 7 | Ma trận RBAC thiếu nhiều chức năng | Mở rộng ở mục 7 |
| 8 | Ticket thiếu trạng thái chờ duyệt linh kiện / chờ khách ký | Bổ sung `WAITING_PARTS`, `WAITING_CUSTOMER` |

## 6. MODULE & CHỨC NĂNG BỔ SUNG
### 6.1 Xác thực & Quản trị người dùng
Đăng nhập JWT/session, đổi/quên mật khẩu, quản lý user, khóa tài khoản, nhật ký hoạt động (AuditLog).
### 6.2 Quản lý Khách hàng
CRUD khách hàng, chi nhánh/tòa nhà/phòng ban, người liên hệ, công nợ theo khách.
### 6.3 Lịch Bảo trì Định kỳ
Job nền (cron) quét `MaintenanceSchedule`, tự tạo Ticket loại MAINTENANCE trước hạn N ngày.
### 6.4 Quy tắc Nghiệp vụ (chốt)
- **Cước tháng** = `basePrice` + Σ theo từng máy `max(0, usage − quota) × overagePrice`, với `usage` = counter cuối kỳ − counter đầu kỳ của máy đó. `quota` = `Equipment.baseQuota` (nếu null thì lấy `Contract.baseQuota`); `overagePrice` tương tự. *(Đã xác nhận: tính theo từng máy.)*
- **Kênh thông báo:** Email + in-app ở giai đoạn đầu; Zalo (OA/ZNS) làm sau. **Hóa đơn:** chỉ bảng kê/hóa đơn nội bộ (PDF), chưa tích hợp hóa đơn điện tử. **Counter:** nhập tay kèm ảnh, OCR làm sau; app kỹ thuật viên là PWA.
- Counter mới phải ≥ counter hiện tại; nhập sai phải qua duyệt điều chỉnh.
- **FIFO:** xuất theo lô có `receivedDate` cũ nhất; trừ kho trong transaction, ghi `StockMovement`; không cho tồn âm.
- Tồn ≤ `minThreshold` → tạo Notification cho Thủ kho.
- **Điều phối gợi ý:** lọc kỹ thuật viên theo `region`, `skills`, rồi chọn người có ít ticket đang mở nhất.
- **SLA:** mỗi ticket có `slaDueAt` theo ưu tiên; quá hạn → cảnh báo.
- Đóng ticket yêu cầu: counter, ảnh biên bản, chữ ký khách.
- Hóa đơn: DRAFT → Kế toán duyệt → SENT (Email/Zalo) → PAID/OVERDUE.
### 6.5 Dashboard & Báo cáo
- Giám đốc: doanh thu, chi phí linh kiện, lợi nhuận theo hợp đồng/khách hàng.
- Điều phối: ticket theo trạng thái, SLA, tải kỹ thuật viên.
- Kho: tồn thấp, nhập-xuất-tồn theo kỳ.
- Xuất Excel/PDF.
### 6.6 Thông báo
In-app, Email, Zalo (ticket mới, duyệt phiếu, hóa đơn, tồn thấp, sắp hết hạn hợp đồng).
### 6.7 Ứng dụng Mobile (PWA) cho Kỹ thuật viên
Danh sách ticket được giao, quét QR máy, check-in GPS, chụp ảnh, nhập/OCR counter, đề xuất linh kiện, ký xác nhận (có thể offline-first ở giai đoạn sau).
### 6.8 Yêu cầu Phi chức năng
Mã hóa mật khẩu bcrypt, HTTPS, validate đầu vào (zod), phân trang & index, backup DB hằng ngày, audit các thao tác tài chính/kho, giao diện responsive.

## 7. MA TRẬN PHÂN QUYỀN MỞ RỘNG
| Chức năng | Giám đốc | Kế toán | Điều phối/Thủ kho | Kỹ thuật viên |
| :--- | :--- | :--- | :--- | :--- |
| Quản lý user & phân quyền | Toàn quyền | Không | Không | Không |
| CRUD khách hàng | Có | Có | Xem + sửa liên hệ | Xem khách của ticket mình |
| CRUD hợp đồng | Có | Có | Xem | Không |
| CRUD thiết bị | Có | Xem | Có | Xem thiết bị trong ticket |
| Giao việc / điều phối | Có | Không | Chính | Không |
| Đề xuất linh kiện | – | – | Có | Có |
| Duyệt xuất kho kỹ thuật | Có | Có | Chính | Không |
| Duyệt xuất kho bán lẻ | Có | Chính | Có | Không |
| Nhập kho / kiểm kê | Có | Xem | Chính | Không |
| Ghi counter | Có | Có | Có | Có (ticket của mình) |
| Duyệt & gửi hóa đơn | Có | Chính | Không | Không |
| Báo cáo tài chính | Toàn quyền | Xem & xuất | Không | Không |
| Xem AuditLog | Có | Không | Không | Không |

## 8. LỘ TRÌNH TRIỂN KHAI
1. **Nền tảng:** Next.js + Prisma + PostgreSQL, schema v2, seed dữ liệu.
2. **Auth & RBAC** (middleware kiểm tra role theo route/API).
3. **Danh mục:** khách hàng, hợp đồng, thiết bị, QR.
4. **Ticket & điều phối** + log trạng thái.
5. **Kho:** nhập, lô FIFO, phiếu xuất & duyệt, sổ cái.
6. **Meter & Billing:** ghi counter, tính cước, hóa đơn, gửi thông báo.
7. **Mobile PWA** cho kỹ thuật viên.
8. **Dashboard, báo cáo, cron, hoàn thiện & kiểm thử.**
