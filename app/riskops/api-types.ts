import { type ReviewStatus, type RiskEvent } from "@/lib/risk-data";
import { type RiskEvaluation } from "@/lib/risk-engine";

export type OverviewSummaryApi = {
  modelCallsToday: number;
  riskEvents: number;
  blocked: number;
  averageEventRiskScore: number;
  severeEvents: number;
  highRiskEvents: number;
  blockedModelCalls: number;
};

export type OverviewTrendBucketApi = {
  key: string;
  label: string;
  total: number;
  severity: {
    low: number;
    medium: number;
    high: number;
    severe: number;
  };
  highSevereRate: number;
};

export type OverviewCategoryApi = {
  category: string;
  count: number;
  percentage: number;
};

export type OverviewTopApplicationApi = {
  id: string;
  name: string;
  slug: string;
  ownerTeam: string;
  severeCount: number;
  highCount: number;
  riskEventCount: number;
  callLogCount: number;
  blockedCount: number;
  averageEventRiskScore: number;
  maxRiskScore: number;
};

export type OverviewSevereEventApi = {
  id: string;
  occurredAt: string;
  application: {
    id: string;
    name: string;
    slug: string;
  };
  title: string;
  userRef: string;
  department: string;
  score: number;
  level: RiskEvent["level"];
  action: RiskEvent["action"];
  reviewStatus: ReviewStatus;
  owner: string;
  sla: string;
  affectedAsset: string | null;
  matchedRules: Array<{
    id: string;
    name: string;
    category: string;
  }>;
};

export type OverviewApiData = {
  summary: OverviewSummaryApi;
  categories: OverviewCategoryApi[];
  topApplications: OverviewTopApplicationApi[];
  severeEvents: OverviewSevereEventApi[];
};

export type RiskRuleApi = {
  id: string;
  name: string;
  category: string;
  trigger?: string;
  baseScore?: number;
  defaultAction?: RiskEvent["action"];
  iconName?: string;
};

export type PolicyCenterSummaryApi = {
  policyTemplates: number;
  enabledTemplates: number;
  riskRules: number;
  enabledPolicyRules: number;
  hits24h: number;
  highFalsePositiveRules: number;
};

export type PolicyTemplateApi = {
  id: string;
  name: string;
  scope: string;
  defaultAction: string;
  thresholds: string;
  scoreBands: {
    reviewAt: number | null;
    blockAt: number | null;
    escalateAt: number | null;
    // True when the template sets no band and the built-in default applies.
    usesDefault: boolean;
  };
  enabled: boolean;
  ruleCount: number;
  enabledRuleCount: number;
  appliedApplicationCount: number;
};

export type PolicyRuleStateApi = {
  id: string;
  enabled: boolean;
  thresholdOverride: number | null;
  actionOverride: string | null;
  policyTemplate: {
    id: string;
    name: string;
  };
  riskRule: Required<RiskRuleApi> & { baseline?: boolean };
  operationalStat: {
    hits24h: number;
    reviewedFalsePositiveRate: number;
  };
};

export type PolicyRuleRow = {
  id: string;
  name: string;
  category: string;
  trigger: string;
  baseScore: number;
  defaultAction: RiskEvent["action"];
  hits24h: number;
  reviewedFalsePositiveRate: number;
  policyRuleCount: number;
  enabledPolicyRuleCount: number;
  // Enforced for every application regardless of its template, so it cannot be switched off.
  baseline: boolean;
};

export type RiskEventListItemApi = {
  id: string;
  occurredAt: string;
  application: {
    id: string;
    name: string;
    slug: string;
  };
  title: string;
  userRef: string;
  department: string;
  model: string;
  environment: string;
  score: number;
  level: RiskEvent["level"];
  action: RiskEvent["action"];
  reviewStatus: ReviewStatus;
  owner: string;
  sla: string;
  affectedAsset: string | null;
  matchedRules: RiskRuleApi[];
  evidenceCount: number;
  linkedCallLogId: string | null;
  updatedAt: string;
};

export type DataProtectionApi = {
  mode: string;
  rawContentAvailable: boolean;
  appliedFindings: string[];
};

