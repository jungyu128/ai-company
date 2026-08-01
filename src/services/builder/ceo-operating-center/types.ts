/**
 * CEO Operating Center — single-screen command surface types.
 * Everything is derived from recorded company state; never fabricated.
 */

import type { CompanyBrainView } from "../company-brain/types";
import type { WorkExecutionEngineView } from "../work-execution-engine/types";
import type { CompanyLearningView } from "../company-learning/types";

export type CeoOperatingCenterTone = "critical" | "warning" | "info" | "positive" | "neutral";

export type CeoInboxKind =
  | "work_completed"
  | "blocker"
  | "review_finished"
  | "approval_required"
  | "risk_increased"
  | "priority_changed"
  | "waiting_ceo"
  | "directive";

export type CeoInboxItem = {
  id: string;
  kind: CeoInboxKind;
  tone: CeoOperatingCenterTone;
  title: string;
  detail: string;
  employeeId: string | null;
  employeeName: string | null;
  at: string;
  atDisplay: string;
  /** Deep-link into existing HQ ops sections. */
  href: string;
};

export type CeoDecisionItem = {
  id: string;
  title: string;
  employeeName: string;
  reason: string;
  isProtected: boolean;
  href: string;
};

export type CeoCriticalAlert = {
  id: string;
  tone: "critical" | "warning";
  title: string;
  detail: string;
  href: string;
};

export type CeoRecommendedAction = {
  title: string;
  reason: string;
  href: string;
};

export type CeoOperatingCenterKpi = {
  id: string;
  label: string;
  value: string;
  tone: CeoOperatingCenterTone;
};

export type CeoDailySummary = {
  directiveTitle: string | null;
  completed: number;
  inProgress: number;
  blocked: number;
  waitingApprovals: number;
  latestUpdate: string | null;
};

export type CeoMorningBriefing = {
  headline: string;
  summary: string;
  bullets: string[];
};

export type CeoOperatingCenterView = {
  generatedAt: string;
  generatedAtDisplay: string;
  morningBriefing: CeoMorningBriefing;
  inbox: CeoInboxItem[];
  decisionCenter: {
    count: number;
    protectedCount: number;
    items: CeoDecisionItem[];
  };
  criticalAlerts: CeoCriticalAlert[];
  recommendedNextAction: CeoRecommendedAction | null;
  companyHealth: {
    score: number;
    label: string;
    summary: string;
    factors: string[];
  };
  liveKpis: CeoOperatingCenterKpi[];
  dailySummary: CeoDailySummary;
  /** AI Company Brain — permanent executive recommendation (recorded state only). */
  brain: CompanyBrainView;
  /** Work Execution Engine — full software lifecycle from recorded state. */
  workExecution: WorkExecutionEngineView;
  /** Company Learning Engine — lessons, patterns, maturity (recorded only). */
  learning: CompanyLearningView;
};
