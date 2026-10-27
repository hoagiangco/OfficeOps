import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { checkUserPermission } from "@/lib/rbacService";
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

// Hàm nhận diện Hãng sản xuất dựa trên chuỗi Model nếu brand để trống
function detectBrand(modelName: string, existingBrand?: string | null): string {
  if (existingBrand && existingBrand.trim()) return existingBrand.trim();
  const lower = modelName.toLowerCase();
  if (lower.includes("ricoh") || lower.startsWith("mp ") || lower.startsWith("im ")) return "Ricoh";
  if (lower.includes("canon") || lower.startsWith("ir") || lower.startsWith("lbp")) return "Canon";
  if (lower.includes("toshiba") || lower.startsWith("e-studio")) return "Toshiba";
  if (lower.includes("xerox") || lower.includes("fujifilm") || lower.startsWith("docu")) return "Xerox / Fujifilm";
  if (lower.includes("hp ") || lower.startsWith("hp ") || lower.includes("laserjet")) return "HP";
  if (lower.includes("konica") || lower.includes("bizhub")) return "Konica Minolta";
  if (lower.includes("brother")) return "Brother";
  if (lower.includes("epson")) return "Epson";
  return "Dòng máy khác";
}

export const GET = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const equipmentId = sp.get("equipmentId");
  const modelQuery = sp.get("model");
  const partId = sp.get("partId");
  const getCatalog = sp.get("catalog") === "true";

  // === CASE 0: LẤY CATALOGUE TẤT CẢ DÒNG MÁY PHỤC VỤ GÁN CHECK / UNCHECK CHUYÊN NGHIỆP ===
  if (getCatalog) {
    const [equipments, allParts, brandsFromDb] = await Promise.all([
      prisma.equipment.findMany({
        select: {
          id: true,
          code: true,
          serialNumber: true,
          model: true,
          brand: true,
          type: true,
          status: true,
          customer: { select: { id: true, name: true, phone: true } },
        },
      }),
      prisma.part.findMany({
        where: { isActive: true },
        select: {
          id: true,
          partCode: true,
          name: true,
          unit: true,
          category: true,
          partCategory: { select: { id: true, name: true, color: true } },
          compatibleModels: true,
          minThreshold: true,
          batches: { select: { quantity: true } },
        },
        orderBy: [{ partCode: "asc" }],
      }),
      prisma.equipmentBrand.findMany({
        orderBy: { sortOrder: "asc" },
      }),
    ]);

    // Bản đồ Model -> Thông tin máy & Hãng
    const modelMap = new Map<
      string,
      {
        model: string;
        brand: string;
        fullName: string;
        type: string;
        totalUnits: number;
        activeUnits: number;
        equipments: { id: string; code: string | null; serialNumber: string; customerName: string | null }[];
      }
    >();

    equipments.forEach((eq) => {
      const model = eq.model.trim();
      if (!model) return;
      const brand = detectBrand(model, eq.brand);
      const fullName = model.toLowerCase().includes(brand.toLowerCase()) ? model : `${brand} ${model}`;

      if (!modelMap.has(model)) {
        modelMap.set(model, {
          model,
          brand,
          fullName,
          type: eq.type || "Máy Photocopy",
          totalUnits: 0,
          activeUnits: 0,
          equipments: [],
        });
      }

      const item = modelMap.get(model)!;
      item.totalUnits += 1;
      if (["ACTIVE", "FAULTY", "WAITING_PARTS"].includes(eq.status)) {
        item.activeUnits += 1;
      }
      item.equipments.push({
        id: eq.id,
        code: eq.code,
        serialNumber: eq.serialNumber,
        customerName: eq.customer?.name || null,
      });
    });

    // Bổ sung các model đã khai báo trong danh mục vật tư nhưng chưa có máy thực tế trong kho
    allParts.forEach((p) => {
      (p.compatibleModels || []).forEach((cm) => {
        const trimmed = cm.trim();
        if (!trimmed) return;
        if (!modelMap.has(trimmed)) {
          const brand = detectBrand(trimmed);
          const fullName = trimmed.toLowerCase().includes(brand.toLowerCase()) ? trimmed : `${brand} ${trimmed}`;
          modelMap.set(trimmed, {
            model: trimmed,
            brand,
            fullName,
            type: "Dòng máy tương thích",
            totalUnits: 0,
            activeUnits: 0,
            equipments: [],
          });
        }
      });
    });

    // Nhóm theo Hãng
    const groupedBrandsMap = new Map<string, Array<(typeof modelMap) extends Map<string, infer V> ? V : never>>();
    
    // Đảm bảo thứ tự hãng phổ biến lên trước
    const defaultBrandOrder = ["Ricoh", "Canon", "Toshiba", "Xerox / Fujifilm", "HP", "Konica Minolta", "Brother", "Dòng máy khác"];
    defaultBrandOrder.forEach((b) => groupedBrandsMap.set(b, []));
    brandsFromDb.forEach((b) => {
      if (!groupedBrandsMap.has(b.name)) groupedBrandsMap.set(b.name, []);
    });

    modelMap.forEach((m) => {
      if (!groupedBrandsMap.has(m.brand)) {
        groupedBrandsMap.set(m.brand, []);
      }
      groupedBrandsMap.get(m.brand)!.push(m);
    });

    const modelsByBrand = Array.from(groupedBrandsMap.entries())
      .filter(([_, models]) => models.length > 0)
      .map(([brand, models]) => ({
        brand,
        models: models.sort((a, b) => a.model.localeCompare(b.model)),
        totalModels: models.length,
        totalMachines: models.reduce((sum, m) => sum + m.totalUnits, 0),
        totalActiveMachines: models.reduce((sum, m) => sum + m.activeUnits, 0),
      }));

    // Nếu có truyền partId kèm theo, tải luôn thông tin vật tư
    let targetPart = null;
    if (partId) {
      targetPart = await prisma.part.findUnique({
        where: { id: partId },
        include: {
          partCategory: true,
          batches: { orderBy: { receivedDate: "asc" } },
        },
      });
    }

    const partsEnriched = allParts.map((p) => ({
      id: p.id,
      partCode: p.partCode,
      name: p.name,
      unit: p.unit,
      category: p.partCategory?.name || p.category || "Vật tư",
      partCategory: p.partCategory,
      compatibleModels: p.compatibleModels || [],
      minThreshold: p.minThreshold,
      currentQuantity: (p.batches || []).reduce((sum, b) => sum + b.quantity, 0),
    }));

    return NextResponse.json({
      modelsByBrand,
      allModels: Array.from(modelMap.values()).sort((a, b) => a.model.localeCompare(b.model)),
      totalDistinctModels: modelMap.size,
      parts: partsEnriched,
      part: targetPart
        ? {
            ...targetPart,
            currentQuantity: targetPart.batches.reduce((sum, b) => sum + b.quantity, 0),
          }
        : null,
    });
  }

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

