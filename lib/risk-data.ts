import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Eye,
  FileWarning,
  KeyRound,
  LockKeyhole,
  MailWarning,
  Radar,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Zap,
} from "lucide-react";
import riskRuleCatalog from "@/lib/risk-rules.json";

export type RiskAction = "allow" | "flag" | "redact" | "review" | "block";
export type RiskLevel = "low" | "medium" | "high" | "severe";
export type ReviewStatus =
  | "pending_review"
  | "in_review"
  | "in_progress"
  | "confirmed"
  | "false_positive"
  | "resolved"
  | "escalated";

export type RiskRule = {
  id: string;
  name: string;
  category: string;
  trigger: string;
  baseScore: number;
  defaultAction: RiskAction;
  iconName: string;
};

export type RiskEvent = {
  id: string;
  time: string;
  app: string;
  user: string;
  department: string;
  model: string;
  environment: "Production" | "Test";
  score: number;
  level: RiskLevel;
  action: RiskAction;
  rules: string[];
  title: string;
  prompt: string;
  output: string;
  evidence: string[];
  riskExplanation?: string;
  affectedAsset?: string;
  evidenceMappings?: Array<{
    ruleId: string;
    signal: string;
    evidence: string;
    impact: string;
  }>;
  recommendation: string;
  reviewStatus: ReviewStatus;
  owner: string;
  sla: string;
  updatedAt: string;
  toolCall?: string;
};

export type AiCallLog = {
  id: string;
  traceId: string;
  eventId?: string;
  time: string;
  app: string;
  user: string;
  model: string;
  environment: "Production" | "Test";
  score: number;
  level: RiskLevel;
  action: RiskAction;
  prompt: string;
  output: string;
  ragContext: string;
  toolCall?: string;
  rules: string[];
};

// Default rule catalog. The database RiskRule table is the runtime source; this seeds it and backs client-side display.
export const riskRules = riskRuleCatalog as RiskRule[];

export const actionMeta: Record<
  RiskAction,
  { label: string; className: string; icon: typeof CheckCircle2 }
> = {
  allow: {
    label: "Allow",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    icon: CheckCircle2,
  },
  flag: {
    label: "Flag",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    icon: AlertTriangle,
  },
  redact: {
    label: "Redact",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    icon: Eye,
  },
  review: {
    label: "Human Review",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
    icon: ClipboardCheck,
  },
  block: {
    label: "Block",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    icon: Ban,
  },
};

export const levelMeta: Record<RiskLevel, { label: string; className: string }> = {
  low: { label: "Low", className: "text-emerald-700 bg-emerald-50" },
  medium: { label: "Medium", className: "text-amber-700 bg-amber-50" },
  high: { label: "High", className: "text-rose-700 bg-rose-50" },
  severe: { label: "Severe", className: "text-violet-700 bg-violet-50" },
};

export const reviewStatusMeta: Record<
  ReviewStatus,
  { label: string; className: string; description: string }
> = {
  pending_review: {
    label: "Pending Review",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    description: "The event has not yet been confirmed by security or risk reviewers.",
  },
  in_progress: {
    label: "In Progress",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    description: "An owner has taken the event and is investigating or contacting the business team.",
  },
  in_review: {
    label: "In Review",
    className: "bg-cyan-50 text-cyan-700 ring-cyan-200",
    description: "An owner has taken the event and is reviewing the risk evidence.",
  },
  confirmed: {
    label: "Confirmed",
    className: "bg-rose-50 text-rose-700 ring-rose-200",
    description: "Human review confirmed this as a real risk.",
  },
  false_positive: {
    label: "False Positive",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
    description: "Human review determined that the event is acceptable or was incorrectly detected.",
  },
  resolved: {
    label: "Resolved",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    description: "The risk has been remediated and closed.",
  },
  escalated: {
    label: "Escalated",
    className: "bg-violet-50 text-violet-700 ring-violet-200",
    description: "The event has been escalated as a security, compliance, or major business risk.",
  },
};

export const ruleIcons = {
  ShieldAlert,
  FileWarning,
  Eye,
  KeyRound,
  LockKeyhole,
  MailWarning,
  Ban,
  Radar,
  Database,
  ShieldCheck,
  Siren,
  Zap,
};
