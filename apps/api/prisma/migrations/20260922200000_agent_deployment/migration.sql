-- CreateTable
CREATE TABLE "AgentDeployment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "placementKey" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL,
    "scopeSlug" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DeploymentMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deploymentId" TEXT NOT NULL,
    "agentRevisionId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "generation" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeploymentMember_deploymentId_fkey" FOREIGN KEY ("deploymentId") REFERENCES "AgentDeployment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeploymentMember_agentRevisionId_fkey" FOREIGN KEY ("agentRevisionId") REFERENCES "AgentRevision" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDeployment_placementKey_scopeKind_scopeSlug_key" ON "AgentDeployment"("placementKey", "scopeKind", "scopeSlug");

-- CreateIndex
CREATE INDEX "AgentDeployment_enabled_idx" ON "AgentDeployment"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentMember_deploymentId_agentRevisionId_key" ON "DeploymentMember"("deploymentId", "agentRevisionId");

-- CreateIndex
CREATE INDEX "DeploymentMember_agentRevisionId_idx" ON "DeploymentMember"("agentRevisionId");