// === CẬP NHẬT / GÁN DÒNG MÁY TƯƠNG THÍCH CHO VẬT TƯ (PUT) ===
export const PUT = withErrors(async (req: Request) => {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const canManage = await checkUserPermission(s.userId, s.role, "part:manage");

  if (!canManage) {
    return NextResponse.json({ error: "Không có quyền gán tương thích thiết bị" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const { partId, compatibleModels } = body || {};

  if (!partId) {
    return NextResponse.json({ error: "Thiếu ID vật tư" }, { status: 400 });
  }

  if (!Array.isArray(compatibleModels)) {
    return NextResponse.json({ error: "Danh sách dòng máy tương thích không hợp lệ" }, { status: 400 });
  }

  const existingPart = await prisma.part.findUnique({
    where: { id: partId },
  });

  if (!existingPart) {
    return NextResponse.json({ error: "Không tìm thấy vật tư tương ứng" }, { status: 404 });
  }

  // Chuẩn hóa danh sách model: loại bỏ trùng lặp và khoảng trắng thừa
  const cleanedModels = Array.from(
    new Set(compatibleModels.map((m: string) => String(m).trim()).filter(Boolean))
  );

  const updatedPart = await prisma.part.update({
    where: { id: partId },
    data: {
      compatibleModels: cleanedModels,
    },
    include: {
      partCategory: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: s.userId,
      action: "PART_COMPATIBILITY_ASSIGN",
      entity: "Part",
      entityId: partId,
      meta: {
        partCode: updatedPart.partCode,
        name: updatedPart.name,
        modelsCount: cleanedModels.length,
        compatibleModels: cleanedModels,
      },
    },
  });

  return NextResponse.json({
    success: true,
    part: updatedPart,
    compatibleModels: cleanedModels,
    message: `Đã cập nhật tương thích cho vật tư "${updatedPart.name}" (${cleanedModels.length} dòng máy)`,
  });
});
