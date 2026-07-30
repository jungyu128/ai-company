/**
 * Autonomous Workday v6 service — start, refresh, complete.
 * External writes always go through Execution Layer v5 + CEO approval.
 */

import { listApprovalCenter } from "../approval.service";
import { listCollaborations } from "../collaboration.store";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { computeLearningStats } from "../learning.logic";
import { listMissionOutcomes } from "../learning.store";
import { learnFromCompletedWorkday } from "../memory/memory.service";
import { listProactiveRecommendations } from "../proactive.store";
import {
  listExecutionHistory,
  listPendingExecutions,
  prepareExternalWorkForEmployee,
} from "../execution/execution.service";
import { getConnectionStatusesSync } from "../execution/connection-status";
import type { ConnectorSuite } from "../execution/types";
import type { ConnectorMode } from "../execution/connectors";
import {
  buildSourceFingerprint,
  detectWorkdayItems,
} from "./workday.detect";
import { buildMorningBrief, buildEndOfDayReport } from "./workday.brief";
import { buildDailyPlan, mergePlanIdempotent } from "./workday.plan";
import {
  getWorkdayByDate,
  getWorkdayById,
  upsertWorkday,
} from "./workday.store";
import type { AutonomousWorkday, DailyPlanItem } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function todayDate(now?: string) {
  return (now ?? nowIso()).slice(0, 10);
}

function newId(date: string) {
  return `workday-${date}`;
}

function gatherContext(repoRoot: string, workspaceId = "default") {
  const connections = getConnectionStatusesSync();
  const missions = listCollaborations(repoRoot, workspaceId);
  const approvals = listApprovalCenter(repoRoot, workspaceId);
  const executions = [
    ...listPendingExecutions(repoRoot, workspaceId),
    ...listExecutionHistory({ repoRoot, workspaceId, limit: 40 }),
  ];
  // dedupe executions by id
  const execMap = new Map(executions.map((e) => [e.id, e]));
  const uniqueExec = Array.from(execMap.values());
  const recommendations = listProactiveRecommendations(repoRoot, workspaceId);
  return {
    connections,
    missions,
    approvals,
    executions: uniqueExec,
    recommendations,
  };
}

function syncPlanFromExecutions(
  plan: DailyPlanItem[],
  executions: ReturnType<typeof gatherContext>["executions"]
): DailyPlanItem[] {
  const byId = new Map(executions.map((e) => [e.id, e]));
  return plan.map((item) => {
    if (!item.relatedExecutionId) return item;
    const exec = byId.get(item.relatedExecutionId);
    if (!exec) return item;
    if (exec.status === "succeeded") return { ...item, status: "completed" };
    if (exec.status === "failed") return { ...item, status: "failed" };
    if (exec.status === "stale") return { ...item, status: "stale" };
    if (exec.status === "rejected") return { ...item, status: "skipped" };
    if (exec.status === "awaiting_approval") return { ...item, status: "awaiting_approval" };
    if (exec.status === "executing") return { ...item, status: "executing" };
    if (exec.status === "disconnected") return { ...item, status: "disconnected" };
    return item;
  });
}

function markStaleIfFingerprintChanged(
  plan: DailyPlanItem[],
  previousFingerprint: string,
  nextFingerprint: string
): DailyPlanItem[] {
  if (previousFingerprint === nextFingerprint) return plan;
  return plan.map((item) => {
    if (["completed", "failed", "skipped"].includes(item.status)) return item;
    if (item.requiresCeoApproval && item.status === "awaiting_approval") {
      return { ...item, status: "stale" };
    }
    return item;
  });
}

/**
 * Start (or resume) today's workday. Idempotent per date + workspace.
 */
