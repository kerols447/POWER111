-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Permission" ADD VALUE 'VIEW_PHYSIO';
ALTER TYPE "Permission" ADD VALUE 'MANAGE_PHYSIO';

-- CreateTable
CREATE TABLE "physio_bookings" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "requestedDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pricePiasters" INTEGER,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physio_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "physio_bookings_branchId_status_requestedDate_idx" ON "physio_bookings"("branchId", "status", "requestedDate");

-- CreateIndex
CREATE INDEX "physio_bookings_memberId_createdAt_idx" ON "physio_bookings"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "physio_bookings" ADD CONSTRAINT "physio_bookings_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physio_bookings" ADD CONSTRAINT "physio_bookings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physio_bookings" ADD CONSTRAINT "physio_bookings_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

