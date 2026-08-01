/**
 * AI Company Operating System v2 — types.
 * Closed loop: CEO Daily Directive → plan → collaborate → execute → review → report,
 * waiting only for real CEO decisions / dependencies. Never fabricates state.
 */

export type OsV2TimelineKind =
  | "mission"
  | "planning"
  | "discussion"
  | "review"
  | "approval"
  | "execution"
  | "completed"
  | "blocked"
  | "resume"
  | "deployment_ready";

export type CeoBriefingV2 = {
  generatedAt: string;
  generatedAtDisplay: string;
  headline: string;
  summary: string;
  /** Real delta from audit / timeline — never invented. */
  whatChanged: string[];
  currentBlockers: string[];
  risks: string[];
  decisionsNeeded: string[];
  employeesWaiting: Array<{
    employeeId: string;
    employeeName: string;
    waitingFor: string;
  }>;
  completedWork: string[];
  recommendedNextAction: string | null;
  /** Preserve legacy brief fields for UI compatibility. */
  highestPriorities: string[];
  opportunities: string[];
  pendingApprovals: string[];
  suggestedActions: string[];
};

export type OsV2LiveEmployeeState = {
  employeeId: string;
  employeeName: string;
  role: string;
  currentMission: string | null;
  currentTask: string | null;
  currentStep: string | null;
  progress: number;
  dependency: string[];
  blocker: string | null;
  waitingReason: string | null;
  estimatedCompletion: string | null;
  lastUpdate: string;
  workItemId: string | null;
  status: string | null;
};

export type OsV2CycleResult = {
  at: string;
  directiveId: string | null;
  advancedWorkItemIds: string[];
  blockedWorkItemIds: string[];
  briefing: CeoBriefingV2;
  liveEmployees: OsV2LiveEmployeeState[];
  timelineKindsEmitted: OsV2TimelineKind[];
};
