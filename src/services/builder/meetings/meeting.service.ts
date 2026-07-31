/**
 * AI Company Meeting System — create, discuss, complete, CEO decide, resume work.
 * Preserves HQ UI / chat / Continuous OS / role enforcement / execution safety.
 */

import path from "node:path";
import { getEmployeeDefinition } from "../ai-company-employees";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { listCollaborations } from "../collaboration.store";
import { listActiveWorkpilotMissions } from "../autonomous-company/mission-scope.logic";
import { getAutonomyStore } from "../autonomous-company/autonomous-company.store";
import {
  getContinuousOsStore,
  upsertEmployeeStates,
} from "../continuous-os/continuous-os.store";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { logOpsEvent } from "../hardening/ops-log";
import { recordLongTermMemory } from "../memory/memory.service";
import { recordCompanyTimelineEvent } from "../company-timeline/company-timeline.service";
import { syncLiveWorkTracker } from "../live-work-tracker/live-work.service";
import {
  buildMeetingDraft,
  detectNeededMeetings,
  isMeetingOccupyingEmployees,
  isMeetingStale,
  normalizeMeeting,
  resumeWorkStateAfterMeeting,
  runMeetingDiscussion,
  shouldAutoCompleteMeeting,
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

function timelineMeeting(
  meeting: CompanyMeeting,
  input: {
    kind: "meeting_started" | "meeting_completed";
    summary: string;
    repoRoot: string;
    workspaceId: string;
    at: string;
  }
) {
  recordCompanyTimelineEvent({
    kind: input.kind,
    summary: input.summary,
    actorName: "AI Company",
    actorRole: "system",
    employeeId: null,
    workItemId: meeting.workItemId ?? meeting.missionId,
    relatedType: "meeting",
    relatedId: meeting.id,
    at: input.at,
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
  });
}

/**
 * Release every participant from Meeting occupancy into the next valid work state.
 */
export function resumeMeetingParticipants(input: {
  meeting: CompanyMeeting;
  repoRoot: string;
  workspaceId: string;
  now: string;
  syncLiveWork?: boolean;
}): { employeeId: string; toState: string }[] {
  const root = path.resolve(input.repoRoot);
  const cos = getContinuousOsStore(root, input.workspaceId);
  const tasks = getAutonomyStore(root, input.workspaceId).tasks;
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const byOwner = new Map(
    tasks
      .filter((t) => t.status !== "done")
      .map((t) => [t.ownerEmployeeId, t] as const)
  );

  const stateById = new Map(cos.employeeStates.map((e) => [e.employeeId, e]));
  const resumed: { employeeId: string; toState: string }[] = [];

  for (const employeeId of input.meeting.participantIds) {
    const empDef = getEmployeeDefinition(employeeId);
    const prev = stateById.get(employeeId);
    if (prev?.interrupted) continue;

    const task =
      (prev?.activeTaskId ? byTask.get(prev.activeTaskId) : null) ??
      byOwner.get(employeeId) ??
      null;
    const toState = resumeWorkStateAfterMeeting({
      taskStatus: task?.status ?? null,
    });
    resumed.push({ employeeId, toState });

    const employeeName = prev?.employeeName ?? empDef?.name ?? employeeId;
    recordCompanyTimelineEvent({
      kind: "resumed",
      summary: `${employeeName} resumed work after ${input.meeting.title}`,
      actorName: employeeName,
      actorRole: "ai_employee",
      employeeId,
      workItemId: task?.workItem?.id ?? input.meeting.workItemId,
      relatedType: "meeting",
      relatedId: input.meeting.id,
      at: input.now,
      repoRoot: root,
      workspaceId: input.workspaceId,
    });

    stateById.set(employeeId, {
      employeeId,
      employeeName,
      state: toState,
      activeTaskId: task?.id ?? prev?.activeTaskId ?? null,
      note:
        toState === "Idle"
          ? "Resumed after meeting — ready for next WorkPilot task"
          : task?.progressNote ??
            task?.title ??
            `Resumed after ${input.meeting.title}`,
      priority: prev?.priority ?? 50,
      interrupted: false,
      updatedAt: input.now,
      waitingFor: toState === "Waiting" ? "CEO decision" : null,
      progressPercent: prev?.progressPercent,
      startedAt: prev?.startedAt ?? null,
      estimatedCompletionAt: prev?.estimatedCompletionAt ?? null,
      currentStep: prev?.currentStep,
      dependencies: task?.collaboratorIds ?? prev?.dependencies ?? [],
      nextPlannedAction: prev?.nextPlannedAction,
    });
  }

  if (resumed.length) {
    upsertEmployeeStates([...stateById.values()], root, input.workspaceId);
  }

  if (input.syncLiveWork !== false) {
    try {
      syncLiveWorkTracker({
        repoRoot: root,
        workspaceId: input.workspaceId,
        now: input.now,
        recordTimeline: true,
      });
    } catch {
      /* non-blocking */
    }
  }

  return resumed;
}

/**
 * Mark meeting completed (or awaiting_ceo for CEO package) and free participants.
 */
export function completeCompanyMeeting(input: {
  meeting: CompanyMeeting;
  now: string;
  presentToCeo?: boolean;
  stale?: boolean;
  repoRoot: string;
  workspaceId: string;
  resumeParticipants?: boolean;
}): CompanyMeeting {
  const root = path.resolve(input.repoRoot);
  const presentToCeo = input.presentToCeo === true;
  let meeting: CompanyMeeting = {
    ...normalizeMeeting(input.meeting),
    completedAt: input.meeting.completedAt ?? input.now,
    agendaCompleted: true,
    agenda: input.meeting.agenda.map((a) => ({ ...a, completed: true })),
    status: presentToCeo ? "awaiting_ceo" : "completed",
    presentedToCeoAt: presentToCeo
      ? input.meeting.presentedToCeoAt ?? input.now
      : input.meeting.presentedToCeoAt,
    stale: input.stale === true,
    lastActivityAt: input.now,
    updatedAt: input.now,
  };

  upsertMeeting(meeting, root, input.workspaceId);

  timelineMeeting(meeting, {
    kind: "meeting_completed",
    summary: input.stale
      ? `Meeting completed (stale recovery): ${meeting.title}`
      : `Meeting completed: ${meeting.title}`,
    repoRoot: root,
    workspaceId: input.workspaceId,
    at: input.now,
  });

  auditMeeting(meeting, {
    workspaceId: input.workspaceId,
    repoRoot: root,
    summary: input.stale
      ? `Stale meeting resolved: ${meeting.title}`
      : `Meeting completed: ${meeting.title}`,
    actorUserId: null,
    actorName: "AI Company",
    actorRole: "system",
    auditAction: input.stale ? "meeting.stale_resolved" : "meeting.completed",
  });

  if (presentToCeo) {
    auditMeeting(meeting, {
      workspaceId: input.workspaceId,
      repoRoot: root,
      summary: `Meeting ready for CEO: ${meeting.title}`,
      actorUserId: null,
      actorName: "AI Company",
      actorRole: "system",
      auditAction: "meeting.present",
    });
  }

  if (input.resumeParticipants !== false) {
    resumeMeetingParticipants({
      meeting,
      repoRoot: root,
      workspaceId: input.workspaceId,
      now: input.now,
      syncLiveWork: true,
    });
  }

  return meeting;
}

export function cancelCompanyMeeting(input: {
  meeting: CompanyMeeting;
  now: string;
  note?: string | null;
  repoRoot: string;
  workspaceId: string;
}): CompanyMeeting {
  const root = path.resolve(input.repoRoot);
  const meeting: CompanyMeeting = {
    ...normalizeMeeting(input.meeting),
    status: "cancelled",
    cancelledAt: input.now,
    completedAt: input.meeting.completedAt ?? input.now,
    ceoNote: input.note ?? input.meeting.ceoNote,
    lastActivityAt: input.now,
    updatedAt: input.now,
    actionItems: input.meeting.actionItems.map((a) =>
      a.status === "open" ? { ...a, status: "cancelled" as const } : a
    ),
  };
  upsertMeeting(meeting, root, input.workspaceId);
  timelineMeeting(meeting, {
    kind: "meeting_completed",
    summary: `Meeting cancelled: ${meeting.title}`,
    repoRoot: root,
    workspaceId: input.workspaceId,
    at: input.now,
  });
  resumeMeetingParticipants({
    meeting,
    repoRoot: root,
    workspaceId: input.workspaceId,
    now: input.now,
  });
  return meeting;
}

/**
 * Recover stale / deadlocked meetings and free stuck participants.
 */
export function resolveMeetingLifecycles(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): CompanyMeeting[] {
  if (!isInternalAiCompanyEnabled()) return [];
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const resolved: CompanyMeeting[] = [];

  for (const raw of listMeetings(root, workspaceId, 120)) {
    const meeting = normalizeMeeting(raw);
    const needsLegacyFix =
      (meeting.status === "awaiting_ceo" ||
        meeting.status === "approved" ||
        meeting.status === "postponed" ||
        meeting.status === "rejected") &&
      !raw.completedAt;
    const stale = isMeetingStale(raw, now);
    const occupying = isMeetingOccupyingEmployees(meeting);

    if (needsLegacyFix && !occupying) {
      // Persist completedAt so normalize stays stable; free any leftover Meeting states.
      const fixed = {
        ...meeting,
        completedAt:
          meeting.completedAt ??
          meeting.presentedToCeoAt ??
          meeting.updatedAt,
        lastActivityAt: now,
        updatedAt: now,
      };
      upsertMeeting(fixed, root, workspaceId);
      resumeMeetingParticipants({
        meeting: fixed,
        repoRoot: root,
        workspaceId,
        now,
        syncLiveWork: true,
      });
      resolved.push(fixed);
      continue;
    }

    if (stale && (occupying || needsLegacyFix || isMeetingOccupyingEmployees(raw))) {
      resolved.push(
        completeCompanyMeeting({
          meeting,
          now,
          presentToCeo:
            meeting.status === "awaiting_ceo" ||
            meeting.kind === "architecture_review" ||
            meeting.kind === "release_review",
          stale: true,
          repoRoot: root,
          workspaceId,
        })
      );
      continue;
    }

    if (
      occupying &&
      shouldAutoCompleteMeeting(meeting) &&
      meeting.discussion.length >= 2
    ) {
      resolved.push(
        completeCompanyMeeting({
          meeting,
          now,
          presentToCeo: true,
          repoRoot: root,
          workspaceId,
        })
      );
    }
  }

  return resolved;
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
  ).map(normalizeMeeting);
}

