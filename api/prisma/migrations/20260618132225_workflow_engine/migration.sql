-- CreateEnum
CREATE TYPE "StageType" AS ENUM ('sales', 'ppc_requirements', 'fg_check', 'design', 'ppc_final', 'production', 'qc', 'fg_stock', 'dispatch', 'maintenance');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('draft', 'published', 'archived');

-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "type" "StageType";

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "workflowVersionId" TEXT;

-- AlterTable
ALTER TABLE "JobStep" ADD COLUMN     "stageType" "StageType";

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "publishedVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowVersion" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'draft',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStage" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "stageType" "StageType" NOT NULL,
    "departmentId" TEXT,
    "label" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "WorkflowStage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowDefinition_publishedVersionId_key" ON "WorkflowDefinition"("publishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowVersion_definitionId_version_key" ON "WorkflowVersion"("definitionId", "version");

-- CreateIndex
CREATE INDEX "WorkflowStage_versionId_idx" ON "WorkflowStage"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowStage_versionId_sequence_key" ON "WorkflowStage"("versionId", "sequence");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_workflowVersionId_fkey" FOREIGN KEY ("workflowVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "WorkflowVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowVersion" ADD CONSTRAINT "WorkflowVersion_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "WorkflowDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "WorkflowVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStage" ADD CONSTRAINT "WorkflowStage_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

