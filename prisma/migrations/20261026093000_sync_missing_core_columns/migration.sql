-- Migration: 20261026093000_sync_missing_core_columns

-- 1. AlterTable Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "group" TEXT NOT NULL DEFAULT 'Khách thường';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "managerName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "managerPhone" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "locationConfig" JSONB;

-- Indices on Customer
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_code_key" ON "Customer"("code");
CREATE INDEX IF NOT EXISTS "Customer_group_idx" ON "Customer"("group");
CREATE INDEX IF NOT EXISTS "Customer_status_idx" ON "Customer"("status");

-- 2. AlterTable Warehouse
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "managerPhone" TEXT;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "isDefault" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Warehouse" ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- 3. AlterTable Equipment
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'Máy Photocopy';
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "group" TEXT NOT NULL DEFAULT 'Máy văn phòng';
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "relationType" TEXT NOT NULL DEFAULT 'Cho thuê';
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "warehouseId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "buildingId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE "Equipment" ADD COLUMN IF NOT EXISTS "warrantyUntil" TIMESTAMP(3);

-- Indices on Equipment
CREATE UNIQUE INDEX IF NOT EXISTS "Equipment_code_key" ON "Equipment"("code");
CREATE INDEX IF NOT EXISTS "Equipment_categoryId_idx" ON "Equipment"("categoryId");
CREATE INDEX IF NOT EXISTS "Equipment_brand_idx" ON "Equipment"("brand");
CREATE INDEX IF NOT EXISTS "Equipment_type_idx" ON "Equipment"("type");
CREATE INDEX IF NOT EXISTS "Equipment_group_idx" ON "Equipment"("group");
CREATE INDEX IF NOT EXISTS "Equipment_relationType_idx" ON "Equipment"("relationType");
CREATE INDEX IF NOT EXISTS "Equipment_warehouseId_idx" ON "Equipment"("warehouseId");
CREATE INDEX IF NOT EXISTS "Equipment_branchId_idx" ON "Equipment"("branchId");
CREATE INDEX IF NOT EXISTS "Equipment_buildingId_idx" ON "Equipment"("buildingId");

-- Foreign Keys on Equipment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_categoryId_fkey'
    ) THEN
        ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EquipmentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_warehouseId_fkey'
    ) THEN
        ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_branchId_fkey'
    ) THEN
        ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Equipment_buildingId_fkey'
    ) THEN
        ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
