/**
 * Company Analytics service — observe HQ OS state, record samples, query dimensions.
 * Does not alter Continuous OS work advancement, meetings, memory, sprint, calendar,
 * CEO approvals, routing, auth, or execution safety.
 */

import path from "node:path";
import { getAutonomyStore } from "../autonomous-company/autonomous-company.store";
import { listCollaborations } from "../collaboration.store";
import { readCeoStore } from "../ceo/ceo.store";
import { listExecutionHistory } from "../execution/execution.service";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { listCompanyMeetings } from "../meetings";
import {
  getCompanySprint,
  getSprintSnapshot,
} from "../sprints";
import { getEmployeeDefinition } from "../ai-company-employees";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { logOpsEvent } from "../hardening/ops-log";
import {
  buildCompanyAnalyticsSnapshot,
  filterTasksForDimension,
} from "./analytics.logic";
import {
  appendAnalyticsSample,
  listAnalyticsSamples,
} from "./analytics.store";
import type {
  AnalyticsDimension,
  AnalyticsHistorySample,
  CompanyAnalyticsSnapshot,
  CompanyAnalyticsView,
  TrendPoint,
} from "./types";

function gatherInputs(root: string, workspaceId: string, now: string) {
  const tasks = getAutonomyStore(root, workspaceId).tasks;
  const missions = listCollaborations(root, workspaceId);
  const meetings = listCompanyMeetings({
    repoRoot: root,
    workspaceId,
    limit: 80,
  });
  const executions = listExecutionHistory({
    repoRoot: root,
    workspaceId,
    limit: 120,
  });
  const sprintSnap = getSprintSnapshot({
    repoRoot: root,
    workspaceId,
    now,
  });
  const ceo = readCeoStore(workspaceId, root);
  const existingHealthScore = ceo.healthSnapshots[0]?.score ?? null;
  const history = listAnalyticsSamples(root, workspaceId, 40);
  const blockedTrend: TrendPoint[] = [
    ...history
      .slice(0, 20)
      .reverse()
      .map((s) => ({
        at: s.at,
        value: s.blockedWorkCount,
        label: "blocked",
      })),
  ];
  return {
    tasks,
    missions,
    meetings,
    executions,
    sprintSnap,
    existingHealthScore,
    history,
    blockedTrend,
  };
}

export function computeCompanyAnalyticsSnapshot(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  dimension?: AnalyticsDimension;
  dimensionId?: string | null;
}): CompanyAnalyticsSnapshot {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const dimension = input?.dimension ?? "company";
  const dimensionId = input?.dimensionId ?? null;

  const g = gatherInputs(root, workspaceId, now);
  let filteredTasks = g.tasks;
  let activeSprint = g.sprintSnap.active;
  let sprintMetrics = g.sprintSnap.metrics;

  if (dimension !== "company" && dimensionId) {
    if (dimension === "team") {
      filteredTasks = filterTasksForDimension({
        tasks: g.tasks,
        dimension,
        dimensionId,
        teamDepartment:
          getEmployeeDefinition(dimensionId)?.department ?? dimensionId,
      });
    } else if (dimension === "sprint") {
      filteredTasks = filterTasksForDimension({
        tasks: g.tasks,
        dimension,
        dimensionId,
      });
      const sprint = getCompanySprint({
        sprintId: dimensionId,
        repoRoot: root,
        workspaceId,
      });
      activeSprint = sprint;
      sprintMetrics = sprint
        ? g.sprintSnap.metrics && g.sprintSnap.active?.id === sprint.id
          ? g.sprintSnap.metrics
          : {
              totalWorkItems: sprint.workItemIds.length,
              completedWorkItems: filteredTasks.filter((t) => t.status === "done")
                .length,
              blockedWorkItems: filteredTasks.filter(
                (t) =>
                  t.status === "blocked" || t.status === "needs_clarification"
              ).length,
              inProgressWorkItems: filteredTasks.filter(
                (t) => t.status === "in_progress"
              ).length,
              progressPercent:
                sprint.workItemIds.length === 0
                  ? 0
                  : Math.round(
                      (filteredTasks.filter((t) => t.status === "done").length /
                        sprint.workItemIds.length) *
                        100
                    ),
              velocity: g.sprintSnap.metrics?.velocity ?? 0,
              goal: sprint.goal,
            }
        : null;
    } else {
      filteredTasks = filterTasksForDimension({
        tasks: g.tasks,
        dimension,
        dimensionId,
      });
    }
  }

  return buildCompanyAnalyticsSnapshot({
    workspaceId,
    now,
    tasks: g.tasks,
    missions: g.missions,
    meetings: g.meetings,
    executions: g.executions,
    activeSprint,
    sprintMetrics,
    existingHealthScore: g.existingHealthScore,
    blockedTrend: [
      ...g.blockedTrend,
      {
        at: now,
        value: filteredTasks.filter(
          (t) => t.status === "blocked" || t.status === "needs_clarification"
        ).length,
        label: "blocked",
      },
    ].slice(-24),
    dimension,
    dimensionId,
    filteredTasks,
  });
}

