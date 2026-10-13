-- G01: 旧数据导入溯源列与唯一索引
ALTER TABLE "ExecutionRun" ADD COLUMN "legacySource" TEXT;
ALTER TABLE "ExecutionRun" ADD COLUMN "legacyId" TEXT;
CREATE UNIQUE INDEX "ExecutionRun_legacySource_legacyId_key" ON "ExecutionRun"("legacySource", "legacyId");
