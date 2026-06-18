-- AlterTable
ALTER TABLE "StationVisit" ADD COLUMN     "qcAt" TIMESTAMP(3),
ADD COLUMN     "qcById" TEXT,
ADD COLUMN     "qcChecked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qcIssue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qcNote" TEXT,
ADD COLUMN     "qcResolvedAt" TIMESTAMP(3);

