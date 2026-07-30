/**
 * AI CEO façade — supervise, plan, report; never approve external writes.
 */

import { AI_COMPANY_EMPLOYEES } from "../ai-company-employees";
import { listApprovalCenter } from "../approval.service";
import { listCollaborations, upsertCollaboration } from "../collaboration.store";
import { getConnectionStatusesSync } from "../execution/connection-status";
import { listExecutionHistory } from "../execution/execution.service";
import { formatHqDateTimeDisplay } from "../format-hq-display";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { listMemories } from "../memory/memory.store";
import { computeWorkloads } from "../orchestrator.logic";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { getAutonomousWorkday } from "../workday/workday.service";
import { persistCeoCycle, readCeoStore } from "./ceo.store";
import { buildHealthSnapshot } from "./health";
import {
  applyReassignmentRecommendation,
  buildPlanningRecommendations,
  buildWorkloadEntries,
} from "./planning";
import { buildExecutiveReport } from "./reports";
import { detectOperationalRisks } from "./risks";
import { assertAiCeoCannotApproveWrites, getAiCeoSafetyGuarantees } from "./safety";
import type { ExecutiveDashboard, ExecutiveReport } from "./types";

export type RunAiCeoOptions = {
  workspaceId?: string;
  repoRoot?: string;
  now?: string;
  /** When true, generate weekly+monthly reports this cycle. */
  generateReports?: boolean;
};

/**
 * Run one AI CEO supervision cycle and persist snapshots.
 */
export function runAiCeoCycle(options?: RunAiCeoOptions): ExecutiveDashboard {
  assertAiCeoCannotApproveWrites();
  if (!isInternalAiCompanyEnabled()) {
    return emptyDashboard(options?.workspaceId ?? DEFAULT_WORKSPACE_ID, options?.now);
  }

  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = options?.now ?? new Date().toISOString();

  const missions = listCollaborations(root, workspaceId);
  const approvals = listApprovalCenter(root, workspaceId);
  const executions = listExecutionHistory({
    repoRoot: root,
    workspaceId,
    limit: 80,
  });
  const connections = getConnectionStatusesSync();
  const memories = listMemories(root, workspaceId);
  const workday = getAutonomousWorkday({ repoRoot: root, workspaceId });
  const workloadsMap = computeWorkloads(missions);
  const workloads = buildWorkloadEntries(workloadsMap, missions);

  const succeeded = executions.filter((e) => e.status === "succeeded").length;
  const failed = executions.filter((e) => e.status === "failed").length;
  const connected = connections.filter((c) => c.connected && c.system !== "crm").length;
  const connectTotal = connections.filter((c) => c.system !== "crm").length;

  const overdueCount = missions.filter((m) => {
    if (m.finalOutcome === "completed" || m.approvalStatus === "rejected") return false;
    const ageH = (Date.parse(now) - Date.parse(m.updatedAt)) / (1000 * 60 * 60);
    return ageH >= 48;
  }).length;

  const completedRecent = missions.filter(
    (m) => m.finalOutcome === "completed" || m.approvalStatus === "approved"
  ).length;

  const avgMem =
    memories.length === 0
      ? 55
      : memories.reduce((s, m) => s + m.confidence, 0) / memories.length;

  let workdayRatio = 55;
  if (workday?.status === "completed" && workday.endOfDayReport) {
    const c = workday.endOfDayReport.completed.length;
    const f = workday.endOfDayReport.failed.length;
    const p = workday.endOfDayReport.pending.length;
    const total = Math.max(1, c + f + p);
    workdayRatio = Math.round((c / total) * 100);
  } else if (workday?.status === "in_progress" || workday?.status === "partial") {
    workdayRatio = 65;
  }

  const health = buildHealthSnapshot({
    workspaceId,
    activeWorkloadItems: Object.values(workloadsMap).reduce((a, b) => a + b, 0),
    employeeCount: AI_COMPANY_EMPLOYEES.length,
    overdueCount,
    approvalBacklog: approvals.length,
    executionsSucceeded: succeeded,
    executionsFailed: failed,
    executionsTotal: executions.length,
    workdayCompletedRatio: workdayRatio,
    memoryAvgConfidence: avgMem,
    connectorsConnected: connected,
    connectorsTotal: Math.max(1, connectTotal),
    collaborationActive: missions.filter((m) => m.chain.length > 1).length,
    missionsCompletedRecent: completedRecent,
    missionsActive: missions.filter(
      (m) => m.approvalStatus === "pending" || m.approvalStatus === "approved"
    ).length,
    now,
  });

  const risks = detectOperationalRisks({
    workspaceId,
    missions,
    executions,
    connections,
    workloads: workloadsMap,
    approvalBacklog: approvals.length,
    now,
  });

  const planning = buildPlanningRecommendations({
    workspaceId,
    workloads,
    missions,
    now,
  });

  const prior = readCeoStore(workspaceId, root);
  const previousHealth = prior.healthSnapshots[0] ?? null;

  const achievements = [
    ...missions
      .filter((m) => m.finalOutcome === "completed" || m.approvalStatus === "approved")
      .slice(0, 6)
      .map((m) => `Completed/approved: ${m.title}`),
    succeeded > 0 ? `${succeeded} successful executions verified` : "No verified executions yet",
  ];
  const failures = [
    ...executions
      .filter((e) => e.status === "failed")
      .slice(0, 6)
      .map((e) => `Execution failed: ${e.requestedAction}`),
    ...risks.filter((r) => r.severity === "high" || r.severity === "critical").map((r) => r.title),
  ];
  const learningNotes = [
    memories.length > 0
      ? `${memories.length} company memories (avg confidence ${Math.round(avgMem)}%)`
      : "Company memory has not grown yet",
    `${prior.kpiHistory.length} prior health samples on record`,
  ];

  const reports: ExecutiveReport[] = [];
  if (options?.generateReports) {
    reports.push(
      buildExecutiveReport({
        workspaceId,
        period: "weekly",
        health,
        previousHealth,
        kpiHistory: prior.kpiHistory,
        risks,
        achievements,
        failures,
        learningNotes,
        now,
      }),
      buildExecutiveReport({
        workspaceId,
        period: "monthly",
        health,
        previousHealth,
        kpiHistory: prior.kpiHistory,
        risks,
        achievements,
        failures,
        learningNotes,
        now,
      })
    );
  }

  const store = persistCeoCycle({
    workspaceId,
    health,
    risks,
    workloads,
    planning,
    reports,
    repoRoot: root,
  });

  return toDashboard({
    workspaceId,
    health,
    risks: store.risks.filter((r) => r.status === "open").slice(0, 30),
    workloads,
    approvals,
    missions,
    executionsSuccessRate: health.kpis.executionSuccessRate,
    connections,
    memories,
    workday,
    planning,
    kpiHistory: store.kpiHistory.slice(0, 30),
    reports: store.reports,
    now,
  });
}

