/**
 * Employee work actions: create, split, delegate, request review.
 * Pure transformations over DevTask — store writes happen in the service.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import { proposeDevTask } from "../autonomous-company/autonomy.logic";
import { defaultCollaboratorsFor } from "../autonomous-company/peer-discussion.logic";
import { pickOwnerForWork } from "../autonomous-company/dev-ownership.logic";
import { allocateDevTaskId } from "../autonomous-company/work-items.logic";
import type { DevTask, WorkItemLink } from "../autonomous-company/types";

export function createEmployeeWork(input: {
  title: string;
  description: string;
  ownerEmployeeId?: string;
  workItem?: WorkItemLink | null;
  now: string;
}): DevTask {
  return proposeDevTask({
    title: input.title,
    description: input.description,
    ownerEmployeeId: input.ownerEmployeeId,
    workItem: input.workItem,
    now: input.now,
    status: "proposed",
  });
}

/** Split a task into primary (keeps owner) + secondary (collaborator or picked owner). */
export function splitDevTask(input: {
  task: DevTask;
  now: string;
  secondaryOwnerId?: string | null;
}): { primary: DevTask; secondary: DevTask } {
  const secondaryOwner =
    input.secondaryOwnerId?.trim() ||
    input.task.collaboratorIds[0] ||
    pickOwnerForWork({
      title: `${input.task.title} follow-up`,
      kind: input.task.description,
    });

  const secondary: DevTask = {
    ...proposeDevTask({
      title: `Split: ${input.task.title}`,
      description: `Delegated slice of ${input.task.id}: ${input.task.description}`,
      ownerEmployeeId: secondaryOwner,
      workItem: input.task.workItem,
      now: input.now,
      status: "proposed",
    }),
    id: allocateDevTaskId(new Date(input.now)),
    collaboratorIds: defaultCollaboratorsFor(secondaryOwner).filter(
      (id) => id !== secondaryOwner
    ),
    progressNote: `Split from ${input.task.id}`,
  };

  const primary: DevTask = {
    ...input.task,
    status: input.task.status === "proposed" ? "in_progress" : input.task.status,
    progressNote: `Split — secondary ${secondary.id} owned by ${secondaryOwner}`,
    updatedAt: input.now,
  };

  return { primary, secondary };
}

export function delegateDevTask(input: {
  task: DevTask;
  toEmployeeId: string;
  now: string;
}): DevTask {
  const to = input.toEmployeeId.trim();
  if (!getEmployeeDefinition(to)) {
    throw new Error(`Unknown employee: ${to}`);
  }
  if (to === input.task.ownerEmployeeId) {
    throw new Error("Cannot delegate a task to its current owner");
  }
  const prevOwner = input.task.ownerEmployeeId;
  return {
    ...input.task,
    ownerEmployeeId: to,
    collaboratorIds: [
      ...new Set(
        [prevOwner, ...input.task.collaboratorIds, ...defaultCollaboratorsFor(to)].filter(
          (id) => id !== to
        )
      ),
    ],
    status: "in_progress",
    progressNote: `Delegated from ${prevOwner} to ${to}`,
    updatedAt: input.now,
  };
}

export function requestReview(input: {
  task: DevTask;
  now: string;
  reviewerId?: string | null;
}): DevTask {
  const reviewer =
    input.reviewerId?.trim() ||
    input.task.collaboratorIds[0] ||
    pickOwnerForWork({ title: "code review", kind: "qa" });
  const collaborators = [
    ...new Set(
      [...input.task.collaboratorIds, reviewer].filter(
        (id) => id !== input.task.ownerEmployeeId
      )
    ),
  ];
  return {
    ...input.task,
    collaboratorIds: collaborators,
    status: "peer_review",
    progressNote: `Review requested from ${reviewer}`,
    updatedAt: input.now,
  };
}

/** Advance task status to match a live work-state transition (never auto-merges). */
export function advanceTaskForState(input: {
  task: DevTask;
  nextState: "Working" | "Reviewing" | "Waiting";
  now: string;
}): DevTask {
  if (input.nextState === "Working") {
    return {
      ...input.task,
      status: "in_progress",
      progressNote: input.task.progressNote ?? "Continuously working WorkPilot task",
      updatedAt: input.now,
    };
  }
  if (input.nextState === "Reviewing") {
    return requestReview({ task: input.task, now: input.now });
  }
  return {
    ...input.task,
    status: "awaiting_ceo",
    progressNote: "Ready for CEO review / approval",
    updatedAt: input.now,
  };
}
