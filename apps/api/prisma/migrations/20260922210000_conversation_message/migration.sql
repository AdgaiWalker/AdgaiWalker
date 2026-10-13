-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "anonId" TEXT NOT NULL,
    "placementKey" TEXT NOT NULL,
    "scopeSlug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ConversationSdkSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "agentRevisionId" TEXT NOT NULL,
    "sdkSessionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationSdkSession_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationTurn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "requestKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turnId" TEXT NOT NULL,
    "agentRevisionId" TEXT NOT NULL,
    "runId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationAttempt_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "ConversationTurn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "turnId" TEXT NOT NULL,
    "attemptId" TEXT,
    "role" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "delivery" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConversationMessage_turnId_fkey" FOREIGN KEY ("turnId") REFERENCES "ConversationTurn" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ConversationMessage_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ConversationAttempt" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "FeatureEvent" ADD COLUMN "eventId" TEXT;
ALTER TABLE "FeatureEvent" ADD COLUMN "conversationId" TEXT;
ALTER TABLE "FeatureEvent" ADD COLUMN "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Conversation_anonId_updatedAt_idx" ON "Conversation"("anonId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_placementKey_scopeSlug_idx" ON "Conversation"("placementKey", "scopeSlug");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationSdkSession_conversationId_agentRevisionId_key" ON "ConversationSdkSession"("conversationId", "agentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_conversationId_requestKey_key" ON "ConversationTurn"("conversationId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationTurn_conversationId_seq_key" ON "ConversationTurn"("conversationId", "seq");

-- CreateIndex
CREATE INDEX "ConversationAttempt_turnId_idx" ON "ConversationAttempt"("turnId");

-- CreateIndex
CREATE INDEX "ConversationAttempt_runId_idx" ON "ConversationAttempt"("runId");

-- CreateIndex
CREATE INDEX "ConversationMessage_turnId_createdAt_idx" ON "ConversationMessage"("turnId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationMessage_attemptId_idx" ON "ConversationMessage"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureEvent_eventId_key" ON "FeatureEvent"("eventId");

-- CreateIndex
CREATE INDEX "FeatureEvent_conversationId_idx" ON "FeatureEvent"("conversationId");
