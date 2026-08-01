/**
 * Sprint 1 Part 1 — conversation ownership & routing.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendInvitedDomainContribution,
  buildOwnerOnlyDiscussion,
  createConversationOwnership,
  inviteEmployeeToConversation,
  isEchoOfCeoMessage,
  resolveConversationOwner,
  routeCeoQuestionToOwner,
  synthesizeOwnerRecommendation,
  transferConversationOwner,
} from "@/services/builder/conversation-routing.logic";
import {
  applyRecommendationDecision,
  buildRecommendationsFromDiscussions,
  detectProactiveSignals,
  inviteToRecommendationDiscussion,
  synthesizeRecommendationDiscussion,
} from "@/services/builder/proactive.logic";

describe("conversation ownership and routing", () => {
  it("makes the receiving employee the owner and only they answer first", () => {
    const owned = buildOwnerOnlyDiscussion({
      ownerEmployeeId: "emma",
      seedDetail: "Please handle unanswered emails",
      conversationKey: "conv-1",
      now: "2026-07-30T01:00:00.000Z",
      suggestedInvitees: ["sarah"],
    });
    assert.equal(owned.ownership.ownerEmployeeId, "emma");
    assert.deepEqual(owned.participants, ["emma"]);
    assert.equal(owned.discussion.length, 1);
    assert.equal(owned.discussion[0].employeeId, "emma");
    assert.ok(owned.suggestedInvitees.includes("sarah"));
  });

  it("routes CEO questions to the owner without echoing the CEO message", () => {
    const ceoMessage = "Which customer should we contact first?";
    const routed = routeCeoQuestionToOwner({
      ownerEmployeeId: "sarah",
      ceoMessage,
      conversationKey: "rec-1",
      now: "2026-07-30T01:00:00.000Z",
    });
    assert.equal(routed.ownerEmployeeId, "sarah");
    assert.equal(routed.turns.length, 2);
    assert.equal(routed.ceoTurn.body, ceoMessage);
    assert.equal(routed.ownerTurn.employeeId, "sarah");
    assert.equal(isEchoOfCeoMessage(ceoMessage, routed.ownerTurn.body), false);
    assert.equal(routed.ownerTurn.body.includes(ceoMessage), false);
  });

  it("allows invited employees to contribute only from their domain", () => {
    const ownership = createConversationOwnership("sarah");
    const invited = inviteEmployeeToConversation({
      ownership,
      inviteeEmployeeId: "david",
      invitedByEmployeeId: "sarah",
      conversationKey: "rec-2",
      now: "2026-07-30T01:01:00.000Z",
    });
    assert.deepEqual(invited.ownership.invitedEmployeeIds, ["david"]);
    assert.equal(invited.ownership.ownerEmployeeId, "sarah");
    assert.equal(invited.turn.employeeId, "system");
    assert.equal(invited.turn.kind, "system");
    assert.match(invited.turn.body, /Sarah invited David to the discussion/i);

    const contrib = appendInvitedDomainContribution({
      ownership: invited.ownership,
      employeeId: "david",
      conversationKey: "rec-2",
      now: "2026-07-30T01:01:15.000Z",
    });
    assert.ok(contrib);
    assert.equal(contrib!.employeeId, "david");
    assert.match(contrib!.body, /api|data|backend|contract|regress|implement|plan|work/i);
    assert.ok(contrib!.body.split(/(?<=[.!?])\s+/).filter(Boolean).length <= 3);

    assert.throws(() =>
      appendInvitedDomainContribution({
        ownership: invited.ownership,
        employeeId: "emma",
        conversationKey: "rec-2",
        now: "2026-07-30T01:01:20.000Z",
      })
    );

    assert.throws(() =>
      inviteEmployeeToConversation({
        ownership: invited.ownership,
        inviteeEmployeeId: "emma",
        invitedByEmployeeId: "david",
        conversationKey: "rec-2",
        now: "2026-07-30T01:01:30.000Z",
      })
    );
  });

  it("lets the owner synthesize one final recommendation for the CEO", () => {
    let ownership = createConversationOwnership("sarah");
    const invite = inviteEmployeeToConversation({
      ownership,
      inviteeEmployeeId: "emma",
      invitedByEmployeeId: "sarah",
      conversationKey: "rec-3",
      now: "2026-07-30T01:02:00.000Z",
    });
    ownership = invite.ownership;
    const contrib = appendInvitedDomainContribution({
      ownership,
      employeeId: "emma",
      conversationKey: "rec-3",
      now: "2026-07-30T01:02:15.000Z",
    });
    assert.ok(contrib);
    const synth = synthesizeOwnerRecommendation({
      ownership,
      discussion: [invite.turn, contrib!],
      baseRecommendation: "Recommend contacting inactive accounts today.",
      conversationKey: "rec-3",
      now: "2026-07-30T01:02:30.000Z",
    });
    assert.equal(synth.turn.employeeId, "sarah");
    assert.match(synth.turn.body, /Recommendation/i);
    assert.match(synth.turn.body, /Emma/i);
    assert.equal(synth.recommendation, "Recommend contacting inactive accounts today.");
    assert.ok(synth.synthesis.confidence >= 40);
  });

  it("never transfers ownership automatically; only explicit transfer", () => {
    const ownership = createConversationOwnership("alex");
    assert.equal(
      resolveConversationOwner({
        conversationOwnerId: ownership.ownerEmployeeId,
        leadEmployeeId: "alex",
      }),
      "alex"
    );
    const transferred = transferConversationOwner({
      ownership,
      newOwnerEmployeeId: "olivia",
    });
    assert.equal(transferred.ownerEmployeeId, "olivia");
    assert.equal(ownership.ownerEmployeeId, "alex");
  });

  it("preserves chronology when CEO asks and owner responds on a recommendation", () => {
    const signals = detectProactiveSignals({
      missions: [],
      pendingApprovals: [],
      now: "2026-07-30T02:00:00.000Z",
    });
    const recs = buildRecommendationsFromDiscussions(signals, "2026-07-30T02:00:00.000Z");
    const target = recs.find((r) => r.leadEmployeeId === "emma") ?? recs[0];
    const beforeLen = target.internalDiscussion.length;
    const asked = applyRecommendationDecision(target, {
      action: "ask",
      note: "What is the SLA risk?",
      now: "2026-07-30T02:05:00.000Z",
    });
    assert.ok(asked.internalDiscussion.length > beforeLen);
    for (let i = 1; i < asked.internalDiscussion.length; i++) {
      assert.ok(
        Date.parse(asked.internalDiscussion[i].at) >=
          Date.parse(asked.internalDiscussion[i - 1].at)
      );
    }
    const ceoTurn = asked.internalDiscussion.find((t) => /SLA risk/i.test(t.body));
    assert.ok(ceoTurn);
    assert.equal(ceoTurn!.employeeId, "ceo");
    const ownerReplies = asked.internalDiscussion.filter(
      (t) =>
        t.employeeId === (asked.conversationOwnerId ?? asked.leadEmployeeId) &&
        Date.parse(t.at) > Date.parse(ceoTurn!.at)
    );
    assert.ok(ownerReplies.length >= 1);
    assert.equal(ownerReplies.some((t) => /SLA risk/i.test(t.body)), false);
  });

  it("supports owner invite → domain contribute → synthesize on recommendations", () => {
    const signals = detectProactiveSignals({
      missions: [],
      pendingApprovals: [],
      now: "2026-07-30T03:00:00.000Z",
    });
    const recs = buildRecommendationsFromDiscussions(signals, "2026-07-30T03:00:00.000Z");
    const sales = recs.find((r) => r.leadEmployeeId === "sarah");
    assert.ok(sales);
    const withDavid = inviteToRecommendationDiscussion(sales!, "david", "2026-07-30T03:01:00.000Z");
    assert.ok(withDavid.invitedEmployeeIds?.includes("david"));
    assert.ok(withDavid.participatingEmployees.some((p) => p.id === "david"));
    assert.ok(withDavid.internalDiscussion.some((t) => t.employeeId === "david"));

    const closed = synthesizeRecommendationDiscussion(
      withDavid,
      "2026-07-30T03:02:00.000Z"
    );
    const last = closed.internalDiscussion[closed.internalDiscussion.length - 1];
    assert.equal(last.employeeId, "sarah");
    assert.match(last.body, /Recommendation|Confidence|Participants/i);
  });
});
