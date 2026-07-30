/**
 * Learning system — store mission outcomes and bias future recommendations.
 */

import type { CollaborationMission } from "./collaboration.logic";
import type { EmployeeRecommendation } from "./proactive.logic";

export type MissionOutcomeRecord = {
  missionId: string;
  title: string;
  leadEmployeeId: string;
  participantIds: string[];
  success: boolean;
  approved: boolean;
  completionTimeMs: number | null;
  collaborationEfficiency: number;
  recordedAt: string;
};

export type LearningStats = {
  successRate: number;
  approvalRate: number;
  averageCompletionTimeMs: number | null;
  averageCollaborationEfficiency: number;
  sampleSize: number;
  byEmployee: Record<
    string,
    {
      successRate: number;
      approvalRate: number;
      averageCompletionTimeMs: number | null;
      sampleSize: number;
    }
  >;
};

export function recordMissionOutcome(
  mission: CollaborationMission,
  now = new Date().toISOString()
): MissionOutcomeRecord {
  const completedAt = mission.completedAt ?? mission.updatedAt;
  const completionTimeMs =
    Date.parse(completedAt) >= Date.parse(mission.createdAt)
      ? Date.parse(completedAt) - Date.parse(mission.createdAt)
      : null;

  const success =
    mission.approvalStatus === "approved" || mission.finalOutcome === "completed";
  const approved = mission.approvalStatus === "approved";

  const chainLen = Math.max(1, mission.chain.length);
  let efficiency = 70 + Math.max(0, 4 - chainLen) * 5;
  if (success) efficiency += 15;
  if (mission.approvalStatus === "rejected") efficiency -= 25;
  if (mission.approvalStatus === "changes_requested") efficiency -= 10;
  efficiency = Math.max(5, Math.min(99, efficiency));

  return {
    missionId: mission.id,
    title: mission.title,
    leadEmployeeId: mission.leadEmployeeId,
    participantIds: mission.chain.map((s) => s.employeeId),
    success,
    approved,
    completionTimeMs,
    collaborationEfficiency: efficiency,
    recordedAt: now,
  };
}

export function computeLearningStats(outcomes: MissionOutcomeRecord[]): LearningStats {
  const sampleSize = outcomes.length;
  if (sampleSize === 0) {
    return {
      successRate: 0,
      approvalRate: 0,
      averageCompletionTimeMs: null,
      averageCollaborationEfficiency: 0,
      sampleSize: 0,
      byEmployee: {},
    };
  }

  const successRate = outcomes.filter((o) => o.success).length / sampleSize;
  const approvalRate = outcomes.filter((o) => o.approved).length / sampleSize;
  const times = outcomes
    .map((o) => o.completionTimeMs)
    .filter((t): t is number => typeof t === "number" && t >= 0);
  const averageCompletionTimeMs =
    times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
  const averageCollaborationEfficiency = Math.round(
    outcomes.reduce((a, b) => a + b.collaborationEfficiency, 0) / sampleSize
  );

  const groups = new Map<
    string,
    { success: number; approved: number; times: number[]; sampleSize: number }
  >();
  for (const o of outcomes) {
    const g = groups.get(o.leadEmployeeId) ?? {
      success: 0,
      approved: 0,
      times: [],
      sampleSize: 0,
    };
    g.sampleSize += 1;
    g.success += o.success ? 1 : 0;
    g.approved += o.approved ? 1 : 0;
    if (o.completionTimeMs != null) g.times.push(o.completionTimeMs);
    groups.set(o.leadEmployeeId, g);
  }

  const byEmployee: LearningStats["byEmployee"] = {};
  for (const [id, g] of groups) {
    byEmployee[id] = {
      successRate: g.success / g.sampleSize,
      approvalRate: g.approved / g.sampleSize,
      averageCompletionTimeMs:
        g.times.length > 0
          ? Math.round(g.times.reduce((a, b) => a + b, 0) / g.times.length)
          : null,
      sampleSize: g.sampleSize,
    };
  }

  return {
    successRate,
    approvalRate,
    averageCompletionTimeMs,
    averageCollaborationEfficiency,
    sampleSize,
    byEmployee,
  };
}

/**
 * Bias recommendation confidence using historical outcomes for the lead employee.
 */
export function applyLearningToRecommendations(
  recommendations: EmployeeRecommendation[],
  stats: LearningStats
): EmployeeRecommendation[] {
  return recommendations.map((rec) => {
    const emp = stats.byEmployee[rec.leadEmployeeId];
    if (!emp || emp.sampleSize < 2) return rec;

    const delta = Math.round((emp.successRate - 0.5) * 16 + (emp.approvalRate - 0.5) * 8);
    const confidence = Math.max(40, Math.min(96, rec.confidence + delta));
    const reasoning =
      `${rec.reasoning} Historical success ${(emp.successRate * 100).toFixed(0)}%` +
      ` across ${emp.sampleSize} missions adjusted confidence.`;

    return { ...rec, confidence, reasoning };
  });
}

export function productivityTrendFromOutcomes(
  outcomes: MissionOutcomeRecord[],
  days = 7,
  now = new Date()
): Array<{ day: string; completed: number; successRate: number }> {
  const byDay = new Map<string, { completed: number; success: number }>();
  for (const o of outcomes) {
    const day = o.recordedAt.slice(0, 10);
    const row = byDay.get(day) ?? { completed: 0, success: 0 };
    row.completed += 1;
    row.success += o.success ? 1 : 0;
    byDay.set(day, row);
  }

  const daysList: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    daysList.push(d.toISOString().slice(0, 10));
  }

  return daysList.map((day) => {
    const row = byDay.get(day);
    return {
      day,
      completed: row?.completed ?? 0,
      successRate: row && row.completed > 0 ? row.success / row.completed : 0,
    };
  });
}
