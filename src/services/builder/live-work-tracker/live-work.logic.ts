import type { DevTask } from "@/services/builder/autonomous-company/types";
import type {
  EmployeeLiveState,
  EmployeeWorkState,
} from "@/services/builder/continuous-os/types";
import type { CompanyMeeting } from "@/services/builder/meetings/types";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";
import type {
  LiveWorkPreviousFingerprint,
  LiveWorkTrackerEntry,
  LiveWorkTrackerSnapshot,
  LiveWorkStatus,
} from "./types";

export const STATUS_PROGRESS: Record<EmployeeWorkState, number> = {
  Idle: 0,
  Planning: 15,
  Working: 40,
  Reviewing: 65,
  Meeting: 40,
  Waiting: 50,
  Blocked: 35,
  Completed: 100,
};

export const NEXT_ACTION: Record<EmployeeWorkState, string> = {
  Idle: "Await next prioritized assignment",
  Planning: "Move into focused execution",
  Working: "Continue implementation toward review",
  Reviewing: "Address review feedback or request CEO decision",
  Meeting: "Return to task after meeting",
  Waiting: "Unblock dependency and resume work",
  Blocked: "Resolve blocker or escalate to CEO",
  Completed: "Pick up next backlog item",
};

export const STEP_LABEL: Record<EmployeeWorkState, string> = {
  Idle: "Standby",
  Planning: "Planning approach",
  Working: "Executing work",
  Reviewing: "In review",
  Meeting: "In meeting",
  Waiting: "Waiting on dependency",
  Blocked: "Blocked",
  Completed: "Completed",
};

/** Progress is discrete from live work state only — never invented mid-step %. */
export function progressForStatus(status: EmployeeWorkState): number {
  return STATUS_PROGRESS[status] ?? 0;
}

export function meetingOccupancy(input: {
  meetings: CompanyMeeting[];
  employeeId: string;
}): { inMeeting: boolean; meetingTitle: string | null } {
  // Only active lifecycle statuses occupy employees.
  // awaiting_ceo / approved / completed / cancelled never leave people Waiting forever.
  const open = input.meetings.filter((m) => {
    if (!m.participantIds.includes(input.employeeId)) return false;
    if (m.completedAt || m.cancelledAt) return false;
    return (
      m.status === "scheduled" ||
      m.status === "started" ||
      m.status === "in_progress" ||
      m.status === "in_discussion"
    );
  });
  if (!open.length) return { inMeeting: false, meetingTitle: null };
  const m = open[0]!;
  return { inMeeting: true, meetingTitle: m.title };
}

/**
 * Enrich a Continuous OS live state with Idle/Meeting + tracker fields.
 */
export function enrichEmployeeLiveState(input: {
  base: EmployeeLiveState;
  task: DevTask | null;
  inMeeting: boolean;
  meetingTitle: string | null;
  now: string;
}): EmployeeLiveState {
  const { base, task, inMeeting, meetingTitle, now } = input;
  let state: EmployeeWorkState = base.state;
  let note = base.note;
  let activeTaskId = base.activeTaskId;

  if (base.interrupted) {
    state = "Waiting";
    note = note ?? "Interrupted by CEO — awaiting direction";
  } else if (inMeeting && state !== "Completed" && state !== "Blocked") {
    state = "Meeting";
    note = meetingTitle ? `In meeting: ${meetingTitle}` : "In company meeting";
  } else if (!task) {
    if (state !== "Blocked" && state !== "Waiting" && state !== "Completed") {
      state = "Idle";
      note = "Idle — no active task";
      activeTaskId = null;
    }
  }

  const startedAt =
    task?.createdAt ?? (state === "Idle" ? null : base.startedAt ?? base.updatedAt);
  const progressPercent = progressForStatus(state);

  const dependencyNames = (task?.collaboratorIds ?? []).map(
    (id) => AI_COMPANY_EMPLOYEES.find((e) => e.id === id)?.name ?? id
  );

  const waitingFor =
    state === "Blocked"
      ? task?.blocker ?? note ?? "Unresolved blocker"
      : state === "Waiting"
        ? task?.status === "awaiting_ceo"
          ? "CEO decision"
          : dependencyNames.length
            ? `Collaborators: ${dependencyNames.join(", ")}`
            : "External dependency"
        : state === "Meeting"
          ? meetingTitle
          : null;

  // currentStep comes from real task note only when Working; otherwise from status label.
  const currentStep =
    state === "Working" && task?.progressNote?.trim()
      ? task.progressNote.trim().slice(0, 120)
      : STEP_LABEL[state];

  return {
    ...base,
    state,
    note,
    activeTaskId,
    updatedAt: now,
    progressPercent,
    startedAt,
    estimatedCompletionAt: null,
    currentStep,
    dependencies: task?.collaboratorIds ?? [],
    waitingFor,
    nextPlannedAction: NEXT_ACTION[state],
  };
}