export function getExecutiveDashboard(options?: {
  workspaceId?: string;
  repoRoot?: string;
  refresh?: boolean;
}): ExecutiveDashboard {
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const root = options?.repoRoot ?? process.cwd();
  if (options?.refresh !== false) {
    return runAiCeoCycle({ workspaceId, repoRoot: root });
  }
  const store = readCeoStore(workspaceId, root);
  if (!store.healthSnapshots[0]) {
    return runAiCeoCycle({ workspaceId, repoRoot: root });
  }
  const missions = listCollaborations(root, workspaceId);
  const approvals = listApprovalCenter(root, workspaceId);
  const connections = getConnectionStatusesSync();
  const memories = listMemories(root, workspaceId);
  const workday = getAutonomousWorkday({ repoRoot: root, workspaceId });
  return toDashboard({
    workspaceId,
    health: store.healthSnapshots[0],
    risks: store.risks.filter((r) => r.status === "open").slice(0, 30),
    workloads:
      store.workloadHistory[0]?.workloads ??
      buildWorkloadEntries(computeWorkloads(missions), missions),
    approvals,
    missions,
    executionsSuccessRate: store.healthSnapshots[0].kpis.executionSuccessRate,
    connections,
    memories,
    workday,
    planning: store.planningHistory.slice(0, 20),
    kpiHistory: store.kpiHistory.slice(0, 30),
    reports: store.reports,
    now: store.healthSnapshots[0].createdAt,
  });
}

/**
 * Apply a planning reassignment recommendation (mission lead only).
 * Does not approve or execute external writes.
 */
export function applyCeoPlanningAction(input: {
  workspaceId: string;
  planningId: string;
  repoRoot?: string;
}):
  | { ok: true; missionId: string }
  | { ok: false; code: string; message: string; status: number } {
  assertAiCeoCannotApproveWrites();
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "AI Company is disabled",
      status: 403,
    };
  }
  const root = input.repoRoot ?? process.cwd();
  const store = readCeoStore(input.workspaceId, root);
  const plan = store.planningHistory.find((p) => p.id === input.planningId);
  if (!plan) {
    return { ok: false, code: "NOT_FOUND", message: "Planning item not found", status: 404 };
  }
  if (plan.kind !== "reassign" || !plan.missionId || !plan.toEmployeeId) {
    return {
      ok: false,
      code: "UNSUPPORTED",
      message: "Only reassignment recommendations can be applied here",
      status: 400,
    };
  }
  const mission = listCollaborations(root, input.workspaceId).find(
    (m) => m.id === plan.missionId
  );
  if (!mission) {
    return { ok: false, code: "NOT_FOUND", message: "Mission not found", status: 404 };
  }
  const updated = applyReassignmentRecommendation(mission, plan.toEmployeeId);
  upsertCollaboration(updated, root, input.workspaceId);
  return { ok: true, missionId: updated.id };
}

