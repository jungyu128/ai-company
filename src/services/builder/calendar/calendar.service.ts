/**
 * AI Company Calendar — schedule, auto-reserve, conflicts, CEO approve/edit.
 * Preserves HQ UI / chat / Continuous OS / role enforcement / execution safety.
 */

import path from "node:path";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { getAutonomyStore } from "../autonomous-company/autonomous-company.store";
import { listCompanyMeetings } from "../meetings";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { logOpsEvent } from "../hardening/ops-log";
import {
  applyConflictsToEvent,
  buildCalendarEventDraft,
  buildEventFromMeeting,
  buildWorkBlockForTask,
  detectEventConflicts,
  isActiveCalendarStatus,
  proposeAlternativeSlots,
} from "./calendar.logic";
import {
  getCalendarEventById,
  listCalendarEvents,
  listEventsForMeeting,
  listEventsForWorkItem,
  upsertCalendarEvent,
  upsertCalendarEvents,
} from "./calendar.store";
import type {
  CalendarConflict,
  CalendarEventKind,
  CalendarSnapshot,
  CeoCalendarAction,
  CompanyCalendarEvent,
} from "./types";

function auditCalendar(
  event: CompanyCalendarEvent,
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
    relatedType: "calendar",
    relatedId: event.id,
    status: event.status,
    auditAction: input.auditAction,
    auditResult: "ok",
    repoRoot: input.repoRoot,
  });
}

function stampConflicts(
  event: CompanyCalendarEvent,
  existing: CompanyCalendarEvent[],
  now: string
): CompanyCalendarEvent {
  const conflicts = detectEventConflicts({ event, existing });
  if (!conflicts.length) {
    return {
      ...event,
      conflictIds: [],
      proposedAlternatives: [],
      updatedAt: now,
    };
  }
  const duration =
    Math.max(15, (Date.parse(event.endAt) - Date.parse(event.startAt)) / 60_000) ||
    45;
  const alternatives = proposeAlternativeSlots({
    durationMinutes: duration,
    attendeeIds: event.attendeeIds,
    existing,
    from: event.startAt,
    count: 3,
    excludeEventId: event.id,
  });
  return {
    ...applyConflictsToEvent(event, conflicts, alternatives),
    updatedAt: now,
  };
}

export function listCompanyCalendarEvents(input?: {
  repoRoot?: string;
  workspaceId?: string;
  from?: string | null;
  to?: string | null;
  limit?: number;
}): CompanyCalendarEvent[] {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  let events = listCalendarEvents(root, workspaceId, input?.limit ?? 200);
  if (input?.from) {
    const from = Date.parse(input.from);
    events = events.filter((e) => Date.parse(e.endAt) >= from);
  }
  if (input?.to) {
    const to = Date.parse(input.to);
    events = events.filter((e) => Date.parse(e.startAt) <= to);
  }
  return events;
}

export function getCompanyCalendarEvent(input: {
  eventId: string;
  repoRoot?: string;
  workspaceId?: string;
}): CompanyCalendarEvent | null {
  return getCalendarEventById(
    input.eventId,
    input.repoRoot ?? process.cwd(),
    input.workspaceId ?? DEFAULT_WORKSPACE_ID
  );
}

export function getCalendarConflicts(input?: {
  repoRoot?: string;
  workspaceId?: string;
}): CalendarConflict[] {
  const events = listCompanyCalendarEvents(input).filter((e) =>
    isActiveCalendarStatus(e.status)
  );
  const seen = new Set<string>();
  const out: CalendarConflict[] = [];
  for (const event of events) {
    const conflicts = detectEventConflicts({ event, existing: events });
    for (const c of conflicts) {
      const key = [c.eventId, c.conflictingEventId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
    }
  }
  return out;
}

export function getCalendarSnapshot(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): CalendarSnapshot {
  const now = input?.now ?? new Date().toISOString();
  const events = listCompanyCalendarEvents(input);
  const conflicts = getCalendarConflicts(input);
  return {
    events,
    conflicts,
    pendingCeo: events.filter(
      (e) => e.status === "pending_ceo" || Boolean(e.pendingChange)
    ),
    upcoming: events
      .filter(
        (e) =>
          isActiveCalendarStatus(e.status) && Date.parse(e.startAt) >= Date.parse(now)
      )
      .slice(0, 20),
  };
}

export function createCalendarEvent(input: {
  kind: CalendarEventKind;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  attendeeIds?: string[];
  workItemId?: string | null;
  workItemTitle?: string | null;
  meetingId?: string | null;
  missionId?: string | null;
  sprintId?: string | null;
  createdBy?: CompanyCalendarEvent["createdBy"];
  creatorEmployeeId?: string | null;
  requireCeoIfConflict?: boolean;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  actorUserId?: string | null;
  actorName?: string | null;
}):
  | {
      ok: true;
      event: CompanyCalendarEvent;
      conflicts: CalendarConflict[];
    }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  if (!input.title.trim()) {
    return {
      ok: false,
      code: "INVALID",
      message: "title required",
      status: 400,
    };
  }
  if (!input.startAt || !input.endAt) {
    return {
      ok: false,
      code: "INVALID",
      message: "startAt and endAt required",
      status: 400,
    };
  }

  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const existing = listCalendarEvents(root, workspaceId);

  let event = buildCalendarEventDraft({
    kind: input.kind,
    title: input.title,
    description: input.description,
    startAt: input.startAt,
    endAt: input.endAt,
    now,
    attendeeIds: input.attendeeIds,
    workItemId: input.workItemId,
    workItemTitle: input.workItemTitle,
    meetingId: input.meetingId,
    missionId: input.missionId,
    sprintId: input.sprintId,
    createdBy: input.createdBy ?? (input.actorUserId ? "ceo" : "system"),
    creatorEmployeeId: input.creatorEmployeeId ?? null,
    status: "scheduled",
  });

  const conflicts = detectEventConflicts({ event, existing });
  if (conflicts.length && input.requireCeoIfConflict !== false) {
    event = stampConflicts(event, existing, now);
  }

  upsertCalendarEvent(event, root, workspaceId);
  auditCalendar(event, {
    workspaceId,
    repoRoot: root,
    summary: `Calendar ${event.kind}: ${event.title}`,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? "AI Company",
    actorRole: input.actorUserId ? "owner" : "system",
    auditAction: "calendar.create",
  });
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "calendar.create",
    executionStatus: event.status,
  });

  return {
    ok: true,
    event,
    conflicts: detectEventConflicts({
      event,
      existing: [...existing, event],
    }),
  };
}

