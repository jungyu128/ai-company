/**
 * Pure calendar helpers — slots, conflicts, alternatives, work-block drafts.
 */

import type { DevTask } from "../autonomous-company/types";
import type { CompanyMeeting } from "../meetings/types";
import type {
  CalendarConflict,
  CalendarEventKind,
  CalendarEventStatus,
  CalendarSlot,
  CompanyCalendarEvent,
} from "./types";

/** Working-day window (UTC) used for auto-scheduling. */
export const WORKDAY_START_HOUR = 9;
export const WORKDAY_END_HOUR = 17;
export const DEFAULT_WORK_BLOCK_MINUTES = 90;
export const DEFAULT_MEETING_MINUTES = 45;
export const SLOT_STEP_MINUTES = 30;

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function allocateCalendarEventId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `CAL-${day}-${newId("e").slice(-3).toUpperCase()}`;
}

export const CALENDAR_KIND_LABEL: Record<CalendarEventKind, string> = {
  meeting: "Meeting",
  review: "Review",
  deadline: "Deadline",
  release: "Release",
  milestone: "Milestone",
  work_block: "Work Block",
};

export function intervalsOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  const as = Date.parse(aStart);
  const ae = Date.parse(aEnd);
  const bs = Date.parse(bStart);
  const be = Date.parse(bEnd);
  if (![as, ae, bs, be].every(Number.isFinite)) return false;
  return as < be && bs < ae;
}

export function overlapWindow(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): { start: string; end: string } | null {
  if (!intervalsOverlap(aStart, aEnd, bStart, bEnd)) return null;
  const start = new Date(
    Math.max(Date.parse(aStart), Date.parse(bStart))
  ).toISOString();
  const end = new Date(
    Math.min(Date.parse(aEnd), Date.parse(bEnd))
  ).toISOString();
  return { start, end };
}

export function isActiveCalendarStatus(status: CalendarEventStatus): boolean {
  return (
    status === "proposed" ||
    status === "scheduled" ||
    status === "pending_ceo" ||
    status === "approved"
  );
}

export function detectEventConflicts(input: {
  event: Pick<
    CompanyCalendarEvent,
    "id" | "startAt" | "endAt" | "attendeeIds" | "status"
  >;
  existing: CompanyCalendarEvent[];
}): CalendarConflict[] {
  if (!isActiveCalendarStatus(input.event.status)) return [];
  const attendees = new Set(input.event.attendeeIds);
  const out: CalendarConflict[] = [];
  for (const other of input.existing) {
    if (other.id === input.event.id) continue;
    if (!isActiveCalendarStatus(other.status)) continue;
    const shared = other.attendeeIds.filter((id) => attendees.has(id));
    if (!shared.length) continue;
    const win = overlapWindow(
      input.event.startAt,
      input.event.endAt,
      other.startAt,
      other.endAt
    );
    if (!win) continue;
    out.push({
      eventId: input.event.id,
      conflictingEventId: other.id,
      attendeeIds: shared,
      overlapStart: win.start,
      overlapEnd: win.end,
    });
  }
  return out;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(Date.parse(iso) + minutes * 60_000).toISOString();
}

function startOfUtcDay(iso: string): Date {
  const d = new Date(iso);
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0)
  );
}

