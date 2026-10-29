-- AlterEnum
-- The members sheet and the member census become their own permissions so the reception
-- desk can work the list without holding the club's whole member database.
ALTER TYPE "Permission" ADD VALUE 'EXPORT_MEMBERS';
ALTER TYPE "Permission" ADD VALUE 'VIEW_MEMBER_STATS';
ALTER TYPE "Permission" ADD VALUE 'MANAGE_SALARIES';
