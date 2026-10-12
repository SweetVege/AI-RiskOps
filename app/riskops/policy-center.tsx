import { AlertOctagon, Gauge, ListFilter, ShieldCheck, Sliders, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import {
  type PolicyCenterSummaryApi,
  type PolicyRuleRow,
  type PolicyRuleStateApi,
  type PolicyTemplateApi,
} from "@/app/riskops/api-types";
import { apiRequest } from "@/app/riskops/api";
import { ActionPill, DetectionSandbox, StatCard } from "@/app/riskops/components";
import { type UserProfile, actionMatrix } from "@/app/riskops/config";
import { type RiskEvent } from "@/lib/risk-data";
import { type RiskEvaluation, type SandboxInput } from "@/lib/risk-engine";

export function PolicyCenter({
  currentProfile,
  onSimulateIngestion,
}: {
  currentProfile: UserProfile;
  onSimulateIngestion: (input: SandboxInput, result: RiskEvaluation) => Promise<void>;
}) {
  const [summary, setSummary] = useState<PolicyCenterSummaryApi | null>(null);
  const [templates, setTemplates] = useState<PolicyTemplateApi[]>([]);
  const [policyRules, setPolicyRules] = useState<PolicyRuleStateApi[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const loadPolicyCenter = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const payload = await apiRequest<{
        summary: PolicyCenterSummaryApi;
        data: { templates: PolicyTemplateApi[]; policyRules: PolicyRuleStateApi[] };
      }>("/api/admin/policy-center", {
        profile: currentProfile,
        errorMessage: "Unable to load Policy Center data.",
      });
      setSummary(payload.summary);
      setTemplates(payload.data.templates);
      setPolicyRules(payload.data.policyRules);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Policy Center data.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadPolicyCenter();
  }, [currentProfile]);

  const templateRows = templates;

  const ruleRows: PolicyRuleRow[] = Array.from(
    policyRules.reduce((items, policyRule) => {
      const existing = items.get(policyRule.riskRule.id);
      if (existing) {
        existing.policyRuleCount += 1;
        existing.enabledPolicyRuleCount += policyRule.enabled ? 1 : 0;
        existing.hits24h = Math.max(existing.hits24h, policyRule.operationalStat.hits24h);
        existing.reviewedFalsePositiveRate = Math.max(
          existing.reviewedFalsePositiveRate,
          policyRule.operationalStat.reviewedFalsePositiveRate,
        );
        return items;
      }

      items.set(policyRule.riskRule.id, {
        id: policyRule.riskRule.id,
        name: policyRule.riskRule.name,
        category: policyRule.riskRule.category,
        trigger: policyRule.riskRule.trigger,
        baseScore: policyRule.riskRule.baseScore,
        defaultAction: policyRule.riskRule.defaultAction as RiskEvent["action"],
        hits24h: policyRule.operationalStat.hits24h,
        reviewedFalsePositiveRate: policyRule.operationalStat.reviewedFalsePositiveRate,
        policyRuleCount: 1,
        enabledPolicyRuleCount: policyRule.enabled ? 1 : 0,
      });
      return items;
    }, new Map<string, PolicyRuleRow>()).values(),
  );

  const summaryView = summary ?? {
    policyTemplates: templateRows.length,
    enabledTemplates: templateRows.filter((template) => template.enabled).length,
    riskRules: ruleRows.length,
    enabledPolicyRules: ruleRows.reduce((sum, rule) => sum + rule.enabledPolicyRuleCount, 0),
    hits24h: ruleRows.reduce((sum, rule) => sum + rule.hits24h, 0),
    highFalsePositiveRules: ruleRows.filter((rule) => rule.reviewedFalsePositiveRate >= 15).length,
  };

  const toggleTemplate = async (templateId: string, enabled: boolean) => {
    setPendingAction(`template-${templateId}`);
    setError(null);
    try {
      await apiRequest(`/api/admin/policy-center/templates/${encodeURIComponent(templateId)}/toggle`, {
        profile: currentProfile,
        method: "POST",
        body: { enabled },
        errorMessage: "Unable to update policy template.",
      });
      await loadPolicyCenter();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update policy template.");
    } finally {
      setPendingAction(null);
    }
  };

  const toggleRule = async (ruleId: string, enabled: boolean) => {
    setPendingAction(`rule-${ruleId}`);
    setError(null);
    try {
      await apiRequest(`/api/admin/policy-center/rules/${encodeURIComponent(ruleId)}/toggle`, {
        profile: currentProfile,
        method: "POST",
        body: { enabled },
        errorMessage: "Unable to update risk rule.",
      });
      await loadPolicyCenter();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update risk rule.");
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="space-y-5 p-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      <section className="grid grid-cols-4 gap-4">
        <StatCard
          title="Policy Templates"
          value={`${summaryView.policyTemplates}`}
          delta={`${summaryView.enabledTemplates} templates enabled for active policy bindings`}
          icon={Sliders}
          tone="bg-cyan-50 text-cyan-700"
        />
        <StatCard
          title="Enabled Rules"
          value={`${summaryView.enabledPolicyRules}`}
          delta={`${summaryView.riskRules} unique rules across policy templates`}
          icon={ShieldCheck}
          tone="bg-emerald-50 text-emerald-700"
        />
        <StatCard
          title="24h Rule Hits"
          value={`${summaryView.hits24h}`}
          delta="Total rule hits across applications and policies"
          icon={AlertOctagon}
          tone="bg-rose-50 text-rose-700"
        />
        <StatCard
          title="High False-Positive Rules"
          value={`${summaryView.highFalsePositiveRules}`}
          delta="Rules with human-reviewed false-positive rate above 15%"
          icon={Gauge}
          tone="bg-amber-50 text-amber-700"
        />
      </section>

      <section className="rounded-lg border border-line bg-white p-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">Policy Templates</h2>
            <p className="text-xs text-slate-500">
              Package rules, thresholds, and default actions by AI application type
            </p>
          </div>
          <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
            <ListFilter className="h-4 w-4" />
            {isLoading ? "Loading" : "Filter"}
          </button>
        </div>
        {templateRows.length ? (
          <div className="mt-4 grid grid-cols-5 gap-3">
            {templateRows.map((template) => (
            <article key={template.id} className="rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-ink">{template.name}</h3>
                  <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">
                    {template.scope}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleTemplate(template.id, !template.enabled)}
                  disabled={pendingAction !== null || !templates.length}
                  className={`rounded-full px-2 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                    template.enabled
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {pendingAction === `template-${template.id}`
                    ? "Saving"
                    : template.enabled
                      ? "Enabled"
                      : "Disabled"}
                </button>
              </div>
              <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs text-slate-600">
                <p>
                  Rules covered: {template.enabledRuleCount}/{template.ruleCount}
                </p>
                <p>Applied apps: {template.appliedApplicationCount} apps</p>
                <p>Default action: {template.defaultAction}</p>
                <p>Thresholds: {template.thresholds}</p>
              </div>
            </article>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-line bg-panel px-4 py-8 text-center">
            <p className="text-sm font-semibold text-ink">No policy templates returned by the API.</p>
            <p className="mt-1 text-xs text-slate-500">
              Seed policy templates or check the Policy Center API before tuning rules.
            </p>
          </div>
        )}
      </section>

      <section className="grid grid-cols-[1.35fr_0.85fr] gap-5">
        <section className="rounded-lg border border-line bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div>
          <h2 className="text-base font-semibold text-ink">Rule Library</h2>
              <p className="text-xs text-slate-500">
                Manage rule state, base score, default action, hit count, and human-reviewed false-positive rate
              </p>
            </div>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm text-slate-600 hover:bg-slate-50">
              <SlidersHorizontal className="h-4 w-4" />
              Rule Debugging
            </button>
          </div>
          <div className="grid grid-cols-[88px_1fr_96px_76px_96px_88px_82px_92px] gap-3 border-b border-line bg-panel px-4 py-2 text-xs font-medium text-slate-500">
            <span>Rule ID</span>
            <span>Rule Name</span>
            <span>Risk Type</span>
            <span>Base Score</span>
            <span>Default Action</span>
            <span>24h Hits</span>
            <span>Human-Reviewed FP Rate</span>
            <span>State</span>
          </div>
          <div>
            {ruleRows.length ? ruleRows.map((rule) => {
              const isRuleEnabled = rule.enabledPolicyRuleCount > 0;
              const stateLabel =
                rule.enabledPolicyRuleCount === 0
                  ? "Disabled"
                  : rule.enabledPolicyRuleCount === rule.policyRuleCount
                    ? "Enabled"
                    : "Partial";
              return (
                <div
                  key={rule.id}
                  className="grid grid-cols-[88px_1fr_96px_76px_96px_88px_82px_92px] items-center gap-3 border-b border-line px-4 py-3 text-sm"
                >
                  <span className="font-semibold text-ink">{rule.id}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{rule.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">
                      {stateLabel} · {rule.trigger}
                    </span>
                  </span>
                  <span className="text-slate-600">{rule.category}</span>
                  <span className="font-medium text-ink">+{rule.baseScore}</span>
                  <ActionPill action={rule.defaultAction} />
                  <span className="text-slate-600">{rule.hits24h}</span>
                  <span
                    className={
                      rule.reviewedFalsePositiveRate >= 15
                        ? "font-medium text-amber-700"
                        : "text-slate-600"
                    }
                  >
                    {rule.reviewedFalsePositiveRate.toFixed(1)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleRule(rule.id, !isRuleEnabled)}
                    disabled={pendingAction !== null || !policyRules.length}
                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60 ${
                      isRuleEnabled
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-line bg-slate-50 text-slate-600"
                    }`}
                  >
                    {pendingAction === `rule-${rule.id}` ? "Saving" : stateLabel}
                  </button>
                </div>
              );
            }) : (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-ink">No policy rules returned by the API.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Rule Library no longer falls back to frontend sample rules.
                </p>
              </div>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <div>
            <h2 className="text-base font-semibold text-ink">Response Matrix</h2>
            <p className="mt-1 text-xs text-slate-500">
              Map risk score to system default action and operational escalation path
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {actionMatrix.map((item) => (
              <div key={item.level} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">{item.level}</p>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs text-slate-600">
                    {item.score}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-700">{item.defaultAction}</p>
                <p className="mt-1 text-xs text-slate-500">{item.escalation}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-ink">Policy Simulation</h2>
            <p className="mt-1 text-xs text-slate-500">
              Test a single AI call against the current rule engine before changing policy behavior.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Internal Testing
          </span>
        </div>
        <DetectionSandbox onSimulateIngestion={onSimulateIngestion} />
      </section>
    </div>
  );
}
