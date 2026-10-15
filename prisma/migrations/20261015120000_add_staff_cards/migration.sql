-- AlterTable
ALTER TABLE "users" ADD COLUMN     "staffCode" TEXT;

-- CreateTable
CREATE TABLE "staff_attendances" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "checkInTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkOutTime" TIMESTAMP(3),
    "method" "CheckInMethod" NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,

    CONSTRAINT "staff_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_attendances_userId_checkInTime_idx" ON "staff_attendances"("userId", "checkInTime");

-- CreateIndex
CREATE INDEX "staff_attendances_branchId_checkInTime_idx" ON "staff_attendances"("branchId", "checkInTime");

-- CreateIndex
CREATE UNIQUE INDEX "users_staffCode_key" ON "users"("staffCode");

-- AddForeignKey
ALTER TABLE "staff_attendances" ADD CONSTRAINT "staff_attendances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendances" ADD CONSTRAINT "staff_attendances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Give every existing employee/trainer account a scannable card code (S01, S02, ...)
-- Owner accounts never punch in, so they stay without a code
UPDATE "users" u
SET "staffCode" = 'S' || lpad(t.rn::text, 2, '0')
FROM (
  SELECT id, row_number() OVER (ORDER BY "createdAt") AS rn
  FROM "users"
  WHERE "staffCode" IS NULL AND "role" <> 'OWNER'
) t
WHERE u.id = t.id;
