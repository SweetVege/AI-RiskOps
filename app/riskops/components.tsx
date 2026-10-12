import { ChevronRight, GitBranch, Play, RotateCcw, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { actionDescriptions, levelDescriptions } from "@/app/riskops/config";
import {
  type AiCallLog,
  type ReviewStatus,
  type RiskEvent,
  actionMeta,
  levelMeta,
  reviewStatusMeta,
  riskRules,
  ruleIcons,
} from "@/lib/risk-data";
import { type RiskEvaluation, type SandboxInput, evaluateAiCall, sandboxTemplates } from "@/lib/risk-engine";

export function StatCard({
  title,
  value,
  delta,
  icon: Icon,
  tone,
}: {
  title: string;
  value: string;
  delta: string;
  icon: typeof Shield;
  tone: string;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-ink">{title}</p>
          <p className="mt-2 text-4xl font-semibold text-ink">{value}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${tone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">{delta}</p>
    </section>
  );
}

export function ActionPill({ action }: { action: RiskEvent["action"] }) {
  const meta = actionMeta[action];
  const Icon = meta.icon;
  return (
    <span
      title={actionDescriptions[action]}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${meta.className}`}
    >
      <Icon className="h-3.5 w-3.5" />
      {meta.label}
    </span>
  );
}

export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  const meta = reviewStatusMeta[status] ?? {
    label: status.replaceAll("_", " "),
    className: "bg-slate-100 text-slate-700 ring-slate-200",
    description: "Review status returned by the backend.",
  };
  return (
    <span
      title={meta.description}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

export function EventRow({
  event,
  selected,
  onSelect,
}: {
  event: RiskEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[92px_1fr_96px_104px_96px_28px] items-center gap-3 border-b border-line px-4 py-3 text-left transition hover:bg-slate-50 ${
        selected ? "bg-slate-50" : "bg-white"
      }`}
    >
      <span className="text-sm text-slate-500">{event.time}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{event.title}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {event.app} · {event.user} · {event.department}
        </span>
      </span>
      <span
        title={levelDescriptions[event.level]}
        className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
          levelMeta[event.level].className
        }`}
      >
        {levelMeta[event.level].label} · {event.score}
      </span>
      <ActionPill action={event.action} />
      <ReviewStatusPill status={event.reviewStatus} />
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}

export function CallLogRow({
  log,
  selected,
  onSelect,
}: {
  log: AiCallLog;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`grid w-full grid-cols-[92px_1fr_104px_76px_92px_96px_28px] items-center gap-3 border-b border-line px-4 py-3 text-left transition hover:bg-slate-50 ${
        selected ? "bg-slate-50" : "bg-white"
      }`}
    >
      <span className="text-sm text-slate-500">{log.time}</span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{log.app}</span>
        <span className="mt-1 block truncate text-xs text-slate-500">
          {log.user} · {log.model}
        </span>
      </span>
      <span className="truncate text-sm text-slate-600">{log.environment}</span>
      <span
        title={levelDescriptions[log.level]}
        className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${
          levelMeta[log.level].className
        }`}
      >
        {log.score}
      </span>
      <ActionPill action={log.action} />
      <span className={`text-xs font-medium ${log.eventId ? "text-rose-700" : "text-slate-500"}`}>
        {log.eventId ?? "None"}
      </span>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}

export function CodeBlock({ title, value }: { title: string; value: string }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950 p-3 text-sm leading-6 text-slate-100">
        {value || "None"}
      </p>
    </section>
  );
}

