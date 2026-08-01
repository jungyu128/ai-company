/**
 * CEO-controlled Daily Autonomous Operations — contracts.
 * Implementation never starts from directive submission alone.
 */

export type DailyDirectiveStatus =
  | "DRAFT"
  | "ANALYZING"
  | "PLAN_PROPOSED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "EXECUTING"
  | "BLOCKED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type DailyPlanStatus =
  | "DRAFT"
  | "PROPOSED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "CHANGES_REQUESTED"
  | "REJECTED"
  | "SUPERSEDED";

export type DailyWorkItemStatus =
  | "PROPOSED"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "PLANNING"
  | "WORKING"
  | "REVIEWING"
  | "QA"
  | "WAITING"
  | "BLOCKED"
  | "COMPLETED"
  | "REJECTED"
  | "CANCELLED";

export type ExecutionPermission = "DENIED" | "GRANTED";

export type DailyWorkApprovalState =
  | "none"
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type DailyDirectivePriority = "P0" | "P1" | "P2" | "P3";

export type ProtectedActionKind =
  | "code_or_file_modification"
  | "database_schema_change"
  | "external_message_or_email"
  | "production_deployment"
  | "destructive_action"
  | "financial_action"
  | "permission_change"
  | "role_change"
  | "release_action"
  | "irreversible_external_side_effect";

export type DailyDirective = {
  id: string;
  organizationId: string;
  date: string;
  title: string;
  instruction: string;
  intendedOutcome: string;
  constraints: string[];
  priority: DailyDirectivePriority;
  status: DailyDirectiveStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Active plan id (latest non-superseded). */
  activePlanId: string | null;
  paused: boolean;
  analysisNotes: string | null;
  clarifiedOutcome: string | null;
};

export type DailyWorkItem = {
  id: string;
  directiveId: string;
  planId: string;
  title: string;
  objective: string;
  assignedEmployeeId: string;
  permanentRole: string;
  reasonForAssignment: string;
  status: DailyWorkItemStatus;
  priority: DailyDirectivePriority;
  dependencies: string[];
  currentStep: string;
  /** Discrete progress 0–100 from actual status transitions only. */
  progress: number;
  expectedOutput: string;
  acceptanceCriteria: string[];
  /** Concrete implementation steps derived at plan time (never invented later). */
  implementationPlan: string[];
  /** Modules/areas expected to change — recorded at plan time only. */
  affectedModules: string[];
  /** Relative effort label from planning (S / M / L). */
  estimatedEffort: "S" | "M" | "L";
  /** Work-item-level risks recorded at plan time. */
  risks: string[];
  /** How verification will run — recorded at plan time. */
  testPlan: string[];
  /** Primary review owner (permanent employee id). */
  reviewOwnerId: string;
  /** Primary QA owner (permanent employee id). */
  qaOwnerId: string;
  requiredReviewers: string[];
  approvalState: DailyWorkApprovalState;
  executionPermission: ExecutionPermission;
  startedAt: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  nextAction: string;
  /** Protected action pending CEO if set. */
  pendingProtectedAction: ProtectedActionKind | null;
  pendingProtectedReason: string | null;
  outputs: string[];
  /** Paths recorded by real execution only — never inferred. */
  changedFiles: string[];
  /** Idempotency key for execution steps. */
  lastExecutionKey: string | null;
};

export type DailyEmployeeAssignment = {
  employeeId: string;
  employeeName: string;
  permanentRole: string;
  workItemIds: string[];
  reason: string;
};

export type DailyDependency = {
  id: string;
  fromWorkItemId: string;
  toWorkItemId: string;
  description: string;
};

export type DailyRisk = {
  id: string;
  summary: string;
  severity: "low" | "medium" | "high";
  mitigation: string;
  relatedWorkItemIds: string[];
};

export type DailyApprovalRequirement = {
  id: string;
  kind: "plan" | "work_item" | "protected_action";
  workItemId: string | null;
  protectedAction: ProtectedActionKind | null;
  summary: string;
  status: "pending" | "approved" | "rejected" | "changes_requested";
};