/**
 * Employees automatically reserve focus time for assigned open work items.
 */
export function autoReserveWorkBlocks(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  limit?: number;
}): { created: CompanyCalendarEvent[]; skipped: number } {
  if (!isInternalAiCompanyEnabled()) return { created: [], skipped: 0 };

  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const limit = input?.limit ?? 12;

  const tasks = getAutonomyStore(root, workspaceId).tasks.filter(
    (t) =>
      t.status !== "done" &&
      t.status !== "awaiting_ceo"
  );
  let existing = listCalendarEvents(root, workspaceId);
  const created: CompanyCalendarEvent[] = [];
  let skipped = 0;

  for (const task of tasks) {
    if (created.length >= limit) break;
    const already = listEventsForWorkItem(task.id, root, workspaceId).some(
      (e) =>
        e.kind === "work_block" &&
        isActiveCalendarStatus(e.status)
    );
    if (already) {
      skipped += 1;
      continue;
    }
    let event = buildWorkBlockForTask({ task, existing, now });
    event = stampConflicts(event, existing, now);
    upsertCalendarEvent(event, root, workspaceId);
    existing = [...existing, event];
    created.push(event);
    auditCalendar(event, {
      workspaceId,
      repoRoot: root,
      summary: `${task.ownerEmployeeId} reserved time for ${task.title}`,
      actorUserId: null,
      actorName: task.ownerEmployeeId,
      actorRole: "ai_employee",
      auditAction: "calendar.auto_reserve",
    });
  }

  if (created.length) {
    logOpsEvent({
      outcome: "ok",
      workspaceId,
      action: "calendar.auto_reserve",
      executionStatus: `created:${created.length}`,
    });
  }
  return { created, skipped };
}

/**
 * Link open company meetings onto the calendar when missing.
 */
export function syncMeetingsToCalendar(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  limit?: number;
}): { created: CompanyCalendarEvent[]; skipped: number } {
  if (!isInternalAiCompanyEnabled()) return { created: [], skipped: 0 };

  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const limit = input?.limit ?? 8;

  const meetings = listCompanyMeetings({
    repoRoot: root,
    workspaceId,
  }).filter((m) => m.status !== "rejected" && m.status !== "completed");

  let existing = listCalendarEvents(root, workspaceId);
  const created: CompanyCalendarEvent[] = [];
  let skipped = 0;

  for (const meeting of meetings) {
    if (created.length >= limit) break;
    if (listEventsForMeeting(meeting.id, root, workspaceId).length) {
      skipped += 1;
      continue;
    }
    let event = buildEventFromMeeting({ meeting, existing, now });
    event = stampConflicts(event, existing, now);
    upsertCalendarEvent(event, root, workspaceId);
    existing = [...existing, event];
    created.push(event);
    auditCalendar(event, {
      workspaceId,
      repoRoot: root,
      summary: `Calendar linked to meeting ${meeting.id}`,
      actorUserId: null,
      actorName: "AI Company",
      actorRole: "system",
      auditAction: "calendar.link_meeting",
    });
  }
  return { created, skipped };
}

