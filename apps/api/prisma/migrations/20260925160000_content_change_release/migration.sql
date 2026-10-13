-- CreateTable
CREATE TABLE "ContentChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL DEFAULT 'apply-candidate',
    "targetSlug" TEXT NOT NULL,
    "baseHash" TEXT NOT NULL,
    "candidateHash" TEXT NOT NULL,
    "candidateRef" TEXT NOT NULL,
    "sourceRunId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PROPOSED',
    "applyApprovalId" TEXT,
    "applyApprovalHash" TEXT,
    "applyGrantId" TEXT,
    "applyGrantRevision" INTEGER,
    "applyApprovedBy" TEXT,
    "applyApprovedAt" DATETIME,
    "appliedHash" TEXT,
    "requestKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ContentRelease" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "changeId" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT 'publish-website',
    "targetSlug" TEXT NOT NULL,
    "baseHash" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "publishApprovalId" TEXT NOT NULL,
    "publishApprovalHash" TEXT NOT NULL,
    "publishGrantId" TEXT NOT NULL,
    "publishGrantRevision" INTEGER NOT NULL,
    "publishApprovedBy" TEXT NOT NULL,
    "publishApprovedAt" DATETIME NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'PREPARED',
    "assistantIndexState" TEXT NOT NULL DEFAULT 'PENDING',
    "manifestHash" TEXT,
    "manifestRef" TEXT,
    "gitCommit" TEXT,
    "publishedSnapshotId" TEXT,
    "verifiedHash" TEXT,
    "verifiedAt" DATETIME,
    "errorCode" TEXT,
    "requestKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentRelease_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "ContentChange" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentChange_requestKey_key" ON "ContentChange"("requestKey");

-- CreateIndex
CREATE INDEX "ContentChange_targetSlug_state_createdAt_idx" ON "ContentChange"("targetSlug", "state", "createdAt");

-- CreateIndex
CREATE INDEX "ContentChange_sourceRunId_idx" ON "ContentChange"("sourceRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentRelease_requestKey_key" ON "ContentRelease"("requestKey");

-- CreateIndex
CREATE INDEX "ContentRelease_changeId_createdAt_idx" ON "ContentRelease"("changeId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentRelease_targetSlug_stage_createdAt_idx" ON "ContentRelease"("targetSlug", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "ContentRelease_stage_updatedAt_idx" ON "ContentRelease"("stage", "updatedAt");
