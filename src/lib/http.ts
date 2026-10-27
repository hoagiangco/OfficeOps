import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Đọc & validate body JSON. Trả về { data } hoặc { error } (NextResponse 400). */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<{ data: z.infer<T>; error?: undefined } | { data?: undefined; error: NextResponse }> {
  const raw = await req.json().catch(() => null);
  let input = raw;
  if (req.method === "POST" && raw && typeof raw === "object" && !Array.isArray(raw)) {
    input = Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([k, v]) => [
        k,
        v === null || v === "" ? undefined : v,
      ]),
    );
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return {
      error: NextResponse.json(
        {
          error: firstIssue ? `Dữ liệu không hợp lệ (${firstIssue})` : "Dữ liệu không hợp lệ",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      ),
    };
  }
  return { data: parsed.data };
}

/** Bọc handler: chuyển lỗi Prisma thường gặp thành HTTP status phù hợp. */
export function withErrors<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e && typeof e === "object" && "digest" in e) {
        throw e;
      }
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      if (e instanceof z.ZodError) {
        return NextResponse.json({ error: "Tham số không hợp lệ", details: e.flatten().fieldErrors }, { status: 400 });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === "P2002") return NextResponse.json({ error: "Dữ liệu đã tồn tại (trùng giá trị duy nhất)" }, { status: 409 });
        if (e.code === "P2025") return NextResponse.json({ error: "Không tìm thấy bản ghi" }, { status: 404 });
        if (e.code === "P2003") return NextResponse.json({ error: "Dữ liệu liên quan không hợp lệ hoặc đang được sử dụng" }, { status: 409 });
      }
      if (e instanceof Prisma.PrismaClientUnknownRequestError && /23001|violates RESTRICT/.test(e.message)) {
        // Prisma 6 không map mã Postgres 23001 (restrict_violation) sang P2003
        return NextResponse.json({ error: "Dữ liệu đang được sử dụng, không thể xóa" }, { status: 409 });
      }
      console.error(e);
      return NextResponse.json({ error: "Lỗi máy chủ" }, { status: 500 });
    }
  };
}

export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(1000).default(20),
  q: z.string().trim().optional(),
});

export function parseQuery<T extends z.ZodTypeAny>(req: Request, schema: T) {
  return schema.parse(Object.fromEntries(new URL(req.url).searchParams));
}
