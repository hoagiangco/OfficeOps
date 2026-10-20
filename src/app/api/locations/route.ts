import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession, audit } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { parseBody, withErrors, HttpError } from "@/lib/http";

// Tạo vị trí lắp đặt: Chi nhánh -> Tòa nhà -> Phòng ban
const createSchema = z.discriminatedUnion("level", [
  z.object({
    level: z.literal("branch"),
    customerId: z.string().min(1),
    name: z.string().trim().min(1, "Vui lòng nhập tên chi nhánh"),
    address: z.string().trim().nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
  }),
  z.object({
    level: z.literal("building"),
    branchId: z.string().min(1),
    name: z.string().trim().min(1, "Vui lòng nhập tên tòa nhà"),
  }),
  z.object({
    level: z.literal("department"),
    buildingId: z.string().min(1),
    name: z.string().trim().min(1, "Vui lòng nhập tên phòng ban / tầng"),
  }),
]);

const updateSchema = z.discriminatedUnion("level", [
  z.object({
    level: z.literal("branch"),
    id: z.string().min(1),
    name: z.string().trim().min(1, "Tên chi nhánh không được để trống"),
    address: z.string().trim().nullable().optional(),
  }),
  z.object({
    level: z.literal("building"),
    id: z.string().min(1),
    name: z.string().trim().min(1, "Tên tòa nhà không được để trống"),
  }),
  z.object({
    level: z.literal("department"),
    id: z.string().min(1),
    name: z.string().trim().min(1, "Tên phòng ban không được để trống"),
  }),
]);

const deleteSchema = z.object({
  level: z.enum(["branch", "building", "department"]),
  id: z.string().min(1),
});

export const POST = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "customer:write") && !can(s.role, "equipment:write")) {
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }
  const r = await parseBody(req, createSchema);
  if (r.error) return r.error;
  const d = r.data;
  const created =
    d.level === "branch"
      ? await prisma.branch.create({
          data: {
            customerId: d.customerId,
            name: d.name,
            address: d.address || null,
            latitude: d.latitude,
            longitude: d.longitude,
          },
        })
      : d.level === "building"
      ? await prisma.building.create({ data: { branchId: d.branchId, name: d.name } })
      : await prisma.department.create({ data: { buildingId: d.buildingId, name: d.name } });

  await audit(s.userId, "LOCATION_CREATE", d.level, created.id, { name: d.name });
  return NextResponse.json(created, { status: 201 });
});

export const PATCH = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "customer:write") && !can(s.role, "equipment:write")) {
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }
  const r = await parseBody(req, updateSchema);
  if (r.error) return r.error;
  const d = r.data;

  const updated =
    d.level === "branch"
      ? await prisma.branch.update({
          where: { id: d.id },
          data: { name: d.name, address: d.address ? d.address : null },
        })
      : d.level === "building"
      ? await prisma.building.update({
          where: { id: d.id },
          data: { name: d.name },
        })
      : await prisma.department.update({
          where: { id: d.id },
          data: { name: d.name },
        });

  await audit(s.userId, "LOCATION_UPDATE", d.level, d.id, { name: d.name });
  return NextResponse.json(updated);
});

export const DELETE = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!can(s.role, "customer:write") && !can(s.role, "equipment:write")) {
    return NextResponse.json({ error: "Không có quyền thực hiện" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  const parsed = deleteSchema.safeParse({
    level: sp.get("level"),
    id: sp.get("id"),
  });
  if (!parsed.success) {
    throw new HttpError(400, "Thiếu thông tin vị trí cần xóa");
  }
  const { level, id } = parsed.data;

  if (level === "department") {
    const eqCount = await prisma.equipment.count({ where: { departmentId: id } });
    if (eqCount > 0) {
      throw new HttpError(
        409,
        `Phòng ban này đang có ${eqCount} thiết bị lắp đặt, vui lòng chuyển thiết bị trước khi xóa`
      );
    }
    await prisma.department.delete({ where: { id } });
  } else if (level === "building") {
    const eqCount = await prisma.equipment.count({
      where: { department: { buildingId: id } },
    });
    if (eqCount > 0) {
      throw new HttpError(
        409,
        `Tòa nhà này đang có ${eqCount} thiết bị lắp đặt, vui lòng chuyển thiết bị trước khi xóa`
      );
    }
    await prisma.$transaction([
      prisma.department.deleteMany({ where: { buildingId: id } }),
      prisma.building.delete({ where: { id } }),
    ]);
  } else {
    const eqCount = await prisma.equipment.count({
      where: { department: { building: { branchId: id } } },
    });
    if (eqCount > 0) {
      throw new HttpError(
        409,
        `Chi nhánh này đang có ${eqCount} thiết bị lắp đặt, vui lòng chuyển thiết bị trước khi xóa`
      );
    }
    await prisma.$transaction([
      prisma.department.deleteMany({ where: { building: { branchId: id } } }),
      prisma.building.deleteMany({ where: { branchId: id } }),
      prisma.branch.delete({ where: { id } }),
    ]);
  }

  await audit(s.userId, "LOCATION_DELETE", level, id);
  return NextResponse.json({ ok: true });
});
