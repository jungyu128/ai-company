/**
 * CEO Approval Queue — unified pending approvals for HQ.
 * Every item exposes employee, requested action, reason, impact, and risks.
 */

export type CeoApprovalQueueSource =
  | "daily_ops_plan"
  | "daily_ops_work_item"
  | "protected_action"
  | "mission";

export type CeoApprovalQueueDecision =
  | "approve"
  | "reject"
  | "request_changes";

export type CeoApprovalQueueEmployee = {
  id: string;
  name: string;
  role: string;
};

export type CeoApprovalQueueItem = {
  id: string;
  source: CeoApprovalQueueSource;
  employee: CeoApprovalQueueEmployee;
  requestedAction: string;
  reason: string;
  expectedImpact: string;
  risks: string[];
  isProtected: boolean;
  status: "pending";
  createdAt: string;
  createdAtDisplay: string;
  planId: string | null;
  workItemId: string | null;
  missionId: string | null;
  directiveId: string | null;
  approvalRequirementId: string | null;
  protectedAction: string | null;
  title: string;
};

export type CeoApprovalQueueView = {
  asOf: string;
  items: CeoApprovalQueueItem[];
  count: number;
  protectedCount: number;
};
