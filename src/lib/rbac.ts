// RBAC theo PRD mục 3 & 7. Không import module Node-only để dùng được ở proxy.
export type Role = "SUPER_ADMIN" | "ADMIN" | "DISPATCHER" | "FIELD_TECH";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Giám đốc",
  ADMIN: "Kế toán",
  DISPATCHER: "Điều phối / Thủ kho",
  FIELD_TECH: "Kỹ thuật viên",
};

const ALL: Role[] = ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"];

// Quyền chức năng -> các vai trò được phép (42 quyền chi tiết + legacy aliases)
export const PERMISSIONS = {
  // 1. Quản lý Khách hàng
  "customer:view": ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"],
  "customer:view-phone": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "customer:create": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "customer:edit-contact": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "customer:edit-legal": ["SUPER_ADMIN", "ADMIN"],
  "customer:delete": ["SUPER_ADMIN", "ADMIN"],
  "customer:location-manage": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "customer:group-manage": ["SUPER_ADMIN", "ADMIN"],
  "customer:import": ["SUPER_ADMIN", "ADMIN"],
  "customer:export": ["SUPER_ADMIN", "ADMIN"],

  // 2. Hợp đồng Dịch vụ
  "contract:view": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "contract:create": ["SUPER_ADMIN", "ADMIN"],
  "contract:edit": ["SUPER_ADMIN", "ADMIN"],
  "contract:terminate": ["SUPER_ADMIN", "ADMIN"],
  "contract:delete": ["SUPER_ADMIN", "ADMIN"],
  "contract:export": ["SUPER_ADMIN", "ADMIN"],

  // 3. Máy móc & Thiết bị
  "equipment:view": ALL,
  "equipment:history": ALL,
  "equipment:import-stock": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:assign": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:recall": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:relocate": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:edit": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:status-change": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:category-manage": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:delete": ["SUPER_ADMIN", "ADMIN"],
  "equipment:export": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],

  // 4. Phiếu Kỹ thuật & Điều phối
  "ticket:view": ALL,
  "ticket:create": ALL,
  "ticket:assign": ["SUPER_ADMIN", "DISPATCHER"],
  "ticket:update-progress": ALL,
  "ticket:close": ALL,
  "ticket:cancel": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "ticket:dispatch-map": ["SUPER_ADMIN", "DISPATCHER"],

  // 5. Kế hoạch Bảo trì Định kỳ
  "maintenance:view": ALL,
  "maintenance:plan-manage": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],

  // 6. Kho & Vật tư Linh kiện
  "part:view": ALL,
  "part:manage": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "stock:import": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "stock:request": ["SUPER_ADMIN", "DISPATCHER", "FIELD_TECH"],
  "stock:approve-technical": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "stock:approve-retail": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "stock:audit": ["SUPER_ADMIN", "DISPATCHER"],
  "stock:movement-view": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],

  // 7. Chỉ số Counter
  "meter:view": ALL,
  "meter:record": ALL,
  "meter:confirm": ["SUPER_ADMIN", "ADMIN"],

  // 8. Tài chính & Hóa đơn
  "invoice:view": ["SUPER_ADMIN", "ADMIN"],
  "invoice:create": ["SUPER_ADMIN", "ADMIN"],
  "invoice:edit": ["SUPER_ADMIN", "ADMIN"],
  "invoice:approve": ["SUPER_ADMIN", "ADMIN"],
  "invoice:send": ["SUPER_ADMIN", "ADMIN"],
  "invoice:payment": ["SUPER_ADMIN", "ADMIN"],
  "invoice:cancel": ["SUPER_ADMIN", "ADMIN"],
  "report:finance-view": ["SUPER_ADMIN", "ADMIN"],
  "report:tech-view": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "report:export": ["SUPER_ADMIN", "ADMIN"],

  // 9. Quản trị Hệ thống
  "user:view": ["SUPER_ADMIN"],
  "user:manage": ["SUPER_ADMIN"],
  "user:permission-manage": ["SUPER_ADMIN"],
  "audit:view": ["SUPER_ADMIN"],

  // 10. Quản lý Thư viện Media
  "media:view": ALL,
  "media:upload": ALL,
  "media:manage": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],

  // --- Khóa tương thích ngược (Legacy Aliases) ---
  "customer:read": ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"],
  "customer:write": ["SUPER_ADMIN", "ADMIN"],
  "contract:read": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "contract:write": ["SUPER_ADMIN", "ADMIN"],
  "equipment:read": ALL,
  "equipment:write": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "ticket:update": ALL,
  "stock:read": ALL,
  "stock:manage": ["SUPER_ADMIN", "DISPATCHER"],
  "finance:view": ["SUPER_ADMIN", "ADMIN"],
  "invoice:manage": ["SUPER_ADMIN", "ADMIN"],
  "file:manage": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

let runtimeMatrix: Record<string, Record<string, boolean>> | null = null;

export function setRuntimeCache(matrix: Record<string, Record<string, boolean>>) {
  runtimeMatrix = matrix;
}

export function can(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  if (role === "SUPER_ADMIN") return true;

  if (runtimeMatrix && runtimeMatrix[role] && runtimeMatrix[role][perm] !== undefined) {
    return runtimeMatrix[role][perm];
  }

  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}

// Tiền tố trang -> vai trò được vào (dùng ở proxy)
export const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/finance", roles: ["SUPER_ADMIN", "ADMIN"] },
  { prefix: "/inventory", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER"] },
  { prefix: "/dispatch", roles: ["SUPER_ADMIN", "DISPATCHER"] },
];
