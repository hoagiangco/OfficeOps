import { PrismaClient } from "@prisma/client";

const SCHEMA_REV = "v5-warehouse";
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaRev?: string;
};

export const prisma =
  globalForPrisma.prisma && globalForPrisma.prismaSchemaRev === SCHEMA_REV
    ? globalForPrisma.prisma
    : new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaSchemaRev = SCHEMA_REV;
}
