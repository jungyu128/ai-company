/**
 * CEO-controlled Daily Autonomous Operations service.
 * Submitting a directive never starts implementation — only explicit CEO approvals do.
 */

import path from "node:path";
import { AI_COMPANY_EMPLOYEES, getEmployeeDefinition } from "../ai-company-employees";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { logOpsEvent } from "../hardening/ops-log";
import {
  applyWorkItemStatus,
  buildApprovalRequestReport,
  buildFinalDailyReport,
  buildMorningPlanReport,
  buildProgressReport,
  buildProposedPlan,
  clarifyDirectiveOutcome,
  dependenciesSatisfied,
  newDailyId,
  workSummaryCounts,
} from "./daily-ops.logic";
import {
  assertCanExecuteWorkItem,
  assertNotSelfApprove,
  rejectInferredApprovalFromText,
} from "./daily-ops.enforcement";
import {
  appendDailyAudit,
  appendReport,
  getDailyOpsStore,
  hasExecutionKey,
  registerExecutionKey,
  upsertDirective,
  upsertPlan,
} from "./daily-ops.store";
import {
  recordCompanyTimelineEvent,
  recordWorkStateTimelineTransition,
} from "../company-timeline";
import type {
  CeoDailyOpsAction,
  DailyDirective,
  DailyExecutionPlan,
  DailyOpsAuditEntry,
  DailyOpsSnapshot,
  DailyWorkItem,
} from "./types";

function resolveRoot(repoRoot?: string) {
  return path.resolve(repoRoot ?? process.cwd());
}

function audit(
  entry: Omit<DailyOpsAuditEntry, "id">,
  root: string,
  workspaceId: string
) {
  const full: DailyOpsAuditEntry = {
    ...entry,
    id: newDailyId("daud"),
  };
  appendDailyAudit(full, root, workspaceId);
  recordWorkspaceEvent({
    workspaceId,
    kind: "assignment",
    summary: entry.detail,
    actorUserId: entry.actorUserId,
    actorName: entry.actorName,
    actorRole: entry.actorRole,
    relatedType: "daily_ops",
    relatedId: entry.workItemId ?? entry.planId ?? entry.directiveId ?? full.id,
    status: entry.result,
    auditAction: entry.action,
    auditResult: entry.result,
    repoRoot: root,
  });
  return full;
}

export function getDailyOpsSnapshot(input?: {
  repoRoot?: string;
  workspaceId?: string;
  date?: string;
  now?: string;
}): DailyOpsSnapshot {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const date = input?.date ?? now.slice(0, 10);
  const store = getDailyOpsStore(root, workspaceId);

  const today =
    store.directives.find(
      (d) =>
        d.date === date &&
        !["CANCELLED", "REJECTED"].includes(d.status)
    ) ??
    store.directives.find((d) => d.date === date) ??
    null;

  const activePlan = today?.activePlanId
    ? store.plans.find((p) => p.id === today.activePlanId) ?? null
    : null;

  const items = activePlan?.proposedWorkItems ?? [];
  const approvalQueue =
    activePlan?.approvalRequirements.filter((a) => a.status === "pending") ?? [];

  const employees = AI_COMPANY_EMPLOYEES.map((emp) => {
    const active = items.find(
      (w) =>
        w.assignedEmployeeId === emp.id &&
        !["COMPLETED", "REJECTED", "CANCELLED", "PROPOSED"].includes(w.status)
    );
    const proposed = items.find(
      (w) => w.assignedEmployeeId === emp.id && w.status === "PROPOSED"
    );
    const w = active ?? proposed ?? null;
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      currentActivity: w
        ? `${w.status} · ${w.title}`
        : null,
      currentStep: w?.currentStep ?? null,
      progress: w?.progress ?? 0,
      dependencies: w?.dependencies ?? [],
      waitingFor:
        w?.status === "WAITING" || w?.status === "BLOCKED"
          ? w.blockedReason ?? "Waiting"
          : w?.pendingProtectedAction
            ? `CEO protected action: ${w.pendingProtectedAction}`
            : null,
      blockedReason: w?.blockedReason ?? null,
      nextAction: w?.nextAction ?? null,
      workItemId: w?.id ?? null,
    };
  });

  const reports = store.reports.filter((r) => r.directiveId === today?.id);
  const latestUpdate = store.audit[0]?.detail ?? null;

  return {
    asOf: now,
    today,
    activePlan,
    approvalQueue,
    workSummary: workSummaryCounts(items),
    employees,
    blockers: items
      .filter((w) => w.status === "BLOCKED")
      .map((w) => ({
        workItemId: w.id,
        title: w.title,
        reason: w.blockedReason ?? "Blocked",
      })),
    latestUpdate,
    latestMorningReport:
      reports.find((r) => r.kind === "morning_plan") ?? null,
    latestProgressReport:
      reports.find((r) => r.kind === "progress") ?? null,
    latestFinalReport:
      reports.find((r) => r.kind === "final_daily") ?? null,
    recentAudit: store.audit.filter((a) => a.directiveId === today?.id).slice(0, 30),
  };
}

