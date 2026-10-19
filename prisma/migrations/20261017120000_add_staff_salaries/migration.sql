-- CreateEnum
CREATE TYPE "SalaryBasis" AS ENUM ('MONTHLY', 'HOURLY');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "salaryBasis" "SalaryBasis" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "salaryPiasters" INTEGER;

-- CreateTable
CREATE TABLE "salary_payments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amountPiasters" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "notes" TEXT,
    "expenseId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salary_payments_userId_periodStart_idx" ON "salary_payments"("userId", "periodStart");

-- CreateIndex
CREATE INDEX "salary_payments_branchId_createdAt_idx" ON "salary_payments"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_payments" ADD CONSTRAINT "salary_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
