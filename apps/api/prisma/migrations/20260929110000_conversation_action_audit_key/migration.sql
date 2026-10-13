-- A nullable requestId keeps ordinary audit rows unrestricted while making
-- operation-keyed audit facts unique per action and target type.
CREATE UNIQUE INDEX "AuditRecord_action_targetType_requestId_key"
ON "AuditRecord"("action", "targetType", "requestId");
