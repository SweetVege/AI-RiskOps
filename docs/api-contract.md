# AI RiskOps API Contract

This document describes the current backend API contract for AI RiskOps.

It reflects the working prototype backend as of Backend V1.5 API Contract Documentation. The API is implemented with Next.js route handlers, Prisma, and Postgres-backed seed data. It is not yet a public production API specification.

## 1. Contract Principles

- The API supports risk observability, analytics, application visibility, platform configuration, and model-call ingestion.
- All normal JSON responses use a stable success/error envelope.
- User and scope are currently simulated through query parameters until real authentication is selected.
- App Owner access is scoped to assigned applications.
- Global User and Platform Admin have global data scope.
- Platform Admin-only Admin APIs are protected through backend capability checks.
- Sensitive AI call content is masked before normal API responses.

## 2. Base URL

Local development:

```text
http://127.0.0.1:3000
```

Production demo:

```text
https://ai-riskops.vercel.app
```

All endpoints below are relative to this base URL.

## 3. Response Envelope

Successful JSON responses:

```json
{
  "success": true,
  "scope": {
    "profile": "platform-admin",
    "userId": "user-demo-admin",
    "mode": "global"
  },
  "data": {},
  "meta": {
    "requestId": "req-12345678"
  }
}
```

Some endpoints also return `summary`, `filters`, or other top-level fields alongside `data`.

Created responses use HTTP `201` with the same envelope shape.

Error responses:

```json
{
  "success": false,
  "error": "This profile cannot manage user access.",
  "errorCode": "FORBIDDEN",
  "details": {},
  "meta": {
    "requestId": "req-12345678"
  }
}
```

Current error codes:

| Code | Meaning |
|---|---|
| `BAD_REQUEST` | Invalid request syntax or unsupported route use |
| `INVALID_JSON` | Request body is not valid JSON |
| `VALIDATION_ERROR` | Request body is valid JSON but fails product validation |
| `UNAUTHORIZED` | Missing or invalid credential |
| `FORBIDDEN` | Authenticated or simulated user lacks required capability or scope |
| `NOT_FOUND` | Resource does not exist or is outside current scope |
| `INTERNAL_ERROR` | Unexpected server error |

## 4. Scope And Permission Model

### 4.1 Query Parameters

Most read APIs accept:

| Parameter | Values | Default | Purpose |
|---|---|---|---|
| `profile` | `platform-admin`, `global-user`, `app-owner` | `platform-admin` | Simulated active user profile |
| `userId` | Seeded user ID | Derived from `profile` | Optional user override for prototype testing |

Profile aliases with spaces are accepted, such as `platform admin`.

### 4.2 Scope Response

Global profile response:

```json
{
  "profile": "platform-admin",
  "userId": "user-demo-admin",
  "mode": "global"
}
```

Assigned application profile response:

```json
{
  "profile": "app-owner",
  "userId": "user-demo-owner",
  "mode": "assigned_applications",
  "applicationIds": ["app-cs-copilot", "app-hr-policy", "app-internal-kb"]
}
```

### 4.3 Capability Checks

| Capability | Current users |
|---|---|
| `canViewOverview` | All seeded profiles |
| `canViewRiskAnalytics` | All seeded profiles |
| `canViewRiskEvents` | All seeded profiles |
| `canViewCallLogs` | All seeded profiles |
| `canViewApplications` | All seeded profiles |
| `canViewPolicyCenter` | Platform Admin |
| `canManagePolicyCenter` | Platform Admin |
| `canViewApplicationSetup` | Platform Admin |
| `canManageApplicationSetup` | Platform Admin |
| `canCreateApplications` | Platform Admin |
| `canManageCredentials` | Platform Admin |
| `canManageUserAccess` | Platform Admin |
| `canUpdateRiskEventReview` | Platform Admin, Global User |
| `canExportAnalytics` | All seeded profiles |

## 5. Session

### `GET /api/session`

Returns active simulated profile, user ID, and database-backed capability flags.

Query:

| Parameter | Required | Notes |
|---|---|---|
| `profile` | No | Defaults to `platform-admin` |
| `userId` | No | Optional override |

Response data:

