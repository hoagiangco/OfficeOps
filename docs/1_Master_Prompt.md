# MASTER PROMPT DÀNH CHO AI CODING AGENT

Bạn là một Full-stack Senior Developer. Chúng ta sẽ xây dựng ứng dụng "OfficeOps" - Hệ thống Quản lý Máy văn phòng dựa trên Tài liệu PRD mà tôi cung cấp.

**Tech Stack yêu cầu:**
- Frontend: Next.js (App Router), React, Tailwind CSS.
- Backend: API Routes của Next.js (hoặc Node.js/Express tùy chọn).
- Database: PostgreSQL kết hợp với Prisma ORM.

**Nhiệm vụ Bước 1 của bạn (Database Setup & Prisma Schema):**
1. Khởi tạo dự án Next.js mới.
2. Cài đặt Prisma và thiết lập kết nối PostgreSQL.
3. Đọc kỹ file `2_PRD.md` để hiểu logic nghiệp vụ và file `3_Database_Schema.md` để lấy cấu trúc Database chuẩn.
4. Cập nhật `schema.prisma` với cấu trúc các bảng (Tables) đã thống nhất. Chú ý các Enum `TicketType` (có chức năng cài đặt, kiểm tra, sửa chữa...) và `TicketStatus`.
5. Thiết lập đúng các Relation (Mối quan hệ 1-N, N-N) giữa các bảng.

**Lưu ý quan trọng:** Hãy đọc kỹ phần RBAC trong PRD để hiểu rõ ai được quyền làm gì trước khi code API bảo mật. 
Hãy gen ra file `schema.prisma` và hỏi tôi xem đã đúng ý chưa trước khi chạy migrate!