export function submitDailyDirective(input: {
  title: string;
  instruction: string;
  intendedOutcome?: string;
  constraints?: string[];
  priority?: DailyDirective["priority"];
  date?: string;
  actorUserId: string;
  actorName: string;
  organizationId?: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; directive: DailyDirective }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return { ok: false, code: "DISABLED", message: "AI Company disabled", status: 403 };
  }
  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const date = input.date ?? now.slice(0, 10);

  const fake = rejectInferredApprovalFromText(input.instruction);
  // Instruction may contain words like "approved" as content — still never grants execution.
  void fake;

  const directive: DailyDirective = {
    id: newDailyId("ddir"),
    organizationId: input.organizationId ?? workspaceId,
    date,
    title: input.title.trim() || "Daily Directive",
    instruction: input.instruction.trim(),
    intendedOutcome: (input.intendedOutcome ?? "").trim(),
    constraints: input.constraints ?? [],
    priority: input.priority ?? "P1",
    status: "DRAFT",
    createdBy: input.actorUserId,
    createdAt: now,
    updatedAt: now,
    activePlanId: null,
    paused: false,
    analysisNotes: null,
    clarifiedOutcome: null,
  };

  upsertDirective(directive, root, workspaceId);
  audit(
    {
      at: now,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: "owner",
      action: "daily_ops.submit_directive",
      directiveId: directive.id,
      planId: null,
      workItemId: null,
      detail: `CEO submitted Daily Directive "${directive.title}" — analysis/planning only; no implementation started.`,
      result: "ok",
    },
    root,
    workspaceId
  );
  recordCompanyTimelineEvent({
    kind: "directive_submitted",
    summary: `Directive submitted: ${directive.title}`,
    at: now,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorRole: "owner",
    directiveId: directive.id,
    repoRoot: root,
    workspaceId,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "daily_ops.submit_directive",
    executionStatus: "planning_only",
  });

  return { ok: true, directive };
}

export function analyzeAndProposePlan(input: {
  directiveId: string;
  actorUserId: string;
  actorName: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  changeNote?: string | null;
}):
  | { ok: true; directive: DailyDirective; plan: DailyExecutionPlan }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return { ok: false, code: "DISABLED", message: "AI Company disabled", status: 403 };
  }
  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const store = getDailyOpsStore(root, workspaceId);
  const directive = store.directives.find((d) => d.id === input.directiveId);
  if (!directive) {
    return { ok: false, code: "NOT_FOUND", message: "Directive not found", status: 404 };
  }
  if (["CANCELLED", "REJECTED", "COMPLETED"].includes(directive.status)) {
    return {
      ok: false,
      code: "INVALID",
      message: `Cannot plan for directive in status ${directive.status}`,
      status: 400,
    };
  }

  // Mark analyzing
  let nextDir: DailyDirective = {
    ...directive,
    status: "ANALYZING",
    updatedAt: now,
  };
  upsertDirective(nextDir, root, workspaceId);

  const clarified = clarifyDirectiveOutcome(nextDir);
  nextDir = {
    ...nextDir,
    clarifiedOutcome: clarified.clarifiedOutcome,
    analysisNotes: clarified.analysisNotes,
    status: "PLAN_PROPOSED",
    updatedAt: now,
  };

  // Supersede prior mutable plans
  const priorPlans = store.plans.filter(
    (p) => p.directiveId === directive.id && p.status !== "SUPERSEDED"
  );
  let version = 1;
  for (const p of priorPlans) {
    version = Math.max(version, p.planVersion + 1);
    if (!p.immutable) {
      upsertPlan(
        {
          ...p,
          status: "SUPERSEDED",
          updatedAt: now,
          supersededByPlanId: "pending",
        },
        root,
        workspaceId
      );
    } else if (
      p.status === "APPROVED" ||
      p.status === "PARTIALLY_APPROVED"
    ) {
      // Material change after approval → supersede and require new approval
      upsertPlan(
        {
          ...p,
          status: "SUPERSEDED",
          updatedAt: now,
          supersededByPlanId: "pending",
        },
        root,
        workspaceId
      );
    }
  }

  const plan = buildProposedPlan({
    directive: nextDir,
    planVersion: version,
    now,
    changeNote: input.changeNote,
  });
  plan.status = "AWAITING_APPROVAL";

  // Fix superseded pointers
  for (const p of getDailyOpsStore(root, workspaceId).plans) {
    if (
      p.directiveId === directive.id &&
      p.status === "SUPERSEDED" &&
      p.supersededByPlanId === "pending"
    ) {
      upsertPlan({ ...p, supersededByPlanId: plan.id }, root, workspaceId);
    }
  }

  upsertPlan(plan, root, workspaceId);
  nextDir = {
    ...nextDir,
    activePlanId: plan.id,
    status: "AWAITING_APPROVAL",
    updatedAt: now,
  };
  upsertDirective(nextDir, root, workspaceId);

  const morning = buildMorningPlanReport({
    directive: nextDir,
    plan,
    now,
  });
  appendReport(morning, root, workspaceId);

  audit(
    {
      at: now,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorUserId.startsWith("emp-") ? "ai_employee" : "owner",
      action: "daily_ops.analyze_and_propose",
      directiveId: nextDir.id,
      planId: plan.id,
      workItemId: null,
      detail: `Proposed Daily Execution Plan v${plan.planVersion} — awaiting CEO approval. No implementation started.`,
      result: "ok",
    },
    root,
    workspaceId
  );

  for (const assign of plan.employeeAssignments) {
    recordCompanyTimelineEvent({
      kind: "work_assigned",
      summary: `Work assigned to ${assign.employeeName} (${assign.permanentRole})`,
      at: now,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: "system",
      directiveId: nextDir.id,
      planId: plan.id,
      employeeId: assign.employeeId,
      repoRoot: root,
      workspaceId,
    });
  }
  recordCompanyTimelineEvent({
    kind: "approval_requested",
    summary: `Approval requested for Daily Execution Plan v${plan.planVersion}`,
    at: now,
    actorUserId: null,
    actorName: "AI Company",
    actorRole: "system",
    directiveId: nextDir.id,
    planId: plan.id,
    repoRoot: root,
    workspaceId,
  });

  return { ok: true, directive: nextDir, plan };
}

function findPlan(
  planId: string,
  root: string,
  workspaceId: string
): DailyExecutionPlan | null {
  return getDailyOpsStore(root, workspaceId).plans.find((p) => p.id === planId) ?? null;
}

