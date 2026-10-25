import * as XLSX from "xlsx";

export interface CustomerImportRow {
  code: string;
  name: string;
  group: string;
  status: string;
  address: string;
  phone: string;
  taxCode: string;
  email: string;
  managerName: string;
  managerPhone: string;
  contactName: string;
  contactPhone: string;
  notes: string;
  isValid: boolean;
  errors: string[];
  isDuplicate?: boolean;
  duplicateScope?: "DB" | "FILE";
  duplicateReason?: string;
  matchType?: "taxCode" | "code" | "name" | "phone";
}

export const CUSTOMER_GROUPS_LIST = [
  "Khách thường",
  "Khách VIP",
  "Khách thuê máy",
  "Khách mua máy",
  "Khách bảo trì",
];

export const CUSTOMER_STATUS_MAP: Record<string, string> = {
  "active": "ACTIVE",
  "đang dùng": "ACTIVE",
  "dang dung": "ACTIVE",
  "hoạt động": "ACTIVE",
  "hoat dong": "ACTIVE",
  "suspended": "SUSPENDED",
  "tạm ngưng": "SUSPENDED",
  "tam ngung": "SUSPENDED",
  "tạm dừng": "SUSPENDED",
  "tam dung": "SUSPENDED",
  "terminated": "TERMINATED",
  "ngừng dv": "TERMINATED",
  "ngung dv": "TERMINATED",
  "ngừng dịch vụ": "TERMINATED",
  "ngung dich vu": "TERMINATED",
  "đã hủy": "TERMINATED",
  "da huy": "TERMINATED",
};

/**
 * Tải file Excel mẫu để nhập khách hàng
 */
