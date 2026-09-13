-- 观测 P1：AssistantRun 增采集列（token / 首字延迟 / 排队 / 降级原因）。
-- 从 schema.postgresql.prisma 逐字段对照生成；空库重放迁移后应与 schema 无差异。
-- SQLite（生产）以 schema.prisma 为准走 `pnpm db:push`，本迁移服务 PG 路径。

-- AlterTable
ALTER TABLE "AssistantRun" ADD COLUMN "tokensIn" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AssistantRun" ADD COLUMN "tokensOut" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AssistantRun" ADD COLUMN "cacheReadTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AssistantRun" ADD COLUMN "firstChunkMs" INTEGER;
ALTER TABLE "AssistantRun" ADD COLUMN "queueWaitMs" INTEGER;
ALTER TABLE "AssistantRun" ADD COLUMN "degradeReason" TEXT;
