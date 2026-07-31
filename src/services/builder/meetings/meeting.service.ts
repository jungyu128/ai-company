/**
 * AI Company Meeting System — create, discuss, CEO decide, timeline/audit.
 * Preserves HQ UI / chat / Continuous OS / role enforcement / execution safety.
 */

import path from "node:path";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { listCollaborations } from "../collaboration.store";
import { listActiveWorkpilotMissions } from "../autonomous-company/mission-scope.logic";
import { getAutonomyStore } from "../autonomous-company/autonomous-company.store";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { logOpsEvent } from "../hardening/ops-log";
import { recordLongTermMemory } from "../memory/memory.service";
import {
  buildMeetingDraft,
  detectNeededMeetings,
  runMeetingDiscussion,
} from "./meeting.logic";
import {
  getMeetingById,
  listMeetings,
  listOpenMeetingKinds,
  upsertMeeting,
} from "./meeting.store";
import type {
  CeoMeetingAction,
  CompanyMeeting,
  MeetingKind,
} from "./types";

function newCommentId(): string {
  return `mcc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function auditMeeting(
  meeting: CompanyMeeting,
  input: {
    workspaceId: string;
    repoRoot: string;
    summary: string;
    actorUserId: string | null;
    actorName: string;
    actorRole: "owner" | "ai_employee" | "system";
    auditAction: string;
  }
) {
  recordWorkspaceEvent({
    workspaceId: input.workspaceId,
    kind: "mission",
    summary: input.summary,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    relatedType: "meeting",
    relatedId: meeting.id,
    status: meeting.status,
    auditAction: input.auditAction,
    auditResult: "ok",
    repoRoot: input.repoRoot,
  });
}

export function listCompanyMeetings(input?: {
  repoRoot?: string;
  workspaceId?: string;
  limit?: number;
}): CompanyMeeting[] {
  return listMeetings(
    input?.repoRoot ?? process.cwd(),
    input?.workspaceId ?? DEFAULT_WORKSPACE_ID,
    input?.limit ?? 80
  );
}

export function getCompanyMeeting(input: {
  meetingId: string;
  repoRoot?: string;
  workspaceId?: string;
}): CompanyMeeting | null {
  return getMeetingById(
    input.meetingId,
    input.repoRoot ?? process.cwd(),
    input.workspaceId ?? DEFAULT_WORKSPACE_ID
  );
}

export function createCompanyMeeting(input: {
  kind: MeetingKind;
  workItemId?: string | null;
  workItemTitle?: string | null;
  missionId?: string | null;
  purpose?: string | null;
  organizerEmployeeId?: string | null;
  runDiscussion?: boolean;
  presentToCeo?: boolean;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; meeting: CompanyMeeting }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();

  let meeting = buildMeetingDraft({
    kind: input.kind,
    now,
    workItemId: input.workItemId,
    workItemTitle: input.workItemTitle,
    missionId: input.missionId,
    purpose: input.purpose,
    organizerEmployeeId: input.organizerEmployeeId,
  });

  if (input.runDiscussion !== false) {
    const discussed = runMeetingDiscussion({ meeting, now });
    meeting = {
      ...meeting,
      status: input.presentToCeo === false ? "in_discussion" : "awaiting_ceo",
      discussion: discussed.discussion,
      decisions: discussed.decisions,
      actionItems: discussed.actionItems,
      owners: discussed.owners,
      dueDates: discussed.dueDates,
      synthesis: discussed.synthesis,
      presentedToCeoAt:
        input.presentToCeo === false ? null : now,
      updatedAt: now,
    };
  }

  upsertMeeting(meeting, root, workspaceId);
  auditMeeting(meeting, {
    workspaceId,
    repoRoot: root,
    summary: `${meeting.participantIds[0] ?? "Team"} created ${meeting.title}`,
    actorUserId: null,
    actorName: "AI Company",
    actorRole: "ai_employee",
    auditAction: "meeting.create",
  });
  recordLongTermMemory({
    record: {
      kind: "discussion",
      title: meeting.title,
      insight:
        meeting.synthesis ??
        `Meeting ${meeting.kind} discussed WorkPilot objective with ${meeting.participantIds.length} participants.`,
      employeeIds: meeting.participantIds,
      projectKey: "workpilot",
      workItemId: meeting.workItemId ?? meeting.missionId,
      workItemTitle: meeting.workItemTitle,
      occurredAt: now,
      sourceRefs: [meeting.id, ...meeting.decisions.map((d) => d.id)],
      tags: ["meeting", meeting.kind],
      confidence: 72,
      patternKey: `ltm:discussion:meeting:${meeting.kind}:${meeting.workItemId ?? meeting.id}`,
    },
    repoRoot: root,
    workspaceId,
    now,
  });
  if (meeting.status === "awaiting_ceo") {
    auditMeeting(meeting, {
      workspaceId,
      repoRoot: root,
      summary: `Meeting ready for CEO: ${meeting.title}`,
      actorUserId: null,
      actorName: "AI Company",
      actorRole: "system",
      auditAction: "meeting.present",
    });
  }
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "meeting.create",
    executionStatus: meeting.status,
  });
  return { ok: true, meeting };
}

/**
 * Scan WorkPilot missions/tasks and auto-create needed meetings (discuss first).
 */
export function autoCreateNeededMeetings(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): CompanyMeeting[] {
  if (!isInternalAiCompanyEnabled()) return [];
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();

  const missions = listActiveWorkpilotMissions(
    listCollaborations(root, workspaceId)
  );
  const tasks = getAutonomyStore(root, workspaceId).tasks.filter(
    (t) => t.status !== "done"
  );
  const hints = detectNeededMeetings({
    now,
    missionTitles: missions.map((m) => m.title),
    taskTitles: tasks.map((t) => t.title),
    taskStatuses: tasks.map((t) => t.status),
    existingOpenKinds: listOpenMeetingKinds(root, workspaceId),
  });

  const created: CompanyMeeting[] = [];
  for (const hint of hints) {
    const mission = missions[0] ?? null;
    const result = createCompanyMeeting({
      kind: hint.kind,
      workItemTitle: hint.workItemTitle ?? mission?.title ?? null,
      workItemId: mission?.id ?? null,
      missionId: mission?.id ?? null,
      purpose: hint.reason,
      runDiscussion: true,
      presentToCeo: true,
      repoRoot: root,
      workspaceId,
      now,
    });
    if (result.ok) created.push(result.meeting);
  }
  return created;
}

export function applyCeoMeetingAction(input: {
  meetingId: string;
  action: CeoMeetingAction;
  note?: string | null;
  actorUserId: string;
  actorName: string;
  postponeUntil?: string | null;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; meeting: CompanyMeeting }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const existing = getMeetingById(input.meetingId, root, workspaceId);
  if (!existing) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Meeting not found",
      status: 404,
    };
  }

  let meeting: CompanyMeeting = { ...existing, updatedAt: now };

  switch (input.action) {
    case "join":
      meeting = {
        ...meeting,
        ceoJoined: true,
        ceoComments: [
          ...meeting.ceoComments,
          {
            id: newCommentId(),
            at: now,
            body: input.note?.trim() || "CEO joined the meeting",
            actorUserId: input.actorUserId,
            actorName: input.actorName,
          },
        ],
      };
      break;
    case "comment": {
      const body = input.note?.trim();
      if (!body) {
        return {
          ok: false,
          code: "INVALID",
          message: "comment requires note",
          status: 400,
        };
      }
      meeting = {
        ...meeting,
        ceoJoined: true,
        ceoComments: [
          ...meeting.ceoComments,
          {
            id: newCommentId(),
            at: now,
            body,
            actorUserId: input.actorUserId,
            actorName: input.actorName,
          },
        ],
      };
      break;
    }
    case "approve":
      meeting = {
        ...meeting,
        status: "approved",
        ceoJoined: true,
        ceoDecision: "approve",
        ceoNote: input.note ?? null,
        decisions: meeting.decisions.map((d) =>
          d.status === "proposed" ? { ...d, status: "approved" as const } : d
        ),
      };
      break;
    case "postpone":
      meeting = {
        ...meeting,
        status: "postponed",
        ceoJoined: true,
        ceoDecision: "postpone",
        ceoNote:
          input.note?.trim() ||
          (input.postponeUntil
            ? `Postponed until ${input.postponeUntil}`
            : "Postponed by CEO"),
      };
      break;
    case "reject":
      meeting = {
        ...meeting,
        status: "rejected",
        ceoJoined: true,
        ceoDecision: "reject",
        ceoNote: input.note ?? "Rejected by CEO",
        decisions: meeting.decisions.map((d) =>
          d.status === "proposed" ? { ...d, status: "rejected" as const } : d
        ),
        actionItems: meeting.actionItems.map((a) =>
          a.status === "open" ? { ...a, status: "cancelled" as const } : a
        ),
      };
      break;
    default:
      return {
        ok: false,
        code: "INVALID",
        message: "Unknown CEO meeting action",
        status: 400,
      };
  }

  upsertMeeting(meeting, root, workspaceId);
  auditMeeting(meeting, {
    workspaceId,
    repoRoot: root,
    summary: `CEO ${input.action} on meeting ${meeting.title}`,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorRole: "owner",
    auditAction: `meeting.ceo_${input.action}`,
  });

  if (input.action === "approve" || input.action === "reject") {
    recordLongTermMemory({
      record: {
        kind: input.action === "approve" ? "decision" : "blocker",
        title: `CEO ${input.action}: ${meeting.title}`,
        insight:
          input.note?.trim() ||
          meeting.synthesis ||
          `CEO ${input.action}ed meeting decisions for WorkPilot.`,
        employeeIds: meeting.participantIds,
        projectKey: "workpilot",
        workItemId: meeting.workItemId ?? meeting.missionId,
        workItemTitle: meeting.workItemTitle,
        occurredAt: now,
        sourceRefs: [meeting.id],
        tags: ["meeting", "ceo", input.action],
        confidence: 88,
        ceoStatus: input.action === "approve" ? "accepted" : "pending",
        patternKey: `ltm:decision:meeting:${meeting.id}:${input.action}`,
      },
      repoRoot: root,
      workspaceId,
      now,
    });
  }
  if (input.action === "comment" && input.note?.trim()) {
    recordLongTermMemory({
      record: {
        kind: "ceo_preference",
        title: `CEO note on ${meeting.title}`,
        insight: input.note.trim(),
        employeeIds: meeting.participantIds,
        projectKey: "workpilot",
        workItemId: meeting.workItemId ?? meeting.missionId,
        workItemTitle: meeting.workItemTitle,
        occurredAt: now,
        sourceRefs: [meeting.id],
        tags: ["ceo_preference", "meeting"],
        confidence: 80,
        ceoStatus: "accepted",
        patternKey: `ltm:ceo_preference:meeting:${meeting.id}:${now.slice(0, 10)}`,
      },
      repoRoot: root,
      workspaceId,
      now,
    });
  }

  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: `meeting.ceo_${input.action}`,
    executionStatus: meeting.status,
  });
  return { ok: true, meeting };
}
