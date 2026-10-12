import { Activity, Code2, Copy, Gauge, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type ApplicationCredentialApi,
  type ApplicationCredentialMutationApi,
  type ApplicationSetupApi,
  type ApplicationSetupSummaryApi,
  type IngestionAuditApi,
  type IngestionAuditSummaryApi,
} from "@/app/riskops/api-types";
import { ConnectionStatusPill } from "@/app/riskops/applications";
import { StatCard } from "@/app/riskops/components";
import { type UserProfile, integrationMethods, onboardingSteps } from "@/app/riskops/config";
import { formatApiDateTime, formatApiTime, profileQueryValue } from "@/app/riskops/mappers";

export const credentialStatusMeta: Record<ApplicationCredentialApi["status"], {
  label: string;
  className: string;
}> = {
  active: {
    label: "Active",
    className: "bg-emerald-50 text-emerald-700",
  },
  not_created: {
    label: "Not Created",
    className: "bg-slate-100 text-slate-600",
  },
  rotation_required: {
    label: "Rotation Required",
    className: "bg-amber-50 text-amber-700",
  },
  revoked: {
    label: "Revoked",
    className: "bg-rose-50 text-rose-700",
  },
};

export const credentialSourceLabels: Record<ApplicationCredentialApi["integrationSource"], string> = {
  gateway_proxy: "Gateway Proxy",
  sdk: "SDK",
  log_api: "Log API",
  agent_tool_audit: "Agent Tool Audit",
};

export function formatNullableDate(value: string | null) {
  return value ? formatApiDateTime(value) : "Not used";
}

export function formatApplicationSetupStatus(status: string) {
  const labels: Record<string, string> = {
    connected: "Connected",
    validating: "Validating",
    pending_validation: "Pending Validation",
    not_connected: "Not Connected",
  };

  return labels[status] ?? status;
}

export function ingestionPayloadExample(applicationId: string, source: ApplicationCredentialApi["integrationSource"]) {
  return {
    contractVersion: "2026-08-06.v1",
    ingestionSource: source,
    application: {
      id: applicationId,
    },
    request: {
      traceId: "trace-prod-001",
      sessionId: "session-prod-001",
      occurredAt: "2026-08-12T10:00:00.000Z",
    },
    user: {
      id: "user_123",
      role: "Support Agent",
      department: "Customer Service",
    },
    model: {
      provider: "openai",
      name: "gpt-4.1",
    },
    environment: "Test",
    content: {
      prompt: "Summarize this customer case and flag any sensitive data exposure risk.",
      output: "The response should avoid exposing personal or financial data.",
    },
    context: {
      dataType: "Customer Data",
      ragContext: "CRM case notes and approved support knowledge base snippets.",
    },
    agent: {
      toolCall: "lookup_customer_profile(customer_id=cust_123)",
    },
  };
}

export function buildIngestionCurlSnippet(input: {
  applicationId: string;
  integrationSource: ApplicationCredentialApi["integrationSource"];
  secret: string;
}) {
  return `curl -X POST "https://ai-riskops.vercel.app/api/ingest/model-call" \\
  -H "Authorization: Bearer ${input.secret}" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(ingestionPayloadExample(input.applicationId, input.integrationSource), null, 2)}'`;
}

export function buildIngestionJsSnippet(input: {
  applicationId: string;
  integrationSource: ApplicationCredentialApi["integrationSource"];
}) {
  return `await fetch("https://ai-riskops.vercel.app/api/ingest/model-call", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.AI_RISKOPS_APPLICATION_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${JSON.stringify(ingestionPayloadExample(input.applicationId, input.integrationSource), null, 4)
    .replace(/^/gm, "  ").trim()}),
});`;
}

