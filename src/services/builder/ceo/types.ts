/**
 * AI CEO & Autonomous Company Operations v10 — contracts.
 * Product-facing only. AI CEO never performs external writes.
 */

import type { DailyReportView } from "../daily-report/types";

export type HealthLabel = "Strong" | "Stable" | "Watch" | "At risk";

export type CompanyHealthKpis = {
  workload: number;
  overdueWork: number;
  approvalBacklog: number;
  executionSuccessRate: number;
  workdayCompletion: number;
  memoryConfidence: number;
  connectorHealth: number;
  collaborationQuality: number;
  missionThroughput: number;
};

export type CompanyHealthSnapshot = {
  id: string;
  workspaceId: string;
  score: number;
  label: HealthLabel;
  summary: string;
  kpis: CompanyHealthKpis;
  factors: string[];
  createdAt: string;
};

export type RiskSeverity = "low" | "medium" | "high" | "critical";

export type OperationalRisk = {
  id: string;
  workspaceId: string;
  kind:
    | "overloaded_employee"
    | "repeated_failures"
    | "stalled_mission"
    | "approval_bottleneck"
    | "disconnected_integration"
    | "recurring_execution_failure"
    | "overdue_follow_up"
    | "declining_productivity";
  title: string;
  severity: RiskSeverity;
  confidence: number;
  impact: string;
  recommendation: string;
  ownerEmployeeId: string | null;
  ownerName: string;
  relatedId: string | null;
  status: "open" | "acknowledged" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type WorkloadEntry = {
  employeeId: string;
  employeeName: string;
  role: string;
  activeItems: number;
  pendingApprovals: number;
  loadScore: number;
  status: "light" | "balanced" | "heavy" | "overloaded";
};

export type PlanningRecommendation = {
  id: string;
  workspaceId: string;
  kind: "reassign" | "balance" | "collaborate" | "reorder" | "escalate";
  title: string;
  rationale: string;
  fromEmployeeId: string | null;
  toEmployeeId: string | null;
  missionId: string | null;
  priorityHint: string | null;
  requiresHumanApproval: true;
  createdAt: string;
};

export type KpiHistoryPoint = {
  id: string;
  workspaceId: string;
  at: string;
  score: number;
  kpis: CompanyHealthKpis;
};

export type ExecutiveReportPeriod = "weekly" | "monthly";

export type ExecutiveReport = {
  id: string;
  workspaceId: string;
  period: ExecutiveReportPeriod;
  periodLabel: string;
  generatedAt: string;
  achievements: string[];
  failures: string[];
  trends: string[];
  recommendations: string[];
  kpiChanges: Array<{ kpi: string; from: number; to: number; delta: number }>;
  operationalRisks: string[];
  learningProgress: string[];
  summary: string;
};

export type AiCeoSafetyGuarantees = {
  analyzes: true;
  recommends: true;
  assigns: true;
  reprioritizes: true;
  summarizes: true;
  neverApprovesExternalWrites: true;
  neverBypassesApprovals: true;
  neverBypassesPermissions: true;
  neverExposesSecrets: true;
  neverFabricatesData: true;
};

/** Drill-down sections on the CEO Dashboard. */
export type CeoDashboardDrillSection =
  | "health"
  | "workload"
  | "active_work"
  | "blocked_work"
  | "sprint"
  | "meeting"
  | "risk"
  | "approval"
  | "decision"
  | "kpi"
  | "live_work"
  | "daily_ops";

export type CeoDashboardItemRef = {
  id: string;
  section: CeoDashboardDrillSection;
  title: string;
  subtitle: string;
  status: string;
  href: string;
  meta?: Record<string, string | number | null | undefined>;
};

export type CeoLiveWorkPanel = {
  asOf: string;
  summary: {
    idle: number;
    planning: number;
    working: number;
    reviewing: number;
    meeting: number;
    waiting: number;
    blocked: number;
    completed: number;
  };
  employees: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    status: string;
    currentTask: string | null;
    progressPercent: number;
    currentStep: string;
    startedAt: string | null;
    estimatedCompletionAt: string | null;
    waitingFor: string | null;
    nextPlannedAction: string;
    lastUpdate: string;
    href: string;
  }>;
  recentChanges: Array<{
    employeeId: string;
    employeeName: string;
    summary: string;
    at: string;
  }>;
};

