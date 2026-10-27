import { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { PERMISSIONS, type Permission, setRuntimeCache } from "./rbac";
import { ALL_PERMISSION_KEYS, PERMISSION_MODULES } from "./rbacMetadata";

export type PermissionsMap = Record<string, boolean>;

const CACHE_TTL_MS = 60 * 1000; // 60 giây
const userCache = new Map<string, { perms: PermissionsMap; timestamp: number }>();

/**
 * Xóa cache phân quyền của 1 user hoặc toàn bộ.
 */
export function invalidateUserPermissionCache(userId?: string) {
  if (userId) {
    userCache.delete(userId);
  } else {
    userCache.clear();
  }
}

const LEGACY_ALIASES: Record<string, string[]> = {
  "customer:read": ["customer:view"],
  "customer:write": ["customer:create", "customer:edit-contact", "customer:edit-legal", "customer:location-manage"],
  "contract:read": ["contract:view"],
  "contract:write": ["contract:create", "contract:edit"],
  "equipment:read": ["equipment:view", "equipment:history"],
  "equipment:write": ["equipment:import-stock", "equipment:assign", "equipment:edit", "equipment:status-change"],
  "ticket:update": ["ticket:update-progress", "ticket:close"],
  "stock:read": ["part:view", "stock:movement-view"],
  "stock:manage": ["part:manage", "stock:import", "stock:audit"],
  "finance:view": ["report:finance-view", "invoice:view"],
  "invoice:manage": ["invoice:create", "invoice:edit", "invoice:approve", "invoice:send", "invoice:payment"],
  "file:manage": ["media:manage"],
};

export function expandLegacyAliases(perms: PermissionsMap): PermissionsMap {
  const result: PermissionsMap = { ...perms };

  // 1. Từ 64 quyền chi tiết mới suy ra các legacy key
  for (const [legacyKey, modernKeys] of Object.entries(LEGACY_ALIASES)) {
    if (result[legacyKey] === undefined) {
      result[legacyKey] = modernKeys.some((k) => !!result[k]);
    }
  }

  // 2. Từ legacy key suy ra các quyền chi tiết mới (nếu legacy key là true)
  for (const [legacyKey, modernKeys] of Object.entries(LEGACY_ALIASES)) {
    if (result[legacyKey]) {
      for (const m of modernKeys) {
        if (result[m] === undefined) {
          result[m] = true;
        }
      }
    }
  }

  return result;
}

/**
 * Trả về quyền mặc định theo vai trò (Role Template)
 */
export function getDefaultPermissionsForRole(role: Role): PermissionsMap {
  const result: PermissionsMap = {};
  for (const key of ALL_PERMISSION_KEYS) {
    if (role === "SUPER_ADMIN") {
      result[key] = true;
    } else {
      const allowedRoles = (PERMISSIONS as Record<string, readonly Role[]>)[key] || [];
      result[key] = allowedRoles.includes(role);
    }
  }
  return expandLegacyAliases(result);
}

/**
 * Lấy danh sách quyền hạn của một User cụ thể (kèm in-memory cache).
 * Nếu user chưa từng được cấu hình quyền riêng, tự động nạp từ Role Template.
 */
export async function getUserPermissions(userId: string): Promise<{
  role: Role;
  permissions: PermissionsMap;
  isCustomized: boolean;
}> {
  const now = Date.now();
  const cached = userCache.get(userId);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    // Để trả về role chính xác kèm theo
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    const role = user?.role || "FIELD_TECH";
    return {
      role,
      permissions: cached.perms,
      isCustomized: true,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      isActive: true,
      userPermissions: true,
    },
  });

  if (!user) {
    return {
      role: "FIELD_TECH",
      permissions: {},
      isCustomized: false,
    };
  }

  // SUPER_ADMIN luôn có toàn quyền cố định
  if (user.role === "SUPER_ADMIN") {
    const fullPerms: PermissionsMap = {};
    for (const k of ALL_PERMISSION_KEYS) fullPerms[k] = true;
    for (const legacyKey of Object.keys(LEGACY_ALIASES)) fullPerms[legacyKey] = true;
    userCache.set(userId, { perms: fullPerms, timestamp: now });
    return {
      role: user.role,
      permissions: fullPerms,
      isCustomized: false,
    };
  }

  const defaultPerms = getDefaultPermissionsForRole(user.role);

  // Nếu user đã có bản ghi UserPermission trong DB
  if (user.userPermissions.length > 0) {
    const perms: PermissionsMap = { ...defaultPerms };
    // Điền giá trị từ DB
    for (const up of user.userPermissions) {
      perms[up.permission] = up.granted;
    }

    const finalPerms = expandLegacyAliases(perms);
    userCache.set(userId, { perms: finalPerms, timestamp: now });
    return {
      role: user.role,
      permissions: finalPerms,
      isCustomized: true,
    };
  }

  // Nếu chưa có cấu hình riêng -> Khởi tạo tự động từ Role Template vào DB
  const recordsToCreate = ALL_PERMISSION_KEYS.map((k) => ({
    userId,
    permission: k,
    granted: defaultPerms[k] ?? false,
  }));

  try {
    await prisma.userPermission.createMany({
      data: recordsToCreate,
      skipDuplicates: true,
    });
  } catch (err) {
    console.error(`Lỗi khi tự động khởi tạo UserPermission cho user ${userId}:`, err);
  }

  const finalPerms = expandLegacyAliases(defaultPerms);
  userCache.set(userId, { perms: finalPerms, timestamp: now });
  return {
    role: user.role,
    permissions: finalPerms,
    isCustomized: false,
  };
}