```json
{
  "profile": "platform-admin",
  "userId": "user-demo-admin",
  "permissions": {
    "dataScope": "global",
    "canViewOverview": true,
    "canManageUserAccess": true
  }
}
```

## 6. Overview APIs

Overview endpoints are read-only and scoped by `profile`.

### `GET /api/overview/summary`

Returns executive KPI totals.

Response data:

| Field | Type |
|---|---|
| `modelCallsToday` | number |
| `riskEvents` | number |
| `blocked` | number |
| `averageEventRiskScore` | number |
| `severeEvents` | number |
| `highRiskEvents` | number |
| `blockedModelCalls` | number |

### `GET /api/overview/risk-level-trend`

Returns stacked severity trend buckets.

Query:

| Parameter | Values | Default |
|---|---|---|
| `period` | `daily`, `monthly`, `quarterly` | `daily` |

Response data item:

```json
{
  "key": "2026-07-06",
  "label": "Jul 06",
  "total": 223,
  "severity": {
    "low": 120,
    "medium": 60,
    "high": 35,
    "severe": 8
  },
  "highSevereRate": 24
}
```

### `GET /api/overview/risk-categories`

Returns category distribution for current scope.

Response data item:

| Field | Type |
|---|---|
| `category` | string |
| `count` | number |
| `percentage` | number |

### `GET /api/overview/top-applications`

Returns risky application ranking.

Query:

| Parameter | Default |
|---|---|
| `limit` | `5` |

Sorting: severe count first, then high count, then max risk score.

Response data item includes application ID, name, slug, owner team, severe count, high count, risk event count, call log count, blocked count, average event risk score, and max risk score.

### `GET /api/overview/severe-events`

Returns severe event snapshot for the Overview page.

Query:

| Parameter | Default |
|---|---|
| `limit` | `3` |

Response data item includes event metadata, application, user, department, score, level, action, review status, owner, SLA, affected asset, and matched rules.

## 7. Risk Analytics APIs

Shared analytics query parameters:

| Parameter | Required | Notes |
|---|---|---|
| `profile` | No | Scope simulation |
| `application_id` | No | Filters one application |
| `level` | No | `low`, `medium`, `high`, `severe` |
| `environment` | No | `production` or `test`; display values are normalized |
| `action` | No | `allow`, `flag`, `redact`, `review`, `block` |

### `GET /api/analytics/summary`

Returns metric summary for Risk Analytics.

Response data:

| Field | Type |
|---|---|
| `riskEvents` | number |
| `modelCalls` | number |
| `highSevereEvents` | number |
| `highSevereRate` | number |
| `riskEventRate` | number |
| `blockRate` | number |
| `averageRiskScore` | number |
| `blockedModelCalls` | number |

### `GET /api/analytics/drivers`

Returns ranked driver groups for applications, categories, rules, environments, departments, users, and models.

Response data:

```json
{
  "applications": [],
  "categories": [],
  "rules": [],
  "environments": [],
  "departments": [],
  "users": [],
  "models": []
}
```

Driver item:

| Field | Type |
|---|---|
| `id` | string |
| `label` | string |
| `detail` | string |
| `contribution` | number |
| `weightedScore` | number |
| `riskEvents` | number |
| `highSevereEvents` | number |
| `highSevereRate` | number |
| `averageRiskScore` | number |
| `blockRate` | number |
| `mainDriver` | string nullable |

### `GET /api/analytics/applications/[id]`

Returns application-level analytics for one application.

Path:

| Parameter | Notes |
|---|---|
| `id` | Application ID |

Returns `404` when the application does not exist or is outside current scope.

Response data includes:

- `application`
- `metrics`
- `driverMix.categories`
- `driverMix.environments`
- `driverMix.rules`
- `recentHighRiskExamples`
- `insight`

### `GET /api/analytics/drilldown`

Returns evidence rows and summary for a selected analytics driver.

Query:

| Parameter | Values |
|---|---|
| `type` | `application`, `category`, `rule`, `environment`, `department`, `data`, `model`, `user` |
| `label` | Driver label |

Response data includes:

- `drilldown`
- `summary`
- `topEvent`
- `events`
- `insight`

