CREATE TABLE "ConversationExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "filters" JSONB NOT NULL,
    "snapshotAt" DATETIME NOT NULL,
    "retentionCutoff" DATETIME NOT NULL,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT
);

CREATE INDEX "ConversationExportJob_status_snapshotAt_idx" ON "ConversationExportJob"("status", "snapshotAt");