/**
 * Persist a historical sample. Writes only to analytics store.
 */
export function recordCompanyAnalyticsSample(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  /** Skip if a sample was recorded within this many ms (default 5 min). */
  minIntervalMs?: number;
}):
  | { ok: true; sample: AnalyticsHistorySample; skipped?: false }
  | { ok: true; sample: null; skipped: true; reason: string }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const minInterval = input?.minIntervalMs ?? 5 * 60_000;

  const existing = listAnalyticsSamples(root, workspaceId, 1)[0];
  if (existing && Date.parse(now) - Date.parse(existing.at) <= minInterval) {
    return {
      ok: true,
      sample: null,
      skipped: true,
      reason: "throttle",
    };
  }

  const snapshot = computeCompanyAnalyticsSnapshot({
    repoRoot: root,
    workspaceId,
    now,
    dimension: "company",
  });

  const sample: AnalyticsHistorySample = {
    id: snapshot.id,
    workspaceId,
    at: now,
    kpis: snapshot.kpis,
    healthScore: snapshot.healthScore,
    blockedWorkCount: snapshot.kpis.blockedWorkCount,
    sprintVelocity: snapshot.kpis.sprintVelocity,
    qaPassRatePercent: snapshot.kpis.qaPassRatePercent,
    approvalTurnaroundHours: snapshot.kpis.approvalTurnaroundHours,
  };
  appendAnalyticsSample(sample, root, workspaceId);
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "analytics.record",
    executionStatus: `health:${sample.healthScore}`,
  });
  return { ok: true, sample };
}

export function getCompanyAnalyticsView(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  dimension?: AnalyticsDimension;
  dimensionId?: string | null;
  historyLimit?: number;
}): CompanyAnalyticsView {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const snapshot = computeCompanyAnalyticsSnapshot({
    repoRoot: root,
    workspaceId,
    now,
    dimension: input?.dimension,
    dimensionId: input?.dimensionId,
  });
  const history = listAnalyticsSamples(
    root,
    workspaceId,
    input?.historyLimit ?? 40
  );
  const chronological = [...history].reverse();

  return {
    snapshot,
    history,
    trends: {
      health: chronological.map((s) => ({
        at: s.at,
        value: s.healthScore,
        label: "health",
      })),
      blocked: chronological.map((s) => ({
        at: s.at,
        value: s.blockedWorkCount,
        label: "blocked",
      })),
      velocity: chronological.map((s) => ({
        at: s.at,
        value: s.sprintVelocity,
        label: "velocity",
      })),
      productivity: chronological.map((s) => ({
        at: s.at,
        value: s.kpis.employeeProductivityAvg,
        label: "productivity",
      })),
      qaPass: chronological
        .filter((s) => s.qaPassRatePercent != null)
        .map((s) => ({
          at: s.at,
          value: s.qaPassRatePercent as number,
          label: "qa_pass",
        })),
      approvalTurnaround: chronological
        .filter((s) => s.approvalTurnaroundHours != null)
        .map((s) => ({
          at: s.at,
          value: s.approvalTurnaroundHours as number,
          label: "approval_hours",
        })),
    },
  };
}

export {
  buildCompanyAnalyticsSnapshot,
  computeEmployeeProductivity,
  computeRecurringBlockers,
  computeMeetingEfficiency,
  computeApprovalTurnaround,
  computeQaRates,
  filterTasksForDimension,
} from "./analytics.logic";