### `GET /api/analytics/report`

Exports analytics summary and top drivers.

Authorization: requires `canExportAnalytics`.

Query:

| Parameter | Values | Default |
|---|---|---|
| `format` | `json`, `csv` | `json` |

For `format=csv`, response content type is `text/csv` with a downloadable filename.

## 8. Risk Events APIs

### `GET /api/risk-events`

Returns risk event queue rows.

Query:

| Parameter | Notes |
|---|---|
| `level` | Severity filter |
| `action` | System action filter |
| `review_status` | Review status filter |
| `application_id` | Application scope filter |
| `environment` | Environment filter |
| `q` | Text search across event, user, department, app, rules, explanation, recommendation |

Response data item includes:

- event ID and occurred time
- application
- title
- user and department
- model and environment
- score, level, action
- review status, owner, SLA
- affected asset
- matched rules
- evidence count
- linked call log ID
- updated time

### `GET /api/risk-events/[id]`

Returns full event detail, evidence, matched rules, source call log, and masked call content.

Path:

| Parameter | Notes |
|---|---|
| `id` | Risk event ID |

Returns `404` when event is outside current scope.

### `PATCH /api/risk-events/[id]`

Updates lightweight review metadata only.

Authorization: requires `canUpdateRiskEventReview`.

Body:

```json
{
  "reviewStatus": "confirmed",
  "owner": "Security Review"
}
```

Allowed review statuses:

- `pending_review`
- `in_progress`
- `confirmed`
- `false_positive`
- `resolved`
- `escalated`

This endpoint does not implement a remediation workflow, comments, approvals, or case management.

## 9. Call Logs APIs

### `GET /api/call-logs`

Returns AI model call log rows with masked previews.

Query:

| Parameter | Notes |
|---|---|
| `application_id` | Application filter |
| `environment` | Environment filter |
| `level` | Severity filter |
| `action` | System action filter |
| `has_event` | `true` or `false` |
| `q` | Text search across trace, user, model, content, tool call, app |

Response data item includes:

- call log ID and trace ID
- occurred time
- application
- user, model, environment
- score, level, action
- masked prompt/output/RAG previews
- masked tool call
- data protection metadata
- linked risk event summary

### `GET /api/call-logs/[id]`

Returns full call log detail with masked prompt, output, RAG context, and tool call fields.

Returns `404` when call log is outside current scope.

## 10. Applications APIs

### `GET /api/applications`

Returns application inventory for current scope.

Response data item includes:

- application metadata
- policy template summary
- environments
- validation checks
- metrics: call log count, risk event count, severe count, high count, max risk score, latest event time

### `GET /api/applications/[id]`

Returns application detail.

Response data includes:

- application metadata
- full policy template with policy rules
- environments
- validation checks
- metrics
- recent risk events

Returns `404` when the application is outside current scope.

## 11. Admin APIs

Admin APIs require Platform Admin capabilities unless otherwise stated.

### `GET /api/admin/policy-center`

Authorization: `canViewPolicyCenter`.

Returns policy template summary, rule library, enabled states, operational stats, and high false-positive rule count.

### `POST /api/admin/policy-center/templates/[id]/toggle`

Authorization: `canManagePolicyCenter`.

Body:

```json
{
  "enabled": true
}
```

If `enabled` is omitted, the endpoint toggles current state.

### `POST /api/admin/policy-center/rules/[id]/toggle`

Authorization: `canManagePolicyCenter`.

Toggles or sets enabled state for all policy-rule instances with the given `riskRuleId`.

Body:

```json
{
  "enabled": false
}
```

### `GET /api/admin/application-setup`

Authorization: `canViewApplicationSetup`.

Returns setup summary and all backend application setup rows, including environments, validation checks, policy binding, and credential status.

### `POST /api/admin/application-setup`

Authorization: `canCreateApplications`.

Creates a new application record with default production/test environments and default validation checks.

Body:

```json
{
  "name": "New AI Assistant",
  "ownerTeam": "AI Platform",
  "integrationMethod": "sdk",
  "policyTemplateId": "policy-general-low-risk"
}
```

Required fields: `name`, `ownerTeam`.

