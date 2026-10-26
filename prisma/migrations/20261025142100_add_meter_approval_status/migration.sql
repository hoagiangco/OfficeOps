-- CreateEnum
CREATE TYPE "MeterApprovalStatus" AS ENUM ('APPROVED', 'PENDING_APPROVAL', 'REJECTED');

-- AlterTable
ALTER TABLE "MeterLog" ADD COLUMN "status" "MeterApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "adjustmentReason" TEXT,
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "MeterLog_status_idx" ON "MeterLog"("status");

-- AddForeignKey
ALTER TABLE "MeterLog" ADD CONSTRAINT "MeterLog_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
