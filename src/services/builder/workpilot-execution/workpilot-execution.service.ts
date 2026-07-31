/**
 * Controlled WorkPilot execution service.
 * Prepare → CEO preview → approve/request_changes/reject/delay → apply (no merge/deploy).
 */

import path from "node:path";
import { getEmployeeDefinition } from "../ai-company-employees";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { appendAudit, recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { logOpsEvent } from "../hardening/ops-log";
import {
  createBranch,
  createOrUpdateFile,
  createPullRequest,
} from "../../github";
import type { WorkItemLink } from "../autonomous-company/types";
import { appendAutonomyArtifacts } from "../autonomous-company/autonomous-company.store";
import type { CeoDevReport } from "../autonomous-company/types";
import { formatWorkItemLine } from "../autonomous-company/dev-ownership.logic";
import {
  assertNoForbiddenIntent,
  assertSafeExecutionPlan,
  approvalFromCeoNote,
  refuseMerge,
} from "./safety.logic";
import {
  buildExecutionPackage,
  evaluateBlockers,
  runDefaultPackageTests,
  suggestBranchName,
  toCeoPreview,
} from "./plan.logic";
import { applyApprovedPackage } from "./apply.logic";
import {
  getWorkpilotExecution,
  listAwaitingWorkpilotExecutions,
  listWorkpilotExecutions,
  upsertWorkpilotExecution,
} from "./workpilot-execution.store";
import type {
  CeoWorkpilotExecutionDecision,
  PrepareWorkpilotExecutionInput,
  WorkpilotExecutionPackage,
  WorkpilotExecutionPreview,
  WorkpilotGithubWriter,
} from "./types";

export type WorkpilotExecResult =
  | { ok: true; package: WorkpilotExecutionPackage; preview: WorkpilotExecutionPreview }
  | { ok: false; code: string; message: string; status: number };

function liveGithubWriter(): WorkpilotGithubWriter {
  return {
    createBranch: async ({ branch, approval }) =>
      createBranch({ branch, approval }),
    createOrUpdateFile: async (input) => createOrUpdateFile(input),
    createPullRequest: async (input) => {
      const pr = await createPullRequest(input);
      return { number: pr.number, htmlUrl: pr.htmlUrl };
    },
  };
}

function auditPkg(
  pkg: WorkpilotExecutionPackage,
  entry: { action: string; detail: string; actor: string; at: string }
): WorkpilotExecutionPackage {
  return {
    ...pkg,
    audit: [{ ...entry }, ...pkg.audit].slice(0, 100),
    updatedAt: entry.at,
  };
}

function createBlockerReport(input: {
  pkg: WorkpilotExecutionPackage;
  reason: string;
  now: string;
}): CeoDevReport {
  const workLine = formatWorkItemLine(input.pkg.workItem);
  return {
    id: `ceorep-block-${input.pkg.id}`,
    kind: "blocker",
    employeeId: input.pkg.employeeId,
    employeeName: input.pkg.employeeName,
    title: `Execution blocked: ${input.pkg.goal.slice(0, 80)}`,
    body: `${workLine}\n${input.reason}`,
    workItem: input.pkg.workItem,
    peerDiscussionId: null,
    taskId: null,
    requiresCeoDecision: true,
    createdAt: input.now,
    deliveredToChat: false,
  };
}

/**
 * Inspect + prepare a WorkPilot change package. Never writes to GitHub.
 */
export function prepareWorkpilotExecution(
  input: PrepareWorkpilotExecutionInput
): WorkpilotExecResult {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const emp = getEmployeeDefinition(input.employeeId);
  if (!emp) {
    return {
      ok: false,
      code: "UNKNOWN_EMPLOYEE",
      message: "Unknown employee",
      status: 404,
    };
  }

  if (!input.workItem?.id || !input.workItem?.title) {
    return {
      ok: false,
      code: "WORK_ITEM_REQUIRED",
      message: "Every execution must start from a tracked WorkPilot work item",
      status: 400,
    };
  }

  const now = input.now ?? new Date().toISOString();
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const goal = input.goal.trim();
  if (!goal) {
    return {
      ok: false,
      code: "GOAL_REQUIRED",
      message: "Execution goal is required",
      status: 400,
    };
  }

  try {
    assertNoForbiddenIntent(`${goal}\n${input.reasoning ?? ""}`);
  } catch (e) {
    return {
      ok: false,
      code: "FORBIDDEN_INTENT",
      message: e instanceof Error ? e.message : "Forbidden intent",
      status: 400,
    };
  }

  try {
    assertSafeExecutionPlan({
      branchName: suggestBranchName(input.workItem, input.employeeId),
      filesChanged: input.filesChanged,
      allowDeletes: false,
    });
  } catch (e) {
    return {
      ok: false,
      code: "UNSAFE_PLAN",
      message: e instanceof Error ? e.message : "Unsafe plan",
      status: 400,
    };
  }

  // Re-validate with real suggested branch via package build
  const testResults =
    input.runTests?.(input.filesChanged) ?? runDefaultPackageTests(input.filesChanged);

  const blockerReason = evaluateBlockers({
    workItem: input.workItem,
    goal,
    filesChanged: input.filesChanged,
    missingRequirements: input.missingRequirements,
    testResults,
  });

  let pkg = buildExecutionPackage({
    employeeId: input.employeeId,
    workItem: input.workItem,
    goal,
    filesChanged: input.filesChanged,
    reasoning: input.reasoning,
    risks: input.risks,
    implementationPlan: input.implementationPlan,
    testResults,
    now,
    status: blockerReason ? "blocked" : "awaiting_approval",
    blockerReason,
  });

  try {
    assertSafeExecutionPlan({
      branchName: pkg.branchName,
      filesChanged: pkg.filesChanged,
      allowDeletes: false,
    });
  } catch (e) {
    return {
      ok: false,
      code: "UNSAFE_PLAN",
      message: e instanceof Error ? e.message : "Unsafe plan",
      status: 400,
    };
  }

  if (blockerReason) {
    pkg = auditPkg(pkg, {
      at: now,
      action: "blocked",
      detail: blockerReason,
      actor: input.employeeId,
    });
    upsertWorkpilotExecution(pkg, root, workspaceId);
    appendAutonomyArtifacts({
      reports: [createBlockerReport({ pkg, reason: blockerReason, now })],
      repoRoot: root,
      workspaceId,
    });
    appendAudit(
      {
        workspaceId,
        actorUserId: input.employeeId,
        actorName: pkg.employeeName,
        actorRole: "ai_employee",
        action: "workpilot_execution.blocked",
        targetType: "execution",
        targetId: pkg.id,
        result: "failed",
        detail: blockerReason.slice(0, 240),
      },
      root
    );
    logOpsEvent({
      outcome: "error",
      workspaceId,
      action: "workpilot_execution.blocked",
      code: "BLOCKED",
      executionStatus: "blocked",
    });
    return { ok: true, package: pkg, preview: toCeoPreview(pkg) };
  }

  upsertWorkpilotExecution(pkg, root, workspaceId);
  recordWorkspaceEvent({
    workspaceId,
    kind: "execution",
    summary: `${pkg.employeeName} prepared WorkPilot execution: ${pkg.goal.slice(0, 80)}`,
    actorUserId: null,
    actorName: pkg.employeeName,
    actorRole: "ai_employee",
    relatedType: "workpilot_execution",
    relatedId: pkg.id,
    status: "awaiting_approval",
    auditAction: "workpilot_execution.prepare",
    auditResult: "ok",
    repoRoot: root,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "workpilot_execution.prepare",
    executionStatus: pkg.status,
  });

  return { ok: true, package: pkg, preview: toCeoPreview(pkg) };
}

/**
 * CEO decision gate. Approve applies branch/files/PR via GitHub (injectable writer).
 * Never merges or deploys.
 */
export async function decideWorkpilotExecution(input: {
  executionId: string;
  decision: CeoWorkpilotExecutionDecision;
  note?: string | null;
  delayUntil?: string | null;
  actor?: { userId: string; displayName: string; role: string };
  repoRoot?: string;
  workspaceId?: string;
  writer?: WorkpilotGithubWriter;
  now?: string;
}): Promise<WorkpilotExecResult> {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const actorName = input.actor?.displayName ?? "CEO";
  const actorId = input.actor?.userId ?? "ceo";

  let pkg = getWorkpilotExecution(input.executionId, root, workspaceId);
  if (!pkg) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Execution package not found",
      status: 404,
    };
  }

  if (pkg.status === "blocked") {
    return {
      ok: false,
      code: "BLOCKED",
      message: pkg.blockerReason ?? "Execution is blocked",
      status: 409,
    };
  }

  if (
    pkg.status !== "awaiting_approval" &&
    pkg.status !== "changes_requested" &&
    pkg.status !== "delayed"
  ) {
    return {
      ok: false,
      code: "INVALID_STATE",
      message: `Cannot decide package in status ${pkg.status}`,
      status: 409,
    };
  }

  if (input.decision === "reject") {
    pkg = {
      ...auditPkg(pkg, {
        at: now,
        action: "reject",
        detail: input.note?.trim() || "Rejected by CEO",
        actor: actorId,
      }),
      status: "rejected",
      ceoDecision: "reject",
      ceoNote: input.note ?? null,
    };
    upsertWorkpilotExecution(pkg, root, workspaceId);
    recordWorkspaceEvent({
      workspaceId,
      kind: "execution",
      summary: `CEO rejected WorkPilot execution ${pkg.id}`,
      actorUserId: actorId,
      actorName,
      actorRole: "owner",
      relatedType: "workpilot_execution",
      relatedId: pkg.id,
      status: "rejected",
      auditAction: "workpilot_execution.reject",
      auditResult: "ok",
      repoRoot: root,
    });
    return { ok: true, package: pkg, preview: toCeoPreview(pkg) };
  }

  if (input.decision === "request_changes") {
    pkg = {
      ...auditPkg(pkg, {
        at: now,
        action: "request_changes",
        detail: input.note?.trim() || "CEO requested changes",
        actor: actorId,
      }),
      status: "changes_requested",
      ceoDecision: "request_changes",
      ceoNote: input.note ?? null,
    };
    upsertWorkpilotExecution(pkg, root, workspaceId);
    recordWorkspaceEvent({
      workspaceId,
      kind: "execution",
      summary: `CEO requested changes on WorkPilot execution ${pkg.id}`,
      actorUserId: actorId,
      actorName,
      actorRole: "owner",
      relatedType: "workpilot_execution",
      relatedId: pkg.id,
      status: "changes_requested",
      auditAction: "workpilot_execution.request_changes",
      auditResult: "ok",
      repoRoot: root,
    });
    return { ok: true, package: pkg, preview: toCeoPreview(pkg) };
  }

  if (input.decision === "delay") {
    const delayUntil =
      input.delayUntil ??
      new Date(Date.now() + 24 * 3_600_000).toISOString();
    pkg = {
      ...auditPkg(pkg, {
        at: now,
        action: "delay",
        detail: `Delayed until ${delayUntil}`,
        actor: actorId,
      }),
      status: "delayed",
      ceoDecision: "delay",
      ceoNote: input.note ?? null,
      delayedUntil: delayUntil,
    };
    upsertWorkpilotExecution(pkg, root, workspaceId);
    recordWorkspaceEvent({
      workspaceId,
      kind: "execution",
      summary: `CEO delayed WorkPilot execution ${pkg.id}`,
      actorUserId: actorId,
      actorName,
      actorRole: "owner",
      relatedType: "workpilot_execution",
      relatedId: pkg.id,
      status: "delayed",
      auditAction: "workpilot_execution.delay",
      auditResult: "ok",
      repoRoot: root,
    });
    return { ok: true, package: pkg, preview: toCeoPreview(pkg) };
  }

  // approve
  let approval;
  try {
    approval = approvalFromCeoNote(input.note);
  } catch (e) {
    return {
      ok: false,
      code: "APPROVAL_INVALID",
      message: e instanceof Error ? e.message : "Invalid approval",
      status: 400,
    };
  }

  pkg = {
    ...auditPkg(pkg, {
      at: now,
      action: "approve",
      detail: "CEO approved — applying feature branch + PR (no merge)",
      actor: actorId,
    }),
    status: "applying",
    ceoDecision: "approve",
    ceoNote: input.note ?? null,
  };
  upsertWorkpilotExecution(pkg, root, workspaceId);

  try {
    // Hard refuse merge even if caller asks
    refuseMergeUnlessFalse(false);

    const applied = await applyApprovedPackage({
      pkg,
      approval,
      writer: input.writer ?? liveGithubWriter(),
      merge: false,
      deploy: false,
    });

    pkg = {
      ...auditPkg(pkg, {
        at: new Date().toISOString(),
        action: "applied",
        detail: `PR #${applied.prNumber ?? "?"} created with ${applied.commitShas.length} commit(s)`,
        actor: "system",
      }),
      status: "succeeded",
      prNumber: applied.prNumber,
      prUrl: applied.prUrl,
      commitShas: applied.commitShas,
    };
    upsertWorkpilotExecution(pkg, root, workspaceId);
    recordWorkspaceEvent({
      workspaceId,
      kind: "execution",
      summary: `WorkPilot execution applied (PR ${applied.prNumber}) — merge remains manual`,
      actorUserId: actorId,
      actorName,
      actorRole: "owner",
      relatedType: "workpilot_execution",
      relatedId: pkg.id,
      status: "succeeded",
      auditAction: "workpilot_execution.approve",
      auditResult: "ok",
      repoRoot: root,
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId,
      action: "workpilot_execution.approve",
      executionStatus: "succeeded",
      verificationResult: "passed",
    });
    return { ok: true, package: pkg, preview: toCeoPreview(pkg) };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Apply failed";
    pkg = {
      ...auditPkg(pkg, {
        at: new Date().toISOString(),
        action: "apply_failed",
        detail: message.slice(0, 240),
        actor: "system",
      }),
      status: "failed",
      blockerReason: message,
    };
    upsertWorkpilotExecution(pkg, root, workspaceId);
    appendAutonomyArtifacts({
      reports: [createBlockerReport({ pkg, reason: message, now })],
      repoRoot: root,
      workspaceId,
    });
    logOpsEvent({
      outcome: "error",
      workspaceId,
      action: "workpilot_execution.approve",
      executionStatus: "failed",
      code: "APPLY_FAILED",
      verificationResult: "failed",
    });
    return {
      ok: false,
      code: "APPLY_FAILED",
      message,
      status: 500,
    };
  }
}

