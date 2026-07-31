import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import {
  applyCeoDailyOpsAction,
  getDailyOpsSnapshot,
  type CeoDailyOpsAction,
} from "@/services/builder/daily-ops";
import { dailyReportViewFromStored } from "@/services/builder/daily-report";
import type { CeoDailyOpsPanel } from "@/services/builder/ceo/types";

export const runtime = "nodejs";

function toPanel(
  snap: ReturnType<typeof getDailyOpsSnapshot>
): CeoDailyOpsPanel {
  return {
    asOf: snap.asOf,
    directive: snap.today
      ? {
          id: snap.today.id,
          title: snap.today.title,
          instruction: snap.today.instruction,
          status: snap.today.status,
          priority: snap.today.priority,
          clarifiedOutcome: snap.today.clarifiedOutcome,
          paused: snap.today.paused,
        }
      : null,
    plan: snap.activePlan
      ? {
          id: snap.activePlan.id,
          planVersion: snap.activePlan.planVersion,
          status: snap.activePlan.status,
          objectiveSummary: snap.activePlan.objectiveSummary,
          immutable: snap.activePlan.immutable,
        }
      : null,
    workSummary: snap.workSummary,
    approvalQueue: snap.approvalQueue.map((a) => ({
      id: a.id,
      kind: a.kind,
      summary: a.summary,
      workItemId: a.workItemId,
    })),
    workItems: (snap.activePlan?.proposedWorkItems ?? []).map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
      assignedEmployeeId: w.assignedEmployeeId,
      permanentRole: w.permanentRole,
      progress: w.progress,
      currentStep: w.currentStep,
      executionPermission: w.executionPermission,
      blockedReason: w.blockedReason,
      nextAction: w.nextAction,
    })),
    employees: snap.employees.map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      role: e.role,
      currentActivity: e.currentActivity,
      currentStep: e.currentStep,
      progress: e.progress,
      waitingFor: e.waitingFor,
      nextAction: e.nextAction,
    })),
    blockers: snap.blockers,
    risks: (snap.activePlan?.risks ?? []).map((r) => ({
      id: r.id,
      summary: r.summary,
      severity: r.severity,
      mitigation: r.mitigation,
    })),
    dependencies: (snap.activePlan?.dependencies ?? []).map((d) => ({
      id: d.id,
      fromWorkItemId: d.fromWorkItemId,
      toWorkItemId: d.toWorkItemId,
      description: d.description,
    })),
    assignments: (snap.activePlan?.employeeAssignments ?? []).map((a) => ({
      employeeId: a.employeeId,
      employeeName: a.employeeName,
      permanentRole: a.permanentRole,
      workItemIds: a.workItemIds,
      reason: a.reason,
    })),
    latestUpdate: snap.latestUpdate,
    morningReportTitle: snap.latestMorningReport?.title ?? null,
    finalReportTitle: snap.latestFinalReport?.title ?? null,
    dailyReport: dailyReportViewFromStored(snap.latestFinalReport),
  };
}

/**
 * GET /api/builder/hq/daily-ops
 */
export async function GET(request: Request) {
  const started = Date.now();
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "timeline.view",
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  const snap = getDailyOpsSnapshot({ workspaceId: access.ctx.workspaceId });
  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "daily_ops.get",
    durationMs: Date.now() - started,
  });
  return NextResponse.json({ ok: true, dailyOps: toPanel(snap), snapshot: snap });
}

/**
 * POST /api/builder/hq/daily-ops — CEO daily ops controls.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "approvals.decide",
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const actionName = String(body.action ?? "").trim();
  let action: CeoDailyOpsAction | null = null;

  switch (actionName) {
    case "submit_directive":
      action = {
        action: "submit_directive",
        title: String(body.title ?? "Daily Directive"),
        instruction: String(body.instruction ?? ""),
        intendedOutcome: body.intendedOutcome
          ? String(body.intendedOutcome)
          : undefined,
        priority: (body.priority as "P0" | "P1" | "P2" | "P3") || undefined,
      };
      break;
    case "analyze_and_propose":
      action = {
        action: "analyze_and_propose",
        directiveId: String(body.directiveId ?? ""),
      };
      break;
    case "approve_entire_plan":
      action = {
        action: "approve_entire_plan",
        planId: String(body.planId ?? ""),
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "approve_selected_work_items":
      action = {
        action: "approve_selected_work_items",
        planId: String(body.planId ?? ""),
        workItemIds: Array.isArray(body.workItemIds)
          ? body.workItemIds.map(String)
          : [],
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "request_plan_changes":
      action = {
        action: "request_plan_changes",
        planId: String(body.planId ?? ""),
        note: String(body.note ?? ""),
      };
      break;
    case "reject_plan":
      action = {
        action: "reject_plan",
        planId: String(body.planId ?? ""),
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "pause_execution":
      action = {
        action: "pause_execution",
        directiveId: String(body.directiveId ?? ""),
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "resume_execution":
      action = {
        action: "resume_execution",
        directiveId: String(body.directiveId ?? ""),
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "cancel_directive":
      action = {
        action: "cancel_directive",
        directiveId: String(body.directiveId ?? ""),
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "approve_protected_action":
      action = {
        action: "approve_protected_action",
        workItemId: String(body.workItemId ?? ""),
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "reject_protected_action":
      action = {
        action: "reject_protected_action",
        workItemId: String(body.workItemId ?? ""),
        note: body.note ? String(body.note) : undefined,
      };
      break;
    case "advance_approved_work":
      action = {
        action: "advance_approved_work",
        directiveId: String(body.directiveId ?? ""),
      };
      break;
    case "complete_directive":
      action = {
        action: "complete_directive",
        directiveId: String(body.directiveId ?? ""),
      };
      break;
    default:
      action = null;
  }

  if (!action) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "Unknown daily-ops action") },
      { status: 400 }
    );
  }

  const result = applyCeoDailyOpsAction({
    action,
    actorUserId: access.ctx.userId,
    actorName: access.ctx.displayName,
    actorIsCeo: true,
    workspaceId: access.ctx.workspaceId,
  });

  if (!result.ok) {
    logOpsEvent({
      outcome: "error",
      workspaceId: access.ctx.workspaceId,
      action: `daily_ops.${actionName}`,
      durationMs: Date.now() - started,
    });
    return NextResponse.json(
      { ok: false, ...publicApiError(result.code, result.message) },
      { status: result.status }
    );
  }

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: `daily_ops.${actionName}`,
    durationMs: Date.now() - started,
  });

  return NextResponse.json({
    ok: true,
    message: result.message,
    dailyOps: toPanel(result.snapshot),
    snapshot: result.snapshot,
  });
}
