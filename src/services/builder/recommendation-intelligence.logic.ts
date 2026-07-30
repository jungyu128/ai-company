/**
 * Sprint 1 Part 3 — recommendation intelligence / structured decision packages.
 * Deterministic helpers only. Never fabricates live connector reads.
 */

import { getEmployeeDefinition } from "./ai-company-employees";
import type { LiveDataAvailability } from "./discussion-quality.logic";
import { defaultLiveDataAvailability } from "./discussion-quality.logic";
import type { ConversationTurn } from "./conversation.logic";

export type RecommendationPriority = "Critical" | "High" | "Medium" | "Low";
export type RecommendationUrgency =
  | "Immediate"
  | "Today"
  | "This Week"
  | "Later";

export type QualitativeImpact = "High" | "Medium" | "Low" | "None";

export type StructuredExpectedImpact = {
  operational: QualitativeImpact;
  revenue: QualitativeImpact;
  customer: QualitativeImpact;
  productivity: QualitativeImpact;
  riskReduction: QualitativeImpact;
};

export type EvidenceSource =
  | "internal_state"
  | "previous_approvals"
  | "ai_discussion"
  | "mock_demo_signals";

export type EvidenceSummary = {
  sources: EvidenceSource[];
  statement: string;
  /** Always false unless we explicitly claim live analysis (we never do when disconnected). */
  claimedLiveAnalysis: boolean;
  caveats: string[];
};

export type DecisionSignalRef = {
  kind?: string | null;
  severity?: number | null;
  category?: "risk" | "opportunity" | "alert" | "follow_up" | null;
  sourceMissionId?: string | null;
  title?: string | null;
};

export type RecommendationDecisionPackage = {
  title: string;
  recommendation: string;
  reasoning: string;
  expectedImpact: string;
  expectedImpactStructured: StructuredExpectedImpact;
  priority: RecommendationPriority;
  urgency: RecommendationUrgency;
  confidence: number;
  confidenceReason: string;
  risks: string;
  dependencies: string[];
  participatingEmployees: Array<{ id: string; name: string; role: string }>;
  evidenceSummary: EvidenceSummary;
};

export type DecisionPackageInput = {
  title: string;
  recommendation: string;
  reasoning: string;
  expectedImpact?: string | null;
  confidence: number;
  category: "risk" | "opportunity" | "alert" | "follow_up";
  leadEmployeeId: string;
  signal?: DecisionSignalRef | null;
  signals?: DecisionSignalRef[];
  participatingEmployees: Array<{ id: string; name: string; role: string }>;
  hasInternalDiscussion: boolean;
  pendingApprovalTitles?: string[];
  liveData?: LiveDataAvailability;
};

/** Minimal recommendation shape for ensure/apply helpers (avoids circular imports). */
export type DecisionPackageRecommendationFields = {
  title: string;
  recommendation: string;
  reasoning: string;
  expectedImpact: string;
  confidence: number;
  category: "risk" | "opportunity" | "alert" | "follow_up";
  leadEmployeeId: string;
  participatingEmployees: Array<{ id: string; name: string; role: string }>;
  internalDiscussion?: ConversationTurn[];
  priority?: RecommendationPriority;
  urgency?: RecommendationUrgency;
  risks?: string;
  dependencies?: string[];
  evidenceSummary?: EvidenceSummary;
  expectedImpactStructured?: StructuredExpectedImpact;
  confidenceReason?: string;
};

export function computeRecommendationPriority(input: {
  severity: number;
  category: DecisionPackageInput["category"];
  signalKind?: string | null;
}): RecommendationPriority {
  const severity = Math.max(1, Math.min(5, input.severity));
  if (
    severity >= 5 ||
    (input.category === "risk" && severity >= 4) ||
    input.signalKind === "schedule_conflict" ||
    input.signalKind === "urgent_email"
  ) {
    return "Critical";
  }
  if (
    severity >= 4 ||
    (input.category === "alert" && severity >= 3) ||
    input.signalKind === "pipeline_risk" ||
    input.signalKind === "unanswered_email"
  ) {
    return "High";
  }
  if (severity >= 3 || input.category === "opportunity" || input.category === "follow_up") {
    return "Medium";
  }
  return "Low";
}

