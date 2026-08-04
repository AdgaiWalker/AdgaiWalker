ALTER TABLE "ContentFeedback"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN "convertedSeedId" TEXT,
ADD COLUMN "convertedActionId" TEXT;

