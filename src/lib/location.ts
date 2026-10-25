import { prisma } from "@/lib/prisma";

export interface LocationConfig {
  preset: "enterprise" | "banking" | "hospital" | "school" | "factory" | "custom";
  level1: string;
  level2: string;
  level3: string;
}

export const LOCATION_PRESETS: Record<
  LocationConfig["preset"],
  { label: string; description: string; config: LocationConfig }
> = {
  enterprise: {
    label: "Doanh nghiệp / Công ty (Tiêu chuẩn)",
    description: "Chi nhánh / Địa điểm › Tòa nhà / Khu vực › Tầng / Phòng ban",
    config: {
      preset: "enterprise",
      level1: "Chi nhánh / Địa điểm",
      level2: "Tòa nhà / Khu vực",
      level3: "Tầng / Phòng ban",
    },
  },
  banking: {
    label: "Ngân hàng / Bảo hiểm / Tài chính",
    description: "Chi nhánh tỉnh / TP › Phòng giao dịch / Khối › Bộ phận / Quầy",
    config: {
      preset: "banking",
      level1: "Chi nhánh tỉnh / TP",
      level2: "Phòng giao dịch / Khối",
      level3: "Bộ phận / Quầy giao dịch",
    },
  },
  hospital: {
    label: "Bệnh viện / Y tế / Trung tâm",
    description: "Cơ sở điều trị › Khu / Nhà điều trị › Khoa / Phòng khám",
    config: {
      preset: "hospital",
      level1: "Cơ sở khám chữa bệnh",
      level2: "Khu / Nhà điều trị",
      level3: "Khoa / Phòng chuyên môn",
    },
  },
  school: {
    label: "Trường học / Viện đào tạo",
    description: "Cơ sở đào tạo › Dãy nhà / Khu hiệu bộ › Phòng học / Khoa",
    config: {
      preset: "school",
      level1: "Cơ sở đào tạo",
      level2: "Dãy nhà / Khu hiệu bộ",
      level3: "Phòng học / Bộ môn / Khoa",
    },
  },
  factory: {
    label: "Nhà máy / Xưởng sản xuất / KCN",
    description: "Nhà máy / Khu vực › Phân xưởng / Kho › Dây chuyền / Tổ đội",
    config: {
      preset: "factory",
      level1: "Nhà máy / Khu sản xuất",
      level2: "Phân xưởng / Khu vực",
      level3: "Dây chuyền / Tổ đội / Chuyền",
    },
  },
  custom: {
    label: "Tùy chỉnh tự do",
    description: "Người dùng tự định nghĩa tên gọi cho từng cấp",
    config: {
      preset: "custom",
      level1: "Cấp 1",
      level2: "Cấp 2",
      level3: "Cấp 3",
    },
  },
};

export const DEFAULT_LOCATION_CONFIG = LOCATION_PRESETS.enterprise.config;

export function resolveLocationConfig(rawConfig: unknown): LocationConfig {
  if (!rawConfig || typeof rawConfig !== "object") {
    return DEFAULT_LOCATION_CONFIG;
  }
  const c = rawConfig as Partial<LocationConfig>;
  const presetKey =
    c.preset && c.preset in LOCATION_PRESETS ? c.preset : "enterprise";
  const defaultCfg = LOCATION_PRESETS[presetKey].config;

  return {
    preset: presetKey,
    level1: (c.level1 && c.level1.trim()) || defaultCfg.level1,
    level2: (c.level2 && c.level2.trim()) || defaultCfg.level2,
    level3: (c.level3 && c.level3.trim()) || defaultCfg.level3,
  };
}

/**
 * Định dạng đường dẫn vị trí từ Cấp 1, Cấp 2 hoặc Cấp 3
 */
export function formatLocationPath(
  eq: {
    branchId?: string | null;
    buildingId?: string | null;
    departmentId?: string | null;
    branch?: { name: string } | null;
    building?: { name: string; branch?: { name: string } | null } | null;
    department?: {
      name: string;
      building?: { name: string; branch?: { name: string } | null } | null;
    } | null;
    locationNote?: string | null;
  },
  customerFallback?: {
    branches?: Array<{
      id: string;
      name: string;
      buildings?: Array<{
        id: string;
        name: string;
        departments?: Array<{ id: string; name: string }>;
      }>;
    }>;
  } | null
): string {
  if (eq.department) {
    const bName = eq.department.building?.branch?.name || eq.branch?.name;
    const bdName = eq.department.building?.name || eq.building?.name;
    const parts = [bName, bdName, eq.department.name].filter(Boolean);
    return parts.join(" › ");
  }

  if (eq.building) {
    const bName = eq.building.branch?.name || eq.branch?.name;
    const parts = [bName, eq.building.name].filter(Boolean);
    return parts.join(" › ");
  }

  if (eq.branch) {
    return eq.branch.name;
  }

  // Fallback từ danh sách sơ đồ tổ chức của khách hàng nếu relation chưa được join
  if (customerFallback?.branches && customerFallback.branches.length > 0) {
    if (eq.departmentId) {
      for (const b of customerFallback.branches) {
        for (const bu of b.buildings || []) {
          for (const d of bu.departments || []) {
            if (d.id === eq.departmentId) {
              return [b.name, bu.name, d.name].filter(Boolean).join(" › ");
            }
          }
        }
      }
    }

    if (eq.buildingId) {
      for (const b of customerFallback.branches) {
        for (const bu of b.buildings || []) {
          if (bu.id === eq.buildingId) {
            return [b.name, bu.name].filter(Boolean).join(" › ");
          }
        }
      }
    }

    if (eq.branchId) {
      const foundBranch = customerFallback.branches.find((b) => b.id === eq.branchId);
      if (foundBranch) {
        return foundBranch.name;
      }
    }

    // Nếu khách hàng chỉ có duy nhất 1 chi nhánh và thiết bị chưa chọn cấp nào, hiển thị chi nhánh đó
    if (customerFallback.branches.length === 1 && !eq.branchId && !eq.buildingId && !eq.departmentId) {
      return customerFallback.branches[0].name;
    }
  }

  return "";
}