export function SourceContext({ event }: { event: RiskEvent }) {
  const items = [
    { label: "Prompt", value: event.prompt, tone: "bg-slate-950 text-slate-100" },
    { label: "Model Output", value: event.output, tone: "bg-slate-950 text-slate-100" },
    { label: "Agent Tool Call", value: event.toolCall ?? "None", tone: "bg-amber-50 text-amber-900" },
  ];

  return (
    <section>
      <h3 className="text-sm font-semibold text-ink">Source Context</h3>
      <div className="mt-2 space-y-2 rounded-lg border border-line bg-panel p-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs font-semibold text-slate-500">{item.label}</p>
            <p className={`mt-1 whitespace-pre-wrap rounded-lg p-3 text-sm leading-6 ${item.tone}`}>
              {item.value || "None"}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function CallLogDetail({ log, event }: { log: AiCallLog; event?: RiskEvent }) {
  return (
    <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Call Detail
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">{log.id}</h2>
          <p className="mt-1 text-xs text-slate-500">{log.traceId}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-ink">{log.score}</p>
          <p className="text-xs text-slate-500">Risk Score</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">App</p>
          <p className="mt-1 font-medium text-ink">{log.app}</p>
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">User</p>
          <p className="mt-1 font-medium text-ink">{log.user}</p>
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">Model</p>
          <p className="mt-1 font-medium text-ink">{log.model}</p>
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">System Action</p>
          <div className="mt-1">
            <ActionPill action={log.action} />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <section>
          <h3 className="text-sm font-semibold text-ink">Linked Risk Event</h3>
          {event ? (
            <div className="mt-2 rounded-lg border border-line bg-panel p-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-slate-600" />
                <p className="text-sm font-semibold text-ink">{event.id}</p>
              </div>
              <p className="mt-2 text-sm text-slate-700">{event.title}</p>
              <div className="mt-2 flex gap-2">
                <ReviewStatusPill status={event.reviewStatus} />
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    levelMeta[event.level].className
                  }`}
                >
                  {levelMeta[event.level].label} · {event.score}
                </span>
              </div>
            </div>
          ) : (
            <p className="mt-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              This call did not generate a risk event and is retained as an audit log only.
            </p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink">Matched Rules</h3>
          <div className="mt-2 space-y-2">
            {log.rules.length ? (
              log.rules.map((ruleId) => <RuleCard key={ruleId} ruleId={ruleId} />)
            ) : (
              <p className="rounded-lg bg-panel p-3 text-sm text-slate-600">No risk rules matched.</p>
            )}
          </div>
        </section>

        <CodeBlock title="Prompt" value={log.prompt} />
        <CodeBlock title="Model Output" value={log.output} />
        <CodeBlock title="RAG Context" value={log.ragContext} />
        {log.toolCall ? <CodeBlock title="Agent Tool Call" value={log.toolCall} /> : null}
      </div>
    </aside>
  );
}

export function RuleCard({ ruleId }: { ruleId: string }) {
  const rule = riskRules.find((item) => item.id === ruleId);
  if (!rule) return null;
  const Icon = ruleIcons[rule.iconName as keyof typeof ruleIcons];
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-600" />
        <span className="text-sm font-semibold text-ink">{rule.id}</span>
        <span className="text-sm text-slate-500">{rule.name}</span>
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{rule.trigger}</p>
    </div>
  );
}

export function MatchedRulesEvidence({ event }: { event: RiskEvent }) {
  const mappings =
    event.evidenceMappings ??
    event.rules.map((ruleId, index) => ({
      ruleId,
      signal: "Rule match",
      evidence: event.evidence[index] ?? event.evidence[0] ?? "Risk signal detected in the AI call.",
      impact: "This signal contributed to the event risk level and response action.",
    }));

  return (
    <section>
      <h3 className="text-sm font-semibold text-ink">Matched Rules & Evidence</h3>
      <div className="mt-2 space-y-2">
        {mappings.map((mapping) => {
          const rule = riskRules.find((item) => item.id === mapping.ruleId);
          const Icon = rule ? ruleIcons[rule.iconName as keyof typeof ruleIcons] : Shield;
          return (
            <div key={`${mapping.ruleId}-${mapping.signal}`} className="rounded-lg border border-line bg-panel p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {mapping.ruleId}
                      {rule ? <span className="font-normal text-slate-500"> · {rule.name}</span> : null}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-600">{mapping.signal}</p>
                  </div>
                </div>
                {rule ? (
                  <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-medium text-slate-600">
                    {rule.category}
                  </span>
                ) : null}
              </div>
              {rule ? <p className="mt-3 text-xs leading-5 text-slate-600">{rule.trigger}</p> : null}
              <div className="mt-3 grid gap-2 text-xs leading-5">
                <div className="rounded-lg bg-white px-3 py-2">
                  <span className="font-semibold text-ink">Evidence: </span>
                  <span className="text-slate-600">{mapping.evidence}</span>
                </div>
                <div className="rounded-lg bg-white px-3 py-2">
                  <span className="font-semibold text-ink">Risk impact: </span>
                  <span className="text-slate-600">{mapping.impact}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function EventDetail({
  event,
  canUpdateReview,
  isReviewSaving,
  onUpdateReview,
}: {
  event: RiskEvent;
  canUpdateReview?: boolean;
  isReviewSaving?: boolean;
  onUpdateReview?: (input: { reviewStatus: ReviewStatus; owner: string }) => Promise<void>;
}) {
  const [draftReviewStatus, setDraftReviewStatus] = useState<ReviewStatus>(event.reviewStatus);
  const [draftOwner, setDraftOwner] = useState(event.owner);
  const explanation =
    event.riskExplanation ??
    `This event was classified as ${levelMeta[event.level].label} because it matched ${event.rules.length} risk rule${
      event.rules.length === 1 ? "" : "s"
    } and produced evidence that required a ${actionMeta[event.action].label.toLowerCase()} response.`;

  useEffect(() => {
    setDraftReviewStatus(event.reviewStatus);
    setDraftOwner(event.owner);
  }, [event.id, event.owner, event.reviewStatus]);

  return (
    <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Risk Event Detail
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">{event.title}</h2>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold text-ink">{event.score}</p>
          <p className="text-xs text-slate-500">Risk Score</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">App</p>
          <p className="mt-1 font-medium text-ink">{event.app}</p>
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">Environment</p>
          <p className="mt-1 font-medium text-ink">{event.environment}</p>
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">Model</p>
          <p className="mt-1 font-medium text-ink">{event.model}</p>
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">Action</p>
          <div className="mt-1">
            <ActionPill action={event.action} />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <section className="rounded-lg border border-sky-100 bg-sky-50 p-3">
          <h3 className="text-sm font-semibold text-ink">Risk Explanation</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">{explanation}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-slate-500">Affected Asset</p>
              <p className="mt-1 font-medium text-ink">{event.affectedAsset ?? "AI call context and application workflow"}</p>
            </div>
            <div className="rounded-lg bg-white px-3 py-2">
              <p className="text-slate-500">Detection Basis</p>
              <p className="mt-1 font-medium text-ink">
                {event.rules.length} matched {event.rules.length === 1 ? "rule" : "rules"} · {event.evidence.length} evidence items
              </p>
            </div>
          </div>
        </section>

        <MatchedRulesEvidence event={event} />

        <SourceContext event={event} />

        <section>
          <h3 className="text-sm font-semibold text-ink">Recommended Action</h3>
          <p className="mt-2 rounded-lg bg-cyan-50 p-3 text-sm leading-6 text-cyan-900">
            {event.recommendation}
          </p>
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink">Review Metadata</h3>
          <div className="mt-2 rounded-lg border border-line bg-panel p-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Current Status</p>
                <div className="mt-1">
                  <ReviewStatusPill status={event.reviewStatus} />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500">Owner</p>
                <p className="mt-1 font-medium text-ink">{event.owner}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">SLA</p>
                <p className="mt-1 font-medium text-ink">{event.sla}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Last Updated</p>
                <p className="mt-1 font-medium text-ink">{event.updatedAt}</p>
              </div>
            </div>
            {canUpdateReview && onUpdateReview ? (
              <div className="mt-4 border-t border-line pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Update Review Metadata
                </p>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <select
                    value={draftReviewStatus}
                    onChange={(inputEvent) => setDraftReviewStatus(inputEvent.target.value as ReviewStatus)}
                    className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
                  >
                    <option value="pending_review">Pending Review</option>
                    <option value="in_review">In Review</option>
                    <option value="in_progress">In Progress</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="false_positive">False Positive</option>
                    <option value="resolved">Resolved</option>
                    <option value="escalated">Escalated</option>
                  </select>
                  <input
                    value={draftOwner}
                    onChange={(inputEvent) => setDraftOwner(inputEvent.target.value)}
                    placeholder="Owner"
                    className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => onUpdateReview({ reviewStatus: draftReviewStatus, owner: draftOwner })}
                    disabled={isReviewSaving}
                    className="h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isReviewSaving ? "Saving" : "Save"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </aside>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-slate-600">{children}</label>;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus:border-slate-400"
      />
    </div>
  );
}

export function TextAreaField({
  label,
  value,
  minRows = 4,
  onChange,
}: {
  label: string;
  value: string;
  minRows?: number;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <textarea
        value={value}
        rows={minRows}
        onChange={(event) => onChange(event.target.value)}
        className="w-full resize-y rounded-lg border border-line bg-white px-3 py-2 text-sm leading-6 text-ink outline-none focus:border-slate-400"
      />
    </div>
  );
}

export function DetectionResult({ result }: { result: RiskEvaluation }) {
  return (
    <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Detection Result
          </p>
          <h2 className="mt-2 text-lg font-semibold text-ink">
            {levelMeta[result.level].label} · {actionMeta[result.action].label}
          </h2>
        </div>
        <div className="text-right">
          <p className="text-4xl font-semibold text-ink">{result.score}</p>
          <p className="text-xs text-slate-500">Risk Score</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">Risk Level</p>
          <span
            className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
              levelMeta[result.level].className
            }`}
          >
            {levelMeta[result.level].label}
          </span>
        </div>
        <div className="rounded-lg bg-panel p-3">
          <p className="text-xs text-slate-500">Response Action</p>
          <div className="mt-2">
            <ActionPill action={result.action} />
          </div>
        </div>
      </div>

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-ink">Matched Rules</h3>
        <div className="mt-2 space-y-2">
          {result.findings.length ? (
            result.findings.map((finding) => (
              <div key={`${finding.ruleId}-${finding.location}`} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {finding.ruleId} · {finding.ruleName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {finding.category} · {finding.location}
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-slate-600">
                    +{finding.score}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">{finding.evidence}</p>
              </div>
            ))
          ) : (
            <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
              No V0.2 risk rules matched.
            </p>
          )}
        </div>
      </section>

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-ink">Recommended Action</h3>
        <p className="mt-2 rounded-lg bg-cyan-50 p-3 text-sm leading-6 text-cyan-900">
          {result.recommendation}
        </p>
      </section>

      <section className="mt-4">
        <h3 className="text-sm font-semibold text-ink">Review Status</h3>
        <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {result.reviewRequired ? "Pending review: severe events or human-review actions require security confirmation." : "No review needed: retaining the audit log is sufficient."}
        </p>
      </section>
    </aside>
  );
}

export function DetectionSandbox({
  onSimulateIngestion,
}: {
  onSimulateIngestion: (input: SandboxInput, result: RiskEvaluation) => Promise<void>;
}) {
  const [input, setInput] = useState<SandboxInput>(sandboxTemplates[0].input);
  const [result, setResult] = useState<RiskEvaluation>(() => evaluateAiCall(sandboxTemplates[0].input));
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState<string | null>(null);

  const updateInput = <K extends keyof SandboxInput>(key: K, value: SandboxInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const applyTemplate = (templateId: string) => {
    const template = sandboxTemplates.find((item) => item.id === templateId) ?? sandboxTemplates[0];
    setInput(template.input);
    setResult(evaluateAiCall(template.input));
  };

  const runDetection = () => {
    setResult(evaluateAiCall(input));
  };

  const simulateIngestion = async () => {
    const latestResult = evaluateAiCall(input);
    setResult(latestResult);
    setIsIngesting(true);
    setIngestionStatus(null);

    try {
      await onSimulateIngestion(input, latestResult);
      setIngestionStatus("Ingested into backend. Open Call Logs, Risk Events, or Overview to inspect the updated data.");
    } catch (error) {
      setIngestionStatus(error instanceof Error ? error.message : "Unable to ingest model call.");
    } finally {
      setIsIngesting(false);
    }
  };

  return (
    <div className="grid grid-cols-[1.25fr_0.95fr] gap-5">
      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Detection Sandbox</h2>
            <p className="mt-1 text-xs text-slate-500">
              Validate rule matches, risk score, evidence chain, and response action with a single AI-call sample.
            </p>
          </div>
          <button
            type="button"
            onClick={() => applyTemplate(input.templateId)}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Sample
          </button>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-3">
          {sandboxTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => applyTemplate(template.id)}
              className={`min-h-24 rounded-lg border p-3 text-left transition ${
                input.templateId === template.id
                  ? "border-ink bg-slate-50"
                  : "border-line bg-white hover:bg-slate-50"
              }`}
            >
              <p className="text-sm font-semibold text-ink">{template.name}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{template.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <TextField label="App Name" value={input.app} onChange={(value) => updateInput("app", value)} />
          <TextField label="User Role" value={input.userRole} onChange={(value) => updateInput("userRole", value)} />
          <SelectField
            label="Environment"
            value={input.environment}
            options={["Production", "Test"]}
            onChange={(value) => updateInput("environment", value as SandboxInput["environment"])}
          />
          <SelectField
            label="Data Type"
            value={input.dataType}
            options={["Customer Data", "Financial Data", "Employee Data", "General Data"]}
            onChange={(value) => updateInput("dataType", value as SandboxInput["dataType"])}
          />
        </div>

        <div className="mt-4 space-y-4">
          <TextAreaField label="Prompt" value={input.prompt} onChange={(value) => updateInput("prompt", value)} />
          <TextAreaField label="Model Output" value={input.output} onChange={(value) => updateInput("output", value)} />
          <TextAreaField
            label="RAG Context"
            value={input.ragContext}
            onChange={(value) => updateInput("ragContext", value)}
          />
          <TextAreaField
            label="Agent Tool Call"
            value={input.toolCall}
            minRows={2}
            onChange={(value) => updateInput("toolCall", value)}
          />
        </div>

        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={simulateIngestion}
            disabled={isIngesting}
            className="mr-2 inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <GitBranch className="h-4 w-4" />
            {isIngesting ? "Ingesting..." : "Simulate Ingestion & Generate Event"}
          </button>
          <button
            type="button"
            onClick={runDetection}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-sm font-medium text-white hover:bg-slate-800"
          >
            <Play className="h-4 w-4" />
            Run Detection
          </button>
        </div>
        {ingestionStatus ? (
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
            {ingestionStatus}
          </p>
        ) : null}
      </section>

      <DetectionResult result={result} />
    </div>
  );
}
