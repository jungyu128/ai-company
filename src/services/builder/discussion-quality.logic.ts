/**
 * Sprint 1 Part 2 — deterministic discussion quality helpers.
 * Structured domain contributions; no React / API / connector I/O.
 */

import {
  getEmployeeDefinition,
  type AiCompanyEmployeeDefinition,
} from "./ai-company-employees";
import type { ConversationTurn } from "./conversation.logic";
import {
  countVisiblePeerContributionTurns,
  deriveParticipantsFromConversationTurns,
  isVisibleDomainContributionTurn,
} from "./ceo-discussion-orchestration.logic";

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

export type DomainContributionParts = {
  observation: string;
  implication: string;
  action: string;
};

export type LiveDataAvailability = {
  gmailConnected: boolean;
  calendarConnected: boolean;
  driveConnected: boolean;
  crmConnected: boolean;
};

export type OwnerSynthesisParts = {
  recommendation: string;
  reasoningSummary: string;
  expectedImpact: string;
  risksOrUncertainty: string;
  missingInformation: string;
  confidence: number;
  confidenceExplanation: string;
  participatingEmployees: Array<{ id: string; name: string; role: string }>;
  dataCaveat: string | null;
};

const GENERIC_PHRASES = [
  "i agree",
  "i can help",
  "thanks, i will refine the plan",
  "thanks — i'll refine the plan",
  "i'll refine the plan",
  "happy to help",
  "sounds good",
  "let me know",
];

/** Domain lenses keyed by employee id — WorkPilot product-engineering focus. */
const DOMAIN_LENSES: Record<
  string,
  { observation: string; implication: string; action: string }
> = {
  alex: {
    observation:
      "WorkPilot CI/release signals show build or deploy-readiness gaps on this mission.",
    implication:
      "Pushing without a readiness check risks a blocked pipeline or unsafe release.",
    action:
      "Run a build/deploy readiness check and list blockers before any CEO deploy ask.",
  },
  mia: {
    observation:
      "WorkPilot UI work still needs a clear screen, component boundary, and QA handoff.",
    implication:
      "Without UI scope discipline, the feature branch drifts and review stalls.",
    action:
      "Implement the scoped UI slice on a feature branch and note repro steps for QA.",
  },
  sarah: {
    observation:
      "The WorkPilot decision package still needs a clear recommendation and approval ask.",
    implication:
      "Without an owner-ready brief, execution waits and risks stay unowned.",
    action:
      "Assemble one CEO recommendation with tradeoffs, risks, and the exact approval needed.",
  },
  david: {
    observation:
      "Architecture and implementation planning for this WorkPilot mission is incomplete.",
    implication:
      "Coding before a bounded plan creates rework and unsafe branch scope.",
    action:
      "Draft a concise architecture/implementation plan scoped to the active work item.",
  },
  emma: {
    observation:
      "Product requirements and acceptance criteria for this WorkPilot slice are incomplete.",
    implication:
      "Building without criteria forces assumptions and duplicate clarification later.",
    action:
      "Write acceptance criteria and priority for the active mission only.",
  },
  noah: {
    observation:
      "WorkPilot API/data contracts for this mission still need a typed, safe boundary.",
    implication:
      "Shipping without contract clarity creates regressions and review blockers.",
    action:
      "Implement the scoped API/schema change on a feature branch with test hooks.",
  },
  olivia: {
    observation:
      "WorkPilot data integrity for this mission needs a persistence/validation check.",
    implication:
      "Skipping data checks risks silent corruption or billing/digest errors.",
    action:
      "Validate the data path and note schema-safe constraints for Backend/DevOps.",
  },
  ethan: {
    observation:
      "Verification coverage for this WorkPilot change is incomplete or unproven.",
    implication:
      "Approving without evidence raises release risk.",
    action:
      "Add a focused test plan and report pass/fail evidence for the active work item.",
  },
};

const OWNER_OPENERS: Record<
  string,
  { observation: string; implication: string; action: string }
