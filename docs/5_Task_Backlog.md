# BACKLOG CÔNG VIỆC – OFFICEOPS (cập nhật 25/10/2026)

Nguồn: đối chiếu `2_PRD.md` với code hiện tại. Mỗi việc đủ nhỏ để giao cho 1 người, có tiêu chí nghiệm thu riêng.

**Quy ước:** Ước lượng S = ≤0,5 ngày, M = 1–2 ngày, L = 3–5 ngày. Vai trò: BE = backend/API, FE = giao diện, FS = full-stack, OPS = vận hành/hạ tầng.

## Bảng tổng hợp

| ID | Việc | Vai trò | Ước lượng | Phụ thuộc | Ưu tiên |
| :-- | :--- | :-- | :-: | :-- | :-: |
| A1 | Đổi mật khẩu | FS | S | – | P0 |
| A2 | Giới hạn đăng nhập sai | BE | M | – | P0 |
| A3 | Bỏ `CRON_SECRET` mặc định trong code | BE | S | – | P0 |
| A4 | Chống spam cổng QR công khai | BE | M | – | P0 |
| A5 | Backup DB hằng ngày | OPS | S | – | P0 |
| A6 | Migration baseline cho schema hiện tại | BE | S | – | P0 |
| A7 | Commit, dọn `.gitignore` | OPS | S | – | P0 |
| B1 | Hạ tầng gửi email (SMTP) | BE | M | – | P1 |
| B2 | Mẫu email HTML | FE | S | B1 | P1 |
| B3 | Gửi email hóa đơn khi chuyển `SENT` | BE | M | B1, B2 | P1 |
| B4 | Gửi biên bản nghiệm thu khi đóng phiếu | BE | S | B1, B2 | P1 |
| B5 | Email báo KTV khi được giao phiếu | BE | S | B1, B2 | P1 |
| B6 | Quên mật khẩu qua email | FS | M | A1, B1 | P1 |
| C1 | Báo cáo nhập-xuất-tồn theo kỳ | FS | M | – | P2 |
| C2 | Biểu đồ trong báo cáo | FE | M | – | P2 |
| C3 | Xuất Excel `.xlsx` | FS | S | – | P2 |
| C4 | Xuất PDF thật | FS | M | – | P2 |
| D1 | Service worker (cache shell) | FE | M | – | P2 |
| D2 | Hàng đợi offline cho `/tech` | FE | L | D1 | P3 |
| D3 | Duyệt điều chỉnh counter | FS | M | – | P2 |
| E1 | Bản đồ điều phối | FE | M | – | P3 |
| E2 | OCR đọc counter từ ảnh | FS | L | – | P3 |
| E3 | Zalo OA/ZNS | BE | L | B1 (tham khảo) | P3 |

Thứ tự gợi ý: nhóm A làm trước (song song được), rồi B, rồi C và D.

---

## Nhóm A – Bảo mật và vận hành (P0)

### A1. Đổi mật khẩu
- **Mục tiêu:** người dùng tự đổi mật khẩu, thay mật khẩu mặc định `Office@123`.
- **Làm:** `POST /api/auth/change-password` (zod: mật khẩu cũ, mới ≥ 8 ký tự, có chữ và số), kiểm tra bcrypt mật khẩu cũ, ghi `AuditLog`. Thêm mục "Đổi mật khẩu" ở menu người dùng trong `SidebarLayout.tsx` và ở tab Cá nhân của `/tech`.
- **Nghiệm thu:** đổi đúng thì đăng nhập lại bằng mật khẩu mới được; sai mật khẩu cũ trả 400; mật khẩu mới trùng mật khẩu cũ bị từ chối.