export function buildLiveWorkTrackerEntry(input: {
  live: EmployeeLiveState;
  task: DevTask | null;
  role: string;
}): LiveWorkTrackerEntry {
  const { live, task, role } = input;
  const status = live.state as LiveWorkStatus;
  return {
    employeeId: live.employeeId,
    employeeName: live.employeeName,
    role,
    status,
    currentTask: task?.title ?? (status === "Idle" ? null : live.note),
    currentTaskId: live.activeTaskId,
    progressPercent: live.progressPercent ?? progressForStatus(status),
    startedAt: live.startedAt ?? task?.createdAt ?? null,
    estimatedCompletionAt: null,
    currentStep: live.currentStep ?? STEP_LABEL[status],
    lastUpdate: live.updatedAt,
    dependencies: live.dependencies ?? task?.collaboratorIds ?? [],
    waitingFor: live.waitingFor ?? null,
    nextPlannedAction: live.nextPlannedAction ?? NEXT_ACTION[status],
    priority: live.priority,
    interrupted: live.interrupted,
  };
}

function idleLiveState(
  employeeId: string,
  employeeName: string,
  now: string,
  priority: number
): EmployeeLiveState {
  return {
    employeeId,
    employeeName,
    state: "Idle",
    activeTaskId: null,
    note: "Idle — no live state yet",
    priority,
    interrupted: false,
    updatedAt: now,
    progressPercent: 0,
    startedAt: null,
    estimatedCompletionAt: null,
    currentStep: "Standby",
    dependencies: [],
    waitingFor: null,
    nextPlannedAction: NEXT_ACTION.Idle,
  };
}

export function buildLiveWorkTrackerSnapshot(input: {
  liveStates: EmployeeLiveState[];
  tasks: DevTask[];
  previousFingerprints?: LiveWorkPreviousFingerprint[];
  now: string;
}): LiveWorkTrackerSnapshot {
  const { liveStates, tasks, previousFingerprints = [], now } = input;
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const prev = new Map(previousFingerprints.map((p) => [p.employeeId, p]));

  const employees: LiveWorkTrackerEntry[] = AI_COMPANY_EMPLOYEES.map((emp, index) => {
    const live =
      liveStates.find((s) => s.employeeId === emp.id) ??
      idleLiveState(emp.id, emp.name, now, index + 1);
    const task = live.activeTaskId ? byTask.get(live.activeTaskId) ?? null : null;
    return buildLiveWorkTrackerEntry({
      live,
      task,
      role: emp.role,
    });
  });

  const recentChanges: LiveWorkTrackerSnapshot["recentChanges"] = [];
  for (const e of employees) {
    const p = prev.get(e.employeeId);
    if (
      !p ||
      p.status !== e.status ||
      p.currentTaskId !== e.currentTaskId ||
      p.progressPercent !== e.progressPercent ||
      p.currentStep !== e.currentStep
    ) {
      recentChanges.push({
        employeeId: e.employeeId,
        employeeName: e.employeeName,
        fromStatus: p?.status ?? null,
        toStatus: e.status,
        at: now,
        summary: p
          ? `${e.employeeName}: ${p.status} → ${e.status}${
              e.currentTask ? ` · ${e.currentTask}` : ""
            }`
          : `${e.employeeName}: live as ${e.status}`,
      });
    }
  }

  return {
    asOf: now,
    employees,
    summary: {
      idle: employees.filter((e) => e.status === "Idle").length,
      planning: employees.filter((e) => e.status === "Planning").length,
      working: employees.filter((e) => e.status === "Working").length,
      reviewing: employees.filter((e) => e.status === "Reviewing").length,
      meeting: employees.filter((e) => e.status === "Meeting").length,
      waiting: employees.filter((e) => e.status === "Waiting").length,
      blocked: employees.filter((e) => e.status === "Blocked").length,
      completed: employees.filter((e) => e.status === "Completed").length,
    },
    recentChanges,
  };
}

export function fingerprintsFromSnapshot(
  snapshot: LiveWorkTrackerSnapshot
): LiveWorkPreviousFingerprint[] {
  return snapshot.employees.map((e) => ({
    employeeId: e.employeeId,
    status: e.status,
    currentTaskId: e.currentTaskId,
    progressPercent: e.progressPercent,
    currentStep: e.currentStep,
  }));
}

/** Map live work status → employee card status for HQ UI. */
export function cardStatusFromLiveWork(
  status: LiveWorkStatus
):
  | "online"
  | "thinking"
  | "working"
  | "waiting_approval"
  | "collaborating"
  | "completed"
  | "offline" {
  switch (status) {
    case "Idle":
      return "online";
    case "Planning":
      return "thinking";
    case "Working":
      return "working";
    case "Reviewing":
      return "collaborating";
    case "Meeting":
      return "collaborating";
    case "Waiting":
      return "waiting_approval";
    case "Blocked":
      return "waiting_approval";
    case "Completed":
      return "completed";
    default:
      return "online";
  }
}