/** Re-scan conflicts and propose alternatives for active events. */
export function refreshCalendarConflicts(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): { updated: number; conflicts: CalendarConflict[] } {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const events = listCalendarEvents(root, workspaceId);
  const updatedList: CompanyCalendarEvent[] = [];

  for (const event of events) {
    if (!isActiveCalendarStatus(event.status)) continue;
    const stamped = stampConflicts(
      event,
      events.filter((e) => e.id !== event.id),
      now
    );
    if (
      stamped.conflictIds.join() !== event.conflictIds.join() ||
      stamped.status !== event.status ||
      Boolean(stamped.pendingChange) !== Boolean(event.pendingChange)
    ) {
      updatedList.push(stamped);
    }
  }
  if (updatedList.length) upsertCalendarEvents(updatedList, root, workspaceId);
  return {
    updated: updatedList.length,
    conflicts: getCalendarConflicts({ repoRoot: root, workspaceId }),
  };
}

/**
 * Continuous OS entry: reserve work blocks, sync meetings, refresh conflicts.
 */
export function runCalendarMaintenance(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): {
  workBlocks: CompanyCalendarEvent[];
  meetingEvents: CompanyCalendarEvent[];
  conflicts: CalendarConflict[];
} {
  const work = autoReserveWorkBlocks(input);
  const meetings = syncMeetingsToCalendar(input);
  const refreshed = refreshCalendarConflicts(input);
  return {
    workBlocks: work.created,
    meetingEvents: meetings.created,
    conflicts: refreshed.conflicts,
  };
}

export function applyCeoCalendarAction(input: {
  eventId: string;
  action: CeoCalendarAction;
  note?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  title?: string | null;
  description?: string | null;
  attendeeIds?: string[] | null;
  actorUserId: string;
  actorName: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; event: CompanyCalendarEvent; conflicts: CalendarConflict[] }
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
  const existing = getCalendarEventById(input.eventId, root, workspaceId);
  if (!existing) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Calendar event not found",
      status: 404,
    };
  }

  let event: CompanyCalendarEvent = {
    ...existing,
    updatedAt: now,
    ceoNote: input.note ?? existing.ceoNote,
  };
  const others = listCalendarEvents(root, workspaceId).filter(
    (e) => e.id !== event.id
  );

  switch (input.action) {
    case "approve": {
      if (event.pendingChange) {
        event = {
          ...event,
          startAt: event.pendingChange.startAt,
          endAt: event.pendingChange.endAt,
          title: event.pendingChange.title ?? event.title,
          description: event.pendingChange.description ?? event.description,
          attendeeIds: event.pendingChange.attendeeIds ?? event.attendeeIds,
          pendingChange: null,
        };
      }
      event = {
        ...event,
        status: "approved",
        ceoApprovedAt: now,
        conflictIds: [],
        proposedAlternatives: [],
      };
      break;
    }
    case "reject": {
      event = {
        ...event,
        status: "rejected",
        pendingChange: null,
        ceoApprovedAt: null,
      };
      break;
    }
    case "cancel": {
      event = {
        ...event,
        status: "cancelled",
        pendingChange: null,
      };
      break;
    }
    case "edit":
    case "reschedule": {
      const startAt = input.startAt ?? event.startAt;
      const endAt = input.endAt ?? event.endAt;
      if (Date.parse(endAt) <= Date.parse(startAt)) {
        return {
          ok: false,
          code: "INVALID",
          message: "endAt must be after startAt",
          status: 400,
        };
      }
      // CEO edits apply immediately when action is edit with times;
      // reschedule without immediate apply can stage pendingChange.
      const immediate = input.action === "edit" || Boolean(input.startAt);
      if (immediate) {
        event = {
          ...event,
          startAt,
          endAt,
          title: input.title?.trim() || event.title,
          description:
            input.description !== undefined && input.description !== null
              ? input.description
              : event.description,
          attendeeIds: input.attendeeIds ?? event.attendeeIds,
          pendingChange: null,
          status: "approved",
          ceoApprovedAt: now,
        };
        event = stampConflicts(event, others, now);
        if (event.conflictIds.length) {
          // CEO override still schedules; keep alternatives informational.
          event = {
            ...event,
            status: "approved",
            pendingChange: null,
          };
        }
      } else {
        event = {
          ...event,
          pendingChange: {
            startAt,
            endAt,
            title: input.title ?? null,
            description: input.description ?? null,
            attendeeIds: input.attendeeIds ?? null,
            reason: input.note?.trim() || "CEO proposed schedule change",
            proposedAt: now,
            proposedBy: "ceo",
          },
          status: "pending_ceo",
        };
      }
      break;
    }
    default:
      return {
        ok: false,
        code: "INVALID",
        message: "Unknown CEO calendar action",
        status: 400,
      };
  }

  upsertCalendarEvent(event, root, workspaceId);
  auditCalendar(event, {
    workspaceId,
    repoRoot: root,
    summary: `CEO ${input.action} calendar event ${event.title}`,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorRole: "owner",
    auditAction: `calendar.${input.action}`,
  });
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: `calendar.${input.action}`,
    executionStatus: event.status,
  });

  return {
    ok: true,
    event,
    conflicts: detectEventConflicts({
      event,
      existing: [...others, event],
    }),
  };
}

export {
  detectEventConflicts,
  proposeAlternativeSlots,
  buildCalendarEventDraft,
  buildWorkBlockForTask,
};
