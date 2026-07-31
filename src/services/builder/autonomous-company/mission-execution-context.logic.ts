/**
 * Mission execution context passed into every employee execution.
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
  roleContractForEmployee,
} from "./employee-role.logic";
import { linkFromMission } from "./work-items.logic";

export const EXECUTION_SAFETY_RULES = [
  "Never merge to main without explicit CEO approval.",
  "Never deploy to production without explicit CEO approval.",
  "Never send customer email, outreach, or CRM updates unless the active mission or CEO requires it.",
  "Never delete production data or force-push.",
  "Prepare branch / PR only through controlled WorkPilot execution after CEO approval.",
  "Stay on the active WorkPilot work item — do not invent unrelated commercial work.",
] as const;

export type MissionExecutionContext = {
  activeMission: CollaborationMission | null;
  activeMissions: CollaborationMission[];
  workItem: WorkItemLink | null;
  assignedRole: string;
  productRole: WorkpilotProductRole | null;
  employeeId: string;
  assignedTask: string | null;
  acceptanceCriteria: string[];
  repositoryContext: string[];
  previousDiscussions: string[];
  ceoDecisions: string[];
  executionSafetyRules: string[];
  roleAllowedActions: string[];
  roleProhibitedActions: string[];
  scopeFocusLine: string | null;
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

  return {
    activeMission,
    activeMissions,
    workItem,
    assignedRole: emp?.role ?? "AI Employee",
    productRole: emp?.productRole ?? null,
    employeeId: input.employeeId,
    assignedTask: input.task?.title ?? activeMission?.title ?? null,
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
  };
}

export function formatMissionExecutionContextBrief(
  ctx: MissionExecutionContext
): string[] {
  const lines: string[] = [];
  if (ctx.activeMission) {
    lines.push(
      `Active mission: ${ctx.activeMission.id} — ${ctx.activeMission.title}`
    );
  }
  if (ctx.workItem) {
    lines.push(
      `Work item: ${ctx.workItem.kind} ${ctx.workItem.id} — ${ctx.workItem.title}`
    );
  }
  lines.push(`Assigned role: ${ctx.assignedRole}`);
  if (ctx.assignedTask) lines.push(`Assigned task: ${ctx.assignedTask}`);
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
