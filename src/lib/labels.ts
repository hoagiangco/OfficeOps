export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang hoạt động",
  FAULTY: "Lỗi / Cần bảo trì",
  WAITING_PARTS: "Chờ linh kiện",
  RECALLED: "Đã thu hồi",
  IN_STOCK: "Trong kho",
  SCRAPPED: "Thanh lý",
};

export const DEFAULT_EQUIPMENT_BRANDS = [
  "Ricoh",
  "Canon",
  "Toshiba",
  "Xerox",
  "HP",
  "Brother",
  "Konica Minolta",
  "Sharp",
  "Epson",
  "Kyocera",
];

export const DEFAULT_EQUIPMENT_TYPES = [
  "Máy Photocopy",
  "Máy in Laser",
  "Máy in màu",
  "Máy Scan",
  "Máy đa chức năng (MFP)",
  "Máy hủy tài liệu",
  "Thiết bị phụ trợ",
];

export const DEFAULT_EQUIPMENT_GROUPS = [
  "Máy văn phòng",
  "Máy tốc độ cao",
  "Máy công nghiệp",
  "Máy màu chuyên dụng",
  "Máy nhỏ gọn (Desktop)",
  "Máy dự phòng kho",
];

export const DEFAULT_EQUIPMENT_RELATIONS = [
  "Sẵn hàng",
  "Cho thuê",
  "Bảo trì định kỳ",
  "Sửa chữa dịch vụ",
  "Bảo hành máy bán",
  "Cho mượn / Dùng thử",
];

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

export const STOCK_MOVEMENT_TYPE_LABELS: Record<
  string,
  { label: string; badgeClass: string; sign: string }
> = {
  IN: { label: "Nhập kho (Lô mới)", badgeClass: "bg-success", sign: "+" },
  OUT: { label: "Xuất kho kỹ thuật", badgeClass: "bg-danger", sign: "-" },
  RETURN: { label: "Hoàn trả linh kiện", badgeClass: "bg-info text-dark", sign: "+" },
  ADJUST: { label: "Điều chỉnh kiểm kê", badgeClass: "bg-warning text-dark", sign: "±" },
};

export const TICKET_ATTACHMENT_KIND_LABELS: Record<
  string,
  { label: string; icon: string; badgeClass: string }
> = {
  PHOTO: { label: "Ảnh chụp thực tế", icon: "fas fa-camera", badgeClass: "bg-primary" },
  COUNTER_PHOTO: { label: "Ảnh chỉ số Counter", icon: "fas fa-tachometer-alt", badgeClass: "bg-warning text-dark" },
  REPORT: { label: "Biên bản sửa chữa / nghiệm thu", icon: "fas fa-file-signature", badgeClass: "bg-success" },
  OTHER: { label: "Tài liệu khác", icon: "fas fa-paperclip", badgeClass: "bg-secondary" },
};