export function IngestionSnippetPanel({
  applicationName,
  applicationId,
  integrationSource,
  secret,
}: {
  applicationName: string;
  applicationId: string;
  integrationSource: ApplicationCredentialApi["integrationSource"];
  secret: string;
}) {
  const [snippetType, setSnippetType] = useState<"curl" | "js">("curl");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const snippet = snippetType === "curl"
    ? buildIngestionCurlSnippet({ applicationId, integrationSource, secret })
    : buildIngestionJsSnippet({ applicationId, integrationSource });

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("failed");
      window.setTimeout(() => setCopyState("idle"), 2200);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-sky-100 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-sky-100 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Real ingestion starter</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {applicationName} · {credentialSourceLabels[integrationSource]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setSnippetType("curl")}
            className={`h-8 rounded-lg px-3 text-xs font-semibold ${
              snippetType === "curl" ? "bg-ink text-white" : "border border-line bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            curl
          </button>
          <button
            type="button"
            onClick={() => setSnippetType("js")}
            className={`h-8 rounded-lg px-3 text-xs font-semibold ${
              snippetType === "js" ? "bg-ink text-white" : "border border-line bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            JS
          </button>
          <button
            type="button"
            onClick={copySnippet}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Copy className="h-3.5 w-3.5" />
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5 text-slate-800">
        {snippet}
      </pre>
      <div className="border-t border-sky-100 px-3 py-2 text-xs text-slate-500">
        Store the secret as `AI_RISKOPS_APPLICATION_KEY` before using the JS example.
      </div>
    </div>
  );
}

export function ApplicationSetup({ currentProfile }: { currentProfile: UserProfile }) {
  const [setupApplications, setSetupApplications] = useState<ApplicationSetupApi[]>([]);
  const [setupSummary, setSetupSummary] = useState<ApplicationSetupSummaryApi | null>(null);
  const [credentials, setCredentials] = useState<ApplicationCredentialApi[]>([]);
  const [ingestionAudits, setIngestionAudits] = useState<IngestionAuditApi[]>([]);
  const [ingestionAuditSummary, setIngestionAuditSummary] = useState<IngestionAuditSummaryApi | null>(null);
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [isCredentialLoading, setIsCredentialLoading] = useState(false);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [pendingCredentialAction, setPendingCredentialAction] = useState<string | null>(null);
  const [revealedCredential, setRevealedCredential] = useState<{
    applicationName: string;
    applicationId: string;
    integrationSource: ApplicationCredentialApi["integrationSource"];
    secret: string;
  } | null>(null);
  const [newApplicationName, setNewApplicationName] = useState("");
  const [newApplicationOwner, setNewApplicationOwner] = useState("");
  const [newApplicationIntegration, setNewApplicationIntegration] = useState<ApplicationCredentialApi["integrationSource"]>("sdk");
  const [isCreatingApplication, setIsCreatingApplication] = useState(false);
  const setupRows = setupApplications;
  const setupSummaryView = setupSummary ?? {
    registeredApps: setupRows.length,
    connectedApps: setupRows.filter((app) => app.status === "connected").length,
    inValidationApps: setupRows.filter((app) => app.status === "validating" || app.status === "pending_validation").length,
    productionLiveApps: setupRows.filter((app) =>
      app.environments.some((environment) => environment.name === "production" && environment.status === "Live"),
    ).length,
    avgFieldCoverage: Math.round(
      setupRows.reduce((sum, app) => sum + app.fieldCoverage, 0) / Math.max(setupRows.length, 1),
    ),
    activeCredentials: credentials.filter((credential) => credential.status === "active").length,
    missingCredentials: credentials.filter((credential) => credential.status === "not_created").length,
    validationPassed: setupRows.reduce(
      (sum, app) => sum + app.validationChecks.filter((check) => check.status === "passed").length,
      0,
    ),
    validationTotal: setupRows.reduce((sum, app) => sum + app.validationChecks.length, 0),
  };
  const activeCredentialCount = credentials.filter((credential) => credential.status === "active").length;
  const rotationRequiredCount = credentials.filter((credential) => credential.status === "rotation_required").length;
  const missingCredentialCount = credentials.filter((credential) => credential.status === "not_created").length;

  async function loadApplicationSetup(signal?: AbortSignal) {
    setIsSetupLoading(true);
    setSetupError(null);

    try {
      const profile = profileQueryValue(currentProfile);
      const response = await fetch(`/api/admin/application-setup?profile=${profile}`, {
        signal,
      });

      if (!response.ok) {
        throw new Error("Unable to load application setup configuration.");
      }

      const payload = (await response.json()) as {
        summary: ApplicationSetupSummaryApi;
        data: ApplicationSetupApi[];
      };
      setSetupSummary(payload.summary);
      setSetupApplications(payload.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setSetupError(error instanceof Error ? error.message : "Unable to load application setup configuration.");
      setSetupSummary(null);
      setSetupApplications([]);
    } finally {
      if (!signal?.aborted) {
        setIsSetupLoading(false);
      }
    }
  }

  async function loadCredentials(signal?: AbortSignal) {
    setIsCredentialLoading(true);
    setCredentialError(null);

    try {
      const profile = profileQueryValue(currentProfile);
      const response = await fetch(`/api/admin/application-credentials?profile=${profile}`, {
        signal,
      });

      if (!response.ok) {
        throw new Error("Unable to load application credentials.");
      }

      const payload = (await response.json()) as { data: ApplicationCredentialApi[] };
      setCredentials(payload.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setCredentialError(error instanceof Error ? error.message : "Unable to load application credentials.");
      setCredentials([]);
    } finally {
      if (!signal?.aborted) {
        setIsCredentialLoading(false);
      }
    }
  }

  async function loadIngestionAudits(signal?: AbortSignal) {
    setIsAuditLoading(true);
    setAuditError(null);

    try {
      const profile = profileQueryValue(currentProfile);
      const response = await fetch(`/api/admin/ingestion-audit?profile=${profile}`, {
        signal,
      });

      if (!response.ok) {
        throw new Error("Unable to load ingestion audit records.");
      }

      const payload = (await response.json()) as {
        summary: IngestionAuditSummaryApi;
        data: IngestionAuditApi[];
      };
      setIngestionAuditSummary(payload.summary);
      setIngestionAudits(payload.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setAuditError(error instanceof Error ? error.message : "Unable to load ingestion audit records.");
      setIngestionAuditSummary(null);
      setIngestionAudits([]);
    } finally {
      if (!signal?.aborted) {
        setIsAuditLoading(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadApplicationSetup(controller.signal);
    loadCredentials(controller.signal);
    loadIngestionAudits(controller.signal);

    return () => controller.abort();
  }, [currentProfile]);

  async function submitCredentialAction(credential: ApplicationCredentialApi, action: "generate" | "rotate" | "revoke") {
    const actionKey = `${action}-${credential.applicationId}`;
    setPendingCredentialAction(actionKey);
    setCredentialError(null);

    try {
      const profile = profileQueryValue(currentProfile);
      const endpoint =
        action === "generate"
          ? `/api/admin/application-credentials?profile=${profile}`
          : `/api/admin/application-credentials/${credential.id}/${action}?profile=${profile}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: action === "generate"
          ? JSON.stringify({
              applicationId: credential.applicationId,
              integrationSource: credential.integrationSource,
            })
          : undefined,
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: ApplicationCredentialMutationApi;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to update application credential.");
      }

      if (payload?.data?.secret) {
        setRevealedCredential({
          applicationName: payload.data.credential.applicationName,
          applicationId: payload.data.credential.applicationId,
          integrationSource: payload.data.credential.integrationSource,
          secret: payload.data.secret,
        });
      } else if (action === "revoke") {
        setRevealedCredential(null);
      }

      await loadCredentials();
    } catch (error) {
      setCredentialError(error instanceof Error ? error.message : "Unable to update application credential.");
    } finally {
      setPendingCredentialAction(null);
    }
  }

  async function submitNewApplication() {
    setIsCreatingApplication(true);
    setSetupError(null);

    try {
      const profile = profileQueryValue(currentProfile);
      const response = await fetch(`/api/admin/application-setup?profile=${profile}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newApplicationName,
          ownerTeam: newApplicationOwner,
          integrationMethod: newApplicationIntegration,
        }),
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Unable to register application.");
      }

      setNewApplicationName("");
      setNewApplicationOwner("");
      setNewApplicationIntegration("sdk");
      await Promise.all([loadApplicationSetup(), loadCredentials()]);
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : "Unable to register application.");
    } finally {
      setIsCreatingApplication(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          title="Registered Apps"
          value={`${setupSummaryView.registeredApps}`}
          delta="Applications configured or pending setup in AI RiskOps"
          icon={Code2}
          tone="bg-cyan-50 text-cyan-700"
        />
        <StatCard
          title="Connected"
          value={`${setupSummaryView.connectedApps}`}
          delta="Applications currently sending usable telemetry"
          icon={ShieldCheck}
          tone="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          title="In Validation"
          value={`${setupSummaryView.inValidationApps}`}
          delta="Applications being validated before production rollout"
          icon={Activity}
          tone="bg-amber-50 text-amber-700"
        />
        <StatCard
          title="Avg Field Coverage"
          value={`${setupSummaryView.avgFieldCoverage}%`}
          delta={`${setupSummaryView.productionLiveApps} applications are production live`}
          icon={Gauge}
          tone="bg-violet-50 text-violet-700"
        />
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Register Application</h2>
            <p className="mt-1 text-xs text-slate-500">
              Create a backend application record before generating credentials or validating ingestion.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Platform Admin
          </span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_1fr_180px_auto] gap-3">
          <input
            value={newApplicationName}
            onChange={(event) => setNewApplicationName(event.target.value)}
            placeholder="Application name"
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
          />
          <input
            value={newApplicationOwner}
            onChange={(event) => setNewApplicationOwner(event.target.value)}
            placeholder="Owner team"
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
          />
          <select
            value={newApplicationIntegration}
            onChange={(event) => setNewApplicationIntegration(event.target.value as ApplicationCredentialApi["integrationSource"])}
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
          >
            <option value="gateway_proxy">Gateway Proxy</option>
            <option value="sdk">SDK</option>
            <option value="log_api">Log API</option>
            <option value="agent_tool_audit">Agent Tool Audit</option>
          </select>
          <button
            type="button"
            onClick={submitNewApplication}
            disabled={isCreatingApplication || !newApplicationName.trim() || !newApplicationOwner.trim()}
            className="h-10 rounded-lg bg-ink px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isCreatingApplication ? "Registering" : "Register"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-[1.1fr_0.9fr] gap-5">
        <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div>
            <h2 className="text-base font-semibold text-ink">Integration Methods</h2>
            <p className="mt-1 text-xs text-slate-500">
              Select the setup path used to connect application telemetry into AI RiskOps
            </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {integrationMethods.map((method) => (
              <article key={method.name} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">{method.name}</h3>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                    {method.status}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{method.description}</p>
              </article>
            ))}
          </div>
        </section>

        <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div>
            <h2 className="text-base font-semibold text-ink">Setup Flow</h2>
            <p className="mt-1 text-xs text-slate-500">
              Standard onboarding sequence for a new AI application
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {onboardingSteps.map((step, index) => (
              <div key={step} className="flex items-center gap-3 rounded-lg border border-line bg-panel p-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-ink text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-ink">{step}</span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Ingestion Request Audit</h2>
            <p className="text-xs text-slate-500">
              Monitor model-call ingestion health, authentication mode, failure reasons, and linked risk records
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {ingestionAuditSummary?.successRate ?? 0}% Success
            </span>
            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700">
              {ingestionAuditSummary?.credentialAuthRate ?? 0}% Credential Auth
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
              {ingestionAuditSummary?.avgLatencyMs ?? 0}ms Avg
            </span>
          </div>
        </div>

        {auditError ? (
          <div className="border-b border-line bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {auditError}
          </div>
        ) : null}

        <div className="grid grid-cols-4 gap-3 border-b border-line bg-panel px-4 py-3">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Requests</p>
            <p className="mt-1 text-xl font-semibold text-ink">{ingestionAuditSummary?.total ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Succeeded</p>
            <p className="mt-1 text-xl font-semibold text-emerald-700">{ingestionAuditSummary?.succeeded ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Failed</p>
            <p className="mt-1 text-xl font-semibold text-rose-700">{ingestionAuditSummary?.failed ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Top Failure Reason</p>
            <p className="mt-1 truncate text-xl font-semibold text-ink">
              {ingestionAuditSummary?.failureReasons[0]?.errorCode ?? "None"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-[108px_1fr_108px_116px_112px_1fr] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
          <span>Status</span>
          <span>Application / Trace</span>
          <span>Auth Mode</span>
          <span>Source</span>
          <span>HTTP / Latency</span>
          <span>Result</span>
        </div>
        <div>
          {isAuditLoading && !ingestionAudits.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-600">Loading ingestion audit records...</p>
            </div>
          ) : ingestionAudits.length ? ingestionAudits.slice(0, 8).map((audit) => (
            <div
              key={audit.id}
              className="grid grid-cols-[108px_1fr_108px_116px_112px_1fr] items-center gap-3 border-b border-line px-4 py-3 text-sm"
            >
              <span
                className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
                  audit.status === "success"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                }`}
              >
                {audit.status === "success" ? "Success" : "Failed"}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">
                  {audit.application?.name ?? "Unresolved Application"}
                </span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {audit.traceId ?? audit.id} · {formatApiTime(audit.occurredAt)}
                </span>
              </span>
              <span className="truncate text-xs text-slate-600">
                {audit.authMode === "application_credential" ? "Credential" : "Profile"}
              </span>
              <span className="truncate text-xs text-slate-600">
                {credentialSourceLabels[audit.ingestionSource as ApplicationCredentialApi["integrationSource"]] ?? audit.ingestionSource}
              </span>
              <span className="text-xs text-slate-600">
                {audit.httpStatus} · {audit.latencyMs}ms
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-ink">
                  {audit.status === "success"
                    ? `${audit.callLogId ?? "No call log"}${audit.riskEventId ? ` · ${audit.riskEventId}` : ""}`
                    : audit.errorCode ?? "Unknown Error"}
                </span>
                <span className="mt-1 block truncate text-xs text-slate-500">
                  {audit.status === "success"
                    ? `Model ${audit.model ?? "unknown"} · ${audit.dataProtectionMode ?? "untracked"} content`
                    : audit.errorMessage ?? "No error message captured"}
                </span>
              </span>
            </div>
          )) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink">No ingestion audit records yet.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Integration Credentials</h2>
            <p className="text-xs text-slate-500">
              Manage application API keys used by SDK, gateway proxy, log API, and agent tool audit integrations
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {activeCredentialCount} Active
            </span>
            <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              {rotationRequiredCount} Rotation
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
              {missingCredentialCount} Missing
            </span>
          </div>
        </div>

        {revealedCredential ? (
          <div className="border-b border-line bg-sky-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-800">New Credential Secret</p>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-sky-100 bg-white px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{revealedCredential.applicationName}</p>
                <p className="mt-1 truncate font-mono text-xs text-sky-800">{revealedCredential.secret}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-sky-700">
                Shown once
              </span>
            </div>
            <IngestionSnippetPanel
              applicationName={revealedCredential.applicationName}
              applicationId={revealedCredential.applicationId}
              integrationSource={revealedCredential.integrationSource}
              secret={revealedCredential.secret}
            />
          </div>
        ) : null}

        {credentialError ? (
          <div className="border-b border-line bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {credentialError}
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_132px_136px_132px_132px_220px] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
          <span>Application</span>
          <span>Credential Status</span>
          <span>Integration Source</span>
          <span>API Key Prefix</span>
          <span>Last Used</span>
          <span>Admin Actions</span>
        </div>
        <div>
          {isCredentialLoading && !credentials.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-600">Loading application credentials...</p>
            </div>
          ) : credentials.length ? credentials.map((credential) => {
            const status = credentialStatusMeta[credential.status];
            const isGeneratePending = pendingCredentialAction === `generate-${credential.applicationId}`;
            const isRotatePending = pendingCredentialAction === `rotate-${credential.applicationId}`;
            const isRevokePending = pendingCredentialAction === `revoke-${credential.applicationId}`;
            const canGenerate = credential.status === "not_created" || credential.status === "revoked";
            const canRotate = Boolean(credential.id) && credential.status !== "revoked";
            const canRevoke = Boolean(credential.id) && credential.status !== "revoked";

            return (
              <div
                key={`${credential.applicationId}-${credential.id ?? "missing"}`}
                className="grid grid-cols-[1fr_132px_136px_132px_132px_220px] items-center gap-3 border-b border-line px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{credential.applicationName}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {credential.ownerTeam} · {credential.applicationSlug}
                  </span>
                </span>
                <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
                  {status.label}
                </span>
                <span className="truncate text-slate-600">
                  {credentialSourceLabels[credential.integrationSource]}
                </span>
                <span className="truncate font-mono text-xs text-ink">
                  {credential.keyPrefix ?? "No key"}
                </span>
                <span className="text-xs text-slate-600">
                  {formatNullableDate(credential.lastUsedAt)}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!canGenerate || Boolean(pendingCredentialAction)}
                    onClick={() => submitCredentialAction(credential, "generate")}
                    className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    {isGeneratePending ? "Generating" : "Generate"}
                  </button>
                  <button
                    type="button"
                    disabled={!canRotate || Boolean(pendingCredentialAction)}
                    onClick={() => submitCredentialAction(credential, "rotate")}
                    className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    {isRotatePending ? "Rotating" : "Rotate"}
                  </button>
                  <button
                    type="button"
                    disabled={!canRevoke || Boolean(pendingCredentialAction)}
                    onClick={() => submitCredentialAction(credential, "revoke")}
                    className="h-8 rounded-lg border border-line bg-white px-2.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    {isRevokePending ? "Revoking" : "Revoke"}
                  </button>
                </span>
              </div>
            );
          }) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink">No applications available for credential setup.</p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">Application Setup Status</h2>
            <p className="text-xs text-slate-500">
              Track setup readiness, telemetry coverage, policy binding, and environment state
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
              {setupSummaryView.validationPassed}/{setupSummaryView.validationTotal} Checks Passed
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
              {isSetupLoading ? "Loading" : "Admin setup"}
            </span>
          </div>
        </div>

        {setupError ? (
          <div className="border-b border-line bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {setupError}
          </div>
        ) : null}

        <div className="grid grid-cols-[1fr_116px_132px_88px_1fr] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
          <span>Application</span>
          <span>Status</span>
          <span>Integration</span>
          <span>Coverage</span>
          <span>Validation</span>
        </div>
        <div>
          {isSetupLoading && !setupRows.length ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-slate-600">Loading application setup status...</p>
            </div>
          ) : setupRows.length ? setupRows.map((app) => {
            const completedChecks = app.validationChecks.filter((item) => item.status === "passed").length;
            const policyName = app.policyTemplate?.name ?? "No policy bound";
            return (
              <div
                key={app.id}
                className="grid grid-cols-[1fr_116px_132px_88px_1fr] items-center gap-3 border-b border-line px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{app.name}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {app.ownerTeam} · {app.slug}
                  </span>
                </span>
                <ConnectionStatusPill status={formatApplicationSetupStatus(app.status)} />
                <span className="truncate text-slate-600">
                  {credentialSourceLabels[app.credential.integrationSource] ?? app.integrationMethod}
                </span>
                <span className="font-medium text-ink">{app.fieldCoverage}%</span>
                <span className="text-slate-600">
                  {completedChecks}/{app.validationChecks.length} checks · {policyName}
                </span>
              </div>
            );
          }) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink">No applications available for setup tracking.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
