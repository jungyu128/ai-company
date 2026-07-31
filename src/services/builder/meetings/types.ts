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

export type MeetingStatus =
  | "scheduled"
  | "in_discussion"
  | "awaiting_ceo"
  | "approved"
  | "postponed"
  | "rejected"
  | "completed";

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
};

export type MeetingAutoCreateHint = {
  kind: MeetingKind;
  workItemId?: string | null;
  workItemTitle?: string | null;
  missionId?: string | null;
  reason: string;
};
