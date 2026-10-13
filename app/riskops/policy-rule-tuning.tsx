import { useState } from "react";
import { apiRequest } from "@/app/riskops/api";
import { type PolicyRuleStateApi, type PolicyTemplateApi } from "@/app/riskops/api-types";
import { type UserProfile } from "@/app/riskops/config";
import { type ScoreBands, scoreBandError } from "@/lib/policy/score-bands";
import { type RiskAction, actionMeta } from "@/lib/risk-data";

const overrideActions: RiskAction[] = ["flag", "redact", "review", "block"];

type Draft = { action: string; threshold: string };

function draftFor(policyRule: PolicyRuleStateApi): Draft {
  return {
    action: policyRule.actionOverride ?? "",
    threshold: policyRule.thresholdOverride === null ? "" : String(policyRule.thresholdOverride),
  };
}

type BandDraft = { reviewAt: string; blockAt: string; escalateAt: string };

const bandFields: Array<{ key: keyof BandDraft; label: string; hint: string }> = [
  { key: "reviewAt", label: "Review from", hint: "Calls at or above this score get human review" },
  { key: "blockAt", label: "Block from", hint: "Calls at or above this score are blocked" },
  { key: "escalateAt", label: "Escalate from", hint: "Events at or above this score start out escalated" },
];

function bandDraftFor(template: PolicyTemplateApi | undefined): BandDraft {
  const bands = template && !template.scoreBands.usesDefault ? template.scoreBands : null;
  const text = (value: number | null | undefined) => (value == null ? "" : String(value));

  return { reviewAt: text(bands?.reviewAt), blockAt: text(bands?.blockAt), escalateAt: text(bands?.escalateAt) };
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
  const [bandDrafts, setBandDrafts] = useState<Record<string, BandDraft>>({});
  const selectedTemplateId = templates.some((template) => template.id === templateId) ? templateId : templates[0]?.id ?? "";
  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const rows = policyRules.filter((policyRule) => policyRule.policyTemplate.id === selectedTemplateId);
  const savedBands = bandDraftFor(selectedTemplate);
  const bandDraft = bandDrafts[selectedTemplateId] ?? savedBands;
  const areBandsDirty = bandFields.some(({ key }) => bandDraft[key] !== savedBands[key]);
  const bandsPendingId = `bands-${selectedTemplateId}`;

  const saveBands = async () => {
    const values = {
      reviewAt: parseThreshold(bandDraft.reviewAt),
      blockAt: parseThreshold(bandDraft.blockAt),
      escalateAt: parseThreshold(bandDraft.escalateAt),
    };

    if (Object.values(values).some((value) => value === undefined)) {
      setError("Score bands must be whole numbers from 1 to 100, or empty to leave a band unset.");
      return;
    }

    const conflict = scoreBandError(values as ScoreBands);

    if (conflict) {
      setError(conflict);
      return;
    }

    setPendingId(bandsPendingId);
    setError(null);

    try {
      await apiRequest(`/api/admin/policy-center/templates/${encodeURIComponent(selectedTemplateId)}`, {
        profile: currentProfile,
        method: "PATCH",
        body: values,
        errorMessage: "Unable to save the score bands.",
      });
      await onSaved();
      setBandDrafts((current) => {
        const next = { ...current };
        delete next[selectedTemplateId];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save the score bands.");
    } finally {
      setPendingId(null);
    }
  };

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
            Per template, set the score bands that apply to every call, then tune individual rules: the action a
            rule takes and the score from which that action applies.
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
      <div className="flex items-end gap-4 border-b border-line px-4 py-3" data-score-bands>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">Score Bands</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {selectedTemplate?.scoreBands.usesDefault
              ? "No band is set for this template, so the default applies: 80+ review."
              : "Enforced on every call from applications bound to this template."}{" "}
            Bands only raise the response that matched rules already call for.
          </p>
        </div>
        {bandFields.map(({ key, label, hint }) => (
          <label key={key} className="w-28 text-xs font-medium text-slate-600" title={hint}>
            {label}
            <input
              aria-label={label}
              type="number"
              min={1}
              max={100}
              value={bandDraft[key]}
              placeholder="Not set"
              onChange={(event) =>
                setBandDrafts((current) => ({ ...current, [selectedTemplateId]: { ...bandDraft, [key]: event.target.value } }))}
              className="mt-1 h-8 w-full rounded-lg border border-line bg-white px-2 text-sm text-ink outline-none"
            />
          </label>
        ))}
        <button
          type="button"
          onClick={saveBands}
          disabled={!areBandsDirty || pendingId !== null || !selectedTemplateId}
          className="h-8 rounded-lg bg-ink px-3 text-xs font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {pendingId === bandsPendingId ? "Saving" : "Save Bands"}
        </button>
      </div>
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
