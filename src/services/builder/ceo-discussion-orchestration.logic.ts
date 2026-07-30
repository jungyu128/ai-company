/**
 * Sprint 1 Part 4 — CEO addressee routing, invite selection, participant integrity.
 * Deterministic helpers only. No React / mission / memory / connector I/O.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
} from "./ai-company-employees";
import type { ConversationTurn } from "./conversation.logic";

function suggestedPeersForOwner(ownerEmployeeId: string): string[] {
  const map: Record<string, string[]> = {
    sarah: ["david", "emma"],
    emma: ["sarah"],
    alex: ["mia", "sarah"],
    david: ["emma", "sarah"],
    mia: ["alex", "david"],
    noah: ["sarah", "emma"],
    olivia: ["david"],
    ethan: ["emma"],
  };
  return (map[ownerEmployeeId] ?? []).filter((id) => id !== ownerEmployeeId);
}
const SYSTEM_ACTOR = {
  employeeId: "system",
  employeeName: "System",
  role: "Coordinator",
} as const;

/** Detect an employee the CEO is explicitly addressing / assigning to lead. */
export function resolveExplicitCeoAddressee(message: string): string | null {
  const text = message.trim();
  if (!text) return null;

  for (const emp of AI_COMPANY_EMPLOYEES) {
    const name = escapeRegExp(emp.name);
    // "Alex, …" / "Alex: …" at message start
    if (new RegExp(`^${name}\\s*[,:]\\s+`, "i").test(text)) {
      return emp.id;
    }
  }

  for (const emp of AI_COMPANY_EMPLOYEES) {
    const name = escapeRegExp(emp.name);
    // Ask/Have/Tell Alex to …
    if (new RegExp(`\\b(?:ask|have|tell)\\s+${name}\\s+to\\b`, "i").test(text)) {
      return emp.id;
    }
    // Have Alex lead …
    if (new RegExp(`\\bhave\\s+${name}\\s+lead\\b`, "i").test(text)) {
      return emp.id;
    }
    // Assign this to Alex / Reassign to Alex
    if (
      new RegExp(
        `\\b(?:assign(?:ed)?|reassign(?:ed)?)\\s+(?:this\\s+)?(?:to\\s+)?${name}\\b`,
        "i"
      ).test(text)
    ) {
      return emp.id;
    }
  }

  return null;
}

export function isExplicitCeoReassignment(
  message: string,
  currentOwnerEmployeeId: string
): boolean {
  const addressee = resolveExplicitCeoAddressee(message);
  return Boolean(addressee && addressee !== currentOwnerEmployeeId);
}

/** CEO asked for multi-employee / domain collaboration. */
export function detectCollaborationRequest(message: string): boolean {
  const n = message.toLowerCase();
  return (
    /\binvite\b/.test(n) ||
    /\bconsult\b/.test(n) ||
    /\brelevant employees?\b/.test(n) ||
    /\bdomain[- ]specific input\b/.test(n) ||
    /\bget\s+\w+'s\s+opinion\b/.test(n) ||
    /\bask\s+(sales|finance|email|calendar|document|crm|support)\b/.test(n) ||
    /\bemployees?\s+you\s+need\b/.test(n) ||
    /\bif needed,\s*invite\b/.test(n) ||
    /\bprovide their\b/.test(n)
  );
}

/**
 * Select relevant peer invitees for the owner.
 * Never includes the owner. Deterministic; capped.
 */