export function computeRecommendationUrgency(input: {
  priority: RecommendationPriority;
  category: DecisionPackageInput["category"];
  signalKind?: string | null;
}): RecommendationUrgency {
  if (input.priority === "Critical") return "Immediate";
  if (
    input.priority === "High" ||
    input.signalKind === "unanswered_email" ||
    input.signalKind === "overdue_meeting" ||
    input.category === "alert"
  ) {
    return "Today";
  }
  if (input.priority === "Medium" || input.category === "opportunity") {
    return "This Week";
  }
  return "Later";
}

/**
 * Infer a realistic prerequisite chain for the lead domain.
 * Chains are ordered prerequisites → terminal step. No impossible deps.
 */
export function inferRecommendationDependencies(input: {
  leadEmployeeId: string;
  signalKind?: string | null;
  category: DecisionPackageInput["category"];
}): string[] {
  const kind = input.signalKind ?? null;
  const lead = input.leadEmployeeId;

  if (lead === "emma" || kind === "unanswered_email" || kind === "urgent_email" || kind === "customer_reply") {
    return [
      "Prepare customer email draft",
      "Attach or link proposal if needed",
      "Obtain CEO approval",
      "Update CRM after send",
    ];
  }
  if (lead === "sarah" || kind === "sales_opportunity" || kind === "inactive_customer" || kind === "pipeline_risk") {
    return [
      "Qualify sales opportunity",
      "Prepare proposal",
      "Obtain CEO approval",
      "Send customer outreach",
      "Update CRM",
    ];
  }
  if (lead === "david" || kind === "missing_document" || kind === "expired_document" || kind === "contract_update") {
    return [
      "Draft or refresh document pack",
      "Mark document ready for review",
      "Obtain CEO approval",
      "Attach document to outreach or archive",
    ];
  }
  if (lead === "alex" || kind === "schedule_conflict" || kind === "travel_conflict") {
    return [
      "Confirm conflict details",
      "Propose reschedule options",
      "Obtain CEO approval",
      "Update calendar holds",
    ];
  }
  if (lead === "mia" || kind === "missing_prep" || kind === "overdue_meeting") {
    return [
      "Prepare agenda and attendee list",
      "Capture required brief",
      "Obtain CEO approval if needed",
      "Publish follow-ups after the meeting",
    ];
  }
  if (lead === "noah") {
    return [
      "Refresh CRM account fields",
      "Validate relationship signals",
      "Obtain CEO approval for outreach changes",
      "Log outcome in CRM",
    ];
  }
  if (lead === "olivia") {
    return [
      "Estimate budget and expected return",
      "Flag financial risk",
      "Obtain CEO approval",
      "Record finance note for audit",
    ];
  }
  if (lead === "ethan") {
    return [
      "Triage support urgency",
      "Draft customer-safe response",
      "Obtain CEO approval for external reply",
      "Update ticket status",
    ];
  }

  if (input.category === "risk") {
    return [
      "Diagnose risk signal",
      "Prepare mitigation plan",
      "Obtain CEO approval",
      "Execute approved mitigation",
    ];
  }

  return [
    "Clarify recommended action",
    "Prepare supporting artifact",
    "Obtain CEO approval",
    "Execute approved next step",
  ];
}