function findDirective(
  directiveId: string,
  root: string,
  workspaceId: string
): DailyDirective | null {
  return (
    getDailyOpsStore(root, workspaceId).directives.find((d) => d.id === directiveId) ??
    null
  );
}

function grantWorkItems(
  plan: DailyExecutionPlan,
  ids: Set<string> | "all",
  now: string
): DailyExecutionPlan {
  const items = plan.proposedWorkItems.map((w) => {
    const selected = ids === "all" || ids.has(w.id);
    if (!selected) {
      if (w.executionPermission === "GRANTED") return w;
      return applyWorkItemStatus(w, "AWAITING_APPROVAL", now, {
        approvalState: "pending",
      });
    }
    return applyWorkItemStatus(w, "APPROVED", now, {
      approvalState: "approved",
      executionPermission: "GRANTED",
    });
  });

  const approvalRequirements = plan.approvalRequirements.map((a) => {
    if (a.kind === "plan") {
      return {
        ...a,
        status:
          ids === "all" ? ("approved" as const) : ("approved" as const),
      };
    }
    if (a.kind === "protected_action") {
      // Plan/work grants never clear protected-action approvals.
      return a;
    }
    if (a.workItemId && (ids === "all" || ids.has(a.workItemId))) {
      return { ...a, status: "approved" as const };
    }
    if (a.workItemId && ids !== "all" && !ids.has(a.workItemId)) {
      return a.status === "approved" ? a : { ...a, status: "pending" as const };
    }
    return a;
  });

  const allGranted = items.every(
    (w) =>
      w.executionPermission === "GRANTED" ||
      w.status === "REJECTED" ||
      w.status === "CANCELLED"
  );
  const anyGranted = items.some((w) => w.executionPermission === "GRANTED");

  return {
    ...plan,
    proposedWorkItems: items,
    approvalRequirements,
    status: allGranted
      ? "APPROVED"
      : anyGranted
        ? "PARTIALLY_APPROVED"
        : plan.status,
    immutable: anyGranted,
    updatedAt: now,
  };
}

