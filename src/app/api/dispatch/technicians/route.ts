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

  const result = await Promise.all(
    technicians.map(async (t) => {
      // Tìm vị trí check-in GPS gần nhất của KTV
      const latestCheckInTicket = await prisma.ticket.findFirst({
        where: {
          assigneeId: t.id,
          checkInLat: { not: null },
          checkInLng: { not: null },
        },
        orderBy: { checkInAt: "desc" },
        select: {
          checkInLat: true,
          checkInLng: true,
          checkInAt: true,
          code: true,
          customer: { select: { name: true, address: true } },
        },
      });

      return {
        ...t,
        openTicketsCount: t.assignedTickets.length,
        lastLocation: latestCheckInTicket
          ? {
              latitude: latestCheckInTicket.checkInLat,
              longitude: latestCheckInTicket.checkInLng,
              checkInAt: latestCheckInTicket.checkInAt,
              ticketCode: latestCheckInTicket.code,
              customerName: latestCheckInTicket.customer?.name || "",
              customerAddress: latestCheckInTicket.customer?.address || "",
            }
          : null,
      };
    })
  );

  return NextResponse.json(result);
});
