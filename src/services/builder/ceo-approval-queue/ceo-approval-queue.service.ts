/**
 * CEO Approval Queue — list every pending approval + route CEO decisions.
 */

import "server-only";

import path from "node:path";
import { getEmployeeDefinition } from "../ai-company-employees";
import { decideApproval, listApprovalCenter } from "../approval.service";
import {
  applyCeoDailyOpsAction,
  getDailyOpsSnapshot,
} from "../daily-ops/daily-ops.service";
import { getDailyOpsStore } from "../daily-ops/daily-ops.store";
import { formatHqDateTimeDisplay } from "../format-hq-display";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import type {
  CeoApprovalQueueDecision,
  CeoApprovalQueueItem,
  CeoApprovalQueueView,
} from "./types";

function resolveRoot(repoRoot?: string) {
  return path.resolve(repoRoot ?? process.cwd());
}

function risksForWorkItem(
  planRisks: Array<{ summary: string; relatedWorkItemIds: string[] }>,
  workItemId: string | null,
  extras: string[] = []
): string[] {
  const related = planRisks
    .filter(
      (r) =>
        !workItemId ||
        r.relatedWorkItemIds.length === 0 ||
        r.relatedWorkItemIds.includes(workItemId)
    )
    .map((r) => r.summary);
  const merged = [...extras, ...related];
  return merged.length > 0
    ? [...new Set(merged)].slice(0, 8)
    : ["Proceeding without CEO review may create irreversible outcomes"];
}

