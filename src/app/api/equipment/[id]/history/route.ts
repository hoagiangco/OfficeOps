import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
import { maskCustomerPhones } from "@/lib/maskUtils";
import { withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  // Kiểm tra quyền xem lịch sử thiết bị
  const hasHistoryPerm = await checkUserPermission(s.userId, s.role, "equipment:history");
  if (!hasHistoryPerm) {
    return NextResponse.json(
      { error: "Bạn không có quyền xem lịch sử thiết bị (equipment:history)" },
      { status: 403 }
    );
  }

  const { id } = await params;
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      serialNumber: true,
      model: true,
      brand: true,
      status: true,
      currentCounter: true,
      qrCode: true,
      healthScore: true,
      locationNote: true,
      installedAt: true,
      warrantyUntil: true,
      notes: true,
      customer: {
        select: {
          id: true,
          name: true,
          phone: true,
          address: true,
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
              branch: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      },
      tickets: {
        select: {
          id: true,
          code: true,
          type: true,
          status: true,
          priority: true,
          description: true,
          diagnosis: true,
          counterAtClose: true,
          createdAt: true,
          resolvedAt: true,
          assignee: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          partsUsed: {
            select: {
              id: true,
              quantity: true,
              replacedAt: true,
              oldPartReturned: true,
              part: {
                select: {
                  id: true,
                  name: true,
                  partCode: true,
                  unit: true,
                },
              },
            },
            orderBy: { replacedAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
      partHistory: {
        select: {
          id: true,
          quantity: true,
          replacedAt: true,
          oldPartReturned: true,
          ticket: {
            select: {
              id: true,
              code: true,
            },
          },
          part: {
            select: {
              id: true,
              name: true,
              partCode: true,
              unit: true,
            },
          },
        },
        orderBy: { replacedAt: "desc" },
        take: 50,
      },
      meterLogs: {
        select: {
          id: true,
          counterValue: true,
          logDate: true,
          source: true,
          status: true,
        },
        orderBy: { logDate: "desc" },
        take: 30,
      },
      statusHistory: {
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          changedAt: true,
        },
        orderBy: { changedAt: "desc" },
        take: 30,
      },
    },
  });

  if (!equipment) {
    return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });
  }

  const canViewPhone = await checkUserPermission(s.userId, s.role, "customer:view-phone");
  const formattedCustomer = equipment.customer
    ? maskCustomerPhones(equipment.customer, canViewPhone)
    : null;

  return NextResponse.json({
    ...equipment,
    customer: formattedCustomer,
  });
});