### A2. Giới hạn đăng nhập sai
- **Làm:** sau 5 lần sai liên tiếp trong 15 phút (theo email + IP) thì khóa tạm 15 phút. Lưu bằng bảng mới `LoginAttempt` (cần migration) hoặc bộ nhớ nếu chỉ chạy 1 instance (ghi rõ lựa chọn). Sửa `src/app/api/auth/login/route.ts`.
- **Nghiệm thu:** lần sai thứ 6 trả 429 kèm thời gian chờ; đăng nhập đúng sau khi hết thời gian khóa thì vào được; thông báo lỗi không tiết lộ email có tồn tại hay không.

### A3. Bỏ `CRON_SECRET` mặc định trong code
- **Vấn đề:** `src/app/api/cron/daily/route.ts` đang có giá trị dự phòng `"officeops-cron-secret-key-2026"`, ai đọc code đều biết.
- **Làm:** bỏ giá trị dự phòng; thiếu biến môi trường thì chỉ cho phép gọi bằng phiên đăng nhập. Đổi secret trong `.env` sang chuỗi ngẫu nhiên dài. Thêm `CRON_SECRET` vào `.env.example`.
- **Nghiệm thu:** không có secret thì gọi bằng Bearer luôn trả 401; secret cũ không còn dùng được.

### A4. Chống spam cổng QR công khai
- **Vấn đề:** `POST /api/scan/[code]` và `POST /api/scan/upload` mở công khai, không giới hạn.
- **Làm:** giới hạn theo IP (ví dụ 5 yêu cầu/giờ/máy, 10 ảnh/giờ); kiểm tra nội dung file thật (magic bytes) thay vì chỉ đuôi file; từ chối tạo thêm phiếu nếu máy đã có phiếu `PENDING` trong 10 phút gần nhất.
- **Nghiệm thu:** gửi liên tiếp vượt ngưỡng trả 429; file `.jpg` thực chất là file khác bị từ chối; ca gửi bình thường vẫn thành công.

### A5. Backup DB hằng ngày
- **Làm:** script `scripts/backup-db.ps1` chạy `pg_dump`, lưu `E:\Backup\officeops\officeops-YYYYMMDD.sql`, giữ 14 ngày; đăng ký Task Scheduler 02:00; viết `docs/backup-restore.md` (có bước restore thử).
- **Nghiệm thu:** chạy tay ra file; xóa file quá 14 ngày; restore thử vào DB tạm thành công và đếm bản ghi khớp.

### A6. Migration baseline
- **Vấn đề:** `prisma/migrations` chỉ có `init` (20/10) trong khi schema đã có 32 model.
- **Làm:** sinh migration bù từ chênh lệch (`prisma migrate diff`), đánh dấu đã áp dụng cho DB hiện tại (`prisma migrate resolve --applied`), kiểm tra bằng `prisma migrate status`. Sao lưu DB trước khi làm (cần A5).
- **Nghiệm thu:** `migrate status` báo đồng bộ; tạo DB trống rồi `migrate deploy` + `db seed` chạy được ứng dụng.

### A7. Commit và dọn repo
- **Làm:** xác nhận `.env`, `public/uploads/`, `.next/`, `tsconfig.tsbuildinfo` nằm trong `.gitignore`; chia commit theo nhóm (schema và seed; API; giao diện; PWA và in ấn); không commit mật khẩu hay token.
- **Nghiệm thu:** `git status` sạch; `git log` có các commit rõ nghĩa; tìm trong repo không thấy chuỗi mật khẩu DB hay token Cloudflare.

---

## Nhóm B – Email thật (P1)

### B1. Hạ tầng gửi email
- **Làm:** cài `nodemailer`; `src/lib/mailer.ts` đọc `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`; hàm `sendMail({ to, subject, html, attachments })` có thử lại tối đa 3 lần và ghi `Notification` (channel `EMAIL`, `sentAt`); endpoint kiểm tra cho SUPER_ADMIN `POST /api/admin/mail-test`.
- **Nghiệm thu:** gửi thử thành công qua Gmail App Password; lỗi SMTP không làm sập luồng nghiệp vụ (chỉ ghi log); thiếu cấu hình thì bỏ qua và báo rõ trong log.