function latestApprovalReportBody(
  reports: Array<{ kind: string; body: Record<string, unknown>; createdAt: string }>,
  workItemId: string | null
): {
  requestedAction?: string;
  reason?: string;
  expectedImpact?: string;
  risks?: string[];
} | null {
  const match = reports
    .filter((r) => r.kind === "approval_request")
    .filter((r) => {
      if (!workItemId) return true;
      return r.body.workItemId === workItemId;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  if (!match) return null;
  return {
    requestedAction:
      typeof match.body.requestedAction === "string"
        ? match.body.requestedAction
        : undefined,
    reason: typeof match.body.reason === "string" ? match.body.reason : undefined,
    expectedImpact:
      typeof match.body.expectedImpact === "string"
        ? match.body.expectedImpact
        : undefined,
    risks: Array.isArray(match.body.risks)
      ? match.body.risks.filter((x): x is string => typeof x === "string")
      : undefined,
  };
}

export function listCeoApprovalQueue(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): CeoApprovalQueueView {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const items: CeoApprovalQueueItem[] = [];

  if (!isInternalAiCompanyEnabled()) {
    return { asOf: now, items: [], count: 0, protectedCount: 0 };
  }

  const snap = getDailyOpsSnapshot({ repoRoot: root, workspaceId, now });
  const store = getDailyOpsStore(root, workspaceId);
  const plan = snap.activePlan;
  const directive = snap.today;

  if (plan && directive) {
    const pendingReqs = plan.approvalRequirements.filter((a) => a.status === "pending");
    const seenProtectedWork = new Set<string>();

    for (const req of pendingReqs) {
      if (req.kind === "plan") {
        const lead =
          plan.employeeAssignments[0] ??
          null;
        const emp = lead
          ? getEmployeeDefinition(lead.employeeId)
          : null;
        items.push({
          id: `daq:${req.id}`,
          source: "daily_ops_plan",
          employee: {
            id: emp?.id ?? "company",
            name: emp?.name ?? "AI Company",
            role: emp?.role ?? "Planning",
          },
          requestedAction: `Approve Daily Execution Plan v${plan.planVersion}`,
          reason: `CEO directive “${directive.title}” proposed a company-wide plan that cannot start without approval.`,
          expectedImpact: plan.objectiveSummary,
          risks: risksForWorkItem(
            plan.risks,
            null,
            plan.risks.map((r) => r.summary)
          ),
          isProtected: false,
          status: "pending",
          createdAt: plan.createdAt,
          createdAtDisplay: formatHqDateTimeDisplay(plan.createdAt),
          planId: plan.id,
          workItemId: null,
          missionId: null,
          directiveId: directive.id,
          approvalRequirementId: req.id,
          protectedAction: null,
          title: directive.title,
        });
        continue;
      }

      if (req.kind === "work_item" && req.workItemId) {
        const work = plan.proposedWorkItems.find((w) => w.id === req.workItemId);
        if (!work || work.executionPermission === "GRANTED") continue;
        if (
          work.status === "REJECTED" ||
          work.status === "CANCELLED" ||
          work.status === "COMPLETED"
        ) {
          continue;
        }
        const emp = getEmployeeDefinition(work.assignedEmployeeId);
        const report = latestApprovalReportBody(store.reports, work.id);
        items.push({
          id: `daq:${req.id}`,
          source: "daily_ops_work_item",
          employee: {
            id: emp?.id ?? work.assignedEmployeeId,
            name: emp?.name ?? work.assignedEmployeeId,
            role: emp?.role ?? work.permanentRole,
          },
          requestedAction:
            report?.requestedAction ?? `Approve work: ${work.title}`,
          reason:
            report?.reason ??
            work.reasonForAssignment ??
            `Employee needs CEO grant before implementing “${work.title}”.`,
          expectedImpact: report?.expectedImpact ?? work.expectedOutput,
          risks: risksForWorkItem(
            plan.risks,
            work.id,
            report?.risks ?? work.acceptanceCriteria.slice(0, 3)
          ),
          isProtected: Boolean(work.pendingProtectedAction),
          status: "pending",
          createdAt: plan.updatedAt,
          createdAtDisplay: formatHqDateTimeDisplay(plan.updatedAt),
          planId: plan.id,
          workItemId: work.id,
          missionId: null,
          directiveId: directive.id,
          approvalRequirementId: req.id,
          protectedAction: work.pendingProtectedAction,
          title: work.title,
        });
        continue;
      }

      if (req.kind === "protected_action" && req.workItemId) {
        const work = plan.proposedWorkItems.find((w) => w.id === req.workItemId);
        if (!work?.pendingProtectedAction) continue;
        seenProtectedWork.add(work.id);
        const emp = getEmployeeDefinition(work.assignedEmployeeId);
        const report = latestApprovalReportBody(store.reports, work.id);
        items.push({
          id: `daq:${req.id}`,
          source: "protected_action",
          employee: {
            id: emp?.id ?? work.assignedEmployeeId,
            name: emp?.name ?? work.assignedEmployeeId,
            role: emp?.role ?? work.permanentRole,
          },
          requestedAction:
            report?.requestedAction ??
            `Execute protected action: ${work.pendingProtectedAction}`,
          reason:
            report?.reason ??
            work.pendingProtectedReason ??
            `Protected action ${work.pendingProtectedAction} is blocked until CEO approval.`,
          expectedImpact:
            report?.expectedImpact ??
            `Allow ${emp?.name ?? "employee"} to proceed with side-effecting work on “${work.title}”.`,
          risks: risksForWorkItem(plan.risks, work.id, [
            ...(report?.risks ?? []),
            "Protected side effects must not run without explicit CEO approval",
            "Rollback may be incomplete if applied prematurely",
          ]),
          isProtected: true,
          status: "pending",
          createdAt: plan.updatedAt,
          createdAtDisplay: formatHqDateTimeDisplay(plan.updatedAt),
          planId: plan.id,
          workItemId: work.id,
          missionId: null,
          directiveId: directive.id,
          approvalRequirementId: req.id,
          protectedAction: work.pendingProtectedAction,
          title: work.title,
        });
      }
    }

    // Defensive: surface protected work even if requirement row was missing.
    for (const work of plan.proposedWorkItems) {
      if (!work.pendingProtectedAction || seenProtectedWork.has(work.id)) continue;
      if (work.executionPermission !== "GRANTED" && work.status === "PROPOSED") {
        // Still covered by work_item approval; protected row optional until grant.
      }
      const already = items.some(
        (i) => i.source === "protected_action" && i.workItemId === work.id
      );
      if (already) continue;
      // Only show when work is approved/blocked waiting on protected clearance.
      if (
        work.executionPermission !== "GRANTED" &&
        work.status !== "BLOCKED" &&
        work.status !== "WORKING" &&
        work.status !== "PLANNING" &&
        work.status !== "APPROVED"
      ) {
        continue;
      }
      const emp = getEmployeeDefinition(work.assignedEmployeeId);
      const report = latestApprovalReportBody(store.reports, work.id);
      items.push({
        id: `daq:prot:${work.id}`,
        source: "protected_action",
        employee: {
          id: emp?.id ?? work.assignedEmployeeId,
          name: emp?.name ?? work.assignedEmployeeId,
          role: emp?.role ?? work.permanentRole,
        },
        requestedAction:
          report?.requestedAction ??
          `Execute protected action: ${work.pendingProtectedAction}`,
        reason:
          report?.reason ??
          work.pendingProtectedReason ??
          `Protected action ${work.pendingProtectedAction} requires CEO approval.`,
        expectedImpact:
          report?.expectedImpact ??
          `Unblock protected side effects for “${work.title}”.`,
        risks: risksForWorkItem(plan.risks, work.id, [
          ...(report?.risks ?? []),
          "Protected actions must never execute before approval",
        ]),
        isProtected: true,
        status: "pending",
        createdAt: plan.updatedAt,
        createdAtDisplay: formatHqDateTimeDisplay(plan.updatedAt),
        planId: plan.id,
        workItemId: work.id,
        missionId: null,
        directiveId: directive.id,
        approvalRequirementId: null,
        protectedAction: work.pendingProtectedAction,
        title: work.title,
      });
    }
  }

  for (const mission of listApprovalCenter(root, workspaceId)) {
    items.push({
      id: `mission:${mission.id}`,
      source: "mission",
      employee: mission.requestingEmployee,
      requestedAction: `Approve mission plan: ${mission.title}`,
      reason: mission.mission,
      expectedImpact: mission.planSummary,
      risks:
        mission.planSteps.length > 0
          ? mission.planSteps.slice(0, 5)
          : ["Mission execution may start after CEO approval"],
      isProtected: false,
      status: "pending",
      createdAt: mission.updatedAt,
      createdAtDisplay: formatHqDateTimeDisplay(mission.updatedAt),
      planId: null,
      workItemId: null,
      missionId: mission.id,
      directiveId: null,
      approvalRequirementId: null,
      protectedAction: null,
      title: mission.title,
    });
  }

  items.sort((a, b) => {
    if (a.isProtected !== b.isProtected) return a.isProtected ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return {
    asOf: now,
    items,
    count: items.length,
    protectedCount: items.filter((i) => i.isProtected).length,
  };
}

export async function decideCeoApprovalQueueItem(input: {
  id: string;
  decision: CeoApprovalQueueDecision;
  note?: string | null;
  actorUserId: string;
  actorName: string;
  actorIsCeo?: boolean;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): Promise<
  | { ok: true; queue: CeoApprovalQueueView; message: string }
  | { ok: false; code: string; message: string; status: number }
> {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const note = input.note?.trim() || null;

  const queue = listCeoApprovalQueue({ repoRoot: root, workspaceId, now });
  const item = queue.items.find((i) => i.id === input.id);
  if (!item) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Approval queue item not found",
      status: 404,
    };
  }

  if (input.decision === "request_changes" && !note) {
    return {
      ok: false,
      code: "INVALID",
      message: "A note is required when requesting changes",
      status: 400,
    };
  }

  if (item.source === "mission" && item.missionId) {
    const result = await decideApproval({
      missionId: item.missionId,
      decision: input.decision,
      note,
      repoRoot: root,
      workspaceId,
      actor: {
        userId: input.actorUserId,
        displayName: input.actorName,
        role: "owner",
      },
    });
    if (!result.ok) {
      return {
        ok: false,
        code: result.code,
        message: result.message,
        status: result.status,
      };
    }
    return {
      ok: true,
      queue: listCeoApprovalQueue({ repoRoot: root, workspaceId }),
      message: `Mission ${input.decision.replace(/_/g, " ")}.`,
    };
  }

  if (item.source === "daily_ops_plan" && item.planId) {
    const action =
      input.decision === "approve"
        ? ({ action: "approve_entire_plan" as const, planId: item.planId, note: note ?? undefined })
        : input.decision === "reject"
          ? ({ action: "reject_plan" as const, planId: item.planId, note: note ?? undefined })
          : ({
              action: "request_plan_changes" as const,
              planId: item.planId,
              note: note!,
            });
    const result = applyCeoDailyOpsAction({
      action,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorIsCeo: input.actorIsCeo !== false,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      queue: listCeoApprovalQueue({ repoRoot: root, workspaceId }),
      message: result.message,
    };
  }

  if (item.source === "daily_ops_work_item" && item.planId && item.workItemId) {
    const action =
      input.decision === "approve"
        ? ({
            action: "approve_selected_work_items" as const,
            planId: item.planId,
            workItemIds: [item.workItemId],
            note: note ?? undefined,
          })
        : input.decision === "reject"
          ? ({
              action: "reject_work_item" as const,
              planId: item.planId,
              workItemId: item.workItemId,
              note: note ?? undefined,
            })
          : ({
              action: "request_work_item_changes" as const,
              planId: item.planId,
              workItemId: item.workItemId,
              note: note!,
            });
    const result = applyCeoDailyOpsAction({
      action,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorIsCeo: input.actorIsCeo !== false,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      queue: listCeoApprovalQueue({ repoRoot: root, workspaceId }),
      message: result.message,
    };
  }

  if (item.source === "protected_action" && item.workItemId) {
    const action =
      input.decision === "approve"
        ? ({
            action: "approve_protected_action" as const,
            workItemId: item.workItemId,
            note: note ?? undefined,
          })
        : input.decision === "reject"
          ? ({
              action: "reject_protected_action" as const,
              workItemId: item.workItemId,
              note: note ?? undefined,
            })
          : ({
              action: "request_protected_action_changes" as const,
              workItemId: item.workItemId,
              note: note!,
            });
    const result = applyCeoDailyOpsAction({
      action,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorIsCeo: input.actorIsCeo !== false,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (!result.ok) return result;
    return {
      ok: true,
      queue: listCeoApprovalQueue({ repoRoot: root, workspaceId }),
      message: result.message,
    };
  }

  return {
    ok: false,
    code: "INVALID",
    message: "Unsupported approval queue item",
    status: 400,
  };
}