export function buildStructuredExpectedImpact(input: {
  category: DecisionPackageInput["category"];
  leadEmployeeId: string;
  priority: RecommendationPriority;
}): StructuredExpectedImpact {
  const high = input.priority === "Critical" || input.priority === "High";
  const base: StructuredExpectedImpact = {
    operational: "Medium",
    revenue: "None",
    customer: "Low",
    productivity: "Medium",
    riskReduction: "Low",
  };

  if (input.category === "risk") {
    base.riskReduction = high ? "High" : "Medium";
    base.operational = high ? "High" : "Medium";
    base.productivity = "Medium";
  }
  if (input.category === "opportunity") {
    base.revenue = high ? "High" : "Medium";
    base.customer = "Medium";
    base.operational = "Medium";
  }
  if (input.category === "alert" || input.category === "follow_up") {
    base.operational = high ? "High" : "Medium";
    base.productivity = high ? "High" : "Medium";
    base.customer = "Medium";
  }

  if (input.leadEmployeeId === "sarah") {
    base.revenue = high ? "High" : "Medium";
    base.customer = "Medium";
  }
  if (input.leadEmployeeId === "emma" || input.leadEmployeeId === "ethan") {
    base.customer = high ? "High" : "Medium";
  }
  if (input.leadEmployeeId === "alex" || input.leadEmployeeId === "mia") {
    base.productivity = high ? "High" : "Medium";
    base.operational = high ? "High" : "Medium";
  }
  if (input.leadEmployeeId === "olivia") {
    base.riskReduction = high ? "High" : "Medium";
    base.revenue = "Low";
  }
  if (input.leadEmployeeId === "david" || input.leadEmployeeId === "noah") {
    base.operational = "Medium";
    base.productivity = "Medium";
  }

  return base;
}

export function formatStructuredImpact(impact: StructuredExpectedImpact): string {
  return [
    `Operational ${impact.operational}`,
    `Revenue ${impact.revenue}`,
    `Customer ${impact.customer}`,
    `Productivity ${impact.productivity}`,
    `Risk reduction ${impact.riskReduction}`,
  ].join(" · ");
}

export function buildEvidenceSummary(input: {
  hasInternalDiscussion: boolean;
  pendingApprovalTitles?: string[];
  liveData?: LiveDataAvailability;
  leadEmployeeId: string;
}): EvidenceSummary {
  const live = input.liveData ?? defaultLiveDataAvailability();
  const sources: EvidenceSource[] = ["internal_state", "mock_demo_signals"];
  if (input.hasInternalDiscussion) sources.push("ai_discussion");
  if ((input.pendingApprovalTitles?.length ?? 0) > 0) {
    sources.push("previous_approvals");
  }

  const relevantDisconnected: string[] = [];
  if (!live.gmailConnected && (input.leadEmployeeId === "emma" || input.leadEmployeeId === "sarah")) {
    relevantDisconnected.push("email");
  }
  if (
    !live.calendarConnected &&
    (input.leadEmployeeId === "alex" || input.leadEmployeeId === "mia")
  ) {
    relevantDisconnected.push("calendar");
  }
  if (!live.driveConnected && input.leadEmployeeId === "david") {
    relevantDisconnected.push("documents");
  }
  if (
    !live.crmConnected &&
    (input.leadEmployeeId === "noah" || input.leadEmployeeId === "sarah")
  ) {
    relevantDisconnected.push("CRM");
  }
  // Always note disconnected core systems for honesty when none are connected.
  if (!live.gmailConnected && !relevantDisconnected.includes("email")) {
    // keep general caveats below
  }

  const anyLive =
    live.gmailConnected ||
    live.calendarConnected ||
    live.driveConnected ||
    live.crmConnected;

  const caveats: string[] = [];
  if (!anyLive || relevantDisconnected.length > 0) {
    caveats.push(
      "Reasoning is based on internal state, previous approvals, AI discussion, and mock/demo signals — not live connector reads."
    );
  }
  if (relevantDisconnected.length > 0) {
    caveats.push(
      `Live ${relevantDisconnected.join(", ")} data was not analyzed because connectors are disconnected.`
    );
  }
  if (!anyLive) {
    caveats.push(
      "No emails, calendars, CRM records, or documents were actually read from external systems."
    );
  }

  const statement = anyLive && relevantDisconnected.length === 0
    ? "Evidence mixes connected system status with internal company signals and AI discussion."
    : "Evidence is limited to internal company state, approval history, AI discussion, and mock/demo signals.";

  return {
    sources: [...new Set(sources)],
    statement,
    claimedLiveAnalysis: false,
    caveats,
  };
}