export function selectRelevantDiscussionParticipants(input: {
  ownerEmployeeId: string;
  category?: string | null;
  title?: string | null;
  recommendation?: string | null;
  ceoMessage: string;
  maxPeers?: number;
}): string[] {
  const maxPeers = input.maxPeers ?? 2;
  const blob = [
    input.ceoMessage,
    input.title ?? "",
    input.recommendation ?? "",
    input.category ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const scored = new Map<string, number>();
  const bump = (id: string, weight: number) => {
    if (id === input.ownerEmployeeId) return;
    if (!getEmployeeDefinition(id)) return;
    scored.set(id, (scored.get(id) ?? 0) + weight);
  };

  // Explicit name asks: "Get Emma's opinion"
  for (const emp of AI_COMPANY_EMPLOYEES) {
    if (emp.id === input.ownerEmployeeId) continue;
    const name = emp.name.toLowerCase();
    if (
      new RegExp(`\\bget\\s+${escapeRegExp(name)}'s\\s+opinion\\b`, "i").test(
        input.ceoMessage
      ) ||
      new RegExp(`\\bask\\s+${escapeRegExp(name)}\\b`, "i").test(input.ceoMessage)
    ) {
      // "Ask Alex to review" is ownership, not peer invite — skip if addressee
      const addressee = resolveExplicitCeoAddressee(input.ceoMessage);
      if (addressee === emp.id) continue;
      bump(emp.id, 10);
    }
  }

  // Domain phrases
  if (/\b(sales|pipeline|revenue|deal|account)\b/.test(blob)) bump("sarah", 5);
  if (/\b(email|inbox|outreach|draft|gmail)\b/.test(blob)) bump("emma", 5);
  if (/\b(calendar|schedule|conflict|availability)\b/.test(blob)) bump("alex", 5);
  if (/\b(document|proposal|brief|contract)\b/.test(blob)) bump("david", 5);
  if (/\b(meeting|agenda|prep)\b/.test(blob)) bump("mia", 4);
  if (/\b(crm|relationship record)\b/.test(blob)) bump("noah", 4);
  if (/\b(finance|budget|cost|roi)\b/.test(blob)) bump("olivia", 5);
  if (/\b(support|ticket|escalation)\b/.test(blob)) bump("ethan", 4);

  if (input.category === "opportunity" || input.category === "follow_up") {
    bump("sarah", 2);
    bump("emma", 2);
  }
  if (input.category === "risk" || input.category === "alert") {
    bump("emma", 1);
    bump("david", 1);
  }

  // Fallback: owner's suggested collaborators when "relevant employees" requested
  if (detectCollaborationRequest(input.ceoMessage) && scored.size === 0) {
    for (const id of suggestedPeersForOwner(input.ownerEmployeeId)) {
      bump(id, 3);
    }
  }

  // If collaboration requested but still empty, use owner suggestions lightly
  if (detectCollaborationRequest(input.ceoMessage)) {
    for (const id of suggestedPeersForOwner(input.ownerEmployeeId)) {
      bump(id, 1);
    }
  }

  return [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id)
    .filter((id) => id !== input.ownerEmployeeId)
    .slice(0, maxPeers);
}

function isInviteAnnouncementTurn(turn: ConversationTurn): boolean {
  if (turn.kind === "system" && /\binvited\b/i.test(turn.body)) return true;
  return (
    (turn.kind === "handoff" || turn.kind === "system") &&
    /\binvited\b/i.test(turn.body) &&
    (/\bcontribute\b/i.test(turn.body) || /\bto the discussion\b/i.test(turn.body))
  );
}

function isSystemOrCeoTurn(turn: ConversationTurn): boolean {
  return turn.employeeId === "ceo" || turn.employeeId === "system";
}

/**
 * True only for a peer's visible domain contribution turn.
 * Excludes CEO/system/invite announcements, owner openings, and final synthesis.
 */
export function isVisibleDomainContributionTurn(turn: ConversationTurn): boolean {
  if (isSystemOrCeoTurn(turn)) return false;
  if (isInviteAnnouncementTurn(turn)) return false;
  if (turn.kind === "system") return false;
  if (turn.kind === "request") return false;
  if (turn.kind === "approval") return false;
  // Peer domain contributions are recorded as handoff turns after an invite.
  if (turn.kind !== "handoff") return false;
  const body = turn.body.trim();
  if (body.length < 24) return false;
  return true;
}

/** Count peer contribution turns only (never template/metadata). */
export function countVisiblePeerContributionTurns(
  turns: ConversationTurn[],
  ownerEmployeeId: string
): number {
  return turns.filter(
    (t) =>
      String(t.employeeId) !== ownerEmployeeId && isVisibleDomainContributionTurn(t)
  ).length;
}

/**
 * Participants = owner (exactly once) + peers with successful visible contribution turns.
 * Invite announcements and owner openings do not add participants.
 */
export function deriveParticipantsFromConversationTurns(
  turns: ConversationTurn[],
  ownerEmployeeId: string
): Array<{ id: string; name: string; role: string }> {
  const orderedIds: string[] = [];
  const push = (id: string) => {
    if (!id || id === "ceo" || id === "system") return;
    if (orderedIds.includes(id)) return;
    if (!getEmployeeDefinition(id) && id !== ownerEmployeeId) return;
    orderedIds.push(id);
  };

  push(ownerEmployeeId);

  for (const turn of turns) {
    if (String(turn.employeeId) === ownerEmployeeId) continue;
    if (!isVisibleDomainContributionTurn(turn)) continue;
    push(String(turn.employeeId));
  }

  return orderedIds.map((id) => {
    const emp = getEmployeeDefinition(id);
    const sample = turns.find(
      (t) =>
        t.employeeId === id &&
        (id === ownerEmployeeId || isVisibleDomainContributionTurn(t))
    );
    return {
      id,
      name: emp?.name ?? sample?.employeeName ?? id,
      role: emp?.role ?? sample?.role ?? "AI Employee",
    };
  });
}

export function validateDiscussionParticipantIntegrity(input: {
  participants: Array<{ id: string }>;
  turns: ConversationTurn[];
  ownerEmployeeId: string;
}): { ok: boolean; reasons: string[]; expectedIds: string[] } {
  const expected = deriveParticipantsFromConversationTurns(
    input.turns,
    input.ownerEmployeeId
  ).map((p) => p.id);
  const actual = input.participants.map((p) => p.id);
  const reasons: string[] = [];

  if (!actual.includes(input.ownerEmployeeId)) {
    reasons.push("owner_missing");
  }
  if (actual.filter((id) => id === input.ownerEmployeeId).length > 1) {
    reasons.push("owner_duplicated");
  }
  for (const id of actual) {
    if (!expected.includes(id)) reasons.push(`listed_without_contribution:${id}`);
  }
  for (const id of expected) {
    if (!actual.includes(id)) reasons.push(`missing_contributor:${id}`);
  }

  return { ok: reasons.length === 0, reasons, expectedIds: expected };
}

export function buildReassignmentEventTurn(input: {
  conversationKey: string;
  fromOwnerId: string;
  toOwnerId: string;
  now: string;
}): ConversationTurn {
  const from = getEmployeeDefinition(input.fromOwnerId);
  const to = getEmployeeDefinition(input.toOwnerId);
  return {
    id: `${input.conversationKey}-reassign-${input.now}`,
    employeeId: SYSTEM_ACTOR.employeeId,
    employeeName: SYSTEM_ACTOR.employeeName,
    role: SYSTEM_ACTOR.role,
    body: `Discussion reassigned from ${from?.name ?? input.fromOwnerId} to ${to?.name ?? input.toOwnerId} by CEO.`,
    at: input.now,
    kind: "system",
  };
}

export function buildNaturalOwnerOpening(input: {
  ownerEmployeeId: string;
  ceoMessage: string;
  willInvitePeers: boolean;
  peerNames?: string[];
}): string {
  const emp = getEmployeeDefinition(input.ownerEmployeeId);
  const name = emp?.name ?? "I";
  const domain =
    emp?.expertise[0]?.toLowerCase() ??
    emp?.role?.toLowerCase() ??
    "operating signals";

  if (input.willInvitePeers && (input.peerNames?.length ?? 0) > 0) {
    const peers = input.peerNames!.slice(0, 3).join(" and ");
    return `I'll review this recommendation against the available ${domain}. I also need ${peers} input before I can give you a reliable final recommendation.`;
  }
  if (input.willInvitePeers) {
    return `I'll review this recommendation against the available ${domain}. I'll bring in the domain specialists who can tighten the recommendation before I finalize it.`;
  }
  return `${name === "I" ? "I'll" : "I'll"} examine the recommendation using available ${domain} and return one clear recommendation with confidence and risks.`.replace(
    /^I'll examine/,
    "I'll examine"
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const INTERNAL_ROUTING_PHRASES = [
  "i own this",
  "i own the",
  "i am the conversation owner",
  "conversation owner",
  "i will synthesize domain input",
  "owner routing",
  "owns this thread",
  "owns this sales thread",
  "owns the email thread",
  "owns the calendar",
];

export function containsInternalRoutingLanguage(text: string): boolean {
  const n = text.toLowerCase();
  return INTERNAL_ROUTING_PHRASES.some((p) => n.includes(p));
}
