/**
 * Mission Priority Engine — scores and orders company missions.
 * Employee-facing; no internal engine terminology.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
  matchEmployeeIdForText,
} from "./ai-company-employees";
import type { CollaborationMission } from "./collaboration.logic";
import type { MissionOutcomeRecord } from "./learning.logic";

export type MissionPriorityBand = "P0" | "P1" | "P2" | "P3";

export type MissionPriorityScore = {
  missionId: string;
  title: string;
  priority: MissionPriorityBand;
  urgency: number;
  businessValue: number;
  estimatedEffort: number;
  dependencies: string[];
  recommendedOwnerId: string;
  recommendedOwnerName: string;
  score: number;
  rationale: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function scoreMissionPriority(
  mission: CollaborationMission,
  options?: {
    outcomes?: MissionOutcomeRecord[];
    now?: string;
  }
): MissionPriorityScore {
  const hay = `${mission.title} ${mission.mission}`.toLowerCase();
  const now = options?.now ?? new Date().toISOString();
  const ageHours = Math.max(
    0,
    (Date.parse(now) - Date.parse(mission.createdAt)) / 3_600_000
  );

  let urgency = 40;
  let businessValue = 45;
  let estimatedEffort = 3;

  if (/urgent|asap|critical|risk|conflict|overdue|expired/.test(hay)) urgency += 35;
  if (/today|before 3|eod|sla/.test(hay)) urgency += 20;
  if (mission.approvalStatus === "pending") urgency += 15;
  if (mission.approvalStatus === "changes_requested") urgency += 25;
  if (ageHours > 24) urgency += 10;
  if (ageHours > 72) urgency += 15;

  if (/sales|pipeline|deal|quote|revenue|customer/.test(hay)) businessValue += 25;
  if (/proposal|contract|email|outreach/.test(hay)) businessValue += 15;
  if (/finance|invoice|budget/.test(hay)) businessValue += 12;
  if (/support|escalation|ticket/.test(hay)) businessValue += 18;

  if (/document|proposal|deck|brief/.test(hay)) estimatedEffort += 1;
  if (/email|calendar|meeting/.test(hay)) estimatedEffort += 0.5;
  if (mission.chain.length >= 3) estimatedEffort += 1;
  estimatedEffort = clamp(Math.round(estimatedEffort * 10) / 10, 1, 8);

  urgency = clamp(Math.round(urgency), 1, 100);
  businessValue = clamp(Math.round(businessValue), 1, 100);

  const dependencies = mission.chain.slice(0, -1).map((s) => s.employeeId);
  const recommendedOwnerId =
    mission.leadEmployeeId ||
    matchEmployeeIdForText(hay) ||
    AI_COMPANY_EMPLOYEES[0].id;
  const owner = getEmployeeDefinition(recommendedOwnerId);

  // Historical bias: prefer owners with higher success on similar work.
  let historyBoost = 0;
  const outcomes = options?.outcomes ?? [];
  const ownerOutcomes = outcomes.filter((o) => o.leadEmployeeId === recommendedOwnerId);
  if (ownerOutcomes.length >= 2) {
    const successRate =
      ownerOutcomes.filter((o) => o.success).length / ownerOutcomes.length;
    historyBoost = Math.round((successRate - 0.5) * 20);
  }

  const score = clamp(
    Math.round(urgency * 0.45 + businessValue * 0.4 + (100 - estimatedEffort * 8) * 0.15 + historyBoost),
    1,
    100
  );

  const priority: MissionPriorityBand =
    score >= 85 ? "P0" : score >= 70 ? "P1" : score >= 50 ? "P2" : "P3";

  return {
    missionId: mission.id,
    title: mission.title,
    priority,
    urgency,
    businessValue,
    estimatedEffort,
    dependencies,
    recommendedOwnerId,
    recommendedOwnerName: owner?.name ?? recommendedOwnerId,
    score,
    rationale: `${priority} · urgency ${urgency} · value ${businessValue} · effort ${estimatedEffort} · owner ${owner?.name ?? recommendedOwnerId}`,
  };
}

export function prioritizeMissions(
  missions: CollaborationMission[],
  options?: { outcomes?: MissionOutcomeRecord[]; now?: string }
): MissionPriorityScore[] {
  return missions
    .map((m) => scoreMissionPriority(m, options))
    .sort((a, b) => b.score - a.score || a.missionId.localeCompare(b.missionId));
}

export function reorderEmployeeQueue(
  employeeId: string,
  missions: CollaborationMission[],
  options?: { outcomes?: MissionOutcomeRecord[]; now?: string }
): MissionPriorityScore[] {
  const mine = missions.filter(
    (m) =>
      m.leadEmployeeId === employeeId ||
      m.chain.some((s) => s.employeeId === employeeId)
  );
  return prioritizeMissions(mine, options);
}
