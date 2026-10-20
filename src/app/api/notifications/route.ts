import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseBody, withErrors, HttpError } from "@/lib/http";

const patchNotificationSchema = z.object({
  id: z.string().optional(),
  markAllRead: z.boolean().optional(),
});

export const GET = withErrors(async () => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const where = {
    OR: [{ userId: session.userId }, { userId: null }],
  };

  const [items, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.notification.count({
      where: {
        ...where,
        isRead: false,
      },
    }),
  ]);

  return NextResponse.json({ items, unreadCount });
});

export const PATCH = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const parsed = await parseBody(req, patchNotificationSchema);
  if (parsed.error) return parsed.error;
  const { id, markAllRead } = parsed.data;

  if (markAllRead) {
    await prisma.notification.updateMany({
      where: {
        OR: [{ userId: session.userId }, { userId: null }],
        isRead: false,
      },
      data: { isRead: true },
    });
    return NextResponse.json({ ok: true });
  }

  if (id) {
    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const id = new URL(req.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "Thiếu mã thông báo");

  await prisma.notification.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
