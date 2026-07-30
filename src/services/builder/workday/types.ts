/**
 * Autonomous Workday v6 — CEO-facing contracts only.
 * No Builder Runtime / orchestrator terminology.
 */

export type WorkdayItemStatus =
  | "detected"
  | "planned"
  | "assigned"
  | "awaiting_approval"
  | "executing"
  | "completed"
  | "skipped"
  | "failed"
  | "stale"
  | "blocked"
  | "disconnected";

export type WorkdaySource =
  | "gmail"
  | "google_calendar"
  | "google_drive"
  | "crm"
  | "missions"
  | "approvals"
  | "executions"
  | "company";

export type WorkdayCategory =
  | "email"
  | "calendar"
  | "document"
  | "crm"
  | "mission"
  | "approval"
  | "integration";

export type WorkdayPriority = "P0" | "P1" | "P2" | "P3";

export type WorkdayDetectedItem = {
  id: string;
  /** Stable key used to prevent duplicate missions/executions. */
  sourceKey: string;
  source: WorkdaySource;
  category: WorkdayCategory;
  title: string;
  detail: string;
  urgency: number;
  impact: number;
  confidence: number;
  deadline: string | null;
  assignedEmployeeId: string;
  collaboratingEmployeeIds: string[];
  proposedAction: string;
  requiresCeoApproval: boolean;
  relatedMissionId: string | null;
  relatedExecutionId: string | null;
  status: WorkdayItemStatus;
  fingerprint: string;
};

export type MorningBriefRecommendation = {
  title: string;
  reason: string;
  confidence: number;
  assignedEmployeeName?: string;
};

export type MorningBrief = {
  generatedAt: string;
  topPriorities: MorningBriefRecommendation[];
  urgentEmails: string[];
  unansweredConversations: string[];
  calendarSchedule: string[];
  calendarConflicts: string[];
  meetingsNeedingPrep: string[];
  crmFollowUps: string[];
  pipelineRisks: string[];
  documentTasks: string[];
  overdueMissions: string[];
  pendingApprovals: string[];
  disconnectedIntegrations: string[];
  recommendedFirstAction: MorningBriefRecommendation | null;
  unavailableSources: string[];
  summary: string;
};

export type DailyPlanItem = {
  id: string;
  title: string;
  source: WorkdaySource;
  sourceKey: string;
  assignedEmployeeId: string;
  assignedEmployeeName: string;
  collaboratingEmployeeIds: string[];
  collaboratingEmployeeNames: string[];
  priority: WorkdayPriority;
  reason: string;
  deadline: string | null;
  confidence: number;
  proposedAction: string;
  requiresCeoApproval: boolean;
  relatedMissionId: string | null;
  relatedExecutionId: string | null;
  status: WorkdayItemStatus;
};

export type EndOfDayReport = {
  generatedAt: string;
  completed: string[];
  skipped: string[];
  failed: string[];
  stale: string[];
  pending: string[];
  blocked: string[];
  learningNote: string;
  summary: string;
  fullyCompleted: boolean;
};

export type AutonomousWorkdayStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "partial";

export type AutonomousWorkday = {
  id: string;
  date: string;
  workspaceId: string;
  status: AutonomousWorkdayStatus;
  detectedItems: WorkdayDetectedItem[];
  plan: DailyPlanItem[];
  morningBrief: MorningBrief | null;
  endOfDayReport: EndOfDayReport | null;
  recommendationIds: string[];
  approvalIds: string[];
  executionIds: string[];
  /** Fingerprint of source snapshot at start/refresh — used for stale detection. */
  dataFingerprint: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WorkdayStoreShape = {
  workdays: AutonomousWorkday[];
};
