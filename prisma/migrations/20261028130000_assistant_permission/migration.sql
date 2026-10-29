-- AlterEnum
-- The assistant reads the club's reports, so the desk that only works the door is not
-- handed a reader over the owner's numbers by accident.
ALTER TYPE "Permission" ADD VALUE 'USE_ASSISTANT';
