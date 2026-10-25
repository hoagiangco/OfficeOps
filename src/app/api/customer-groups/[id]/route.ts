import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";
import { customerGroupRepo } from "@/lib/customerGroupRepo";

type Ctx = { params: Promise<{ id: string }> };

const patchGroupSchema = z
  .object({
    name: z.string().trim().min(1, "Vui lòng nhập tên loại khách hàng"),
    code: z.string().trim().nullable(),
    description: z.string().trim().nullable(),
    color: z.string().trim(),
    sortOrder: z.coerce.number().int(),
  })
  .partial();

export const PATCH = withErrors(async (req: Request, { params }: Ctx) => {
  const s = await requirePermission("customer:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await customerGroupRepo.getById(id);
  if (!current) {
    return NextResponse.json({ error: "Loại khách hàng không tồn tại" }, { status: 404 });
  }

  const r = await parseBody(req, patchGroupSchema);
  if (r.error) return r.error;

  const { name, code } = r.data;

  if (name && name !== current.name) {
    const dup = await customerGroupRepo.getByName(name);
    if (dup && dup.id !== id) {
      return NextResponse.json({ error: `Tên loại khách hàng "${name}" đã tồn tại` }, { status: 409 });
    }
  }

  if (code && code !== current.code) {
    const dupCode = await customerGroupRepo.getByCode(code);
    if (dupCode && dupCode.id !== id) {
      return NextResponse.json({ error: `Mã loại "${code}" đã được sử dụng` }, { status: 409 });
    }
  }

  const updated = await customerGroupRepo.update(id, r.data);

  await audit(s.userId, "CUSTOMER_GROUP_UPDATE", "CustomerGroup", id, {
    oldName: current.name,
    newName: updated.name,
  });

  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (_req: Request, { params }: Ctx) => {
  const s = await requirePermission("customer:write");
  if (s instanceof NextResponse) return s;

  const { id } = await params;
  const current = await customerGroupRepo.getById(id);
  if (!current) {
    return NextResponse.json({ error: "Loại khách hàng không tồn tại" }, { status: 404 });
  }

  try {
    await customerGroupRepo.delete(id);
    await audit(s.userId, "CUSTOMER_GROUP_DELETE", "CustomerGroup", id, { name: current.name });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Không thể xóa loại khách hàng";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
});
