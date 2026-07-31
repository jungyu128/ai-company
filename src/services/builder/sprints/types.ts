/**
 * AI Company Sprint Management — WorkPilot sprint lifecycle.
 */

export type SprintStatus = "planned" | "active" | "completed" | "archived";

export type CeoSprintAction = "start" | "pause" | "reprioritize" | "close" | "archive";

export type SprintMetrics = {
  totalWorkItems: number;
  completedWorkItems: number;
  blockedWorkItems: number;
  inProgressWorkItems: number;
  progressPercent: number;
  /** Completed items per day since start (0 if not started). */
  velocity: number;
  goal: string;
};

export type CompanySprint = {
  id: string;
  name: string;
  goal: string;
  status: SprintStatus;
  /** Ordered work item / DevTask ids belonging to this sprint. */
  workItemIds: string[];
  /** Explicit priority order (task ids) — first = highest. */
  priorityOrder: string[];
  startAt: string | null;
  endAt: string | null;
  pausedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ceoNote: string | null;
};

export type SprintSnapshot = {
  active: CompanySprint | null;
  planned: CompanySprint[];
  completed: CompanySprint[];
  archived: CompanySprint[];
  metrics: SprintMetrics | null;
};
