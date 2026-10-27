import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const importItemSchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng"),
  group: z.string().trim().default("Khách thường"),
  status: z.string().trim().default("ACTIVE"),
  taxCode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable().or(z.literal("")),
  email: z.string().trim().email("Email không hợp lệ").optional().nullable().or(z.literal("")),
  zaloId: z.string().trim().optional().nullable(),
  address: z.string().trim().min(1, "Vui lòng nhập địa chỉ"),
  managerName: z.string().trim().optional().nullable(),
  managerPhone: z.string().trim().optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  contactPhone: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const importPayloadSchema = z.object({
  items: z.array(importItemSchema).min(1, "Danh sách khách hàng nhập vào không được để trống"),
  duplicateAction: z.enum(["SKIP", "UPDATE", "CREATE_NEW"]).default("SKIP"),
  checkOnly: z.boolean().default(false),
  autoGenerateCodeOnConflict: z.boolean().default(true),
});

function generateCustomerCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `KH${year}${rand}`;
}

function cleanTaxCode(val?: string | null): string {
  if (!val) return "";
  return val.toLowerCase().replace(/[\s-]/g, "");
}

function cleanPhone(val?: string | null): string {
  if (!val) return "";
  return val.replace(/[\s.\-+()]/g, "");
}

function cleanName(val?: string | null): string {
  if (!val) return "";
  return val
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("customer:import");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, importPayloadSchema);
  if (r.error) return r.error;

  const { items, duplicateAction, checkOnly, autoGenerateCodeOnConflict } = r.data;

  // Lấy toàn bộ khách hàng hiện tại trong DB để đối soát trùng lặp đa tiêu chí
  const existingCustomers = await prisma.customer.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      taxCode: true,
      phone: true,
    },
  });

  type ExistingCust = typeof existingCustomers[0];

  const dbByTaxCode = new Map<string, ExistingCust>();
  const dbByCode = new Map<string, ExistingCust>();
  const dbByName = new Map<string, ExistingCust>();
  const dbByPhone = new Map<string, ExistingCust>();

  for (const c of existingCustomers) {
    if (c.taxCode) {
      const k = cleanTaxCode(c.taxCode);
      if (k) dbByTaxCode.set(k, c);
    }
    if (c.code) {
      dbByCode.set(c.code.toUpperCase().trim(), c);
    }
    const kn = cleanName(c.name);
    if (kn) dbByName.set(kn, c);

    if (c.phone) {
      const kp = cleanPhone(c.phone);
      if (kp) dbByPhone.set(kp, c);
    }
  }

  // Đối soát trong nội bộ file Excel
  const fileSeenTaxCode = new Map<string, number>();
  const fileSeenCode = new Map<string, number>();
  const fileSeenName = new Map<string, number>();
  const fileSeenPhone = new Map<string, number>();

  interface RowAnalysis {
    row: number;
    isDuplicate: boolean;
    duplicateScope?: "DB" | "FILE";
    duplicateReason?: string;
    matchedCustomer?: { id: string; name: string; code: string | null };
    matchType?: "taxCode" | "code" | "name" | "phone";
  }

  const analysis: RowAnalysis[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const rowNum = idx + 1;

    let isDup = false;
    let dupScope: "DB" | "FILE" | undefined;
    let dupReason: string | undefined;
    let matchedCust: { id: string; name: string; code: string | null } | undefined;
    let matchType: "taxCode" | "code" | "name" | "phone" | undefined;

    const cTax = cleanTaxCode(item.taxCode);
    const cCode = item.code ? item.code.toUpperCase().trim() : "";
    const cName = cleanName(item.name);
    const cPhone = cleanPhone(item.phone);

    // 1. Kiểm tra trùng lặp với CSDL
    if (cTax && dbByTaxCode.has(cTax)) {
      const match = dbByTaxCode.get(cTax)!;
      isDup = true;
      dupScope = "DB";
      matchType = "taxCode";
      matchedCust = { id: match.id, name: match.name, code: match.code };
      dupReason = `Trùng Mã số thuế (${item.taxCode}) với khách hàng: "${match.name}" (${match.code || "Chưa có mã"})`;
    } else if (cCode && dbByCode.has(cCode)) {
      const match = dbByCode.get(cCode)!;
      isDup = true;
      dupScope = "DB";
      matchType = "code";
      matchedCust = { id: match.id, name: match.name, code: match.code };
      dupReason = `Trùng Mã khách hàng (${item.code}) với khách hàng: "${match.name}"`;
    } else if (cName && dbByName.has(cName)) {
      const match = dbByName.get(cName)!;
      isDup = true;
      dupScope = "DB";
      matchType = "name";
      matchedCust = { id: match.id, name: match.name, code: match.code };
      dupReason = `Trùng Tên khách hàng với: "${match.name}" (${match.code || "Chưa có mã"})`;
    } else if (cPhone && dbByPhone.has(cPhone)) {
      const match = dbByPhone.get(cPhone)!;
      isDup = true;
      dupScope = "DB";
      matchType = "phone";
      matchedCust = { id: match.id, name: match.name, code: match.code };
      dupReason = `Trùng Số điện thoại (${item.phone}) với khách hàng: "${match.name}" (${match.code || "Chưa có mã"})`;
    }

    // 2. Kiểm tra trùng lặp trong nội bộ file Excel
    if (!isDup) {
      if (cTax && fileSeenTaxCode.has(cTax)) {
        const prevRow = fileSeenTaxCode.get(cTax)!;
        isDup = true;
        dupScope = "FILE";
        matchType = "taxCode";
        dupReason = `Trùng Mã số thuế (${item.taxCode}) với dòng số ${prevRow} trong file`;
      } else if (cCode && fileSeenCode.has(cCode)) {
        const prevRow = fileSeenCode.get(cCode)!;
        isDup = true;
        dupScope = "FILE";
        matchType = "code";
        dupReason = `Trùng Mã khách hàng (${item.code}) với dòng số ${prevRow} trong file`;
      } else if (cName && fileSeenName.has(cName)) {
        const prevRow = fileSeenName.get(cName)!;
        isDup = true;
        dupScope = "FILE";
        matchType = "name";
        dupReason = `Trùng Tên khách hàng với dòng số ${prevRow} trong file`;
      } else if (cPhone && fileSeenPhone.has(cPhone)) {
        const prevRow = fileSeenPhone.get(cPhone)!;
        isDup = true;
        dupScope = "FILE";
        matchType = "phone";
        dupReason = `Trùng Số điện thoại (${item.phone}) với dòng số ${prevRow} trong file`;
      }
    }

    if (cTax) fileSeenTaxCode.set(cTax, rowNum);
    if (cCode) fileSeenCode.set(cCode, rowNum);
    if (cName) fileSeenName.set(cName, rowNum);
    if (cPhone) fileSeenPhone.set(cPhone, rowNum);

    analysis.push({
      row: rowNum,
      isDuplicate: isDup,
      duplicateScope: dupScope,
      duplicateReason: dupReason,
      matchedCustomer: matchedCust,
      matchType,
    });
  }

  const duplicatesCount = analysis.filter((a) => a.isDuplicate).length;
  const newCount = items.length - duplicatesCount;

  // Nếu chỉ yêu cầu kiểm tra đối soát trước (Dry-run / Check-only)
  if (checkOnly) {
    return NextResponse.json({
      success: true,
      total: items.length,
      duplicatesCount,
      newCount,
      analysis,
    });
  }

  // Xử lý lưu dữ liệu thực tế theo chế độ duplicateAction (SKIP, UPDATE, CREATE_NEW)
  const createdCustomers: Array<{ id: string; name: string; code: string | null }> = [];
  const updatedCustomers: Array<{ id: string; name: string; code: string | null }> = [];
  const skippedCustomers: Array<{ row: number; name: string; reason: string }> = [];
  const errors: Array<{ row: number; name: string; error: string }> = [];

  const usedCodesSet = new Set<string>(existingCustomers.map((c) => (c.code || "").toUpperCase()));

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const an = analysis[idx];
    const rowNum = idx + 1;

    // A. Xử lý bản ghi bị trùng lặp
    if (an.isDuplicate) {
      if (duplicateAction === "SKIP") {
        skippedCustomers.push({
          row: rowNum,
          name: item.name,
          reason: an.duplicateReason || "Bản ghi bị trùng lặp",
        });
        continue;
      }

      if (duplicateAction === "UPDATE" && an.matchedCustomer?.id) {
        // Cập nhật thông tin vào khách hàng cũ trong DB
        try {
          const updated = await prisma.customer.update({
            where: { id: an.matchedCustomer.id },
            data: {
              address: item.address,
              phone: item.phone ? item.phone.trim() : undefined,
              email: item.email || undefined,
              taxCode: item.taxCode || undefined,
              group: item.group || undefined,
              status: item.status || undefined,
              managerName: item.managerName || undefined,
              managerPhone: item.managerPhone || undefined,
              contactName: item.contactName || undefined,
              contactPhone: item.contactPhone || undefined,
              notes: item.notes || undefined,
            },
            select: { id: true, name: true, code: true },
          });
          updatedCustomers.push(updated);
          continue;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Lỗi khi cập nhật khách hàng";
          errors.push({ row: rowNum, name: item.name, error: msg });
          continue;
        }
      }
      // Nếu là CREATE_NEW: tiếp tục xuống logic tạo mới bên dưới
    }

    // B. Tạo mới khách hàng
    let code = item.code?.trim();

    if (code) {
      const upper = code.toUpperCase();
      if (usedCodesSet.has(upper)) {
        if (autoGenerateCodeOnConflict) {
          let newCode = generateCustomerCode();
          while (usedCodesSet.has(newCode.toUpperCase())) {
            newCode = generateCustomerCode();
          }
          code = newCode;
        } else {
          errors.push({
            row: rowNum,
            name: item.name,
            error: `Mã khách hàng "${item.code}" đã tồn tại trong hệ thống`,
          });
          continue;
        }
      }
    } else {
      let newCode = generateCustomerCode();
      while (usedCodesSet.has(newCode.toUpperCase())) {
        newCode = generateCustomerCode();
      }
      code = newCode;
    }

    usedCodesSet.add(code.toUpperCase());

    try {
      const created = await prisma.customer.create({
        data: {
          code,
          name: item.name,
          group: item.group || "Khách thường",
          status: item.status || "ACTIVE",
          phone: item.phone?.trim() || "",
          address: item.address,
          taxCode: item.taxCode || null,
          email: item.email || null,
          zaloId: item.zaloId || null,
          managerName: item.managerName || null,
          managerPhone: item.managerPhone || null,
          contactName: item.contactName || null,
          contactPhone: item.contactPhone || null,
          notes: item.notes || null,
        },
        select: {
          id: true,
          name: true,
          code: true,
        },
      });
      createdCustomers.push(created);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Lỗi không xác định khi lưu khách hàng";
      errors.push({
        row: rowNum,
        name: item.name,
        error: msg,
      });
    }
  }

  // Ghi nhật ký hệ thống
  if (createdCustomers.length > 0 || updatedCustomers.length > 0) {
    await prisma.auditLog.create({
      data: {
        userId: s.userId,
        action: "CUSTOMER_IMPORT",
        entity: "Customer",
        entityId: `imported_${createdCustomers.length}_updated_${updatedCustomers.length}`,
      },
    });
  }

  return NextResponse.json({
    success: true,
    total: items.length,
    importedCount: createdCustomers.length,
    updatedCount: updatedCustomers.length,
    skippedCount: skippedCustomers.length,
    failedCount: errors.length,
    created: createdCustomers,
    updated: updatedCustomers,
    skipped: skippedCustomers,
    errors,
  });
});
