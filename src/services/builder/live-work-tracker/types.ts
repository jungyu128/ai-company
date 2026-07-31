import type { EmployeeWorkState } from "@/services/builder/continuous-os/types";

export type LiveWorkStatus = EmployeeWorkState;

export type LiveWorkTrackerEntry = {
  employeeId: string;
  employeeName: string;
  role: string;
  status: LiveWorkStatus;
  currentTask: string | null;
  currentTaskId: string | null;
  progressPercent: number;
  startedAt: string | null;
  estimatedCompletionAt: string | null;
  currentStep: string;
  lastUpdate: string;
  dependencies: string[];
  waitingFor: string | null;
  nextPlannedAction: string;
  priority: number;
  interrupted: boolean;
};

export type LiveWorkChange = {
  employeeId: string;
  employeeName: string;
  fromStatus: LiveWorkStatus | null;
  toStatus: LiveWorkStatus;
  at: string;
  summary: string;
};

export type LiveWorkTrackerSnapshot = {
  asOf: string;
  employees: LiveWorkTrackerEntry[];
  summary: {
    idle: number;
    planning: number;
    working: number;
    reviewing: number;
    meeting: number;
    waiting: number;
    blocked: number;
    completed: number;
  };
  recentChanges: LiveWorkChange[];
};

export type LiveWorkPreviousFingerprint = {
  employeeId: string;
  status: LiveWorkStatus;
  currentTaskId: string | null;
  progressPercent: number;
  currentStep: string;
};

export type LiveWorkTrackerStoreShape = {
  fingerprints: LiveWorkPreviousFingerprint[];
  lastSyncAt: string | null;
  lastSnapshot: LiveWorkTrackerSnapshot | null;
};