> = {
  sarah: {
    observation:
      "I'll review this against WorkPilot mission goals and open approval risks.",
    implication:
      "Without a clear decision package, the owner cannot approve safely.",
    action:
      "I'll return one WorkPilot recommendation with confidence and risks.",
  },
  emma: {
    observation:
      "I'll review requirements, priority, and acceptance criteria for this WorkPilot slice.",
    implication:
      "Weak criteria force assumptions and slow engineering handoff.",
    action:
      "I'll return one product recommendation scoped to the active mission.",
  },
  alex: {
    observation:
      "I'll review CI/build and deploy-readiness for this WorkPilot change.",
    implication:
      "Unresolved pipeline risk blocks a safe release path.",
    action:
      "I'll give one release-readiness recommendation — no auto-deploy.",
  },
  david: {
    observation:
      "I'll check whether the architecture/implementation plan is decision-ready.",
    implication:
      "Acting before the plan is ready creates rework on the feature branch.",
    action:
      "I'll return a WorkPilot architecture recommendation for approval.",
  },
  mia: {
    observation:
      "I'll review UI scope, components, and QA handoff for this WorkPilot mission.",
    implication:
      "Weak UI boundaries lower review quality and slow ship.",
    action:
      "I'll return one frontend recommendation on the active work item.",
  },
  noah: {
    observation:
      "I'll check API/schema boundaries and regression surface for this mission.",
    implication:
      "Stale contracts break consumers and block PR review.",
    action:
      "I'll return one backend recommendation scoped to WorkPilot.",
  },
  olivia: {
    observation:
      "I'll review data integrity and persistence risk on this WorkPilot path.",
    implication:
      "Unscoped data changes create avoidable production risk.",
    action:
      "I'll return one data-safe recommendation for the active mission.",
  },
  ethan: {
    observation:
      "I'll review test coverage and verification evidence for this WorkPilot change.",
    implication:
      "Approving without tests raises release risk.",
    action:
      "I'll return one QA recommendation with evidence needs.",
  },
};

function employeeSystemHint(
  employeeId: string
): keyof LiveDataAvailability | null {
  if (employeeId === "emma") return "gmailConnected";
  if (employeeId === "alex" || employeeId === "mia") return "calendarConnected";
  if (employeeId === "david") return "driveConnected";
  if (employeeId === "noah" || employeeId === "sarah") return "crmConnected";
  return null;
}

export function defaultLiveDataAvailability(
  overrides?: Partial<LiveDataAvailability>
): LiveDataAvailability {
  return {
    gmailConnected: false,
    calendarConnected: false,
    driveConnected: false,
    crmConnected: false,
    ...overrides,
  };
}

export function isGenericContribution(text: string): boolean {
  const n = normalizeText(text);
  return GENERIC_PHRASES.some((p) => n === p || n.includes(p));
}

export function repeatsPriorDiscussion(
  candidate: string,
  priorBodies: string[]
): boolean {
  const n = normalizeText(candidate);
  if (!n) return true;
  for (const prior of priorBodies) {
    const p = normalizeText(prior);
    if (!p) continue;
    if (n === p) return true;
    if (p.length >= 24 && n.includes(p)) return true;
    if (n.length >= 24 && p.includes(n)) return true;
  }
  return false;
}

export function formatContributionBody(parts: DomainContributionParts): string {
  const sentences = [parts.observation, parts.implication, parts.action]
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .slice(0, 3);
  return sentences.join(" ");
}