### B2. Mẫu email HTML
- **Làm:** `src/lib/mail-templates.ts` gồm 3 mẫu: hóa đơn cước, biên bản nghiệm thu, phiếu mới giao KTV. Dùng bảng và CSS inline, tiếng Việt có dấu, hiển thị tốt trên Gmail điện thoại.
- **Nghiệm thu:** xem thử trên Gmail web và app; không vỡ bố cục; có liên kết xem bảng kê.

### B3. Gửi email hóa đơn khi chuyển `SENT`
- **Làm:** trong `PATCH /api/invoices/[id]`, khi trạng thái thành `SENT` thì gửi đến `customer.email` kèm tổng tiền, hạn thanh toán, mã VietQR. Nếu khách chưa có email thì báo lại cho người bấm gửi.
- **Nghiệm thu:** khách có email nhận được thư; không có email thì hóa đơn vẫn chuyển `SENT` nhưng giao diện hiện cảnh báo; có ghi `AuditLog`.

### B4. Gửi biên bản nghiệm thu khi đóng phiếu
- **Làm:** khi ticket thành `COMPLETED` thì gửi email cho khách gồm tóm tắt, linh kiện đã thay, counter đóng, liên kết xem biên bản.
- **Nghiệm thu:** chỉ gửi một lần cho mỗi phiếu, kể cả khi bấm hoàn thành nhiều lần.

### B5. Email báo KTV có phiếu mới
- **Làm:** khi `action: ASSIGN` thành công thì gửi email cho KTV (nếu có) kèm mã phiếu, địa chỉ, mô tả, liên kết `/tech`.
- **Nghiệm thu:** giao lại cho KTV khác thì chỉ KTV mới nhận thư.

### B6. Quên mật khẩu
- **Làm:** `POST /api/auth/forgot-password` (luôn trả thông báo chung), token một lần hết hạn sau 30 phút (lưu băm trong bảng mới, cần migration), trang `/reset-password?token=`, link "Quên mật khẩu?" ở `/login`.
- **Nghiệm thu:** token dùng được một lần; hết hạn bị từ chối; đặt lại xong thì mọi phiên cũ không còn hiệu lực hoặc yêu cầu đăng nhập lại.

---

## Nhóm C – Báo cáo (P2)

### C1. Báo cáo nhập-xuất-tồn theo kỳ
- **Làm:** `GET /api/reports/stock?from=&to=` tính tồn đầu kỳ, tổng nhập, tổng xuất, tồn cuối kỳ cho từng linh kiện từ `StockMovement`; trang `/reports/stock` có bộ lọc kỳ, tổng giá trị theo `costPrice`, xuất CSV. Quyền: SUPER_ADMIN, ADMIN, DISPATCHER.
- **Nghiệm thu:** tồn cuối kỳ khớp tổng tồn các lô hiện tại khi kỳ kết thúc ở hôm nay; số liệu trùng với thẻ kho.

### C2. Biểu đồ trong báo cáo
- **Làm:** thêm thư viện biểu đồ (đề xuất `recharts`); 3 biểu đồ trên `/reports`: doanh thu theo tháng (6 tháng gần nhất), phiếu theo trạng thái, top linh kiện tiêu thụ. Mở rộng `api/reports/summary`.
- **Nghiệm thu:** hiển thị tốt trên điện thoại; không có dữ liệu thì hiện trạng thái trống thay vì lỗi.

### C3. Xuất Excel `.xlsx`
- **Làm:** thay `exportToCsv` bằng bản `.xlsx` (đề xuất `exceljs` hoặc `xlsx`) cho các danh sách chính; giữ CSV làm lựa chọn phụ.
- **Nghiệm thu:** mở bằng Excel không lỗi font tiếng Việt; số và ngày đúng định dạng.

