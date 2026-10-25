import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors, parseBody, HttpError } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const createAttachmentSchema = z.object({
  url: z.string().trim().min(1, "URL file không được để trống"),
  kind: z.enum(["PHOTO", "REPORT", "COUNTER_PHOTO", "OTHER"]).default("PHOTO"),
});

export const GET = withErrors(async (_req: Request, { params }: Ctx) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");
  const { id } = await params;

  const attachments = await prisma.ticketAttachment.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(attachments);
});

export const POST = withErrors(async (req: Request, { params }: Ctx) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");
  const { id } = await params;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, code: true, status: true },
  });
  if (!ticket) throw new HttpError(404, "Không tìm thấy phiếu kỹ thuật");

  // Phiếu đã hoàn thành chỉ cho phép Super Admin thêm đính kèm
  if (ticket.status === "COMPLETED" && session.role !== "SUPER_ADMIN") {
    throw new HttpError(
      403,
      "Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc (Super Admin) mới có quyền thêm file đính kèm"
    );
  }

  const parsed = await parseBody(req, createAttachmentSchema);
  if (parsed.error) return parsed.error;
  const data = parsed.data;

  const created = await prisma.ticketAttachment.create({
    data: {
      ticketId: id,
      url: data.url,
      kind: data.kind,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "TICKET_ATTACHMENT_ADD",
      entity: "TicketAttachment",
      entityId: created.id,
      meta: { ticketCode: ticket.code, kind: data.kind, url: data.url },
    },
  });

  return NextResponse.json(created, { status: 201 });
});

export const DELETE = withErrors(async (req: Request, { params }: Ctx) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");
  const { id } = await params;

  const sp = new URL(req.url).searchParams;
  const attachmentId = sp.get("attachmentId");
  if (!attachmentId) throw new HttpError(400, "Thiếu mã đính kèm (attachmentId)");

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!ticket) throw new HttpError(404, "Không tìm thấy phiếu kỹ thuật");

  // Phiếu đã hoàn thành chỉ cho phép Super Admin xóa đính kèm
  if (ticket.status === "COMPLETED" && session.role !== "SUPER_ADMIN") {
    throw new HttpError(
      403,
      "Phiếu kỹ thuật đã hoàn thành, chỉ Giám đốc (Super Admin) mới có quyền xóa file đính kèm"
    );
  }

  const item = await prisma.ticketAttachment.findFirst({
    where: { id: attachmentId, ticketId: id },
  });
  if (!item) throw new HttpError(404, "Không tìm thấy file đính kèm");

  await prisma.ticketAttachment.delete({ where: { id: attachmentId } });

  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: "TICKET_ATTACHMENT_DELETE",
      entity: "TicketAttachment",
      entityId: attachmentId,
      meta: { url: item.url, kind: item.kind },
    },
  });

  return NextResponse.json({ ok: true });
});
