-- CreateTable
CREATE TABLE "ContentFeedback" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchMiss" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchMiss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentFeedback_contentId_idx" ON "ContentFeedback"("contentId");
CREATE INDEX "ContentFeedback_createdAt_idx" ON "ContentFeedback"("createdAt");
CREATE INDEX "SearchMiss_createdAt_idx" ON "SearchMiss"("createdAt");
