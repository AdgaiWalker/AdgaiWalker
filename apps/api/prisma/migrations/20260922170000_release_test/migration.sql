-- AlterTable
ALTER TABLE "ExecutionRun" ADD COLUMN "testCaseId" TEXT;
ALTER TABLE "ExecutionRun" ADD COLUMN "suiteVersion" INTEGER;
ALTER TABLE "ExecutionRun" ADD COLUMN "configHash" TEXT;
ALTER TABLE "ExecutionRun" ADD COLUMN "assertion" JSONB;
