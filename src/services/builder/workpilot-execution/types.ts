/**
 * Controlled WorkPilot code execution — packages await CEO approval before any write.
 */

import type { WorkItemLink } from "../autonomous-company/types";

export type WorkpilotFileAction = "create" | "update" | "delete";

export type WorkpilotFileChange = {
  path: string;
  action: WorkpilotFileAction;
  content: string;
  previousContent?: string | null;
  reason: string;
};

export type WorkpilotTestResult = {
  id: string;
  name: string;
  command: string;
  status: "passed" | "failed" | "skipped" | "blocked";
  output: string;
};

export type WorkpilotExecutionStatus =
  | "preparing"
  | "awaiting_approval"
  | "blocked"
  | "changes_requested"
  | "delayed"
  | "rejected"
  | "approved"
  | "applying"
  | "succeeded"
  | "failed";

export type CeoWorkpilotExecutionDecision =
  | "approve"
  | "request_changes"
  | "reject"
  | "delay";

export type WorkpilotExecutionAuditEntry = {
  at: string;
  action: string;
  detail: string;
  actor: string;
};

/** Pre-approval package shown to the CEO. */
export type WorkpilotExecutionPackage = {
  id: string;
  workItem: WorkItemLink;
  employeeId: string;
  employeeName: string;
  goal: string;
  branchName: string;
  implementationPlan: string[];
  filesChanged: WorkpilotFileChange[];
  reasoning: string;
  risks: string[];
  testResults: WorkpilotTestResult[];
  rollbackPlan: string;
  status: WorkpilotExecutionStatus;
  ceoDecision: CeoWorkpilotExecutionDecision | null;
  ceoNote: string | null;
  blockerReason: string | null;
  prNumber: number | null;
  prUrl: string | null;
  commitShas: string[];
  audit: WorkpilotExecutionAuditEntry[];
  createdAt: string;
  updatedAt: string;
  delayedUntil: string | null;
  /** Fingerprint of planned content — stale detect optional. */
  planFingerprint: string;
};

export type WorkpilotExecutionPreview = {
  goal: string;
  filesChanged: Array<{ path: string; action: WorkpilotFileAction; reason: string }>;
  reasoning: string;
  risks: string[];
  testResults: WorkpilotTestResult[];
  rollbackPlan: string;
  workItem: WorkItemLink;
  branchName: string;
  implementationPlan: string[];
};

export type PrepareWorkpilotExecutionInput = {
  employeeId: string;
  workItem: WorkItemLink;
  goal: string;
  filesChanged: WorkpilotFileChange[];
  reasoning?: string;
  risks?: string[];
  implementationPlan?: string[];
  missingRequirements?: string[];
  /** Injected test runner for unit tests. */
  runTests?: (files: WorkpilotFileChange[]) => WorkpilotTestResult[];
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
};

export type WorkpilotGithubWriter = {
  createBranch: (input: {
    branch: string;
    approval: { ownerApproved: true; reason: string };
  }) => Promise<{ ref: string; sha: string }>;
  createOrUpdateFile: (input: {
    path: string;
    content: string;
    message: string;
    branch: string;
    approval: { ownerApproved: true; reason: string };
  }) => Promise<{ contentPath: string; commitSha: string; htmlUrl: string | null }>;
  createPullRequest: (input: {
    title: string;
    body: string;
    head: string;
    draft?: boolean;
    approval: { ownerApproved: true; reason: string };
  }) => Promise<{ number: number; htmlUrl: string }>;
};
