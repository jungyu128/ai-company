/**
 * Company Analytics — real-time + historical HQ OS metrics (observe-only).
 */

export type AnalyticsDimension =
  | "company"
  | "employee"
  | "team"
  | "sprint"
  | "work_item";

export type TrendPoint = {
  at: string;
  value: number;
  label?: string;
};

export type EmployeeProductivity = {
  employeeId: string;
  employeeName: string;
  department: string;
  role: string;
  completed: number;
  active: number;
  blocked: number;
  productivityPercent: number;
  avgCompletionHours: number | null;
};

export type WorkDistributionSlice = {
  key: string;
  label: string;
  count: number;
  percent: number;
};

export type RecurringBlocker = {
  key: string;
  label: string;
  count: number;
  exampleWorkItemIds: string[];
};

export type CompanyAnalyticsKpis = {
  employeeProductivityAvg: number;
  avgWorkCompletionHours: number | null;
  sprintVelocity: number;
  blockedWorkCount: number;
  meetingEfficiencyPercent: number;
  approvalTurnaroundHours: number | null;
  qaPassRatePercent: number | null;
  qaFailRatePercent: number | null;
  companyHealthScore: number;
  activeWorkCount: number;
  completedWorkCount: number;
};

export type CompanyAnalyticsSnapshot = {
  id: string;
  workspaceId: string;
  at: string;
  dimension: AnalyticsDimension;
  dimensionId: string | null;
  kpis: CompanyAnalyticsKpis;
  employees: EmployeeProductivity[];
  workDistribution: {
    byEmployee: WorkDistributionSlice[];
    byTeam: WorkDistributionSlice[];
    byStatus: WorkDistributionSlice[];
  };
  blockedTrend: TrendPoint[];
  recurringBlockers: RecurringBlocker[];
  sprint: {
    activeSprintId: string | null;
    activeSprintName: string | null;
    velocity: number;
    progressPercent: number;
    completed: number;
    total: number;
  };
  meetings: {
    total: number;
    withDecisions: number;
    awaitingCeo: number;
    efficiencyPercent: number;
    avgActionItems: number;
  };
  approvals: {
    pending: number;
    decided: number;
    avgTurnaroundHours: number | null;
  };
  qa: {
    pass: number;
    fail: number;
    passRatePercent: number | null;
    failRatePercent: number | null;
  };
  healthScore: number;
  healthLabel: string;
};

export type AnalyticsHistorySample = {
  id: string;
  workspaceId: string;
  at: string;
  kpis: CompanyAnalyticsKpis;
  healthScore: number;
  blockedWorkCount: number;
  sprintVelocity: number;
  qaPassRatePercent: number | null;
  approvalTurnaroundHours: number | null;
};

export type CompanyAnalyticsView = {
  snapshot: CompanyAnalyticsSnapshot;
  history: AnalyticsHistorySample[];
  trends: {
    health: TrendPoint[];
    blocked: TrendPoint[];
    velocity: TrendPoint[];
    productivity: TrendPoint[];
    qaPass: TrendPoint[];
    approvalTurnaround: TrendPoint[];
  };
};
