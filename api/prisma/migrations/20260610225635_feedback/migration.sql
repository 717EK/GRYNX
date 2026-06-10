-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('bug', 'idea', 'feedback');

-- CreateEnum
CREATE TYPE "FeedbackSeverity" AS ENUM ('low', 'normal', 'high', 'critical');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL DEFAULT 'bug',
    "severity" "FeedbackSeverity" NOT NULL DEFAULT 'normal',
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "screen" TEXT,
    "remark" TEXT NOT NULL,
    "context" JSONB NOT NULL DEFAULT '{}',
    "screenshot" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");
