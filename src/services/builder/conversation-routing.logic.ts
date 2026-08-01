/**
 * Sprint 1 Part 1 — AI Company conversation ownership & routing.
 * Part 2 — uses discussion-quality helpers for domain contributions & synthesis.
 * Pure helpers. No UI, memory, mission, approval, or connector changes.
 */

import { getEmployeeDefinition } from "./ai-company-employees";
import type { ConversationTurn } from "./conversation.logic";
import {
  assertContributionQuality,
  buildDomainContributionParts,
  buildOwnerOpeningParts,
  buildOwnerSynthesisParts,
  defaultLiveDataAvailability,
  formatContributionBody,
  formatOwnerSynthesisBody,
  type LiveDataAvailability,
  type OwnerSynthesisParts,
} from "./discussion-quality.logic";

export type ConversationRoutingState = {
  /** Employee who received the CEO question / owns the thread. Immutable unless CEO explicitly reassigns. */
  ownerEmployeeId: string;
  /** Employees explicitly invited by the owner (never auto-joined). */
  invitedEmployeeIds: string[];
};

export type RoutedCeoQuestionResult = {
  ownerEmployeeId: string;
  ceoTurn: ConversationTurn;
  ownerTurn: ConversationTurn;
  turns: ConversationTurn[];
};

export type SynthesizeOwnerResult = {
  turn: ConversationTurn;
  recommendation: string;
  synthesis: OwnerSynthesisParts;
};

function participantMeta(employeeId: string) {
  const emp = getEmployeeDefinition(employeeId);
  return {
    id: employeeId,
    name: emp?.name ?? employeeId,
    role: emp?.role ?? "AI Employee",
    def: emp,
  };
}

function offsetIso(base: string, seconds: number): string {
  const t = Date.parse(base);
  if (Number.isNaN(t)) return base;
  return new Date(t + seconds * 1000).toISOString();
}

/** Normalize whitespace for echo detection. */
export function normalizeConversationText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * True when a reply merely repeats the CEO message (full echo or trivial paraphrase).
 */
