import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError, parseBody } from "@/lib/http";
import {
  getCompanyProfile,
  saveCompanyProfile,
  CompanyProfile,
  VIETNAM_BANKS,
} from "@/lib/companyProfile";
import { z } from "zod";

const companyProfileSchema = z.object({
  companyName: z.string().min(2, "Tên công ty không được để trống"),
  shortName: z.string().min(1, "Tên viết tắt không được để trống"),
  taxCode: z.string().min(5, "Mã số thuế không hợp lệ"),
  address: z.string().min(5, "Địa chỉ không được để trống"),
  hotline: z.string().min(5, "Số điện thoại hotline không được để trống"),
  email: z.string().email("Địa chỉ email không hợp lệ"),
  website: z.string().optional().default(""),
  logoUrl: z.string().optional().default(""),

  bankBin: z.string().min(4, "Mã ngân hàng (BIN) không hợp lệ"),
  bankName: z.string().min(2, "Tên ngân hàng không được để trống"),
  bankAccount: z.string().min(4, "Số tài khoản không hợp lệ"),
  accountHolder: z.string().min(2, "Tên chủ tài khoản không được để trống"),
  qrTemplate: z.enum(["compact2", "compact", "qr_only", "print"]).default("compact2"),
});

// GET: Lấy thông tin cấu hình công ty & danh sách ngân hàng
export const GET = withErrors(async () => {
  const profile = await getCompanyProfile();
  return NextResponse.json({
    profile,
    banks: VIETNAM_BANKS,
  });
});

// POST / PUT: Cập nhật thông tin cấu hình công ty & ngân hàng
export const POST = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
    throw new HttpError(403, "Chỉ Quản trị viên (SUPER_ADMIN / ADMIN) mới có quyền chỉnh sửa cấu hình công ty");
  }

  const parsed = await parseBody(req, companyProfileSchema);
  if (parsed.error) return parsed.error;

  const updated = await saveCompanyProfile(parsed.data as CompanyProfile);

  // Ghi nhật ký hệ thống
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "UPDATE_COMPANY_PROFILE",
      entity: "SystemSetting",
      entityId: "COMPANY_PROFILE",
      meta: {
        companyName: updated.companyName,
        bankName: updated.bankName,
        bankAccount: updated.bankAccount,
      },
    },
  });

  return NextResponse.json({
    success: true,
    profile: updated,
    message: "Cập nhật thông tin doanh nghiệp và tài khoản ngân hàng thành công",
  });
});