function nextWorkdayStart(fromIso: string): string {
  const day = startOfUtcDay(fromIso);
  let cursor = new Date(day);
  // If already past workday end, jump to next calendar day.
  const hour = new Date(fromIso).getUTCHours();
  if (hour >= WORKDAY_END_HOUR) {
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  // Skip Saturday (6) / Sunday (0)
  while (cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6) {
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  cursor.setUTCHours(WORKDAY_START_HOUR, 0, 0, 0);
  if (Date.parse(fromIso) > cursor.getTime()) {
    // Snap forward within the day
    const from = new Date(fromIso);
    const mins = from.getUTCMinutes();
    const stepped = mins % SLOT_STEP_MINUTES === 0
      ? mins
      : mins + (SLOT_STEP_MINUTES - (mins % SLOT_STEP_MINUTES));
    from.setUTCMinutes(stepped, 0, 0);
    if (from.getUTCHours() < WORKDAY_END_HOUR) {
      return from.toISOString();
    }
    return nextWorkdayStart(addMinutes(fromIso, 12 * 60));
  }
  return cursor.toISOString();
}

export function estimateWorkBlockMinutes(task: DevTask): number {
  if (task.status === "needs_clarification" || task.status === "blocked") {
    return 45;
  }
  if (task.status === "peer_review" || task.status === "awaiting_ceo") {
    return 60;
  }
  return DEFAULT_WORK_BLOCK_MINUTES;
}

/**
 * Propose alternative free slots for attendees, scanning forward in work hours.
 */
export function proposeAlternativeSlots(input: {
  durationMinutes: number;
  attendeeIds: string[];
  existing: CompanyCalendarEvent[];
  from: string;
  count?: number;
  excludeEventId?: string | null;
}): CalendarSlot[] {
  const count = input.count ?? 3;
  const duration = Math.max(15, input.durationMinutes);
  const attendees = new Set(input.attendeeIds);
  const busy = input.existing.filter(
    (e) =>
      e.id !== input.excludeEventId &&
      isActiveCalendarStatus(e.status) &&
      e.attendeeIds.some((id) => attendees.has(id))
  );

  const slots: CalendarSlot[] = [];
  let cursor = nextWorkdayStart(input.from);
  let guard = 0;
  while (slots.length < count && guard < 400) {
    guard += 1;
    const end = addMinutes(cursor, duration);
    const endHour = new Date(end).getUTCHours();
    const endMin = new Date(end).getUTCMinutes();
    const pastDay =
      endHour > WORKDAY_END_HOUR ||
      (endHour === WORKDAY_END_HOUR && endMin > 0) ||
      new Date(end).getUTCDate() !== new Date(cursor).getUTCDate();

    if (pastDay) {
      cursor = nextWorkdayStart(addMinutes(cursor, 12 * 60));
      continue;
    }

    const conflict = busy.some((e) =>
      intervalsOverlap(cursor, end, e.startAt, e.endAt)
    );
    if (!conflict) {
      slots.push({
        startAt: cursor,
        endAt: end,
        reason: `Free for ${[...attendees].join(", ") || "attendees"}`,
      });
    }
    cursor = addMinutes(cursor, SLOT_STEP_MINUTES);
  }
  return slots;
}

export function buildCalendarEventDraft(input: {
  kind: CalendarEventKind;
  title: string;
  description?: string | null;
  startAt: string;
  endAt: string;
  now: string;
  attendeeIds?: string[];
  workItemId?: string | null;
  workItemTitle?: string | null;
  meetingId?: string | null;
  missionId?: string | null;
  sprintId?: string | null;
  createdBy?: CompanyCalendarEvent["createdBy"];
  creatorEmployeeId?: string | null;
  status?: CalendarEventStatus;
}): CompanyCalendarEvent {
  const startAt = input.startAt;
  let endAt = input.endAt;
  if (Date.parse(endAt) <= Date.parse(startAt)) {
    endAt = addMinutes(startAt, DEFAULT_MEETING_MINUTES);
  }
  return {
    id: allocateCalendarEventId(new Date(input.now)),
    kind: input.kind,
    title: input.title.trim() || CALENDAR_KIND_LABEL[input.kind],
    description: (input.description ?? "").trim(),
    status: input.status ?? "scheduled",
    startAt,
    endAt,
    attendeeIds: [...new Set(input.attendeeIds ?? [])],
    workItemId: input.workItemId ?? null,
    workItemTitle: input.workItemTitle ?? null,
    meetingId: input.meetingId ?? null,
    missionId: input.missionId ?? null,
    sprintId: input.sprintId ?? null,
    createdBy: input.createdBy ?? "system",
    creatorEmployeeId: input.creatorEmployeeId ?? null,
    conflictIds: [],
    proposedAlternatives: [],
    pendingChange: null,
    ceoNote: null,
    ceoApprovedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function buildWorkBlockForTask(input: {
  task: DevTask;
  existing: CompanyCalendarEvent[];
  now: string;
}): CompanyCalendarEvent {
  const minutes = estimateWorkBlockMinutes(input.task);
  const alts = proposeAlternativeSlots({
    durationMinutes: minutes,
    attendeeIds: [input.task.ownerEmployeeId],
    existing: input.existing,
    from: input.now,
    count: 1,
  });
  const slot = alts[0] ?? {
    startAt: nextWorkdayStart(input.now),
    endAt: addMinutes(nextWorkdayStart(input.now), minutes),
    reason: "Fallback work block",
  };
  return buildCalendarEventDraft({
    kind: "work_block",
    title: `Focus: ${input.task.title}`,
    description: `Reserved for assigned WorkPilot work ${input.task.id}`,
    startAt: slot.startAt,
    endAt: slot.endAt,
    now: input.now,
    attendeeIds: [input.task.ownerEmployeeId],
    workItemId: input.task.id,
    workItemTitle: input.task.title,
    sprintId: input.task.sprintId,
    createdBy: "ai_employee",
    creatorEmployeeId: input.task.ownerEmployeeId,
    status: "scheduled",
  });
}

export function buildEventFromMeeting(input: {
  meeting: CompanyMeeting;
  existing: CompanyCalendarEvent[];
  now: string;
  startAt?: string | null;
}): CompanyCalendarEvent {
  const kind: CalendarEventKind =
    input.meeting.kind.includes("review") ? "review" : "meeting";
  const duration = DEFAULT_MEETING_MINUTES;
  const from = input.startAt ?? input.now;
  const alts = proposeAlternativeSlots({
    durationMinutes: duration,
    attendeeIds: input.meeting.participantIds,
    existing: input.existing,
    from,
    count: 1,
  });
  const slot = alts[0] ?? {
    startAt: nextWorkdayStart(from),
    endAt: addMinutes(nextWorkdayStart(from), duration),
    reason: "Fallback meeting slot",
  };
  return buildCalendarEventDraft({
    kind,
    title: input.meeting.title,
    description: input.meeting.purpose,
    startAt: slot.startAt,
    endAt: slot.endAt,
    now: input.now,
    attendeeIds: input.meeting.participantIds,
    workItemId: input.meeting.workItemId,
    workItemTitle: input.meeting.workItemTitle,
    meetingId: input.meeting.id,
    missionId: input.meeting.missionId,
    createdBy: "system",
    status: "scheduled",
  });
}

export function applyConflictsToEvent(
  event: CompanyCalendarEvent,
  conflicts: CalendarConflict[],
  alternatives: CalendarSlot[]
): CompanyCalendarEvent {
  if (!conflicts.length) {
    return {
      ...event,
      conflictIds: [],
      proposedAlternatives: [],
    };
  }
  return {
    ...event,
    conflictIds: [...new Set(conflicts.map((c) => c.conflictingEventId))],
    proposedAlternatives: alternatives,
    status:
      event.status === "approved" || event.status === "pending_ceo"
        ? event.status
        : "pending_ceo",
    pendingChange:
      event.pendingChange ??
      (alternatives[0]
        ? {
            startAt: alternatives[0].startAt,
            endAt: alternatives[0].endAt,
            reason: `Conflict with ${conflicts.map((c) => c.conflictingEventId).join(", ")}`,
            proposedAt: event.updatedAt,
            proposedBy: "system",
          }
        : null),
  };
}
