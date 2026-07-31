/**
 * Continuous AI Company Operating System — independent employee work throughout the day.
 * Does not bypass WorkPilot execution safety; never merges/deploys/sends.
 */

import path from "node:path";
import { AI_COMPANY_EMPLOYEES, getEmployeeDefinition } from "../ai-company-employees";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { runAutonomousCompanyCycle } from "../autonomous-company";
import {
  getAutonomyStore,
  upsertDevTasks,
} from "../autonomous-company/autonomous-company.store";
import type { DevTask } from "../autonomous-company/types";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { logOpsEvent } from "../hardening/ops-log";
import {
  deriveEmployeeLiveStates,
  nextWorkState,
} from "./employee-state.logic";
import { listActiveWorkpilotMissions } from "../autonomous-company/mission-scope.logic";
import { linkFromMission } from "../autonomous-company/work-items.logic";
import { listCollaborations } from "../collaboration.store";
import { autoCreateNeededMeetings, resolveMeetingLifecycles } from "../meetings";
import { runCalendarMaintenance } from "../calendar";
import { recordCompanyAnalyticsSample } from "../analytics";
import {
  recordLongTermMemory,
  summarizeCompanyMemory,
} from "../memory/memory.service";
import {
  ensureTasksBelongToSprint,
  getActiveCompanySprint,
  getPrioritizedSprintTasks,
} from "../sprints";
import { syncLiveWorkTracker } from "../live-work-tracker/live-work.service";
import {
  createEmployeeWork,
  delegateDevTask,
  requestReview,
  splitDevTask,
  advanceTaskForState,
} from "./work-actions.logic";
import {
  appendOsDecisions,
  getContinuousOsStore,
  markTick,
  saveContinuousOsStore,
  upsertEmployeeStates,
} from "./continuous-os.store";
import type {
  CeoOsAction,
  ContinuousOsSnapshot,
  ContinuousOsTickResult,
  EmployeeLiveState,
  OsDecision,
} from "./types";

const DEFAULT_MIN_INTERVAL_MS = 60_000;

