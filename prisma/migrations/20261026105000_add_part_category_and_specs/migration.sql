-- Migration: 20261026105000_add_part_category_and_specs

-- 1. CreateTable PartCategory
CREATE TABLE IF NOT EXISTS "PartCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT DEFAULT '#2563eb',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartCategory_pkey" PRIMARY KEY ("id")
);

-- Unique indexes on PartCategory
CREATE UNIQUE INDEX IF NOT EXISTS "PartCategory_code_key" ON "PartCategory"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "PartCategory_name_key" ON "PartCategory"("name");

-- 2. AlterTable Part
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "barcode" TEXT;
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "costPrice" DECIMAL(14, 2);
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "specs" JSONB;
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Part" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Unique and standard indexes on Part
CREATE UNIQUE INDEX IF NOT EXISTS "Part_barcode_key" ON "Part"("barcode");
CREATE INDEX IF NOT EXISTS "Part_categoryId_idx" ON "Part"("categoryId");
CREATE INDEX IF NOT EXISTS "Part_category_idx" ON "Part"("category");
CREATE INDEX IF NOT EXISTS "Part_isActive_idx" ON "Part"("isActive");

-- Foreign key Part -> PartCategory
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Part_categoryId_fkey'
    ) THEN
        ALTER TABLE "Part" ADD CONSTRAINT "Part_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "PartCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