export function isEchoOfCeoMessage(ceoMessage: string, reply: string): boolean {
  const ceo = normalizeConversationText(ceoMessage);
  const body = normalizeConversationText(reply);
  if (!ceo || !body) return false;
  if (body === ceo) return true;
  if (body.includes(ceo) && ceo.length >= 12) return true;
  if (ceo.length >= 8 && new RegExp(`\\baround:\\s*${escapeRegExp(ceo)}`, "i").test(reply)) {
    return true;
  }
  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createConversationOwnership(
  ownerEmployeeId: string
): ConversationRoutingState {
  if (!getEmployeeDefinition(ownerEmployeeId)) {
    throw new Error("UNKNOWN_OWNER");
  }
  return {
    ownerEmployeeId,
    invitedEmployeeIds: [],
  };
}

/**
 * Resolve owner from recommendation-like records (backward compatible).
 * Never invents a different owner than the designated conversation owner / lead.
 */
export function resolveConversationOwner(input: {
  conversationOwnerId?: string | null;
  leadEmployeeId: string;
}): string {
  const explicit = input.conversationOwnerId?.trim();
  if (explicit && getEmployeeDefinition(explicit)) return explicit;
  return input.leadEmployeeId;
}

/**
 * Owner-only first response for a new internal discussion.
 * Suggested collaborators are returned but NOT added to the conversation.
 */
export function buildOwnerOnlyDiscussion(input: {
  ownerEmployeeId: string;
  seedDetail: string;
  conversationKey: string;
  now: string;
  suggestedInvitees?: string[];
}): {
  ownership: ConversationRoutingState;
  discussion: ConversationTurn[];
  participants: string[];
  suggestedInvitees: string[];
} {
  const ownership = createConversationOwnership(input.ownerEmployeeId);
  const owner = participantMeta(input.ownerEmployeeId);
  const parts = buildOwnerOpeningParts(input.ownerEmployeeId, {
    ceoMessage: input.seedDetail,
    priorBodies: [],
  });
  const firstBody = formatContributionBody(parts);

  const discussion: ConversationTurn[] = [
    {
      id: `${input.conversationKey}-owner-${input.ownerEmployeeId}`,
      employeeId: input.ownerEmployeeId,
      employeeName: owner.name,
      role: owner.role,
      body: firstBody,
      at: input.now,
      kind: "update",
    },
  ];

  const suggestedInvitees = (input.suggestedInvitees ?? [])
    .filter((id) => id !== input.ownerEmployeeId && Boolean(getEmployeeDefinition(id)))
    .filter((id, i, arr) => arr.indexOf(id) === i);

  return {
    ownership,
    discussion,
    participants: [input.ownerEmployeeId],
    suggestedInvitees,
  };
}

/**
 * Route a CEO question to the conversation owner.
 * Only the owner generates the first employee response. Never echoes the CEO message.
 */
export function routeCeoQuestionToOwner(input: {
  ownerEmployeeId: string;
  ceoMessage: string;
  conversationKey: string;
  now: string;
  priorBodies?: string[];
  willInvitePeers?: boolean;
  peerNames?: string[];
  /** When false, omit the CEO turn (caller already appended it). Default true. */
  includeCeoTurn?: boolean;
}): RoutedCeoQuestionResult {
  const ownerId = input.ownerEmployeeId;
  if (!getEmployeeDefinition(ownerId)) {
    throw new Error("UNKNOWN_OWNER");
  }

  const ceoMessage =
    input.ceoMessage.trim() || "Can you clarify the recommendation?";
  const owner = participantMeta(ownerId);
  const parts = buildOwnerOpeningParts(ownerId, {
    ceoMessage,
    priorBodies: input.priorBodies ?? [],
    willInvitePeers: input.willInvitePeers,
    peerNames: input.peerNames,
  });
  let ownerBody = formatContributionBody(parts);

  if (isEchoOfCeoMessage(ceoMessage, ownerBody)) {
    ownerBody = formatContributionBody({
      observation: `I'll stay in-domain and review the available ${owner.def?.expertise[0]?.toLowerCase() ?? "operating"} signals.`,
      implication: "Restating the CEO question would not add decision value.",
      action: "I'll return one structured recommendation without repeating the ask.",
    });
  }

  const ceoTurn: ConversationTurn = {
    id: `${input.conversationKey}-ceo-ask-${input.now}`,
    employeeId: "ceo",
    employeeName: "CEO",
    role: "Executive",
    body: ceoMessage,
    at: input.now,
    kind: "approval",
  };

  const ownerTurn: ConversationTurn = {
    id: `${input.conversationKey}-owner-reply-${input.now}`,
    employeeId: ownerId,
    employeeName: owner.name,
    role: owner.role,
    body: ownerBody,
    at: offsetIso(input.now, 20),
    kind: "update",
  };

  const includeCeo = input.includeCeoTurn !== false;
  return {
    ownerEmployeeId: ownerId,
    ceoTurn,
    ownerTurn,
    turns: includeCeo ? [ceoTurn, ownerTurn] : [ownerTurn],
  };
}

/**
 * Owner explicitly invites another employee. Does not transfer ownership.
 */
export function inviteEmployeeToConversation(input: {
  ownership: ConversationRoutingState;
  inviteeEmployeeId: string;
  invitedByEmployeeId: string;
  conversationKey: string;
  now: string;
}): {
  ownership: ConversationRoutingState;
  turn: ConversationTurn;
} {
  if (input.invitedByEmployeeId !== input.ownership.ownerEmployeeId) {
    throw new Error("ONLY_OWNER_CAN_INVITE");
  }
  if (input.inviteeEmployeeId === input.ownership.ownerEmployeeId) {
    throw new Error("OWNER_ALREADY_PRESENT");
  }
  if (!getEmployeeDefinition(input.inviteeEmployeeId)) {
    throw new Error("UNKNOWN_INVITEE");
  }

  const invited = input.ownership.invitedEmployeeIds.includes(input.inviteeEmployeeId)
    ? [...input.ownership.invitedEmployeeIds]
    : [...input.ownership.invitedEmployeeIds, input.inviteeEmployeeId];

  const owner = participantMeta(input.ownership.ownerEmployeeId);
  const invitee = participantMeta(input.inviteeEmployeeId);

  return {
    ownership: {
      ownerEmployeeId: input.ownership.ownerEmployeeId,
      invitedEmployeeIds: invited,
    },
    turn: {
      id: `${input.conversationKey}-invite-${input.inviteeEmployeeId}-${input.now}`,
      employeeId: "system",
      employeeName: "System",
      role: "Coordinator",
      body: `${owner.name} invited ${invitee.name} to the discussion.`,
      at: input.now,
      kind: "system",
    },
  };
}

/**
 * Invited employee contributes only from their domain (observation + implication + action).
 * Returns null when contribution quality cannot be satisfied (caller must not list as participant).
 */
export function appendInvitedDomainContribution(input: {
  ownership: ConversationRoutingState;
  employeeId: string;
  conversationKey: string;
  now: string;
  priorBodies?: string[];
  ceoMessage?: string | null;
  liveData?: LiveDataAvailability;
}): ConversationTurn | null {
  const isOwner = input.employeeId === input.ownership.ownerEmployeeId;
  const isInvited = input.ownership.invitedEmployeeIds.includes(input.employeeId);
  if (!isOwner && !isInvited) {
    throw new Error("NOT_INVITED");
  }
  if (isOwner) {
    throw new Error("OWNER_USE_SYNTHESIS");
  }

  const emp = participantMeta(input.employeeId);
  const priorBodies = input.priorBodies ?? [];
  let parts = buildDomainContributionParts(input.employeeId, {
    priorBodies,
    ceoMessage: input.ceoMessage,
    liveData: input.liveData ?? defaultLiveDataAvailability(),
    variant: 0,
  });
  let body = formatContributionBody(parts);
  let quality = assertContributionQuality({
    body,
    employeeId: input.employeeId,
    priorBodies,
    ceoMessage: input.ceoMessage,
  });
  if (!quality.ok) {
    parts = buildDomainContributionParts(input.employeeId, {
      priorBodies,
      ceoMessage: input.ceoMessage,
      liveData: input.liveData ?? defaultLiveDataAvailability(),
      variant: 1,
    });
    body = formatContributionBody(parts);
    quality = assertContributionQuality({
      body,
      employeeId: input.employeeId,
      priorBodies,
      ceoMessage: input.ceoMessage,
    });
  }
  if (!quality.ok) {
    return null;
  }

  return {
    id: `${input.conversationKey}-contrib-${input.employeeId}-${input.now}`,
    employeeId: input.employeeId,
    employeeName: emp.name,
    role: emp.role,
    body,
    at: input.now,
    kind: "handoff",
  };
}

/**
 * Owner synthesizes the discussion into one final recommendation for the CEO.
 */
export function synthesizeOwnerRecommendation(input: {
  ownership: ConversationRoutingState;
  discussion: ConversationTurn[];
  baseRecommendation: string;
  conversationKey: string;
  now: string;
  reasoning?: string | null;
  expectedImpact?: string | null;
  confidence?: number | null;
  liveData?: LiveDataAvailability;
}): SynthesizeOwnerResult {
  const owner = participantMeta(input.ownership.ownerEmployeeId);
  const synthesis = buildOwnerSynthesisParts({
    ownerEmployeeId: input.ownership.ownerEmployeeId,
    baseRecommendation: input.baseRecommendation,
    reasoning: input.reasoning,
    expectedImpact: input.expectedImpact,
    confidence: input.confidence,
    discussion: input.discussion,
    invitedEmployeeIds: input.ownership.invitedEmployeeIds,
    liveData: input.liveData ?? defaultLiveDataAvailability(),
  });

  const body = formatOwnerSynthesisBody(owner.name, synthesis);

  return {
    recommendation: synthesis.recommendation,
    synthesis,
    turn: {
      id: `${input.conversationKey}-synth-${input.now}`,
      employeeId: input.ownership.ownerEmployeeId,
      employeeName: owner.name,
      role: owner.role,
      body,
      at: input.now,
      kind: "request",
    },
  };
}

/**
 * Suggested collaborators for an owner — never auto-joined.
 */
export function suggestedCollaboratorsForOwner(ownerEmployeeId: string): string[] {
  const map: Record<string, string[]> = {
    sarah: ["david", "emma"],
    emma: ["sarah"],
    alex: ["emma", "sarah"],
    david: ["emma", "sarah"],
    noah: ["sarah", "olivia"],
    olivia: ["david", "emma"],
    daniel: ["sophia", "emma"],
    sophia: ["olivia", "sarah"],
  };
  return (map[ownerEmployeeId] ?? []).filter(
    (id) => id !== ownerEmployeeId && Boolean(getEmployeeDefinition(id))
  );
}

/**
 * Explicit CEO reassignment of ownership (not automatic).
 */
export function transferConversationOwner(input: {
  ownership: ConversationRoutingState;
  newOwnerEmployeeId: string;
}): ConversationRoutingState {
  if (!getEmployeeDefinition(input.newOwnerEmployeeId)) {
    throw new Error("UNKNOWN_OWNER");
  }
  return {
    ownerEmployeeId: input.newOwnerEmployeeId,
    invitedEmployeeIds: input.ownership.invitedEmployeeIds.filter(
      (id) => id !== input.newOwnerEmployeeId
    ),
  };
}
