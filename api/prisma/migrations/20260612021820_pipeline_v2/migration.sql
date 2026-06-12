-- CreateEnum
CREATE TYPE "ScanOutMode" AS ENUM ('explicit', 'auto');

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('needed', 'ordered', 'received', 'cancelled');

-- CreateEnum
CREATE TYPE "SaleSheetStatus" AS ENUM ('draft', 'submitted', 'converted', 'cancelled');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EventType" ADD VALUE 'station_in';
ALTER TYPE "EventType" ADD VALUE 'station_out';
ALTER TYPE "EventType" ADD VALUE 'material_request';
ALTER TYPE "EventType" ADD VALUE 'material_update';
ALTER TYPE "EventType" ADD VALUE 'sale_sheet';
ALTER TYPE "EventType" ADD VALUE 'serialized';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'sales';

-- AlterTable
ALTER TABLE "PpcRequest" ADD COLUMN     "saleSheetId" TEXT;

-- AlterTable
ALTER TABLE "QcInspection" ADD COLUMN     "photoUrl" TEXT,
ADD COLUMN     "reworkStationId" TEXT;

-- CreateTable
CREATE TABLE "Station" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "departmentId" TEXT NOT NULL,

    CONSTRAINT "Station_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationVisit" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "scanInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanOutAt" TIMESTAMP(3),
    "scanOutMode" "ScanOutMode",
    "remark" TEXT,
    "photoUrl" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StationVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleSheet" (
    "id" TEXT NOT NULL,
    "sheetNo" TEXT NOT NULL,
    "customer" TEXT NOT NULL,
    "orderName" TEXT,
    "details" TEXT,
    "targetDate" TIMESTAMP(3),
    "status" "SaleSheetStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaterialRequest" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "quantity" TEXT,
    "status" "MaterialStatus" NOT NULL DEFAULT 'needed',
    "note" TEXT,
    "vendor" TEXT,
    "raisedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaterialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Station_code_key" ON "Station"("code");

-- CreateIndex
CREATE INDEX "StationVisit_jobId_idx" ON "StationVisit"("jobId");

-- CreateIndex
CREATE INDEX "StationVisit_stationId_idx" ON "StationVisit"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "SaleSheet_sheetNo_key" ON "SaleSheet"("sheetNo");

-- CreateIndex
CREATE INDEX "MaterialRequest_jobId_idx" ON "MaterialRequest"("jobId");

-- CreateIndex
CREATE INDEX "MaterialRequest_status_idx" ON "MaterialRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PpcRequest_saleSheetId_key" ON "PpcRequest"("saleSheetId");

-- AddForeignKey
ALTER TABLE "PpcRequest" ADD CONSTRAINT "PpcRequest_saleSheetId_fkey" FOREIGN KEY ("saleSheetId") REFERENCES "SaleSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Station" ADD CONSTRAINT "Station_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationVisit" ADD CONSTRAINT "StationVisit_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StationVisit" ADD CONSTRAINT "StationVisit_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "Station"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialRequest" ADD CONSTRAINT "MaterialRequest_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

