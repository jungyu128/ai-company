/**
 * AI CEO façade — supervise, plan, report; never approve external writes.
 */

import { AI_COMPANY_EMPLOYEES } from "../ai-company-employees";
import { listApprovalCenter } from "../approval.service";
import { listCeoApprovalQueue } from "../ceo-approval-queue";
import { listCollaborations, upsertCollaboration } from "../collaboration.store";
import { getAutonomyStore } from "../autonomous-company/autonomous-company.store";
import { getConnectionStatusesSync } from "../execution/connection-status";
import { listExecutionHistory } from "../execution/execution.service";
import { formatHqDateTimeDisplay } from "../format-hq-display";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { listCompanyMeetings, getCompanyMeeting } from "../meetings";
import { listMemories } from "../memory/memory.store";
import { computeWorkloads } from "../orchestrator.logic";
import {
  getCompanySprint,
  getSprintSnapshot,
} from "../sprints";
import { getLiveWorkTrackerSnapshot } from "../live-work-tracker/server";
import { dailyReportViewFromStored } from "../daily-report";
import { getDailyOpsSnapshot } from "../daily-ops";
import { listActivity, listAudit } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { getAutonomousWorkday } from "../workday/workday.service";
import { persistCeoCycle, readCeoStore } from "./ceo.store";
import {
  buildActiveWorkItems,
  buildBlockedWorkItems,
  buildMeetingSummaries,
  buildRecentDecisions,
  buildSprintProgressPanel,
  drillHref,
  employeeName,
} from "./dashboard-panels";
import { buildHealthSnapshot } from "./health";
import {
  applyReassignmentRecommendation,
  buildPlanningRecommendations,
  buildWorkloadEntries,
} from "./planning";
import { buildExecutiveReport } from "./reports";
import { detectOperationalRisks } from "./risks";
import { assertAiCeoCannotApproveWrites, getAiCeoSafetyGuarantees } from "./safety";
import type {
  CeoDashboardDrillResult,
  CeoDashboardDrillSection,
  ExecutiveDashboard,
  ExecutiveReport,
} from "./types";

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
    repoRoot: root,
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
    repoRoot: root,
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
  repoRoot: string;
}): ExecutiveDashboard {
  const accepted = input.memories.filter((m) => m.ceoStatus === "accepted");
  const pending = input.memories.filter((m) => m.ceoStatus === "pending");
  const avg =
    input.memories.length === 0
      ? 0
      : Math.round(
          input.memories.reduce((s, m) => s + m.confidence, 0) / input.memories.length
        );

  const tasks = getAutonomyStore(input.repoRoot, input.workspaceId).tasks;
  const sprintSnap = getSprintSnapshot({
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
    now: input.now,
  });
  const meetings = listCompanyMeetings({
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
    limit: 20,
  });
  const activity = listActivity(input.workspaceId, input.repoRoot, 40);
  const audits = listAudit(input.workspaceId, input.repoRoot, 40);
  const liveWork = getLiveWorkTrackerSnapshot({
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
    sync: true,
    now: input.now,
  });
  const dailyOps = getDailyOpsSnapshot({
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
    now: input.now,
  });

  return {
    generatedAt: input.now,
    generatedAtDisplay: formatHqDateTimeDisplay(input.now),
    workspaceId: input.workspaceId,
    health: input.health,
    risks: input.risks,
    workloads: input.workloads,
    approvalQueue: listCeoApprovalQueue({
      workspaceId: input.workspaceId,
      repoRoot: input.repoRoot,
      now: input.now,
    })
      .items.slice(0, 20)
      .map((a) => ({
        id: a.id,
        title: a.requestedAction,
        owner: a.employee.name,
        href: "#ops-approvals",
      })),
    missionProgress: input.missions.slice(0, 20).map((m) => ({
      id: m.id,
      title: m.title,
      status: m.approvalStatus,
      lead: AI_COMPANY_EMPLOYEES.find((e) => e.id === m.leadEmployeeId)?.name ?? m.leadEmployeeId,
      href: drillHref("active_work", m.id),
    })),
    activeWork: buildActiveWorkItems(tasks),
    blockedWork: buildBlockedWorkItems(tasks),
    liveWorkTracker: {
      asOf: liveWork.asOf,
      summary: liveWork.summary,
      employees: liveWork.employees.map((e) => ({
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        role: e.role,
        status: e.status,
        currentTask: e.currentTask,
        progressPercent: e.progressPercent,
        currentStep: e.currentStep,
        startedAt: e.startedAt,
        estimatedCompletionAt: e.estimatedCompletionAt,
        waitingFor: e.waitingFor,
        nextPlannedAction: e.nextPlannedAction,
        lastUpdate: e.lastUpdate,
        href: `/builder/hq/employees/${encodeURIComponent(e.employeeId)}`,
      })),
      recentChanges: liveWork.recentChanges.slice(0, 12).map((c) => ({
        employeeId: c.employeeId,
        employeeName: c.employeeName,
        summary: c.summary,
        at: c.at,
      })),
    },
    dailyOps: {
      asOf: dailyOps.asOf,
      directive: dailyOps.today
        ? {
            id: dailyOps.today.id,
            title: dailyOps.today.title,
            instruction: dailyOps.today.instruction,
            status: dailyOps.today.status,
            priority: dailyOps.today.priority,
            clarifiedOutcome: dailyOps.today.clarifiedOutcome,
            paused: dailyOps.today.paused,
          }
        : null,
      plan: dailyOps.activePlan
        ? {
            id: dailyOps.activePlan.id,
            planVersion: dailyOps.activePlan.planVersion,
            status: dailyOps.activePlan.status,
            objectiveSummary: dailyOps.activePlan.objectiveSummary,
            immutable: dailyOps.activePlan.immutable,
          }
        : null,
      workSummary: dailyOps.workSummary,
      approvalQueue: dailyOps.approvalQueue.map((a) => ({
        id: a.id,
        kind: a.kind,
        summary: a.summary,
        workItemId: a.workItemId,
      })),
      workItems: (dailyOps.activePlan?.proposedWorkItems ?? []).map((w) => ({
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
      employees: dailyOps.employees.map((e) => ({
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        role: e.role,
        currentActivity: e.currentActivity,
        currentStep: e.currentStep,
        progress: e.progress,
        waitingFor: e.waitingFor,
        nextAction: e.nextAction,
      })),
      blockers: dailyOps.blockers,
      risks: (dailyOps.activePlan?.risks ?? []).map((r) => ({
        id: r.id,
        summary: r.summary,
        severity: r.severity,
        mitigation: r.mitigation,
      })),
      dependencies: (dailyOps.activePlan?.dependencies ?? []).map((d) => ({
        id: d.id,
        fromWorkItemId: d.fromWorkItemId,
        toWorkItemId: d.toWorkItemId,
        description: d.description,
      })),
      assignments: (dailyOps.activePlan?.employeeAssignments ?? []).map((a) => ({
        employeeId: a.employeeId,
        employeeName: a.employeeName,
        permanentRole: a.permanentRole,
        workItemIds: a.workItemIds,
        reason: a.reason,
      })),
      latestUpdate: dailyOps.latestUpdate,
      morningReportTitle: dailyOps.latestMorningReport?.title ?? null,
      finalReportTitle: dailyOps.latestFinalReport?.title ?? null,
      dailyReport: dailyReportViewFromStored(dailyOps.latestFinalReport),
    },
    sprintProgress: buildSprintProgressPanel({
      active: sprintSnap.active,
      metrics: sprintSnap.metrics,
      plannedCount: sprintSnap.planned.length,
      completedCount: sprintSnap.completed.length,
    }),
    meetingSummaries: buildMeetingSummaries(meetings),
    recentDecisions: buildRecentDecisions({ activity, audits }),
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

/**
 * Drill into a single CEO Dashboard item for detail view.
 */
export function getCeoDashboardDrill(input: {
  section: CeoDashboardDrillSection;
  id: string;
  workspaceId?: string;
  repoRoot?: string;
}):
  | { ok: true; drill: CeoDashboardDrillResult }
  | { ok: false; code: string; message: string; status: number } {
  assertAiCeoCannotApproveWrites();
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const root = input.repoRoot ?? process.cwd();
  const dash = getExecutiveDashboard({
    workspaceId,
    repoRoot: root,
    refresh: true,
  });

  switch (input.section) {
    case "health":
    case "kpi":
      return {
        ok: true,
        drill: {
          section: input.section,
          id: input.id || dash.health.id,
          title: `Company health ${dash.health.score} (${dash.health.label})`,
          detail: {
            health: dash.health,
            kpis: dash.health.kpis,
            kpiHistory: dash.kpiHistory.slice(0, 10),
          },
        },
      };
    case "workload": {
      const w = dash.workloads.find((x) => x.employeeId === input.id);
      if (!w) {
        return { ok: false, code: "NOT_FOUND", message: "Employee workload not found", status: 404 };
      }
      const owned = getAutonomyStore(root, workspaceId).tasks.filter(
        (t) => t.ownerEmployeeId === input.id && t.status !== "done"
      );
      return {
        ok: true,
        drill: {
          section: "workload",
          id: w.employeeId,
          title: `${w.employeeName} workload`,
          detail: { workload: w, openTasks: owned },
        },
      };
    }
    case "active_work":
    case "blocked_work": {
      const task = getAutonomyStore(root, workspaceId).tasks.find(
        (t) => t.id === input.id
      );
      if (!task) {
        const mission = listCollaborations(root, workspaceId).find(
          (m) => m.id === input.id
        );
        if (!mission) {
          return { ok: false, code: "NOT_FOUND", message: "Work item not found", status: 404 };
        }
        return {
          ok: true,
          drill: {
            section: input.section,
            id: mission.id,
            title: mission.title,
            detail: { mission },
          },
        };
      }
      return {
        ok: true,
        drill: {
          section: input.section,
          id: task.id,
          title: task.title,
          detail: {
            task,
            owner: employeeName(task.ownerEmployeeId),
          },
        },
      };
    }
    case "sprint": {
      const sprint = getCompanySprint({
        sprintId: input.id,
        repoRoot: root,
        workspaceId,
      });
      if (!sprint) {
        return { ok: false, code: "NOT_FOUND", message: "Sprint not found", status: 404 };
      }
      return {
        ok: true,
        drill: {
          section: "sprint",
          id: sprint.id,
          title: sprint.name,
          detail: {
            sprint,
            panel: dash.sprintProgress,
          },
        },
      };
    }
    case "meeting": {
      const meeting = getCompanyMeeting({
        meetingId: input.id,
        repoRoot: root,
        workspaceId,
      });
      if (!meeting) {
        return { ok: false, code: "NOT_FOUND", message: "Meeting not found", status: 404 };
      }
      return {
        ok: true,
        drill: {
          section: "meeting",
          id: meeting.id,
          title: meeting.title,
          detail: {
            meeting: {
              id: meeting.id,
              kind: meeting.kind,
              status: meeting.status,
              purpose: meeting.purpose,
              synthesis: meeting.synthesis,
              decisions: meeting.decisions,
              actionItems: meeting.actionItems,
              participants: meeting.participantIds.map(employeeName),
              workItemTitle: meeting.workItemTitle,
            },
          },
        },
      };
    }
    case "live_work": {
      const entry = dash.liveWorkTracker.employees.find(
        (e) => e.employeeId === input.id
      );
      if (!entry) {
        return {
          ok: false,
          code: "NOT_FOUND",
          message: "Live work entry not found",
          status: 404,
        };
      }
      return {
        ok: true,
        drill: {
          section: "live_work",
          id: entry.employeeId,
          title: `${entry.employeeName} · ${entry.status}`,
          detail: { liveWork: entry, summary: dash.liveWorkTracker.summary },
        },
      };
    }
    case "daily_ops": {
      return {
        ok: true,
        drill: {
          section: "daily_ops",
          id: input.id || dash.dailyOps.directive?.id || "daily_ops",
          title: dash.dailyOps.directive?.title ?? "Daily Operations",
          detail: { dailyOps: dash.dailyOps },
        },
      };
    }
    case "risk": {
      const risk = dash.risks.find((r) => r.id === input.id);
      if (!risk) {
        return { ok: false, code: "NOT_FOUND", message: "Risk not found", status: 404 };
      }
      return {
        ok: true,
        drill: {
          section: "risk",
          id: risk.id,
          title: risk.title,
          detail: { risk },
        },
      };
    }
    case "approval": {
      const approval = dash.approvalQueue.find((a) => a.id === input.id);
      if (!approval) {
        return { ok: false, code: "NOT_FOUND", message: "Approval not found", status: 404 };
      }
      return {
        ok: true,
        drill: {
          section: "approval",
          id: approval.id,
          title: approval.title,
          detail: { approval, href: "#ops-approvals" },
        },
      };
    }
    case "decision": {
      const decision = dash.recentDecisions.find((d) => d.id === input.id);
      if (!decision) {
        return { ok: false, code: "NOT_FOUND", message: "Decision not found", status: 404 };
      }
      return {
        ok: true,
        drill: {
          section: "decision",
          id: decision.id,
          title: decision.summary,
          detail: { decision },
        },
      };
    }
    default:
      return {
        ok: false,
        code: "INVALID",
        message: "Unknown drill section",
        status: 400,
      };
  }
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
    activeWork: [],
    blockedWork: [],
    liveWorkTracker: {
      asOf: at,
      summary: {
        idle: 0,
        planning: 0,
        working: 0,
        reviewing: 0,
        meeting: 0,
        waiting: 0,
        blocked: 0,
        completed: 0,
      },
      employees: [],
      recentChanges: [],
    },
    dailyOps: {
      asOf: at,
      directive: null,
      plan: null,
      workSummary: {
        proposed: 0,
        awaitingApproval: 0,
        approved: 0,
        executing: 0,
        blocked: 0,
        completed: 0,
        rejected: 0,
      },
      approvalQueue: [],
      workItems: [],
      employees: [],
      blockers: [],
      risks: [],
      dependencies: [],
      assignments: [],
      latestUpdate: null,
      morningReportTitle: null,
      finalReportTitle: null,
      dailyReport: null,
    },
    sprintProgress: {
      active: null,
      plannedCount: 0,
      completedCount: 0,
      items: [],
    },
    meetingSummaries: [],
    recentDecisions: [],
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
