-- 补齐 assistant/凭据/洞察五表：client 已有模型而库缺表（启用 PG 前必须就位）。
-- 从 schema.postgresql.prisma 逐字段对照生成；空库重放迁移后应与 schema 无差异。

-- CreateTable
CREATE TABLE "AssistantSession" (
    "id" TEXT NOT NULL,
    "anonId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "runner" TEXT NOT NULL DEFAULT 'harness',
    "lastActiveAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "citations" TEXT NOT NULL DEFAULT '[]',
    "aiUsedFlag" BOOLEAN NOT NULL,
    "elapsedMs" INTEGER NOT NULL DEFAULT 0,
    "traceId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'assistant-panel',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantBudget" (
    "date" TEXT NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantBudget_pkey" PRIMARY KEY ("date")
);

-- CreateTable
CREATE TABLE "Credential" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightReport" (
    "id" TEXT NOT NULL,
    "weekOf" TEXT NOT NULL,
    "inputSnapshot" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssistantSession_anonId_sessionId_key" ON "AssistantSession"("anonId", "sessionId");

-- CreateIndex
CREATE INDEX "AssistantSession_anonId_idx" ON "AssistantSession"("anonId");

-- CreateIndex
CREATE INDEX "AssistantRun_sessionId_idx" ON "AssistantRun"("sessionId");

-- CreateIndex
CREATE INDEX "AssistantRun_createdAt_idx" ON "AssistantRun"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Credential_name_key" ON "Credential"("name");

-- CreateIndex
CREATE INDEX "InsightReport_weekOf_idx" ON "InsightReport"("weekOf");

-- CreateIndex
CREATE INDEX "InsightReport_createdAt_idx" ON "InsightReport"("createdAt");
