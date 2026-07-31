/**
 * Pure sprint helpers — metrics, priority, membership.
 */

import type { DevTask } from "../autonomous-company/types";
import type { CompanySprint, SprintMetrics, SprintStatus } from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function allocateSprintId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, "");
  return `SPRINT-${day}-${newId("s").slice(-3).toUpperCase()}`;
}

export function buildSprintDraft(input: {
  name: string;
  goal: string;
  now: string;
  workItemIds?: string[];
  status?: SprintStatus;
}): CompanySprint {
  const workItemIds = [...new Set(input.workItemIds ?? [])];
  return {
    id: allocateSprintId(new Date(input.now)),
    name: input.name.trim() || "WorkPilot Sprint",
    goal: input.goal.trim() || "Advance active WorkPilot objectives",
    status: input.status ?? "planned",
    workItemIds,
    priorityOrder: [...workItemIds],
    startAt: null,
    endAt: null,
    pausedAt: null,
    closedAt: null,
    createdAt: input.now,
    updatedAt: input.now,
    ceoNote: null,
  };
}

export function computeSprintMetrics(input: {
  sprint: CompanySprint;
  tasks: DevTask[];
  now: string;
}): SprintMetrics {
  const byId = new Map(input.tasks.map((t) => [t.id, t]));
  const items = input.sprint.workItemIds
    .map((id) => byId.get(id))
    .filter((t): t is DevTask => Boolean(t));

  const total = input.sprint.workItemIds.length;
  const completed = items.filter((t) => t.status === "done").length;
  const blocked = items.filter(
    (t) => t.status === "blocked" || t.status === "needs_clarification"
  ).length;
  const inProgress = items.filter(
    (t) =>
      t.status === "in_progress" ||
      t.status === "peer_review" ||
      t.status === "awaiting_ceo"
  ).length;
  const progressPercent =
    total === 0 ? 0 : Math.round((completed / total) * 100);

  let velocity = 0;
  if (input.sprint.startAt) {
    const start = Date.parse(input.sprint.startAt);
    const end = Date.parse(input.now);
    const days = Math.max(1, (end - start) / 86_400_000);
    velocity = Math.round((completed / days) * 100) / 100;
  }

  return {
    totalWorkItems: total,
    completedWorkItems: completed,
    blockedWorkItems: blocked,
    inProgressWorkItems: inProgress,
    progressPercent,
    velocity,
    goal: input.sprint.goal,
  };
}

/** Prefer active-sprint tasks; order by sprint priorityOrder then updatedAt. */
export function prioritizeTasksForActiveSprint(input: {
  tasks: DevTask[];
  activeSprint: CompanySprint | null;
}): DevTask[] {
  if (!input.activeSprint || input.activeSprint.status !== "active") {
    return [...input.tasks].sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt)
    );
  }
  const sprint = input.activeSprint;
  const order = new Map(sprint.priorityOrder.map((id, i) => [id, i]));
  const inSprint = (t: DevTask) =>
    t.sprintId === sprint.id || sprint.workItemIds.includes(t.id);

  return [...input.tasks].sort((a, b) => {
    const aIn = inSprint(a) ? 0 : 1;
    const bIn = inSprint(b) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    const ao = order.get(a.id) ?? 999;
    const bo = order.get(b.id) ?? 999;
    if (ao !== bo) return ao - bo;
    return a.updatedAt.localeCompare(b.updatedAt);
  });
}

export function ensureWorkItemOnSprint(
  sprint: CompanySprint,
  workItemId: string
): CompanySprint {
  if (sprint.workItemIds.includes(workItemId)) return sprint;
  return {
    ...sprint,
    workItemIds: [...sprint.workItemIds, workItemId],
    priorityOrder: [...sprint.priorityOrder, workItemId],
  };
}

export function applyPriorityOrder(
  sprint: CompanySprint,
  priorityOrder: string[]
): CompanySprint {
  const known = new Set(sprint.workItemIds);
  const ordered = priorityOrder.filter((id) => known.has(id));
  const missing = sprint.workItemIds.filter((id) => !ordered.includes(id));
  return {
    ...sprint,
    priorityOrder: [...ordered, ...missing],
  };
}
