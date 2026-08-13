ALTER TABLE "Seed"
ADD COLUMN "workflowStatus" TEXT NOT NULL DEFAULT 'INBOX',
ADD COLUMN "whyNow" TEXT;

ALTER TABLE "Execution"
ADD COLUMN "contentBrief" JSONB;

CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_READY',
    "manifestPath" TEXT NOT NULL,
    "coreViewpoint" TEXT NOT NULL,
    "protectedClaims" JSONB NOT NULL,
    "approvedArtifactHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Submission_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TASK',
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "plannedDate" TEXT,
    "completedAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Submission_executionId_key" ON "Submission"("executionId");
CREATE UNIQUE INDEX "Submission_idempotencyKey_key" ON "Submission"("idempotencyKey");
CREATE INDEX "Submission_status_idx" ON "Submission"("status");
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");
CREATE INDEX "Action_status_idx" ON "Action"("status");
CREATE INDEX "Action_plannedDate_idx" ON "Action"("plannedDate");
CREATE INDEX "Action_entityType_entityId_idx" ON "Action"("entityType", "entityId");

CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "url" TEXT,
    "lastError" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Publication_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Publication_submissionId_channel_key" ON "Publication"("submissionId", "channel");
CREATE INDEX "Publication_status_idx" ON "Publication"("status");
