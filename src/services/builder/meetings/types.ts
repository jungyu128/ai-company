/**
 * AI Company Meeting System — WorkPilot collaboration meetings.
 */

export type MeetingKind =
  | "sprint_planning"
  | "daily_standup"
  | "architecture_review"
  | "design_review"
  | "qa_review"
  | "release_review"
  | "incident_review";

/**
 * Meeting lifecycle + CEO gate statuses.
 * Active occupancy: scheduled → started → in_progress (and legacy in_discussion).
 * Terminal / non-occupying: completed | cancelled | awaiting_ceo | approved | postponed | rejected.
 * `awaiting_ceo` is a post-meeting CEO approval gate — employees must not stay Waiting.
 */
export type MeetingStatus =
  | "scheduled"
  | "started"
  | "in_progress"
  | "in_discussion"
  | "completed"
  | "cancelled"
  | "awaiting_ceo"
  | "approved"
  | "postponed"
  | "rejected";

export type CeoMeetingAction =
  | "join"
  | "comment"
  | "approve"
  | "postpone"
  | "reject";

export type MeetingAgendaItem = {
  id: string;
  text: string;
  ownerEmployeeId: string | null;
  /** Set when the agenda item was covered in discussion. */
  completed?: boolean;
};

export type MeetingDiscussionTurn = {
  id: string;
  employeeId: string;
  employeeName: string;
  role: string;
  body: string;
  at: string;
};

export type MeetingDecision = {
  id: string;
  text: string;
  proposedByEmployeeId: string;
  status: "proposed" | "approved" | "rejected" | "postponed";
};

export type MeetingActionItem = {
  id: string;
  text: string;
  ownerEmployeeId: string;
  ownerName: string;
  dueDate: string;
  status: "open" | "done" | "cancelled";
};

export type MeetingCeoComment = {
  id: string;
  at: string;
  body: string;
  actorUserId: string;
  actorName: string;
};

export type CompanyMeeting = {
  id: string;
  kind: MeetingKind;
  title: string;
  purpose: string;
  status: MeetingStatus;
  participantIds: string[];
  agenda: MeetingAgendaItem[];
  discussion: MeetingDiscussionTurn[];
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  /** Derived owner ids from action items + decision proposers. */
  owners: string[];
  dueDates: string[];
  workItemId: string | null;
  workItemTitle: string | null;
  missionId: string | null;
  synthesis: string | null;
  ceoJoined: boolean;
  ceoComments: MeetingCeoComment[];
  ceoDecision: CeoMeetingAction | null;
  ceoNote: string | null;
  createdAt: string;
  updatedAt: string;
  presentedToCeoAt: string | null;
  /** Lifecycle timestamps */
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  lastActivityAt: string;
  expectedDurationMinutes: number;
  agendaCompleted: boolean;
  /** True when closed by stale recovery. */
  stale: boolean;
};

export type MeetingAutoCreateHint = {
  kind: MeetingKind;
  workItemId?: string | null;
  workItemTitle?: string | null;
  missionId?: string | null;
  reason: string;
};