export function countSentences(text: string): number {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

export function buildDomainContributionParts(
  employeeId: string,
  options?: {
    priorBodies?: string[];
    ceoMessage?: string | null;
    liveData?: LiveDataAvailability;
    variant?: 0 | 1;
  }
): DomainContributionParts {
  const emp = getEmployeeDefinition(employeeId);
  const base = DOMAIN_LENSES[employeeId] ?? fallbackLens(emp);
  const variant = options?.variant ?? 0;
  let observation = base.observation;
  let implication = base.implication;
  let action = base.action;

  if (variant === 1) {
    observation = observation.replace(/\.$/, " based on current internal signals.");
    implication = implication.replace(/^/, "Therefore, ");
    action = action.replace(/^/, "Next: ");
  }

  const live = options?.liveData ?? defaultLiveDataAvailability();
  const hint = employeeSystemHint(employeeId);
  if (hint && !live[hint]) {
    observation = observation.replace(/\.$/, "") + " (internal signals only; live connector unavailable).";
  }

  let parts: DomainContributionParts = { observation, implication, action };
  let body = formatContributionBody(parts);
  const priors = [
    ...(options?.priorBodies ?? []),
    options?.ceoMessage ?? "",
  ].filter(Boolean);

  if (
    isGenericContribution(body) ||
    repeatsPriorDiscussion(body, priors) ||
    countSentences(body) > 3
  ) {
    const obs =
      hint && !live[hint]
        ? `${emp?.name ?? "Specialist"} domain check: ${base.observation.replace(/\.$/, "")} (internal signals only; live connector unavailable).`
        : `${emp?.name ?? "Specialist"} domain check: ${base.observation}`;
    parts = {
      observation: obs,
      implication: base.implication,
      action: base.action,
    };
    body = formatContributionBody(parts);
  }

  // Strip accidental CEO echo fragments
  if (options?.ceoMessage && repeatsPriorDiscussion(body, [options.ceoMessage])) {
    parts = {
      observation: base.observation,
      implication: base.implication,
      action: base.action,
    };
  }

  return parts;
}

function fallbackLens(
  emp: AiCompanyEmployeeDefinition | null
): DomainContributionParts {
  const focus = emp?.expertise[0] ?? emp?.role ?? "domain work";
  return {
    observation: `Current ${focus.toLowerCase()} signals need a tighter decision.`,
    implication: "Without a domain-specific call, the owner cannot close confidently.",
    action: `Provide one ${focus.toLowerCase()} action the owner can synthesize.`,
  };
}

export function buildOwnerOpeningParts(
  ownerEmployeeId: string,
  options?: {
    priorBodies?: string[];
    ceoMessage?: string | null;
    willInvitePeers?: boolean;
    peerNames?: string[];
  }
): DomainContributionParts {
  const emp = getEmployeeDefinition(ownerEmployeeId);
  const base =
    OWNER_OPENERS[ownerEmployeeId] ??
    ({
      observation: `I'll review this recommendation against available ${emp?.expertise[0]?.toLowerCase() ?? "operating"} signals.`,
      implication: "A rushed answer without domain checks would lower decision quality.",
      action: "I'll return one clear recommendation with confidence and risks.",
    } satisfies DomainContributionParts);

  if (options?.willInvitePeers) {
    const peers =
      (options.peerNames?.length ?? 0) > 0
        ? options.peerNames!.slice(0, 3).join(" and ")
        : "the relevant specialists";
    return {
      observation: `I'll review the recommendation against the available ${emp?.expertise[0]?.toLowerCase() ?? "operating signals"}.`,
      implication: `I also need ${peers} input before I can give you a reliable final recommendation.`,
      action: "I'll invite those specialists next, then close with one recommendation.",
    };
  }

  const body = formatContributionBody(base);
  const priors = [
    ...(options?.priorBodies ?? []),
    options?.ceoMessage ?? "",
  ].filter(Boolean);
  if (repeatsPriorDiscussion(body, priors) || isGenericContribution(body)) {
    return {
      observation: `I'll re-check this recommendation using ${emp?.name ?? "owner"} domain signals only.`,
      implication: "Generic acknowledgements will not move the decision forward.",
      action: "I'll produce one structured recommendation for approval.",
    };
  }
  return base;
}

export function buildOwnerSynthesisParts(input: {
  ownerEmployeeId: string;
  baseRecommendation: string;
  reasoning?: string | null;
  expectedImpact?: string | null;
  confidence?: number | null;
  discussion: ConversationTurn[];
  invitedEmployeeIds: string[];
  liveData?: LiveDataAvailability;
}): OwnerSynthesisParts {
  const owner = getEmployeeDefinition(input.ownerEmployeeId);

  const participatingEmployees = deriveParticipantsFromConversationTurns(
    input.discussion,
    input.ownerEmployeeId
  );

  const peerNoteCount = countVisiblePeerContributionTurns(
    input.discussion,
    input.ownerEmployeeId
  );

  const peerContributionTurns = input.discussion.filter(
    (t) =>
      String(t.employeeId) !== input.ownerEmployeeId &&
      isVisibleDomainContributionTurn(t)
  );

  const peerInfluence = peerContributionTurns.map((t) => {
    const first =
      t.body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean)[0] ??
      t.body;
    return {
      id: String(t.employeeId),
      name: t.employeeName,
      note: first,
    };
  });

  const confidence = Math.max(
    40,
    Math.min(
      96,
      Math.round(input.confidence ?? 70 + Math.min(15, peerNoteCount * 5))
    )
  );

  const live = input.liveData ?? defaultLiveDataAvailability();
  const disconnected: string[] = [];
  if (!live.gmailConnected) disconnected.push("email");
  if (!live.calendarConnected) disconnected.push("calendar");
  if (!live.driveConnected) disconnected.push("documents");
  if (!live.crmConnected) disconnected.push("CRM");

  const dataCaveat =
    disconnected.length > 0
      ? "Evidence is based on available internal and demo signals; connected email, calendar, document, and CRM data was not read."
      : null;

  const reasoningSummary =
    peerNoteCount > 0
      ? trimToSentences(
          `${owner?.name ?? "Owner"} closed after ${peerNoteCount} specialist note${peerNoteCount === 1 ? "" : "s"}. ` +
            peerInfluence
              .slice(0, 3)
              .map((p) => `${p.name}'s input shaped the call: ${p.note}`)
              .join(" "),
          3
        )
      : trimToSentences(
          input.reasoning?.trim() ||
            `${owner?.name ?? "Owner"} reviewed available domain signals and kept the recommendation concrete without repeating the CEO ask.`,
          2
        );

  const expectedImpact = trimToSentences(
    qualitativeImpactForOwner(input.ownerEmployeeId, input.expectedImpact),
    2
  );

  const risksOrUncertainty = trimToSentences(
    peerNoteCount === 0
      ? "Residual uncertainty remains because this rests on owner-domain signals only and priorities may shift before approval."
      : "Residual risk if account priorities or timing shift before approval; re-check specialist notes if source signals change.",
    2
  );

  const missingInformation = trimToSentences(
    dataCaveat
      ? "Live connector detail is unavailable, so recipient status, calendar holds, document versions, and CRM fields were not verified from source systems."
      : peerNoteCount === 0
        ? "No peer specialist notes were collected for this close-out."
        : "Execution-ready identifiers (exact recipients, hold times, or CRM record IDs) still need confirmation at approval time.",
    2
  );

  const confidenceExplanation = trimToSentences(
    `Confidence is ${confidence}% because ${
      peerNoteCount > 0
        ? `${peerNoteCount} visible specialist contribution${peerNoteCount === 1 ? "" : "s"} support the recommendation`
        : "the owner reviewed domain signals without peer contributions"
    }${dataCaveat ? ", while live systems remain unread" : ""}.`,
    2
  );

  return {
    recommendation: sanitizeRecommendationCopy(input.baseRecommendation),
    reasoningSummary: stripSeverityScores(reasoningSummary),
    expectedImpact: stripSeverityScores(expectedImpact),
    risksOrUncertainty: stripSeverityScores(risksOrUncertainty),
    missingInformation: stripSeverityScores(missingInformation),
    confidence,
    confidenceExplanation: stripSeverityScores(confidenceExplanation),
    participatingEmployees,
    dataCaveat,
  };
}

