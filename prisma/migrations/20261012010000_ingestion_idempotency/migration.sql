-- CreateIndex
CREATE UNIQUE INDEX "AiCallLog_applicationId_traceId_key" ON "AiCallLog"("applicationId", "traceId");

-- CreateIndex
CREATE INDEX "IngestionRequestAudit_credentialId_occurredAt_idx" ON "IngestionRequestAudit"("credentialId", "occurredAt");
