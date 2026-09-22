-- AlterTable
ALTER TABLE "ExecutionRun" ADD COLUMN "input" TEXT;

-- CreateTable
CREATE TABLE "ExecutionQuotaHold" (
    "runId" TEXT NOT NULL PRIMARY KEY,
    "grantId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "usage" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExecutionSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "consecutivePublicClaims" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AuthorizationGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "principalType" TEXT NOT NULL,
    "principalId" TEXT NOT NULL,
    "agentId" TEXT,
    "origin" TEXT NOT NULL,
    "actions" JSONB NOT NULL,
    "resourceScope" JSONB NOT NULL,
    "expiresAt" DATETIME,
    "runLimit" INTEGER,
    "usageLimit" INTEGER,
    "runsReserved" INTEGER NOT NULL DEFAULT 0,
    "runsCharged" INTEGER NOT NULL DEFAULT 0,
    "usageReserved" INTEGER NOT NULL DEFAULT 0,
    "usageCharged" INTEGER NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_AuthorizationGrant" ("actions", "agentId", "createdAt", "expiresAt", "id", "origin", "principalId", "principalType", "resourceScope", "revision", "revokedAt", "runLimit", "updatedAt", "usageLimit") SELECT "actions", "agentId", "createdAt", "expiresAt", "id", "origin", "principalId", "principalType", "resourceScope", "revision", "revokedAt", "runLimit", "updatedAt", "usageLimit" FROM "AuthorizationGrant";
DROP TABLE "AuthorizationGrant";
ALTER TABLE "new_AuthorizationGrant" RENAME TO "AuthorizationGrant";
CREATE INDEX "AuthorizationGrant_principalType_principalId_idx" ON "AuthorizationGrant"("principalType", "principalId");
CREATE INDEX "AuthorizationGrant_agentId_idx" ON "AuthorizationGrant"("agentId");
CREATE INDEX "AuthorizationGrant_expiresAt_idx" ON "AuthorizationGrant"("expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ExecutionQuotaHold_grantId_idx" ON "ExecutionQuotaHold"("grantId");