/** Alias — contribution-aware synthesis (Sprint 1 Part 4). */
export function buildContributionAwareSynthesis(
  input: Parameters<typeof buildOwnerSynthesisParts>[0]
): OwnerSynthesisParts {
  return buildOwnerSynthesisParts(input);
}

function qualitativeImpactForOwner(
  ownerEmployeeId: string,
  fallback?: string | null
): string {
  const cleaned = fallback?.trim();
  if (
    cleaned &&
    !/reduce operational risk before it escalates/i.test(cleaned) &&
    !/signal severity/i.test(cleaned) &&
    cleaned.length > 20
  ) {
    return cleaned;
  }
  const map: Record<string, string> = {
    sarah:
      "Faster follow-up on inactive accounts, clearer sales ownership, and a lower chance of losing recoverable opportunities.",
    emma:
      "Clearer outreach timing and tone, fewer stalled threads, and less CEO review noise on drafts.",
    alex:
      "Fewer schedule collisions, protected focus time, and cleaner meeting-to-decision flow.",
    david:
      "Decision-ready documents, less rework after outreach starts, and consistent customer messaging.",
    mia:
      "Better-prepared meetings, clearer follow-ups, and fewer dropped action items.",
    noah:
      "Cleaner account continuity, fewer mis-prioritized follow-ups, and stronger CRM hygiene.",
    olivia:
      "Clearer cost/return visibility and lower chance of unscoped financial exposure.",
    ethan:
      "Faster customer-safe responses and lower escalation risk on open support paths.",
  };
  return (
    map[ownerEmployeeId] ??
    "A clearer owned next step, less cross-role rework, and faster CEO decisioning."
  );
}

