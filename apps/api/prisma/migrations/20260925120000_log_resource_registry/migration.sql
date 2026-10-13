-- CreateTable
CREATE TABLE "ConversationLogResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT,
    "resourceType" TEXT NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "parentKey" TEXT,
    "resourceCreatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DeletionTombstone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "LogRetentionPolicy" (
    "id" TEXT NOT NULL DEFAULT 'site' PRIMARY KEY,
    "detailRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "aggregateRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ConversationLogResource_resourceType_resourceKey_key" ON "ConversationLogResource"("resourceType", "resourceKey");
CREATE INDEX "ConversationLogResource_conversationId_resourceCreatedAt_idx" ON "ConversationLogResource"("conversationId", "resourceCreatedAt");
CREATE INDEX "ConversationLogResource_resourceType_resourceCreatedAt_idx" ON "ConversationLogResource"("resourceType", "resourceCreatedAt");
CREATE INDEX "ConversationLogResource_parentKey_idx" ON "ConversationLogResource"("parentKey");
CREATE UNIQUE INDEX "DeletionTombstone_conversationId_key" ON "DeletionTombstone"("conversationId");
CREATE INDEX "DeletionTombstone_state_requestedAt_idx" ON "DeletionTombstone"("state", "requestedAt");

-- Backfill database resources so new reads can enumerate pre-V17 body copies.
INSERT OR IGNORE INTO "ConversationLogResource" ("id", "conversationId", "resourceType", "resourceKey", "parentKey", "resourceCreatedAt", "registeredAt")
SELECT 'message:' || message."id", conversation."id", 'message', message."id", message."turnId", message."createdAt", CURRENT_TIMESTAMP
FROM "ConversationMessage" message
JOIN "ConversationTurn" turn ON turn."id" = message."turnId"
JOIN "Conversation" conversation ON conversation."id" = turn."conversationId";

INSERT OR IGNORE INTO "ConversationLogResource" ("id", "conversationId", "resourceType", "resourceKey", "parentKey", "resourceCreatedAt", "registeredAt")
SELECT 'event:' || event."id", event."conversationId", 'event', event."id", NULL, event."receivedAt", CURRENT_TIMESTAMP
FROM "FeatureEvent" event;

INSERT OR IGNORE INTO "ConversationLogResource" ("id", "conversationId", "resourceType", "resourceKey", "parentKey", "resourceCreatedAt", "registeredAt")
SELECT 'native-session:' || session."id", session."conversationId", 'native-session', session."sdkSessionId", session."agentRevisionId", session."createdAt", CURRENT_TIMESTAMP
FROM "ConversationSdkSession" session;

INSERT OR IGNORE INTO "ConversationLogResource" ("id", "conversationId", "resourceType", "resourceKey", "parentKey", "resourceCreatedAt", "registeredAt")
SELECT 'assistant-run:' || run."id", conversation."id", 'assistant-run', run."id", run."sessionId", run."createdAt", CURRENT_TIMESTAMP
FROM "AssistantRun" run
JOIN "ConversationTurn" turn ON turn."requestKey" = run."requestKey"
JOIN "Conversation" conversation ON conversation."id" = turn."conversationId" AND conversation."anonId" = run."anonIdHash";

INSERT OR IGNORE INTO "ConversationLogResource" ("id", "conversationId", "resourceType", "resourceKey", "parentKey", "resourceCreatedAt", "registeredAt")
SELECT 'assistant-run:unlinked:' || run."id", NULL, 'assistant-run', run."id", run."sessionId", run."createdAt", CURRENT_TIMESTAMP
FROM "AssistantRun" run
WHERE NOT EXISTS (
    SELECT 1 FROM "ConversationLogResource" resource
    WHERE resource."resourceType" = 'assistant-run' AND resource."resourceKey" = run."id"
);

INSERT OR IGNORE INTO "ConversationLogResource" ("id", "conversationId", "resourceType", "resourceKey", "parentKey", "resourceCreatedAt", "registeredAt")
SELECT 'execution-run:' || run."id", conversation."id", 'execution-run', run."id", NULL, run."createdAt", CURRENT_TIMESTAMP
FROM "ExecutionRun" run
LEFT JOIN "ConversationAttempt" attempt ON attempt."runId" = run."id"
LEFT JOIN "ConversationTurn" turn ON turn."id" = attempt."turnId"
LEFT JOIN "Conversation" conversation ON conversation."id" = turn."conversationId";

INSERT OR IGNORE INTO "ConversationLogResource" ("id", "conversationId", "resourceType", "resourceKey", "parentKey", "resourceCreatedAt", "registeredAt")
SELECT 'execution-event:' || event."id", run_resource."conversationId", 'execution-event', event."id", event."runId", event."createdAt", CURRENT_TIMESTAMP
FROM "ExecutionEvent" event
JOIN "ConversationLogResource" run_resource ON run_resource."resourceType" = 'execution-run' AND run_resource."resourceKey" = event."runId";

INSERT OR IGNORE INTO "LogRetentionPolicy" ("id", "detailRetentionDays", "aggregateRetentionDays", "updatedAt")
VALUES ('site', 90, 365, CURRENT_TIMESTAMP);
