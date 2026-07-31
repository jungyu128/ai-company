/**
 * Mission execution context passed into every employee execution.
 * Permanent role comes only from the employee catalog — never from the mission.
 */

import {
  getEmployeeDefinition,
  type WorkpilotProductRole,
} from "../ai-company-employees";
import type { CollaborationMission } from "../collaboration.logic";
import type { DevTask, PeerDiscussion, WorkItemLink } from "./types";
import {
  listActiveWorkpilotMissions,
  missionCorpus,
  missionScopeFocusLine,
} from "./mission-scope.logic";
import {
  enrichEmployeeWithRoleContract,
  evaluateRoleMissionFit,
  roleContractForEmployee,
  stripMissionRoleOverrides,
} from "./employee-role.logic";
import { linkFromMission } from "./work-items.logic";

export const EXECUTION_SAFETY_RULES = [
  "Never merge to main without explicit CEO approval.",
  "Never deploy to production without explicit CEO approval.",
  "Never send customer email, outreach, or CRM updates unless the active mission or CEO requires it.",
  "Never delete production data or force-push.",
  "Prepare branch / PR only through controlled WorkPilot execution after CEO approval.",
  "Stay on the active WorkPilot work item — do not invent unrelated commercial work.",
  "Permanent employee roles cannot be overridden by mission text.",
] as const;

export type MissionExecutionContext = {
  activeMission: CollaborationMission | null;
  activeMissions: CollaborationMission[];
  workItem: WorkItemLink | null;
  /** Permanent role title from catalog (mission cannot override). */
  permanentRole: string;
  /** @deprecated alias of permanentRole — kept for callers; always catalog role. */
  assignedRole: string;
  productRole: WorkpilotProductRole | null;
  employeeId: string;
  reasoningStyle: string | null;
  defaultReviewPerspective: string | null;
  assignedTask: string | null;
  /** Mission objective only — role override phrases stripped. */
  missionObjective: string | null;
  acceptanceCriteria: string[];
  repositoryContext: string[];
  previousDiscussions: string[];
  ceoDecisions: string[];
  executionSafetyRules: string[];
  roleAllowedActions: string[];
  roleProhibitedActions: string[];
  scopeFocusLine: string | null;
  roleConflict: {
    conflict: boolean;
    recommendedEmployeeId: string | null;
    refuseMessage: string | null;
  };
};

export function extractAcceptanceCriteria(input: {
  mission?: CollaborationMission | null;
  task?: DevTask | null;
  ceoNote?: string | null;
}): string[] {
  const chunks: string[] = [];
  if (input.mission?.planSteps?.length) {
    chunks.push(...input.mission.planSteps.map((s) => `Plan step: ${s}`));
  }
  const corpus = [
    input.mission ? missionCorpus(input.mission) : "",
    input.task?.description ?? "",
    input.ceoNote ?? "",
    input.mission?.ceoNote ?? "",
  ].join("\n");

  const criteriaBlock = corpus.match(
    /(?:acceptance criteria|done when|definition of done)\s*[:\-–]?\s*([^\n]+(?:\n[-*•].+)*)/i
  );
  if (criteriaBlock?.[1]) {
    chunks.push(criteriaBlock[1].trim());
  }

  for (const line of corpus.split(/\n+/)) {
    if (/^\s*[-*•]\s+/.test(line) && /must|should|verify|accept/i.test(line)) {
      chunks.push(line.replace(/^\s*[-*•]\s+/, "").trim());
    }
  }

  return [...new Set(chunks.map((c) => c.trim()).filter(Boolean))].slice(0, 8);
}

