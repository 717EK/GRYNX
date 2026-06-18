-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('requested', 'approved', 'shipped', 'cancelled');

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'requested',
    "raisedBy" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "shippedById" TEXT,
    "shippedAt" TIMESTAMP(3),
    "vehicle" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_orderId_key" ON "Dispatch"("orderId");

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

