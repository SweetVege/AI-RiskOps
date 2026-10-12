-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfileAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfileAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dataScope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermissionSetCapability" (
    "id" TEXT NOT NULL,
    "permissionSetId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PermissionSetCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPermissionSetAssignment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissionSetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionSetAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserApplicationAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApplicationAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessAuditLog" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorProfile" TEXT,
    "targetUserId" TEXT NOT NULL,
    "previousPermissionSetId" TEXT,
    "previousPermissionSetName" TEXT,
    "nextPermissionSetId" TEXT,
    "nextPermissionSetName" TEXT,
    "previousApplicationIds" TEXT NOT NULL,
    "nextApplicationIds" TEXT NOT NULL,

    CONSTRAINT "AccessAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerTeam" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "policyTemplateId" TEXT,
    "integrationMethod" TEXT NOT NULL,
    "fieldCoverage" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCredential" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "integrationSource" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngestionRequestAudit" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "authMode" TEXT NOT NULL,
    "ingestionSource" TEXT NOT NULL,
    "applicationId" TEXT,
    "credentialId" TEXT,
    "traceId" TEXT,
    "sessionId" TEXT,
    "requestProfile" TEXT,
    "httpStatus" INTEGER NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "callLogId" TEXT,
    "riskEventId" TEXT,
    "model" TEXT,
    "environment" TEXT,
    "dataProtectionMode" TEXT,

    CONSTRAINT "IngestionRequestAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEnvironment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "callsToday" INTEGER NOT NULL,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationEnvironment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationValidationCheck" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "checkKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationValidationCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "defaultAction" TEXT NOT NULL,
    "thresholds" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "PolicyTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "baseScore" INTEGER NOT NULL,
    "defaultAction" TEXT NOT NULL,
    "iconName" TEXT NOT NULL,

    CONSTRAINT "RiskRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyRule" (
    "id" TEXT NOT NULL,
    "policyTemplateId" TEXT NOT NULL,
    "riskRuleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "thresholdOverride" INTEGER,
    "actionOverride" TEXT,

    CONSTRAINT "PolicyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleOperationalStat" (
    "id" TEXT NOT NULL,
    "riskRuleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "hits24h" INTEGER NOT NULL,
    "reviewedFalsePositiveRate" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "RuleOperationalStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "userRef" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "ragContext" TEXT NOT NULL,
    "toolCall" TEXT,

    CONSTRAINT "AiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "sourceCallLogId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "userRef" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "sla" TEXT NOT NULL,
    "riskExplanation" TEXT NOT NULL,
    "affectedAsset" TEXT,
    "recommendation" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEventRuleMatch" (
    "id" TEXT NOT NULL,
    "riskEventId" TEXT NOT NULL,
    "riskRuleId" TEXT NOT NULL,

    CONSTRAINT "RiskEventRuleMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskEventEvidence" (
    "id" TEXT NOT NULL,
    "riskEventId" TEXT NOT NULL,
    "riskRuleId" TEXT,
    "signal" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "impact" TEXT NOT NULL,

    CONSTRAINT "RiskEventEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "UserProfileAssignment_userId_idx" ON "UserProfileAssignment"("userId");

-- CreateIndex
CREATE INDEX "UserProfileAssignment_profile_idx" ON "UserProfileAssignment"("profile");

-- CreateIndex
CREATE INDEX "PermissionSet_dataScope_idx" ON "PermissionSet"("dataScope");

-- CreateIndex
CREATE INDEX "PermissionSetCapability_capability_idx" ON "PermissionSetCapability"("capability");

-- CreateIndex
CREATE UNIQUE INDEX "PermissionSetCapability_permissionSetId_capability_key" ON "PermissionSetCapability"("permissionSetId", "capability");

-- CreateIndex
CREATE INDEX "UserPermissionSetAssignment_permissionSetId_idx" ON "UserPermissionSetAssignment"("permissionSetId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPermissionSetAssignment_userId_permissionSetId_key" ON "UserPermissionSetAssignment"("userId", "permissionSetId");

-- CreateIndex
CREATE INDEX "UserApplicationAccess_applicationId_idx" ON "UserApplicationAccess"("applicationId");

-- CreateIndex
CREATE INDEX "UserApplicationAccess_permission_idx" ON "UserApplicationAccess"("permission");

-- CreateIndex
CREATE UNIQUE INDEX "UserApplicationAccess_userId_applicationId_key" ON "UserApplicationAccess"("userId", "applicationId");

-- CreateIndex
CREATE INDEX "AccessAuditLog_occurredAt_idx" ON "AccessAuditLog"("occurredAt");

-- CreateIndex
CREATE INDEX "AccessAuditLog_actorUserId_idx" ON "AccessAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AccessAuditLog_targetUserId_idx" ON "AccessAuditLog"("targetUserId");

-- CreateIndex
CREATE INDEX "AccessAuditLog_action_idx" ON "AccessAuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "Application_slug_key" ON "Application"("slug");

-- CreateIndex
CREATE INDEX "ApplicationCredential_applicationId_idx" ON "ApplicationCredential"("applicationId");

-- CreateIndex
CREATE INDEX "ApplicationCredential_status_idx" ON "ApplicationCredential"("status");

-- CreateIndex
CREATE INDEX "ApplicationCredential_integrationSource_idx" ON "ApplicationCredential"("integrationSource");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCredential_keyPrefix_key" ON "ApplicationCredential"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationCredential_keyHash_key" ON "ApplicationCredential"("keyHash");

-- CreateIndex
CREATE INDEX "IngestionRequestAudit_occurredAt_idx" ON "IngestionRequestAudit"("occurredAt");

-- CreateIndex
CREATE INDEX "IngestionRequestAudit_status_idx" ON "IngestionRequestAudit"("status");

-- CreateIndex
CREATE INDEX "IngestionRequestAudit_applicationId_idx" ON "IngestionRequestAudit"("applicationId");

-- CreateIndex
CREATE INDEX "IngestionRequestAudit_credentialId_idx" ON "IngestionRequestAudit"("credentialId");

-- CreateIndex
CREATE INDEX "IngestionRequestAudit_traceId_idx" ON "IngestionRequestAudit"("traceId");

-- CreateIndex
CREATE INDEX "IngestionRequestAudit_errorCode_idx" ON "IngestionRequestAudit"("errorCode");

-- CreateIndex
CREATE INDEX "ApplicationEnvironment_applicationId_idx" ON "ApplicationEnvironment"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationValidationCheck_applicationId_checkKey_key" ON "IntegrationValidationCheck"("applicationId", "checkKey");

-- CreateIndex
CREATE INDEX "PolicyRule_enabled_idx" ON "PolicyRule"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyRule_policyTemplateId_riskRuleId_key" ON "PolicyRule"("policyTemplateId", "riskRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleOperationalStat_riskRuleId_key" ON "RuleOperationalStat"("riskRuleId");

-- CreateIndex
CREATE INDEX "AiCallLog_applicationId_idx" ON "AiCallLog"("applicationId");

-- CreateIndex
CREATE INDEX "AiCallLog_occurredAt_idx" ON "AiCallLog"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEvent_sourceCallLogId_key" ON "RiskEvent"("sourceCallLogId");

-- CreateIndex
CREATE INDEX "RiskEvent_applicationId_idx" ON "RiskEvent"("applicationId");

-- CreateIndex
CREATE INDEX "RiskEvent_sourceCallLogId_idx" ON "RiskEvent"("sourceCallLogId");

-- CreateIndex
CREATE INDEX "RiskEvent_occurredAt_idx" ON "RiskEvent"("occurredAt");

-- CreateIndex
CREATE INDEX "RiskEvent_level_idx" ON "RiskEvent"("level");

-- CreateIndex
CREATE INDEX "RiskEvent_action_idx" ON "RiskEvent"("action");

-- CreateIndex
CREATE INDEX "RiskEvent_reviewStatus_idx" ON "RiskEvent"("reviewStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RiskEventRuleMatch_riskEventId_riskRuleId_key" ON "RiskEventRuleMatch"("riskEventId", "riskRuleId");

-- CreateIndex
CREATE INDEX "RiskEventEvidence_riskEventId_idx" ON "RiskEventEvidence"("riskEventId");

-- CreateIndex
CREATE INDEX "RiskEventEvidence_riskRuleId_idx" ON "RiskEventEvidence"("riskRuleId");

-- AddForeignKey
ALTER TABLE "UserProfileAssignment" ADD CONSTRAINT "UserProfileAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermissionSetCapability" ADD CONSTRAINT "PermissionSetCapability_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionSetAssignment" ADD CONSTRAINT "UserPermissionSetAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPermissionSetAssignment" ADD CONSTRAINT "UserPermissionSetAssignment_permissionSetId_fkey" FOREIGN KEY ("permissionSetId") REFERENCES "PermissionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApplicationAccess" ADD CONSTRAINT "UserApplicationAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserApplicationAccess" ADD CONSTRAINT "UserApplicationAccess_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_policyTemplateId_fkey" FOREIGN KEY ("policyTemplateId") REFERENCES "PolicyTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCredential" ADD CONSTRAINT "ApplicationCredential_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRequestAudit" ADD CONSTRAINT "IngestionRequestAudit_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngestionRequestAudit" ADD CONSTRAINT "IngestionRequestAudit_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ApplicationCredential"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEnvironment" ADD CONSTRAINT "ApplicationEnvironment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationValidationCheck" ADD CONSTRAINT "IntegrationValidationCheck_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_policyTemplateId_fkey" FOREIGN KEY ("policyTemplateId") REFERENCES "PolicyTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyRule" ADD CONSTRAINT "PolicyRule_riskRuleId_fkey" FOREIGN KEY ("riskRuleId") REFERENCES "RiskRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleOperationalStat" ADD CONSTRAINT "RuleOperationalStat_riskRuleId_fkey" FOREIGN KEY ("riskRuleId") REFERENCES "RiskRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiCallLog" ADD CONSTRAINT "AiCallLog_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEvent" ADD CONSTRAINT "RiskEvent_sourceCallLogId_fkey" FOREIGN KEY ("sourceCallLogId") REFERENCES "AiCallLog"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEventRuleMatch" ADD CONSTRAINT "RiskEventRuleMatch_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "RiskEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEventRuleMatch" ADD CONSTRAINT "RiskEventRuleMatch_riskRuleId_fkey" FOREIGN KEY ("riskRuleId") REFERENCES "RiskRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskEventEvidence" ADD CONSTRAINT "RiskEventEvidence_riskEventId_fkey" FOREIGN KEY ("riskEventId") REFERENCES "RiskEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

