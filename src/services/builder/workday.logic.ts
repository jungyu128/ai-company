/**
 * Daily operating cycle for the AI Company.
 * Morning → Working hours → End of day. Employee-facing labels only.
 */

import type { ExecutiveBrief } from "./proactive.logic";
import type { CompanyHealth } from "./proactive.logic";
import type { CompanyDashboardMetrics } from "./conversation.logic";
import type { MissionPriorityScore } from "./priority.logic";
import type { CoordinationPlan } from "./orchestrator.logic";
import type { LearningStats } from "./learning.logic";

export type WorkDayPhase = "morning" | "working" | "end_of_day";

export type WorkDayCycleSnapshot = {
  phase: WorkDayPhase;
  phaseLabel: string;
  generatedAt: string;
  morning: {
    checklist: string[];
    risksDetected: number;
    opportunitiesDetected: number;
    briefReady: boolean;
  };
  working: {
    monitoring: string[];
    autoCollaborations: number;
    escalations: number;
    reorderedMissions: number;
  };
  endOfDay: {
    completedSummary: string[];
    pendingSummary: string[];
    productivityNote: string;
    healthNote: string;
    tomorrowPriorities: string[];
  };
};

export function detectWorkDayPhase(now = new Date()): WorkDayPhase {
  // Use local-ish KST offset for product demos (+09:00) without exposing internals.
  const hour = (now.getUTCHours() + 9) % 24;
  if (hour < 11) return "morning";
  if (hour < 18) return "working";
  return "end_of_day";
}

export function buildWorkDayCycle(input: {
  phase?: WorkDayPhase;
  now?: string;
  executiveBrief: ExecutiveBrief;
  companyHealth: CompanyHealth;
  metrics: CompanyDashboardMetrics;
  priorities: MissionPriorityScore[];
  coordination: CoordinationPlan;
  learning: LearningStats;
  risks: string[];
  opportunities: string[];
}): WorkDayCycleSnapshot {
  const generatedAt = input.now ?? new Date().toISOString();
  const phase = input.phase ?? detectWorkDayPhase(new Date(generatedAt));
  const phaseLabel =
    phase === "morning"
      ? "Morning preparation"
      : phase === "working"
        ? "Working hours"
        : "End of day wrap-up";

  const morning = {
    checklist: [
      "Review email",
      "Review calendar",
      "Review documents",
      "Review CRM",
      "Review approvals",
      "Review unfinished work",
      "Detect risks",
      "Detect opportunities",
      "Build Executive Brief",
    ],
    risksDetected: input.risks.length,
    opportunitiesDetected: input.opportunities.length,
    briefReady: Boolean(input.executiveBrief.headline),
  };

  const working = {
    monitoring: [
      "Monitor new work",
      "Detect new events",
      "Re-prioritize missions",
      "Collaborate automatically",
      "Escalate only when CEO input is required",
    ],
    autoCollaborations: input.coordination.autonomyEvents.filter(
      (e) => e.kind === "ask_help" || e.kind === "delegate"
    ).length,
    escalations: input.coordination.autonomyEvents.filter((e) => e.escalatedToCeo).length,
    reorderedMissions: input.priorities.length,
  };

  const topPending = input.priorities
    .filter((p) => p.priority === "P0" || p.priority === "P1")
    .slice(0, 5)
    .map((p) => p.title);

  const endOfDay = {
    completedSummary: [
      `${input.metrics.completedToday} missions completed today`,
      `Approval rate ${(input.learning.approvalRate * 100).toFixed(0)}% (historical)`,
      `Collaboration efficiency ${input.learning.averageCollaborationEfficiency || "—"}`,
    ],
    pendingSummary:
      topPending.length > 0
        ? topPending
        : [`${input.metrics.waitingForApproval} items still waiting on CEO`],
    productivityNote: `Company productivity ${input.metrics.companyProductivity}% with ${input.metrics.employeesWorking} employees active.`,
    healthNote: `${input.companyHealth.label} · ${input.companyHealth.score}% — ${input.companyHealth.summary}`,
    tomorrowPriorities:
      input.executiveBrief.highestPriorities.slice(0, 5).length > 0
        ? input.executiveBrief.highestPriorities.slice(0, 5)
        : topPending.slice(0, 3),
  };

  return {
    phase,
    phaseLabel,
    generatedAt,
    morning,
    working,
    endOfDay,
  };
}
