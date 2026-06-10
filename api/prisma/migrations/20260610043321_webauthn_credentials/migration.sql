-- AlterTable
ALTER TABLE "User" ADD COLUMN     "webauthnChallenge" TEXT;

-- CreateTable
CREATE TABLE "WebauthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "WebauthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WebauthnCredential_credentialId_key" ON "WebauthnCredential"("credentialId");

-- CreateIndex
CREATE INDEX "WebauthnCredential_userId_idx" ON "WebauthnCredential"("userId");

-- AddForeignKey
ALTER TABLE "WebauthnCredential" ADD CONSTRAINT "WebauthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
