import { prisma } from "@/lib/prisma";

/** Hợp đồng được gán phải thuộc đúng khách hàng của thiết bị. */
export async function validateContractOwner(customerId?: string | null, contractId?: string | null) {
  if (!contractId) return null;
  const contract = await prisma.contract.findUnique({ where: { id: contractId }, select: { customerId: true } });
  if (!contract) return "Hợp đồng không tồn tại";
  if (!customerId) return "Cần chọn khách hàng khi gán hợp đồng";
  if (contract.customerId !== customerId) return "Hợp đồng không thuộc khách hàng này";
  return null;
}

/** Lấy danh sách ID của danh mục hiện tại và toàn bộ danh mục con/cháu nhiều cấp của nó. */
export async function getCategoryDescendantIds(categoryId: string): Promise<string[]> {
  const all = await prisma.equipmentCategory.findMany({
    select: { id: true, parentId: true },
  });
  const childrenMap = new Map<string, string[]>();
  for (const c of all) {
    if (c.parentId) {
      const list = childrenMap.get(c.parentId) ?? [];
      list.push(c.id);
      childrenMap.set(c.parentId, list);
    }
  }
  const result: string[] = [];
  const stack = [categoryId];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    result.push(curr);
    const kids = childrenMap.get(curr) ?? [];
    for (const k of kids) {
      stack.push(k);
    }
  }
  return result;
}

