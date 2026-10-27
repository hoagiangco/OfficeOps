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

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("customer:view");
  if (s instanceof NextResponse) return s;

  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");

  const url = new URL(req.url);
  const group = url.searchParams.get("group") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const equipFilter = url.searchParams.get("equipFilter") || undefined;
  const debtFilter = url.searchParams.get("debtFilter") || undefined;

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

  const [items, total, groupStats, debtInvoices, activeCount, totalEquipCount, totalAll] = await Promise.all([
    prisma.customer.findMany({
      where,
      include: {
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
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
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
