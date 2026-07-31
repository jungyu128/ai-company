/**
 * AI Company Sprint Management — create, CEO control, metrics, membership.
 */

import path from "node:path";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import {
  getAutonomyStore,
  upsertDevTasks,
} from "../autonomous-company/autonomous-company.store";
import type { DevTask } from "../autonomous-company/types";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { logOpsEvent } from "../hardening/ops-log";
import {
  applyPriorityOrder,
  buildSprintDraft,
  computeSprintMetrics,
  ensureWorkItemOnSprint,
  prioritizeTasksForActiveSprint,
} from "./sprint.logic";
import {
  getActiveSprint,
  getSprintById,
  listSprints,
  listSprintsByStatus,
  upsertSprint,
} from "./sprint.store";
import type {
  CeoSprintAction,
  CompanySprint,
  SprintMetrics,
  SprintSnapshot,
} from "./types";

function auditSprint(
  sprint: CompanySprint,
  input: {
    workspaceId: string;
    repoRoot: string;
    summary: string;
    actorUserId: string | null;
    actorName: string;
    actorRole: "owner" | "ai_employee" | "system";
    auditAction: string;
  }
) {
  recordWorkspaceEvent({
    workspaceId: input.workspaceId,
    kind: "mission",
    summary: input.summary,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorRole: input.actorRole,
    relatedType: "sprint",
    relatedId: sprint.id,
    status: sprint.status,
    auditAction: input.auditAction,
    auditResult: "ok",
    repoRoot: input.repoRoot,
  });
}

export function getSprintSnapshot(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): SprintSnapshot {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const tasks = getAutonomyStore(root, workspaceId).tasks;
  const active = getActiveSprint(root, workspaceId);
  return {
    active,
    planned: listSprintsByStatus("planned", root, workspaceId),
    completed: listSprintsByStatus("completed", root, workspaceId),
    archived: listSprintsByStatus("archived", root, workspaceId),
    metrics: active
      ? computeSprintMetrics({ sprint: active, tasks, now })
      : null,
  };
}

export function listCompanySprints(input?: {
  repoRoot?: string;
  workspaceId?: string;
}): CompanySprint[] {
  return listSprints(
    input?.repoRoot ?? process.cwd(),
    input?.workspaceId ?? DEFAULT_WORKSPACE_ID
  );
}

export function getCompanySprint(input: {
  sprintId: string;
  repoRoot?: string;
  workspaceId?: string;
}): CompanySprint | null {
  return getSprintById(
    input.sprintId,
    input.repoRoot ?? process.cwd(),
    input.workspaceId ?? DEFAULT_WORKSPACE_ID
  );
}

export function getActiveCompanySprint(input?: {
  repoRoot?: string;
  workspaceId?: string;
}): CompanySprint | null {
  return getActiveSprint(
    input?.repoRoot ?? process.cwd(),
    input?.workspaceId ?? DEFAULT_WORKSPACE_ID
  );
}

export function createCompanySprint(input: {
  name: string;
  goal: string;
  workItemIds?: string[];
  startImmediately?: boolean;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  actorUserId?: string | null;
  actorName?: string | null;
}):
  | { ok: true; sprint: CompanySprint; metrics: SprintMetrics }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();

  let sprint = buildSprintDraft({
    name: input.name,
    goal: input.goal,
    now,
    workItemIds: input.workItemIds,
    status: "planned",
  });

  if (input.startImmediately) {
    const existingActive = getActiveSprint(root, workspaceId);
    if (existingActive) {
      return {
        ok: false,
        code: "ACTIVE_EXISTS",
        message: `Sprint ${existingActive.id} is already active — pause or close it first`,
        status: 409,
      };
    }
    sprint = {
      ...sprint,
      status: "active",
      startAt: now,
      updatedAt: now,
    };
  }

  upsertSprint(sprint, root, workspaceId);
  assignTasksToSprint({
    sprintId: sprint.id,
    taskIds: sprint.workItemIds,
    repoRoot: root,
    workspaceId,
    now,
  });

  auditSprint(sprint, {
    workspaceId,
    repoRoot: root,
    summary: `Sprint created: ${sprint.name} (${sprint.status})`,
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName ?? "AI Company",
    actorRole: input.actorUserId ? "owner" : "system",
    auditAction: "sprint.create",
  });
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "sprint.create",
    executionStatus: sprint.status,
  });

  const tasks = getAutonomyStore(root, workspaceId).tasks;
  return {
    ok: true,
    sprint,
    metrics: computeSprintMetrics({ sprint, tasks, now }),
  };
}

