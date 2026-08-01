/**
 * Pure collaboration planning for AI Company missions.
 * No Builder Runtime terminology — employee-facing stages only.
 */

import {
  AI_COMPANY_EMPLOYEES,
  employeeVoiceLine,
  getEmployeeDefinition,
  matchEmployeeIdsForText,
} from "./ai-company-employees";
import type { AiCompanyEmployeeStatus } from "./ai-company-employees";
import {
  appendApprovalCommunications,
  buildActivityEventsForMission,
  buildConversationTimeline,
  buildExecutionTimeline,
  buildInboxForMission,
  type ActivityFeedItem,
  type ApprovalLogEntry,
  type ConversationTurn,
  type ExecutionTimelineEvent,
  type InboxMessage,
  type MissionFinalOutcome,
} from "./conversation.logic";
import {
  dependencyEmployeeIdsForWork,
  type OwnershipMode,
} from "./employee-message-routing.logic";
import { resolveExplicitCeoAddressee } from "./ceo-discussion-orchestration.logic";

export type CollaborationStageKind =
  | "analyze"
  | "prepare"
  | "collaborate"
  | "await_approval"
  | "execute"
  | "report";

export type CollaborationStepStatus =
  | "queued"
  | "thinking"
  | "working"
  | "collaborating"
  | "waiting_approval"
  | "completed"
  | "blocked";

export type CollaborationStep = {
  employeeId: string;
  employeeName: string;
  role: string;
  stage: CollaborationStageKind;
  status: CollaborationStepStatus;
  message: string;
};

export type CollaborationApprovalState =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested";

export type CollaborationMission = {
  id: string;
  title: string;
  mission: string;
  leadEmployeeId: string;
  chain: CollaborationStep[];
  approvalStatus: CollaborationApprovalState;
  planSummary: string;
  planSteps: string[];
  createdAt: string;
  updatedAt: string;
  ceoNote: string | null;
  /** v2 conversation system — optional for backward compatibility with stored JSON. */
  conversations?: ConversationTurn[];
  activityEvents?: ActivityFeedItem[];
  inbox?: InboxMessage[];
  approvalsLog?: ApprovalLogEntry[];
  executionTimeline?: ExecutionTimelineEvent[];
  finalOutcome?: MissionFinalOutcome;
  completedAt?: string | null;
};

const DEFAULT_CHAIN_BY_LEAD: Record<string, string[]> = {
  sarah: ["sarah", "olivia", "emma"],
  alex: ["alex", "emma"],
  david: ["david", "emma"],
  noah: ["noah", "olivia", "sophia"],
  olivia: ["olivia", "david"],
  emma: ["emma"],
  daniel: ["daniel", "sophia"],
  sophia: ["sophia", "olivia", "sarah"],
};

function stageForIndex(index: number, total: number): CollaborationStageKind {
  if (index === 0) return "analyze";
  if (index === total - 1) return "await_approval";
  if (index === total - 2 && total > 2) return "prepare";
  return "collaborate";
}

/**
 * Build a multi-employee collaboration chain for a CEO mission.
 * Lead employee is always first.
 * In strict mode (CEO addressed someone by name), peers join only via hard
 * dependency — not soft collaborator suggestions — so others cannot intercept.
 */