Supported integration methods: `gateway_proxy`, `sdk`, `log_api`, `agent_tool_audit`.

### `GET /api/admin/application-credentials`

Authorization: `canManageCredentials`.

Returns current credential status for every application.

### `POST /api/admin/application-credentials`

Authorization: `canManageCredentials`.

Generates a new application credential.

Body:

```json
{
  "applicationId": "app-cs-copilot",
  "integrationSource": "sdk"
}
```

Returns a one-time secret in `data.secret`.

### `POST /api/admin/application-credentials/[id]/rotate`

Authorization: `canManageCredentials`.

Revokes the existing credential and creates a replacement credential.

Returns a one-time replacement secret.

### `POST /api/admin/application-credentials/[id]/revoke`

Authorization: `canManageCredentials`.

Revokes an active credential. Repeated revocation is idempotent and returns the already revoked credential.

### `GET /api/admin/ingestion-audit`

Authorization: `canViewApplicationSetup`.

Returns the latest ingestion audit records and summary metrics:

- total requests
- succeeded
- failed
- success rate
- credential auth rate
- average latency
- failure reasons

### `GET /api/admin/user-access`

Authorization: `canManageUserAccess`.

Returns:

- users
- permission sets
- applications
- total users
- permission set count
- app-scoped users
- admin users
- recent access audit logs

### `PATCH /api/admin/user-access`

Authorization: `canManageUserAccess`.

Updates one user's permission set and application assignments.

Body:

```json
{
  "userId": "user-demo-owner",
  "permissionSetId": "perm-app-owner",
  "applicationIds": ["app-cs-copilot", "app-hr-policy"]
}
```

If the target permission set uses `assigned_applications` scope, at least one `applicationId` is required.

The update writes an access audit record in the same database transaction. The record captures:

- `action`
- `actorUserId`
- `actorProfile`
- `targetUserId`
- previous and next permission set
- previous and next assigned application IDs
- `occurredAt`

## 12. Model Call Ingestion API

### `GET /api/ingest/model-call`

Returns ingestion contract metadata, supported headers, integration methods, data protection behavior, and sample payload shape.

### `POST /api/ingest/model-call`

Creates an AI call log and optionally a risk event by evaluating the submitted model call through the current risk engine.

Current auth modes:

| Mode | How it works |
|---|---|
| Application credential | `Authorization: Bearer <application_api_key>` |
| Profile scope | `profile` query parameter for prototype simulation |

Supported headers:

| Header | Purpose |
|---|---|
| `Authorization` | Bearer application credential |
| `x-ai-riskops-source` | Ingestion source override |
| `x-ai-riskops-application-id` | Application ID override |
| `x-ai-riskops-trace-id` | Trace ID override |
| `x-ai-riskops-contract-version` | Contract version |

Supported ingestion sources:

- `gateway_proxy`
- `sdk`
- `log_api`
- `agent_tool_audit`

Supported data types:

- `Customer Data`
- `Financial Data`
- `Employee Data`
- `General Data`

Maximum captured text field length: `8000` characters. Identifier and label fields are limited to `200` characters.

Validation:

- The body is validated against a schema. Wrong field types, an unsupported `environment`, `ingestionSource`, or `dataType`, and a `request.occurredAt` that is not an ISO 8601 timestamp with offset return `400 VALIDATION_ERROR` with `details.issues`.

Policy evaluation:

- Detection uses the rule catalog in the database (`RiskRule`) and the policy template bound to the application.
- A rule produces findings when the application's template enables it. An application without a template uses every catalog rule.
- Baseline rules `DLP-002`, `ACCESS-001`, `TOOL-001`, and `SYS-001` always apply and cannot be disabled through Policy Center.
- A template rule's `actionOverride` replaces the rule's default action. `thresholdOverride` is stored but not evaluated yet.
- Disabling a template does not change detection for applications already bound to it.
- The response includes `ingestion.policy` with the `templateId` and `activeRuleIds` used for the call.

Idempotency:

