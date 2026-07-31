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
  MEETING_EXPECTED_DURATION_MINUTES,
  MEETING_OCCUPANCY_STATUSES,
  defaultParticipantsForKind,
  defaultAgendaForKind,
  buildMeetingDraft,
  runMeetingDiscussion,
  detectNeededMeetings,
  expectedDurationForKind,
  isOccupyingMeetingStatus,
  isMeetingOccupyingEmployees,
  normalizeMeeting,
  meetingObjectivesSatisfied,
  shouldAutoCompleteMeeting,
  isMeetingStale,
  resumeWorkStateAfterMeeting,
} from "./meeting.logic";

export {
  listCompanyMeetings,
  getCompanyMeeting,
  createCompanyMeeting,
  autoCreateNeededMeetings,
  applyCeoMeetingAction,
  completeCompanyMeeting,
  cancelCompanyMeeting,
  resolveMeetingLifecycles,
  resumeMeetingParticipants,
} from "./meeting.service";
