ALTER TABLE "ContentFeedback"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "convertedSeedId" TEXT,
ADD COLUMN "convertedActionId" TEXT;

ALTER TABLE "Submission"
ADD COLUMN "currentStage" TEXT,
ADD COLUMN "stageStartedAt" TIMESTAMP(3),
ADD COLUMN "lastOutputAt" TIMESTAMP(3),
ADD COLUMN "waitingReason" TEXT;
