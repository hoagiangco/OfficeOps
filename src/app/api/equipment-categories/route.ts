import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { parseBody, withErrors } from "@/lib/http";

const createCategorySchema = z.object({
  code: z.string().trim().optional().nullable(),
  name: z.string().trim().min(1, "Vui lòng nhập tên danh mục"),
  description: z.string().trim().optional().nullable(),
  parentId: z.string().trim().optional().nullable(),
  sortOrder: z.coerce.number().int().optional().default(0),
});

export interface CategoryTreeNode {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  parentId: string | null;
  sortOrder: number;
  level: number;
  fullPath: string;
  directEquipmentCount: number;
  totalEquipmentCount: number;
  children: CategoryTreeNode[];
}

export const GET = withErrors(async () => {
  const s = await requirePermission("equipment:read");
  if (s instanceof NextResponse) return s;

  const categories = await prisma.equipmentCategory.findMany({
    include: {
      _count: {
        select: { equipment: true },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // Build map
  const nodeMap = new Map<string, CategoryTreeNode>();
  for (const cat of categories) {
    nodeMap.set(cat.id, {
      id: cat.id,
      code: cat.code,
      name: cat.name,
      description: cat.description,
      parentId: cat.parentId,
      sortOrder: cat.sortOrder,
      level: 1,
      fullPath: cat.name,
      directEquipmentCount: cat._count.equipment,
      totalEquipmentCount: cat._count.equipment,
      children: [],
    });
  }

  const roots: CategoryTreeNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Recursive pass to compute level, fullPath, and totalEquipmentCount (including descendants)
  const flatList: Omit<CategoryTreeNode, "children">[] = [];
  const traverse = (nodes: CategoryTreeNode[], level: number, parentPath: string): number => {
    let sum = 0;
    for (const n of nodes) {
      n.level = level;
      n.fullPath = parentPath ? `${parentPath} › ${n.name}` : n.name;
      const flatItem = {
        id: n.id,
        code: n.code,
        name: n.name,
        description: n.description,
        parentId: n.parentId,
        sortOrder: n.sortOrder,
        level: n.level,
        fullPath: n.fullPath,
        directEquipmentCount: n.directEquipmentCount,
        totalEquipmentCount: 0,
      };
      flatList.push(flatItem);
      const childSum = traverse(n.children, level + 1, n.fullPath);
      n.totalEquipmentCount = n.directEquipmentCount + childSum;
      flatItem.totalEquipmentCount = n.totalEquipmentCount;
      sum += n.totalEquipmentCount;
    }
    return sum;
  };

  traverse(roots, 1, "");

  return NextResponse.json({
    tree: roots,
    flat: flatList,
  });
});

export const POST = withErrors(async (req: Request) => {
  const s = await requirePermission("equipment:write");
  if (s instanceof NextResponse) return s;

  const r = await parseBody(req, createCategorySchema);
  if (r.error) return r.error;

  const { code, name, description, parentId, sortOrder } = r.data;

  if (parentId) {
    const parent = await prisma.equipmentCategory.findUnique({ where: { id: parentId } });
    if (!parent) {
      return NextResponse.json({ error: "Danh mục cha không tồn tại" }, { status: 400 });
    }
  }

  if (code) {
    const existing = await prisma.equipmentCategory.findUnique({ where: { code } });
    if (existing) {
      return NextResponse.json({ error: "Mã danh mục đã tồn tại" }, { status: 409 });
    }
  }

  const created = await prisma.equipmentCategory.create({
    data: {
      code: code || null,
      name,
      description: description || null,
      parentId: parentId || null,
      sortOrder: sortOrder ?? 0,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "EQUIPMENT_CATEGORY_CREATE",
      entity: "EquipmentCategory",
      entityId: created.id,
      meta: { name, parentId },
    },
  });

  return NextResponse.json(created, { status: 201 });
});
