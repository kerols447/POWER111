-- Cross-branch check-in becomes opt-in; auto-checkout moves into branch_settings so it is
-- covered by backup/restore instead of living in a side table outside Prisma.

-- AlterTable
ALTER TABLE "branch_settings"
  ADD COLUMN "autoCheckoutEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "autoCheckoutMinutes" INTEGER NOT NULL DEFAULT 90;

-- AlterTable: block cross-branch check-in by default, for existing and new branches
ALTER TABLE "branch_settings" ALTER COLUMN "allowCrossBranchCheckin" SET DEFAULT false;
UPDATE "branch_settings" SET "allowCrossBranchCheckin" = false;
