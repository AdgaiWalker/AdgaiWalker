CREATE TABLE "AdminRequestLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actor" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AdminRequestLog_createdAt_id_idx" ON "AdminRequestLog"("createdAt", "id");
CREATE INDEX "AdminRequestLog_method_createdAt_idx" ON "AdminRequestLog"("method", "createdAt");
