import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { withErrors } from "@/lib/http";

type TargetEquipmentType = Prisma.EquipmentGetPayload<{
  include: {
    customer: { select: { id: true; name: true } };
    warehouse: { select: { id: true; name: true } };
  };
}> | null;

interface EquipmentSummary {
  id: string;
  code: string | null;
  serialNumber: string;
  model: string;
  brand: string | null;
  status: string;
  customer: { id: string; name: string; phone: string | null; address: string | null } | null;
  warehouse: { id: string; name: string } | null;
}

export const GET = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const equipmentId = sp.get("equipmentId");
  const modelQuery = sp.get("model");
  const partId = sp.get("partId");

  // === CASE 1: TRA CỨU NGƯỢC TỪ VẬT TƯ -> CÁC THIẾT BỊ ĐANG HOẠT ĐỘNG ===
  if (partId) {
    const part = await prisma.part.findUnique({
      where: { id: partId },
      include: {
        partCategory: true,
        batches: {
          orderBy: { receivedDate: "asc" },
        },
      },
    });

    if (!part) {
      return NextResponse.json({ error: "Không tìm thấy vật tư" }, { status: 404 });
    }

    const compatibleModels = part.compatibleModels || [];
    const currentQuantity = part.batches.reduce((sum, b) => sum + b.quantity, 0);

    // Tìm tất cả thiết bị của khách hàng có model trùng khớp
    let matchingEquipments: EquipmentSummary[] = [];
    if (compatibleModels.length > 0) {
      const allEquipments = await prisma.equipment.findMany({
        where: {
          status: { in: ["ACTIVE", "FAULTY", "WAITING_PARTS"] },
        },
        select: {
          id: true,
          code: true,
          serialNumber: true,
          model: true,
          brand: true,
          status: true,
          customer: {
            select: { id: true, name: true, phone: true, address: true },
          },
          warehouse: {
            select: { id: true, name: true },
          },
        },
      });

      // Lọc thiết bị có model khớp với bất kỳ compatibleModel nào
      matchingEquipments = allEquipments.filter((eq) => {
        const fullModel = `${eq.brand || ""} ${eq.model || ""}`.toLowerCase();
        const rawModel = (eq.model || "").toLowerCase();
        return compatibleModels.some((cm) => {
          const cml = cm.toLowerCase();
          return fullModel.includes(cml) || rawModel.includes(cml) || cml.includes(rawModel);
        });
      });
    }

    return NextResponse.json({
      part: {
        ...part,
        currentQuantity,
        isLowStock: currentQuantity <= part.minThreshold,
      },
      compatibleModels,
      matchingEquipmentsCount: matchingEquipments.length,
      matchingEquipments,
    });
  }

  // === CASE 2: TRA CỨU TỪ THIẾT BỊ HOẶC MODEL -> DANH SÁCH VẬT TƯ TƯƠNG THÍCH ===
  let targetModel = "";
  let targetBrand = "";
  let targetEquipment: TargetEquipmentType = null;

  if (equipmentId) {
    targetEquipment = await prisma.equipment.findUnique({
      where: { id: equipmentId },
      include: {
        customer: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
      },
    });

    if (!targetEquipment) {
      return NextResponse.json({ error: "Không tìm thấy thiết bị" }, { status: 404 });
    }
    targetModel = targetEquipment.model || "";
    targetBrand = targetEquipment.brand || "";
  } else if (modelQuery) {
    targetModel = modelQuery.trim();
  }

  // Nếu không truyền gì, trả về danh sách các model thiết bị phổ biến để gợi ý
  if (!targetModel && !equipmentId) {
    const allEquipments = await prisma.equipment.findMany({
      select: { model: true, brand: true, type: true },
      distinct: ["model"],
    });

    const allParts = await prisma.part.findMany({
      select: { compatibleModels: true },
    });

    const modelSet = new Set<string>();
    allEquipments.forEach((e) => {
      if (e.model) modelSet.add(e.model);
    });
    allParts.forEach((p) => {
      (p.compatibleModels || []).forEach((m) => modelSet.add(m));
    });

    return NextResponse.json({
      suggestedModels: Array.from(modelSet).filter(Boolean).sort(),
    });
  }

  // Truy vấn tất cả vật tư đang hoạt động
  const allParts = await prisma.part.findMany({
    where: { isActive: true },
    include: {
      partCategory: true,
      batches: {
        orderBy: { receivedDate: "asc" },
      },
    },
    orderBy: [
      { partCategory: { sortOrder: "asc" } },
      { name: "asc" },
    ],
  });

  const queryFull = `${targetBrand} ${targetModel}`.trim().toLowerCase();
  const queryModel = targetModel.toLowerCase();

  // Thuật toán so khớp tương thích thông minh
  const compatibleParts = allParts.filter((part) => {
    const list = (part.compatibleModels || []).map((m) => m.toLowerCase());
    const partName = part.name.toLowerCase();

    // 1. Khớp trong mảng compatibleModels
    const hasArrayMatch = list.some((cm) => {
      return (
        cm === queryModel ||
        cm === queryFull ||
        queryFull.includes(cm) ||
        queryModel.includes(cm) ||
        cm.includes(queryModel)
      );
    });
    if (hasArrayMatch) return true;

    // 2. Khớp trong tên vật tư
    if (partName.includes(queryModel)) return true;

    return false;
  });

  // Tính tổng tồn kho và cấu trúc hóa theo danh mục
  const enrichedParts = compatibleParts.map((p) => {
    const currentQuantity = p.batches.reduce((sum, b) => sum + b.quantity, 0);
    return {
      id: p.id,
      partCode: p.partCode,
      name: p.name,
      barcode: p.barcode,
      category: p.partCategory?.name || p.category || "Chưa phân loại",
      categoryColor: p.partCategory?.color || "#64748b",
      unit: p.unit,
      minThreshold: p.minThreshold,
      currentQuantity,
      isLowStock: currentQuantity <= p.minThreshold,
      isOutOfStock: currentQuantity <= 0,
      salePrice: p.salePrice,
      costPrice: p.costPrice,
      specs: p.specs,
      notes: p.notes,
      compatibleModels: p.compatibleModels,
      batches: p.batches.map((b) => ({
        id: b.id,
        batchCode: b.batchCode,
        quantity: b.quantity,
        location: b.location,
        receivedDate: b.receivedDate,
      })),
    };
  });

  // Gom nhóm theo danh mục vật tư để hiển thị trực quan (Mực, Trống, Sấy, Kéo giấy...)
  const groups: Record<string, { category: string; color: string; parts: typeof enrichedParts }> = {};
  enrichedParts.forEach((item) => {
    const catName = item.category;
    if (!groups[catName]) {
      groups[catName] = {
        category: catName,
        color: item.categoryColor,
        parts: [],
      };
    }
    groups[catName].parts.push(item);
  });

  return NextResponse.json({
    equipment: targetEquipment,
    query: {
      model: targetModel,
      brand: targetBrand,
    },
    totalCompatibleParts: enrichedParts.length,
    groups: Object.values(groups),
    parts: enrichedParts,
  });
});