/**
 * Kiểm tra xem một người dùng cụ thể có quyền thực hiện chức năng không.
 */
export async function checkUserPermission(
  userId: string | undefined,
  role: Role | undefined,
  permission: Permission | string
): Promise<boolean> {
  if (!userId || !role) return false;
  if (role === "SUPER_ADMIN") return true;

  const data = await getUserPermissions(userId);
  if (data.permissions[permission] !== undefined) {
    return data.permissions[permission];
  }

  // Nếu là legacy key
  const aliases = LEGACY_ALIASES[permission];
  if (aliases && aliases.length > 0) {
    return aliases.some((alt) => data.permissions[alt] ?? false);
  }

  return false;
}

/**
 * Cập nhật quyền hạn cho một User cụ thể.
 */
export async function updateUserPermissions(
  targetUserId: string,
  updates: { permission: string; granted: boolean }[],
  actorUserId?: string
): Promise<PermissionsMap> {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, role: true },
  });

  if (!targetUser) throw new Error("Không tìm thấy người dùng");
  if (targetUser.role === "SUPER_ADMIN") {
    throw new Error("Không thể thay đổi quyền hạn của Giám đốc (SUPER_ADMIN)");
  }

  const validUpdates = updates.filter((u) => ALL_PERMISSION_KEYS.includes(u.permission));

  await prisma.$transaction(async (tx) => {
    for (const item of validUpdates) {
      await tx.userPermission.upsert({
        where: {
          userId_permission: {
            userId: targetUserId,
            permission: item.permission,
          },
        },
        create: {
          userId: targetUserId,
          permission: item.permission,
          granted: item.granted,
        },
        update: {
          granted: item.granted,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: "UPDATE_USER_PERMISSIONS",
        entity: "UserPermission",
        entityId: targetUserId,
        meta: {
          targetUserName: targetUser.name,
          changeCount: validUpdates.length,
          updates: validUpdates,
        },
      },
    });
  });

  invalidateUserPermissionCache(targetUserId);
  const result = await getUserPermissions(targetUserId);
  return result.permissions;
}

/**
 * Đặt lại quyền của một user theo Role Template mặc định.
 */
export async function resetUserPermissionsToRole(
  targetUserId: string,
  actorUserId?: string
): Promise<PermissionsMap> {
  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, role: true },
  });

  if (!targetUser) throw new Error("Không tìm thấy người dùng");
  if (targetUser.role === "SUPER_ADMIN") {
    throw new Error("Tài khoản Giám đốc luôn có toàn bộ quyền");
  }

  const defaultPerms = getDefaultPermissionsForRole(targetUser.role);

  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({
      where: { userId: targetUserId },
    });

    const recordsToCreate = ALL_PERMISSION_KEYS.map((k) => ({
      userId: targetUserId,
      permission: k,
      granted: defaultPerms[k] ?? false,
    }));

    await tx.userPermission.createMany({
      data: recordsToCreate,
    });

    await tx.auditLog.create({
      data: {
        userId: actorUserId || null,
        action: "RESET_USER_PERMISSIONS",
        entity: "UserPermission",
        entityId: targetUserId,
        meta: {
          targetUserName: targetUser.name,
          roleTemplate: targetUser.role,
        },
      },
    });
  });

  invalidateUserPermissionCache(targetUserId);
  return defaultPerms;
}

/**
 * Sao chép cấu hình quyền từ User này sang User khác.
 */
export async function copyUserPermissions(
  sourceUserId: string,
  targetUserId: string,
  actorUserId?: string
): Promise<PermissionsMap> {
  const [source, target] = await Promise.all([
    getUserPermissions(sourceUserId),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, name: true, role: true } }),
  ]);

  if (!target) throw new Error("Không tìm thấy người dùng đích");
  if (target.role === "SUPER_ADMIN") {
    throw new Error("Không thể gán quyền cho tài khoản Giám đốc");
  }

  const updates = ALL_PERMISSION_KEYS.map((k) => ({
    permission: k,
    granted: source.permissions[k] ?? false,
  }));

  return updateUserPermissions(targetUserId, updates, actorUserId);
}

/**
 * Lấy danh sách tất cả người dùng kèm số lượng quyền được cấp để hiển thị tổng quan.
 */
export async function getAllUsersPermissionsSummary() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      region: true,
      userPermissions: {
        select: { permission: true, granted: true },
      },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return users.map((u) => {
    const isSuperAdmin = u.role === "SUPER_ADMIN";
    const hasCustomRecords = u.userPermissions.length > 0;

    let grantedList: string[];
    if (isSuperAdmin) {
      grantedList = [...ALL_PERMISSION_KEYS];
    } else if (hasCustomRecords) {
      // Dùng cấu hình thủ công chính xác trong DB:
      // Bắt đầu từ Role Template, ghi đè những quyền có trong userPermissions
      const roleDefaults = getDefaultPermissionsForRole(u.role);
      const permMap: Record<string, boolean> = { ...roleDefaults };
      for (const up of u.userPermissions) {
        permMap[up.permission] = up.granted;
      }
      grantedList = ALL_PERMISSION_KEYS.filter((k) => !!permMap[k]);
    } else {
      // Chưa từng cấu hình thủ công: dùng Role Template
      const roleDefaults = getDefaultPermissionsForRole(u.role);
      grantedList = ALL_PERMISSION_KEYS.filter((k) => !!roleDefaults[k]);
    }

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive,
      region: u.region,
      grantedCount: isSuperAdmin ? ALL_PERMISSION_KEYS.length : grantedList.length,
      totalCount: ALL_PERMISSION_KEYS.length,
      isSuperAdmin,
      grantedPermissions: grantedList,
    };
  });
}
