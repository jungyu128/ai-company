/**
 * HQ desk chat service — contextual replies, persistence, proactive openers.
 */

import path from "node:path";
import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
} from "./ai-company-employees";
import { listCollaborations } from "./collaboration.store";
import type { CollaborationMission } from "./collaboration.logic";
import { buildCompanyActivityFeed } from "./conversation.logic";
import { listMemories } from "./memory/memory.store";
import { listProactiveRecommendations } from "./proactive.store";
import { listApprovalCenter } from "./approval.service";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";
import {
  buildEmployeeChatReply,
  buildProactiveOpener,
  chunkReplyForStream,
  createCeoChatMessage,
  createEmployeeChatMessage,
  resolveQuickActions,
  type HqChatMessage,
  type HqChatQuickAction,
  type ChatReplyContext,
} from "./hq-chat.logic";
import {
  appendChatMessages,
  findMessageByClientRequestId,
  getChatThread,
  listUnreadProactiveEmployeeIds,
  markChatThreadRead,
  saveChatThread,
  type HqChatThread,
} from "./hq-chat.store";
import {
  formatWorkItemLine,
  getEmployeeDevContext,
  maybeClarificationReply,
  runAutonomousCompanyCycle,
} from "./autonomous-company";

export type HqChatThreadView = {
  employeeId: string;
  messages: HqChatMessage[];
  updatedAt: string;
  unreadProactive: boolean;
  quickActions: HqChatQuickAction[];
  relatedRecommendationId: string | null;
};

function relatedRecommendationFor(
  employeeId: string,
  workspaceId: string,
  repoRoot: string
) {
  return (
    listProactiveRecommendations(repoRoot, workspaceId).find(
      (r) =>
        (r.status === "pending" || r.status === "questioned") &&
        (r.conversationOwnerId === employeeId ||
          r.leadEmployeeId === employeeId ||
          r.participatingEmployees.some((p) => p.id === employeeId))
    ) ?? null
  );
}

function activeMissionFor(
  employeeId: string,
  missions: CollaborationMission[]
): CollaborationMission | null {
  return (
    missions.find(
      (m) =>
        m.approvalStatus !== "rejected" &&
        (m.leadEmployeeId === employeeId ||
          m.chain.some((s) => s.employeeId === employeeId && s.status !== "completed"))
    ) ?? null
  );
}

function taskForEmployee(
  employeeId: string,
  mission: CollaborationMission | null
): { currentTask: string | null; currentActivity: string | null } {
  if (!mission) return { currentTask: null, currentActivity: null };
  const step =
    mission.chain.find(
      (s) =>
        s.employeeId === employeeId &&
        s.status !== "completed" &&
        s.status !== "queued"
    ) ?? mission.chain.find((s) => s.employeeId === employeeId);
  return {
    currentTask: step?.message ?? mission.title,
    currentActivity: step?.message ?? null,
  };
}

function gatherReplyContext(input: {
  employeeId: string;
  ceoMessage: string;
  priorMessages: HqChatMessage[];
  workspaceId: string;
  repoRoot: string;
}): ChatReplyContext {
  const def = getEmployeeDefinition(input.employeeId);
  const missions = listCollaborations(input.repoRoot, input.workspaceId);
  const mission = activeMissionFor(input.employeeId, missions);
  const { currentTask, currentActivity } = taskForEmployee(
    input.employeeId,
    mission
  );
  const memories = listMemories(input.repoRoot, input.workspaceId)
    .filter((m) => m.ceoStatus === "accepted" || m.ceoStatus === "pending")
    .slice(0, 5)
    .map((m) => m.insight || m.title);
  const feed = buildCompanyActivityFeed(missions)
    .filter((a) => a.employeeId === input.employeeId || a.employeeId == null)
    .slice(0, 5)
    .map((a) => a.summary);
  const rec = relatedRecommendationFor(
    input.employeeId,
    input.workspaceId,
    input.repoRoot
  );
  const dev = getEmployeeDevContext({
    employeeId: input.employeeId,
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
  });
  const workItem =
    dev.primaryWorkItem ??
    (mission
      ? {
          kind: "task" as const,
          id: mission.id,
          title: mission.title,
          url: null,
          refs: [mission.id],
        }
      : null);

  return {
    employeeId: input.employeeId,
    employeeName: def?.name ?? input.employeeId,
    employeeRole: def?.role ?? "AI Employee",
    expertise: def?.expertise ?? [],
    communicationStyle: def?.communicationStyle ?? "",
    currentTask: currentTask ?? dev.tasks[0]?.title ?? null,
    currentActivity,
    missionTitle: mission?.title ?? null,
    missionSummary: mission?.mission ?? null,
    memoryHints: memories,
    knowledgeHints: (def?.responsibilities ?? []).slice(0, 3),
    recentActivity: feed,
    priorMessages: input.priorMessages.map((m) => ({
      role: m.role,
      body: m.body,
    })),
    ceoMessage: input.ceoMessage,
    relatedRecommendationTitle: rec?.title ?? null,
    relatedRecommendationBody: rec?.recommendation ?? null,
    workItemLine: workItem ? formatWorkItemLine(workItem) : null,
    ownershipSummary: dev.ownership
      ? `${dev.ownership.disciplines.join(", ")} — ${dev.ownership.owns.slice(0, 3).join("; ")}`
      : null,
  };
}

