/**
 * AI Company Operating System — ties cycle, priority, coordination, and learning.
 * Internal coordination stays hidden; UI receives Command Center payloads only.
 */

import { listCollaborations, upsertCollaboration } from "./collaboration.store";
import { listApprovalCenter } from "./approval.service";
import {
  computeCompanyMetrics,
  type CompanyDashboardMetrics,
} from "./conversation.logic";
import { getProactiveDashboardSlice } from "./proactive.service";
import { prioritizeMissions, type MissionPriorityScore } from "./priority.logic";
import {
  applyDelegate,
  applySplitMission,
  computeWorkloads,
  employeesNeedingHelp,
  optimizeCollaborationChain,
  runCoordination,
  type AutonomyEvent,
  type CoordinationPlan,
} from "./orchestrator.logic";
import {
  applyLearningToRecommendations,
  computeLearningStats,
  productivityTrendFromOutcomes,
  recordMissionOutcome,
  type LearningStats,
} from "./learning.logic";
import { listMissionOutcomes, syncOutcomesFromMissions } from "./learning.store";
import { applyMemoryToRecommendations } from "./memory/memory.service";
import type { CompanyMemory } from "./memory/types";
import { getCompanyMemoryDashboard } from "./memory/memory.service";
import { buildWorkDayCycle, type WorkDayCycleSnapshot } from "./workday.logic";
import type { CompanyHealth, EmployeeRecommendation, ExecutiveBrief, PriorityAlert } from "./proactive.logic";
import { formatHqDateTimeDisplay } from "./format-hq-display";
import { deriveLiveEmployeeStatuses } from "./collaboration.logic";
import { AI_COMPANY_EMPLOYEES } from "./ai-company-employees";
import { isInternalAiCompanyEnabled } from "./internal-ai-company";
import {
  listExecutionHistory,
  listPendingExecutions,
} from "./execution/execution.service";
import { getConnectionStatusesSync } from "./execution/connection-status";
import type { ConnectionStatus, ExecutionRecord } from "./execution/types";
import type { AutonomousWorkday } from "./workday/types";
import { getAutonomousWorkday } from "./workday/workday.service";

export type ProductivityTrendPoint = {
  day: string;
  completed: number;
  successRate: number;
};

export type CeoCommandCenter = {
  companyHealth: CompanyHealth;
  activeMissions: MissionPriorityScore[];
  criticalRisks: string[];
  topOpportunities: string[];
  recommendations: EmployeeRecommendation[];
  waitingApprovals: Array<{ id: string; title: string; owner: string }>;
  employeesNeedingHelp: Array<{ employeeId: string; name: string; reason: string }>;
  productivityTrends: ProductivityTrendPoint[];
  workday: WorkDayCycleSnapshot;
  missionPriorities: MissionPriorityScore[];
  coordinationSummary: {
    assignments: number;
    rebalanced: number;
    blocked: number;
    duplicatesPrevented: number;
    autonomyEvents: AutonomyEvent[];
  };
  learning: LearningStats;
  pendingExecutions: ExecutionRecord[];
  executionHistory: ExecutionRecord[];
  connectionStatuses: ConnectionStatus[];
  /** v6 Autonomous Workday (null until CEO starts the day). */
  autonomousWorkday: AutonomousWorkday | null;
  /** v7 Company Memory snapshot for Command Center / HQ. */
  companyMemory: {
    learnedPreferences: CompanyMemory[];
    newInsights: CompanyMemory[];
    recentlyUpdated: CompanyMemory[];
    lastLearnedAt: string | null;
  };
};

