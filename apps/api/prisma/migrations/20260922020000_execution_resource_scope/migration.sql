-- Persist the admitted object scope. Unknown historical scope denies child execution.
ALTER TABLE "ExecutionRun" ADD COLUMN "resourceScope" JSONB;