export function getCompanyMeeting(input: {
  meetingId: string;
  repoRoot?: string;
  workspaceId?: string;
}): CompanyMeeting | null {
  const m = getMeetingById(
    input.meetingId,
    input.repoRoot ?? process.cwd(),
    input.workspaceId ?? DEFAULT_WORKSPACE_ID
  );
  return m ? normalizeMeeting(m) : null;
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

  // Lifecycle: Scheduled → Started → In Progress
  meeting = {
    ...meeting,
    status: "started",
    startedAt: now,
    lastActivityAt: now,
    updatedAt: now,
  };
  upsertMeeting(meeting, root, workspaceId);
  timelineMeeting(meeting, {
    kind: "meeting_started",
    summary: `Meeting started: ${meeting.title}`,
    repoRoot: root,
    workspaceId,
    at: now,
  });

  meeting = {
    ...meeting,
    status: "in_progress",
    lastActivityAt: now,
    updatedAt: now,
  };

  if (input.runDiscussion !== false) {
    const discussed = runMeetingDiscussion({ meeting, now });
    meeting = {
      ...meeting,
      status: "in_progress",
      discussion: discussed.discussion,
      decisions: discussed.decisions,
      actionItems: discussed.actionItems,
      owners: discussed.owners,
      dueDates: discussed.dueDates,
      synthesis: discussed.synthesis,
      agenda: discussed.agenda,
      agendaCompleted: discussed.agendaCompleted,
      lastActivityAt: now,
      updatedAt: now,
    };

    // Auto-close when objectives are satisfied (standup / review decisions / etc.).
    if (shouldAutoCompleteMeeting(meeting)) {
      meeting = completeCompanyMeeting({
        meeting,
        now,
        presentToCeo: input.presentToCeo !== false,
        repoRoot: root,
        workspaceId,
        resumeParticipants: true,
      });
    } else {
      upsertMeeting(meeting, root, workspaceId);
    }
  } else {
    upsertMeeting(meeting, root, workspaceId);
  }

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
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "meeting.create",
    executionStatus: meeting.status,
  });
  return { ok: true, meeting: normalizeMeeting(meeting) };
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

  // Free any deadlocked / stale meetings before creating new ones.
  resolveMeetingLifecycles({ repoRoot: root, workspaceId, now });

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

  let meeting: CompanyMeeting = {
    ...normalizeMeeting(existing),
    updatedAt: now,
    lastActivityAt: now,
  };

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
        completedAt: meeting.completedAt ?? now,
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
        completedAt: meeting.completedAt ?? now,
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
        completedAt: meeting.completedAt ?? now,
        cancelledAt: meeting.cancelledAt,
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

  // Ensure participants are free after any terminal CEO decision.
  if (
    input.action === "approve" ||
    input.action === "postpone" ||
    input.action === "reject"
  ) {
    resumeMeetingParticipants({
      meeting,
      repoRoot: root,
      workspaceId,
      now,
    });
  }

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
