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
