-- AlterTable: Action 增量（到期瞬时 + 生成时区；旧行保持 NULL，不反推）
ALTER TABLE "Action" ADD COLUMN "dueAt" DATETIME;
ALTER TABLE "Action" ADD COLUMN "timezone" TEXT;

-- CreateIndex
CREATE INDEX "Action_dueAt_status_idx" ON "Action"("dueAt", "status");

-- CreateTable
CREATE TABLE "ReminderOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "dueAt" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL,
    "outcome" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "notifiedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderOccurrence_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReminderOccurrence_dedupeKey_key" ON "ReminderOccurrence"("dedupeKey");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_actionId_createdAt_idx" ON "ReminderOccurrence"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "ReminderOccurrence_outcome_createdAt_idx" ON "ReminderOccurrence"("outcome", "createdAt");

-- CreateTable
CREATE TABLE "ReviewEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actionId" TEXT NOT NULL,
    "releaseId" TEXT,
    "didWhat" TEXT NOT NULL,
    "observed" TEXT,
    "windowStart" TEXT,
    "windowEnd" TEXT,
    "nextAttempt" TEXT,
    "evidenceState" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "evidenceNote" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'owner',
    "requestKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewEntry_actionId_fkey" FOREIGN KEY ("actionId") REFERENCES "Action" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReviewEntry_requestKey_key" ON "ReviewEntry"("requestKey");

-- CreateIndex
CREATE INDEX "ReviewEntry_actionId_createdAt_idx" ON "ReviewEntry"("actionId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewEntry_createdAt_idx" ON "ReviewEntry"("createdAt");
