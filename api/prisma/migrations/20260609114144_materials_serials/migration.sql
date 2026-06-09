-- CreateTable
CREATE TABLE "MaterialUsage" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "materialType" TEXT,
    "vendor" TEXT,
    "batchRef" TEXT,
    "quantity" TEXT,
    "loggedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Serial" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "serialNo" TEXT NOT NULL,
    "modelCode" TEXT,
    "size" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Serial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MaterialUsage_jobId_idx" ON "MaterialUsage"("jobId");

-- CreateIndex
CREATE INDEX "MaterialUsage_batchRef_idx" ON "MaterialUsage"("batchRef");

-- CreateIndex
CREATE INDEX "Serial_jobId_idx" ON "Serial"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Serial_serialNo_key" ON "Serial"("serialNo");

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Serial" ADD CONSTRAINT "Serial_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
