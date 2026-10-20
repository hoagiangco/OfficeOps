// RBAC theo PRD mục 3 & 7. Không import module Node-only để dùng được ở proxy.
export type Role = "SUPER_ADMIN" | "ADMIN" | "DISPATCHER" | "FIELD_TECH";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Giám đốc",
  ADMIN: "Kế toán",
  DISPATCHER: "Điều phối / Thủ kho",
  FIELD_TECH: "Kỹ thuật viên",
};

const ALL: Role[] = ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"];

// Quyền chức năng -> các vai trò được phép
export const PERMISSIONS = {
  "user:manage": ["SUPER_ADMIN"],
  "audit:view": ["SUPER_ADMIN"],
  "finance:view": ["SUPER_ADMIN", "ADMIN"],
  "customer:write": ["SUPER_ADMIN", "ADMIN"],
  "customer:read": ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"],
  "contract:write": ["SUPER_ADMIN", "ADMIN"],
  "contract:read": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "equipment:write": ["SUPER_ADMIN", "DISPATCHER"],
  "equipment:read": ALL,
  "ticket:create": ["SUPER_ADMIN", "ADMIN", "DISPATCHER", "FIELD_TECH"],
  "ticket:assign": ["SUPER_ADMIN", "DISPATCHER"],
  "ticket:update": ALL, // phạm vi chi tiết kiểm tra ở tầng nghiệp vụ
  "stock:request": ["SUPER_ADMIN", "DISPATCHER", "FIELD_TECH"],
  "stock:approve-technical": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "stock:approve-retail": ["SUPER_ADMIN", "ADMIN", "DISPATCHER"],
  "stock:manage": ["SUPER_ADMIN", "DISPATCHER"],
  "meter:record": ALL,
  "invoice:manage": ["SUPER_ADMIN", "ADMIN"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role | undefined, perm: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[perm] as readonly Role[]).includes(role);
}

// Tiền tố trang -> vai trò được vào (dùng ở proxy)
export const ROUTE_ROLES: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["SUPER_ADMIN"] },
  { prefix: "/finance", roles: ["SUPER_ADMIN", "ADMIN"] },
  { prefix: "/inventory", roles: ["SUPER_ADMIN", "ADMIN", "DISPATCHER"] },
  { prefix: "/dispatch", roles: ["SUPER_ADMIN", "DISPATCHER"] },
];