export function runCompanyOperatingSystem(options?: {
  repoRoot?: string;
  now?: string;
  generatedAtDisplay?: string;
  metrics?: CompanyDashboardMetrics;
  workspaceId?: string;
}): {
  commandCenter: CeoCommandCenter;
  coordination: CoordinationPlan;
  executiveBrief: ExecutiveBrief;
  priorityAlerts: PriorityAlert[];
  recommendations: EmployeeRecommendation[];
  companyHealth: CompanyHealth;
  risks: string[];
  opportunities: string[];
} {
  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? "default";
  const now = options?.now ?? new Date().toISOString();
  const missions = listCollaborations(root, workspaceId);

  // Learning: record outcomes for finished missions
  const finished = missions.filter(
    (m) =>
      m.approvalStatus === "approved" ||
      m.approvalStatus === "rejected" ||
      m.finalOutcome === "completed"
  );
  const newOutcomes = finished.map((m) => recordMissionOutcome(m, m.completedAt ?? m.updatedAt));
  const outcomes = syncOutcomesFromMissions(newOutcomes, root, workspaceId);
  // Also keep any previously stored that aren't in sync set
  const allOutcomes =
    outcomes.length > 0 ? outcomes : listMissionOutcomes(root, workspaceId);
  const learning = computeLearningStats(allOutcomes);

  const liveStatuses = deriveLiveEmployeeStatuses(
    missions,
    AI_COMPANY_EMPLOYEES.map((e) => e.id)
  );
  const employeesWorking = Object.values(liveStatuses).filter((s) =>
    ["working", "collaborating", "thinking"].includes(s)
  ).length;

  const metrics =
    options?.metrics ?? computeCompanyMetrics(missions, employeesWorking);

  const proactive = getProactiveDashboardSlice({
    repoRoot: root,
    workspaceId,
    metrics,
    generatedAtDisplay:
      options?.generatedAtDisplay ?? formatHqDateTimeDisplay(now),
  });

  const recommendations = applyMemoryToRecommendations(
    applyLearningToRecommendations(proactive.recommendations, learning),
    { repoRoot: root, now, workspaceId }
  );

  const priorities = prioritizeMissions(missions, { outcomes: allOutcomes, now });
  const coordination = runCoordination(missions, { outcomes: allOutcomes, now });
  const workloads = computeWorkloads(missions);
  const needingHelp = employeesNeedingHelp(coordination, workloads);

  // Apply non-destructive chain optimizations back to store
  for (const opt of coordination.optimizedChains) {
    const m = missions.find((x) => x.id === opt.missionId);
    if (!m) continue;
    upsertCollaboration(optimizeCollaborationChain(m), root, workspaceId);
  }

  const pendingApprovals = listApprovalCenter(root, workspaceId);
  const workday = buildWorkDayCycle({
    now,
    executiveBrief: proactive.executiveBrief,
    companyHealth: proactive.companyHealth,
    metrics,
    priorities,
    coordination,
    learning,
    risks: proactive.risks,
    opportunities: proactive.opportunities,
  });

  const commandCenter: CeoCommandCenter = {
    companyHealth: proactive.companyHealth,
    activeMissions: priorities.filter((p) => {
      const m = missions.find((x) => x.id === p.missionId);
      return (
        m &&
        (m.approvalStatus === "pending" ||
          m.approvalStatus === "changes_requested" ||
          m.approvalStatus === "approved")
      );
    }),
    criticalRisks: proactive.risks.slice(0, 6),
    topOpportunities: proactive.opportunities.slice(0, 6),
    recommendations: recommendations.filter(
      (r) => r.status === "pending" || r.status === "questioned"
    ),
    waitingApprovals: pendingApprovals.map((a) => ({
      id: a.id,
      title: a.title,
      owner: a.requestingEmployee.name,
    })),
    employeesNeedingHelp: needingHelp,
    productivityTrends: productivityTrendFromOutcomes(allOutcomes, 7, new Date(now)),
    workday,
    missionPriorities: priorities,
    coordinationSummary: {
      assignments: coordination.assignments.length,
      rebalanced: coordination.rebalanced.length,
      blocked: coordination.blocked.length,
      duplicatesPrevented: coordination.duplicates.reduce(
        (n, d) => n + d.duplicateMissionIds.length,
        0
      ),
      autonomyEvents: coordination.autonomyEvents.slice(0, 12),
    },
    learning,
    pendingExecutions: listPendingExecutions(root, workspaceId),
    executionHistory: listExecutionHistory({
      repoRoot: root,
      workspaceId,
      limit: 20,
    }),
    connectionStatuses: getConnectionStatusesSync(),
    autonomousWorkday: getAutonomousWorkday({ repoRoot: root, workspaceId }),
    companyMemory: (() => {
      const mem = getCompanyMemoryDashboard({ repoRoot: root, now, workspaceId });
      return {
        learnedPreferences: mem.learnedPreferences.slice(0, 12),
        newInsights: mem.newInsights.slice(0, 12),
        recentlyUpdated: mem.recentlyUpdated.slice(0, 12),
        lastLearnedAt: mem.lastLearnedAt,
      };
    })(),
  };

  return {
    commandCenter,
    coordination,
    executiveBrief: proactive.executiveBrief,
    priorityAlerts: proactive.priorityAlerts,
    recommendations: commandCenter.recommendations,
    companyHealth: proactive.companyHealth,
    risks: proactive.risks,
    opportunities: proactive.opportunities,
  };
}

export function runAutonomyAction(input: {
  action: "delegate" | "split";
  missionId: string;
  toEmployeeId?: string | null;
  repoRoot?: string;
  now?: string;
  workspaceId?: string;
}):
  | { ok: true; events: AutonomyEvent[] }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? "default";
  const now = input.now ?? new Date().toISOString();
  const missions = listCollaborations(root, workspaceId);
  const mission = missions.find((m) => m.id === input.missionId);
  if (!mission) {
    return { ok: false, code: "NOT_FOUND", message: "Mission not found", status: 404 };
  }

  try {
    if (input.action === "delegate") {
      const to = input.toEmployeeId?.trim();
      if (!to) {
        return {
          ok: false,
          code: "INVALID",
          message: "toEmployeeId required for delegate",
          status: 400,
        };
      }
      const result = applyDelegate(mission, to, now);
      upsertCollaboration(result.mission, root, workspaceId);
      return { ok: true, events: [result.event] };
    }

    const result = applySplitMission(mission, now);
    upsertCollaboration(result.primary, root, workspaceId);
    upsertCollaboration(result.secondary, root, workspaceId);
    return { ok: true, events: [result.event] };
  } catch (err) {
    return {
      ok: false,
      code: "INVALID",
      message: "Autonomy action failed",
      status: 400,
    };
  }
}

/** Convenience for tests — expose executive brief type reuse. */
export type { ExecutiveBrief, EmployeeRecommendation };
