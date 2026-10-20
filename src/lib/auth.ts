import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { decrypt, SESSION_COOKIE, type SessionPayload } from "./session";
import { can, type Permission } from "./rbac";
import { prisma } from "./prisma";

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  return decrypt(store.get(SESSION_COOKIE)?.value);
}

/**
 * Dùng trong Route Handler: trả về session hoặc NextResponse lỗi (401/403).
 * const r = await requirePermission("stock:manage");
 * if (r instanceof NextResponse) return r;
 */
export async function requirePermission(perm: Permission): Promise<SessionPayload | NextResponse> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(session.role, perm)) {
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }
  return session;
}

export async function audit(
  userId: string | null | undefined,
  action: string,
  entity: string,
  entityId?: string | null,
  meta?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      userId: userId ?? null,
      action,
      entity,
      entityId: entityId ?? null,
      meta: meta ? (meta as Prisma.InputJsonValue) : undefined,
    },
  });
}
