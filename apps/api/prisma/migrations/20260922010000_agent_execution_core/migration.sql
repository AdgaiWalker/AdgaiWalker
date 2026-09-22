-- 旧数据的复制与表替换在同一事务内；中断不能留下半张 AgentRun。
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

-- AlterTable
ALTER TABLE "AgentUnit" ADD COLUMN "archivedAt" DATETIME;

-- CreateTable
CREATE TABLE "AgentRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "providerId" TEXT,
    "modelId" TEXT NOT NULL,
    "toolProfile" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "configHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRevision_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExecutionRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorScope" TEXT NOT NULL,
    "agentRevisionId" TEXT,
    "deploymentGeneration" INTEGER,
    "contentSnapshotId" TEXT,
    "grantId" TEXT,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "parentRunId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseEpoch" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" DATETIME,
    "deadline" DATETIME,
    "stopReason" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "elapsedMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExecutionRun_agentRevisionId_fkey" FOREIGN KEY ("agentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExecutionRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "ExecutionRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthorizationGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "principalType" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "agentId" TEXT,
    "origin" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "resourceScope" JSONB NOT NULL,
    "expiresAt" DATETIME,
    "runLimit" INTEGER,
    "usageLimit" INTEGER,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AuditRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeHash" TEXT,
    "afterHash" TEXT,
    "outcome" TEXT NOT NULL,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventKey" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payloadRef" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "nextAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" DATETIME,
    "deadAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
CREATE TABLE "new_AgentRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "targetFile" TEXT,
    "instruction" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "providerId" TEXT,
    "promptSnapshot" TEXT,
    "temperature" REAL,
    "tokensPrompt" INTEGER NOT NULL DEFAULT 0,
    "tokensCompletion" INTEGER NOT NULL DEFAULT 0,
    "tokensCacheHit" INTEGER NOT NULL DEFAULT 0,
    "cacheHitPercent" REAL NOT NULL DEFAULT 0.0,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "traceLogPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentUnit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AgentRun" ("agentId", "cacheHitPercent", "createdAt", "elapsedMs", "id", "instruction", "model", "output", "promptSnapshot", "providerId", "status", "targetFile", "temperature", "tokensCacheHit", "tokensCompletion", "tokensPrompt", "traceLogPath") SELECT "agentId", "cacheHitPercent", "createdAt", "elapsedMs", "id", "instruction", "model", "output", "promptSnapshot", "providerId", "status", "targetFile", "temperature", "tokensCacheHit", "tokensCompletion", "tokensPrompt", "traceLogPath" FROM "AgentRun";
DROP TABLE "AgentRun";
ALTER TABLE "new_AgentRun" RENAME TO "AgentRun";
CREATE INDEX "AgentRun_agentId_idx" ON "AgentRun"("agentId");
CREATE INDEX "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");

-- CreateIndex
CREATE INDEX "AgentRevision_createdAt_idx" ON "AgentRevision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRevision_agentId_version_key" ON "AgentRevision"("agentId", "version");

-- CreateIndex
CREATE INDEX "ExecutionRun_state_createdAt_idx" ON "ExecutionRun"("state", "createdAt");

-- CreateIndex
CREATE INDEX "ExecutionRun_agentRevisionId_idx" ON "ExecutionRun"("agentRevisionId");

-- CreateIndex
CREATE INDEX "ExecutionRun_parentRunId_idx" ON "ExecutionRun"("parentRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionRun_actorScope_requestKey_key" ON "ExecutionRun"("actorScope", "requestKey");

-- CreateIndex
CREATE INDEX "AuthorizationGrant_principalType_principalId_idx" ON "AuthorizationGrant"("principalType", "principalId");

-- CreateIndex
CREATE INDEX "AuthorizationGrant_agentId_idx" ON "AuthorizationGrant"("agentId");

-- CreateIndex
CREATE INDEX "AuthorizationGrant_expiresAt_idx" ON "AuthorizationGrant"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditRecord_targetType_targetId_createdAt_idx" ON "AuditRecord"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditRecord_createdAt_idx" ON "AuditRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Outbox_eventKey_key" ON "Outbox"("eventKey");

-- CreateIndex
CREATE INDEX "Outbox_deliveredAt_deadAt_nextAt_idx" ON "Outbox"("deliveredAt", "deadAt", "nextAt");

-- CreateIndex
CREATE INDEX "Outbox_aggregateId_idx" ON "Outbox"("aggregateId");

COMMIT;
PRAGMA foreign_keys=ON;