export function assignTasksToSprint(input: {
  sprintId: string;
  taskIds: string[];
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): CompanySprint | null {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  let sprint = getSprintById(input.sprintId, root, workspaceId);
  if (!sprint) return null;

  for (const id of input.taskIds) {
    sprint = ensureWorkItemOnSprint(sprint, id);
  }
  sprint = { ...sprint, updatedAt: now };
  upsertSprint(sprint, root, workspaceId);

  const tasks = getAutonomyStore(root, workspaceId).tasks;
  const updated = tasks
    .filter((t) => input.taskIds.includes(t.id))
    .map((t) => ({ ...t, sprintId: input.sprintId, updatedAt: now }));
  if (updated.length) upsertDevTasks(updated, root, workspaceId);
  return sprint;
}

/**
 * Ensure every DevTask without a sprint joins the active (or newly planned) sprint.
 */
export function ensureTasksBelongToSprint(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): { sprint: CompanySprint | null; assigned: number } {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  let sprint = getActiveSprint(root, workspaceId);
  if (!sprint) {
    sprint = listSprintsByStatus("planned", root, workspaceId)[0] ?? null;
  }
  if (!sprint) return { sprint: null, assigned: 0 };

  const tasks = getAutonomyStore(root, workspaceId).tasks;
  const orphans = tasks.filter((t) => !t.sprintId && t.status !== "done");
  if (!orphans.length) return { sprint, assigned: 0 };

  assignTasksToSprint({
    sprintId: sprint.id,
    taskIds: orphans.map((t) => t.id),
    repoRoot: root,
    workspaceId,
    now,
  });
  return { sprint: getSprintById(sprint.id, root, workspaceId), assigned: orphans.length };
}

export function applyCeoSprintAction(input: {
  sprintId: string;
  action: CeoSprintAction;
  note?: string | null;
  priorityOrder?: string[] | null;
  actorUserId: string;
  actorName: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; sprint: CompanySprint; metrics: SprintMetrics }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const existing = getSprintById(input.sprintId, root, workspaceId);
  if (!existing) {
    return {
      ok: false,
      code: "NOT_FOUND",
      message: "Sprint not found",
      status: 404,
    };
  }

  let sprint: CompanySprint = { ...existing, updatedAt: now, ceoNote: input.note ?? existing.ceoNote };

  switch (input.action) {
    case "start": {
      if (sprint.status === "completed" || sprint.status === "archived") {
        return {
          ok: false,
          code: "INVALID",
          message: "Cannot start a completed or archived sprint",
          status: 400,
        };
      }
      const otherActive = getActiveSprint(root, workspaceId);
      if (otherActive && otherActive.id !== sprint.id) {
        return {
          ok: false,
          code: "ACTIVE_EXISTS",
          message: `Sprint ${otherActive.id} is already active`,
          status: 409,
        };
      }
      sprint = {
        ...sprint,
        status: "active",
        startAt: sprint.startAt ?? now,
        pausedAt: null,
      };
      break;
    }
    case "pause": {
      if (sprint.status !== "active") {
        return {
          ok: false,
          code: "INVALID",
          message: "Only an active sprint can be paused",
          status: 400,
        };
      }
      sprint = {
        ...sprint,
        status: "planned",
        pausedAt: now,
      };
      break;
    }
    case "reprioritize": {
      if (!input.priorityOrder?.length) {
        return {
          ok: false,
          code: "INVALID",
          message: "priorityOrder required for reprioritize",
          status: 400,
        };
      }
      sprint = applyPriorityOrder(sprint, input.priorityOrder);
      break;
    }
    case "close": {
      if (sprint.status === "archived") {
        return {
          ok: false,
          code: "INVALID",
          message: "Sprint already archived",
          status: 400,
        };
      }
      sprint = {
        ...sprint,
        status: "completed",
        endAt: now,
        closedAt: now,
      };
      break;
    }
    case "archive": {
      sprint = {
        ...sprint,
        status: "archived",
        endAt: sprint.endAt ?? now,
        closedAt: sprint.closedAt ?? now,
      };
      break;
    }
    default:
      return {
        ok: false,
        code: "INVALID",
        message: "Unknown CEO sprint action",
        status: 400,
      };
  }

  upsertSprint(sprint, root, workspaceId);
  auditSprint(sprint, {
    workspaceId,
    repoRoot: root,
    summary: `CEO ${input.action} sprint ${sprint.name}`,
    actorUserId: input.actorUserId,
    actorName: input.actorName,
    actorRole: "owner",
    auditAction: `sprint.${input.action}`,
  });
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: `sprint.${input.action}`,
    executionStatus: sprint.status,
  });

  const tasks = getAutonomyStore(root, workspaceId).tasks;
  return {
    ok: true,
    sprint,
    metrics: computeSprintMetrics({ sprint, tasks, now }),
  };
}

export function getPrioritizedSprintTasks(input?: {
  repoRoot?: string;
  workspaceId?: string;
}): DevTask[] {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const active = getActiveSprint(root, workspaceId);
  const tasks = getAutonomyStore(root, workspaceId).tasks.filter(
    (t) => t.status !== "done"
  );
  return prioritizeTasksForActiveSprint({ tasks, activeSprint: active });
}

export {
  computeSprintMetrics,
  prioritizeTasksForActiveSprint,
};
