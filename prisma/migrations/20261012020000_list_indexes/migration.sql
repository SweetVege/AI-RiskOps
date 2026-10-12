-- CreateIndex
CREATE INDEX "AiCallLog_applicationId_occurredAt_idx" ON "AiCallLog"("applicationId", "occurredAt");

-- CreateIndex
CREATE INDEX "RiskEvent_applicationId_occurredAt_idx" ON "RiskEvent"("applicationId", "occurredAt");