export function generateExecutiveReports(options?: {
  workspaceId?: string;
  repoRoot?: string;
}): ExecutiveDashboard {
  return runAiCeoCycle({
    workspaceId: options?.workspaceId,
    repoRoot: options?.repoRoot,
    generateReports: true,
  });
}

function toDashboard(input: {
  workspaceId: string;
  health: ExecutiveDashboard["health"];
  risks: ExecutiveDashboard["risks"];
  workloads: ExecutiveDashboard["workloads"];
  approvals: ReturnType<typeof listApprovalCenter>;
  missions: ReturnType<typeof listCollaborations>;
  executionsSuccessRate: number;
  connections: ReturnType<typeof getConnectionStatusesSync>;
  memories: ReturnType<typeof listMemories>;
  workday: ReturnType<typeof getAutonomousWorkday>;
  planning: ExecutiveDashboard["strategicRecommendations"];
  kpiHistory: ExecutiveDashboard["kpiHistory"];
  reports: ExecutiveReport[];
  now: string;
}): ExecutiveDashboard {
  const accepted = input.memories.filter((m) => m.ceoStatus === "accepted");
  const pending = input.memories.filter((m) => m.ceoStatus === "pending");
  const avg =
    input.memories.length === 0
      ? 0
      : Math.round(
          input.memories.reduce((s, m) => s + m.confidence, 0) / input.memories.length
        );

  return {
    generatedAt: input.now,
    generatedAtDisplay: formatHqDateTimeDisplay(input.now),
    workspaceId: input.workspaceId,
    health: input.health,
    risks: input.risks,
    workloads: input.workloads,
    approvalQueue: input.approvals.slice(0, 20).map((a) => ({
      id: a.id,
      title: a.title,
      owner: a.requestingEmployee.name,
    })),
    missionProgress: input.missions.slice(0, 20).map((m) => ({
      id: m.id,
      title: m.title,
      status: m.approvalStatus,
      lead: AI_COMPANY_EMPLOYEES.find((e) => e.id === m.leadEmployeeId)?.name ?? m.leadEmployeeId,
    })),
    executionSuccessRate: input.executionsSuccessRate,
    connectorStatus: input.connections.map((c) => ({
      system: c.system,
      label:
        c.system === "gmail"
          ? "Gmail"
          : c.system === "google_calendar"
            ? "Google Calendar"
            : c.system === "google_drive"
              ? "Google Drive"
              : "CRM",
      connected: c.connected,
      reason: c.reason,
    })),
    memoryGrowth: {
      total: input.memories.length,
      pending: pending.length,
      accepted: accepted.length,
      avgConfidence: avg,
    },
    workdayPerformance: {
      status: input.workday?.status ?? "not_started",
      completed: input.workday?.endOfDayReport?.completed.length ?? 0,
      failed: input.workday?.endOfDayReport?.failed.length ?? 0,
      pending: input.workday?.endOfDayReport?.pending.length ?? 0,
    },
    strategicRecommendations: input.planning.slice(0, 16),
    kpiHistory: input.kpiHistory,
    latestWeeklyReport:
      input.reports.find((r) => r.period === "weekly") ?? null,
    latestMonthlyReport:
      input.reports.find((r) => r.period === "monthly") ?? null,
    safety: getAiCeoSafetyGuarantees(),
  };
}

function emptyDashboard(workspaceId: string, now?: string): ExecutiveDashboard {
  const at = now ?? new Date().toISOString();
  const health = buildHealthSnapshot({
    workspaceId,
    activeWorkloadItems: 0,
    employeeCount: AI_COMPANY_EMPLOYEES.length,
    overdueCount: 0,
    approvalBacklog: 0,
    executionsSucceeded: 0,
    executionsFailed: 0,
    executionsTotal: 0,
    workdayCompletedRatio: 50,
    memoryAvgConfidence: 50,
    connectorsConnected: 0,
    connectorsTotal: 3,
    collaborationActive: 0,
    missionsCompletedRecent: 0,
    missionsActive: 0,
    now: at,
  });
  return {
    generatedAt: at,
    generatedAtDisplay: formatHqDateTimeDisplay(at),
    workspaceId,
    health,
    risks: [],
    workloads: [],
    approvalQueue: [],
    missionProgress: [],
    executionSuccessRate: 70,
    connectorStatus: [],
    memoryGrowth: { total: 0, pending: 0, accepted: 0, avgConfidence: 0 },
    workdayPerformance: { status: "not_started", completed: 0, failed: 0, pending: 0 },
    strategicRecommendations: [],
    kpiHistory: [],
    latestWeeklyReport: null,
    latestMonthlyReport: null,
    safety: getAiCeoSafetyGuarantees(),
  };
}
