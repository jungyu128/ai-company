/**
 * Keep AI employees inside the active WorkPilot mission scope.
 * Blocks unrelated email / outreach / CRM / sales / communication work
 * unless the CEO explicitly asks or the active mission requires it.
 */

import type { CollaborationMission } from "../collaboration.logic";

/** Commercial / customer-comms domains that are off-mission by default. */
const UNRELATED_COMMS_RE =
  /\b(e-?mails?|gmail|inbox|outreach|crm|sales(?:\s+pipeline|\s+opportunity|\s+motion)?|cold[- ]?outreach|customer\s+(?:re-?engage(?:ment)?|outreach|follow[- ]?ups?)|send(?:ing)?\s+(?:an?\s+)?(?:email|message)|draft(?:ing)?\s+(?:an?\s+)?(?:email|outreach)|slack\s+(?:dm|message)\s+to\s+customer|follow[- ]?up\s+email)\b/i;

const CEO_EXPLICIT_COMMS_RE =
  /\b(?:ceo|owner)\s+(?:asks?|requested?|wants?|requires?|said)|explicitly\s+(?:asks?|requested?)|(?:please|need you to|go ahead and)\s+(?:draft|send|write|handle).{0,48}\b(?:email|outreach|crm|sales)|(?:draft|send)\s+(?:the\s+)?(?:email|outreach)\b/i;

export function isActiveWorkpilotMission(mission: CollaborationMission): boolean {
  if (mission.completedAt) return false;
  if (mission.approvalStatus === "rejected") return false;
  return (
    mission.approvalStatus === "pending" ||
    mission.approvalStatus === "approved" ||
    mission.approvalStatus === "changes_requested"
  );
}

export function listActiveWorkpilotMissions(
  missions: CollaborationMission[]
): CollaborationMission[] {
  return missions.filter(isActiveWorkpilotMission);
}

export function missionCorpus(mission: CollaborationMission): string {
  return [
    mission.title,
    mission.mission,
    mission.planSummary,
    ...(mission.planSteps ?? []),
    mission.ceoNote ?? "",
  ].join(" ");
}

export function isUnrelatedCommercialComms(text: string): boolean {
  return UNRELATED_COMMS_RE.test(text);
}

export function ceoExplicitlyRequestsComms(text: string): boolean {
  return CEO_EXPLICIT_COMMS_RE.test(text);
}

export function activeMissionsRequireComms(
  missions: CollaborationMission[]
): boolean {
  return missions.some((m) => {
    const corpus = missionCorpus(m);
    return (
      isUnrelatedCommercialComms(corpus) || ceoExplicitlyRequestsComms(corpus)
    );
  });
}

/** Token overlap against an active mission title / id / body. */
export function textMatchesMission(
  text: string,
  mission: CollaborationMission
): boolean {
  const hay = text.toLowerCase();
  if (hay.includes(mission.id.toLowerCase())) return true;
  const corpus = missionCorpus(mission).toLowerCase();
  const title = mission.title.trim().toLowerCase();
  if (title && hay.includes(title)) return true;
  if (hay.includes(`advance: ${title}`)) return true;

  const tokens = title
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
  if (tokens.length === 0) {
    // Fall back to a few distinctive mission-body tokens
    const bodyTokens = corpus
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 5 && !STOP.has(w))
      .slice(0, 8);
    return bodyTokens.some((w) => hay.includes(w));
  }
  const hits = tokens.filter((w) => hay.includes(w)).length;
  return hits >= Math.min(2, tokens.length);
}

const STOP = new Set([
  "with",
  "from",
  "that",
  "this",
  "into",
  "for",
  "and",
  "the",
  "work",
  "pilot",
  "workpilot",
  "mission",
  "task",
  "next",
]);

/**
 * When any WorkPilot mission is active, proposed work must stay on that objective.
 * Unrelated email/outreach/CRM/sales/communication work is refused unless allowed.
 */
export function isWithinActiveMissionScope(
  text: string,
  activeMissions: CollaborationMission[],
  options?: { ceoMessage?: string | null }
): boolean {
  if (!activeMissions.length) return true;

  if (
    ceoExplicitlyRequestsComms(options?.ceoMessage ?? "") ||
    ceoExplicitlyRequestsComms(text)
  ) {
    return true;
  }

  if (
    isUnrelatedCommercialComms(text) &&
    !activeMissionsRequireComms(activeMissions)
  ) {
    return false;
  }

  return activeMissions.some((m) => textMatchesMission(text, m));
}

export function filterTextsToMissionScope<T>(
  items: T[],
  activeMissions: CollaborationMission[],
  getText: (item: T) => string
): T[] {
  if (!activeMissions.length) return items;
  return items.filter((item) =>
    isWithinActiveMissionScope(getText(item), activeMissions)
  );
}

export function missionScopeFocusLine(
  activeMissions: CollaborationMission[]
): string | null {
  if (!activeMissions.length) return null;
  const titles = activeMissions.map((m) => m.title).slice(0, 2);
  return `Stay on active WorkPilot objective: ${titles.join("; ")}. Do not start unrelated email, outreach, CRM, sales, or communication work.`;
}
