/**
 * AI Company Calendar — schedule meetings, reviews, deadlines, releases, milestones, work blocks.
 */

export type CalendarEventKind =
  | "meeting"
  | "review"
  | "deadline"
  | "release"
  | "milestone"
  | "work_block";

export type CalendarEventStatus =
  | "proposed"
  | "scheduled"
  | "pending_ceo"
  | "approved"
  | "rejected"
  | "cancelled"
  | "completed";

export type CeoCalendarAction =
  | "approve"
  | "reject"
  | "edit"
  | "cancel"
  | "reschedule";

export type CalendarSlot = {
  startAt: string;
  endAt: string;
  reason: string;
};

export type CalendarPendingChange = {
  startAt: string;
  endAt: string;
  title?: string | null;
  description?: string | null;
  attendeeIds?: string[] | null;
  reason: string;
  proposedAt: string;
  proposedBy: "system" | "ai_employee" | "ceo";
};

export type CompanyCalendarEvent = {
  id: string;
  kind: CalendarEventKind;
  title: string;
  description: string;
  status: CalendarEventStatus;
  startAt: string;
  endAt: string;
  attendeeIds: string[];
  workItemId: string | null;
  workItemTitle: string | null;
  meetingId: string | null;
  missionId: string | null;
  sprintId: string | null;
  createdBy: "system" | "ai_employee" | "ceo";
  creatorEmployeeId: string | null;
  /** Conflicting event ids detected at schedule time. */
  conflictIds: string[];
  proposedAlternatives: CalendarSlot[];
  pendingChange: CalendarPendingChange | null;
  ceoNote: string | null;
  ceoApprovedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarConflict = {
  eventId: string;
  conflictingEventId: string;
  attendeeIds: string[];
  overlapStart: string;
  overlapEnd: string;
};

export type CalendarSnapshot = {
  events: CompanyCalendarEvent[];
  conflicts: CalendarConflict[];
  pendingCeo: CompanyCalendarEvent[];
  upcoming: CompanyCalendarEvent[];
};