export function applyCeoDailyOpsAction(input: {
  action: CeoDailyOpsAction;
  actorUserId: string;
  actorName: string;
  actorIsCeo?: boolean;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; snapshot: DailyOpsSnapshot; message: string }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return { ok: false, code: "DISABLED", message: "AI Company disabled", status: 403 };
  }
  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const actorIsCeo = input.actorIsCeo !== false;
  const action = input.action;

  if (action.action === "submit_directive") {
    const res = submitDailyDirective({
      ...action,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (!res.ok) return res;
    // Auto-analyze into proposed plan (still no execution)
    const proposed = analyzeAndProposePlan({
      directiveId: res.directive.id,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (!proposed.ok) return proposed;
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "Directive submitted and plan proposed — awaiting CEO approval before any implementation.",
    };
  }

  if (action.action === "analyze_and_propose") {
    const res = analyzeAndProposePlan({
      directiveId: action.directiveId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (!res.ok) return res;
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "Plan proposed — awaiting CEO approval.",
    };
  }

  if (action.action === "approve_entire_plan") {
    if (!actorIsCeo) {
      return { ok: false, code: "DENIED", message: "Only CEO may approve plans", status: 403 };
    }
    const plan = findPlan(action.planId, root, workspaceId);
    if (!plan) {
      return { ok: false, code: "NOT_FOUND", message: "Plan not found", status: 404 };
    }
    if (plan.immutable && plan.status === "APPROVED") {
      return {
        ok: false,
        code: "INVALID",
        message: "Plan already approved and immutable — request changes for a new version",
        status: 400,
      };
    }
    const updated = grantWorkItems(plan, "all", now);
    upsertPlan(updated, root, workspaceId);
    const dir = findDirective(plan.directiveId, root, workspaceId);
    if (dir) {
      upsertDirective(
        {
          ...dir,
          status: "APPROVED",
          updatedAt: now,
          activePlanId: updated.id,
        },
        root,
        workspaceId
      );
    }
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: "daily_ops.approve_entire_plan",
        directiveId: plan.directiveId,
        planId: plan.id,
        workItemId: null,
        detail: `CEO approved entire Daily Execution Plan v${plan.planVersion}${action.note ? `: ${action.note}` : ""}`,
        result: "ok",
      },
      root,
      workspaceId
    );
    recordCompanyTimelineEvent({
      kind: "approval_granted",
      summary: `Approval granted for entire plan v${plan.planVersion}`,
      at: now,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: "owner",
      directiveId: plan.directiveId,
      planId: plan.id,
      repoRoot: root,
      workspaceId,
    });
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "Entire plan approved. Approved work may now execute.",
    };
  }

  if (action.action === "approve_selected_work_items") {
    if (!actorIsCeo) {
      return { ok: false, code: "DENIED", message: "Only CEO may approve work items", status: 403 };
    }
    const plan = findPlan(action.planId, root, workspaceId);
    if (!plan) {
      return { ok: false, code: "NOT_FOUND", message: "Plan not found", status: 404 };
    }
    const ids = new Set(action.workItemIds);
    for (const id of ids) {
      const item = plan.proposedWorkItems.find((w) => w.id === id);
      if (!item) {
        return { ok: false, code: "NOT_FOUND", message: `Work item ${id} not found`, status: 404 };
      }
      const self = assertNotSelfApprove({
        actorUserId: input.actorUserId,
        actorIsCeo,
        workItem: item,
      });
      if (!self.ok) {
        return { ok: false, code: self.code, message: self.message, status: 403 };
      }
    }
    // Preserve previously granted items + newly selected
    const already = new Set(
      plan.proposedWorkItems
        .filter((w) => w.executionPermission === "GRANTED")
        .map((w) => w.id)
    );
    for (const id of ids) already.add(id);
    const updated = grantWorkItems(plan, already, now);
    // Mark non-selected still-pending items as AWAITING_APPROVAL / keep REJECTED
    updated.proposedWorkItems = updated.proposedWorkItems.map((w) => {
      if (already.has(w.id)) return w;
      if (w.status === "REJECTED" || w.status === "CANCELLED") return w;
      return applyWorkItemStatus(w, "AWAITING_APPROVAL", now, {
        approvalState: "pending",
        executionPermission: "DENIED",
      });
    });
    upsertPlan(updated, root, workspaceId);
    const dir = findDirective(plan.directiveId, root, workspaceId);
    if (dir) {
      upsertDirective(
        {
          ...dir,
          status: "PARTIALLY_APPROVED",
          updatedAt: now,
        },
        root,
        workspaceId
      );
    }
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: "daily_ops.approve_selected_work_items",
        directiveId: plan.directiveId,
        planId: plan.id,
        workItemId: null,
        detail: `CEO approved selected work items: ${[...ids].join(", ")}`,
        result: "ok",
      },
      root,
      workspaceId
    );
    recordCompanyTimelineEvent({
      kind: "approval_granted",
      summary: `Approval granted for ${ids.size} selected work item(s)`,
      at: now,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: "owner",
      directiveId: plan.directiveId,
      planId: plan.id,
      repoRoot: root,
      workspaceId,
    });
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "Selected work items approved. Unapproved items remain DENIED.",
    };
  }

  if (action.action === "request_plan_changes") {
    if (!actorIsCeo) {
      return { ok: false, code: "DENIED", message: "Only CEO may request plan changes", status: 403 };
    }
    const plan = findPlan(action.planId, root, workspaceId);
    if (!plan) {
      return { ok: false, code: "NOT_FOUND", message: "Plan not found", status: 404 };
    }
    upsertPlan(
      {
        ...plan,
        status: "CHANGES_REQUESTED",
        updatedAt: now,
        immutable: false,
      },
      root,
      workspaceId
    );
    const reproposed = analyzeAndProposePlan({
      directiveId: plan.directiveId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      repoRoot: root,
      workspaceId,
      now,
      changeNote: action.note,
    });
    if (!reproposed.ok) return reproposed;
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: "daily_ops.request_plan_changes",
        directiveId: plan.directiveId,
        planId: reproposed.plan.id,
        workItemId: null,
        detail: `CEO requested plan changes — new plan v${reproposed.plan.planVersion} requires approval. Note: ${action.note}`,
        result: "ok",
      },
      root,
      workspaceId
    );
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "New plan version proposed — prior approvals do not carry over.",
    };
  }

  if (action.action === "reject_plan") {
    if (!actorIsCeo) {
      return { ok: false, code: "DENIED", message: "Only CEO may reject plans", status: 403 };
    }
    const plan = findPlan(action.planId, root, workspaceId);
    if (!plan) {
      return { ok: false, code: "NOT_FOUND", message: "Plan not found", status: 404 };
    }
    const rejectedItems = plan.proposedWorkItems.map((w) =>
      applyWorkItemStatus(w, "REJECTED", now, {
        approvalState: "rejected",
        executionPermission: "DENIED",
      })
    );
    upsertPlan(
      {
        ...plan,
        proposedWorkItems: rejectedItems,
        status: "REJECTED",
        updatedAt: now,
        immutable: true,
        approvalRequirements: plan.approvalRequirements.map((a) => ({
          ...a,
          status: "rejected" as const,
        })),
      },
      root,
      workspaceId
    );
    const dir = findDirective(plan.directiveId, root, workspaceId);
    if (dir) {
      upsertDirective(
        { ...dir, status: "REJECTED", updatedAt: now },
        root,
        workspaceId
      );
    }
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: "daily_ops.reject_plan",
        directiveId: plan.directiveId,
        planId: plan.id,
        workItemId: null,
        detail: `CEO rejected plan v${plan.planVersion}${action.note ? `: ${action.note}` : ""}`,
        result: "ok",
      },
      root,
      workspaceId
    );
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "Plan rejected — no work may execute.",
    };
  }

  if (action.action === "pause_execution" || action.action === "resume_execution") {
    const dir = findDirective(action.directiveId, root, workspaceId);
    if (!dir) {
      return { ok: false, code: "NOT_FOUND", message: "Directive not found", status: 404 };
    }
    const paused = action.action === "pause_execution";
    upsertDirective(
      {
        ...dir,
        paused,
        status: paused
          ? "BLOCKED"
          : dir.status === "BLOCKED"
            ? "EXECUTING"
            : dir.status,
        updatedAt: now,
      },
      root,
      workspaceId
    );
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: `daily_ops.${action.action}`,
        directiveId: dir.id,
        planId: dir.activePlanId,
        workItemId: null,
        detail: paused
          ? `CEO paused daily execution${action.note ? `: ${action.note}` : ""}`
          : `CEO resumed daily execution${action.note ? `: ${action.note}` : ""}`,
        result: "ok",
      },
      root,
      workspaceId
    );
    recordCompanyTimelineEvent({
      kind: paused ? "blocked" : "resumed",
      summary: paused
        ? `Execution blocked (CEO pause)${action.note ? `: ${action.note}` : ""}`
        : `Execution resumed${action.note ? `: ${action.note}` : ""}`,
      at: now,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: "owner",
      directiveId: dir.id,
      planId: dir.activePlanId,
      repoRoot: root,
      workspaceId,
    });
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: paused ? "Execution paused." : "Execution resumed.",
    };
  }

  if (action.action === "cancel_directive") {
    const dir = findDirective(action.directiveId, root, workspaceId);
    if (!dir) {
      return { ok: false, code: "NOT_FOUND", message: "Directive not found", status: 404 };
    }
    upsertDirective(
      { ...dir, status: "CANCELLED", paused: true, updatedAt: now },
      root,
      workspaceId
    );
    if (dir.activePlanId) {
      const plan = findPlan(dir.activePlanId, root, workspaceId);
      if (plan) {
        upsertPlan(
          {
            ...plan,
            proposedWorkItems: plan.proposedWorkItems.map((w) =>
              w.status === "COMPLETED"
                ? w
                : applyWorkItemStatus(w, "CANCELLED", now, {
                    executionPermission: "DENIED",
                  })
            ),
            updatedAt: now,
          },
          root,
          workspaceId
        );
      }
    }
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: "daily_ops.cancel_directive",
        directiveId: dir.id,
        planId: dir.activePlanId,
        workItemId: null,
        detail: `CEO cancelled directive${action.note ? `: ${action.note}` : ""}`,
        result: "ok",
      },
      root,
      workspaceId
    );
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "Directive cancelled.",
    };
  }

  if (
    action.action === "approve_protected_action" ||
    action.action === "reject_protected_action" ||
    action.action === "request_protected_action_changes"
  ) {
    if (!actorIsCeo) {
      return {
        ok: false,
        code: "DENIED",
        message: "Only CEO may decide protected actions",
        status: 403,
      };
    }
    const store = getDailyOpsStore(root, workspaceId);
    let found: { plan: DailyExecutionPlan; item: DailyWorkItem } | null = null;
    for (const plan of store.plans) {
      const item = plan.proposedWorkItems.find((w) => w.id === action.workItemId);
      if (item) {
        found = { plan, item };
        break;
      }
    }
    if (!found) {
      return { ok: false, code: "NOT_FOUND", message: "Work item not found", status: 404 };
    }
    const { plan, item } = found;
    if (action.action === "approve_protected_action") {
      if (!item.pendingProtectedAction) {
        return {
          ok: false,
          code: "INVALID",
          message: "No protected action pending",
          status: 400,
        };
      }
      const cleared = applyWorkItemStatus(item, item.status === "BLOCKED" ? "WORKING" : item.status, now, {
        pendingProtectedAction: null,
        pendingProtectedReason: null,
        blockedReason: null,
      });
      const items = plan.proposedWorkItems.map((w) =>
        w.id === cleared.id ? cleared : w
      );
      upsertPlan(
        {
          ...plan,
          proposedWorkItems: items,
          updatedAt: now,
          approvalRequirements: plan.approvalRequirements.map((a) =>
            a.kind === "protected_action" && a.workItemId === item.id
              ? { ...a, status: "approved" as const }
              : a
          ),
        },
        root,
        workspaceId
      );
      appendReport(
        buildApprovalRequestReport({
          directiveId: plan.directiveId,
          planId: plan.id,
          workItemId: item.id,
          requestedAction: `approve_protected:${item.pendingProtectedAction}`,
          reason: action.note ?? "CEO approved protected action",
          expectedImpact: "Protected side-effect may proceed under existing work-item grant",
          risks: ["Irreversible side effects if misapplied"],
          rollback: "Follow WorkPilot execution safety rollback procedures",
          responsibleEmployeeId: item.assignedEmployeeId,
          requiredReviewers: item.requiredReviewers,
          now,
        }),
        root,
        workspaceId
      );
      audit(
        {
          at: now,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          actorRole: "owner",
          action: "daily_ops.approve_protected_action",
          directiveId: plan.directiveId,
          planId: plan.id,
          workItemId: item.id,
          detail: `CEO approved protected action on ${item.title}`,
          result: "ok",
        },
        root,
        workspaceId
      );
      recordCompanyTimelineEvent({
        kind: "approval_granted",
        summary: `Approval granted for protected action on ${item.title}`,
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        directiveId: plan.directiveId,
        planId: plan.id,
        workItemId: item.id,
        employeeId: item.assignedEmployeeId,
        repoRoot: root,
        workspaceId,
      });
      if (item.status === "BLOCKED") {
        recordCompanyTimelineEvent({
          kind: "resumed",
          summary: `${getEmployeeDefinition(item.assignedEmployeeId)?.name ?? item.assignedEmployeeId} resumed · ${item.title}`,
          at: now,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          actorRole: "owner",
          directiveId: plan.directiveId,
          planId: plan.id,
          workItemId: item.id,
          employeeId: item.assignedEmployeeId,
          repoRoot: root,
          workspaceId,
        });
      }
    } else if (action.action === "request_protected_action_changes") {
      if (!item.pendingProtectedAction) {
        return {
          ok: false,
          code: "INVALID",
          message: "No protected action pending",
          status: 400,
        };
      }
      const blocked = applyWorkItemStatus(item, "BLOCKED", now, {
        blockedReason: `CEO requested changes: ${action.note}`,
        pendingProtectedAction: item.pendingProtectedAction,
        pendingProtectedReason: action.note,
      });
      const items = plan.proposedWorkItems.map((w) =>
        w.id === blocked.id ? blocked : w
      );
      upsertPlan(
        {
          ...plan,
          proposedWorkItems: items,
          updatedAt: now,
          approvalRequirements: plan.approvalRequirements.map((a) =>
            a.kind === "protected_action" && a.workItemId === item.id
              ? {
                  ...a,
                  status: "pending" as const,
                  summary: `Revise protected action after CEO note: ${action.note}`,
                }
              : a
          ),
        },
        root,
        workspaceId
      );
      audit(
        {
          at: now,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          actorRole: "owner",
          action: "daily_ops.request_protected_action_changes",
          directiveId: plan.directiveId,
          planId: plan.id,
          workItemId: item.id,
          detail: `CEO requested changes on protected action for ${item.title}: ${action.note}`,
          result: "ok",
        },
        root,
        workspaceId
      );
    } else {
      const blocked = applyWorkItemStatus(item, "BLOCKED", now, {
        blockedReason: action.note ?? "Protected action rejected by CEO",
        pendingProtectedAction: item.pendingProtectedAction,
      });
      const items = plan.proposedWorkItems.map((w) =>
        w.id === blocked.id ? blocked : w
      );
      upsertPlan(
        {
          ...plan,
          proposedWorkItems: items,
          updatedAt: now,
          approvalRequirements: plan.approvalRequirements.map((a) =>
            a.kind === "protected_action" && a.workItemId === item.id
              ? { ...a, status: "rejected" as const }
              : a
          ),
        },
        root,
        workspaceId
      );
      audit(
        {
          at: now,
          actorUserId: input.actorUserId,
          actorName: input.actorName,
          actorRole: "owner",
          action: "daily_ops.reject_protected_action",
          directiveId: plan.directiveId,
          planId: plan.id,
          workItemId: item.id,
          detail: `CEO rejected protected action on ${item.title}`,
          result: "ok",
        },
        root,
        workspaceId
      );
    }
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message:
        action.action === "approve_protected_action"
          ? "Protected action approved."
          : action.action === "request_protected_action_changes"
            ? "Changes requested — protected action remains blocked until re-approved."
            : "Protected action rejected — work remains blocked.",
    };
  }

  if (action.action === "reject_work_item" || action.action === "request_work_item_changes") {
    if (!actorIsCeo) {
      return {
        ok: false,
        code: "DENIED",
        message: "Only CEO may decide work-item approvals",
        status: 403,
      };
    }
    const plan = findPlan(action.planId, root, workspaceId);
    if (!plan) {
      return { ok: false, code: "NOT_FOUND", message: "Plan not found", status: 404 };
    }
    const item = plan.proposedWorkItems.find((w) => w.id === action.workItemId);
    if (!item) {
      return { ok: false, code: "NOT_FOUND", message: "Work item not found", status: 404 };
    }
    const rejecting = action.action === "reject_work_item";
    const updated = applyWorkItemStatus(
      item,
      rejecting ? "REJECTED" : "AWAITING_APPROVAL",
      now,
      {
        approvalState: rejecting ? "rejected" : "changes_requested",
        executionPermission: "DENIED",
        blockedReason: rejecting
          ? action.note ?? "Rejected by CEO"
          : `CEO requested changes: ${action.note}`,
        nextAction: rejecting
          ? "Closed — rejected by CEO"
          : "Revise proposal for CEO re-approval",
      }
    );
    const items = plan.proposedWorkItems.map((w) =>
      w.id === updated.id ? updated : w
    );
    upsertPlan(
      {
        ...plan,
        proposedWorkItems: items,
        updatedAt: now,
        approvalRequirements: plan.approvalRequirements.map((a) =>
          a.kind === "work_item" && a.workItemId === item.id
            ? {
                ...a,
                status: rejecting
                  ? ("rejected" as const)
                  : ("changes_requested" as const),
              }
            : a
        ),
      },
      root,
      workspaceId
    );
    // Request-changes keeps a pending queue entry so CEO can re-approve later.
    if (!rejecting) {
      const refreshed = findPlan(action.planId, root, workspaceId)!;
      upsertPlan(
        {
          ...refreshed,
          approvalRequirements: [
            ...refreshed.approvalRequirements.filter(
              (a) => !(a.kind === "work_item" && a.workItemId === item.id)
            ),
            {
              id: `apr-chg-${item.id}-${Date.now().toString(36)}`,
              kind: "work_item",
              workItemId: item.id,
              protectedAction: null,
              summary: `Re-approve after changes: ${item.title} — ${action.note}`,
              status: "pending",
            },
          ],
          updatedAt: now,
        },
        root,
        workspaceId
      );
    }
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: rejecting
          ? "daily_ops.reject_work_item"
          : "daily_ops.request_work_item_changes",
        directiveId: plan.directiveId,
        planId: plan.id,
        workItemId: item.id,
        detail: rejecting
          ? `CEO rejected work item ${item.title}`
          : `CEO requested changes on ${item.title}: ${action.note}`,
        result: "ok",
      },
      root,
      workspaceId
    );
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: rejecting
        ? "Work item rejected — execution remains DENIED."
        : "Changes requested — execution remains DENIED until re-approved.",
    };
  }

  if (action.action === "advance_approved_work") {
    const res = advanceApprovedDailyWork({
      directiveId: action.directiveId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (!res.ok) return res;
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: res.message,
    };
  }

  if (action.action === "complete_directive") {
    const dir = findDirective(action.directiveId, root, workspaceId);
    if (!dir?.activePlanId) {
      return { ok: false, code: "NOT_FOUND", message: "Directive/plan not found", status: 404 };
    }
    const plan = findPlan(dir.activePlanId, root, workspaceId);
    if (!plan) {
      return { ok: false, code: "NOT_FOUND", message: "Plan not found", status: 404 };
    }
    const final = buildFinalDailyReport({ directive: dir, plan, now });
    appendReport(final, root, workspaceId);
    upsertDirective(
      { ...dir, status: "COMPLETED", updatedAt: now },
      root,
      workspaceId
    );
    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "owner",
        action: "daily_ops.complete_directive",
        directiveId: dir.id,
        planId: plan.id,
        workItemId: null,
        detail: `Final daily report filed for "${dir.title}"`,
        result: "ok",
      },
      root,
      workspaceId
    );
    return {
      ok: true,
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      message: "Final daily report submitted.",
    };
  }

  return { ok: false, code: "INVALID", message: "Unknown action", status: 400 };
}