/**
 * Ensure proactive opener exists when the employee has something to raise.
 */
export function ensureProactiveChat(input: {
  employeeId: string;
  workspaceId?: string;
  repoRoot?: string;
  now?: string;
}): { thread: HqChatThread; opened: boolean; message: HqChatMessage | null } {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const employeeId = input.employeeId;
  if (!getEmployeeDefinition(employeeId)) {
    return {
      thread: getChatThread(employeeId, root, workspaceId),
      opened: false,
      message: null,
    };
  }

  const thread = getChatThread(employeeId, root, workspaceId);
  const missions = listCollaborations(root, workspaceId);
  const mission = activeMissionFor(employeeId, missions);
  const { currentTask } = taskForEmployee(employeeId, mission);
  const approvals = listApprovalCenter(root, workspaceId).filter(
    (a) => a.requestingEmployee.id === employeeId
  );
  const rec = relatedRecommendationFor(employeeId, workspaceId, root);
  const riskActivity =
    buildCompanyActivityFeed(missions).find(
      (a) =>
        a.employeeId === employeeId &&
        (a.tone === "attention" || /block|risk|fail|wait/i.test(a.summary))
    )?.summary ?? null;

  const opener = buildProactiveOpener({
    employeeId,
    now,
    currentTask,
    missionTitle: mission?.title ?? null,
    pendingApprovalTitle: approvals[0]?.title ?? null,
    recommendation: rec
      ? {
          id: rec.id,
          title: rec.title,
          recommendation: rec.recommendation,
          priority: rec.priority ?? null,
          urgency: rec.urgency ?? null,
          status: rec.status,
        }
      : null,
    recentRiskActivity: riskActivity,
    existingMessages: thread.messages,
  });

  if (!opener) {
    return { thread, opened: false, message: null };
  }

  const next = appendChatMessages({
    employeeId,
    messages: [opener],
    unreadProactive: true,
    repoRoot: root,
    workspaceId,
  });
  return { thread: next, opened: true, message: opener };
}

export function bootstrapProactiveChats(input?: {
  workspaceId?: string;
  repoRoot?: string;
  now?: string;
}): string[] {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  // Autonomous WorkPilot company cycle (tasks, peer discussion, CEO reports → chat)
  runAutonomousCompanyCycle({
    repoRoot: root,
    workspaceId,
    now: input?.now,
    deliverToChat: true,
  });
  const opened: string[] = [];
  for (const emp of AI_COMPANY_EMPLOYEES) {
    const result = ensureProactiveChat({
      employeeId: emp.id,
      workspaceId,
      repoRoot: root,
      now: input?.now,
    });
    if (result.opened) opened.push(emp.id);
  }
  return opened;
}

export function getHqChatThreadView(input: {
  employeeId: string;
  workspaceId?: string;
  repoRoot?: string;
  markRead?: boolean;
}): HqChatThreadView {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  ensureProactiveChat({
    employeeId: input.employeeId,
    workspaceId,
    repoRoot: root,
  });
  let thread = getChatThread(input.employeeId, root, workspaceId);
  if (input.markRead) {
    thread = markChatThreadRead(input.employeeId, root, workspaceId);
  }
  const rec = relatedRecommendationFor(input.employeeId, workspaceId, root);
  const lastProactive = [...thread.messages]
    .reverse()
    .find((m) => m.kind === "proactive");
  return {
    employeeId: input.employeeId,
    messages: thread.messages,
    updatedAt: thread.updatedAt,
    unreadProactive: thread.unreadProactive,
    quickActions: resolveQuickActions({
      hasPendingRecommendation: Boolean(rec),
      proactiveReason: lastProactive?.proactiveReason ?? null,
    }),
    relatedRecommendationId: rec?.id ?? null,
  };
}

