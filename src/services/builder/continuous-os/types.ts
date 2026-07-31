/**
 * Continuous AI Company Operating System — live employee work states & decisions.
 */

import type { AutonomyCycleResult, DevTask, WorkItemLink } from "../autonomous-company/types";

/** Live work state every employee maintains throughout the day. */
export type EmployeeWorkState =
  | "Idle"
  | "Planning"
  | "Working"
  | "Reviewing"
  | "Meeting"
  | "Waiting"
  | "Blocked"
  | "Completed";

export type EmployeeLiveState = {
  employeeId: string;
  employeeName: string;
  state: EmployeeWorkState;
  activeTaskId: string | null;
  note: string | null;
  /** Lower number = higher priority for continuous scheduling. */
  priority: number;
  /** CEO interrupt — employee pauses independent advancement until cleared. */
  interrupted: boolean;
  updatedAt: string;
  /** Live Work Tracker enrichment (optional for backward-compatible stores). */
  progressPercent?: number;
  startedAt?: string | null;
  estimatedCompletionAt?: string | null;
  currentStep?: string;
  dependencies?: string[];
  waitingFor?: string | null;
  nextPlannedAction?: string;
};

export type OsDecisionKind =
  | "create_work"
  | "split_task"
  | "delegate"
  | "request_review"
  | "state_transition"
  | "ceo_interrupt"
  | "ceo_reprioritize"
  | "ceo_approve"
  | "tick";

export type OsDecision = {
  id: string;
  kind: OsDecisionKind;
  at: string;
  actorRole: "ai_employee" | "owner" | "system";
  actorId: string;
  actorName: string;
  summary: string;
  taskId: string | null;
  employeeId: string | null;
  workItemId: string | null;
};

export type ContinuousOsSnapshot = {
  lastTickAt: string | null;
  employeeStates: EmployeeLiveState[];
  recentDecisions: OsDecision[];
  activeTasks: DevTask[];
  running: boolean;
};

export type ContinuousOsTickResult = {
  tickAt: string;
  skipped: boolean;
  reason?: string;
  autonomy: AutonomyCycleResult | null;
  stateUpdates: EmployeeLiveState[];
  decisions: OsDecision[];
  tasksCreated: number;
  tasksSplit: number;
  tasksDelegated: number;
  reviewsRequested: number;
};

export type CeoOsAction =
  | {
      action: "interrupt";
      employeeId: string;
      note?: string | null;
    }
  | {
      action: "reprioritize";
      employeeId: string;
      priority: number;
      taskId?: string | null;
      note?: string | null;
    }
  | {
      action: "approve";
      taskId: string;
      note?: string | null;
    }
  | {
      action: "resume";
      employeeId: string;
      note?: string | null;
    };

export type { WorkItemLink, DevTask, AutonomyCycleResult };
