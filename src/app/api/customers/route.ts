import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { pagingSchema, parseBody, parseQuery, withErrors } from "@/lib/http";

const customerSchema = z.object({
  code: z.string().trim().optional(),
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng"),
  group: z.string().trim().default("Khách thường"),
  status: z.string().trim().default("ACTIVE"),
  taxCode: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable().or(z.literal("")),
  email: z.string().trim().email("Email không hợp lệ").optional().nullable().or(z.literal("")),
  zaloId: z.string().trim().optional().nullable(),
  address: z.string().trim().min(1, "Vui lòng nhập địa chỉ"),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  managerName: z.string().trim().optional().nullable(),
  managerPhone: z.string().trim().optional().nullable(),
  contactName: z.string().trim().optional().nullable(),
  contactPhone: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

function generateCustomerCode(): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `KH${year}${rand}`;
}

/**
 * Tách tiền tố chữ và phần số để so sánh tự nhiên (Natural alphanumeric sort)
 * Ví dụ: "KH09" -> prefix: "KH", num: 9
 *       "KH10" -> prefix: "KH", num: 10
 *       "KH11" -> prefix: "KH", num: 11
 *       "KH100" -> prefix: "KH", num: 100
 * Đảm bảo KH11 luôn đứng sau KH10 và trước KH100 thay vì nhảy vọt từ 10 lên 100 do sắp xếp chuỗi thuần túy.
 */
function parseCustomerCode(code?: string | null) {
  if (!code || !code.trim()) {
    return { prefix: "\uffff", num: Infinity, suffix: "", raw: "" };
  }
  const trimmed = code.trim();
  const match = trimmed.match(/^([^\d]*)(\d+)(.*)$/);
  if (match) {
    const cleanPrefix = match[1].replace(/[-_.\s]/g, "").toUpperCase();
    let numVal = Infinity;
    try {
      numVal = Number(BigInt(match[2]));
    } catch {
      numVal = parseInt(match[2], 10) || Infinity;
    }
    return {
      prefix: cleanPrefix,
      num: numVal,
      suffix: match[3],
      raw: trimmed,
    };
  }
  return { prefix: trimmed.toUpperCase(), num: Infinity, suffix: "", raw: trimmed };
}

function compareCustomerCodes(
  a?: string | null,
  b?: string | null,
  order: "asc" | "desc" = "asc"
): number {
  if (!a && !b) return 0;
  if (!a || !a.trim()) return 1; // null hoặc rỗng luôn xếp cuối
  if (!b || !b.trim()) return -1;

  const pa = parseCustomerCode(a);
  const pb = parseCustomerCode(b);

  let cmp = pa.prefix.localeCompare(pb.prefix, "vi", { sensitivity: "base" });
  if (cmp === 0) {
    if (pa.num !== pb.num) {
      cmp = pa.num - pb.num;
    } else {
      cmp = pa.suffix.localeCompare(pb.suffix, "vi", { sensitivity: "base" });
      if (cmp === 0) {
        cmp = pa.raw.localeCompare(pb.raw, "vi");
      }
    }
  }

  return order === "desc" ? -cmp : cmp;
}

function compareCustomerItems(
  a: { code?: string | null; name: string; createdAt?: Date | string | null },
  b: { code?: string | null; name: string; createdAt?: Date | string | null },
  order: "asc" | "desc" = "desc"
): number {
  const codeCmp = compareCustomerCodes(a.code, b.code, order);
  if (codeCmp !== 0) return codeCmp;

  // Nếu trùng mã hoặc cùng chưa có mã: nhập sau hiện trước (desc)
  if (a.createdAt && b.createdAt) {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (timeA !== timeB) {
      return order === "desc" ? timeB - timeA : timeA - timeB;
    }
  }

  return a.name.localeCompare(b.name, "vi");
}

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("customer:view");
  if (s instanceof NextResponse) return s;

  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");

  const url = new URL(req.url);
  const group = url.searchParams.get("group") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const equipFilter = url.searchParams.get("equipFilter") || undefined;
  const debtFilter = url.searchParams.get("debtFilter") || undefined;
  const sortBy = url.searchParams.get("sortBy") || "code";
  const sortOrder = (url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc") as "asc" | "desc";

  const { page, pageSize, q } = parseQuery(req, pagingSchema);

  const andConditions: Record<string, unknown>[] = [];

  if (q) {
    const orFields: Record<string, unknown>[] = [
      { name: { contains: q, mode: "insensitive" as const } },
      { code: { contains: q, mode: "insensitive" as const } },
      { taxCode: { contains: q } },
      { address: { contains: q, mode: "insensitive" as const } },
      { managerName: { contains: q, mode: "insensitive" as const } },
      { contactName: { contains: q, mode: "insensitive" as const } },
    ];
    if (canViewPhone) {
      orFields.push({ phone: { contains: q } });
    }
    andConditions.push({ OR: orFields });
  }

  if (group && group !== "ALL") {
    andConditions.push({ group });
  }

  if (status && status !== "ALL") {
    andConditions.push({ status });
  }

  if (equipFilter === "HAS_EQUIP") {
    andConditions.push({ equipment: { some: {} } });
  } else if (equipFilter === "NO_EQUIP") {
    andConditions.push({ equipment: { none: {} } });
  }

  if (debtFilter === "HAS_DEBT") {
    andConditions.push({ invoices: { some: { status: { in: ["SENT", "OVERDUE"] } } } });
  }

  const where = andConditions.length > 0 ? { AND: andConditions } : {};

  const customerIncludes = {
    _count: {
      select: {
        equipment: true,
        contracts: true,
        branches: true,
        tickets: true,
        invoices: true,
      },
    },
    branches: {
      include: {
        buildings: {
          include: {
            departments: true,
          },
        },
      },
    },
    equipment: {
      select: {
        id: true,
        code: true,
        model: true,
        brand: true,
        type: true,
        group: true,
        relationType: true,
        serialNumber: true,
        status: true,
        currentCounter: true,
        locationNote: true,
        notes: true,
        healthScore: true,
        baseQuota: true,
        overagePrice: true,
        warrantyUntil: true,
        categoryId: true,
        customerId: true,
        warehouseId: true,
        contractId: true,
        branchId: true,
        buildingId: true,
        departmentId: true,
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        branch: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        building: {
          select: {
            id: true,
            name: true,
            branch: { select: { id: true, name: true } },
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            building: {
              select: {
                id: true,
                name: true,
                branch: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    },
  };

  let items: any[] = [];
  let total = 0;

  if (sortBy === "code") {
    // Tách tiền tố và số để sắp xếp tự nhiên chuẩn xác (Natural alphanumeric sort)
    // Ví dụ: KH09 -> KH10 -> KH11 -> ... -> KH99 -> KH100 thay vì nhảy vọt từ 10 lên 100
    const matchingCustomers = await prisma.customer.findMany({
      where,
      select: { id: true, code: true, name: true, createdAt: true },
    });

    total = matchingCustomers.length;
    matchingCustomers.sort((a, b) => compareCustomerItems(a, b, sortOrder));

    const pageIds = matchingCustomers
      .slice((page - 1) * pageSize, page * pageSize)
      .map((c) => c.id);

    if (pageIds.length > 0) {
      const pageRecords = await prisma.customer.findMany({
        where: { id: { in: pageIds } },
        include: customerIncludes,
      });

      const map = new Map(pageRecords.map((r) => [r.id, r]));
      items = pageIds.map((id) => map.get(id)).filter(Boolean);
    }
  } else {
    let orderBy: any = { createdAt: "desc" };
    if (sortBy === "name") {
      orderBy = [
        { name: sortOrder },
        { id: "asc" },
      ];
    } else if (sortBy === "createdAt") {
      orderBy = { createdAt: sortOrder };
    } else if (sortBy === "status") {
      orderBy = { status: sortOrder };
    }

    const [dbItems, dbTotal] = await Promise.all([
      prisma.customer.findMany({
        where,
        include: customerIncludes,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.customer.count({ where }),
    ]);

    items = dbItems;
    total = dbTotal;
  }

  const [groupStats, debtInvoices, activeCount, totalEquipCount, totalAll] = await Promise.all([
    prisma.customer.groupBy({
      by: ["group"],
      _count: { _all: true },
    }),
    prisma.invoice.findMany({
      where: {
        status: { in: ["SENT", "OVERDUE"] },
      },
      select: {
        total: true,
      },
    }),
    prisma.customer.count({ where: { status: "ACTIVE" } }),
    prisma.equipment.count({ where: { customerId: { not: null } } }),
    prisma.customer.count(),
  ]);

  const totalReceivable = debtInvoices.reduce((sum, inv) => sum + Number(inv.total), 0);
  const groupCounts: Record<string, number> = {};
  groupStats.forEach((g) => {
    groupCounts[g.group] = g._count._all;
  });

  const formattedItems = canViewPhone
    ? items
    : items.map((c) => maskCustomerPhones(c, false));

  return NextResponse.json({
    items: formattedItems,
    total,
    totalAll,
    page,
    pageSize,
    groupCounts,
    activeCount,
    totalEquipCount,
    totalReceivable,
    totalPayable: 0,
  });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("customer:create");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, customerSchema);
  if (r.error) return r.error;

  let code = r.data.code?.trim();
  if (!code) {
    code = generateCustomerCode();
  }

  // Ensure code uniqueness
  const existingCode = await prisma.customer.findUnique({ where: { code } });
  if (existingCode) {
    code = generateCustomerCode();
  }

  // Kiểm tra trùng mã số thuế nếu có nhập
  if (r.data.taxCode?.trim()) {
    const existingTax = await prisma.customer.findFirst({
      where: { taxCode: { equals: r.data.taxCode.trim(), mode: "insensitive" } },
      select: { id: true, name: true, code: true },
    });
    if (existingTax) {
      return NextResponse.json(
        { error: `Mã số thuế "${r.data.taxCode.trim()}" đã được đăng ký cho khách hàng "${existingTax.name}" (${existingTax.code || "Chưa có mã"})` },
        { status: 409 }
      );
    }
  }

  const customer = await prisma.customer.create({
    data: {
      ...r.data,
      code,
      phone: r.data.phone?.trim() || "",
      email: r.data.email || null,
      taxCode: r.data.taxCode || null,
      zaloId: r.data.zaloId || null,
      latitude: r.data.latitude != null ? Number(r.data.latitude) : null,
      longitude: r.data.longitude != null ? Number(r.data.longitude) : null,
      managerName: r.data.managerName || null,
      managerPhone: r.data.managerPhone || null,
      contactName: r.data.contactName || null,
      contactPhone: r.data.contactPhone || null,
      notes: r.data.notes || null,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "CUSTOMER_CREATE",
      entity: "Customer",
      entityId: customer.id,
    },
  });

  return NextResponse.json(customer, { status: 201 });
});
