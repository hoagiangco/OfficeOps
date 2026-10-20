import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, HttpError } from "@/lib/http";

export const GET = withErrors(async () => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const technicians = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ["FIELD_TECH", "DISPATCHER"] },
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      region: true,
      skills: true,
      assignedTickets: {
        where: {
          status: { in: ["ASSIGNED", "IN_PROGRESS", "WAITING_PARTS", "WAITING_CUSTOMER"] },
        },
        select: {
          id: true,
          code: true,
          status: true,
          priority: true,
          customer: { select: { name: true } },
          equipment: { select: { model: true, serialNumber: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: [{ role: "desc" }, { name: "asc" }],
  });

  const result = technicians.map((t) => ({
    ...t,
    openTicketsCount: t.assignedTickets.length,
  }));

  return NextResponse.json(result);
});
