-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'ppc', 'dept_head', 'qc', 'fg_stock', 'maintenance');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('web', 'ios', 'android', 'windows');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('normal', 'urgent');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('production', 'rework');

-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('admin', 'ppc');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'in_production', 'in_qc', 'in_fg', 'close_requested', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'waiting_acceptance', 'in_progress', 'on_hold', 'completed', 'skipped');

-- CreateEnum
CREATE TYPE "PpcStatus" AS ENUM ('draft', 'submitted', 'clarification', 'approved', 'rejected', 'cancelled');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('created', 'accepted', 'completed', 'hold', 'resume', 'note', 'update_request', 'update_reply', 'qc_result', 'scan', 'split', 'merge', 'cancelled', 'closure_requested', 'closed', 'forced_advance');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('image', 'pdf', 'video');

-- CreateEnum
CREATE TYPE "HoldCode" AS ENUM ('material', 'breakdown', 'approval', 'resource', 'other');

-- CreateEnum
CREATE TYPE "QcResult" AS ENUM ('approved', 'rework');

-- CreateEnum
CREATE TYPE "ClosureStatus" AS ENUM ('requested', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "MaintCategory" AS ENUM ('electrical', 'mechanical', 'utility', 'facility', 'it_network', 'safety', 'other');

-- CreateEnum
CREATE TYPE "MaintPriority" AS ENUM ('critical', 'high', 'normal', 'low');

-- CreateEnum
CREATE TYPE "MaintStatus" AS ENUM ('open', 'assigned', 'in_progress', 'completed', 'verified', 'closed');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('new_job', 'update_request', 'hold_alert', 'ppc_approval', 'maintenance_alert', 'closure_request', 'escalation');

-- CreateEnum
CREATE TYPE "ScanResult" AS ENUM ('applied', 'duplicate', 'rejected_out_of_seq', 'forced', 'superseded');

-- CreateEnum
CREATE TYPE "SuggestionKind" AS ENUM ('update_request', 'escalation', 'bottleneck', 'hold_review', 'approval');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('info', 'warn', 'alert');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('open', 'accepted', 'dismissed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "pinHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "departmentId" TEXT,
    "isBackup" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RoleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "token" TEXT NOT NULL,
    "isFloorDevice" BOOLEAN NOT NULL DEFAULT false,
    "departmentId" TEXT,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Model" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineTemplate" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PipelineTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineTemplateStep" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "PipelineTemplateStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoldReason" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HoldReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PpcRequest" (
    "id" TEXT NOT NULL,
    "requestNo" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "pipelineTemplateId" TEXT,
    "startDate" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "status" "PpcStatus" NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "clarificationNote" TEXT,
    "approvedJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PpcRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PpcRequestModel" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "PpcRequestModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "jobNo" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "jobType" "JobType" NOT NULL DEFAULT 'production',
    "productId" TEXT NOT NULL,
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "totalQty" INTEGER NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'draft',
    "pipelineTemplateId" TEXT NOT NULL,
    "parentJobId" TEXT,
    "source" "JobSource" NOT NULL DEFAULT 'admin',
    "ppcRequestId" TEXT,
    "startDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "reworkIssue" TEXT,
    "reworkEntryDepartmentId" TEXT,
    "createdById" TEXT NOT NULL,
    "cancelledReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobModel" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "JobModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobStep" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "slaDueAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "JobStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobStepId" TEXT,
    "type" "EventType" NOT NULL,
    "actorId" TEXT,
    "body" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "jobEventId" TEXT NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "objectKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hold" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobStepId" TEXT NOT NULL,
    "reasonCode" "HoldCode" NOT NULL,
    "reasonText" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Hold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stationDepartmentId" TEXT NOT NULL,
    "scannedById" TEXT NOT NULL,
    "clientTs" TIMESTAMP(3) NOT NULL,
    "serverTs" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,
    "result" "ScanResult" NOT NULL,
    "note" TEXT,

    CONSTRAINT "ScanEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcInspection" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "result" "QcResult" NOT NULL,
    "inspectorId" TEXT NOT NULL,
    "notes" TEXT,
    "reworkJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QcInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Closure" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" "ClosureStatus" NOT NULL DEFAULT 'requested',
    "receivedQty" INTEGER NOT NULL,

    CONSTRAINT "Closure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTicket" (
    "id" TEXT NOT NULL,
    "ticketNo" TEXT NOT NULL,
    "category" "MaintCategory" NOT NULL,
    "priority" "MaintPriority" NOT NULL DEFAULT 'normal',
    "status" "MaintStatus" NOT NULL DEFAULT 'open',
    "locationText" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actorId" TEXT,
    "body" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "jobId" TEXT,
    "ticketId" TEXT,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "kind" "SuggestionKind" NOT NULL,
    "severity" "Severity" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "jobId" TEXT,
    "ticketId" TEXT,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rule',
    "status" "SuggestionStatus" NOT NULL DEFAULT 'open',
    "actedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySequence" (
    "scope" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailySequence_pkey" PRIMARY KEY ("scope")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Department_code_key" ON "Department"("code");

-- CreateIndex
CREATE INDEX "RoleAssignment_userId_idx" ON "RoleAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Model_productId_code_key" ON "Model"("productId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineTemplateStep_templateId_sequence_key" ON "PipelineTemplateStep"("templateId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "HoldReason_code_key" ON "HoldReason"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PpcRequest_requestNo_key" ON "PpcRequest"("requestNo");

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNo_key" ON "Job"("jobNo");

-- CreateIndex
CREATE UNIQUE INDEX "JobStep_jobId_sequence_key" ON "JobStep"("jobId", "sequence");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_idx" ON "JobEvent"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ScanEvent_idempotencyKey_key" ON "ScanEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "ScanEvent_jobId_idx" ON "ScanEvent"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Closure_jobId_key" ON "Closure"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceTicket_ticketNo_key" ON "MaintenanceTicket"("ticketNo");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleAssignment" ADD CONSTRAINT "RoleAssignment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Model" ADD CONSTRAINT "Model_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineTemplate" ADD CONSTRAINT "PipelineTemplate_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineTemplateStep" ADD CONSTRAINT "PipelineTemplateStep_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "PipelineTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineTemplateStep" ADD CONSTRAINT "PipelineTemplateStep_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpcRequest" ADD CONSTRAINT "PpcRequest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpcRequest" ADD CONSTRAINT "PpcRequest_pipelineTemplateId_fkey" FOREIGN KEY ("pipelineTemplateId") REFERENCES "PipelineTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpcRequestModel" ADD CONSTRAINT "PpcRequestModel_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PpcRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PpcRequestModel" ADD CONSTRAINT "PpcRequestModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_pipelineTemplateId_fkey" FOREIGN KEY ("pipelineTemplateId") REFERENCES "PipelineTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobModel" ADD CONSTRAINT "JobModel_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobModel" ADD CONSTRAINT "JobModel_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "Model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStep" ADD CONSTRAINT "JobStep_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobStep" ADD CONSTRAINT "JobStep_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_jobEventId_fkey" FOREIGN KEY ("jobEventId") REFERENCES "JobEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hold" ADD CONSTRAINT "Hold_jobStepId_fkey" FOREIGN KEY ("jobStepId") REFERENCES "JobStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_stationDepartmentId_fkey" FOREIGN KEY ("stationDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanEvent" ADD CONSTRAINT "ScanEvent_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcInspection" ADD CONSTRAINT "QcInspection_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Closure" ADD CONSTRAINT "Closure_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceEvent" ADD CONSTRAINT "MaintenanceEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "MaintenanceTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