function sanitizeRecommendationCopy(text: string): string {
  return stripSeverityScores(text.trim().replace(/\s+/g, " "));
}

function stripSeverityScores(text: string): string {
  return text
    .replace(/\bsignal severity\s*\d+\s*\/\s*\d+\b/gi, "available operating signals")
    .replace(/\bseverity\s*\d+\s*\/\s*\d+\b/gi, "current priority signals")
    .replace(/\s+/g, " ")
    .trim();
}

function trimToSentences(text: string, max: number): string {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
  return parts.join(" ");
}

export function formatOwnerSynthesisBody(
  ownerName: string,
  parts: OwnerSynthesisParts
): string {
  const sections = [
    `${ownerName}:`,
    `Recommendation`,
    parts.recommendation,
    ``,
    `Reasoning`,
    parts.reasoningSummary,
    ``,
    `Expected Impact`,
    parts.expectedImpact,
    ``,
    `Risks`,
    parts.risksOrUncertainty,
    ``,
    `Missing Information`,
    parts.missingInformation,
    ``,
    `Confidence`,
    `${parts.confidence}% — ${parts.confidenceExplanation}`,
    ``,
    `Participants`,
    parts.participatingEmployees.map((p) => p.name).join(", "),
  ];
  if (parts.dataCaveat) {
    sections.push(``, `Evidence`, parts.dataCaveat);
  }
  const body = sections.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Guarantee connector caveat appears at most once.
  if (!parts.dataCaveat) return body;
  const caveat = parts.dataCaveat;
  const first = body.indexOf(caveat);
  if (first < 0) return body;
  const before = body.slice(0, first + caveat.length);
  const after = body.slice(first + caveat.length).split(caveat).join("");
  return `${before}${after}`.replace(/\n{3,}/g, "\n\n").trim();
}

/** Assert contribution quality for tests and guards. */
export function assertContributionQuality(input: {
  body: string;
  employeeId: string;
  priorBodies: string[];
  ceoMessage?: string | null;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (countSentences(input.body) > 3) reasons.push("too_many_sentences");
  if (isGenericContribution(input.body)) reasons.push("generic_phrase");
  if (input.ceoMessage && repeatsPriorDiscussion(input.body, [input.ceoMessage])) {
    reasons.push("echo_ceo");
  }
  if (repeatsPriorDiscussion(input.body, input.priorBodies)) {
    reasons.push("echo_prior");
  }
  const lens = DOMAIN_LENSES[input.employeeId];
  if (lens) {
    const n = normalizeText(input.body);
    const tokens = domainTokensFor(input.employeeId);
    if (!tokens.some((t) => n.includes(t))) reasons.push("off_domain");
  }
  return { ok: reasons.length === 0, reasons };
}

function domainTokensFor(employeeId: string): string[] {
  const map: Record<string, string[]> = {
    alex: ["ci", "build", "deploy", "release", "pipeline", "workpilot"],
    mia: ["ui", "component", "frontend", "page", "workpilot", "hq"],
    sarah: ["recommend", "approval", "decision", "risk", "workpilot"],
    david: ["architecture", "plan", "design", "branch", "workpilot"],
    emma: ["requirement", "acceptance", "criteria", "priority", "product", "workpilot"],
    noah: ["api", "backend", "schema", "route", "workpilot"],
    olivia: ["data", "schema", "persistence", "integrity", "workpilot"],
    ethan: ["test", "qa", "regression", "verify", "evidence", "workpilot"],
  };
  return map[employeeId] ?? ["workpilot"];
}