export type CeoDailyOpsPanel = {
  asOf: string;
  directive: {
    id: string;
    title: string;
    instruction: string;
    status: string;
    priority: string;
    clarifiedOutcome: string | null;
    paused: boolean;
  } | null;
  plan: {
    id: string;
    planVersion: number;
    status: string;
    objectiveSummary: string;
    immutable: boolean;
  } | null;
  workSummary: {
    proposed: number;
    awaitingApproval: number;
    approved: number;
    executing: number;
    blocked: number;
    completed: number;
    rejected: number;
  };
  approvalQueue: Array<{
    id: string;
    kind: string;
    summary: string;
    workItemId: string | null;
  }>;
  workItems: Array<{
    id: string;
    title: string;
    status: string;
    assignedEmployeeId: string;
    permanentRole: string;
    progress: number;
    currentStep: string;
    executionPermission: string;
    blockedReason: string | null;
    nextAction: string;
  }>;
  employees: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    currentActivity: string | null;
    currentStep: string | null;
    progress: number;
    waitingFor: string | null;
    nextAction: string | null;
  }>;
  blockers: Array<{ workItemId: string; title: string; reason: string }>;
  risks: Array<{ id: string; summary: string; severity: string; mitigation: string }>;
  dependencies: Array<{
    id: string;
    fromWorkItemId: string;
    toWorkItemId: string;
    description: string;
  }>;
  assignments: Array<{
    employeeId: string;
    employeeName: string;
    permanentRole: string;
    workItemIds: string[];
    reason: string;
  }>;
  latestUpdate: string | null;
  morningReportTitle: string | null;
  finalReportTitle: string | null;
  /** Structured Daily Report from recorded state (null until filed). */
  dailyReport: DailyReportView | null;
};

export type CeoSprintProgressPanel = {
  active: {
    id: string;
    name: string;
    goal: string;
    status: string;
    progressPercent: number;
    velocity: number;
    blockedWorkItems: number;
    completedWorkItems: number;
    totalWorkItems: number;
  } | null;
  plannedCount: number;
  completedCount: number;
  items: CeoDashboardItemRef[];
};

export type CeoMeetingSummary = {
  id: string;
  title: string;
  kind: string;
  status: string;
  synthesis: string;
  workItemTitle: string | null;
  participantCount: number;
  href: string;
};

export type CeoRecentDecision = {
  id: string;
  summary: string;
  at: string;
  relatedType: string;
  relatedId: string;
  actorName: string;
  href: string;
};

export type CeoDashboardDrillResult = {
  section: CeoDashboardDrillSection;
  id: string;
  title: string;
  detail: Record<string, unknown>;
};

export type ExecutiveDashboard = {
  generatedAt: string;
  generatedAtDisplay: string;
  workspaceId: string;
  health: CompanyHealthSnapshot;
  risks: OperationalRisk[];
  workloads: WorkloadEntry[];
  approvalQueue: Array<{ id: string; title: string; owner: string; href: string }>;
  missionProgress: Array<{
    id: string;
    title: string;
    status: string;
    lead: string;
    href: string;
  }>;
  /** Open WorkPilot development tasks currently in flight. */
  activeWork: CeoDashboardItemRef[];
  /** Blocked / needs-clarification work needing CEO or peer attention. */
  blockedWork: CeoDashboardItemRef[];
  /** Real-time live work state for every employee. */
  liveWorkTracker: CeoLiveWorkPanel;
  /** CEO-controlled Daily Autonomous Operations. */
  dailyOps: CeoDailyOpsPanel;
  sprintProgress: CeoSprintProgressPanel;
  meetingSummaries: CeoMeetingSummary[];
  recentDecisions: CeoRecentDecision[];
  executionSuccessRate: number;
  connectorStatus: Array<{
    system: string;
    label: string;
    connected: boolean;
    reason: string | null;
  }>;
  memoryGrowth: {
    total: number;
    pending: number;
    accepted: number;
    avgConfidence: number;
  };
  workdayPerformance: {
    status: string;
    completed: number;
    failed: number;
    pending: number;
  };
  strategicRecommendations: PlanningRecommendation[];
  kpiHistory: KpiHistoryPoint[];
  latestWeeklyReport: ExecutiveReport | null;
  latestMonthlyReport: ExecutiveReport | null;
  safety: AiCeoSafetyGuarantees;
};