export function planCollaborationChain(input: {
  missionId: string;
  title: string;
  mission: string;
  leadEmployeeId: string;
  planSummary: string;
  planSteps: string[];
  now?: string;
  /** strict = owner + dependency only; collaborative = legacy inferred chain */
  ownershipMode?: OwnershipMode;
}): CollaborationMission {
  const now = input.now ?? new Date().toISOString();
  const lead = getEmployeeDefinition(input.leadEmployeeId);
  const leadId = lead?.id ?? AI_COMPANY_EMPLOYEES[0].id;
  const corpus = `${input.title}\n${input.mission}`;
  const addressed = resolveExplicitCeoAddressee(corpus);
  const ownershipMode: OwnershipMode =
    input.ownershipMode ??
    (addressed && addressed === leadId ? "strict" : "collaborative");

  const orderedIds: string[] = [leadId];

  if (ownershipMode === "strict") {
    for (const id of dependencyEmployeeIdsForWork({
      text: corpus,
      ownerEmployeeId: leadId,
    })) {
      if (!orderedIds.includes(id) && getEmployeeDefinition(id)) {
        orderedIds.push(id);
      }
    }
  } else {
    const inferred = matchEmployeeIdsForText(input.mission).filter(
      (id) => id !== leadId
    );
    const preferred = DEFAULT_CHAIN_BY_LEAD[leadId] ?? [leadId];
    for (const id of [
      ...preferred.filter((p) => p !== leadId),
      ...inferred,
    ]) {
      if (!orderedIds.includes(id) && getEmployeeDefinition(id)) {
        orderedIds.push(id);
      }
    }
    // Cap chain length for readability; always end with an approval-capable executor.
    if (orderedIds.length === 1 && leadId !== "emma") {
      const extras = matchEmployeeIdsForText(input.mission);
      if (
        extras.includes("emma") ||
        /send|email|notify|follow.?up|verify|test/i.test(input.mission)
      ) {
        if (getEmployeeDefinition("emma")) orderedIds.push("emma");
      }
    }
  }

  const chainIds = orderedIds.slice(0, 4);

  const chain: CollaborationStep[] = chainIds.map((employeeId, index) => {
    const emp = getEmployeeDefinition(employeeId);
    if (!emp) {
      throw new Error(`Unknown employee in collaboration chain: ${employeeId}`);
    }
    const stage = stageForIndex(index, chainIds.length);
    const isLead = index === 0;
    const isLast = index === chainIds.length - 1;
    let status: CollaborationStepStatus = "queued";
    if (isLead) status = "completed";
    else if (index === 1) status = chainIds.length === 2 ? "waiting_approval" : "collaborating";
    else if (isLast) status = "waiting_approval";
    else status = "thinking";

    const voiceKind =
      stage === "analyze"
        ? "analyze"
        : stage === "await_approval"
          ? "await_approval"
          : stage === "execute"
            ? "execute"
            : "collaborate";

    return {
      employeeId,
      employeeName: emp.name,
      role: emp.role,
      stage,
      status,
      message: employeeVoiceLine(employeeId, voiceKind),
    };
  });

  // Normalize: last step waits on CEO; prior non-lead steps show collaboration.
  if (chain.length > 0) {
    chain[chain.length - 1].status = "waiting_approval";
    chain[chain.length - 1].stage = "await_approval";
    chain[chain.length - 1].message = employeeVoiceLine(
      chain[chain.length - 1].employeeId,
      "await_approval"
    );
    for (let i = 0; i < chain.length - 1; i++) {
      if (i === 0) {
        chain[i].status = "completed";
        chain[i].stage = "analyze";
      } else {
        chain[i].status = "collaborating";
        chain[i].stage = "collaborate";
        chain[i].message = employeeVoiceLine(chain[i].employeeId, "collaborate");
      }
    }
  }

  return {
    id: input.missionId,
    title: input.title,
    mission: input.mission,
    leadEmployeeId: leadId,
    chain,
    approvalStatus: "pending",
    planSummary: input.planSummary,
    planSteps: input.planSteps,
    createdAt: now,
    updatedAt: now,
    ceoNote: null,
    conversations: buildConversationTimeline(chain, input.missionId, now),
    activityEvents: buildActivityEventsForMission(chain, { id: input.missionId, title: input.title }, now),
    inbox: buildInboxForMission(chain, { id: input.missionId, title: input.title }, now),
    approvalsLog: [
      {
        decision: "submitted",
        note: null,
        at: now,
        actor: "employee",
      },
    ],
    executionTimeline: buildExecutionTimeline(chain, input.missionId, now),
    finalOutcome: "pending",
    completedAt: null,
  };
}

/** Map a collaboration step status onto the live employee badge. */
export function liveStatusFromStep(
  stepStatus: CollaborationStepStatus
): AiCompanyEmployeeStatus {
  switch (stepStatus) {
    case "thinking":
      return "thinking";
    case "working":
      return "working";
    case "collaborating":
      return "collaborating";
    case "waiting_approval":
      return "waiting_approval";
    case "completed":
      return "completed";
    case "blocked":
      return "offline";
    default:
      return "online";
  }
}

/**
 * Derive each employee's live status from active collaboration missions.
 * Later missions override earlier ones for the same employee.
 */
export function deriveLiveEmployeeStatuses(
  missions: CollaborationMission[],
  employeeIds: string[]
): Record<string, AiCompanyEmployeeStatus> {
  const out: Record<string, AiCompanyEmployeeStatus> = {};
  for (const id of employeeIds) out[id] = "online";

  const active = missions.filter(
    (m) => m.approvalStatus === "pending" || m.approvalStatus === "changes_requested"
  );
  const approved = missions.filter((m) => m.approvalStatus === "approved");

  for (const m of active) {
    for (const step of m.chain) {
      out[step.employeeId] = liveStatusFromStep(step.status);
    }
  }

  for (const m of approved) {
    for (const step of m.chain) {
      if (step.status === "working" || step.status === "collaborating") {
        out[step.employeeId] = liveStatusFromStep(step.status);
      } else if (out[step.employeeId] === "online") {
        out[step.employeeId] = "completed";
      }
    }
  }

  return out;
}

export function applyApprovalDecision(
  mission: CollaborationMission,
  decision: "approve" | "reject" | "request_changes",
  note: string | null,
  now = new Date().toISOString()
): CollaborationMission {
  const next: CollaborationMission = {
    ...mission,
    updatedAt: now,
    ceoNote: note,
    chain: mission.chain.map((s) => ({ ...s })),
  };

  if (decision === "approve") {
    next.approvalStatus = "approved";
    for (const step of next.chain) {
      if (step.status === "waiting_approval") {
        step.status = "working";
        step.stage = "execute";
        step.message = employeeVoiceLine(step.employeeId, "execute");
      } else if (step.status !== "completed") {
        step.status = "completed";
      }
    }
  } else if (decision === "reject") {
    next.approvalStatus = "rejected";
    for (const step of next.chain) {
      if (step.status === "waiting_approval" || step.status === "thinking") {
        step.status = "blocked";
        step.message = `${step.employeeName}: Mission declined by CEO.`;
      }
    }
  } else {
    next.approvalStatus = "changes_requested";
    for (const step of next.chain) {
      if (step.status === "waiting_approval") {
        step.status = "thinking";
        step.stage = "analyze";
        step.message = employeeVoiceLine(step.employeeId, "analyze");
      }
    }
  }

  return {
    ...next,
    ...appendApprovalCommunications(mission, decision, note, now),
  };
}
