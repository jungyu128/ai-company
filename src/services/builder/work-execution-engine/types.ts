/**
 * AI Company Work Execution Engine — lifecycle monitor over recorded execution state.
 * Never fabricates work items; only projects real daily-ops / WorkPilot / approval state.
 */

export type WorkLifecycleStageId =
  | "ceo_directive"
  | "company_brain"
  | "product_planning"
  | "architecture"
  | "task_breakdown"
  | "automatic_assignment"
  | "development"
  | "internal_reviews"
  | "qa"
  | "regression_tests"
  | "executive_recommendation"
  | "ceo_approval"
  | "merge_ready"
  | "deployment_ready";

export type WorkLifecycleStageStatus =
  | "not_started"
  | "active"
  | "completed"
  | "blocked"
  | "waiting_ceo";

export type WorkLifecycleStage = {
  id: WorkLifecycleStageId;
  label: string;
  status: WorkLifecycleStageStatus;
  detail: string | null;
  workItemIds: string[];
};

export type WorkExecutionItemView = {
  id: string;
  title: string;
  objective: string;
  ownerId: string;
  ownerName: string;
  permanentRole: string;
  status: string;
  progress: number;
  currentStep: string;
  nextAction: string;
  dependencies: string[];
  dependencyTitles: string[];
  acceptanceCriteria: string[];
  implementationPlan: string[];
  affectedModules: string[];
  estimatedEffort: string;
  risks: string[];
  testPlan: string[];
  reviewOwnerId: string;
  reviewOwnerName: string;
  qaOwnerId: string;
  qaOwnerName: string;
  executionPermission: string;
  pendingProtectedAction: string | null;
  blockedReason: string | null;
  changedFiles: string[];
  outputs: string[];
};

export type WorkpilotLifecycleLink = {
  id: string;
  title: string;
  status: string;
  branchName: string | null;
  prUrl: string | null;
  testSummary: string | null;
};

export type WorkExecutionEngineView = {
  generatedAt: string;
  generatedAtDisplay: string;
  /** True when at least one recorded directive/plan/work item exists. */
  hasRecordedWork: boolean;
  directive: {
    id: string;
    title: string;
    status: string;
    priority: string;
    paused: boolean;
  } | null;
  plan: {
    id: string;
    version: number;
    status: string;
    objectiveSummary: string;
  } | null;
  stages: WorkLifecycleStage[];
  workItems: WorkExecutionItemView[];
  collaborationNotes: string[];
  workpilotPackages: WorkpilotLifecycleLink[];
  protectedApprovalsPending: number;
  mergeReadyCount: number;
  /** Deployment is never automatic — only signals readiness / waiting CEO. */
  deploymentReady: boolean;
  deploymentBlockedReason: string | null;
  summary: string;
};
