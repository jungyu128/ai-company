/**
 * Sprint 1 Part 2 — discussion quality (domain, repetition, synthesis, connectors).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertContributionQuality,
  buildDomainContributionParts,
  buildOwnerSynthesisParts,
  countSentences,
  defaultLiveDataAvailability,
  formatContributionBody,
  formatOwnerSynthesisBody,
  isGenericContribution,
  repeatsPriorDiscussion,
} from "@/services/builder/discussion-quality.logic";
import {
  appendInvitedDomainContribution,
  createConversationOwnership,
  inviteEmployeeToConversation,
  synthesizeOwnerRecommendation,
} from "@/services/builder/conversation-routing.logic";
import {
  buildRecommendationsFromDiscussions,
  detectProactiveSignals,
  inviteToRecommendationDiscussion,
  synthesizeRecommendationDiscussion,
} from "@/services/builder/proactive.logic";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";

const DOMAIN_EXPECT: Record<string, RegExp> = {
  alex: /calendar|schedule|conflict|availability|timing/i,
  mia: /agenda|meeting|attendee|follow-up|prep/i,
  sarah: /pipeline|sales|revenue|account|opportunity/i,
  david: /document|brief|proposal|report|pack/i,
  emma: /email|draft|recipient|tone|follow-up/i,
  noah: /crm|account|record|relationship|customer/i,
  olivia: /budget|cost|finance|return|financial/i,
  ethan: /ticket|support|urgency|escalation|satisfaction/i,
};

describe("discussion quality — domain contributions", () => {
  it("produces observation + implication + action per employee domain", () => {
    for (const emp of AI_COMPANY_EMPLOYEES) {
      const parts = buildDomainContributionParts(emp.id, {
        priorBodies: [],
        liveData: defaultLiveDataAvailability({
          gmailConnected: true,
          calendarConnected: true,
          driveConnected: true,
          crmConnected: true,
        }),
      });
      const body = formatContributionBody(parts);
      assert.ok(parts.observation.length > 10, emp.id);
      assert.ok(parts.implication.length > 10, emp.id);
      assert.ok(parts.action.length > 10, emp.id);
      assert.ok(countSentences(body) <= 3, `${emp.id} sentences=${countSentences(body)}`);
      assert.match(body, DOMAIN_EXPECT[emp.id], emp.id);
      assert.equal(isGenericContribution(body), false, emp.id);
    }
  });

  it("rejects generic phrases and CEO/owner/peer repetition", () => {
    assert.equal(isGenericContribution("I agree."), true);
    assert.equal(isGenericContribution("I can help."), true);
    assert.equal(isGenericContribution("Thanks, I will refine the plan."), true);

    const ceo = "Which customer should we prioritize this week?";
    const owner =
      "I'll review this against pipeline momentum and account priority signals.";
    const peer = formatContributionBody(
      buildDomainContributionParts("david", { priorBodies: [ceo, owner] })
    );

    assert.equal(repeatsPriorDiscussion(ceo, [ceo]), true);
    assert.equal(repeatsPriorDiscussion(owner, [owner]), true);
    assert.equal(repeatsPriorDiscussion(peer, [ceo, owner]), false);

    const quality = assertContributionQuality({
      body: peer,
      employeeId: "david",
      priorBodies: [ceo, owner],
      ceoMessage: ceo,
    });
    assert.equal(quality.ok, true);
  });
});

describe("discussion quality — owner synthesis", () => {
  it("includes recommendation, reasoning, impact, risks, confidence, participants", () => {
    const ownership = createConversationOwnership("sarah");
    const invite = inviteEmployeeToConversation({
      ownership,
      inviteeEmployeeId: "emma",
      invitedByEmployeeId: "sarah",
      conversationKey: "dq-1",
      now: "2026-07-30T04:00:00.000Z",
    });
    const contrib = appendInvitedDomainContribution({
      ownership: invite.ownership,
      employeeId: "emma",
      conversationKey: "dq-1",
      now: "2026-07-30T04:00:15.000Z",
      priorBodies: [invite.turn.body],
      ceoMessage: "Should we send outreach today?",
      liveData: defaultLiveDataAvailability(),
    });
    assert.ok(contrib);

    const synth = synthesizeOwnerRecommendation({
      ownership: invite.ownership,
      discussion: [invite.turn, contrib!],
      baseRecommendation: "Recommend contacting inactive accounts today.",
      conversationKey: "dq-1",
      now: "2026-07-30T04:00:30.000Z",
      reasoning: "Pipeline priority with email follow-through.",
      expectedImpact: "Recover dormant revenue this week.",
      confidence: 78,
      liveData: defaultLiveDataAvailability(),
    });

    assert.match(synth.turn.body, /Recommendation/i);
    assert.match(synth.turn.body, /Reasoning/i);
    assert.match(synth.turn.body, /Expected impact/i);
    assert.match(synth.turn.body, /Risks/i);
    assert.match(synth.turn.body, /Confidence/i);
    assert.match(synth.turn.body, /Participants/i);
    assert.match(synth.turn.body, /Emma/i);
    assert.equal(synth.synthesis.confidence, 78);
    assert.ok(synth.synthesis.participatingEmployees.some((p) => p.id === "emma"));
    assert.ok(synth.synthesis.dataCaveat);
    assert.match(synth.turn.body, /internal signals|demo signals|connectors were not read|was not read/i);
  });

  it("does not claim live reads when connectors are disconnected", () => {
    const parts = buildOwnerSynthesisParts({
      ownerEmployeeId: "emma",
      baseRecommendation: "Recommend sending the proposal email before 3 PM.",
      discussion: [],
      invitedEmployeeIds: [],
      liveData: defaultLiveDataAvailability({
        gmailConnected: false,
        calendarConnected: false,
        driveConnected: false,
        crmConnected: false,
      }),
    });
    assert.ok(parts.dataCaveat);
    assert.match(parts.dataCaveat!, /not read|internal|demo signals/i);
    assert.equal(/actually read|fetched from gmail|opened the inbox/i.test(parts.reasoningSummary), false);

    const contrib = buildDomainContributionParts("emma", {
      liveData: defaultLiveDataAvailability({ gmailConnected: false }),
    });
    assert.match(formatContributionBody(contrib), /unavailable|internal signals/i);
  });
});

describe("discussion quality — invite path preserves ownership and chronology", () => {
  it("keeps owner fixed, adds domain-only invited turns in order", () => {
    const signals = detectProactiveSignals({
      missions: [],
      pendingApprovals: [],
      now: "2026-07-30T05:00:00.000Z",
    });
    const recs = buildRecommendationsFromDiscussions(signals, "2026-07-30T05:00:00.000Z");
    const sales = recs.find((r) => r.leadEmployeeId === "sarah");
    assert.ok(sales);
    const ownerId = sales!.conversationOwnerId ?? sales!.leadEmployeeId;

    const withDavid = inviteToRecommendationDiscussion(
      sales!,
      "david",
      "2026-07-30T05:01:00.000Z"
    );
    assert.equal(withDavid.conversationOwnerId, ownerId);
    const davidTurn = withDavid.internalDiscussion.find((t) => t.employeeId === "david");
    assert.ok(davidTurn);
    assert.match(davidTurn!.body, DOMAIN_EXPECT.david);
    assert.ok(countSentences(davidTurn!.body) <= 3);
    assert.equal(isGenericContribution(davidTurn!.body), false);

    const withEmma = inviteToRecommendationDiscussion(
      withDavid,
      "emma",
      "2026-07-30T05:02:00.000Z"
    );
    assert.equal(withEmma.conversationOwnerId, ownerId);
    const emmaTurn = withEmma.internalDiscussion.find((t) => t.employeeId === "emma");
    assert.ok(emmaTurn);
    assert.match(emmaTurn!.body, DOMAIN_EXPECT.emma);
    assert.equal(repeatsPriorDiscussion(emmaTurn!.body, [davidTurn!.body]), false);

    for (let i = 1; i < withEmma.internalDiscussion.length; i++) {
      assert.ok(
        Date.parse(withEmma.internalDiscussion[i].at) >=
          Date.parse(withEmma.internalDiscussion[i - 1].at)
      );
    }

    const closed = synthesizeRecommendationDiscussion(
      withEmma,
      "2026-07-30T05:03:00.000Z"
    );
    assert.equal(closed.status, sales!.status);
    assert.equal(closed.conversationOwnerId, ownerId);
    const last = closed.internalDiscussion[closed.internalDiscussion.length - 1];
    assert.equal(last.employeeId, ownerId);
    assert.match(last.body, /Recommendation|Confidence|Participants/i);
    assert.ok(closed.confidence >= 40 && closed.confidence <= 96);
  });
});

describe("discussion quality — synthesis formatter", () => {
  it("formats structured synthesis without inventing live connector reads", () => {
    const parts = buildOwnerSynthesisParts({
      ownerEmployeeId: "alex",
      baseRecommendation: "Recommend rescheduling tomorrow's meeting to clear the conflict.",
      discussion: [
        {
          id: "t1",
          employeeId: "mia",
          employeeName: "Mia",
          role: "Meeting Manager",
          body: "Agenda gap observed. Implication noted. Action assigned.",
          at: "2026-07-30T06:00:00.000Z",
          kind: "handoff",
        },
      ],
      invitedEmployeeIds: ["mia"],
      liveData: defaultLiveDataAvailability({ calendarConnected: false }),
      confidence: 81,
    });
    const body = formatOwnerSynthesisBody("Alex", parts);
    assert.match(body, /Recommendation/);
    assert.match(body, /81%/);
    assert.match(body, /Mia/);
    assert.match(body, /not read|internal|demo signals/i);
  });
});