function newDecisionId(): string {
  return `osd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function recordDecision(
  decision: OsDecision,
  workspaceId: string,
  repoRoot: string
): void {
  appendOsDecisions([decision], repoRoot, workspaceId);
  recordWorkspaceEvent({
    workspaceId,
    kind: decision.kind === "ceo_approve" ? "approval" : "assignment",
    summary: decision.summary,
    actorUserId: decision.actorRole === "owner" ? decision.actorId : null,
    actorName: decision.actorName,
    actorRole: decision.actorRole,
    relatedType: "continuous_os",
    relatedId: decision.taskId ?? decision.employeeId ?? decision.id,
    status: decision.kind,
    auditAction: `continuous_os.${decision.kind}`,
    auditResult: "ok",
    repoRoot,
  });
}

export function getContinuousOsSnapshot(input?: {
  repoRoot?: string;
  workspaceId?: string;
}): ContinuousOsSnapshot {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const store = getContinuousOsStore(root, workspaceId);
  const tasks = getAutonomyStore(root, workspaceId).tasks.filter(
    (t) => t.status !== "done"
  );
  return {
    lastTickAt: store.lastTickAt,
    employeeStates: store.employeeStates,
    recentDecisions: store.decisions.slice(0, 40),
    activeTasks: tasks,
    running: store.running,
  };
}

/**
 * One continuous OS tick: autonomy cycle (throttled) + employee plan/work/review/delegate.
 */
export function runContinuousOsTick(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  minIntervalMs?: number;
  force?: boolean;
  runAutonomy?: boolean;
  deliverToChat?: boolean;
}): ContinuousOsTickResult {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const minIntervalMs = input?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;

  if (!isInternalAiCompanyEnabled()) {
    return {
      tickAt: now,
      skipped: true,
      reason: "disabled",
      autonomy: null,
      stateUpdates: [],
      decisions: [],
      tasksCreated: 0,
      tasksSplit: 0,
      tasksDelegated: 0,
      reviewsRequested: 0,
    };
  }

  const store = getContinuousOsStore(root, workspaceId);
  if (!input?.force && store.lastTickAt) {
    const elapsed = Date.parse(now) - Date.parse(store.lastTickAt);
    if (Number.isFinite(elapsed) && elapsed < minIntervalMs) {
      return {
        tickAt: now,
        skipped: true,
        reason: "throttled",
        autonomy: null,
        stateUpdates: store.employeeStates,
        decisions: [],
        tasksCreated: 0,
        tasksSplit: 0,
        tasksDelegated: 0,
        reviewsRequested: 0,
      };
    }
  }

  const autonomy =
    input?.runAutonomy === false
      ? null
      : runAutonomousCompanyCycle({
          repoRoot: root,
          workspaceId,
          now,
          deliverToChat: input?.deliverToChat !== false,
        });

  // Meetings: recover stale/deadlocked first, then auto-create + discuss
  resolveMeetingLifecycles({
    repoRoot: root,
    workspaceId,
    now,
  });
  autoCreateNeededMeetings({
    repoRoot: root,
    workspaceId,
    now,
  });

  // Calendar: reserve focus time, link meetings, detect conflicts + propose alternatives
  runCalendarMaintenance({
    repoRoot: root,
    workspaceId,
    now,
  });

  // Analytics: append observe-only KPI sample (does not alter work / execution)
  recordCompanyAnalyticsSample({
    repoRoot: root,
    workspaceId,
    now,
  });

  // Compress old long-term memories so future discussions use summaries
  summarizeCompanyMemory({
    repoRoot: root,
    workspaceId,
    now,
    olderThanDays: 21,
  });

  // Sprint management: orphan work items join active/planned sprint; prioritize in-sprint work
  ensureTasksBelongToSprint({ repoRoot: root, workspaceId, now });
  const activeSprint = getActiveCompanySprint({ repoRoot: root, workspaceId });

  let tasks = getPrioritizedSprintTasks({ repoRoot: root, workspaceId });
  if (!tasks.length) {
    tasks = getAutonomyStore(root, workspaceId).tasks;
  }
  const decisions: OsDecision[] = [];
  let tasksCreated = 0;
  let tasksSplit = 0;
  let tasksDelegated = 0;
  let reviewsRequested = 0;

  // Idle employees: when a mission is active, only create work on that WorkPilot objective.
  const activeMissions = listActiveWorkpilotMissions(
    listCollaborations(root, workspaceId)
  );
  const liveBefore = deriveEmployeeLiveStates({
    tasks,
    previous: store.employeeStates,
    now,
  });
  const idle = liveBefore.filter(
    (s) =>
      !s.interrupted &&
      !s.activeTaskId &&
      s.state !== "Blocked" &&
      s.state !== "Waiting"
  );
  for (const emp of idle.slice(0, 2)) {
    const def = getEmployeeDefinition(emp.employeeId);
    if (!def) continue;

    if (activeMissions.length > 0) {
      const mission = activeMissions[emp.priority % activeMissions.length]!;
      const title = `Support: ${mission.title} — ${def.role}`;
      if (tasks.some((t) => t.title === title && t.status !== "done")) continue;
      const created = createEmployeeWork({
        title,
        description: `Stay on active WorkPilot mission ${mission.id}: ${mission.mission}`,
        ownerEmployeeId: emp.employeeId,
        workItem: linkFromMission(mission),
        now,
        sprintId: activeSprint?.id ?? null,
      });
      tasks = upsertTaskList(tasks, [created]);
      if (activeSprint) {
        ensureTasksBelongToSprint({ repoRoot: root, workspaceId, now });
      }
      tasksCreated += 1;
      decisions.push({
        id: newDecisionId(),
        kind: "create_work",
        at: now,
        actorRole: "ai_employee",
        actorId: emp.employeeId,
        actorName: emp.employeeName,
        summary: `${emp.employeeName} created scoped work on ${mission.id}: ${created.title}`,
        taskId: created.id,
        employeeId: emp.employeeId,
        workItemId: created.workItem.id,
      });
      continue;
    }

    const title = `Advance WorkPilot — ${def.role} continuous slice`;
    if (tasks.some((t) => t.title === title && t.status !== "done")) continue;
    const created = createEmployeeWork({
      title,
      description: `${def.name} independently plans the next WorkPilot improvement in ${def.productRole}. Need clear acceptance criteria before ship.`,
      ownerEmployeeId: emp.employeeId,
      now,
      sprintId: activeSprint?.id ?? null,
    });
    tasks = upsertTaskList(tasks, [created]);
    tasksCreated += 1;
    decisions.push({
      id: newDecisionId(),
      kind: "create_work",
      at: now,
      actorRole: "ai_employee",
      actorId: emp.employeeId,
      actorName: emp.employeeName,
      summary: `${emp.employeeName} created work: ${created.title}`,
      taskId: created.id,
      employeeId: emp.employeeId,
      workItemId: created.workItem.id,
    });
  }

  // Advance / collaborate on active tasks (respect interrupts); prefer sprint priority order
  const prioritizedOwned = prioritizeOwnedTasks(tasks, activeSprint?.id ?? null);
  const byOwner = new Map<string, typeof tasks>();
  for (const task of prioritizedOwned.filter((t) => t.status !== "done")) {
    const list = byOwner.get(task.ownerEmployeeId) ?? [];
    list.push(task);
    byOwner.set(task.ownerEmployeeId, list);
  }

  const updates: DevTask[] = [];
  for (const emp of liveBefore) {
    if (emp.interrupted) continue;
    const owned = byOwner.get(emp.employeeId) ?? [];
    const task = owned[0];
    if (!task) continue;

    // Collaborate: split oversized in-progress work once.
    if (
      task.status === "in_progress" &&
      task.description.length > 180 &&
      !task.progressNote?.includes("Split —")
    ) {
      const { primary, secondary } = splitDevTask({ task, now });
      updates.push(primary, secondary);
      tasksSplit += 1;
      decisions.push({
        id: newDecisionId(),
        kind: "split_task",
        at: now,
        actorRole: "ai_employee",
        actorId: emp.employeeId,
        actorName: emp.employeeName,
        summary: `${emp.employeeName} split ${task.id} → ${secondary.id}`,
        taskId: task.id,
        employeeId: emp.employeeId,
        workItemId: task.workItem.id,
      });
      continue;
    }

    // Delegate blocked product work to a collaborator when stuck.
    if (
      (task.status === "blocked" || task.status === "needs_clarification") &&
      task.collaboratorIds[0]
    ) {
      try {
        const delegated = delegateDevTask({
          task: { ...task, status: "in_progress", blocker: null },
          toEmployeeId: task.collaboratorIds[0],
          now,
        });
        updates.push(delegated);
        tasksDelegated += 1;
        decisions.push({
          id: newDecisionId(),
          kind: "delegate",
          at: now,
          actorRole: "ai_employee",
          actorId: emp.employeeId,
          actorName: emp.employeeName,
          summary: `${emp.employeeName} delegated ${task.id} to ${delegated.ownerEmployeeId}`,
          taskId: task.id,
          employeeId: emp.employeeId,
          workItemId: task.workItem.id,
        });
      } catch {
        /* skip invalid delegate */
      }
      continue;
    }

    const next = nextWorkState(
      emp.state === "Idle" ||
        emp.state === "Planning" ||
        emp.state === "Working" ||
        emp.state === "Reviewing" ||
        emp.state === "Meeting" ||
        emp.state === "Waiting" ||
        emp.state === "Blocked" ||
        emp.state === "Completed"
        ? emp.state
        : "Planning"
    );
    if (next === "Working" || next === "Reviewing" || next === "Waiting") {
      const advanced = advanceTaskForState({ task, nextState: next, now });
      updates.push(advanced);
      if (next === "Reviewing") reviewsRequested += 1;
      decisions.push({
        id: newDecisionId(),
        kind: next === "Reviewing" ? "request_review" : "state_transition",
        at: now,
        actorRole: "ai_employee",
        actorId: emp.employeeId,
        actorName: emp.employeeName,
        summary: `${emp.employeeName} → ${next} on ${task.id}`,
        taskId: task.id,
        employeeId: emp.employeeId,
        workItemId: task.workItem.id,
      });
    }
  }

  if (updates.length) {
    tasks = upsertTaskList(tasks, updates);
  }
  upsertDevTasks(tasks, root, workspaceId);

  const finalTasks = getAutonomyStore(root, workspaceId).tasks;
  const stateUpdates = deriveEmployeeLiveStates({
    tasks: finalTasks,
    previous: liveBefore,
    now,
  });
  upsertEmployeeStates(stateUpdates, root, workspaceId);
  markTick(now, root, workspaceId);

  // Live Work Tracker: enrich Idle/Meeting + progress fields; timeline on change.
  try {
    syncLiveWorkTracker({
      repoRoot: root,
      workspaceId,
      now,
      recordTimeline: true,
    });
  } catch {
    /* tracker is non-blocking for Continuous OS tick */
  }

  const tickDecision: OsDecision = {
    id: newDecisionId(),
    kind: "tick",
    at: now,
    actorRole: "system",
    actorId: "continuous-os",
    actorName: "Continuous OS",
    summary: `Continuous OS tick — created ${tasksCreated}, split ${tasksSplit}, delegated ${tasksDelegated}, reviews ${reviewsRequested}`,
    taskId: null,
    employeeId: null,
    workItemId: null,
  };
  decisions.push(tickDecision);

  for (const d of decisions) {
    recordDecision(d, workspaceId, root);
    if (d.kind === "request_review") {
      recordLongTermMemory({
        record: {
          kind: "review",
          title: d.summary,
          insight: d.summary,
          employeeIds: d.employeeId ? [d.employeeId] : [],
          projectKey: "workpilot",
          workItemId: d.workItemId,
          occurredAt: now,
          sourceRefs: [d.id, d.taskId ?? ""].filter(Boolean),
          tags: ["review", "continuous_os"],
          confidence: 68,
          patternKey: `ltm:review:${d.taskId ?? d.id}`,
        },
        repoRoot: root,
        workspaceId,
        now,
      });
    }
  }

  // Persist blockers from live employee state
  for (const s of stateUpdates) {
    if (s.state !== "Blocked" || !s.note) continue;
    recordLongTermMemory({
      record: {
        kind: "blocker",
        title: `Blocker: ${s.employeeName}`,
        insight: s.note,
        employeeIds: [s.employeeId],
        projectKey: "workpilot",
        workItemId: s.activeTaskId,
        occurredAt: now,
        sourceRefs: [s.activeTaskId ?? s.employeeId],
        tags: ["blocker", "continuous_os"],
        confidence: 70,
        patternKey: `ltm:blocker:${s.employeeId}:${(s.activeTaskId ?? "none").slice(0, 24)}`,
      },
      repoRoot: root,
      workspaceId,
      now,
    });
  }

  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: "continuous_os.tick",
    executionStatus: "running",
  });

  return {
    tickAt: now,
    skipped: false,
    autonomy,
    stateUpdates,
    decisions,
    tasksCreated,
    tasksSplit,
    tasksDelegated,
    reviewsRequested,
  };
}

function upsertTaskList(tasks: DevTask[], updates: DevTask[]): DevTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const u of updates) byId.set(u.id, u);
  return [...byId.values()];
}

/** Keep sprint members first; preserve getPrioritizedSprintTasks order within band. */
function prioritizeOwnedTasks(
  tasks: DevTask[],
  activeSprintId: string | null
): DevTask[] {
  if (!activeSprintId) return tasks;
  const inSprint = (t: DevTask) => t.sprintId === activeSprintId;
  // Stable partition: in-sprint first, relative order unchanged.
  return [
    ...tasks.filter(inSprint),
    ...tasks.filter((t) => !inSprint(t)),
  ];
}

/**
 * CEO interrupt / reprioritize / approve / resume — anytime control plane.
 */
export function applyCeoOsAction(input: {
  action: CeoOsAction;
  actorUserId: string;
  actorName: string;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; snapshot: ContinuousOsSnapshot; decision: OsDecision }
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
  const store = getContinuousOsStore(root, workspaceId);
  const tasks = getAutonomyStore(root, workspaceId).tasks;
  let states = deriveEmployeeLiveStates({
    tasks,
    previous: store.employeeStates,
    now,
  });

  const action = input.action;
  let decision: OsDecision;

  if (action.action === "interrupt") {
    const emp = getEmployeeDefinition(action.employeeId);
    if (!emp) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Employee not found",
        status: 404,
      };
    }
    states = states.map((s) =>
      s.employeeId === action.employeeId
        ? {
            ...s,
            interrupted: true,
            state: "Waiting" as const,
            note: action.note?.trim() || "Interrupted by CEO",
            updatedAt: now,
          }
        : s
    );
    decision = {
      id: newDecisionId(),
      kind: "ceo_interrupt",
      at: now,
      actorRole: "owner",
      actorId: input.actorUserId,
      actorName: input.actorName,
      summary: `CEO interrupted ${emp.name}${action.note ? `: ${action.note}` : ""}`,
      taskId: states.find((s) => s.employeeId === action.employeeId)?.activeTaskId ?? null,
      employeeId: action.employeeId,
      workItemId: null,
    };
  } else if (action.action === "resume") {
    const emp = getEmployeeDefinition(action.employeeId);
    if (!emp) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Employee not found",
        status: 404,
      };
    }
    states = states.map((s) =>
      s.employeeId === action.employeeId
        ? {
            ...s,
            interrupted: false,
            note: action.note?.trim() || "Resumed by CEO",
            updatedAt: now,
          }
        : s
    );
    decision = {
      id: newDecisionId(),
      kind: "ceo_interrupt",
      at: now,
      actorRole: "owner",
      actorId: input.actorUserId,
      actorName: input.actorName,
      summary: `CEO resumed ${emp.name}`,
      taskId: null,
      employeeId: action.employeeId,
      workItemId: null,
    };
  } else if (action.action === "reprioritize") {
    const emp = getEmployeeDefinition(action.employeeId);
    if (!emp) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Employee not found",
        status: 404,
      };
    }
    states = states.map((s) =>
      s.employeeId === action.employeeId
        ? {
            ...s,
            priority: action.priority,
            note: action.note?.trim() || `Priority set to ${action.priority}`,
            updatedAt: now,
          }
        : s
    );
    if (action.taskId) {
      const task = tasks.find((t) => t.id === action.taskId);
      if (task) {
        upsertDevTasks(
          [
            {
              ...task,
              progressNote: `CEO reprioritized (P${action.priority})`,
              updatedAt: now,
            },
          ],
          root,
          workspaceId
        );
      }
    }
    decision = {
      id: newDecisionId(),
      kind: "ceo_reprioritize",
      at: now,
      actorRole: "owner",
      actorId: input.actorUserId,
      actorName: input.actorName,
      summary: `CEO reprioritized ${emp.name} to P${action.priority}`,
      taskId: action.taskId ?? null,
      employeeId: action.employeeId,
      workItemId: null,
    };
  } else if (action.action === "approve") {
    const task = tasks.find((t) => t.id === action.taskId);
    if (!task) {
      return {
        ok: false,
        code: "NOT_FOUND",
        message: "Task not found",
        status: 404,
      };
    }
    if (task.status !== "awaiting_ceo" && task.status !== "peer_review") {
      return {
        ok: false,
        code: "INVALID",
        message: "Task is not waiting for CEO approval",
        status: 400,
      };
    }
    upsertDevTasks(
      [
        {
          ...task,
          status: "done",
          progressNote: action.note?.trim() || "Approved by CEO",
          blocker: null,
          updatedAt: now,
        },
      ],
      root,
      workspaceId
    );
    const owner = getEmployeeDefinition(task.ownerEmployeeId);
    states = deriveEmployeeLiveStates({
      tasks: getAutonomyStore(root, workspaceId).tasks,
      previous: states.map((s) =>
        s.employeeId === task.ownerEmployeeId
          ? { ...s, interrupted: false, state: "Completed", updatedAt: now }
          : s
      ),
      now,
    });
    decision = {
      id: newDecisionId(),
      kind: "ceo_approve",
      at: now,
      actorRole: "owner",
      actorId: input.actorUserId,
      actorName: input.actorName,
      summary: `CEO approved ${task.id} (${owner?.name ?? task.ownerEmployeeId})`,
      taskId: task.id,
      employeeId: task.ownerEmployeeId,
      workItemId: task.workItem.id,
    };
  } else {
    return {
      ok: false,
      code: "INVALID",
      message: "Unknown CEO action",
      status: 400,
    };
  }

  upsertEmployeeStates(states, root, workspaceId);
  saveContinuousOsStore(
    {
      ...getContinuousOsStore(root, workspaceId),
      employeeStates: states,
      running: true,
    },
    root,
    workspaceId
  );
  recordDecision(decision, workspaceId, root);
  try {
    syncLiveWorkTracker({
      repoRoot: root,
      workspaceId,
      now,
      recordTimeline: true,
    });
  } catch {
    /* non-blocking */
  }
  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: `continuous_os.${action.action}`,
  });

  return {
    ok: true,
    snapshot: getContinuousOsSnapshot({ repoRoot: root, workspaceId }),
    decision,
  };
}

/** Ensure catalog employees appear in the live-state store. */
export function ensureEmployeeRoster(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): EmployeeLiveState[] {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const store = getContinuousOsStore(root, workspaceId);
  const tasks = getAutonomyStore(root, workspaceId).tasks;
  const states = deriveEmployeeLiveStates({
    tasks,
    previous: store.employeeStates.length
      ? store.employeeStates
      : AI_COMPANY_EMPLOYEES.map((e, i) => ({
          employeeId: e.id,
          employeeName: e.name,
          state: "Planning" as const,
          activeTaskId: null,
          note: null,
          priority: i + 1,
          interrupted: false,
          updatedAt: now,
        })),
    now,
  });
  upsertEmployeeStates(states, root, workspaceId);
  return states;
}
