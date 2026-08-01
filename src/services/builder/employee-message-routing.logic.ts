/**
 * Strict employee message routing.
 * When the CEO explicitly addresses an employee by name, only that employee may
 * respond and they become the mission/conversation owner. Peers join only when
 * the owner invites them or a hard dependency requires them.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
  matchEmployeeIdForText,
} from "./ai-company-employees";
import {
  detectCollaborationRequest,
  resolveExplicitCeoAddressee,
} from "./ceo-discussion-orchestration.logic";

export type OwnershipMode = "strict" | "collaborative";

export type StrictMessageRoute = {
  /** Explicit addressee when the CEO named someone; otherwise null. */
  addressedEmployeeId: string | null;
  /** Sole mission / conversation owner after routing. */
  ownerEmployeeId: string;
  /** Previous owner when ownership transferred; otherwise null. */
  transferredFrom: string | null;
  /** Employees allowed to speak in the first response wave (owner only). */
  allowedResponderIds: string[];
  /**
   * Employees allowed to participate after ownership is established
   * (owner + invited + dependency-required).
   */
  allowedParticipantIds: string[];
  /** CEO explicitly asked for multi-employee input. */
  collaborationRequested: boolean;
  ownershipMode: OwnershipMode;
  reason: string;
};

function uniqueIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (!id || out.includes(id)) continue;
    if (!getEmployeeDefinition(id)) continue;
    out.push(id);
  }
  return out;
}

/**
 * Hard dependencies implied by the work text — not soft collaborator suggestions.
 * Used after ownership is established so autonomous collab can include required peers.
 */
export function dependencyEmployeeIdsForWork(input: {
  text: string;
  ownerEmployeeId: string;
}): string[] {
  const blob = input.text.toLowerCase();
  const ids: string[] = [];
  const push = (id: string) => {
    if (id === input.ownerEmployeeId) return;
    if (getEmployeeDefinition(id)) ids.push(id);
  };

  if (/\b(qa|test plan|regression|verify|ship|release|acceptance test)\b/.test(blob)) {
    push("emma");
  }
  if (/\b(architect(?:ure)?|system design|boundaries|design review)\b/.test(blob)) {
    push("olivia");
  }
  if (/\b(deploy|ci\/cd|pipeline|infrastructure|devops)\b/.test(blob)) {
    push("daniel");
  }
  if (/\b(technical strategy|platform direction|cto)\b/.test(blob)) {
    push("sophia");
  }

  return uniqueIds(ids);
}

/**
 * Resolve strict routing for a CEO message.
 * Explicit name address always wins ownership; other employees cannot intercept.
 */
export function resolveStrictMessageRoute(input: {
  ceoMessage: string;
  currentOwnerEmployeeId?: string | null;
  currentLeadEmployeeId?: string | null;
  invitedEmployeeIds?: string[] | null;
  /** Extra dependency ids already known from the work graph. */
  dependencyEmployeeIds?: string[] | null;
  fallbackOwnerEmployeeId?: string;
}): StrictMessageRoute {
  const text = input.ceoMessage.trim();
  const addressed = resolveExplicitCeoAddressee(text);
  const priorOwner =
    (input.currentOwnerEmployeeId && getEmployeeDefinition(input.currentOwnerEmployeeId)
      ? input.currentOwnerEmployeeId
      : null) ??
    (input.currentLeadEmployeeId && getEmployeeDefinition(input.currentLeadEmployeeId)
      ? input.currentLeadEmployeeId
      : null);

  let ownerEmployeeId: string;
  let transferredFrom: string | null = null;
  let reason: string;
  let ownershipMode: OwnershipMode;

  if (addressed) {
    ownerEmployeeId = addressed;
    ownershipMode = "strict";
    if (priorOwner && priorOwner !== addressed) {
      transferredFrom = priorOwner;
      reason = `CEO explicitly addressed ${getEmployeeDefinition(addressed)?.name ?? addressed}; ownership transferred.`;
    } else {
      reason = `CEO explicitly addressed ${getEmployeeDefinition(addressed)?.name ?? addressed}; they alone may respond.`;
    }
  } else if (priorOwner) {
    ownerEmployeeId = priorOwner;
    ownershipMode = "collaborative";
    reason = "No explicit addressee — current owner retains the thread.";
  } else {
    ownerEmployeeId =
      matchEmployeeIdForText(text) ??
      input.fallbackOwnerEmployeeId ??
      "emma";
    if (!getEmployeeDefinition(ownerEmployeeId)) {
      ownerEmployeeId = AI_COMPANY_EMPLOYEES[0]?.id ?? "emma";
    }
    ownershipMode = "collaborative";
    reason = "No explicit addressee — domain fallback owner assigned.";
  }

  const collaborationRequested = detectCollaborationRequest(text);
  const deps = uniqueIds([
    ...(input.dependencyEmployeeIds ?? []),
    ...dependencyEmployeeIdsForWork({ text, ownerEmployeeId }),
  ]);
  const invited = uniqueIds(input.invitedEmployeeIds ?? []).filter(
    (id) => id !== ownerEmployeeId
  );

  return {
    addressedEmployeeId: addressed,
    ownerEmployeeId,
    transferredFrom,
    allowedResponderIds: [ownerEmployeeId],
    allowedParticipantIds: uniqueIds([ownerEmployeeId, ...invited, ...deps]),
    collaborationRequested,
    ownershipMode,
    reason,
  };
}

/** True only when this employee is allowed to speak as the first responder. */
export function canEmployeeRespondToCeoMessage(
  route: StrictMessageRoute,
  employeeId: string
): boolean {
  return route.allowedResponderIds.includes(employeeId);
}

/** True when the employee may participate after ownership (invite or dependency). */
export function canEmployeeParticipate(
  route: StrictMessageRoute,
  employeeId: string
): boolean {
  return route.allowedParticipantIds.includes(employeeId);
}

/**
 * Resolve mission lead from CEO text with strict name precedence.
 */
export function resolveMissionOwnerFromCeoText(
  text: string,
  options?: {
    preferredEmployeeId?: string | null;
    fallbackOwnerEmployeeId?: string;
  }
): { ownerEmployeeId: string; ownershipMode: OwnershipMode; addressedEmployeeId: string | null } {
  if (options?.preferredEmployeeId && getEmployeeDefinition(options.preferredEmployeeId)) {
    const addressed = resolveExplicitCeoAddressee(text);
    // Explicit address still wins over a UI-selected employee when names conflict.
    if (addressed) {
      return {
        ownerEmployeeId: addressed,
        ownershipMode: "strict",
        addressedEmployeeId: addressed,
      };
    }
    return {
      ownerEmployeeId: options.preferredEmployeeId,
      ownershipMode: "collaborative",
      addressedEmployeeId: null,
    };
  }
  const route = resolveStrictMessageRoute({
    ceoMessage: text,
    fallbackOwnerEmployeeId: options?.fallbackOwnerEmployeeId,
  });
  return {
    ownerEmployeeId: route.ownerEmployeeId,
    ownershipMode: route.ownershipMode,
    addressedEmployeeId: route.addressedEmployeeId,
  };
}

/**
 * Expand invited set after the owner explicitly invites peers (preserves autonomy).
 */
export function withOwnerInvites(
  route: StrictMessageRoute,
  invitedEmployeeIds: string[]
): StrictMessageRoute {
  const invited = uniqueIds(invitedEmployeeIds).filter(
    (id) => id !== route.ownerEmployeeId
  );
  return {
    ...route,
    allowedParticipantIds: uniqueIds([
      route.ownerEmployeeId,
      ...invited,
      ...route.allowedParticipantIds,
    ]),
  };
}
