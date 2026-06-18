-- CreateEnum
CREATE TYPE "StockMoveKind" AS ENUM ('opening', 'adjust', 'produced', 'reserve', 'release', 'dispatch');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "stockItemId" TEXT;

-- CreateTable
CREATE TABLE "StockItem" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "modelId" TEXT,
    "size" TEXT,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "kind" "StockMoveKind" NOT NULL,
    "qty" INTEGER NOT NULL,
    "onHandAfter" INTEGER NOT NULL,
    "reservedAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "orderItemId" TEXT,
    "jobId" TEXT,
    "clientTag" TEXT,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_productId_modelId_size_key" ON "StockItem"("productId", "modelId", "size");

-- CreateIndex
CREATE INDEX "StockMovement_stockItemId_idx" ON "StockMovement"("stockItemId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

