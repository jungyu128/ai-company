/**
 * Proactive AI Employee intelligence — detect → discuss → recommend → brief CEO.
 * No Builder Runtime terminology in employee-facing outputs.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
} from "./ai-company-employees";
import type { CollaborationMission } from "./collaboration.logic";
import type { ApprovalCenterItem } from "./approval.service";
import type { ConversationTurn } from "./conversation.logic";
import type { CompanyDashboardMetrics } from "./conversation.logic";
import {
  appendInvitedDomainContribution,
  buildOwnerOnlyDiscussion,
  inviteEmployeeToConversation,
  resolveConversationOwner,
  routeCeoQuestionToOwner,
  suggestedCollaboratorsForOwner,
  synthesizeOwnerRecommendation,
  transferConversationOwner,
} from "./conversation-routing.logic";
import {
  buildReassignmentEventTurn,
  deriveParticipantsFromConversationTurns,
  selectRelevantDiscussionParticipants,
  validateDiscussionParticipantIntegrity,
} from "./ceo-discussion-orchestration.logic";
import {
  canEmployeeRespondToCeoMessage,
  resolveStrictMessageRoute,
  withOwnerInvites,
} from "./employee-message-routing.logic";
import {
  defaultLiveDataAvailability,
  type LiveDataAvailability,
} from "./discussion-quality.logic";
import { getConnectionStatusesSync } from "./execution/connection-status";
import {
  activeMissionsRequireComms,
  isUnrelatedCommercialComms,
  listActiveWorkpilotMissions,
  missionCorpus,
} from "./autonomous-company/mission-scope.logic";
import {
  applyDecisionPackageToRecommendation,
  buildRecommendationDecisionPackage,
  type EvidenceSummary,
  type RecommendationPriority,
  type RecommendationUrgency,
  type StructuredExpectedImpact,
} from "./recommendation-intelligence.logic";

export type ProactiveSignalKind =
  | "unanswered_email"
  | "urgent_email"
  | "follow_up"
  | "customer_reply"
  | "schedule_conflict"
  | "missing_prep"
  | "overdue_meeting"
  | "travel_conflict"
  | "sales_opportunity"
  | "inactive_customer"
  | "quote_follow_up"
  | "pipeline_risk"
  | "missing_document"
  | "expired_document"
  | "contract_update"
  | "generic";

export type ProactiveSignal = {
  id: string;
  employeeId: string;
  kind: ProactiveSignalKind;
  category: "risk" | "opportunity" | "alert" | "follow_up";
  title: string;
  detail: string;
  severity: 1 | 2 | 3 | 4 | 5;
  detectedAt: string;
  sourceMissionId: string | null;
};

export type RecommendationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "questioned"
  | "reassigned"
  | "delayed";

export type CeoRecommendationAction =
  | "approve"
  | "reject"
  | "ask"
  | "reassign"
  | "delay";

export type EmployeeRecommendation = {
  id: string;
  title: string;
  recommendation: string;
  reasoning: string;
  confidence: number;
  expectedImpact: string;
  category: ProactiveSignal["category"];
  leadEmployeeId: string;
  /** Sprint 1 — conversation owner (defaults to leadEmployeeId when missing). */
  conversationOwnerId?: string;
  /** Sprint 1 — employees explicitly invited by the owner. */
  invitedEmployeeIds?: string[];
  /** Suggested peers the owner may invite — never auto-joined. */
  suggestedInvitees?: string[];
  participatingEmployees: Array<{ id: string; name: string; role: string }>;
  internalDiscussion: ConversationTurn[];
  status: RecommendationStatus;
  ceoNote: string | null;
  reassignedToEmployeeId: string | null;
  delayedUntil: string | null;
  signalIds: string[];
  createdAt: string;
  updatedAt: string;
  /** Sprint 1 Part 3 — structured decision package fields (optional for legacy records). */
  priority?: RecommendationPriority;
  urgency?: RecommendationUrgency;
  risks?: string;
  dependencies?: string[];
  evidenceSummary?: EvidenceSummary;
  expectedImpactStructured?: StructuredExpectedImpact;
  confidenceReason?: string;
};

export type ExecutiveBrief = {
  generatedAt: string;
  generatedAtDisplay: string;
  headline: string;
  highestPriorities: string[];
  risks: string[];
  opportunities: string[];
  pendingApprovals: string[];
  suggestedActions: string[];
  recommendedAssignments: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    assignment: string;
  }>;
  summary: string;
  /** OS v2 continuous briefing fields (recorded state only). */
  whatChanged?: string[];
  currentBlockers?: string[];
  decisionsNeeded?: string[];
  employeesWaiting?: Array<{
    employeeId: string;
    employeeName: string;
    waitingFor: string;
  }>;
  completedWork?: string[];
  recommendedNextAction?: string | null;
};

export type CompanyHealth = {
  score: number;
  label: "Strong" | "Stable" | "Watch" | "At risk";
  summary: string;
  factors: string[];
};

export type PriorityAlert = {
  id: string;
  tone: "critical" | "warning" | "info";
  title: string;
  detail: string;
  employeeId: string | null;
};