export function buildRecommendationRisks(input: {
  priority: RecommendationPriority;
  evidence: EvidenceSummary;
  signalKind?: string | null;
  confidence: number;
}): string {
  const missing = input.evidence.caveats[0]
    ? "Live connector detail is missing or incomplete."
    : "Some domain signals remain unverified.";
  const whatCouldGoWrong =
    input.priority === "Critical" || input.priority === "High"
      ? "Delay or a wrong approval could escalate operational or customer risk."
      : "A suboptimal approval may create rework without immediate critical damage.";
  const whyNot100 =
    input.confidence < 90
      ? `Confidence is ${input.confidence}% because evidence is partial and not every dependency is confirmed.`
      : "Confidence is high but not absolute until approval and execution verification complete.";
  const kindNote =
    input.signalKind === "schedule_conflict"
      ? " Calendar conflict details may shift before execution."
      : input.signalKind === "pipeline_risk" || input.signalKind === "inactive_customer"
        ? " Account priority may change before outreach."
        : "";

  return `${whatCouldGoWrong} ${whyNot100} Missing information: ${missing}${kindNote}`.trim();
}

export function buildConfidenceReason(input: {
  confidence: number;
  severity: number;
  participantCount: number;
  hasMissionSource: boolean;
  evidence: EvidenceSummary;
}): string {
  const bits = [
    `Severity ${input.severity}/5`,
    `${input.participantCount} participating employee(s)`,
    input.hasMissionSource ? "linked to an active mission" : "from continuous domain review",
    input.evidence.claimedLiveAnalysis
      ? "includes live connector analysis"
      : "does not claim live connector reads",
  ];
  return `Confidence ${input.confidence}% based on ${bits.join("; ")}.`;
}

export function buildRecommendationDecisionPackage(
  input: DecisionPackageInput
): RecommendationDecisionPackage {
  const signal = input.signal ?? input.signals?.[0] ?? null;
  const severity = signal?.severity ?? 3;
  const priority = computeRecommendationPriority({
    severity,
    category: input.category,
    signalKind: signal?.kind,
  });
  const urgency = computeRecommendationUrgency({
    priority,
    category: input.category,
    signalKind: signal?.kind,
  });
  const expectedImpactStructured = buildStructuredExpectedImpact({
    category: input.category,
    leadEmployeeId: input.leadEmployeeId,
    priority,
  });
  const expectedImpact =
    input.expectedImpact?.trim() || formatStructuredImpact(expectedImpactStructured);
  const evidenceSummary = buildEvidenceSummary({
    hasInternalDiscussion: input.hasInternalDiscussion,
    pendingApprovalTitles: input.pendingApprovalTitles,
    liveData: input.liveData,
    leadEmployeeId: input.leadEmployeeId,
  });
  const dependencies = inferRecommendationDependencies({
    leadEmployeeId: input.leadEmployeeId,
    signalKind: signal?.kind,
    category: input.category,
  });
  const risks = buildRecommendationRisks({
    priority,
    evidence: evidenceSummary,
    signalKind: signal?.kind,
    confidence: input.confidence,
  });
  const confidenceReason = buildConfidenceReason({
    confidence: input.confidence,
    severity,
    participantCount: Math.max(1, input.participatingEmployees.length),
    hasMissionSource: Boolean(signal?.sourceMissionId),
    evidence: evidenceSummary,
  });

  const participatingEmployees =
    input.participatingEmployees.length > 0
      ? input.participatingEmployees
      : [
          {
            id: input.leadEmployeeId,
            name: getEmployeeDefinition(input.leadEmployeeId)?.name ?? input.leadEmployeeId,
            role: getEmployeeDefinition(input.leadEmployeeId)?.role ?? "AI Employee",
          },
        ];

  return {
    title: input.title,
    recommendation: input.recommendation,
    reasoning: input.reasoning,
    expectedImpact,
    expectedImpactStructured,
    priority,
    urgency,
    confidence: input.confidence,
    confidenceReason,
    risks,
    dependencies,
    participatingEmployees,
    evidenceSummary,
  };
}

