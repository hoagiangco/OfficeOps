import { PrismaClient } from "@prisma/client";

const SCHEMA_REV = "v6-ticket-work-types-r4";
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaRev?: string;
};

function createFreshPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma) {
    globalForPrisma.prisma.$disconnect().catch(() => {});
  }
  try {
    const nodeRequire = eval("require") as NodeJS.Require;
    if (nodeRequire?.cache) {
      for (const k of Object.keys(nodeRequire.cache)) {
        if (k.includes(".prisma") || k.includes("@prisma")) {
          delete nodeRequire.cache[k];
        }
      }
    }
    const freshMod = nodeRequire("@prisma/client") as { PrismaClient: typeof PrismaClient };
    return new freshMod.PrismaClient();
  } catch {
    return new PrismaClient();
  }
}

export const prisma =
  globalForPrisma.prisma && globalForPrisma.prismaSchemaRev === SCHEMA_REV
    ? globalForPrisma.prisma
    : createFreshPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaRev = SCHEMA_REV;
}