type DetectionContext = {
  missions: CollaborationMission[];
  pendingApprovals: ApprovalCenterItem[];
  now?: string;
};

function isoNow(now?: string) {
  return now ?? new Date().toISOString();
}

function participant(id: string) {
  const emp = getEmployeeDefinition(id);
  return {
    id,
    name: emp?.name ?? id,
    role: emp?.role ?? "AI Employee",
  };
}

function liveDataAvailability(): LiveDataAvailability {
  try {
    const statuses = getConnectionStatusesSync();
    const map = new Map(statuses.map((s) => [s.system, s.connected]));
    return {
      gmailConnected: Boolean(map.get("gmail")),
      calendarConnected: Boolean(map.get("google_calendar")),
      driveConnected: Boolean(map.get("google_drive")),
      crmConnected: Boolean(map.get("crm")),
    };
  } catch {
    return defaultLiveDataAvailability();
  }
}

function enrichWithDecisionPackage(
  rec: EmployeeRecommendation
): EmployeeRecommendation {
  const pkg = buildRecommendationDecisionPackage({
    title: rec.title,
    recommendation: rec.recommendation,
    reasoning: rec.reasoning,
    expectedImpact: rec.expectedImpact,
    confidence: rec.confidence,
    category: rec.category,
    leadEmployeeId: rec.leadEmployeeId,
    participatingEmployees: rec.participatingEmployees,
    hasInternalDiscussion: (rec.internalDiscussion?.length ?? 0) > 0,
    liveData: liveDataAvailability(),
  });
  const merged = applyDecisionPackageToRecommendation(rec, pkg);
  return {
    ...rec,
    ...merged,
    // Keep signal-derived triage when already set (ask/synthesize must not regress).
    priority: rec.priority ?? pkg.priority,
    urgency: rec.urgency ?? pkg.urgency,
    dependencies:
      rec.dependencies && rec.dependencies.length > 0
        ? rec.dependencies
        : pkg.dependencies,
    expectedImpactStructured:
      rec.expectedImpactStructured ?? pkg.expectedImpactStructured,
    // Refresh narrative fields against current recommendation/confidence.
    risks: pkg.risks,
    confidenceReason: pkg.confidenceReason,
    evidenceSummary: pkg.evidenceSummary,
    expectedImpact: pkg.expectedImpact,
  } as EmployeeRecommendation;
}

function signalId(employeeId: string, kind: string, key: string) {
  return `sig-${employeeId}-${kind}-${key}`.replace(/[^a-zA-Z0-9-_]/g, "-");
}

