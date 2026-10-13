-- AlterTable
ALTER TABLE "AssistantRun" ADD COLUMN "anonIdHash" TEXT;
ALTER TABLE "AssistantRun" ADD COLUMN "requestKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AssistantRun_anonIdHash_requestKey_key" ON "AssistantRun"("anonIdHash", "requestKey");
