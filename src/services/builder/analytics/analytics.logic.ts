/**
 * Pure Company Analytics computations — no store writes, no execution side effects.
 */

import { AI_COMPANY_EMPLOYEES, getEmployeeDefinition } from "../ai-company-employees";
import type { DevTask } from "../autonomous-company/types";
import type { CollaborationMission } from "../collaboration.logic";
import type { ExecutionRecord } from "../execution/types";
import type { CompanyMeeting } from "../meetings/types";
import type { CompanySprint, SprintMetrics } from "../sprints/types";
import type {
  AnalyticsDimension,
  CompanyAnalyticsKpis,
  CompanyAnalyticsSnapshot,
  EmployeeProductivity,
  RecurringBlocker,
  TrendPoint,
  WorkDistributionSlice,
} from "./types";

function hoursBetween(start: string, end: string): number | null {
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (![a, b].every(Number.isFinite) || b < a) return null;
  return Math.round(((b - a) / 3_600_000) * 100) / 100;
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100;
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function normalizeBlockerKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function computeEmployeeProductivity(tasks: DevTask[]): EmployeeProductivity[] {
  return AI_COMPANY_EMPLOYEES.map((emp) => {
    const owned = tasks.filter((t) => t.ownerEmployeeId === emp.id);
    const completed = owned.filter((t) => t.status === "done").length;
    const blocked = owned.filter(
      (t) => t.status === "blocked" || t.status === "needs_clarification"
    ).length;
    const active = owned.filter(
      (t) =>
        t.status !== "done" &&
        t.status !== "blocked" &&
        t.status !== "needs_clarification"
    ).length;
    const completionHours = owned
      .filter((t) => t.status === "done")
      .map((t) => hoursBetween(t.createdAt, t.updatedAt))
      .filter((h): h is number => h != null);
    const denom = completed + active + blocked;
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department,
      role: emp.role,
      completed,
      active,
      blocked,
      productivityPercent: denom === 0 ? 0 : pct(completed, denom),
      avgCompletionHours: avg(completionHours),
    };
  });
}

export function computeWorkDistribution(tasks: DevTask[]): {
  byEmployee: WorkDistributionSlice[];
  byTeam: WorkDistributionSlice[];
  byStatus: WorkDistributionSlice[];
} {
  const open = tasks.filter((t) => t.status !== "done");
  const total = Math.max(1, open.length);

  const byEmp = new Map<string, number>();
  const byTeam = new Map<string, number>();
  const byStatus = new Map<string, number>();

  for (const t of open) {
    byEmp.set(t.ownerEmployeeId, (byEmp.get(t.ownerEmployeeId) ?? 0) + 1);
    const dept =
      getEmployeeDefinition(t.ownerEmployeeId)?.department ?? "Unknown";
    byTeam.set(dept, (byTeam.get(dept) ?? 0) + 1);
    byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
  }

  const toSlices = (
    map: Map<string, number>,
    labelFor: (k: string) => string
  ): WorkDistributionSlice[] =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        label: labelFor(key),
        count,
        percent: pct(count, total),
      }));

  return {
    byEmployee: toSlices(
      byEmp,
      (id) => getEmployeeDefinition(id)?.name ?? id
    ),
    byTeam: toSlices(byTeam, (k) => k),
    byStatus: toSlices(byStatus, (k) => k.replace(/_/g, " ")),
  };
}

