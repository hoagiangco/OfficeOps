import { prisma } from "@/lib/prisma";

export interface CustomerGroupItem {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  color: string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  customerCount?: number;
}

export const customerGroupRepo = {
  async getAll(): Promise<CustomerGroupItem[]> {
    const [groups, counts] = await Promise.all([
      prisma.$queryRawUnsafe<CustomerGroupItem[]>(`
        SELECT "id", "code", "name", "description", "color", "sortOrder", "createdAt", "updatedAt"
        FROM "CustomerGroup"
        ORDER BY "sortOrder" ASC, "name" ASC
      `),
      prisma.customer.groupBy({
        by: ["group"],
        _count: { id: true },
      }),
    ]);

    const countMap = new Map<string, number>();
    counts.forEach((c) => {
      if (c.group) countMap.set(c.group, c._count.id);
    });

    return groups.map((g) => ({
      ...g,
      customerCount: countMap.get(g.name) || 0,
    }));
  },

  async getById(id: string): Promise<CustomerGroupItem | null> {
    const res = await prisma.$queryRawUnsafe<CustomerGroupItem[]>(
      `SELECT * FROM "CustomerGroup" WHERE "id" = $1 LIMIT 1`,
      id
    );
    return res[0] || null;
  },

  async getByName(name: string): Promise<CustomerGroupItem | null> {
    const res = await prisma.$queryRawUnsafe<CustomerGroupItem[]>(
      `SELECT * FROM "CustomerGroup" WHERE LOWER(TRIM("name")) = LOWER(TRIM($1)) LIMIT 1`,
      name
    );
    return res[0] || null;
  },

  async getByCode(code: string): Promise<CustomerGroupItem | null> {
    const res = await prisma.$queryRawUnsafe<CustomerGroupItem[]>(
      `SELECT * FROM "CustomerGroup" WHERE UPPER(TRIM("code")) = UPPER(TRIM($1)) LIMIT 1`,
      code
    );
    return res[0] || null;
  },

  async create(data: {
    name: string;
    code?: string | null;
    description?: string | null;
    color?: string | null;
    sortOrder?: number;
  }): Promise<CustomerGroupItem> {
    const id = `cg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const sortOrder = data.sortOrder ?? 0;
    const color = data.color || "#2563eb";
    const code = data.code ? data.code.trim().toUpperCase() : null;
    const desc = data.description ? data.description.trim() : null;

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "CustomerGroup" ("id", "code", "name", "description", "color", "sortOrder", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
    `,
      id,
      code,
      data.name.trim(),
      desc,
      color,
      sortOrder
    );

    const created = await this.getById(id);
    if (!created) throw new Error("Không thể tạo nhóm khách hàng");
    return created;
  },

  async update(
    id: string,
    data: {
      name?: string;
      code?: string | null;
      description?: string | null;
      color?: string | null;
      sortOrder?: number;
    }
  ): Promise<CustomerGroupItem> {
    const current = await this.getById(id);
    if (!current) throw new Error("Không tìm thấy nhóm khách hàng");

    const newName = data.name !== undefined ? data.name.trim() : current.name;
    const newCode = data.code !== undefined ? (data.code ? data.code.trim().toUpperCase() : null) : current.code;
    const newDesc = data.description !== undefined ? (data.description ? data.description.trim() : null) : current.description;
    const newColor = data.color !== undefined ? data.color : current.color;
    const newSort = data.sortOrder !== undefined ? data.sortOrder : current.sortOrder;

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `
        UPDATE "CustomerGroup"
        SET "name" = $1, "code" = $2, "description" = $3, "color" = $4, "sortOrder" = $5, "updatedAt" = NOW()
        WHERE "id" = $6
      `,
        newName,
        newCode,
        newDesc,
        newColor,
        newSort,
        id
      );

      // Nếu tên nhóm thay đổi, tự động cập nhật đồng bộ các khách hàng đang thuộc nhóm cũ
      if (newName !== current.name) {
        await tx.customer.updateMany({
          where: { group: current.name },
          data: { group: newName },
        });
      }
    });

    const updated = await this.getById(id);
    if (!updated) throw new Error("Không thể cập nhật nhóm khách hàng");
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const current = await this.getById(id);
    if (!current) return false;

    // Kiểm tra xem nhóm có đang được sử dụng bởi khách hàng nào không
    const count = await prisma.customer.count({
      where: { group: current.name },
    });

    if (count > 0) {
      throw new Error(
        `Nhóm "${current.name}" đang được sử dụng bởi ${count} khách hàng. Vui lòng chuyển các khách hàng sang nhóm khác trước khi xóa.`
      );
    }

    await prisma.$executeRawUnsafe(`DELETE FROM "CustomerGroup" WHERE "id" = $1`, id);
    return true;
  },
};
