-- CreateTable
CREATE TABLE "ProcessRecord" (
    "runId" TEXT NOT NULL PRIMARY KEY,
    "bootId" TEXT NOT NULL,
    "pid" INTEGER,
    "startedAt" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessRecord_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ExecutionRun" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProcessRecord_bootId_idx" ON "ProcessRecord"("bootId");
