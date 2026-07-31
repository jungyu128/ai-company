/**
 * HQ desk conversation — deterministic contextual replies (pure helpers).
 */

import { getEmployeeDefinition } from "./ai-company-employees";
import {
  formatContributionBody,
  buildOwnerOpeningParts,
} from "./discussion-quality.logic";
import { isEchoOfCeoMessage } from "./conversation-routing.logic";
import { missionScopeFocusLine } from "./autonomous-company/mission-scope.logic";
import { validateEmployeeOutput } from "./autonomous-company/employee-role.logic";
import { formatMissionExecutionContextBrief } from "./autonomous-company/mission-execution-context.logic";
import type { MissionExecutionContext } from "./autonomous-company/mission-execution-context.logic";
import type { CollaborationMission } from "./collaboration.logic";

export type HqChatRole = "ceo" | "employee" | "system";

export type HqChatProactiveReason =
  | "report"
  | "question"
  | "risk"
  | "blocker"
  | "approval_request";

export type HqChatMessage = {
  id: string;
  employeeId: string;
  role: HqChatRole;
  speakerName: string;
  speakerRole: string;
  body: string;
  at: string;
  kind: "chat" | "proactive" | "system";
  proactiveReason?: HqChatProactiveReason;
  recommendationId?: string | null;
  /** Client idempotency key for CEO sends. */
  clientRequestId?: string | null;
};

export type HqChatQuickAction =
  | "approve"
  | "reject"
  | "ask_evidence"
  | "reassign"
  | "delay";

export type ChatReplyContext = {
  employeeId: string;
  employeeName: string;
  employeeRole: string;
  expertise: string[];
  communicationStyle: string;
  currentTask: string | null;
  currentActivity: string | null;
  missionTitle: string | null;
  missionSummary: string | null;
  memoryHints: string[];
  knowledgeHints: string[];
  recentActivity: string[];
  priorMessages: Array<{ role: HqChatRole; body: string }>;
  /** Active WorkPilot missions — replies must stay on these objectives. */
  activeMissions?: CollaborationMission[];
  /** Full mission execution context for role + scope enforcement. */
  executionContext?: MissionExecutionContext | null;
  ceoMessage: string;
  relatedRecommendationTitle?: string | null;
  relatedRecommendationBody?: string | null;
  /** Linked WorkPilot work item line (feature/task/PR/bug/doc/roadmap). */
  workItemLine?: string | null;
  /** Development discipline ownership summary. */
  ownershipSummary?: string | null;
};