/** Apply package fields onto a recommendation (backward-compatible merge). */
export function applyDecisionPackageToRecommendation(
  rec: DecisionPackageRecommendationFields,
  pkg: RecommendationDecisionPackage
): DecisionPackageRecommendationFields {
  return {
    ...rec,
    title: pkg.title,
    recommendation: pkg.recommendation,
    reasoning: pkg.reasoning,
    expectedImpact: pkg.expectedImpact,
    confidence: pkg.confidence,
    participatingEmployees: pkg.participatingEmployees,
    priority: pkg.priority,
    urgency: pkg.urgency,
    risks: pkg.risks,
    dependencies: pkg.dependencies,
    evidenceSummary: pkg.evidenceSummary,
    expectedImpactStructured: pkg.expectedImpactStructured,
    confidenceReason: pkg.confidenceReason,
  };
}

/**
 * Fill missing decision-package fields for legacy stored recommendations.
 */
export function ensureRecommendationDecisionPackage(
  rec: DecisionPackageRecommendationFields,
  options?: {
    liveData?: LiveDataAvailability;
    pendingApprovalTitles?: string[];
    signal?: DecisionSignalRef | null;
  }
): DecisionPackageRecommendationFields {
  if (
    rec.priority &&
    rec.urgency &&
    rec.risks &&
    rec.dependencies?.length &&
    rec.evidenceSummary &&
    rec.expectedImpactStructured &&
    rec.confidenceReason
  ) {
    return rec;
  }

  const pkg = buildRecommendationDecisionPackage({
    title: rec.title,
    recommendation: rec.recommendation,
    reasoning: rec.reasoning,
    expectedImpact: rec.expectedImpact,
    confidence: rec.confidence,
    category: rec.category,
    leadEmployeeId: rec.leadEmployeeId,
    signal: options?.signal ?? null,
    participatingEmployees: rec.participatingEmployees,
    hasInternalDiscussion: (rec.internalDiscussion?.length ?? 0) > 0,
    pendingApprovalTitles: options?.pendingApprovalTitles,
    liveData: options?.liveData,
  });

  return applyDecisionPackageToRecommendation(rec, {
    ...pkg,
    priority: rec.priority ?? pkg.priority,
    urgency: rec.urgency ?? pkg.urgency,
    risks: rec.risks ?? pkg.risks,
    dependencies: rec.dependencies?.length ? rec.dependencies : pkg.dependencies,
    evidenceSummary: rec.evidenceSummary ?? pkg.evidenceSummary,
    expectedImpactStructured:
      rec.expectedImpactStructured ?? pkg.expectedImpactStructured,
    confidenceReason: rec.confidenceReason ?? pkg.confidenceReason,
  });
}

export function serializeDecisionPackage(
  pkg: RecommendationDecisionPackage
): Record<string, unknown> {
  return {
    title: pkg.title,
    recommendation: pkg.recommendation,
    reasoning: pkg.reasoning,
    expectedImpact: pkg.expectedImpact,
    expectedImpactStructured: { ...pkg.expectedImpactStructured },
    priority: pkg.priority,
    urgency: pkg.urgency,
    confidence: pkg.confidence,
    confidenceReason: pkg.confidenceReason,
    risks: pkg.risks,
    dependencies: [...pkg.dependencies],
    participatingEmployees: pkg.participatingEmployees.map((p) => ({ ...p })),
    evidenceSummary: {
      sources: [...pkg.evidenceSummary.sources],
      statement: pkg.evidenceSummary.statement,
      claimedLiveAnalysis: pkg.evidenceSummary.claimedLiveAnalysis,
      caveats: [...pkg.evidenceSummary.caveats],
    },
  };
}
