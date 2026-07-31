/**
 * Client-safe Live Work Tracker exports (types + pure logic).
 * Server snapshot/sync APIs: import from `./live-work.service` or `./server`.
 */

export type {
  LiveWorkStatus,
  LiveWorkTrackerEntry,
  LiveWorkChange,
  LiveWorkTrackerSnapshot,
  LiveWorkPreviousFingerprint,
  LiveWorkTrackerStoreShape,
} from "./types";

export {
  progressForStatus,
  enrichEmployeeLiveState,
  buildLiveWorkTrackerEntry,
  buildLiveWorkTrackerSnapshot,
  fingerprintsFromSnapshot,
  meetingOccupancy,
  cardStatusFromLiveWork,
  STATUS_PROGRESS,
  NEXT_ACTION,
  STEP_LABEL,
} from "./live-work.logic";