export type ProactiveOpenInput = {
  employeeId: string;
  now: string;
  currentTask: string | null;
  missionTitle: string | null;
  pendingApprovalTitle: string | null;
  recommendation: {
    id: string;
    title: string;
    recommendation: string;
    priority?: string | null;
    urgency?: string | null;
    status: string;
  } | null;
  recentRiskActivity: string | null;
  existingMessages: HqChatMessage[];
};

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function truncate(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function priorBodies(ctx: ChatReplyContext): string[] {
  return ctx.priorMessages
    .filter((m) => m.role !== "system")
    .map((m) => m.body)
    .slice(-8);
}

/**
 * Build a contextual employee reply from role, task, mission, memory, and history.
 * Out-of-scope or off-role output is rejected and regenerated once.
 */
export function buildEmployeeChatReply(ctx: ChatReplyContext): string {
  const draft = composeEmployeeChatReplyDraft(ctx);
  const bodyOnly = draft.split(/\n\n/).slice(-1)[0] ?? draft;
  const check = validateEmployeeOutput({
    employeeId: ctx.employeeId,
    text: bodyOnly,
    activeMissions: ctx.activeMissions ?? [],
    assignedTask: ctx.currentTask ?? ctx.missionTitle,
    ceoMessage: ctx.ceoMessage,
  });
  if (check.ok) return draft;
  return regenerateMissionScopedReply(ctx, check.reasons);
}

function composeEmployeeChatReplyDraft(ctx: ChatReplyContext): string {
  const ceoMessage = ctx.ceoMessage.trim() || "What should I know right now?";
  const def = getEmployeeDefinition(ctx.employeeId);
  const parts = buildOwnerOpeningParts(ctx.employeeId, {
    ceoMessage,
    priorBodies: priorBodies(ctx),
  });

  let body = formatContributionBody(parts);

  if (isEchoOfCeoMessage(ceoMessage, body)) {
    body = formatContributionBody({
      observation: `I'm reviewing this through my ${ctx.expertise[0]?.toLowerCase() ?? "WorkPilot"} lens.`,
      implication: "Restating the ask would not move the decision forward.",
      action: "I'll answer with one concrete next step on the active WorkPilot work item.",
    });
  }

  const contextLines: string[] = [];
  if (ctx.executionContext) {
    contextLines.push(
      ...formatMissionExecutionContextBrief(ctx.executionContext).slice(0, 5)
    );
  } else {
    if (ctx.workItemLine) contextLines.push(ctx.workItemLine);
    if (ctx.ownershipSummary) {
      contextLines.push(`Ownership: ${truncate(ctx.ownershipSummary, 140)}`);
    }
    if (ctx.currentTask) {
      contextLines.push(`Current task: ${truncate(ctx.currentTask, 120)}`);
    } else if (ctx.currentActivity) {
      contextLines.push(`Current focus: ${truncate(ctx.currentActivity, 120)}`);
    }
    if (ctx.missionTitle) {
      contextLines.push(
        `Assigned mission: ${truncate(ctx.missionTitle, 80)}${
          ctx.missionSummary ? ` — ${truncate(ctx.missionSummary, 100)}` : ""
        }`
      );
    }
    const scopeLine = missionScopeFocusLine(ctx.activeMissions ?? []);
    if (scopeLine) contextLines.push(scopeLine);
  }
  if (ctx.relatedRecommendationTitle) {
    contextLines.push(
      `Open recommendation: ${truncate(ctx.relatedRecommendationTitle, 100)}`
    );
  }
  if (ctx.memoryHints[0]) {
    contextLines.push(`From company memory: ${truncate(ctx.memoryHints[0], 110)}`);
  } else if (ctx.knowledgeHints[0]) {
    contextLines.push(`From company knowledge: ${truncate(ctx.knowledgeHints[0], 110)}`);
  }
  if (ctx.recentActivity[0]) {
    contextLines.push(`Recent floor signal: ${truncate(ctx.recentActivity[0], 110)}`);
  }

  const styleHint = truncate(
    def?.communicationStyle ?? ctx.communicationStyle ?? "Clear and action-oriented.",
    90
  );

  return [
    `${ctx.employeeName} (${ctx.employeeRole}) — ${styleHint}`,
    ...contextLines.slice(0, 5),
    "",
    body,
  ].join("\n");
}

/** Regenerate a mission- and role-safe reply after rejecting off-scope content. */
export function regenerateMissionScopedReply(
  ctx: ChatReplyContext,
  reasons: string[]
): string {
  const mission =
    ctx.activeMissions?.[0]?.title ??
    ctx.missionTitle ??
    "the active WorkPilot work item";
  const roleFocus =
    ctx.expertise[0] ??
    ctx.executionContext?.assignedRole ??
    ctx.employeeRole;
  const body = formatContributionBody({
    observation: `Prior draft was rejected (${reasons.slice(0, 2).join(", ") || "off_scope"}). Staying on ${mission}.`,
    implication:
      "Off-mission commercial customer-comms work is blocked while this WorkPilot objective is active.",
    action: `As ${roleFocus}, I'll take one next step only on the assigned WorkPilot task${
      ctx.currentTask ? ` (${truncate(ctx.currentTask, 80)})` : ""
    }.`,
  });

  return [
    `${ctx.employeeName} (${ctx.employeeRole}) — mission-scoped regenerate`,
    ...(ctx.executionContext
      ? formatMissionExecutionContextBrief(ctx.executionContext).slice(0, 4)
      : [
          missionScopeFocusLine(ctx.activeMissions ?? []) ??
            `Stay on active WorkPilot objective: ${mission}`,
        ]),
    "",
    body,
  ].join("\n");
}

/**
 * Proactively open a conversation when the employee has something the CEO should see.
 */
export function buildProactiveOpener(input: ProactiveOpenInput): HqChatMessage | null {
  const def = getEmployeeDefinition(input.employeeId);
  if (!def) return null;

  const already = input.existingMessages.some(
    (m) =>
      m.kind === "proactive" &&
      ((input.recommendation && m.recommendationId === input.recommendation.id) ||
        (!input.recommendation &&
          m.proactiveReason &&
          Date.parse(m.at) > Date.now() - 30 * 60_000))
  );
  if (already) return null;

  let reason: HqChatProactiveReason | null = null;
  let body = "";
  let recommendationId: string | null = null;

  if (
    input.recommendation &&
    (input.recommendation.status === "pending" ||
      input.recommendation.status === "questioned")
  ) {
    const urgent =
      /risk|block|urgent|critical/i.test(input.recommendation.title) ||
      /risk|block/i.test(input.recommendation.recommendation) ||
      input.recommendation.urgency === "Today" ||
      input.recommendation.priority === "Critical";
    reason = urgent ? "risk" : "approval_request";
    recommendationId = input.recommendation.id;
    body = urgent
      ? `I need your attention on a risk: ${input.recommendation.title}. ${truncate(
          input.recommendation.recommendation,
          180
        )} How do you want to proceed?`
      : `I have a decision ready for you: ${input.recommendation.title}. ${truncate(
          input.recommendation.recommendation,
          180
        )} Approve, reject, or ask me for evidence.`;
  } else if (input.pendingApprovalTitle) {
    reason = "approval_request";
    body = `I'm waiting on your approval for "${truncate(
      input.pendingApprovalTitle,
      100
    )}". I can walk you through the evidence if helpful.`;
  } else if (input.recentRiskActivity) {
    reason = "blocker";
    body = `I hit a blocker: ${truncate(
      input.recentRiskActivity,
      160
    )}. Do you want me to escalate, reassign, or pause?`;
  } else if (input.missionTitle && input.currentTask) {
    reason = "report";
    body = `Quick update on ${truncate(input.missionTitle, 80)}: ${truncate(
      input.currentTask,
      140
    )}. Any guidance before I continue?`;
  } else if (input.currentTask && /waiting|need|question|\?/i.test(input.currentTask)) {
    reason = "question";
    body = `I have a question before I continue: ${truncate(
      input.currentTask,
      160
    )}`;
  }

  if (!reason || !body) return null;

  return {
    id: newId("hqchat-proactive"),
    employeeId: input.employeeId,
    role: "employee",
    speakerName: def.name,
    speakerRole: def.role,
    body,
    at: input.now,
    kind: "proactive",
    proactiveReason: reason,
    recommendationId,
    clientRequestId: null,
  };
}

export function resolveQuickActions(input: {
  hasPendingRecommendation: boolean;
  proactiveReason?: HqChatProactiveReason | null;
}): HqChatQuickAction[] {
  if (!input.hasPendingRecommendation && !input.proactiveReason) return [];
  if (
    input.proactiveReason === "report" ||
    input.proactiveReason === "question"
  ) {
    return ["ask_evidence", "delay"];
  }
  return ["approve", "reject", "ask_evidence", "reassign", "delay"];
}

/** Split reply into streamable tokens (word-ish chunks). */
export function chunkReplyForStream(text: string, maxChunk = 18): string[] {
  const parts = text.split(/(\s+)/).filter((p) => p.length > 0);
  const chunks: string[] = [];
  let buf = "";
  for (const part of parts) {
    if ((buf + part).length > maxChunk && buf) {
      chunks.push(buf);
      buf = part;
    } else {
      buf += part;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length > 0 ? chunks : [text];
}

export function createCeoChatMessage(input: {
  employeeId: string;
  body: string;
  at: string;
  clientRequestId?: string | null;
}): HqChatMessage {
  return {
    id: newId("hqchat-ceo"),
    employeeId: input.employeeId,
    role: "ceo",
    speakerName: "CEO",
    speakerRole: "Executive",
    body: input.body.trim(),
    at: input.at,
    kind: "chat",
    clientRequestId: input.clientRequestId ?? null,
  };
}

export function createEmployeeChatMessage(input: {
  employeeId: string;
  body: string;
  at: string;
}): HqChatMessage {
  const def = getEmployeeDefinition(input.employeeId);
  return {
    id: newId("hqchat-emp"),
    employeeId: input.employeeId,
    role: "employee",
    speakerName: def?.name ?? input.employeeId,
    speakerRole: def?.role ?? "AI Employee",
    body: input.body,
    at: input.at,
    kind: "chat",
    clientRequestId: null,
  };
}

export { newId as newHqChatId };