export function buildMissionExecutionContext(input: {
  employeeId: string;
  missions: CollaborationMission[];
  task?: DevTask | null;
  discussions?: PeerDiscussion[];
  repositoryContext?: string[];
  ceoDecisions?: string[];
}): MissionExecutionContext {
  const emp = getEmployeeDefinition(input.employeeId);
  const enriched = emp ? enrichEmployeeWithRoleContract(emp) : null;
  const contract = roleContractForEmployee(input.employeeId);
  const activeMissions = listActiveWorkpilotMissions(input.missions);
  const activeMission =
    activeMissions.find((m) => m.leadEmployeeId === input.employeeId) ??
    activeMissions[0] ??
    null;

  const workItem =
    input.task?.workItem ??
    (activeMission ? linkFromMission(activeMission) : null);

  const previousDiscussions = (input.discussions ?? [])
    .filter(
      (d) =>
        !workItem ||
        d.workItem.id === workItem.id ||
        d.participantIds.includes(input.employeeId)
    )
    .slice(0, 5)
    .map((d) => d.synthesis);

  const rawObjective = [
    activeMission?.mission ?? "",
    activeMission?.title ?? "",
    input.task?.title ?? "",
    input.task?.description ?? "",
  ]
    .filter(Boolean)
    .join("\n");
  const missionObjective = stripMissionRoleOverrides(rawObjective) || null;

  const fit = evaluateRoleMissionFit({
    employeeId: input.employeeId,
    objectiveText: rawObjective,
  });

  const permanentRole = emp?.role ?? "AI Employee";

  return {
    activeMission,
    activeMissions,
    workItem,
    permanentRole,
    assignedRole: permanentRole,
    productRole: emp?.productRole ?? null,
    employeeId: input.employeeId,
    reasoningStyle: emp?.reasoningStyle ?? null,
    defaultReviewPerspective: emp?.defaultReviewPerspective ?? null,
    assignedTask: input.task?.title ?? activeMission?.title ?? null,
    missionObjective,
    acceptanceCriteria: extractAcceptanceCriteria({
      mission: activeMission,
      task: input.task ?? null,
      ceoNote: activeMission?.ceoNote ?? null,
    }),
    repositoryContext: (input.repositoryContext ?? []).slice(0, 8),
    previousDiscussions,
    ceoDecisions: (input.ceoDecisions ?? []).slice(0, 8),
    executionSafetyRules: [...EXECUTION_SAFETY_RULES],
    roleAllowedActions: enriched?.allowedActions ?? contract?.allowedActions ?? [],
    roleProhibitedActions:
      enriched?.prohibitedActions ?? contract?.prohibitedActions ?? [],
    scopeFocusLine: missionScopeFocusLine(activeMissions),
    roleConflict: {
      conflict: fit.conflict,
      recommendedEmployeeId: fit.recommendedEmployeeId,
      refuseMessage: fit.refuseMessage,
    },
  };
}

export function formatMissionExecutionContextBrief(
  ctx: MissionExecutionContext
): string[] {
  const lines: string[] = [];
  if (ctx.activeMission) {
    lines.push(
      `Active mission objective: ${ctx.activeMission.id} — ${ctx.activeMission.title}`
    );
  }
  if (ctx.missionObjective) {
    lines.push(`Objective: ${ctx.missionObjective.slice(0, 160)}`);
  }
  if (ctx.workItem) {
    lines.push(
      `Work item: ${ctx.workItem.kind} ${ctx.workItem.id} — ${ctx.workItem.title}`
    );
  }
  lines.push(
    `Permanent role: ${ctx.permanentRole} (mission cannot override)`
  );
  if (ctx.reasoningStyle) {
    lines.push(`Reasoning: ${ctx.reasoningStyle.slice(0, 120)}`);
  }
  if (ctx.defaultReviewPerspective) {
    lines.push(`Review lens: ${ctx.defaultReviewPerspective.slice(0, 120)}`);
  }
  if (ctx.assignedTask) lines.push(`Assigned task: ${ctx.assignedTask}`);
  if (ctx.roleConflict.conflict && ctx.roleConflict.refuseMessage) {
    lines.push(`Role conflict: ${ctx.roleConflict.refuseMessage.slice(0, 160)}`);
  }
  if (ctx.acceptanceCriteria[0]) {
    lines.push(`Acceptance: ${ctx.acceptanceCriteria.slice(0, 2).join("; ")}`);
  }
  if (ctx.repositoryContext[0]) {
    lines.push(`Repo: ${ctx.repositoryContext[0]}`);
  }
  if (ctx.scopeFocusLine) lines.push(ctx.scopeFocusLine);
  lines.push(`Safety: ${ctx.executionSafetyRules[0]}`);
  return lines;
}
