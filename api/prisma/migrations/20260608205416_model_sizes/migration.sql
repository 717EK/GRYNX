-- AlterTable
ALTER TABLE "JobModel" ADD COLUMN     "size" TEXT;

-- AlterTable
ALTER TABLE "Model" ADD COLUMN     "sizes" TEXT[] DEFAULT ARRAY[]::TEXT[];