export async function startAutonomousWorkday(options?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  connectorMode?: ConnectorMode;
  connectors?: ConnectorSuite;
  /** When true, prepare execution previews for connected write-ready items. */
  preparePreviews?: boolean;
}): Promise<
  | { ok: true; workday: AutonomousWorkday; resumed: boolean }
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

  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? "default";
  const now = options?.now ?? nowIso();
  const date = todayDate(now);
  const existing = getWorkdayByDate(date, workspaceId, root);
  const ctx = gatherContext(root, workspaceId);
  const fingerprint = buildSourceFingerprint(ctx);
  const { items, unavailableSources } = detectWorkdayItems({ ...ctx, now });
  let plan = buildDailyPlan(items);

  if (existing) {
    plan = mergePlanIdempotent(existing.plan, plan);
    plan = markStaleIfFingerprintChanged(plan, existing.dataFingerprint, fingerprint);
    plan = syncPlanFromExecutions(plan, ctx.executions);

    const morningBrief = buildMorningBrief({
      items,
      plan,
      unavailableSources,
      now,
    });

    const updated: AutonomousWorkday = {
      ...existing,
      detectedItems: items,
      plan,
      morningBrief,
      dataFingerprint: fingerprint,
      recommendationIds: ctx.recommendations.map((r) => r.id),
      approvalIds: ctx.approvals.map((a) => a.id),
      executionIds: Array.from(
        new Set([
          ...existing.executionIds,
          ...ctx.executions.filter((e) => e.status === "awaiting_approval").map((e) => e.id),
        ])
      ),
      status:
        existing.status === "completed" || existing.status === "partial"
          ? existing.status
          : "in_progress",
      startedAt: existing.startedAt ?? now,
      updatedAt: now,
    };
    upsertWorkday(updated, root);
    return { ok: true, workday: updated, resumed: true };
  }

  // Fresh start — optionally prepare previews (never auto-write)
  const executionIds: string[] = [];
  if (options?.preparePreviews !== false) {
    const candidates = plan.filter(
      (p) =>
        p.requiresCeoApproval &&
        p.status !== "disconnected" &&
        !p.relatedExecutionId &&
        ["gmail", "google_calendar", "google_drive", "crm"].includes(p.source)
    );
    for (const item of candidates.slice(0, 5)) {
      const prepared = await prepareExternalWorkForEmployee({
        employeeId: item.assignedEmployeeId,
        missionId: item.relatedMissionId,
        requestedAction: item.proposedAction,
        params: { title: item.title, guidance: item.reason, note: item.reason },
        repoRoot: root,
        connectorMode: options?.connectorMode,
        connectors: options?.connectors,
      });
      if (prepared.ok && prepared.record) {
        executionIds.push(prepared.record.id);
        item.relatedExecutionId = prepared.record.id;
        item.status =
          prepared.record.status === "disconnected"
            ? "disconnected"
            : prepared.record.status === "awaiting_approval"
              ? "awaiting_approval"
              : item.status;
      }
    }
  }

  plan = syncPlanFromExecutions(plan, [
    ...ctx.executions,
    ...listPendingExecutions(root),
  ]);

  const morningBrief = buildMorningBrief({
    items,
    plan,
    unavailableSources,
    now,
  });

  const workday: AutonomousWorkday = {
    id: newId(date),
    date,
    workspaceId,
    status: "in_progress",
    detectedItems: items,
    plan,
    morningBrief,
    endOfDayReport: null,
    recommendationIds: ctx.recommendations.map((r) => r.id),
    approvalIds: ctx.approvals.map((a) => a.id),
    executionIds: Array.from(
      new Set([
        ...executionIds,
        ...ctx.executions.filter((e) => e.status === "awaiting_approval").map((e) => e.id),
      ])
    ),
    dataFingerprint: fingerprint,
    startedAt: now,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };

  upsertWorkday(workday, root);
  return { ok: true, workday, resumed: false };
}

export function getAutonomousWorkday(options?: {
  repoRoot?: string;
  workspaceId?: string;
  date?: string;
  workdayId?: string;
}): AutonomousWorkday | null {
  const root = options?.repoRoot ?? process.cwd();
  if (options?.workdayId) return getWorkdayById(options.workdayId, root);
  const date = options?.date ?? todayDate();
  return getWorkdayByDate(date, options?.workspaceId ?? "default", root);
}

/**
 * Refresh plan from live company/execution state; mark stale when sources changed.
 */
export function refreshAutonomousWorkday(options?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; workday: AutonomousWorkday }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  const root = options?.repoRoot ?? process.cwd();
  const now = options?.now ?? nowIso();
  const existing = getWorkdayByDate(
    todayDate(now),
    options?.workspaceId ?? "default",
    root
  );
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: "No workday started today", status: 404 };
  }

  const ctx = gatherContext(root, options?.workspaceId ?? "default");
  const fingerprint = buildSourceFingerprint(ctx);
  const { items, unavailableSources } = detectWorkdayItems({ ...ctx, now });
  let plan = mergePlanIdempotent(existing.plan, buildDailyPlan(items));
  plan = markStaleIfFingerprintChanged(plan, existing.dataFingerprint, fingerprint);
  plan = syncPlanFromExecutions(plan, ctx.executions);

  const updated: AutonomousWorkday = {
    ...existing,
    detectedItems: items,
    plan,
    morningBrief: buildMorningBrief({ items, plan, unavailableSources, now }),
    dataFingerprint: fingerprint,
    approvalIds: ctx.approvals.map((a) => a.id),
    executionIds: Array.from(
      new Set([
        ...existing.executionIds,
        ...ctx.executions.filter((e) => e.status === "awaiting_approval").map((e) => e.id),
      ])
    ),
    updatedAt: now,
  };
  upsertWorkday(updated, root);
  return { ok: true, workday: updated };
}

/**
 * Close the workday and emit an end-of-day report.
 * Partial failures never mark the workday as fully completed.
 */
export function completeAutonomousWorkday(options?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; workday: AutonomousWorkday }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  const root = options?.repoRoot ?? process.cwd();
  const now = options?.now ?? nowIso();
  const refreshed = refreshAutonomousWorkday({
    repoRoot: root,
    workspaceId: options?.workspaceId,
    now,
  });
  if (!refreshed.ok) return refreshed;

  const learning = computeLearningStats(listMissionOutcomes(root));
  const endOfDayReport = buildEndOfDayReport({
    plan: refreshed.workday.plan,
    learning,
    now,
  });

  const workday: AutonomousWorkday = {
    ...refreshed.workday,
    endOfDayReport,
    status: endOfDayReport.fullyCompleted ? "completed" : "partial",
    completedAt: now,
    updatedAt: now,
  };
  upsertWorkday(workday, root);

  // v7 — learn from verified workday outcomes (never bypasses CEO approval)
  learnFromCompletedWorkday({ workday, repoRoot: root, now });

  return { ok: true, workday };
}

export type { AutonomousWorkday };
