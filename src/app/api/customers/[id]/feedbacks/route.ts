import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

const feedbackSchema = z.object({
  content: z.string().trim().min(1, "Nội dung phản hồi không được để trống"),
});

export const POST = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const r = await parseBody(req, feedbackSchema);
  if (r.error) return r.error;

  const { id } = await params;
  const user = await prisma.user.findUnique({
    where: { id: s.userId },
    select: { name: true },
  });

  const feedback = await prisma.customerFeedback.create({
    data: {
      customerId: id,
      content: r.data.content,
      authorName: user?.name || "Hệ thống",
    },
  });

  return NextResponse.json(feedback, { status: 201 });
});
