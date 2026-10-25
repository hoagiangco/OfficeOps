/**
 * OfficeOps - Cấu hình Thông tin Doanh nghiệp & Tài khoản Ngân hàng (VietQR)
 * Lưu trữ trong bảng SystemSetting với key: "COMPANY_PROFILE"
 */

import { prisma } from "@/lib/prisma";

export interface CompanyProfile {
  companyName: string;
  shortName: string;
  taxCode: string;
  address: string;
  hotline: string;
  email: string;
  website: string;
  logoUrl?: string;

  // Cấu hình Ngân hàng & VietQR
  bankBin: string; // Mã BIN chuẩn VietQR (6 số)
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  qrTemplate: "compact2" | "compact" | "qr_only" | "print";
}

export interface BankInfo {
  bin: string;
  shortName: string;
  name: string;
}

/**
 * Danh sách các ngân hàng phổ biến tại Việt Nam theo chuẩn Napas / VietQR
 */
export const VIETNAM_BANKS: BankInfo[] = [
  { bin: "970407", shortName: "Techcombank", name: "Ngân hàng TMCP Kỹ Thương Việt Nam (TCB)" },
  { bin: "970436", shortName: "Vietcombank", name: "Ngân hàng TMCP Ngoại Thương Việt Nam (VCB)" },
  { bin: "970415", shortName: "VietinBank", name: "Ngân hàng TMCP Công Thương Việt Nam (CTG)" },
  { bin: "970418", shortName: "BIDV", name: "Ngân hàng TMCP Đầu Tư và Phát Triển Việt Nam (BIDV)" },
  { bin: "970422", shortName: "MBBank", name: "Ngân hàng TMCP Quân Đội (MB)" },
  { bin: "970416", shortName: "ACB", name: "Ngân hàng TMCP Á Châu (ACB)" },
  { bin: "970432", shortName: "VPBank", name: "Ngân hàng TMCP Việt Nam Thịnh Vượng (VPB)" },
  { bin: "970423", shortName: "TPBank", name: "Ngân hàng TMCP Tiên Phong (TPB)" },
  { bin: "970405", shortName: "Agribank", name: "Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam (VBA)" },
  { bin: "970403", shortName: "Sacombank", name: "Ngân hàng TMCP Sài Gòn Thương Tín (STB)" },
  { bin: "970437", shortName: "HDBank", name: "Ngân hàng TMCP Phát Triển TP.HCM (HDB)" },
  { bin: "970448", shortName: "OCB", name: "Ngân hàng TMCP Phương Đông (OCB)" },
  { bin: "970441", shortName: "VIB", name: "Ngân hàng TMCP Quốc Tế Việt Nam (VIB)" },
  { bin: "970443", shortName: "SHB", name: "Ngân hàng TMCP Sài Gòn - Hà Nội (SHB)" },
  { bin: "970426", shortName: "MSB", name: "Ngân hàng TMCP Hàng Hải Việt Nam (MSB)" },
  { bin: "970440", shortName: "SeABank", name: "Ngân hàng TMCP Đông Nam Á (SSB)" },
  { bin: "970428", shortName: "Nam A Bank", name: "Ngân hàng TMCP Nam Á (NAB)" },
  { bin: "970409", shortName: "Bac A Bank", name: "Ngân hàng TMCP Bắc Á (BAB)" },
  { bin: "970431", shortName: "Eximbank", name: "Ngân hàng TMCP Xuất Nhập Khẩu Việt Nam (EIB)" },
  { bin: "970449", shortName: "LPBank", name: "Ngân hàng TMCP Lộc Phát Việt Nam (LPB)" },
  { bin: "970454", shortName: "BVBank", name: "Ngân hàng TMCP Bản Việt (VCCB)" },
];

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  companyName: "CÔNG TY TNHH GIẢI PHÁP VĂN PHÒNG OFFICEOPS",
  shortName: "OFFICEOPS",
  taxCode: "0317899999",
  address: "Tầng 5, Tòa nhà Innovation, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh",
  hotline: "0908 123 456",
  email: "contact@officeops.vn",
  website: "https://officeops.vn",
  logoUrl: "",

  bankBin: "970407", // Techcombank
  bankName: "Techcombank (Ngân hàng TMCP Kỹ Thương Việt Nam)",
  bankAccount: "1903 6688 9999",
  accountHolder: "CONG TY TNHH GIAI PHAP VAN PHONG OFFICEOPS",
  qrTemplate: "compact2",
};

export const SETTING_KEY_COMPANY_PROFILE = "COMPANY_PROFILE";

/**
 * Lấy thông tin cấu hình công ty (kèm fallback mặc định)
 */
export async function getCompanyProfile(): Promise<CompanyProfile> {
  try {
    const record = await prisma.systemSetting.findUnique({
      where: { key: SETTING_KEY_COMPANY_PROFILE },
    });

    if (!record || !record.value) {
      return DEFAULT_COMPANY_PROFILE;
    }

    const parsed = JSON.parse(record.value);
    return {
      ...DEFAULT_COMPANY_PROFILE,
      ...parsed,
    };
  } catch (err) {
    console.error("[getCompanyProfile] Lỗi đọc cấu hình công ty:", err);
    return DEFAULT_COMPANY_PROFILE;
  }
}

/**
 * Lưu thông tin cấu hình công ty vào cơ sở dữ liệu
 */
export async function saveCompanyProfile(
  data: Partial<CompanyProfile>
): Promise<CompanyProfile> {
  const current = await getCompanyProfile();
  const updated: CompanyProfile = {
    ...current,
    ...data,
  };

  await prisma.systemSetting.upsert({
    where: { key: SETTING_KEY_COMPANY_PROFILE },
    update: { value: JSON.stringify(updated) },
    create: {
      key: SETTING_KEY_COMPANY_PROFILE,
      value: JSON.stringify(updated),
    },
  });

  return updated;
}

/**
 * Sinh đường dẫn ảnh mã VietQR thanh toán tự động theo chuẩn VietQR.io
 */
export function generateVietQrUrl(params: {
  bankBin: string;
  bankAccount: string;
  amount: number;
  content: string;
  accountName?: string;
  template?: string;
}): string {
  const cleanAccount = params.bankAccount.replace(/\s+/g, "");
  const cleanBin = params.bankBin.trim();
  const tpl = params.template || "compact2";
  const amountInt = Math.max(0, Math.round(params.amount));
  const encodedContent = encodeURIComponent(params.content.trim());
  const encodedName = params.accountName
    ? encodeURIComponent(params.accountName.trim())
    : "";

  let url = `https://img.vietqr.io/image/${cleanBin}-${cleanAccount}-${tpl}.png?amount=${amountInt}&addInfo=${encodedContent}`;
  if (encodedName) {
    url += `&accountName=${encodedName}`;
  }
  return url;
}
