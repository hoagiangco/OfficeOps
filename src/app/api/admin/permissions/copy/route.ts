import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";
import { copyUserPermissions } from "@/lib/rbacService";

const copySchema = z.object({
  sourceUserId: z.string().min(1, "Thiếu ID người dùng nguồn"),
  targetUserId: z.string().min(1, "Thiếu ID người dùng đích"),
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("user:permission-manage");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, copySchema);
  if (r.error) return r.error;

  const permissions = await copyUserPermissions(
    r.data.sourceUserId,
    r.data.targetUserId,
    s.userId
  );

  return NextResponse.json({
    success: true,
    message: "Đã sao chép phân quyền thành công",
    permissions,
  });
});
