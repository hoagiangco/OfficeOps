import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    code: z.string().trim().optional(),
    name: z.string().trim().min(1),
    group: z.string().trim().optional(),
    status: z.string().trim().optional(),
    taxCode: z.string().trim().nullable(),
    phone: z.string().trim().nullable().optional().or(z.literal("")),
    email: z.string().trim().email().nullable().or(z.literal("")),
    zaloId: z.string().trim().nullable(),
    address: z.string().trim().min(1),
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    managerName: z.string().trim().nullable(),
    managerPhone: z.string().trim().nullable(),
    contactName: z.string().trim().nullable(),
    contactPhone: z.string().trim().nullable(),
    notes: z.string().trim().nullable(),
    locationConfig: z.record(z.string(), z.unknown()).optional().nullable(),
  })
  .partial();

// Điều phối viên chỉ được sửa thông tin liên hệ (PRD: "Xem + sửa liên hệ")
const DISPATCHER_FIELDS = ["phone", "email", "zaloId", "contactName", "contactPhone", "managerName", "managerPhone", "notes"];

export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "customer:view"))) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id },
    include: {
      branches: {
        include: {
          equipment: {
            where: { buildingId: null },
            select: { id: true, model: true, serialNumber: true, status: true, brand: true },
          },
          _count: { select: { buildings: true, equipment: true } },
          buildings: {
            include: {
              equipment: {
                where: { departmentId: null },
                select: { id: true, model: true, serialNumber: true, status: true, brand: true },
              },
              _count: { select: { departments: true, equipment: true } },
              departments: {
                include: {
                  equipment: {
                    select: { id: true, model: true, serialNumber: true, status: true, brand: true },
                  },
                  _count: { select: { equipment: true } },
                },
              },
            },
          },
        },
      },
      equipment: {
        include: {
          category: {
            include: {
              parent: {
                include: { parent: true },
              },
            },
          },
          branch: { select: { id: true, name: true } },
          building: { select: { id: true, name: true, branch: { select: { name: true } } } },
          department: {
            include: {
              building: {
                include: { branch: true },
              },
            },
          },
          contract: {
            select: { id: true, code: true, basePrice: true, baseQuota: true },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      tickets: {
        take: 30,
        orderBy: { createdAt: "desc" },
        include: {
          assignee: { select: { id: true, name: true, phone: true } },
          equipment: { select: { id: true, model: true, serialNumber: true } },
        },
      },
      contracts: {
        orderBy: { createdAt: "desc" },
      },
      invoices: {
        take: 30,
        orderBy: { createdAt: "desc" },
      },
      feedbacks: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      _count: { select: { equipment: true, contracts: true, tickets: true, invoices: true, feedbacks: true } },
    },
  });
  if (!customer) return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });

  // Tính công nợ cần thu (các hóa đơn chưa thanh toán SENT hoặc OVERDUE)
  const unpaidInvoices = customer.invoices.filter((inv) =>
    ["SENT", "OVERDUE"].includes(inv.status)
  );
  const totalDebt = unpaidInvoices.reduce(
    (sum, inv) => sum + Number(inv.total),
    0
  );

  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");

  return NextResponse.json({
    ...maskCustomerPhones(customer, canViewPhone),
    totalDebt,
    unpaidCount: unpaidInvoices.length,
  });
});

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  const canEditContact = await checkUserPermission(s.userId, s.role, "customer:edit-contact");
  const canEditLegal = await checkUserPermission(s.userId, s.role, "customer:edit-legal");
  if (!canEditContact && !canEditLegal) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const r = await parseBody(req, patchSchema);
  if (r.error) return r.error;
  if (!canEditLegal && Object.keys(r.data).some((k) => !DISPATCHER_FIELDS.includes(k))) {
    return NextResponse.json({ error: "Chỉ được sửa thông tin liên hệ" }, { status: 403 });
  }
  const { id } = await params;
  const updateData: Record<string, unknown> = { ...r.data };
  if (updateData.email === "") updateData.email = null;

  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");
  if (!canViewPhone) {
    // Không có quyền xem SĐT khách hàng -> Không được sửa SĐT để tránh ghi đè số bị che
    delete updateData.phone;
    delete updateData.contactPhone;
    delete updateData.managerPhone;
  } else {
    // Nếu có quyền nhưng dữ liệu gửi lên chứa dấu * (bị che) thì bỏ qua không ghi đè
    if (typeof updateData.phone === "string" && updateData.phone.includes("*")) {
      delete updateData.phone;
    }
    if (typeof updateData.contactPhone === "string" && updateData.contactPhone.includes("*")) {
      delete updateData.contactPhone;
    }
    if (typeof updateData.managerPhone === "string" && updateData.managerPhone.includes("*")) {
      delete updateData.managerPhone;
    }
  }

  if (updateData.phone !== undefined) {
    updateData.phone = typeof updateData.phone === "string" ? updateData.phone.trim() : "";
  }
  if (updateData.taxCode && typeof updateData.taxCode === "string" && updateData.taxCode.trim()) {
    const existingTax = await prisma.customer.findFirst({
      where: {
        taxCode: { equals: updateData.taxCode.trim(), mode: "insensitive" },
        id: { not: id },
      },
      select: { id: true, name: true, code: true },
    });
    if (existingTax) {
      return NextResponse.json(
        { error: `Mã số thuế "${updateData.taxCode.trim()}" đã thuộc về khách hàng "${existingTax.name}" (${existingTax.code || "Chưa có mã"})` },
        { status: 409 }
      );
    }
  }

  const customer = await prisma.customer.update({ where: { id }, data: updateData });
  await prisma.auditLog.create({ data: { userId: s.userId, action: "CUSTOMER_UPDATE", entity: "Customer", entityId: id } });
  return NextResponse.json(customer);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!(await checkUserPermission(s.userId, s.role, "customer:delete"))) return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  const { id } = await params;

  // Lấy thông tin khách hàng và kiểm tra các ràng buộc dữ liệu
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      _count: {
        select: {
          contracts: true,
          equipment: true,
          tickets: true,
          invoices: true,
          branches: true,
        },
      },
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
  }

  const { contracts, equipment, tickets, invoices, branches } = customer._count;
  const hasConstraints = contracts > 0 || equipment > 0 || tickets > 0 || invoices > 0 || branches > 0;

  if (hasConstraints) {
    const reasons: string[] = [];
    if (contracts > 0) reasons.push(`${contracts} hợp đồng`);
    if (equipment > 0) reasons.push(`${equipment} thiết bị/máy photocopy`);
    if (tickets > 0) reasons.push(`${tickets} phiếu kỹ thuật`);
    if (invoices > 0) reasons.push(`${invoices} hóa đơn/bảng kê`);
    if (branches > 0) reasons.push(`${branches} chi nhánh/vị trí`);

    return NextResponse.json(
      {
        error: `Không thể xóa khách hàng "${customer.name}" do đang có ràng buộc dữ liệu: ${reasons.join(", ")}. Vui lòng thu hồi thiết bị, thanh lý hợp đồng và xử lý dứt điểm các phiếu/hóa đơn trước khi xóa.`,
        constraints: customer._count,
      },
      { status: 409 }
    );
  }

  await prisma.customer.delete({ where: { id } });
  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "CUSTOMER_DELETE",
      entity: "Customer",
      entityId: id,
    },
  });
  return NextResponse.json({ ok: true });
});
