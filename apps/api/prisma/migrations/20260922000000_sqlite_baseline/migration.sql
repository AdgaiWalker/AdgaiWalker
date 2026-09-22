-- CreateTable
CREATE TABLE "SchemaMeta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Clue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "poolStatus" TEXT NOT NULL DEFAULT 'candidate',
    "anonId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Seed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "severity" TEXT,
    "selfInterest" TEXT,
    "primaryClueId" TEXT,
    "workflowStatus" TEXT NOT NULL DEFAULT 'INBOX',
    "whyNow" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SeedClueLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seedId" TEXT NOT NULL,
    "clueId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    CONSTRAINT "SeedClueLink_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "Seed" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeedClueLink_clueId_fkey" FOREIGN KEY ("clueId") REFERENCES "Clue" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seedId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'doing',
    "deliveryUrl" TEXT,
    "deliveryForm" TEXT,
    "deliveryNote" TEXT,
    "outcome" TEXT,
    "evidence" TEXT,
    "contentBrief" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Execution_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "Seed" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "executionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_READY',
    "manifestPath" TEXT NOT NULL,
    "coreViewpoint" TEXT NOT NULL,
    "protectedClaims" JSONB NOT NULL,
    "approvedArtifactHash" TEXT,
    "currentStage" TEXT,
    "stageStartedAt" DATETIME,
    "lastOutputAt" DATETIME,
    "waitingReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Submission_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "Execution" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Action" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'TASK',
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "plannedDate" TEXT,
    "completedAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'HUMAN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submissionId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "artifactHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "url" TEXT,
    "lastError" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Publication_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GuestQuota" (
    "anonId" TEXT NOT NULL PRIMARY KEY,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FeatureEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featureKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "failCode" TEXT,
    "props" JSONB
);

-- CreateTable
CREATE TABLE "LikeCounter" (
    "path" TEXT NOT NULL PRIMARY KEY,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContentFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contentId" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "note" TEXT,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "convertedSeedId" TEXT,
    "convertedActionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SearchMiss" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssistantSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anonId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "runner" TEXT NOT NULL DEFAULT 'harness',
    "lastActiveAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssistantRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" TEXT NOT NULL DEFAULT '[]',
    "aiUsedFlag" BOOLEAN NOT NULL,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "traceId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'assistant-panel',
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "firstChunkMs" INTEGER,
    "queueWaitMs" INTEGER,
    "degradeReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AssistantBudget" (
    "date" TEXT NOT NULL PRIMARY KEY,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InsightReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekOf" TEXT NOT NULL,
    "inputSnapshot" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ModelProvider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "baseUrl" TEXT NOT NULL,
    "apiFormat" TEXT NOT NULL DEFAULT 'openai-compatible',
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "modelsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentUnit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'bot',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "providerId" TEXT,
    "modelId" TEXT NOT NULL DEFAULT 'deepseek-chat',
    "prompt" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentUnit_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ModelProvider" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SkillRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "skillId" TEXT NOT NULL,
    "skillVersion" TEXT NOT NULL DEFAULT '',
    "providerId" TEXT,
    "temperature" REAL,
    "input" TEXT NOT NULL DEFAULT '',
    "output" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "errorCode" TEXT,
    "tokensPrompt" INTEGER NOT NULL DEFAULT 0,
    "tokensCompletion" INTEGER NOT NULL DEFAULT 0,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AgentRun" (
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
    CONSTRAINT "AgentRun_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "AgentUnit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "SchemaMeta_key_key" ON "SchemaMeta"("key");

-- CreateIndex
CREATE INDEX "Clue_poolStatus_idx" ON "Clue"("poolStatus");

-- CreateIndex
CREATE INDEX "Clue_createdAt_idx" ON "Clue"("createdAt");

-- CreateIndex
CREATE INDEX "SeedClueLink_clueId_idx" ON "SeedClueLink"("clueId");

-- CreateIndex
CREATE UNIQUE INDEX "SeedClueLink_seedId_clueId_key" ON "SeedClueLink"("seedId", "clueId");

-- CreateIndex
CREATE INDEX "Execution_seedId_idx" ON "Execution"("seedId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_executionId_key" ON "Submission"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_idempotencyKey_key" ON "Submission"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");

-- CreateIndex
CREATE INDEX "Action_status_idx" ON "Action"("status");

-- CreateIndex
CREATE INDEX "Action_plannedDate_idx" ON "Action"("plannedDate");

-- CreateIndex
CREATE INDEX "Action_entityType_entityId_idx" ON "Action"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "Publication_status_idx" ON "Publication"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Publication_submissionId_channel_key" ON "Publication"("submissionId", "channel");

-- CreateIndex
CREATE INDEX "FeatureEvent_featureKey_event_idx" ON "FeatureEvent"("featureKey", "event");

-- CreateIndex
CREATE INDEX "FeatureEvent_at_idx" ON "FeatureEvent"("at");

-- CreateIndex
CREATE INDEX "ContentFeedback_contentId_idx" ON "ContentFeedback"("contentId");

-- CreateIndex
CREATE INDEX "ContentFeedback_createdAt_idx" ON "ContentFeedback"("createdAt");

-- CreateIndex
CREATE INDEX "SearchMiss_createdAt_idx" ON "SearchMiss"("createdAt");

-- CreateIndex
CREATE INDEX "AssistantSession_anonId_idx" ON "AssistantSession"("anonId");

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSession_anonId_sessionId_key" ON "AssistantSession"("anonId", "sessionId");

-- CreateIndex
CREATE INDEX "AssistantRun_sessionId_idx" ON "AssistantRun"("sessionId");

-- CreateIndex
CREATE INDEX "AssistantRun_createdAt_idx" ON "AssistantRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_name_key" ON "Credential"("name");

-- CreateIndex
CREATE INDEX "InsightReport_weekOf_idx" ON "InsightReport"("weekOf");

-- CreateIndex
CREATE INDEX "InsightReport_createdAt_idx" ON "InsightReport"("createdAt");

-- CreateIndex
CREATE INDEX "SkillRun_skillId_idx" ON "SkillRun"("skillId");

-- CreateIndex
CREATE INDEX "SkillRun_createdAt_idx" ON "SkillRun"("createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_agentId_idx" ON "AgentRun"("agentId");

-- CreateIndex
CREATE INDEX "AgentRun_createdAt_idx" ON "AgentRun"("createdAt");