/**
 * Tự động đồng bộ phân cấp branchId, buildingId, departmentId
 */
export async function resolveLocationIds(input: {
  branchId?: string | null;
  buildingId?: string | null;
  departmentId?: string | null;
}): Promise<{
  branchId: string | null;
  buildingId: string | null;
  departmentId: string | null;
}> {
  if (input.departmentId) {
    const dept = await prisma.department.findUnique({
      where: { id: input.departmentId },
      include: { building: true },
    });
    if (dept) {
      return {
        departmentId: dept.id,
        buildingId: dept.buildingId,
        branchId: dept.building.branchId,
      };
    }
  }

  if (input.buildingId) {
    const bld = await prisma.building.findUnique({
      where: { id: input.buildingId },
    });
    if (bld) {
      return {
        departmentId: null,
        buildingId: bld.id,
        branchId: bld.branchId,
      };
    }
  }

  if (input.branchId) {
    return {
      departmentId: null,
      buildingId: null,
      branchId: input.branchId,
    };
  }

  return {
    departmentId: null,
    buildingId: null,
    branchId: null,
  };
}

/**
 * Tạo URL Chỉ đường Google Maps chuẩn xác
 * - Ưu tiên 1: Tọa độ GPS (latitude, longitude) -> Mở trực tiếp chế độ Turn-by-Turn Navigation với độ chính xác cao nhất
 * - Phương án 2: Chuỗi địa chỉ -> Chuẩn hóa và tự động thêm ", Việt Nam" để Google Maps định vị đúng quốc gia/tỉnh thành
 */
export function getDirectionsUrl(target?: {
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
} | null): string {
  if (!target) return "#";

  const lat = target.latitude != null ? Number(target.latitude) : null;
  const lng = target.longitude != null ? Number(target.longitude) : null;

  if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  if (target.address && target.address.trim()) {
    let clean = target.address.trim();
    if (
      !clean.toLowerCase().includes("việt nam") &&
      !clean.toLowerCase().includes("vietnam")
    ) {
      clean += ", Việt Nam";
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(clean)}`;
  }

  return "#";
}

/**
 * Trích xuất tọa độ { lat, lng } từ chuỗi văn bản tự do hoặc đường link Google Maps
 * Hỗ trợ các định dạng:
 * 1. Số thập phân: "10.024567, 105.083124" hoặc "10.024567 105.083124"
 * 2. Link Google Maps: https://www.google.com/maps/place/.../@10.024567,105.083124,17z/...
 * 3. Link Google Maps: ?q=10.024567,105.083124 hoặc ?query=... hoặc destination=...
 * 4. Google Maps Embed/Share: !3d10.024567!4d105.083124
 * 5. Độ-Phút-Giây (DMS): 10°01'28.4"N 105°04'59.2"E
 */
export function parseCoordinates(input: string): { latitude: number; longitude: number } | null {
  if (!input || typeof input !== "string") return null;
  const str = input.trim();

  // 1. Google Maps URL chứa @lat,lng
  const atMatch = str.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
  }

  // 2. Google Maps query param: ?q=lat,lng hoặc query=lat,lng hoặc destination=lat,lng hoặc ll=lat,lng
  const queryMatch = str.match(/(?:q|query|destination|ll|loc)=(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/i);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
  }

  // 3. Google Maps data embed: !3dlat!4dlng
  const dataMatch = str.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (dataMatch) {
    const lat = parseFloat(dataMatch[1]);
    const lng = parseFloat(dataMatch[2]);
    if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
  }

  // 4. Định dạng thập phân: "10.024567, 105.083124" hoặc "10.024567 105.083124"
  const standardMatch = str.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);
  if (standardMatch) {
    const lat = parseFloat(standardMatch[1]);
    const lng = parseFloat(standardMatch[2]);
    if (isValidLatLng(lat, lng)) return { latitude: lat, longitude: lng };
  }

  // 5. Định dạng Độ-Phút-Giây (DMS): 10°01'28.4"N 105°04'59.2"E
  const dmsMatch = str.match(/(\d+)°(\d+)'([\d.]+)"([NS])[,\s]+(\d+)°(\d+)'([\d.]+)"([EW])/i);
  if (dmsMatch) {
    let lat = parseInt(dmsMatch[1], 10) + parseInt(dmsMatch[2], 10) / 60 + parseFloat(dmsMatch[3]) / 3600;
    if (dmsMatch[4].toUpperCase() === "S") lat = -lat;
    let lng = parseInt(dmsMatch[5], 10) + parseInt(dmsMatch[6], 10) / 60 + parseFloat(dmsMatch[7]) / 3600;
    if (dmsMatch[8].toUpperCase() === "W") lng = -lng;
    if (isValidLatLng(lat, lng)) return { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) };
  }

  return null;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}
