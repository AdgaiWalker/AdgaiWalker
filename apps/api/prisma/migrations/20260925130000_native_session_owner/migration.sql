ALTER TABLE "ConversationLogResource" ADD COLUMN "agentRevisionId" TEXT;

-- V17 temporarily stored the revision locator in parentKey for native session rows.
UPDATE "ConversationLogResource"
SET "agentRevisionId" = "parentKey", "parentKey" = NULL
WHERE "resourceType" = 'native-session' AND "parentKey" IS NOT NULL;

CREATE INDEX "ConversationLogResource_agentRevisionId_idx" ON "ConversationLogResource"("agentRevisionId");
