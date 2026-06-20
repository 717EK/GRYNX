-- CreateEnum
CREATE TYPE "QcKind" AS ENUM ('issue', 'suggestion', 'note');

-- CreateEnum
CREATE TYPE "QcSeverity" AS ENUM ('minor', 'major', 'critical');

-- CreateEnum
CREATE TYPE "QcObsStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "QcObservation" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stationId" TEXT,
    "kind" "QcKind" NOT NULL DEFAULT 'issue',
    "severity" "QcSeverity",
    "note" TEXT NOT NULL,
    "photoUrl" TEXT,
    "holdRequested" BOOLEAN NOT NULL DEFAULT false,
    "holdApproved" BOOLEAN NOT NULL DEFAULT false,
    "holdApprovedById" TEXT,
    "holdApprovedAt" TIMESTAMP(3),
    "status" "QcObsStatus" NOT NULL DEFAULT 'open',
    "raisedById" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "QcObservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QcObservation_jobId_idx" ON "QcObservation"("jobId");

-- CreateIndex
CREATE INDEX "QcObservation_stationId_status_idx" ON "QcObservation"("stationId", "status");

-- CreateIndex
CREATE INDEX "QcObservation_status_idx" ON "QcObservation"("status");

-- AddForeignKey
ALTER TABLE "QcObservation" ADD CONSTRAINT "QcObservation_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcObservation" ADD CONSTRAINT "QcObservation_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE SET NULL ON UPDATE CASCADE;

