/**
 * Live Employee Status — display contract from real Continuous OS / Live Work Tracker.
 * No fabricated activity or mid-step progress.
 */

import type { EmployeeWorkState } from "@/services/builder/continuous-os/types";
import { progressForStatus, STEP_LABEL } from "@/services/builder/live-work-tracker/live-work.logic";

/** CEO-facing statuses (Meeting maps to Waiting). */
export type LiveEmployeeDisplayStatus =
  | "Idle"
  | "Planning"
  | "Working"
  | "Reviewing"
  | "Waiting"
  | "Blocked"
  | "Completed";

export type LiveEmployeeStatusView = {
  employeeId: string;
  currentTask: string | null;
  status: LiveEmployeeDisplayStatus;
  currentStep: string;
  progress: number;
  waitingFor: string | null;
  lastUpdate: string;
};

export function toDisplayStatus(state: EmployeeWorkState | string): LiveEmployeeDisplayStatus {
  if (state === "Meeting") return "Waiting";
  if (
    state === "Idle" ||
    state === "Planning" ||
    state === "Working" ||
    state === "Reviewing" ||
    state === "Waiting" ||
    state === "Blocked" ||
    state === "Completed"
  ) {
    return state;
  }
  return "Idle";
}

export function buildLiveEmployeeStatus(input: {
  employeeId: string;
  liveWork: {
    status: string;
    currentStep: string;
    progressPercent: number;
    waitingFor: string | null;
    lastUpdate?: string;
  } | null;
  currentTask: string | null;
  lastUpdateFallback: string;
}): LiveEmployeeStatusView {
  if (!input.liveWork) {
    return {
      employeeId: input.employeeId,
      currentTask: input.currentTask,
      status: input.currentTask ? "Planning" : "Idle",
      currentStep: input.currentTask ? STEP_LABEL.Planning : STEP_LABEL.Idle,
      progress: input.currentTask ? progressForStatus("Planning") : 0,
      waitingFor: null,
      lastUpdate: input.lastUpdateFallback,
    };
  }

  const status = toDisplayStatus(input.liveWork.status);
  const workState = (
    input.liveWork.status === "Meeting" ? "Waiting" : input.liveWork.status
  ) as EmployeeWorkState;

  return {
    employeeId: input.employeeId,
    currentTask: input.currentTask,
    status,
    currentStep: input.liveWork.currentStep || STEP_LABEL[workState] || STEP_LABEL.Idle,
    // Recompute from status so UI never trusts a stale invented percentage.
    progress: progressForStatus(
      (input.liveWork.status === "Meeting"
        ? "Meeting"
        : status) as EmployeeWorkState
    ),
    waitingFor: input.liveWork.waitingFor,
    lastUpdate: input.liveWork.lastUpdate ?? input.lastUpdateFallback,
  };
}
