/**
 * Daily Report — end-of-execution summary from recorded company state only.
 * Never invents completed work, reviews, files, or outcomes.
 */

export type DailyReportWorkEntry = {
  id: string;
  title: string;
  status: string;
  progress: number;
  employeeId: string;
  employeeName: string;
  permanentRole: string;
  currentStep: string;
  blockedReason: string | null;
  /** Recorded outputs only (may be empty). */
  outputs: string[];
  completedAt: string | null;
};

export type DailyReportBlockerEntry = {
  workItemId: string;
  title: string;
  employeeName: string;
  reason: string;
};

export type DailyReportApprovalEntry = {
  id: string;
  kind: string;
  summary: string;
  status: string;
  workItemId: string | null;
  protectedAction: string | null;
};

export type DailyReportReviewEntry = {
  workItemId: string;
  title: string;
  status: string;
  employeeName: string;
  requiredReviewers: string[];
  /** Only true when status is COMPLETED (review cycle finished as recorded). */
  reviewCompleted: boolean;
};

export type DailyReportRiskEntry = {
  id: string;
  summary: string;
  severity: string;
  mitigation: string;
  relatedWorkItemIds: string[];
};

export type DailyReportBody = {
  generatedAt: string;
  directiveId: string;
  directiveTitle: string;
  planId: string;
  planVersion: number;
  /** Work items with status COMPLETED only. */
  completedWork: DailyReportWorkEntry[];
  /** Not COMPLETED / REJECTED / CANCELLED. */
  incompleteWork: DailyReportWorkEntry[];
  blockers: DailyReportBlockerEntry[];
  approvals: DailyReportApprovalEntry[];
  reviews: DailyReportReviewEntry[];
  /** Union of recorded changedFiles from COMPLETED items only. */
  changedFiles: string[];
  risks: DailyReportRiskEntry[];
  nextRecommendations: string[];
  integrity: {
    source: "recorded_state_only";
    completedCount: number;
    incompleteCount: number;
    note: string;
  };
};

export type DailyReportView = {
  id: string;
  title: string;
  createdAt: string;
  createdAtDisplay: string;
  body: DailyReportBody;
};
