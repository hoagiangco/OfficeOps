import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { pagingSchema, parseQuery, withErrors } from "@/lib/http";

export const GET = withErrors(async (req: Request) => {
  const s = await requirePermission("audit:view");
  if (s instanceof NextResponse) return s;

  const { page, pageSize, q } = parseQuery(req, pagingSchema);
  const sp = new URL(req.url).searchParams;
  const action = sp.get("action");
  const entity = sp.get("entity");

  const where = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" as const } },
            { entity: { contains: q, mode: "insensitive" as const } },
            { entityId: { contains: q, mode: "insensitive" as const } },
            { user: { name: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
});
