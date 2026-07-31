export type {
  EmployeeWorkState,
  EmployeeLiveState,
  OsDecision,
  OsDecisionKind,
  ContinuousOsSnapshot,
  ContinuousOsTickResult,
  CeoOsAction,
} from "./types";

export {
  workStateFromDevStatus,
  nextWorkState,
  mapWorkStateToDevStatus,
  deriveEmployeeLiveStates,
} from "./employee-state.logic";

export {
  createEmployeeWork,
  splitDevTask,
  delegateDevTask,
  requestReview,
  advanceTaskForState,
} from "./work-actions.logic";

export {
  getContinuousOsSnapshot,
  runContinuousOsTick,
  applyCeoOsAction,
  ensureEmployeeRoster,
} from "./continuous-os.service";

export {
  ensureContinuousOsHeartbeat,
  stopContinuousOsHeartbeat,
} from "./heartbeat";