function refuseMergeUnlessFalse(merge: boolean): void {
  if (merge) refuseMerge();
}

export function getWorkpilotExecutionPreview(
  executionId: string,
  repoRoot?: string,
  workspaceId?: string
): WorkpilotExecutionPreview | null {
  const pkg = getWorkpilotExecution(
    executionId,
    repoRoot,
    workspaceId ?? DEFAULT_WORKSPACE_ID
  );
  return pkg ? toCeoPreview(pkg) : null;
}

export {
  listWorkpilotExecutions,
  listAwaitingWorkpilotExecutions,
  getWorkpilotExecution,
  toCeoPreview,
};

/** Helper for autonomous tasks — prepare docs/plan package from a work item. */
export function preparePlanOnlyExecution(input: {
  employeeId: string;
  workItem: WorkItemLink;
  goal: string;
  planMarkdown: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): WorkpilotExecResult {
  return prepareWorkpilotExecution({
    employeeId: input.employeeId,
    workItem: input.workItem,
    goal: input.goal,
    reasoning: "Implementation plan prepared for CEO review before code writes.",
    filesChanged: [
      {
        path: `docs/ai-plans/${input.workItem.id.toLowerCase()}.md`,
        action: "create",
        content: input.planMarkdown,
        reason: "Implementation plan document",
      },
    ],
    implementationPlan: [
      "Document the approach",
      "Await CEO approval",
      "Then open a feature branch for code",
    ],
    missingRequirements: [],
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
    now: input.now,
  });
}