/**
 * Advance only CEO-approved work one discrete step. Never starts unapproved items.
 * Idempotent via execution keys.
 */
export function advanceApprovedDailyWork(input: {
  directiveId: string;
  actorUserId: string;
  actorName: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; advanced: string[]; blocked: string[]; message: string }
  | { ok: false; code: string; message: string; status: number } {
  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const dir = findDirective(input.directiveId, root, workspaceId);
  if (!dir?.activePlanId) {
    return { ok: false, code: "NOT_FOUND", message: "Directive not found", status: 404 };
  }
  const plan = findPlan(dir.activePlanId, root, workspaceId);
  if (!plan) {
    return { ok: false, code: "NOT_FOUND", message: "Plan not found", status: 404 };
  }

  const advanced: string[] = [];
  const blocked: string[] = [];
  let items = [...plan.proposedWorkItems];

  for (const item of items) {
    if (item.executionPermission !== "GRANTED") continue;
    if (["COMPLETED", "REJECTED", "CANCELLED"].includes(item.status)) continue;

    if (dir.paused) {
      blocked.push(item.id);
      continue;
    }

    if (!dependenciesSatisfied(item, items)) {
      const waiting = applyWorkItemStatus(item, "WAITING", now, {
        blockedReason: "Dependencies incomplete",
      });
      items = items.map((w) => (w.id === item.id ? waiting : w));
      blocked.push(item.id);
      continue;
    }

    const nextStatus =
      item.status === "APPROVED"
        ? "PLANNING"
        : item.status === "PLANNING"
          ? "WORKING"
          : item.status === "WORKING"
            ? "REVIEWING"
            : item.status === "REVIEWING"
              ? "QA"
              : item.status === "QA"
                ? "COMPLETED"
                : item.status === "WAITING"
                  ? "WORKING"
                  : item.status === "BLOCKED" && !item.pendingProtectedAction
                    ? "WORKING"
                    : null;

    if (!nextStatus) {
      if (item.status === "BLOCKED" && item.pendingProtectedAction) {
        blocked.push(item.id);
      }
      continue;
    }

    // Implementation / side-effect transitions require full gate.
    const needsStrictGate =
      nextStatus === "WORKING" ||
      nextStatus === "REVIEWING" ||
      nextStatus === "QA" ||
      nextStatus === "COMPLETED";

    if (needsStrictGate) {
      const gate = assertCanExecuteWorkItem({
        directive: dir,
        plan,
        workItem: item,
        allWorkItems: items,
        // Protected actions must never execute before explicit CEO approval.
        requireProtectedCleared: true,
      });
      if (!gate.ok) {
        if (gate.code === "PROTECTED_ACTION_REQUIRED") {
          const paused = applyWorkItemStatus(item, "BLOCKED", now, {
            blockedReason: gate.message,
          });
          items = items.map((w) => (w.id === item.id ? paused : w));
          blocked.push(item.id);
          appendReport(
            buildApprovalRequestReport({
              directiveId: dir.id,
              planId: plan.id,
              workItemId: item.id,
              requestedAction: `protected:${item.pendingProtectedAction}`,
              reason: item.pendingProtectedReason ?? gate.message,
              expectedImpact: "Enable side-effecting step for approved work item",
              risks: ["Side effects without rollback if mishandled"],
              rollback: "Do not apply side effects until CEO approves",
              responsibleEmployeeId: item.assignedEmployeeId,
              requiredReviewers: item.requiredReviewers,
              now,
            }),
            root,
            workspaceId
          );
          recordCompanyTimelineEvent({
            kind: "blocked",
            summary: `${getEmployeeDefinition(item.assignedEmployeeId)?.name ?? item.assignedEmployeeId} blocked · ${item.title}`,
            at: now,
            actorName:
              getEmployeeDefinition(item.assignedEmployeeId)?.name ??
              item.assignedEmployeeId,
            actorRole: "ai_employee",
            directiveId: dir.id,
            planId: plan.id,
            workItemId: item.id,
            employeeId: item.assignedEmployeeId,
            repoRoot: root,
            workspaceId,
          });
          recordCompanyTimelineEvent({
            kind: "approval_requested",
            summary: `Approval requested for protected action on ${item.title}`,
            at: now,
            actorUserId: null,
            actorName: "AI Company",
            actorRole: "system",
            directiveId: dir.id,
            planId: plan.id,
            workItemId: item.id,
            employeeId: item.assignedEmployeeId,
            repoRoot: root,
            workspaceId,
          });
          continue;
        }
        blocked.push(item.id);
        continue;
      }
    } else {
      // PLANNING is analysis-only — still require grant + role, not protected clear.
      const gate = assertCanExecuteWorkItem({
        directive: dir,
        plan,
        workItem: item,
        allWorkItems: items,
        requireProtectedCleared: false,
      });
      if (!gate.ok) {
        blocked.push(item.id);
        continue;
      }
    }

    const execKey = `${item.id}:${item.status}->${nextStatus}`;
    if (hasExecutionKey(execKey, root, workspaceId)) {
      continue; // idempotent — do not duplicate
    }

    let updated = applyWorkItemStatus(item, nextStatus, now);
    // Do not fabricate outputs or changed files on COMPLETED — only recorded artifacts belong in Daily Report.
    updated = { ...updated, lastExecutionKey: execKey };
    registerExecutionKey(execKey, root, workspaceId);
    items = items.map((w) => (w.id === item.id ? updated : w));
    advanced.push(item.id);

    audit(
      {
        at: now,
        actorUserId: input.actorUserId,
        actorName: input.actorName,
        actorRole: "system",
        action: "daily_ops.advance_work",
        directiveId: dir.id,
        planId: plan.id,
        workItemId: item.id,
        detail: `${getEmployeeDefinition(item.assignedEmployeeId)?.name ?? item.assignedEmployeeId}: ${item.status} → ${nextStatus} on "${item.title}"`,
        result: "ok",
      },
      root,
      workspaceId
    );
    recordWorkStateTimelineTransition({
      fromStatus: item.status,
      toStatus: nextStatus,
      employeeId: item.assignedEmployeeId,
      employeeName:
        getEmployeeDefinition(item.assignedEmployeeId)?.name ??
        item.assignedEmployeeId,
      workItemId: item.id,
      taskTitle: item.title,
      directiveId: dir.id,
      planId: plan.id,
      at: now,
      repoRoot: root,
      workspaceId,
    });
  }

  const nextPlan: DailyExecutionPlan = {
    ...plan,
    proposedWorkItems: items,
    updatedAt: now,
  };
  upsertPlan(nextPlan, root, workspaceId);

  const anyExec = items.some((w) =>
    ["PLANNING", "WORKING", "REVIEWING", "QA", "WAITING", "BLOCKED"].includes(
      w.status
    )
  );
  const anyBlocked = items.some((w) => w.status === "BLOCKED");
  upsertDirective(
    {
      ...dir,
      status: anyBlocked ? "BLOCKED" : anyExec ? "EXECUTING" : dir.status,
      updatedAt: now,
    },
    root,
    workspaceId
  );

  appendReport(
    buildProgressReport({
      directive: { ...dir, status: anyBlocked ? "BLOCKED" : "EXECUTING" },
      plan: nextPlan,
      now,
    }),
    root,
    workspaceId
  );

  // End of execution: when every granted item is terminal and at least one completed,
  // file the Daily Report from recorded state only.
  const granted = items.filter(
    (w) =>
      w.executionPermission === "GRANTED" &&
      w.status !== "REJECTED" &&
      w.status !== "CANCELLED"
  );
  const executionEnded =
    granted.length > 0 &&
    granted.every((w) => w.status === "COMPLETED" || w.status === "BLOCKED") &&
    granted.some((w) => w.status === "COMPLETED");
  if (executionEnded && (advanced.length > 0 || blocked.length > 0)) {
    appendReport(
      buildFinalDailyReport({
        directive: {
          ...dir,
          status: anyBlocked ? "BLOCKED" : "EXECUTING",
        },
        plan: nextPlan,
        now,
      }),
      root,
      workspaceId
    );
  }

  return {
    ok: true,
    advanced,
    blocked,
    message: executionEnded
      ? `Advanced ${advanced.length} item(s); ${blocked.length} blocked/waiting. Daily Report filed from recorded state.`
      : `Advanced ${advanced.length} item(s); ${blocked.length} blocked/waiting.`,
  };
}

/** Attempt to execute a work item — always runs enforcement (for tests / callers). */
export function tryExecuteDailyWorkItem(input: {
  workItemId: string;
  executionKey: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; workItem: DailyWorkItem }
  | { ok: false; code: string; message: string } {
  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const store = getDailyOpsStore(root, workspaceId);

  if (hasExecutionKey(input.executionKey, root, workspaceId)) {
    return { ok: false, code: "DUPLICATE_EXECUTION", message: "Execution key already applied" };
  }

  let found: { plan: DailyExecutionPlan; item: DailyWorkItem; dir: DailyDirective } | null =
    null;
  for (const plan of store.plans) {
    const item = plan.proposedWorkItems.find((w) => w.id === input.workItemId);
    if (item) {
      const dir = store.directives.find((d) => d.id === plan.directiveId);
      if (dir) found = { plan, item, dir };
      break;
    }
  }
  if (!found) return { ok: false, code: "NOT_FOUND", message: "Work item not found" };

  const gate = assertCanExecuteWorkItem({
    directive: found.dir,
    plan: found.plan,
    workItem: found.item,
    allWorkItems: found.plan.proposedWorkItems,
    requireProtectedCleared: true,
  });
  if (!gate.ok) return { ok: false, code: gate.code, message: gate.message };

  registerExecutionKey(input.executionKey, root, workspaceId);
  const updated = applyWorkItemStatus(found.item, "WORKING", now, {
    lastExecutionKey: input.executionKey,
  });
  const items = found.plan.proposedWorkItems.map((w) =>
    w.id === updated.id ? updated : w
  );
  upsertPlan(
    { ...found.plan, proposedWorkItems: items, updatedAt: now },
    root,
    workspaceId
  );
  return { ok: true, workItem: updated };
}

/**
 * Record real artifacts for a work item. Paths/outputs must come from actual execution —
 * callers must not pass invented expectedOutput strings.
 */
export function recordWorkItemArtifacts(input: {
  workItemId: string;
  outputs?: string[];
  changedFiles?: string[];
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; workItem: DailyWorkItem }
  | { ok: false; code: string; message: string } {
  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const store = getDailyOpsStore(root, workspaceId);

  const outputs = (input.outputs ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const changedFiles = (input.changedFiles ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  if (outputs.length === 0 && changedFiles.length === 0) {
    return {
      ok: false,
      code: "INVALID",
      message: "No recorded artifacts provided",
    };
  }

  for (const plan of store.plans) {
    const item = plan.proposedWorkItems.find((w) => w.id === input.workItemId);
    if (!item) continue;
    const updated: DailyWorkItem = {
      ...item,
      outputs: [...item.outputs, ...outputs],
      changedFiles: [...new Set([...(item.changedFiles ?? []), ...changedFiles])],
    };
    upsertPlan(
      {
        ...plan,
        proposedWorkItems: plan.proposedWorkItems.map((w) =>
          w.id === updated.id ? updated : w
        ),
        updatedAt: now,
      },
      root,
      workspaceId
    );
    return { ok: true, workItem: updated };
  }
  return { ok: false, code: "NOT_FOUND", message: "Work item not found" };
}