export type PaginationApi = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type RiskEventDetailApi = RiskEventListItemApi & {
  riskExplanation: string;
  recommendation: string;
  evidence: Array<{
    id: string;
    riskRuleId: string | null;
    signal: string;
    evidence: string;
    impact: string;
  }>;
  callLogs: Array<{
    id: string;
    traceId: string;
    occurredAt: string;
    userRef: string;
    model: string;
    environment: string;
    score: number;
    level: RiskEvent["level"];
    action: RiskEvent["action"];
    prompt: string;
    output: string;
    ragContext: string;
    toolCall: string | null;
    dataProtection?: DataProtectionApi;
  }>;
};

export type CallLogLinkedRiskEventApi = {
  id: string;
  occurredAt?: string;
  application?: {
    id: string;
    name: string;
    slug: string;
  };
  title: string;
  userRef?: string;
  department?: string;
  score: number;
  level: RiskEvent["level"];
  action: RiskEvent["action"];
  reviewStatus: ReviewStatus;
  owner?: string;
  sla?: string;
  affectedAsset?: string | null;
  riskExplanation?: string;
  recommendation?: string;
  matchedRules: RiskRuleApi[];
  evidence?: Array<{
    id: string;
    riskRuleId: string | null;
    signal: string;
    evidence: string;
    impact: string;
  }>;
};

export type CallLogListItemApi = {
  id: string;
  traceId: string;
  occurredAt: string;
  application: {
    id: string;
    name: string;
    slug: string;
  };
  userRef: string;
  model: string;
  environment: string;
  score: number;
  level: RiskEvent["level"];
  action: RiskEvent["action"];
  promptPreview: string;
  outputPreview: string;
  ragContextPreview: string;
  toolCall: string | null;
  dataProtection?: DataProtectionApi;
  linkedRiskEvent: CallLogLinkedRiskEventApi | null;
};

export type CallLogDetailApi = Omit<
  CallLogListItemApi,
  "promptPreview" | "outputPreview" | "ragContextPreview"
> & {
  prompt: string;
  output: string;
  ragContext: string;
  dataProtection?: DataProtectionApi;
};

export type ApplicationEnvironmentApi = {
  id: string;
  applicationId: string;
  name: string;
  status: string;
  callsToday: number;
  lastSeenAt: string | null;
};

export type ApplicationValidationCheckApi = {
  id: string;
  applicationId: string;
  checkKey: string;
  label: string;
  status: string;
  updatedAt: string;
};

export type ApplicationPolicyTemplateApi = {
  id: string;
  name: string;
  enabled: boolean;
  scope?: string;
  defaultAction?: string;
  thresholds?: string;
  rules?: RiskRuleApi[];
};

export type ApplicationMetricsApi = {
  callLogCount: number;
  riskEventCount: number;
  severeCount: number;
  highCount: number;
  maxRiskScore?: number;
  latestEventAt?: string | null;
};

export type ApplicationRecentRiskEventApi = {
  id: string;
  occurredAt: string;
  title: string;
  score: number;
  level: RiskEvent["level"];
  action: RiskEvent["action"];
  reviewStatus: ReviewStatus;
  matchedRules: RiskRuleApi[];
};

export type ApplicationListItemApi = {
  id: string;
  name: string;
  slug: string;
  ownerTeam: string;
  status: string;
  integrationMethod: string;
  fieldCoverage: number;
  policyTemplate: ApplicationPolicyTemplateApi | null;
  environments: ApplicationEnvironmentApi[];
  validationChecks: ApplicationValidationCheckApi[];
  metrics: ApplicationMetricsApi;
};

export type ApplicationDetailApi = ApplicationListItemApi & {
  recentRiskEvents: ApplicationRecentRiskEventApi[];
};

