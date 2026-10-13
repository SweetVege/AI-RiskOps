import { useState } from "react";
import { apiRequest } from "@/app/riskops/api";
import { type PolicyRuleStateApi, type PolicyTemplateApi } from "@/app/riskops/api-types";
import { type UserProfile } from "@/app/riskops/config";
import { type RiskAction, actionMeta } from "@/lib/risk-data";

const overrideActions: RiskAction[] = ["flag", "redact", "review", "block"];

type Draft = { action: string; threshold: string };

function draftFor(policyRule: PolicyRuleStateApi): Draft {
  return {
    action: policyRule.actionOverride ?? "",
    threshold: policyRule.thresholdOverride === null ? "" : String(policyRule.thresholdOverride),
  };
}

function parseThreshold(value: string) {
  if (!value.trim()) return null;

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 100 ? parsed : undefined;
}

// Per-template tuning of a rule: the action it takes, and the total score from which that action applies.
export function PolicyRuleTuning({
  currentProfile,
  templates,
  policyRules,
  onSaved,
}: {
  currentProfile: UserProfile;
  templates: PolicyTemplateApi[];
  policyRules: PolicyRuleStateApi[];
  onSaved: () => Promise<void>;
}) {
  const [templateId, setTemplateId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selectedTemplateId = templates.some((template) => template.id === templateId) ? templateId : templates[0]?.id ?? "";
  const rows = policyRules.filter((policyRule) => policyRule.policyTemplate.id === selectedTemplateId);

  const save = async (policyRule: PolicyRuleStateApi, draft: Draft) => {
    const threshold = parseThreshold(draft.threshold);

    if (threshold === undefined) {
      setError("Threshold must be a whole number from 1 to 100, or empty to always apply the action.");
      return;
    }

    setPendingId(policyRule.id);
    setError(null);

    try {
      await apiRequest(`/api/admin/policy-center/policy-rules/${encodeURIComponent(policyRule.id)}`, {
        profile: currentProfile,
        method: "PATCH",
        body: { actionOverride: draft.action || null, thresholdOverride: threshold },
        errorMessage: "Unable to save the rule override.",
      });
      await onSaved();
      setDrafts((current) => {
        const next = { ...current };
        delete next[policyRule.id];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the rule override.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section className="rounded-lg border border-line bg-white shadow-soft">
      <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Template Rule Tuning</h2>
          <p className="text-xs text-slate-500">
            Per template, change the action a rule takes and the total risk score from which that action applies.
            Below the threshold the match is still recorded and flagged.
          </p>
        </div>
        <select
          aria-label="Policy template"
          value={selectedTemplateId}
          onChange={(event) => setTemplateId(event.target.value)}
          className="h-9 rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none"
        >
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700">{error}</p>
      ) : null}
      <div className="grid grid-cols-[88px_1fr_120px_150px_150px_88px] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
        <span>Rule ID</span>
        <span>Rule Name</span>
        <span>Default Action</span>
        <span>Action In Template</span>
        <span>Applies From Score</span>
        <span />
      </div>
      {rows.length ? rows.map((policyRule) => {
        const saved = draftFor(policyRule);
        const draft = drafts[policyRule.id] ?? saved;
        const isDirty = draft.action !== saved.action || draft.threshold !== saved.threshold;
        const { baseline } = policyRule.riskRule;
        const setDraft = (next: Partial<Draft>) =>
          setDrafts((current) => ({ ...current, [policyRule.id]: { ...draft, ...next } }));

        return (
          <div
            key={policyRule.id}
            data-rule-id={policyRule.riskRule.id}
            className="grid grid-cols-[88px_1fr_120px_150px_150px_88px] items-center gap-3 border-b border-line px-4 py-2.5 text-sm"
          >
            <span className="font-semibold text-ink">{policyRule.riskRule.id}</span>
            <span className="min-w-0 truncate text-slate-700">
              {policyRule.riskRule.name}
              {baseline ? <span className="ml-2 text-xs text-slate-500">Baseline</span> : null}
            </span>
            <span className="text-slate-600">{actionMeta[policyRule.riskRule.defaultAction as RiskAction]?.label ?? policyRule.riskRule.defaultAction}</span>
            <select
              aria-label={`Action for ${policyRule.riskRule.id}`}
              value={draft.action}
              onChange={(event) => setDraft({ action: event.target.value })}
              className="h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none"
            >
              <option value="">Use default</option>
              {overrideActions.map((action) => (
                <option key={action} value={action}>
                  {actionMeta[action].label}
                </option>
              ))}
            </select>
            <input
              aria-label={`Threshold for ${policyRule.riskRule.id}`}
              type="number"
              min={1}
              max={100}
              value={draft.threshold}
              disabled={baseline}
              title={baseline ? "Baseline rules always act, so they cannot be held behind a threshold." : undefined}
              placeholder={baseline ? "Always" : "Any score"}
              onChange={(event) => setDraft({ threshold: event.target.value })}
              className="h-8 rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none disabled:cursor-not-allowed disabled:bg-slate-50"
            />
            <button
              type="button"
              onClick={() => save(policyRule, draft)}
              disabled={!isDirty || pendingId !== null}
              className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {pendingId === policyRule.id ? "Saving" : "Save"}
            </button>
          </div>
        );
      }) : (
        <p className="px-4 py-6 text-center text-sm text-slate-500">This template has no rules.</p>
      )}
    </section>
  );
}