export function downloadCustomerTemplate(customGroups?: string[]) {
  if (typeof window === "undefined") return;

  const headers = [
    "Mã khách hàng",
    "Tên khách hàng / Doanh nghiệp (*)",
    "Phân nhóm",
    "Trạng thái",
    "Địa chỉ chính (*)",
    "Số điện thoại liên hệ",
    "Mã số thuế",
    "Email",
    "Người quản lý",
    "SĐT quản lý",
    "Người liên hệ trực tiếp",
    "SĐT người liên hệ",
    "Ghi chú quản lý",
  ];

  const sampleData = [
    [
      "KH202601",
      "Công ty Cổ phần Công nghệ Sao Việt",
      "Khách thuê máy",
      "Đang dùng",
      "Tầng 5, Tòa nhà Landmark 81, P. 22, Bình Thạnh, TP.HCM",
      "02838123456",
      "0301234567",
      "info@saoviet.vn",
      "Nguyễn Văn An",
      "0901234567",
      "Lê Thị Bình",
      "0909876543",
      "Khách thuê 2 máy Photocopy Ricoh, kỳ thanh toán ngày 05 hàng tháng",
    ],
    [
      "", // Để trống mã KH để hệ thống tự sinh (VD: KH2026123456)
      "Ngân hàng Agribank Chi nhánh Bến Nhứt Kiên Giang II",
      "Khách mua máy",
      "Đang dùng",
      "Tổ 1, ấp Bến Nhứt, Xã Long Thạnh, Huyện Giồng Riềng, Tỉnh Kiên Giang",
      "", // SĐT để trống minh họa trường hợp không bắt buộc số điện thoại
      "0300123456-002",
      "agribank_nhut@agribank.com.vn",
      "Trần Quốc Bảo",
      "",
      "Nguyễn Mai Lan",
      "0918765432",
      "Khách mua máy và ký gói bảo trì định kỳ, không bắt buộc SĐT chính",
    ],
    [
      "KH-VIP-09",
      "Công ty TNHH May Mặc & Xuất Nhập Khẩu Hưng Thịnh",
      "Khách VIP",
      "Đang dùng",
      "Lô A2-4 Khu Công Nghiệp Tân Bình, P. Tây Thạnh, Quận Tân Phú, TP.HCM",
      "0938112233",
      "0309988776",
      "ketoan@hungthinhgarment.com",
      "Hoàng Minh Trí",
      "0938112233",
      "Phạm Thu Hằng",
      "0977665544",
      "Ưu tiên hỗ trợ kỹ thuật trong vòng 1 giờ khi phát sinh sự cố",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);

  // Cấu hình độ rộng từng cột giúp mở Excel không bị che khuất dữ liệu
  ws["!cols"] = [
    { wch: 16 }, // Mã khách hàng
    { wch: 42 }, // Tên khách hàng
    { wch: 18 }, // Phân nhóm
    { wch: 14 }, // Trạng thái
    { wch: 50 }, // Địa chỉ
    { wch: 18 }, // Số điện thoại
    { wch: 18 }, // Mã số thuế
    { wch: 28 }, // Email
    { wch: 20 }, // Người quản lý
    { wch: 16 }, // SĐT quản lý
    { wch: 22 }, // Người liên hệ
    { wch: 16 }, // SĐT liên hệ
    { wch: 45 }, // Ghi chú
  ];

  const groupHint =
    customGroups && customGroups.length > 0
      ? `Các loại khách hàng hiện có trong hệ thống: ${customGroups.join(", ")}. Mặc định: Khách thường`
      : "Gợi ý: Khách thường, Khách VIP, Khách thuê máy, Khách mua máy, Khách bảo trì. Mặc định: Khách thường";

  // Tạo thêm sheet hướng dẫn
  const guideHeaders = ["Tên cột", "Bắt buộc", "Mô tả / Giá trị gợi ý"];
  const guideData = [
    ["Mã khách hàng", "Không", "Mã quản lý khách hàng (VD: KH202601). Nếu để trống hệ thống sẽ tự động tạo mã"],
    ["Tên khách hàng / Doanh nghiệp (*)", "Bắt buộc", "Tên đầy đủ của khách hàng hoặc tổ chức"],
    ["Phân nhóm", "Không", groupHint],
    ["Trạng thái", "Không", "Đang dùng (ACTIVE), Tạm ngưng (SUSPENDED), Ngừng DV (TERMINATED). Mặc định: Đang dùng"],
    ["Địa chỉ chính (*)", "Bắt buộc", "Địa chỉ trụ sở hoặc văn phòng lắp đặt chính"],
    ["Số điện thoại liên hệ", "Không", "Số điện thoại chính (KHÔNG BẮT BUỘC, có thể để trống)"],
    ["Mã số thuế", "Không", "Mã số thuế doanh nghiệp"],
    ["Email", "Không", "Địa chỉ email nhận hóa đơn/thông báo"],
    ["Người quản lý", "Không", "Họ tên người phụ trách cấp quản lý"],
    ["SĐT quản lý", "Không", "Số điện thoại di động người quản lý"],
    ["Người liên hệ trực tiếp", "Không", "Họ tên nhân viên liên hệ làm việc trực tiếp"],
    ["SĐT người liên hệ", "Không", "Số điện thoại người liên hệ trực tiếp"],
    ["Ghi chú quản lý", "Không", "Yêu cầu ra vào tòa nhà, thói quen in ấn, người duyệt chi phí..."],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet([guideHeaders, ...guideData]);
  wsGuide["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 70 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Khách hàng");
  XLSX.utils.book_append_sheet(wb, wsGuide, "Hướng dẫn điền");

  XLSX.writeFile(wb, "Mau_Nhap_Khach_Hang.xlsx");
}

/**
 * Chuẩn hóa chuỗi tìm kiếm tiêu đề cột (bỏ dấu, chuyển thường, bỏ ký tự đặc biệt)
 */
function cleanKey(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Đọc và phân tích file Excel / CSV người dùng tải lên
 */
export async function parseCustomerExcel(file: File): Promise<{
  rows: CustomerImportRow[];
  validCount: number;
  errorCount: number;
}> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("File Excel không có sheet dữ liệu nào");
  }

  const sheet = wb.Sheets[firstSheetName];
  const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
  });

  if (!rawRows || rawRows.length === 0) {
    throw new Error("File Excel không có dòng dữ liệu nào");
  }

  const rows: CustomerImportRow[] = rawRows.map((raw) => {
    // Map linh hoạt các cột theo cleanKey
    const normalizedMap: Record<string, string> = {};
    Object.entries(raw).forEach(([k, v]) => {
      normalizedMap[cleanKey(k)] = v !== null && v !== undefined ? String(v).trim() : "";
    });

    const getVal = (possibleKeys: string[]): string => {
      for (const k of possibleKeys) {
        const cleaned = cleanKey(k);
        if (normalizedMap[cleaned] !== undefined && normalizedMap[cleaned] !== "") {
          return normalizedMap[cleaned];
        }
      }
      return "";
    };

    const code = getVal(["makhachhang", "makh", "code", "ma"]);
    const name = getVal(["tenkhachhang", "tenkh", "tendoanhnghiep", "ten", "name", "customername"]);
    const rawGroup = getVal(["phannhom", "nhomkhachhang", "nhom", "group", "customergroup"]);
    const rawStatus = getVal(["trangthai", "status", "trangthaidichvu"]);
    const address = getVal(["diachi", "diachichinh", "address"]);
    const phone = getVal(["sodienthoai", "sdt", "dienthoai", "phone", "tel", "sodienthoailienhe"]);
    const taxCode = getVal(["masothue", "mst", "taxcode"]);
    const email = getVal(["email", "thudientu", "mail"]);
    const managerName = getVal(["nguoiquanly", "quanly", "manager", "managername"]);
    const managerPhone = getVal(["sdtquanly", "sodienthoaiquanly", "managerphone"]);
    const contactName = getVal(["nguoilienhe", "nguoilienhetructiep", "contact", "contactname"]);
    const contactPhone = getVal(["sdtnguoilienhe", "sdtlienhe", "contactphone"]);
    const notes = getVal(["ghichu", "ghichuquanly", "notes", "note"]);

    // Chuẩn hóa nhóm khách hàng
    let group = "Khách thường";
    if (rawGroup) {
      const matchGroup = CUSTOMER_GROUPS_LIST.find(
        (g) => cleanKey(g) === cleanKey(rawGroup)
      );
      if (matchGroup) {
        group = matchGroup;
      } else {
        group = rawGroup;
      }
    }

    // Chuẩn hóa trạng thái dịch vụ
    let status = "ACTIVE";
    if (rawStatus) {
      const mapped = CUSTOMER_STATUS_MAP[rawStatus.trim().toLowerCase()];
      if (mapped) {
        status = mapped;
      } else if (["ACTIVE", "SUSPENDED", "TERMINATED"].includes(rawStatus.toUpperCase())) {
        status = rawStatus.toUpperCase();
      }
    }

    const errors: string[] = [];
    if (!name) {
      errors.push("Thiếu tên khách hàng");
    }
    if (!address) {
      errors.push("Thiếu địa chỉ chính");
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push("Email không hợp lệ");
    }

    return {
      code,
      name,
      group,
      status,
      address,
      phone,
      taxCode,
      email,
      managerName,
      managerPhone,
      contactName,
      contactPhone,
      notes,
      isValid: errors.length === 0,
      errors,
    };
  });

  const validCount = rows.filter((r) => r.isValid).length;
  const errorCount = rows.length - validCount;

  return { rows, validCount, errorCount };
}