### C4. Xuất PDF thật
- **Quyết định cần chốt trước khi làm:** (a) PDF phía trình duyệt bằng `jsPDF`/`html2pdf` (nhẹ, chất lượng vừa); (b) PDF phía server bằng Puppeteer/Chromium (chất lượng cao, nặng hơn khi triển khai).
- **Làm:** nút "Tải PDF" cho bảng kê hóa đơn và biên bản nghiệm thu, tái dùng trang in A4 hiện có.
- **Nghiệm thu:** PDF đúng khổ A4, đủ dấu tiếng Việt, có mã VietQR; dùng được làm file đính kèm cho B3 và B4.

---

## Nhóm D – Di động và Counter (P2–P3)

### D1. Service worker (cache shell)
- **Làm:** service worker cho phạm vi `/tech`: cache giao diện và icon, trang dự phòng khi mất mạng; không cache API. Chuyển icon sang PNG 192 và 512 để Android/iOS nhận cài đặt ổn định.
- **Nghiệm thu:** tắt mạng vẫn mở được `/tech` (hiện thông báo "Đang offline"); bật mạng thì tự làm mới.

### D2. Hàng đợi offline cho `/tech`
- **Làm:** lưu thao tác check-in, ghi counter, ảnh vào IndexedDB khi mất mạng, tự gửi lại khi có mạng; hiển thị số mục đang chờ; xử lý xung đột (phiếu đã đóng, counter nhỏ hơn hiện tại).
- **Nghiệm thu:** check-in và chụp ảnh khi offline, bật mạng lại thì dữ liệu lên đủ, không trùng lặp.

### D3. Duyệt điều chỉnh counter
- **Làm:** thêm trạng thái chờ duyệt cho bản ghi counter nhỏ hơn giá trị hiện tại (kèm lý do và ảnh); Kế toán/Giám đốc duyệt hoặc từ chối; chỉ khi duyệt mới cập nhật `Equipment.currentCounter`; ghi `AuditLog`. Cần migration. Mở rộng `api/meters`.
- **Nghiệm thu:** KTV không tự hạ counter được; sau khi duyệt, hóa đơn kỳ sau tính đúng theo giá trị mới.

---

## Nhóm E – Giai đoạn sau (P3)

### E1. Bản đồ điều phối
- Tái dùng Leaflet đã có trong `LocationPickerModal`; ghim ca đang mở (màu theo ưu tiên) và vị trí check-in gần nhất của KTV tại `/dispatch`. Cần tọa độ khách hàng (`Branch.latitude/longitude`). Nghiệm thu: chọn ca trên bản đồ thì gợi ý KTV theo khoảng cách.

### E2. OCR đọc counter
- Nhận số từ ảnh đồng hồ khi KTV chụp; luôn cho sửa tay trước khi lưu và đánh dấu nguồn `OCR` (đã có enum `MeterSource`). Nghiệm thu: đo độ chính xác trên bộ ảnh mẫu thật (≥ 90%) trước khi bật mặc định.

### E3. Zalo OA/ZNS
- Gửi thông báo hóa đơn và phiếu qua Zalo. Cần tài khoản OA, duyệt mẫu ZNS từ phía Zalo; chưa thể làm trước khi có thông tin này.

---

## Việc cần bạn quyết định trước khi giao

1. Dịch vụ SMTP dùng gì (Gmail App Password, hay Resend/SendGrid)? Ảnh hưởng B1.
2. Chọn cách xuất PDF (a hay b ở C4).
3. Có cần nhiều instance server không? Nếu có thì A2 phải lưu rate limit vào DB, không dùng bộ nhớ.
4. Thông tin ngân hàng và công ty trên mẫu in hiện là dữ liệu mẫu (STK, MST, địa chỉ, hotline); cần thay bằng thông tin thật, tốt nhất đưa vào cấu hình thay vì viết cứng trong `print/page.tsx`.