- `request.traceId` (or `x-ai-riskops-trace-id`) is unique per application.
- Resending a stored trace ID returns `200` with the existing `callLog` and `riskEvent`, `ingestion.duplicate: true`, and `evaluation: null`. Nothing is written twice.
- Requests without a trace ID get a generated one and are never deduplicated.

Atomicity:

- The call log, risk event, rule matches, evidence, credential usage, setup validation, and success audit are written in one transaction.
- If the write fails the API returns `500 INTERNAL_ERROR`, nothing is stored except a failed audit record, and the request can be retried with the same trace ID.

Rate limit:

- Credential-authenticated requests are limited per credential per minute (`INGEST_RATE_LIMIT_PER_MINUTE`, default `600`, `0` disables).
- Exceeding the limit returns `429 RATE_LIMITED` with `Retry-After: 60`.

### `POST /api/ingest/model-calls/batch`

Ingests up to `100` model calls in one request. Requires `Authorization: Bearer <application_api_key>`; profile scope is not accepted.

```json
{
  "calls": [
    { "request": { "traceId": "trace-001" }, "content": { "prompt": "..." } },
    { "request": { "traceId": "trace-002" }, "content": { "prompt": "..." } }
  ]
}
```

Each item uses the same body as `POST /api/ingest/model-call` and is processed independently in order. The response is `200` with a per-item result:

```json
{
  "data": {
    "summary": { "received": 2, "created": 1, "duplicate": 0, "rejected": 1 },
    "results": [
      { "index": 0, "status": "created", "traceId": "trace-001", "callLogId": "call-...", "riskEventId": null, "score": 0, "level": "low", "action": "allow" },
      { "index": 1, "status": "rejected", "traceId": "trace-002", "errorCode": "VALIDATION_ERROR", "error": "..." }
    ]
  }
}
```

The whole batch is rejected with `401`, `400`, or `429` when the credential is missing or invalid, the body is not `{ "calls": [1..100 items] }`, or the batch would exceed the rate limit.

Production-style body:

```json
{
  "contractVersion": "2026-08-06.v1",
  "ingestionSource": "sdk",
  "application": {
    "id": "app-cs-copilot",
    "name": "Customer Support Copilot"
  },
  "request": {
    "traceId": "trace-prod-001",
    "sessionId": "session-001",
    "occurredAt": "2026-08-06T10:00:00.000Z"
  },
  "user": {
    "id": "user_123",
    "role": "Support Agent",
    "department": "Customer Service"
  },
  "model": {
    "provider": "openai",
    "name": "gpt-4.1"
  },
  "environment": "Production",
  "content": {
    "prompt": "Summarize the latest customer complaint.",
    "output": "The customer reported delayed invoices."
  },
  "context": {
    "ragContext": "Customer support tickets and CRM notes.",
    "dataType": "Customer Data"
  },
  "agent": {
    "toolCall": "export_customer_records(scope=enterprise)"
  }
}
```

Prototype-compatible shortcut fields are also accepted, such as `applicationId`, `applicationName`, `app`, `userRef`, `userRole`, `prompt`, `output`, `ragContext`, `toolCall`, and `templateId`.

Response data includes:

- ingestion metadata
- created call log summary
- created risk event summary when a risk event is generated
- data protection metadata
- evaluation result

## 13. Data Protection Behavior

Normal APIs mask captured prompt, output, RAG context, and tool call content before returning it.

Current protected patterns include:

- email
- phone number
- payment card
- bearer token
- API key
- private key
- government ID

The current mode is `masked_storage_and_response` in the ingestion contract, but production encryption-at-rest decisions are still open.

## 14. Current Limitations

- Authentication is simulated by query parameter except for application credential ingestion.
- There is no production SSO, tenant isolation, SCIM provisioning, or multi-tenant boundary yet.
- Permission Sets are persisted, but there is no custom capability builder.
- Review metadata updates are lightweight and do not create cases, comments, approvals, or remediation workflow records.
- Policy Center can toggle templates and rules, but does not yet support full rule editing or versioned rollout.
- Application Setup can create application records and manage credentials, but does not yet validate real external traffic automatically.
- Analytics APIs compute from current persisted seed/demo records and are not yet backed by warehouse-scale aggregation tables.
- CSV export is synchronous and generated on demand.
