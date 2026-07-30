/**
 * AI Employee conversations, inbox, activity feed, and mission history.
 * Pure helpers — no Builder Runtime terminology in outputs.
 */

import { getEmployeeDefinition } from "./ai-company-employees";
import type {
  CollaborationMission,
  CollaborationStep,
  CollaborationApprovalState,
} from "./collaboration.logic";

export type ConversationTurn = {
  id: string;
  employeeId: string | "ceo" | "system";
  employeeName: string;
  role: string;
  body: string;
  at: string;
  kind: "handoff" | "update" | "request" | "approval" | "system";
};

export type ActivityFeedItem = {
  id: string;
  at: string;
  tone: "positive" | "attention" | "neutral";
  summary: string;
  employeeId: string | null;
  missionId: string | null;
};

export type InboxMessageStatus = "received" | "waiting_reply" | "sent" | "completed";

export type InboxMessage = {
  id: string;
  /** Employee who owns this inbox row. */
  employeeId: string;
  fromEmployeeId: string | "ceo";
  fromName: string;
  missionId: string;
  subject: string;
  body: string;
  status: InboxMessageStatus;
  at: string;
};

export type ApprovalLogEntry = {
  decision: "approve" | "reject" | "request_changes" | "submitted";
  note: string | null;
  at: string;
  actor: "ceo" | "employee";
};

export type ExecutionTimelineEvent = {
  id: string;
  at: string;
  summary: string;
};

export type MissionFinalOutcome =
  | "pending"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "completed";

export type MissionHistoryRecord = {
  id: string;
  title: string;
  mission: string;
  participatingEmployees: Array<{ id: string; name: string; role: string }>;
  conversations: ConversationTurn[];
  approvals: ApprovalLogEntry[];
  executionTimeline: ExecutionTimelineEvent[];
  finalOutcome: MissionFinalOutcome;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  durationDisplay: string | null;
};

export type CompanyDashboardMetrics = {
  activeMissions: number;
  employeesWorking: number;
  waitingForApproval: number;
  completedToday: number;
  averageCompletionTimeMs: number | null;
  averageCompletionTimeDisplay: string | null;
  companyProductivity: number;
};

const CONVERSATION_BY_ROLE: Record<string, { analyze: string; prepare: string; ready: string }> = {
  sarah: {
    analyze: "Customer requirements analyzed.",
    prepare: "Pipeline notes packaged for the proposal team.",
    ready: "Sales analysis handed off — ready for documentation.",
  },
  david: {
    analyze: "Reviewing inputs and outlining the document structure.",
    prepare: "Generating proposal based on the prior analysis.",
    ready: "Proposal draft is ready for delivery.",
  },
  emma: {
    analyze: "Checking recipients and tone for the outreach.",
    prepare: "Proposal attached. Draft email is ready.",
    ready: "Email draft queued — waiting on CEO approval.",
  },
  alex: {
    analyze: "Calendar scanned for conflicts and focus blocks.",
    prepare: "Schedule options prepared for the next step.",
    ready: "Conflict brief ready for review.",
  },
  mia: {
    analyze: "Meeting goals captured; agenda draft started.",
    prepare: "Notes and follow-ups drafted from the discussion.",
    ready: "Meeting pack ready for the team.",
  },
  noah: {
    analyze: "CRM records checked against the latest customer signal.",
    prepare: "Account brief updated for the next teammate.",
    ready: "CRM handoff complete.",
  },
  olivia: {
    analyze: "Spend and budget signals reviewed.",
    prepare: "Finance summary drafted for approval.",
    ready: "Finance digest ready.",
  },
  ethan: {
    analyze: "Support queue triaged; priority ticket identified.",
    prepare: "Customer response drafted for review.",
    ready: "Support reply ready for CEO approval.",
  },
};

function offsetIso(base: string, seconds: number): string {
  const t = Date.parse(base);
  if (Number.isNaN(t)) return base;
  return new Date(t + seconds * 1000).toISOString();
}

function conversationBodyForStep(step: CollaborationStep, index: number): string {
  const lines = CONVERSATION_BY_ROLE[step.employeeId];
  if (!lines) {
    return `${step.employeeName}: ${step.message}`;
  }
  if (index === 0) return lines.analyze;
  if (step.stage === "await_approval") return lines.ready;
  return lines.prepare;
}