export type SendHqChatResult =
  | {
      ok: true;
      ceoMessage: HqChatMessage;
      employeeMessage: HqChatMessage;
      quickActions: HqChatQuickAction[];
      relatedRecommendationId: string | null;
      replayed: boolean;
      chunks: string[];
    }
  | { ok: false; code: string; message: string; status: number };

export function sendHqChatMessage(input: {
  employeeId: string;
  message: string;
  clientRequestId?: string | null;
  workspaceId?: string;
  repoRoot?: string;
  now?: string;
}): SendHqChatResult {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const employeeId = input.employeeId.trim();
  const text = input.message.trim();

  if (!getEmployeeDefinition(employeeId)) {
    return {
      ok: false,
      code: "UNKNOWN_EMPLOYEE",
      message: "Unknown employee",
      status: 404,
    };
  }
  if (!text) {
    return {
      ok: false,
      code: "EMPTY_MESSAGE",
      message: "Message cannot be empty",
      status: 400,
    };
  }

  if (input.clientRequestId) {
    const existing = findMessageByClientRequestId(
      employeeId,
      input.clientRequestId,
      root,
      workspaceId
    );
    if (existing?.employee) {
      const rec = relatedRecommendationFor(employeeId, workspaceId, root);
      const thread = getChatThread(employeeId, root, workspaceId);
      const lastProactive = [...thread.messages]
        .reverse()
        .find((m) => m.kind === "proactive");
      return {
        ok: true,
        ceoMessage: existing.ceo,
        employeeMessage: existing.employee,
        quickActions: resolveQuickActions({
          hasPendingRecommendation: Boolean(rec),
          proactiveReason: lastProactive?.proactiveReason ?? null,
        }),
        relatedRecommendationId: rec?.id ?? null,
        replayed: true,
        chunks: chunkReplyForStream(existing.employee.body),
      };
    }
  }

  const thread = getChatThread(employeeId, root, workspaceId);
  const ceoMessage = createCeoChatMessage({
    employeeId,
    body: text,
    at: now,
    clientRequestId: input.clientRequestId ?? null,
  });

  const ctx = gatherReplyContext({
    employeeId,
    ceoMessage: text,
    priorMessages: thread.messages,
    workspaceId,
    repoRoot: root,
  });
  // Prefer clarification over assumptions when WorkPilot requirements are incomplete.
  const clarification = maybeClarificationReply({
    employeeId,
    ceoMessage: text,
    repoRoot: root,
    workspaceId,
  });
  const replyBody = clarification ?? buildEmployeeChatReply(ctx);
  const employeeMessage = createEmployeeChatMessage({
    employeeId,
    body: replyBody,
    at: new Date(Date.parse(now) + 800).toISOString(),
  });

  appendChatMessages({
    employeeId,
    messages: [ceoMessage, employeeMessage],
    unreadProactive: false,
    repoRoot: root,
    workspaceId,
  });

  const rec = relatedRecommendationFor(employeeId, workspaceId, root);
  const lastProactive = [...thread.messages, ceoMessage, employeeMessage]
    .reverse()
    .find((m) => m.kind === "proactive");

  return {
    ok: true,
    ceoMessage,
    employeeMessage,
    quickActions: resolveQuickActions({
      hasPendingRecommendation: Boolean(rec),
      proactiveReason: lastProactive?.proactiveReason ?? null,
    }),
    relatedRecommendationId: rec?.id ?? null,
    replayed: false,
    chunks: chunkReplyForStream(replyBody),
  };
}

export function listProactiveChatTargets(input?: {
  workspaceId?: string;
  repoRoot?: string;
}): string[] {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  bootstrapProactiveChats({ workspaceId, repoRoot: root });
  return listUnreadProactiveEmployeeIds(root, workspaceId);
}

/** Test helper — replace thread wholesale. */
export function replaceChatThreadForTests(
  thread: HqChatThread,
  repoRoot?: string,
  workspaceId?: string
) {
  return saveChatThread(
    thread,
    repoRoot ?? process.cwd(),
    workspaceId ?? DEFAULT_WORKSPACE_ID
  );
}