export function computeRecurringBlockers(tasks: DevTask[]): RecurringBlocker[] {
  const buckets = new Map<string, { label: string; ids: string[] }>();
  for (const t of tasks) {
    if (t.status !== "blocked" && t.status !== "needs_clarification") continue;
    const sources = [
      t.blocker,
      ...t.missingRequirements.slice(0, 2),
    ].filter((s): s is string => Boolean(s?.trim()));
    if (!sources.length) {
      sources.push(t.status === "blocked" ? "unspecified blocker" : "needs clarification");
    }
    for (const src of sources) {
      const key = normalizeBlockerKey(src);
      if (!key) continue;
      const cur = buckets.get(key) ?? { label: src.trim().slice(0, 120), ids: [] };
      if (!cur.ids.includes(t.id)) cur.ids.push(t.id);
      buckets.set(key, cur);
    }
  }
  return [...buckets.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      count: v.ids.length,
      exampleWorkItemIds: v.ids.slice(0, 5),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

export function computeMeetingEfficiency(meetings: CompanyMeeting[]): {
  total: number;
  withDecisions: number;
  awaitingCeo: number;
  efficiencyPercent: number;
  avgActionItems: number;
} {
  const total = meetings.length;
  const withDecisions = meetings.filter((m) => m.decisions.length > 0).length;
  const awaitingCeo = meetings.filter((m) => m.status === "awaiting_ceo").length;
  const actionCounts = meetings.map((m) => m.actionItems.length);
  return {
    total,
    withDecisions,
    awaitingCeo,
    efficiencyPercent: pct(withDecisions, total),
    avgActionItems: avg(actionCounts) ?? 0,
  };
}

export function computeApprovalTurnaround(missions: CollaborationMission[]): {
  pending: number;
  decided: number;
  avgTurnaroundHours: number | null;
} {
  const pending = missions.filter(
    (m) =>
      m.approvalStatus === "pending" || m.approvalStatus === "changes_requested"
  ).length;
  const decided = missions.filter(
    (m) =>
      m.approvalStatus === "approved" || m.approvalStatus === "rejected"
  );
  const hours = decided
    .map((m) => hoursBetween(m.createdAt, m.updatedAt))
    .filter((h): h is number => h != null);
  return {
    pending,
    decided: decided.length,
    avgTurnaroundHours: avg(hours),
  };
}

export function computeQaRates(input: {
  tasks: DevTask[];
  executions: ExecutionRecord[];
}): {
  pass: number;
  fail: number;
  passRatePercent: number | null;
  failRatePercent: number | null;
} {
  const qaEmployees = new Set(
    AI_COMPANY_EMPLOYEES.filter((e) => e.productRole === "qa").map((e) => e.id)
  );
  const qaTasks = input.tasks.filter((t) => qaEmployees.has(t.ownerEmployeeId));
  const qaPass = qaTasks.filter((t) => t.status === "done").length;
  const qaFail = qaTasks.filter(
    (t) => t.status === "blocked" || t.status === "needs_clarification"
  ).length;

  const execPass = input.executions.filter(
    (e) => e.status === "succeeded" || e.executionStatus === "succeeded"
  ).length;
  const execFail = input.executions.filter(
    (e) => e.status === "failed" || e.executionStatus === "failed"
  ).length;

  const pass = qaPass + execPass;
  const fail = qaFail + execFail;
  const total = pass + fail;
  if (total === 0) {
    return {
      pass: 0,
      fail: 0,
      passRatePercent: null,
      failRatePercent: null,
    };
  }
  return {
    pass,
    fail,
    passRatePercent: pct(pass, total),
    failRatePercent: pct(fail, total),
  };
}

export function computeAvgCompletionHours(tasks: DevTask[]): number | null {
  const hours = tasks
    .filter((t) => t.status === "done")
    .map((t) => hoursBetween(t.createdAt, t.updatedAt))
    .filter((h): h is number => h != null);
  return avg(hours);
}

export function healthLabelFromScore(score: number): string {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Stable";
  if (score >= 45) return "Watch";
  return "At risk";
}

/** Lightweight health score from analytics KPIs (does not mutate CEO store). */
export function deriveAnalyticsHealthScore(kpis: Omit<CompanyAnalyticsKpis, "companyHealthScore">): number {
  const productivity = kpis.employeeProductivityAvg;
  const blockedPenalty = Math.min(40, kpis.blockedWorkCount * 8);
  const meeting = kpis.meetingEfficiencyPercent;
  const qa = kpis.qaPassRatePercent ?? 70;
  const approvalPenalty =
    kpis.approvalTurnaroundHours == null
      ? 0
      : Math.min(20, Math.max(0, kpis.approvalTurnaroundHours - 12));
  const velocityBoost = Math.min(15, kpis.sprintVelocity * 10);
  const raw =
    productivity * 0.35 +
    meeting * 0.15 +
    qa * 0.25 +
    velocityBoost +
    30 -
    blockedPenalty -
    approvalPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function buildCompanyAnalyticsSnapshot(input: {
  workspaceId: string;
  now: string;
  tasks: DevTask[];
  missions: CollaborationMission[];
  meetings: CompanyMeeting[];
  executions: ExecutionRecord[];
  activeSprint: CompanySprint | null;
  sprintMetrics: SprintMetrics | null;
  /** Prefer existing CEO health when available (read-only). */
  existingHealthScore?: number | null;
  blockedTrend?: TrendPoint[];
  dimension?: AnalyticsDimension;
  dimensionId?: string | null;
  filteredTasks?: DevTask[];
}): CompanyAnalyticsSnapshot {
  const dimension = input.dimension ?? "company";
  const dimensionId = input.dimensionId ?? null;
  const tasks = input.filteredTasks ?? input.tasks;

  const employees = computeEmployeeProductivity(tasks);
  const distribution = computeWorkDistribution(tasks);
  const recurringBlockers = computeRecurringBlockers(tasks);
  const meetings = computeMeetingEfficiency(input.meetings);
  const approvals = computeApprovalTurnaround(input.missions);
  const qa = computeQaRates({
    tasks,
    executions: input.executions,
  });
  const avgCompletion = computeAvgCompletionHours(tasks);
  const productivityAvg =
    employees.length === 0
      ? 0
      : Math.round(
          employees.reduce((s, e) => s + e.productivityPercent, 0) / employees.length
        );
  const blockedWorkCount = tasks.filter(
    (t) => t.status === "blocked" || t.status === "needs_clarification"
  ).length;
  const activeWorkCount = tasks.filter(
    (t) =>
      t.status === "in_progress" ||
      t.status === "proposed" ||
      t.status === "peer_review" ||
      t.status === "awaiting_ceo"
  ).length;
  const completedWorkCount = tasks.filter((t) => t.status === "done").length;
  const sprintVelocity = input.sprintMetrics?.velocity ?? 0;

  const partialKpis = {
    employeeProductivityAvg: productivityAvg,
    avgWorkCompletionHours: avgCompletion,
    sprintVelocity,
    blockedWorkCount,
    meetingEfficiencyPercent: meetings.efficiencyPercent,
    approvalTurnaroundHours: approvals.avgTurnaroundHours,
    qaPassRatePercent: qa.passRatePercent,
    qaFailRatePercent: qa.failRatePercent,
    activeWorkCount,
    completedWorkCount,
  };

  const healthScore =
    typeof input.existingHealthScore === "number"
      ? input.existingHealthScore
      : deriveAnalyticsHealthScore(partialKpis);

  const kpis: CompanyAnalyticsKpis = {
    ...partialKpis,
    companyHealthScore: healthScore,
  };

  return {
    id: `an-${Date.parse(input.now).toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    workspaceId: input.workspaceId,
    at: input.now,
    dimension,
    dimensionId,
    kpis,
    employees,
    workDistribution: distribution,
    blockedTrend: input.blockedTrend ?? [
      { at: input.now, value: blockedWorkCount, label: "blocked" },
    ],
    recurringBlockers,
    sprint: {
      activeSprintId: input.activeSprint?.id ?? null,
      activeSprintName: input.activeSprint?.name ?? null,
      velocity: sprintVelocity,
      progressPercent: input.sprintMetrics?.progressPercent ?? 0,
      completed: input.sprintMetrics?.completedWorkItems ?? 0,
      total:
        input.sprintMetrics?.totalWorkItems ??
        input.activeSprint?.workItemIds.length ??
        0,
    },
    meetings,
    approvals,
    qa,
    healthScore,
    healthLabel: healthLabelFromScore(healthScore),
  };
}

export function filterTasksForDimension(input: {
  tasks: DevTask[];
  dimension: AnalyticsDimension;
  dimensionId: string;
  teamDepartment?: string | null;
}): DevTask[] {
  switch (input.dimension) {
    case "employee":
      return input.tasks.filter((t) => t.ownerEmployeeId === input.dimensionId);
    case "team": {
      const dept =
        input.teamDepartment ??
        getEmployeeDefinition(input.dimensionId)?.department ??
        input.dimensionId;
      const ids = new Set(
        AI_COMPANY_EMPLOYEES.filter((e) => e.department === dept).map((e) => e.id)
      );
      return input.tasks.filter((t) => ids.has(t.ownerEmployeeId));
    }
    case "sprint":
      return input.tasks.filter((t) => t.sprintId === input.dimensionId);
    case "work_item":
      return input.tasks.filter((t) => t.id === input.dimensionId);
    case "company":
    default:
      return input.tasks;
  }
}
