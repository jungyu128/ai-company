/**
 * Bug-fix regressions: participant integrity, specialist count, system events,
 * structured final recommendation formatting.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  countVisiblePeerContributionTurns,
  deriveParticipantsFromConversationTurns,
  isVisibleDomainContributionTurn,
  validateDiscussionParticipantIntegrity,
  buildReassignmentEventTurn,
} from "@/services/builder/ceo-discussion-orchestration.logic";
import {
  inviteEmployeeToConversation,
  createConversationOwnership,
  appendInvitedDomainContribution,
  synthesizeOwnerRecommendation,
} from "@/services/builder/conversation-routing.logic";
import {
  buildOwnerSynthesisParts,
  formatOwnerSynthesisBody,
  defaultLiveDataAvailability,
} from "@/services/builder/discussion-quality.logic";
import {
  applyRecommendationDecision,
  buildRecommendationsFromDiscussions,
  detectProactiveSignals,
} from "@/services/builder/proactive.logic";
import type { ConversationTurn } from "@/services/builder/conversation.logic";

const ASK = `Alex, before I approve this recommendation, explain your reasoning in detail.
If needed, invite the relevant employees to provide their domain-specific input,
then present one final recommendation with your confidence level and any risks.`;

function salesRec(now: string) {
  const signals = detectProactiveSignals({
    missions: [],
    pendingApprovals: [],
    now,
  });
  const recs = buildRecommendationsFromDiscussions(signals, now);
  const sales = recs.find((r) => r.leadEmployeeId === "sarah");
  assert.ok(sales);
  return sales!;
}

describe("bugfix — participant integrity", () => {
  it("excludes prior owner openings and invite-only employees from participants", () => {
    const turns: ConversationTurn[] = [
      {
        id: "sarah-open",
        employeeId: "sarah",
        employeeName: "Sarah",
        role: "Sales Manager",
        body: "I'll review this against pipeline momentum and account priority signals. Without a clear commercial next step, recoverable revenue can slip. I'll return one sales recommendation.",
        at: "2026-07-30T10:00:00.000Z",
        kind: "update",
      },
      {
        id: "sys-reassign",
        employeeId: "system",
        employeeName: "System",
        role: "Coordinator",
        body: "Discussion reassigned from Sarah to Alex by CEO.",
        at: "2026-07-30T10:00:10.000Z",
        kind: "system",
      },
      {
        id: "alex-open",
        employeeId: "alex",
        employeeName: "Alex",
        role: "Calendar Manager",
        body: "I'll review the recommendation against the available conflict detection. I also need Sarah and Emma input before I can give you a reliable final recommendation.",
        at: "2026-07-30T10:00:20.000Z",
        kind: "update",
      },
      {
        id: "invite-david",
        employeeId: "system",
        employeeName: "System",
        role: "Coordinator",
        body: "Alex invited David to the discussion.",
        at: "2026-07-30T10:00:30.000Z",
        kind: "system",
      },
      {
        id: "emma-contrib",
        employeeId: "emma",
        employeeName: "Emma",
        role: "Email Manager",
        body: "Email follow-up needs a defined recipient, tone, and send window for the draft. Vague outreach timing or tone risks missed replies. Prepare a draft with recipient + tone notes.",
        at: "2026-07-30T10:00:45.000Z",
        kind: "handoff",
      },
    ];

    assert.equal(isVisibleDomainContributionTurn(turns[0]), false); // prior owner opening
    assert.equal(isVisibleDomainContributionTurn(turns[2]), false); // new owner opening
    assert.equal(isVisibleDomainContributionTurn(turns[3]), false); // invite system
    assert.equal(isVisibleDomainContributionTurn(turns[4]), true); // emma contrib

    const participants = deriveParticipantsFromConversationTurns(turns, "alex");
    assert.deepEqual(
      participants.map((p) => p.id),
      ["alex", "emma"]
    );
    assert.equal(participants.filter((p) => p.id === "alex").length, 1);
    assert.equal(participants.some((p) => p.id === "sarah"), false);
    assert.equal(participants.some((p) => p.id === "david"), false);

    const integrity = validateDiscussionParticipantIntegrity({
      participants,
      turns,
      ownerEmployeeId: "alex",
    });
    assert.equal(integrity.ok, true, integrity.reasons.join(","));
  });
});

describe("bugfix — specialist count", () => {
  it("counts only visible peer contribution turns, not openings or invites", () => {
    const turns: ConversationTurn[] = [
      {
        id: "o1",
        employeeId: "alex",
        employeeName: "Alex",
        role: "Calendar Manager",
        body: "I'll review schedule capacity and conflict risk for this recommendation carefully today.",
        at: "2026-07-30T10:00:00.000Z",
        kind: "update",
      },
      {
        id: "inv",
        employeeId: "system",
        employeeName: "System",
        role: "Coordinator",
        body: "Alex invited Emma to the discussion.",
        at: "2026-07-30T10:00:10.000Z",
        kind: "system",
      },
      {
        id: "c1",
        employeeId: "emma",
        employeeName: "Emma",
        role: "Email Manager",
        body: "Email follow-up needs a defined recipient, tone, and send window for the draft. Vague outreach timing risks missed replies. Prepare a draft with recipient notes.",
        at: "2026-07-30T10:00:20.000Z",
        kind: "handoff",
      },
      {
        id: "c2",
        employeeId: "sarah",
        employeeName: "Sarah",
        role: "Sales Manager",
        body: "Sales pipeline signals point to an account with open revenue opportunity. Delaying outreach lowers close probability. Prioritize that account in today's pipeline motion.",
        at: "2026-07-30T10:00:30.000Z",
        kind: "handoff",
      },
    ];

    assert.equal(countVisiblePeerContributionTurns(turns, "alex"), 2);

    const parts = buildOwnerSynthesisParts({
      ownerEmployeeId: "alex",
      baseRecommendation: "Recommend a clear next outreach step today.",
      discussion: turns,
      invitedEmployeeIds: ["emma", "sarah", "david", "noah"], // metadata must not inflate count
      liveData: defaultLiveDataAvailability(),
      confidence: 70,
    });
    assert.match(parts.reasoningSummary, /closed after 2 specialist notes/);
    assert.equal(/closed after 11/.test(parts.reasoningSummary), false);
    assert.equal(/closed after 4/.test(parts.reasoningSummary), false);
    assert.match(parts.confidenceExplanation, /2 visible specialist contributions/);
  });
});

describe("bugfix — system events", () => {
  it("records invitation and reassignment as System messages", () => {
    const ownership = createConversationOwnership("alex");
    const invited = inviteEmployeeToConversation({
      ownership,
      inviteeEmployeeId: "david",
      invitedByEmployeeId: "alex",
      conversationKey: "rec-sys",
      now: "2026-07-30T10:10:00.000Z",
    });
    assert.equal(invited.turn.employeeId, "system");
    assert.equal(invited.turn.employeeName, "System");
    assert.equal(invited.turn.kind, "system");
    assert.equal(invited.turn.body, "Alex invited David to the discussion.");

    const reassign = buildReassignmentEventTurn({
      conversationKey: "rec-sys",
      fromOwnerId: "sarah",
      toOwnerId: "alex",
      now: "2026-07-30T10:10:05.000Z",
    });
    assert.equal(reassign.employeeId, "system");
    assert.equal(reassign.kind, "system");
    assert.match(reassign.body, /reassigned from Sarah to Alex by CEO/i);

    const sales = salesRec("2026-07-30T10:11:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: ASK,
      now: "2026-07-30T10:12:00.000Z",
    });
    const systemTurns = asked.internalDiscussion.filter((t) => t.employeeId === "system");
    assert.ok(systemTurns.some((t) => /reassigned from Sarah to Alex/i.test(t.body)));
    assert.ok(systemTurns.some((t) => /invited .+ to the discussion/i.test(t.body)));
    assert.equal(
      asked.internalDiscussion.some(
        (t) => t.employeeId === "alex" && /invited .+ to the discussion/i.test(t.body)
      ),
      false
    );
  });
});

describe("bugfix — final recommendation formatting", () => {
  it("renders structured sections without repeating the connector disclaimer", () => {
    let ownership = createConversationOwnership("alex");
    const invite = inviteEmployeeToConversation({
      ownership,
      inviteeEmployeeId: "emma",
      invitedByEmployeeId: "alex",
      conversationKey: "rec-fmt",
      now: "2026-07-30T10:20:00.000Z",
    });
    ownership = invite.ownership;
    const contrib = appendInvitedDomainContribution({
      ownership,
      employeeId: "emma",
      conversationKey: "rec-fmt",
      now: "2026-07-30T10:20:15.000Z",
      liveData: defaultLiveDataAvailability(),
    });
    assert.ok(contrib);

    const synth = synthesizeOwnerRecommendation({
      ownership,
      discussion: [invite.turn, contrib!],
      baseRecommendation: "Recommend contacting inactive accounts today.",
      conversationKey: "rec-fmt",
      now: "2026-07-30T10:20:30.000Z",
      confidence: 78,
      liveData: defaultLiveDataAvailability(),
    });

    const body = synth.turn.body;
    assert.match(body, /^Alex:\nRecommendation\n/);
    for (const label of [
      "Recommendation",
      "Reasoning",
      "Expected Impact",
      "Risks",
      "Missing Information",
      "Confidence",
      "Participants",
      "Evidence",
    ]) {
      assert.match(body, new RegExp(`\\n${label}\\n|^${label}\\n`));
    }
    assert.equal(body.includes("Recommendation —"), false);
    assert.equal(body.includes("Reasoning —"), false);
    const caveatHits = body.match(
      /Evidence is based on available internal and demo signals/g
    );
    assert.equal((caveatHits ?? []).length, 1);
    assert.equal(/closed after 11/.test(body), false);

    const formatted = formatOwnerSynthesisBody("Alex", {
      ...synth.synthesis,
      dataCaveat:
        "Evidence is based on available internal and demo signals; connected email, calendar, document, and CRM data was not read.",
      risksOrUncertainty:
        "Residual risk. Evidence is based on available internal and demo signals; connected email, calendar, document, and CRM data was not read.",
    });
    assert.equal(
      (
        formatted.match(
          /Evidence is based on available internal and demo signals/g
        ) ?? []
      ).length,
      1
    );
  });
});