export type ApplicationCredentialApi = {
  id: string | null;
  applicationId: string;
  applicationName: string;
  applicationSlug: string;
  ownerTeam: string;
  applicationStatus: string;
  applicationIntegrationMethod: string;
  keyPrefix: string | null;
  status: "active" | "not_created" | "rotation_required" | "revoked";
  integrationSource: "gateway_proxy" | "sdk" | "log_api" | "agent_tool_audit";
  createdBy: string | null;
  lastUsedAt: string | null;
  createdAt: string | null;
  rotatedAt: string | null;
  revokedAt: string | null;
};

export type ApplicationCredentialMutationApi = {
  credential: ApplicationCredentialApi;
  previousCredentialId?: string;
  secret?: string;
};

export type IngestionAuditSummaryApi = {
  total: number;
  succeeded: number;
  failed: number;
  successRate: number;
  credentialAuthRate: number;
  avgLatencyMs: number;
  failureReasons: Array<{
    errorCode: string;
    count: number;
  }>;
};

export type IngestionAuditApi = {
  id: string;
  occurredAt: string;
  status: "success" | "failed";
  authMode: string;
  ingestionSource: string;
  application: {
    id: string;
    name: string;
    slug: string;
  } | null;
  credential: {
    id: string;
    keyPrefix: string;
    status: string;
  } | null;
  traceId: string | null;
  sessionId: string | null;
  requestProfile: string | null;
  httpStatus: number;
  errorCode: string | null;
  errorMessage: string | null;
  latencyMs: number;
  callLogId: string | null;
  riskEventId: string | null;
  model: string | null;
  environment: string | null;
  dataProtectionMode: string | null;
};

export type ApplicationSetupSummaryApi = {
  registeredApps: number;
  connectedApps: number;
  inValidationApps: number;
  productionLiveApps: number;
  avgFieldCoverage: number;
  activeCredentials: number;
  missingCredentials: number;
  validationPassed: number;
  validationTotal: number;
};

export type ApplicationSetupApi = {
  id: string;
  name: string;
  slug: string;
  ownerTeam: string;
  status: string;
  integrationMethod: string;
  fieldCoverage: number;
  policyTemplate: {
    id: string;
    name: string;
  } | null;
  environments: Array<{
    id: string;
    name: string;
    status: string;
    callsToday: number;
    lastSeenAt: string | null;
  }>;
  validationChecks: Array<{
    id: string;
    checkKey: string;
    label: string;
    status: string;
    updatedAt: string;
  }>;
  credential: {
    id: string | null;
    keyPrefix: string | null;
    status: ApplicationCredentialApi["status"];
    integrationSource: ApplicationCredentialApi["integrationSource"];
    lastUsedAt: string | null;
    createdAt: string | null;
    rotatedAt: string | null;
    revokedAt: string | null;
  };
};

export type UserAccessPermissionSetApi = {
  id: string;
  name: string;
  description: string;
  dataScope: "global" | "assigned_applications" | string;
  capabilities: string[];
};

export type UserAccessApplicationApi = {
  id: string;
  name: string;
  slug: string;
  ownerTeam: string;
  status?: string;
  permission?: string;
};

export type UserAccessUserApi = {
  id: string;
  email: string;
  name: string;
  profile: string;
  permissionSet: UserAccessPermissionSetApi | null;
  dataScope: string;
  assignedApplications: UserAccessApplicationApi[];
  updatedAt: string;
};

export type UserAccessSummaryApi = {
  totalUsers: number;
  permissionSets: number;
  appScopedUsers: number;
  adminUsers: number;
};

export type UserAccessAuditLogApi = {
  id: string;
  occurredAt: string;
  action: string;
  actorUserId: string;
  actorProfile: string | null;
  targetUserId: string;
  previousPermissionSet: {
    id: string;
    name: string | null;
  } | null;
  nextPermissionSet: {
    id: string;
    name: string | null;
  } | null;
  previousApplicationIds: string[];
  nextApplicationIds: string[];
};

export type ModelCallIngestionApi = {
  ingestion: {
    contractVersion: string;
    ingestionSource: string;
    traceId: string;
    sessionId: string | null;
    applicationId: string;
  };
  callLog: {
    id: string;
    riskEventId: string | null;
  };
  riskEvent: {
    id: string;
  } | null;
  evaluation: RiskEvaluation | null;
};
