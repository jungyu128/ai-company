/**
 * Map autonomy task status ↔ live employee work states.
 */

import type { DevTask, DevTaskStatus } from "../autonomous-company/types";
import type { EmployeeLiveState, EmployeeWorkState } from "./types";
import { AI_COMPANY_EMPLOYEES } from "../ai-company-employees";
import { nextWorkStateV2 } from "../operating-system-v2/os-v2.logic";

export function workStateFromDevStatus(status: DevTaskStatus): EmployeeWorkState {
  switch (status) {
    case "proposed":
      return "Planning";
    case "in_progress":
      return "Working";
    case "peer_review":
      return "Reviewing";
    case "awaiting_ceo":
      return "Waiting";
    case "blocked":
    case "needs_clarification":
      return "Blocked";
    case "done":
      return "Completed";
    default:
      return "Planning";
  }
}

/** Advance a non-interrupted employee one step along the continuous workday path. */
export function nextWorkState(
  state: EmployeeWorkState,
  opts?: {
    pendingCeoApproval?: boolean;
    interrupted?: boolean;
    dependencyIncomplete?: boolean;
    blockedReason?: string | null;
  }
): EmployeeWorkState | null {
  return nextWorkStateV2(state, opts);
}

export function mapWorkStateToDevStatus(state: EmployeeWorkState): DevTaskStatus {
  switch (state) {
    case "Idle":
      return "proposed";
    case "Planning":
      return "proposed";
    case "Working":
    case "Meeting":
      return "in_progress";
    case "Reviewing":
      return "peer_review";
    case "Waiting":
      return "awaiting_ceo";
    case "Blocked":
      return "blocked";
    case "Completed":
      return "done";
    default:
      return "proposed";
  }
}

/**
 * Derive live states for every catalog employee from active tasks + prior state.
 * Preserves CEO interrupts and explicit priority. Uses Idle when no active task.
 */
export function deriveEmployeeLiveStates(input: {
  tasks: DevTask[];
  previous: EmployeeLiveState[];
  now: string;
}): EmployeeLiveState[] {
  const prevById = new Map(input.previous.map((s) => [s.employeeId, s]));
  const active = input.tasks.filter((t) => t.status !== "done");

  return AI_COMPANY_EMPLOYEES.map((emp, index) => {
    const prev = prevById.get(emp.id);
    const owned = active
      .filter((t) => t.ownerEmployeeId === emp.id)
      .sort((a, b) => {
        const pa = prevById.get(a.ownerEmployeeId)?.priority ?? 50;
        const pb = prevById.get(b.ownerEmployeeId)?.priority ?? 50;
        return pa - pb || a.updatedAt.localeCompare(b.updatedAt);
      });

    const top = owned[0] ?? null;
    let state: EmployeeWorkState = "Idle";
    let note: string | null = "Idle — ready for next WorkPilot task";
    let activeTaskId: string | null = null;

    if (prev?.interrupted) {
      state = "Waiting";
      note = prev.note ?? "Interrupted by CEO — awaiting direction";
      activeTaskId = prev.activeTaskId;
    } else if (top) {
      state = workStateFromDevStatus(top.status);
      note = top.blocker ?? top.progressNote ?? top.title;
      activeTaskId = top.id;
    } else if (prev?.state === "Completed") {
      state = "Completed";
      note = prev.note;
      activeTaskId = prev.activeTaskId;
    }

    return {
      employeeId: emp.id,
      employeeName: emp.name,
      state,
      activeTaskId,
      note,
      priority: prev?.priority ?? index + 1,
      interrupted: prev?.interrupted ?? false,
      updatedAt: input.now,
      progressPercent: prev?.progressPercent,
      startedAt: top?.createdAt ?? prev?.startedAt ?? null,
      estimatedCompletionAt: prev?.estimatedCompletionAt ?? null,
      currentStep: prev?.currentStep,
      dependencies: top?.collaboratorIds ?? prev?.dependencies ?? [],
      waitingFor: prev?.waitingFor ?? null,
      nextPlannedAction: prev?.nextPlannedAction,
    };
  });
}
