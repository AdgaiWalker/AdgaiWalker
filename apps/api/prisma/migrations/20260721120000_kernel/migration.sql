-- CreateTable
CREATE TABLE "Clue" (
    "id" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "poolStatus" TEXT NOT NULL DEFAULT 'candidate',
    "anonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Clue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seed" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT,
    "selfInterest" TEXT,
    "primaryClueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Seed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeedClueLink" (
    "id" TEXT NOT NULL,
    "seedId" TEXT NOT NULL,
    "clueId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "SeedClueLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Execution" (
    "id" TEXT NOT NULL,
    "seedId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'doing',
    "deliveryUrl" TEXT,
    "deliveryForm" TEXT,
    "deliveryNote" TEXT,
    "outcome" TEXT,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Execution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuestQuota" (
    "anonId" TEXT NOT NULL,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuestQuota_pkey" PRIMARY KEY ("anonId")
);

-- CreateTable
CREATE TABLE "FeatureEvent" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "featureKey" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "failCode" TEXT,
    "props" JSONB,

    CONSTRAINT "FeatureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Clue_poolStatus_idx" ON "Clue"("poolStatus");
CREATE INDEX "Clue_createdAt_idx" ON "Clue"("createdAt");
CREATE INDEX "SeedClueLink_clueId_idx" ON "SeedClueLink"("clueId");
CREATE UNIQUE INDEX "SeedClueLink_seedId_clueId_key" ON "SeedClueLink"("seedId", "clueId");
CREATE INDEX "Execution_seedId_idx" ON "Execution"("seedId");
CREATE INDEX "FeatureEvent_featureKey_event_idx" ON "FeatureEvent"("featureKey", "event");
CREATE INDEX "FeatureEvent_at_idx" ON "FeatureEvent"("at");

-- AddForeignKey
ALTER TABLE "SeedClueLink" ADD CONSTRAINT "SeedClueLink_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "Seed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SeedClueLink" ADD CONSTRAINT "SeedClueLink_clueId_fkey" FOREIGN KEY ("clueId") REFERENCES "Clue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Execution" ADD CONSTRAINT "Execution_seedId_fkey" FOREIGN KEY ("seedId") REFERENCES "Seed"("id") ON DELETE CASCADE ON UPDATE CASCADE;