export function buildConversationTimeline(
  chain: CollaborationStep[],
  missionId: string,
  now: string
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  chain.forEach((step, index) => {
    turns.push({
      id: `${missionId}-conv-${index}`,
      employeeId: step.employeeId,
      employeeName: step.employeeName,
      role: step.role,
      body: conversationBodyForStep(step, index),
      at: offsetIso(now, index * 45),
      kind: index === 0 ? "update" : index === chain.length - 1 ? "request" : "handoff",
    });
  });
  turns.push({
    id: `${missionId}-conv-ceo`,
    employeeId: "ceo",
    employeeName: "CEO",
    role: "Executive",
    body: "Approve or Request Changes",
    at: offsetIso(now, chain.length * 45 + 15),
    kind: "approval",
  });
  return turns;
}

export function buildInboxForMission(
  chain: CollaborationStep[],
  mission: { id: string; title: string },
  now: string
): InboxMessage[] {
  const messages: InboxMessage[] = [];
  for (let i = 0; i < chain.length; i++) {
    const step = chain[i];
    const prev = i > 0 ? chain[i - 1] : null;
    const isLast = i === chain.length - 1;

    if (i === 0) {
      messages.push({
        id: `${mission.id}-inbox-${step.employeeId}-receive`,
        employeeId: step.employeeId,
        fromEmployeeId: "ceo",
        fromName: "CEO",
        missionId: mission.id,
        subject: mission.title,
        body: `New mission assigned: ${mission.title}`,
        status: "received",
        at: now,
      });
    }

    if (prev) {
      messages.push({
        id: `${mission.id}-inbox-${step.employeeId}-from-${prev.employeeId}`,
        employeeId: step.employeeId,
        fromEmployeeId: prev.employeeId,
        fromName: prev.employeeName,
        missionId: mission.id,
        subject: mission.title,
        body: `${prev.employeeName} sent work: ${conversationBodyForStep(prev, i - 1)}`,
        status: isLast ? "waiting_reply" : "received",
        at: offsetIso(now, i * 40),
      });
      messages.push({
        id: `${mission.id}-inbox-${prev.employeeId}-sent-${step.employeeId}`,
        employeeId: prev.employeeId,
        fromEmployeeId: prev.employeeId,
        fromName: prev.employeeName,
        missionId: mission.id,
        subject: `Sent to ${step.employeeName}`,
        body: `Handed off “${mission.title}” to ${step.employeeName}.`,
        status: "sent",
        at: offsetIso(now, i * 40 - 5),
      });
    }

    if (isLast) {
      messages.push({
        id: `${mission.id}-inbox-${step.employeeId}-await`,
        employeeId: step.employeeId,
        fromEmployeeId: step.employeeId,
        fromName: step.employeeName,
        missionId: mission.id,
        subject: "Waiting on CEO",
        body: conversationBodyForStep(step, i),
        status: "waiting_reply",
        at: offsetIso(now, i * 40 + 10),
      });
    }
  }
  return messages;
}

export function buildActivityEventsForMission(
  chain: CollaborationStep[],
  mission: { id: string; title: string },
  now: string
): ActivityFeedItem[] {
  const events: ActivityFeedItem[] = [];
  chain.forEach((step, index) => {
    const started =
      index === 0
        ? `${step.employeeName} completed analysis for “${mission.title}”.`
        : step.stage === "await_approval"
          ? `${step.employeeName} prepared work and is waiting for approval.`
          : step.employeeId === "alex"
            ? `${step.employeeName} detected a schedule conflict.`
            : step.employeeId === "david"
              ? `${step.employeeName} requested additional information.`
              : `${step.employeeName} started preparing ${step.role.toLowerCase()} work.`;

    const tone: ActivityFeedItem["tone"] =
      step.stage === "await_approval"
        ? "attention"
        : step.employeeId === "david" && index > 0
          ? "attention"
          : "positive";

    events.push({
      id: `${mission.id}-act-${index}`,
      at: offsetIso(now, index * 50),
      tone,
      summary: started,
      employeeId: step.employeeId,
      missionId: mission.id,
    });
  });
  events.push({
    id: `${mission.id}-act-await-ceo`,
    at: offsetIso(now, chain.length * 50 + 10),
    tone: "attention",
    summary: `Mission “${mission.title}” is waiting for CEO approval.`,
    employeeId: null,
    missionId: mission.id,
  });
  return events;
}

export function buildExecutionTimeline(
  chain: CollaborationStep[],
  missionId: string,
  now: string
): ExecutionTimelineEvent[] {
  return [
    {
      id: `${missionId}-tl-start`,
      at: now,
      summary: "Mission started",
    },
    ...chain.map((step, index) => ({
      id: `${missionId}-tl-${index}`,
      at: offsetIso(now, (index + 1) * 40),
      summary: `${step.employeeName}: ${step.stage.replace(/_/g, " ")}`,
    })),
    {
      id: `${missionId}-tl-gate`,
      at: offsetIso(now, (chain.length + 1) * 40),
      summary: "Awaiting CEO decision",
    },
  ];
}