export type DailyExecutionPlan = {
  id: string;
  directiveId: string;
  objectiveSummary: string;
  assumptions: string[];
  proposedWorkItems: DailyWorkItem[];
  employeeAssignments: DailyEmployeeAssignment[];
  dependencies: DailyDependency[];
  risks: DailyRisk[];
  expectedOutputs: string[];
  successCriteria: string[];
  approvalRequirements: DailyApprovalRequirement[];
  estimatedSequence: string[];
  planVersion: number;
  status: DailyPlanStatus;
  createdAt: string;
  updatedAt: string;
  supersededByPlanId: string | null;
  /** Immutable snapshot marker once APPROVED / PARTIALLY_APPROVED. */
  immutable: boolean;
};

export type DailyReportKind =
  | "morning_plan"
  | "progress"
  | "approval_request"
  | "final_daily";

export type DailyReport = {
  id: string;
  directiveId: string;
  planId: string | null;
  kind: DailyReportKind;
  title: string;
  body: Record<string, unknown>;
  createdAt: string;
};

export type DailyOpsAuditEntry = {
  id: string;
  at: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: "owner" | "ai_employee" | "system";
  action: string;
  directiveId: string | null;
  planId: string | null;
  workItemId: string | null;
  detail: string;
  result: "ok" | "denied" | "failed";
};

export type DailyOpsStoreShape = {
  directives: DailyDirective[];
  plans: DailyExecutionPlan[];
  reports: DailyReport[];
  audit: DailyOpsAuditEntry[];
  /** Execution idempotency keys already applied. */
  executionKeys: string[];
};

export type CeoDailyOpsAction =
  | { action: "submit_directive"; title: string; instruction: string; intendedOutcome?: string; constraints?: string[]; priority?: DailyDirectivePriority; date?: string }
  | { action: "analyze_and_propose"; directiveId: string }
  | { action: "approve_entire_plan"; planId: string; note?: string }
  | { action: "approve_selected_work_items"; planId: string; workItemIds: string[]; note?: string }
  | { action: "request_plan_changes"; planId: string; note: string }
  | { action: "reject_plan"; planId: string; note?: string }
  | { action: "pause_execution"; directiveId: string; note?: string }
  | { action: "resume_execution"; directiveId: string; note?: string }
  | { action: "cancel_directive"; directiveId: string; note?: string }
  | { action: "approve_protected_action"; workItemId: string; note?: string }
  | { action: "reject_protected_action"; workItemId: string; note?: string }
  | { action: "request_protected_action_changes"; workItemId: string; note: string }
  | { action: "reject_work_item"; planId: string; workItemId: string; note?: string }
  | { action: "request_work_item_changes"; planId: string; workItemId: string; note: string }
  | { action: "advance_approved_work"; directiveId: string }
  | { action: "complete_directive"; directiveId: string };

export type DailyOpsSnapshot = {
  asOf: string;
  today: DailyDirective | null;
  activePlan: DailyExecutionPlan | null;
  approvalQueue: DailyApprovalRequirement[];
  workSummary: {
    proposed: number;
    awaitingApproval: number;
    approved: number;
    executing: number;
    blocked: number;
    completed: number;
    rejected: number;
  };
  employees: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    currentActivity: string | null;
    currentStep: string | null;
    progress: number;
    dependencies: string[];
    waitingFor: string | null;
    blockedReason: string | null;
    nextAction: string | null;
    workItemId: string | null;
  }>;
  blockers: Array<{ workItemId: string; title: string; reason: string }>;
  latestUpdate: string | null;
  latestMorningReport: DailyReport | null;
  latestProgressReport: DailyReport | null;
  latestFinalReport: DailyReport | null;
  recentAudit: DailyOpsAuditEntry[];
};

export type ExecutionGateResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "DIRECTIVE_NOT_APPROVED"
        | "PLAN_NOT_APPROVED"
        | "WORK_ITEM_NOT_APPROVED"
        | "EXECUTION_DENIED"
        | "ROLE_INELIGIBLE"
        | "DEPENDENCY_INCOMPLETE"
        | "PROTECTED_ACTION_REQUIRED"
        | "DIRECTIVE_PAUSED"
        | "DUPLICATE_EXECUTION"
        | "INVALID"
        | "NOT_FOUND";
      message: string;
    };
