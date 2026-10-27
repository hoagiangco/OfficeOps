import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, audit } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";
import { customerGroupRepo } from "@/lib/customerGroupRepo";

const createGroupSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên loại khách hàng"),
  code: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  color: z.string().trim().optional().default("#2563eb"),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export const GET = withErrors(async () => {
  const s = await requirePermission("customer:view");
  if (s instanceof NextResponse) return s;

  const groups = await customerGroupRepo.getAll();
  return NextResponse.json({ groups });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("customer:group-manage");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createGroupSchema);
  if (r.error) return r.error;

  const { name, code, description, color, sortOrder } = r.data;

  const existingName = await customerGroupRepo.getByName(name);
  if (existingName) {
    return NextResponse.json({ error: `Loại khách hàng "${name}" đã tồn tại` }, { status: 409 });
  }

  if (code) {
    const existingCode = await customerGroupRepo.getByCode(code);
    if (existingCode) {
      return NextResponse.json({ error: `Mã loại "${code}" đã được sử dụng` }, { status: 409 });
    }
  }

  const created = await customerGroupRepo.create({
    name,
    code,
    description,
    color,
    sortOrder,
  });

  await audit(s.userId, "CUSTOMER_GROUP_CREATE", "CustomerGroup", created.id, { name: created.name });

  return NextResponse.json(created, { status: 201 });
});