/** Domain detectors — continuous review of each employee's specialty. */
export function detectProactiveSignals(ctx: DetectionContext): ProactiveSignal[] {
  const now = isoNow(ctx.now);
  const out: ProactiveSignal[] = [];
  const seen = new Set<string>();

  const push = (s: ProactiveSignal) => {
    if (seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
  };

  for (const mission of ctx.missions) {
    const hay = `${mission.title} ${mission.mission}`.toLowerCase();
    const pending =
      mission.approvalStatus === "pending" ||
      mission.approvalStatus === "changes_requested";

    if (/email|inbox|mail|outreach|reply/.test(hay)) {
      push({
        id: signalId("emma", pending ? "urgent_email" : "follow_up", mission.id),
        employeeId: "emma",
        kind: pending ? "urgent_email" : "follow_up",
        category: pending ? "alert" : "follow_up",
        title: pending ? "Urgent email waiting on approval" : "Email follow-up opportunity",
        detail: `Emma flagged “${mission.title}” for proactive email handling.`,
        severity: pending ? 4 : 2,
        detectedAt: now,
        sourceMissionId: mission.id,
      });
    }

    if (/calendar|schedule|conflict|meeting|travel/.test(hay)) {
      push({
        id: signalId("alex", /conflict|travel/.test(hay) ? "schedule_conflict" : "missing_prep", mission.id),
        employeeId: "alex",
        kind: /conflict|travel/.test(hay) ? "schedule_conflict" : "missing_prep",
        category: /conflict|travel/.test(hay) ? "risk" : "alert",
        title: /conflict|travel/.test(hay)
          ? "Schedule conflict detected"
          : "Missing meeting preparation",
        detail: `Alex reviewed calendars and found an issue in “${mission.title}”.`,
        severity: /conflict|travel/.test(hay) ? 5 : 3,
        detectedAt: now,
        sourceMissionId: mission.id,
      });
    }

    if (/sales|pipeline|deal|quote|customer|opportunity/.test(hay)) {
      push({
        id: signalId(
          "sarah",
          /risk|stall|inactive/.test(hay) ? "pipeline_risk" : "sales_opportunity",
          mission.id
        ),
        employeeId: "sarah",
        kind: /risk|stall|inactive/.test(hay) ? "pipeline_risk" : "sales_opportunity",
        category: /risk|stall|inactive/.test(hay) ? "risk" : "opportunity",
        title: /risk|stall|inactive/.test(hay)
          ? "Pipeline risk needs attention"
          : "Sales opportunity identified",
        detail: `Sarah found a revenue signal in “${mission.title}”.`,
        severity: /risk|stall|inactive/.test(hay) ? 4 : 3,
        detectedAt: now,
        sourceMissionId: mission.id,
      });
    }

    if (/document|proposal|contract|brief|report|deck/.test(hay)) {
      push({
        id: signalId(
          "david",
          /expired|contract|update/.test(hay) ? "contract_update" : "missing_document",
          mission.id
        ),
        employeeId: "david",
        kind: /expired|contract|update/.test(hay) ? "contract_update" : "missing_document",
        category: /expired|contract|update/.test(hay) ? "risk" : "alert",
        title: /expired|contract|update/.test(hay)
          ? "Contract needs an update"
          : "Document gap detected",
        detail: `David identified documentation work for “${mission.title}”.`,
        severity: 3,
        detectedAt: now,
        sourceMissionId: mission.id,
      });
    }

    // Cross-domain outreach only when the active mission itself requires customer comms.
    if (
      mission.leadEmployeeId === "sarah" &&
      isUnrelatedCommercialComms(missionCorpus(mission)) &&
      !mission.chain.some((c) => c.employeeId === "emma")
    ) {
      push({
        id: signalId("emma", "customer_reply", `${mission.id}-handoff`),
        employeeId: "emma",
        kind: "customer_reply",
        category: "opportunity",
        title: "Customer outreach can close the loop",
        detail: "Emma can draft the email after Sales and Documents collaborate.",
        severity: 2,
        detectedAt: now,
        sourceMissionId: mission.id,
      });
    }
  }

  for (const approval of ctx.pendingApprovals) {
    const owner = approval.requestingEmployee.id;
    push({
      id: signalId(owner, "follow_up", `approval-${approval.id}`),
      employeeId: owner,
      kind: "follow_up",
      category: "alert",
      title: `Pending CEO approval: ${approval.title}`,
      detail: `${approval.requestingEmployee.name} is waiting on your decision.`,
      severity: 4,
      detectedAt: now,
      sourceMissionId: approval.id,
    });
  }

  // Baseline continuous domain watch — suppressed while a WorkPilot mission is active
  // unless that mission explicitly requires commercial / communication work.
  const active = listActiveWorkpilotMissions(ctx.missions);
  const allowCommsBaselines =
    active.length === 0 || activeMissionsRequireComms(active);
  const day = now.slice(0, 10);
  const baselines: Array<Omit<ProactiveSignal, "detectedAt">> = [
    ...(allowCommsBaselines
      ? [
          {
            id: signalId("emma", "unanswered_email", day),
            employeeId: "emma",
            kind: "unanswered_email" as const,
            category: "alert" as const,
            title: "Unanswered emails need triage",
            detail:
              "Emma reviewed the executive inbox and found threads without a reply.",
            severity: 3 as const,
            sourceMissionId: null,
          },
          {
            id: signalId("sarah", "inactive_customer", day),
            employeeId: "sarah",
            kind: "inactive_customer" as const,
            category: "opportunity" as const,
            title: "Inactive customers to re-engage",
            detail: "Sarah spotted accounts with no recent sales motion.",
            severity: 3 as const,
            sourceMissionId: null,
          },
        ]
      : []),
    {
      id: signalId("alex", "overdue_meeting", day),
      employeeId: "alex",
      kind: "overdue_meeting",
      category: "risk",
      title: "Overdue meeting follow-ups",
      detail: "Alex found meetings that still lack notes or next steps.",
      severity: 3 as const,
      sourceMissionId: null,
    },
    {
      id: signalId("david", "expired_document", day),
      employeeId: "david",
      kind: "expired_document",
      category: "risk",
      title: "Expired documents in the library",
      detail: "David found documents past their review date.",
      severity: 2 as const,
      sourceMissionId: null,
    },
  ];

  // Drop calendar/doc baselines that are unrelated when locked on a pure engineering mission.
  const scopedBaselines =
    active.length > 0 && !activeMissionsRequireComms(active)
      ? baselines.filter(
          (b) =>
            b.kind !== "overdue_meeting" &&
            b.kind !== "expired_document" &&
            !isUnrelatedCommercialComms(`${b.title} ${b.detail}`)
        )
      : baselines;

  for (const b of scopedBaselines) {
    push({ ...b, detectedAt: now });
  }

  return out.sort((a, b) => b.severity - a.severity || a.id.localeCompare(b.id));
}

/**
 * Employees discuss internally before the CEO is notified.
 * Sprint 1 routing: lead becomes owner; only the owner speaks first;
 * suggested collaborators are not auto-joined.
 */
export function formInternalDiscussions(
  signals: ProactiveSignal[],
  now?: string
): Array<{
  signalIds: string[];
  leadEmployeeId: string;
  participants: string[];
  suggestedInvitees: string[];
  discussion: ConversationTurn[];
  category: ProactiveSignal["category"];
  seedTitle: string;
}> {
  const stamp = isoNow(now);
  const clusters: Array<{
    signalIds: string[];
    leadEmployeeId: string;
    participants: string[];
    suggestedInvitees: string[];
    discussion: ConversationTurn[];
    category: ProactiveSignal["category"];
    seedTitle: string;
  }> = [];

  const byLead = new Map<string, ProactiveSignal[]>();
  for (const s of signals) {
    const list = byLead.get(s.employeeId) ?? [];
    list.push(s);
    byLead.set(s.employeeId, list);
  }

  // Prefer sales-led clusters — owner Sarah; David/Emma are suggested invitees only.
  const sarahSignals = byLead.get("sarah") ?? [];
  if (sarahSignals.length > 0) {
    const related = [
      ...sarahSignals,
      ...(byLead.get("david") ?? []).slice(0, 1),
      ...(byLead.get("emma") ?? []).slice(0, 1),
    ];
    const owned = buildOwnerOnlyDiscussion({
      ownerEmployeeId: "sarah",
      seedDetail: related[0].detail,
      conversationKey: related[0].id,
      now: stamp,
      suggestedInvitees: suggestedCollaboratorsForOwner("sarah"),
    });
    clusters.push({
      signalIds: [...new Set(related.map((r) => r.id))],
      leadEmployeeId: "sarah",
      participants: owned.participants,
      suggestedInvitees: owned.suggestedInvitees,
      category: related.some((r) => r.category === "risk") ? "risk" : "opportunity",
      seedTitle: sarahSignals[0].title,
      discussion: owned.discussion,
    });
    byLead.delete("sarah");
    const used = new Set(related.map((r) => r.id));
    for (const empId of ["david", "emma"] as const) {
      const list = byLead.get(empId) ?? [];
      byLead.set(
        empId,
        list.filter((s) => !used.has(s.id))
      );
    }
  }

  for (const [leadId, list] of byLead) {
    if (list.length === 0) continue;
    const owned = buildOwnerOnlyDiscussion({
      ownerEmployeeId: leadId,
      seedDetail: list[0].detail,
      conversationKey: list[0].id,
      now: stamp,
      suggestedInvitees: suggestedCollaboratorsForOwner(leadId),
    });
    clusters.push({
      signalIds: list.map((s) => s.id),
      leadEmployeeId: leadId,
      participants: owned.participants,
      suggestedInvitees: owned.suggestedInvitees,
      category: list[0].category,
      seedTitle: list[0].title,
      discussion: owned.discussion,
    });
  }

  return clusters;
}

export function scoreRecommendationConfidence(input: {
  severity: number;
  participantCount: number;
  hasMissionSource: boolean;
  category: ProactiveSignal["category"];
}): { confidence: number; reasoning: string; expectedImpact: string } {
  let confidence = 55 + input.severity * 6;
  confidence += Math.min(15, input.participantCount * 5);
  if (input.hasMissionSource) confidence += 8;
  if (input.category === "risk") confidence += 4;
  if (input.category === "opportunity") confidence += 3;
  confidence = Math.max(40, Math.min(96, Math.round(confidence)));

  const reasoning = [
    `Signal severity ${input.severity}/5`,
    `${input.participantCount} employees aligned in internal discussion`,
    input.hasMissionSource ? "Linked to an active company mission" : "From continuous domain review",
    `Category: ${input.category.replace(/_/g, " ")}`,
  ].join(". ") + ".";

  const expectedImpact =
    input.category === "risk"
      ? "Reduce operational risk before it escalates."
      : input.category === "opportunity"
        ? "Capture revenue or relationship momentum this week."
        : "Clear a priority queue item and free executive attention.";

  return { confidence, reasoning, expectedImpact };
}

export function buildRecommendationsFromDiscussions(
  signals: ProactiveSignal[],
  now?: string
): EmployeeRecommendation[] {
  const stamp = isoNow(now);
  const clusters = formInternalDiscussions(signals, stamp);
  const byId = new Map(signals.map((s) => [s.id, s]));

  return clusters.map((cluster, index) => {
    const clusterSignals = cluster.signalIds
      .map((id) => byId.get(id))
      .filter((s): s is ProactiveSignal => Boolean(s));
    const top = clusterSignals.sort((a, b) => b.severity - a.severity)[0];
    const scoring = scoreRecommendationConfidence({
      severity: top?.severity ?? 3,
      participantCount: Math.max(1, cluster.participants.length),
      hasMissionSource: clusterSignals.some((s) => Boolean(s.sourceMissionId)),
      category: cluster.category,
    });

    const recommendation = recommendationCopy(cluster.leadEmployeeId, top);
    const signalKey = [...cluster.signalIds].sort().join("-").slice(0, 64) || `idx-${index}`;
    const participatingEmployees = cluster.participants.map(participant);
    const base = {
      id: `rec-${cluster.leadEmployeeId}-${signalKey}`.replace(/[^a-zA-Z0-9-_]/g, "-"),
      title: top?.title ?? cluster.seedTitle,
      recommendation,
      reasoning: scoring.reasoning,
      confidence: scoring.confidence,
      expectedImpact: scoring.expectedImpact,
      category: cluster.category,
      leadEmployeeId: cluster.leadEmployeeId,
      conversationOwnerId: cluster.leadEmployeeId,
      invitedEmployeeIds: [] as string[],
      suggestedInvitees: cluster.suggestedInvitees,
      participatingEmployees,
      internalDiscussion: cluster.discussion,
      status: "pending" as const,
      ceoNote: null,
      reassignedToEmployeeId: null,
      delayedUntil: null,
      signalIds: cluster.signalIds,
      createdAt: stamp,
      updatedAt: stamp,
    };

    const pkg = buildRecommendationDecisionPackage({
      title: base.title,
      recommendation: base.recommendation,
      reasoning: base.reasoning,
      expectedImpact: base.expectedImpact,
      confidence: base.confidence,
      category: base.category,
      leadEmployeeId: base.leadEmployeeId,
      signal: top
        ? {
            kind: top.kind,
            severity: top.severity,
            category: top.category,
            sourceMissionId: top.sourceMissionId,
            title: top.title,
          }
        : null,
      signals: clusterSignals.map((s) => ({
        kind: s.kind,
        severity: s.severity,
        category: s.category,
        sourceMissionId: s.sourceMissionId,
        title: s.title,
      })),
      participatingEmployees,
      hasInternalDiscussion: cluster.discussion.length > 0,
      liveData: liveDataAvailability(),
    });

    return applyDecisionPackageToRecommendation(base, pkg) as EmployeeRecommendation;
  });
}

function recommendationCopy(leadId: string, signal?: ProactiveSignal): string {
  if (leadId === "sarah") {
    return signal?.kind === "inactive_customer"
      ? "Recommend contacting inactive accounts today."
      : "Recommend advancing this sales opportunity before end of day.";
  }
  if (leadId === "alex") {
    return "Recommend rescheduling tomorrow's meeting to clear the conflict.";
  }
  if (leadId === "emma") {
    return "Recommend sending the proposal email before 3 PM.";
  }
  if (leadId === "david") {
    return "Recommend refreshing the document pack before outreach.";
  }
  const name = getEmployeeDefinition(leadId)?.name ?? "Employee";
  return `Recommend acting on ${name}'s finding: ${signal?.title ?? "priority item"}.`;
}

export function applyRecommendationDecision(
  rec: EmployeeRecommendation,
  input: {
    action: CeoRecommendationAction;
    note?: string | null;
    reassignToEmployeeId?: string | null;
    delayUntil?: string | null;
    now?: string;
  }
): EmployeeRecommendation {
  const now = isoNow(input.now);
  const note = input.note?.trim() ? input.note.trim() : null;
  const ownerId = resolveConversationOwner({
    conversationOwnerId: rec.conversationOwnerId,
    leadEmployeeId: rec.leadEmployeeId,
  });
  const next: EmployeeRecommendation = {
    ...rec,
    updatedAt: now,
    ceoNote: note,
    conversationOwnerId: ownerId,
    invitedEmployeeIds: [...(rec.invitedEmployeeIds ?? [])],
    suggestedInvitees: [...(rec.suggestedInvitees ?? [])],
    participatingEmployees: [...rec.participatingEmployees],
    internalDiscussion: [...rec.internalDiscussion],
  };

  switch (input.action) {
    case "approve":
      next.status = "approved";
      break;
    case "reject":
      next.status = "rejected";
      break;
    case "ask": {
      next.status = "questioned";
      const ceoMessage = note ?? "Can you clarify the recommendation?";
      const route = resolveStrictMessageRoute({
        ceoMessage,
        currentOwnerEmployeeId: next.conversationOwnerId,
        currentLeadEmployeeId: next.leadEmployeeId,
        invitedEmployeeIds: next.invitedEmployeeIds ?? [],
      });
      let ownerId = route.ownerEmployeeId;
      const turns: ConversationTurn[] = [...next.internalDiscussion];
      let tOffset = 0;
      const stamp = (sec: number) =>
        new Date(Date.parse(now) + sec * 1000).toISOString();

      // 1) CEO request
      turns.push({
        id: `${rec.id}-ceo-ask-${now}`,
        employeeId: "ceo",
        employeeName: "CEO",
        role: "Executive",
        body: ceoMessage,
        at: stamp(tOffset),
        kind: "approval",
      });
      tOffset += 10;

      // 2) Explicit CEO addressee → conversation + mission ownership
      const previousOwner = resolveConversationOwner({
        conversationOwnerId: rec.conversationOwnerId,
        leadEmployeeId: rec.leadEmployeeId,
      });
      if (route.addressedEmployeeId && previousOwner !== ownerId) {
        const transferred = transferConversationOwner({
          ownership: {
            ownerEmployeeId: previousOwner,
            invitedEmployeeIds: next.invitedEmployeeIds ?? [],
          },
          newOwnerEmployeeId: ownerId,
        });
        ownerId = transferred.ownerEmployeeId;
        next.invitedEmployeeIds = transferred.invitedEmployeeIds;
        next.suggestedInvitees = suggestedCollaboratorsForOwner(ownerId);
        turns.push(
          buildReassignmentEventTurn({
            conversationKey: rec.id,
            fromOwnerId: previousOwner,
            toOwnerId: ownerId,
            now: stamp(tOffset),
          })
        );
        tOffset += 10;
      }
      next.conversationOwnerId = ownerId;
      if (route.addressedEmployeeId) {
        next.leadEmployeeId = ownerId;
        next.suggestedInvitees = suggestedCollaboratorsForOwner(ownerId);
      }

      if (!canEmployeeRespondToCeoMessage({ ...route, ownerEmployeeId: ownerId, allowedResponderIds: [ownerId] }, ownerId)) {
        throw new Error("STRICT_ROUTING_OWNER_MISMATCH");
      }

      const wantsCollab = route.collaborationRequested;
      const peerIds = wantsCollab
        ? selectRelevantDiscussionParticipants({
            ownerEmployeeId: ownerId,
            category: next.category,
            title: next.title,
            recommendation: next.recommendation,
            ceoMessage,
            maxPeers: 2,
          })
        : [];
      const peerNames = peerIds
        .map((id) => getEmployeeDefinition(id)?.name)
        .filter((n): n is string => Boolean(n));

      // 3) New owner first response only
      const routed = routeCeoQuestionToOwner({
        ownerEmployeeId: ownerId,
        ceoMessage,
        conversationKey: rec.id,
        now: stamp(tOffset),
        priorBodies: turns.map((t) => t.body),
        willInvitePeers: peerIds.length > 0,
        peerNames,
        includeCeoTurn: false,
      });
      turns.push(routed.ownerTurn);
      tOffset += 25;

      // 4) Invite relevant peers via invite flow + visible contributions
      let ownership = {
        ownerEmployeeId: ownerId,
        invitedEmployeeIds: [...(next.invitedEmployeeIds ?? [])],
      };
      const unavailable: string[] = [];
      for (const inviteeId of peerIds) {
        if (!getEmployeeDefinition(inviteeId)) {
          unavailable.push(inviteeId);
          continue;
        }
        try {
          const invited = inviteEmployeeToConversation({
            ownership,
            inviteeEmployeeId: inviteeId,
            invitedByEmployeeId: ownerId,
            conversationKey: rec.id,
            now: stamp(tOffset),
          });
          ownership = invited.ownership;
          turns.push(invited.turn);
          tOffset += 10;

          const contrib = appendInvitedDomainContribution({
            ownership,
            employeeId: inviteeId,
            conversationKey: rec.id,
            now: stamp(tOffset),
            priorBodies: turns.map((t) => t.body),
            ceoMessage,
            liveData: liveDataAvailability(),
          });
          if (contrib) {
            turns.push(contrib);
            tOffset += 15;
          } else {
            // Contribution failed — do not keep invitee as a successful participant.
            ownership = {
              ...ownership,
              invitedEmployeeIds: ownership.invitedEmployeeIds.filter(
                (id) => id !== inviteeId
              ),
            };
            turns.push({
              id: `${rec.id}-invite-skip-${inviteeId}-${stamp(tOffset)}`,
              employeeId: ownerId,
              employeeName: getEmployeeDefinition(ownerId)?.name ?? ownerId,
              role: getEmployeeDefinition(ownerId)?.role ?? "AI Employee",
              body: `${getEmployeeDefinition(inviteeId)?.name ?? inviteeId} could not provide a domain-ready contribution, so they were not included in the final participants.`,
              at: stamp(tOffset),
              kind: "update",
            });
            tOffset += 10;
          }
        } catch {
          unavailable.push(inviteeId);
        }
      }

      // Preserve autonomous collaboration after ownership: expand invited set.
      ownership = {
        ownerEmployeeId: ownerId,
        invitedEmployeeIds: withOwnerInvites(
          { ...route, ownerEmployeeId: ownerId },
          ownership.invitedEmployeeIds
        ).allowedParticipantIds.filter((id) => id !== ownerId),
      };

      if (unavailable.length > 0) {
        const names = unavailable
          .map((id) => getEmployeeDefinition(id)?.name ?? id)
          .join(", ");
        turns.push({
          id: `${rec.id}-unavailable-${stamp(tOffset)}`,
          employeeId: ownerId,
          employeeName: getEmployeeDefinition(ownerId)?.name ?? ownerId,
          role: getEmployeeDefinition(ownerId)?.role ?? "AI Employee",
          body: `Requested domain specialist unavailable: ${names}.`,
          at: stamp(tOffset),
          kind: "update",
        });
        tOffset += 10;
      }

      next.invitedEmployeeIds = ownership.invitedEmployeeIds;
      next.internalDiscussion = turns;

      // 5) Owner final synthesis
      const synth = synthesizeOwnerRecommendation({
        ownership,
        discussion: turns,
        baseRecommendation: rec.recommendation,
        conversationKey: rec.id,
        now: stamp(tOffset),
        reasoning: rec.reasoning,
        expectedImpact: rec.expectedImpact,
        confidence: rec.confidence,
        liveData: liveDataAvailability(),
      });
      next.internalDiscussion = [...turns, synth.turn];
      next.recommendation = synth.recommendation;
      next.reasoning = synth.synthesis.reasoningSummary;
      next.expectedImpact = synth.synthesis.expectedImpact;
      next.confidence = synth.synthesis.confidence;
      next.risks = synth.synthesis.risksOrUncertainty;
      next.confidenceReason = synth.synthesis.confidenceExplanation;
      next.participatingEmployees = deriveParticipantsFromConversationTurns(
        next.internalDiscussion,
        ownerId
      );
      // Integrity: synthesis participants must match derived set
      const integrity = validateDiscussionParticipantIntegrity({
        participants: next.participatingEmployees,
        turns: next.internalDiscussion,
        ownerEmployeeId: ownerId,
      });
      if (!integrity.ok) {
        next.participatingEmployees = deriveParticipantsFromConversationTurns(
          next.internalDiscussion,
          ownerId
        );
      }
      return enrichWithDecisionPackage(next);
    }
    case "reassign": {
      const targetId = input.reassignToEmployeeId?.trim();
      if (!targetId || !getEmployeeDefinition(targetId)) {
        throw new Error("VALID_REASSIGN_REQUIRED");
      }
      next.status = "reassigned";
      next.reassignedToEmployeeId = targetId;
      next.leadEmployeeId = targetId;
      // Explicit CEO transfer only — never automatic.
      const transferred = transferConversationOwner({
        ownership: {
          ownerEmployeeId: ownerId,
          invitedEmployeeIds: next.invitedEmployeeIds ?? [],
        },
        newOwnerEmployeeId: targetId,
      });
      next.conversationOwnerId = transferred.ownerEmployeeId;
      next.invitedEmployeeIds = transferred.invitedEmployeeIds;
      next.suggestedInvitees = suggestedCollaboratorsForOwner(targetId);
      const target = participant(targetId);
      next.participatingEmployees = [target];
      next.internalDiscussion = [
        ...next.internalDiscussion,
        {
          id: `${rec.id}-reassign-${now}`,
          employeeId: "ceo",
          employeeName: "CEO",
          role: "Executive",
          body: `Reassigned to ${target.name}.`,
          at: now,
          kind: "system",
        },
        {
          id: `${rec.id}-reassign-ack-${now}`,
          employeeId: targetId,
          employeeName: target.name,
          role: target.role,
          body: `${target.name}: Taking ownership of this recommendation.`,
          at: new Date(Date.parse(now) + 15_000).toISOString(),
          kind: "update",
        },
      ];
      break;
    }
    case "delay": {
      const until = input.delayUntil?.trim() || new Date(Date.parse(now) + 86_400_000).toISOString();
      next.status = "delayed";
      next.delayedUntil = until;
      break;
    }
  }

  return next;
}

/**
 * Owner invites a collaborator into an existing recommendation discussion.
 */
export function inviteToRecommendationDiscussion(
  rec: EmployeeRecommendation,
  inviteeEmployeeId: string,
  now?: string
): EmployeeRecommendation {
  const stamp = isoNow(now);
  const ownerId = resolveConversationOwner({
    conversationOwnerId: rec.conversationOwnerId,
    leadEmployeeId: rec.leadEmployeeId,
  });
  const invited = inviteEmployeeToConversation({
    ownership: {
      ownerEmployeeId: ownerId,
      invitedEmployeeIds: rec.invitedEmployeeIds ?? [],
    },
    inviteeEmployeeId,
    invitedByEmployeeId: ownerId,
    conversationKey: rec.id,
    now: stamp,
  });
  const ceoMessage =
    [...rec.internalDiscussion].reverse().find((t) => t.employeeId === "ceo")?.body ??
    rec.ceoNote;
  const contrib = appendInvitedDomainContribution({
    ownership: invited.ownership,
    employeeId: inviteeEmployeeId,
    conversationKey: rec.id,
    now: new Date(Date.parse(stamp) + 15_000).toISOString(),
    priorBodies: rec.internalDiscussion.map((t) => t.body),
    ceoMessage,
    liveData: liveDataAvailability(),
  });

  const discussion = contrib
    ? [...rec.internalDiscussion, invited.turn, contrib]
    : [...rec.internalDiscussion, invited.turn];
  const invitedIds = contrib
    ? invited.ownership.invitedEmployeeIds
    : invited.ownership.invitedEmployeeIds.filter((id) => id !== inviteeEmployeeId);

  return {
    ...rec,
    conversationOwnerId: invited.ownership.ownerEmployeeId,
    invitedEmployeeIds: invitedIds,
    participatingEmployees: deriveParticipantsFromConversationTurns(
      discussion,
      ownerId
    ),
    internalDiscussion: discussion,
    updatedAt: stamp,
  };
}

/**
 * Owner closes the thread with one synthesized recommendation for the CEO.
 */
export function synthesizeRecommendationDiscussion(
  rec: EmployeeRecommendation,
  now?: string
): EmployeeRecommendation {
  const stamp = isoNow(now);
  const ownerId = resolveConversationOwner({
    conversationOwnerId: rec.conversationOwnerId,
    leadEmployeeId: rec.leadEmployeeId,
  });
  const synth = synthesizeOwnerRecommendation({
    ownership: {
      ownerEmployeeId: ownerId,
      invitedEmployeeIds: rec.invitedEmployeeIds ?? [],
    },
    discussion: rec.internalDiscussion,
    baseRecommendation: rec.recommendation,
    conversationKey: rec.id,
    now: stamp,
    reasoning: rec.reasoning,
    expectedImpact: rec.expectedImpact,
    confidence: rec.confidence,
    liveData: liveDataAvailability(),
  });
  return enrichWithDecisionPackage({
    ...rec,
    conversationOwnerId: ownerId,
    recommendation: synth.recommendation,
    reasoning: synth.synthesis.reasoningSummary,
    expectedImpact: synth.synthesis.expectedImpact,
    confidence: synth.synthesis.confidence,
    risks: synth.synthesis.risksOrUncertainty,
    confidenceReason: synth.synthesis.confidenceExplanation,
    participatingEmployees: deriveParticipantsFromConversationTurns(
      [...rec.internalDiscussion, synth.turn],
      ownerId
    ),
    internalDiscussion: [...rec.internalDiscussion, synth.turn],
    updatedAt: stamp,
  });
}

export function buildExecutiveBrief(input: {
  recommendations: EmployeeRecommendation[];
  pendingApprovals: ApprovalCenterItem[];
  generatedAt?: string;
  generatedAtDisplay: string;
}): ExecutiveBrief {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const pendingRecs = input.recommendations.filter((r) => r.status === "pending");
  const risks = pendingRecs
    .filter((r) => r.category === "risk")
    .map((r) => r.title)
    .slice(0, 5);
  const opportunities = pendingRecs
    .filter((r) => r.category === "opportunity")
    .map((r) => r.title)
    .slice(0, 5);
  const highestPriorities = [...pendingRecs]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((r) => r.recommendation);

  const pendingApprovals = input.pendingApprovals.slice(0, 5).map((a) => a.title);
  const suggestedActions = pendingRecs.slice(0, 5).map((r) => r.recommendation);
  const recommendedAssignments = pendingRecs.slice(0, 5).map((r) => {
    const lead =
      r.participatingEmployees.find((p) => p.id === r.leadEmployeeId) ??
      participant(r.leadEmployeeId);
    return {
      employeeId: lead.id,
      employeeName: lead.name,
      role: lead.role,
      assignment: r.title,
    };
  });

  const headline =
    pendingRecs.length > 0
      ? `${pendingRecs.length} proactive recommendations ready for your review`
      : "Your AI Company is monitoring domains — no urgent recommendations";

  const summary = [
    highestPriorities[0] ?? "No urgent priorities.",
    risks[0] ? `Risk focus: ${risks[0]}.` : "No critical risks flagged.",
    opportunities[0] ? `Opportunity: ${opportunities[0]}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    generatedAt,
    generatedAtDisplay: input.generatedAtDisplay,
    headline,
    highestPriorities,
    risks,
    opportunities,
    pendingApprovals,
    suggestedActions,
    recommendedAssignments,
    summary,
  };
}

export function buildPriorityAlerts(
  signals: ProactiveSignal[],
  recommendations: EmployeeRecommendation[]
): PriorityAlert[] {
  const fromSignals = signals
    .filter((s) => s.severity >= 4)
    .slice(0, 6)
    .map((s) => ({
      id: `alert-${s.id}`,
      tone: (s.severity >= 5 ? "critical" : "warning") as PriorityAlert["tone"],
      title: s.title,
      detail: s.detail,
      employeeId: s.employeeId,
    }));

  const fromRecs = recommendations
    .filter((r) => r.status === "pending" && r.confidence >= 80)
    .slice(0, 4)
    .map((r) => ({
      id: `alert-rec-${r.id}`,
      tone: "info" as const,
      title: r.title,
      detail: r.recommendation,
      employeeId: r.leadEmployeeId,
    }));

  return [...fromSignals, ...fromRecs].slice(0, 10);
}

export function computeCompanyHealth(input: {
  metrics: CompanyDashboardMetrics;
  recommendations: EmployeeRecommendation[];
  risks: string[];
}): CompanyHealth {
  const pending = input.recommendations.filter((r) => r.status === "pending").length;
  const delayed = input.recommendations.filter((r) => r.status === "delayed").length;
  let score = input.metrics.companyProductivity;
  score -= Math.min(20, input.risks.length * 4);
  score -= Math.min(15, pending * 2);
  score -= Math.min(10, delayed * 3);
  score += Math.min(10, input.metrics.completedToday * 2);
  score = Math.max(8, Math.min(99, Math.round(score)));

  const label: CompanyHealth["label"] =
    score >= 80 ? "Strong" : score >= 65 ? "Stable" : score >= 45 ? "Watch" : "At risk";

  const factors = [
    `Productivity ${input.metrics.companyProductivity}%`,
    `${pending} open recommendations`,
    `${input.risks.length} risks in the brief`,
    `${input.metrics.waitingForApproval} waiting for approval`,
  ];

  const summary =
    label === "Strong"
      ? "The company is operating with healthy proactive coverage."
      : label === "Stable"
        ? "Operations are steady; a few recommendations need CEO attention."
        : label === "Watch"
          ? "Attention needed — risks or backlog are rising."
          : "Company health is under pressure; clear approvals and risks first.";

  return { score, label, summary, factors };
}

export function listEmployeeCatalogIds() {
  return AI_COMPANY_EMPLOYEES.map((e) => e.id);
}