export function outcomeFromApproval(
  status: CollaborationApprovalState
): MissionFinalOutcome {
  if (status === "approved") return "completed";
  if (status === "rejected") return "rejected";
  if (status === "changes_requested") return "changes_requested";
  return "pending";
}

export function formatDurationMs(ms: number | null): string | null {
  if (ms == null || ms < 0) return null;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${hr}h ${m}m` : `${hr}h`;
}

/** Attach conversation / inbox / feed fields when missing (backward compatible). */
export function ensureMissionCommunications(
  mission: CollaborationMission
): CollaborationMission {
  if (
    mission.conversations?.length &&
    mission.activityEvents?.length &&
    mission.inbox?.length &&
    mission.executionTimeline?.length
  ) {
    return {
      ...mission,
      finalOutcome: mission.finalOutcome ?? outcomeFromApproval(mission.approvalStatus),
      completedAt: mission.completedAt ?? null,
      approvalsLog: mission.approvalsLog ?? [
        {
          decision: "submitted" as const,
          note: null,
          at: mission.createdAt,
          actor: "employee" as const,
        },
      ],
    };
  }

  const now = mission.createdAt;
  return {
    ...mission,
    conversations:
      mission.conversations?.length
        ? mission.conversations
        : buildConversationTimeline(mission.chain, mission.id, now),
    activityEvents:
      mission.activityEvents?.length
        ? mission.activityEvents
        : buildActivityEventsForMission(mission.chain, mission, now),
    inbox:
      mission.inbox?.length
        ? mission.inbox
        : buildInboxForMission(mission.chain, mission, now),
    approvalsLog: mission.approvalsLog ?? [
      {
        decision: "submitted",
        note: null,
        at: mission.createdAt,
        actor: "employee",
      },
    ],
    executionTimeline:
      mission.executionTimeline?.length
        ? mission.executionTimeline
        : buildExecutionTimeline(mission.chain, mission.id, now),
    finalOutcome: mission.finalOutcome ?? outcomeFromApproval(mission.approvalStatus),
    completedAt: mission.completedAt ?? null,
  };
}

export function appendApprovalCommunications(
  mission: CollaborationMission,
  decision: "approve" | "reject" | "request_changes",
  note: string | null,
  now: string
): Pick<
  CollaborationMission,
  | "conversations"
  | "activityEvents"
  | "inbox"
  | "approvalsLog"
  | "executionTimeline"
  | "finalOutcome"
  | "completedAt"
> {
  const base = ensureMissionCommunications(mission);
  const decisionLabel =
    decision === "approve"
      ? "CEO approved proposal."
      : decision === "reject"
        ? "CEO rejected the proposal."
        : "CEO requested changes.";

  const conversations = [
    ...base.conversations!,
    {
      id: `${mission.id}-conv-ceo-${now}`,
      employeeId: "ceo" as const,
      employeeName: "CEO",
      role: "Executive",
      body: note
        ? `${decisionLabel.replace(/\.$/, "")}: ${note}`
        : decisionLabel,
      at: now,
      kind: "approval" as const,
    },
  ];

  const activityEvents = [
    {
      id: `${mission.id}-act-ceo-${now}`,
      at: now,
      tone: (decision === "approve" ? "positive" : "attention") as ActivityFeedItem["tone"],
      summary: decisionLabel,
      employeeId: null,
      missionId: mission.id,
    },
    ...base.activityEvents!,
  ];

  const inbox = base.inbox!.map((msg) => {
    if (msg.status === "waiting_reply") {
      return {
        ...msg,
        status:
          decision === "approve"
            ? ("completed" as const)
            : decision === "reject"
              ? ("completed" as const)
              : ("received" as const),
        body:
          decision === "approve"
            ? `CEO approved. ${msg.body}`
            : decision === "reject"
              ? `CEO declined. ${msg.body}`
              : `CEO requested changes. ${note ?? ""}`.trim(),
      };
    }
    return msg;
  });

  // After approve, executor receives execute work.
  if (decision === "approve") {
    const waiter = mission.chain.find((s) => s.status === "waiting_approval") ??
      mission.chain[mission.chain.length - 1];
    if (waiter) {
      inbox.unshift({
        id: `${mission.id}-inbox-exec-${now}`,
        employeeId: waiter.employeeId,
        fromEmployeeId: "ceo",
        fromName: "CEO",
        missionId: mission.id,
        subject: "Approved — execute",
        body: `You are cleared to execute “${mission.title}”.`,
        status: "received",
        at: now,
      });
      activityEvents.unshift({
        id: `${mission.id}-act-exec-${now}`,
        at: offsetIso(now, 5),
        tone: "positive",
        summary: `${waiter.employeeName} started preparing ${waiter.role.toLowerCase()} work.`,
        employeeId: waiter.employeeId,
        missionId: mission.id,
      });
    }
  }

  const approvalsLog = [
    ...base.approvalsLog!,
    {
      decision,
      note,
      at: now,
      actor: "ceo" as const,
    },
  ];

  const executionTimeline = [
    ...base.executionTimeline!,
    {
      id: `${mission.id}-tl-ceo-${now}`,
      at: now,
      summary: decisionLabel,
    },
  ];

  const completed =
    decision === "approve" || decision === "reject"
      ? now
      : base.completedAt ?? null;

  return {
    conversations,
    activityEvents,
    inbox,
    approvalsLog,
    executionTimeline,
    finalOutcome:
      decision === "approve"
        ? "completed"
        : decision === "reject"
          ? "rejected"
          : "changes_requested",
    completedAt: completed,
  };
}

export function buildCompanyActivityFeed(
  missions: CollaborationMission[],
  limit = 40
): ActivityFeedItem[] {
  const items: ActivityFeedItem[] = [];
  for (const m of missions) {
    const enriched = ensureMissionCommunications(m);
    items.push(...(enriched.activityEvents ?? []));
  }
  return items
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export function listInboxForEmployee(
  employeeId: string,
  missions: CollaborationMission[]
): InboxMessage[] {
  const items: InboxMessage[] = [];
  for (const m of missions) {
    const enriched = ensureMissionCommunications(m);
    for (const msg of enriched.inbox ?? []) {
      if (msg.employeeId === employeeId) items.push(msg);
    }
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

export function toMissionHistory(mission: CollaborationMission): MissionHistoryRecord {
  const m = ensureMissionCommunications(mission);
  const startedAt = m.createdAt;
  const completedAt = m.completedAt ?? null;
  const durationMs =
    completedAt && Date.parse(completedAt) >= Date.parse(startedAt)
      ? Date.parse(completedAt) - Date.parse(startedAt)
      : null;

  const participatingEmployees = m.chain.map((s) => {
    const def = getEmployeeDefinition(s.employeeId);
    return {
      id: s.employeeId,
      name: def?.name ?? s.employeeName,
      role: def?.role ?? s.role,
    };
  });

  return {
    id: m.id,
    title: m.title,
    mission: m.mission,
    participatingEmployees,
    conversations: m.conversations ?? [],
    approvals: m.approvalsLog ?? [],
    executionTimeline: m.executionTimeline ?? [],
    finalOutcome: m.finalOutcome ?? outcomeFromApproval(m.approvalStatus),
    startedAt,
    completedAt,
    durationMs,
    durationDisplay: formatDurationMs(durationMs),
  };
}

export function listMissionHistory(
  missions: CollaborationMission[],
  limit = 30
): MissionHistoryRecord[] {
  return missions
    .map(toMissionHistory)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}

export function computeCompanyMetrics(
  missions: CollaborationMission[],
  workingEmployeeCount: number
): CompanyDashboardMetrics {
  const enriched = missions.map(ensureMissionCommunications);
  const activeMissions = enriched.filter(
    (m) => m.approvalStatus === "pending" || m.approvalStatus === "changes_requested" || m.approvalStatus === "approved"
  ).length;
  const waitingForApproval = enriched.filter(
    (m) => m.approvalStatus === "pending" || m.approvalStatus === "changes_requested"
  ).length;

  const today = new Date().toISOString().slice(0, 10);
  const completed = enriched.filter(
    (m) =>
      (m.finalOutcome === "completed" || m.approvalStatus === "approved") &&
      (m.completedAt ?? m.updatedAt).startsWith(today)
  );
  const durations = completed
    .map((m) => toMissionHistory(m).durationMs)
    .filter((d): d is number => typeof d === "number" && d >= 0);
  const averageCompletionTimeMs =
    durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;

  // Productivity: blend completion rate, low wait backlog, and active work.
  const total = Math.max(1, enriched.length);
  const doneRate = enriched.filter((m) => m.finalOutcome === "completed" || m.approvalStatus === "approved").length / total;
  const waitPenalty = Math.min(0.35, waitingForApproval * 0.05);
  const workBoost = Math.min(0.2, workingEmployeeCount * 0.04);
  const companyProductivity = Math.round(
    Math.min(99, Math.max(12, (doneRate * 70 + workBoost * 100) * (1 - waitPenalty) + 20))
  );

  return {
    activeMissions,
    employeesWorking: workingEmployeeCount,
    waitingForApproval,
    completedToday: completed.length,
    averageCompletionTimeMs,
    averageCompletionTimeDisplay: formatDurationMs(averageCompletionTimeMs),
    companyProductivity,
  };
}
