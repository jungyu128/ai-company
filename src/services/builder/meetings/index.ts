export type {
  MeetingKind,
  MeetingStatus,
  CeoMeetingAction,
  CompanyMeeting,
  MeetingAgendaItem,
  MeetingDiscussionTurn,
  MeetingDecision,
  MeetingActionItem,
  MeetingCeoComment,
  MeetingAutoCreateHint,
} from "./types";

export {
  MEETING_KIND_LABEL,
  defaultParticipantsForKind,
  defaultAgendaForKind,
  buildMeetingDraft,
  runMeetingDiscussion,
  detectNeededMeetings,
} from "./meeting.logic";

export {
  listCompanyMeetings,
  getCompanyMeeting,
  createCompanyMeeting,
  autoCreateNeededMeetings,
  applyCeoMeetingAction,
} from "./meeting.service";
