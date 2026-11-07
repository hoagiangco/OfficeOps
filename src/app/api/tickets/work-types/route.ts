import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, audit } from "@/lib/auth";
import { withErrors, HttpError, parseBody } from "@/lib/http";
import {
  getTicketWorkTypes,
  saveTicketWorkTypes,
  getTicketCustomTypesMap,
  saveTicketCustomTypesMap,
  isSystemTicketType,
} from "@/lib/ticketWorkTypes";

const createWorkTypeSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Tên loại công việc tối thiểu 2 ký tự")
    .max(80, "Tên loại công việc tối đa 80 ký tự"),
});

const updateWorkTypeSchema = z.object({
  code: z.string().trim().min(1, "Thiếu mã loại công việc cần sửa"),
  label: z
    .string()
    .trim()
    .min(2, "Tên loại công việc tối thiểu 2 ký tự")
    .max(80, "Tên loại công việc tối đa 80 ký tự"),
});

// GET: Lấy danh sách Loại công việc
export const GET = withErrors(async () => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const items = await getTicketWorkTypes();
  const labelsMap: Record<string, string> = {};
  for (const item of items) {
    labelsMap[item.code] = item.label;
  }

  return NextResponse.json({ items, labelsMap });
});

// POST: Thêm mới Loại công việc (Không cho phép xóa)
export const POST = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const parsed = await parseBody(req, createWorkTypeSchema);
  if (parsed.error) return parsed.error;
  const newLabel = parsed.data.label.trim();

  const items = await getTicketWorkTypes();
  const existed = items.find(
    (it) =>
      it.label.toLowerCase() === newLabel.toLowerCase() ||
      it.code.toLowerCase() === newLabel.toLowerCase()
  );
  if (existed) {
    throw new HttpError(400, `Loại công việc "${existed.label}" đã tồn tại trong danh sách`);
  }

  const newItem = {
    code: newLabel,
    label: newLabel,
    isSystem: false,
  };

  const updated = [...items, newItem];
  await saveTicketWorkTypes(updated);

  await audit(session.userId, "TICKET_WORK_TYPE_CREATE", "SystemSetting", "TICKET_WORK_TYPES", {
    item: newItem,
  });

  const labelsMap: Record<string, string> = {};
  for (const item of updated) {
    labelsMap[item.code] = item.label;
  }

  return NextResponse.json({ items: updated, item: newItem, labelsMap }, { status: 201 });
});

// PATCH: Sửa tên Loại công việc (Không cho phép xóa)
export const PATCH = withErrors(async (req: Request) => {
  const session = await getSession();
  if (!session) throw new HttpError(401, "Chưa đăng nhập");

  const parsed = await parseBody(req, updateWorkTypeSchema);
  if (parsed.error) return parsed.error;
  const { code, label } = parsed.data;
  const newLabel = label.trim();

  const items = await getTicketWorkTypes();
  const targetIdx = items.findIndex((it) => it.code === code);
  if (targetIdx === -1) {
    throw new HttpError(404, "Không tìm thấy loại công việc cần sửa");
  }

  const duplicate = items.find(
    (it, idx) =>
      idx !== targetIdx &&
      (it.label.toLowerCase() === newLabel.toLowerCase() ||
        (!isSystemTicketType(it.code) && it.code.toLowerCase() === newLabel.toLowerCase()))
  );
  if (duplicate) {
    throw new HttpError(400, `Tên loại công việc "${newLabel}" đã trùng với mục khác`);
  }

  const oldItem = items[targetIdx];
  const isSys = isSystemTicketType(oldItem.code);
  const updatedItem = {
    code: isSys ? oldItem.code : newLabel,
    label: newLabel,
    isSystem: isSys,
  };

  const updated = [...items];
  updated[targetIdx] = updatedItem;
  await saveTicketWorkTypes(updated);

  // Nếu là loại công việc tùy chỉnh và đổi tên, đồng bộ lại map của các phiếu đã gán loại công việc này
  if (!isSys && oldItem.code !== updatedItem.code) {
    const customMap = await getTicketCustomTypesMap();
    let changed = false;
    for (const [ticketId, tType] of Object.entries(customMap)) {
      if (tType === oldItem.code) {
        customMap[ticketId] = updatedItem.code;
        changed = true;
      }
    }
    if (changed) {
      await saveTicketCustomTypesMap(customMap);
    }
  }

  await audit(session.userId, "TICKET_WORK_TYPE_UPDATE", "SystemSetting", "TICKET_WORK_TYPES", {
    oldItem,
    updatedItem,
  });

  const labelsMap: Record<string, string> = {};
  for (const item of updated) {
    labelsMap[item.code] = item.label;
  }

  return NextResponse.json({ items: updated, item: updatedItem, labelsMap });
});
