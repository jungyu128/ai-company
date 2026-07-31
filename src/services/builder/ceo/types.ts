/**
 * AI CEO & Autonomous Company Operations v10 — contracts.
 * Product-facing only. AI CEO never performs external writes.
 */

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
  | "kpi";

export type CeoDashboardItemRef = {
  id: string;
  section: CeoDashboardDrillSection;
  title: string;
  subtitle: string;
  status: string;
  href: string;
  meta?: Record<string, string | number | null | undefined>;
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
