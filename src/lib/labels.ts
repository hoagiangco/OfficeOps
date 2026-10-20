export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  FAULTY: "Lỗi / Cần bảo trì",
  WAITING_PARTS: "Chờ linh kiện",
  RECALLED: "Đã thu hồi",
  IN_STOCK: "Trong kho",
  SCRAPPED: "Thanh lý",
};

export const TICKET_TYPE_LABELS: Record<string, string> = {
  INSTALLATION: "Lắp mới",
  INSPECTION: "Kiểm tra",
  REPAIR: "Sửa chữa",
  MAINTENANCE: "Bảo trì định kỳ",
  OTHER: "Khác",
};

export const TICKET_STATUS_LABELS: Record<string, string> = {
  PENDING: "Chờ điều phối",
  ASSIGNED: "Đã giao KTV",
  IN_PROGRESS: "Đang xử lý",
  WAITING_PARTS: "Chờ linh kiện",
  WAITING_CUSTOMER: "Chờ khách ký",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};

export const TICKET_PRIORITY_LABELS: Record<string, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
};

export const TICKET_SOURCE_LABELS: Record<string, string> = {
  CUSTOMER: "Khách báo",
  SCHEDULED: "Lịch định kỳ",
  INTERNAL: "Nội bộ",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi khách",
  PAID: "Đã thanh toán",
  OVERDUE: "Quá hạn",
  CANCELLED: "Đã hủy",
};

export const METER_SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Nhập tay",
  OCR: "Ảnh / OCR",
  TECH: "KTV chốt",
  CUSTOMER: "Khách gửi",
};

