/**
 * Sprint 1 Part 4 — CEO addressee routing, visible invites, participant integrity.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildNaturalOwnerOpening,
  buildReassignmentEventTurn,
  containsInternalRoutingLanguage,
  deriveParticipantsFromConversationTurns,
  detectCollaborationRequest,
  isExplicitCeoReassignment,
  resolveExplicitCeoAddressee,
  selectRelevantDiscussionParticipants,
  validateDiscussionParticipantIntegrity,
} from "@/services/builder/ceo-discussion-orchestration.logic";
import {
  applyRecommendationDecision,
  buildRecommendationsFromDiscussions,
  detectProactiveSignals,
} from "@/services/builder/proactive.logic";
import {
  assertContributionQuality,
  countSentences,
  formatOwnerSynthesisBody,
  isGenericContribution,
} from "@/services/builder/discussion-quality.logic";
import { resolveConversationOwner } from "@/services/builder/conversation-routing.logic";

const ACCEPTANCE_ASK = `Alex, before I approve this recommendation, explain your reasoning in detail.
If needed, invite the relevant employees to provide their domain-specific input,
then present one final recommendation with your confidence level and any risks.`;

function salesRec(now = "2026-07-30T08:00:00.000Z") {
  const signals = detectProactiveSignals({
    missions: [],
    pendingApprovals: [],
    now,
  });
  const recs = buildRecommendationsFromDiscussions(signals, now);
  const sales = recs.find((r) => r.leadEmployeeId === "sarah");
  assert.ok(sales, "expected a Sarah-owned sales recommendation");
  return sales!;
}

describe("Part 4 — explicit CEO addressee routing", () => {
  it("reassigns from Sarah to Alex when CEO addresses Alex; Sarah does not answer first", () => {
    const sales = salesRec();
    assert.equal(
      resolveConversationOwner({
        conversationOwnerId: sales.conversationOwnerId,
        leadEmployeeId: sales.leadEmployeeId,
      }),
      "sarah"
    );

    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: ACCEPTANCE_ASK,
      now: "2026-07-30T08:05:00.000Z",
    });

    assert.equal(asked.conversationOwnerId, "alex");
    assert.equal(asked.leadEmployeeId, "sarah"); // backward-compatible lead preserved

    const ceoIdx = asked.internalDiscussion.findIndex(
      (t) => t.employeeId === "ceo" && /Alex,/i.test(t.body)
    );
    assert.ok(ceoIdx >= 0);
    const reassignIdx = asked.internalDiscussion.findIndex(
      (t) =>
        t.kind === "system" &&
        /reassigned from Sarah to Alex by CEO/i.test(t.body)
    );
    assert.ok(reassignIdx > ceoIdx);

    const afterReassign = asked.internalDiscussion.slice(reassignIdx + 1);
    const firstEmployee = afterReassign.find(
      (t) => t.employeeId !== "ceo" && t.employeeId !== "system"
    );
    assert.ok(firstEmployee);
    assert.equal(firstEmployee!.employeeId, "alex");
    assert.equal(
      afterReassign.find(
        (t) =>
          t.employeeId === "sarah" &&
          Date.parse(t.at) < Date.parse(firstEmployee!.at)
      ),
      undefined
    );
  });

  it("does not reassign when an employee name appears only incidentally", () => {
    assert.equal(
      resolveExplicitCeoAddressee(
        "Please compare this plan with Alex on the side notes later."
      ),
      null
    );
    assert.equal(
      isExplicitCeoReassignment(
        "Please compare this plan with Alex on the side notes later.",
        "sarah"
      ),
      false
    );

    const sales = salesRec("2026-07-30T08:10:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: "Please compare this plan with Alex on the side notes later.",
      now: "2026-07-30T08:11:00.000Z",
    });
    assert.equal(asked.conversationOwnerId, "sarah");
    assert.equal(
      asked.internalDiscussion.some((t) => /reassigned from/i.test(t.body)),
      false
    );
  });
});

describe("Part 4 — invite intent and visible contributions", () => {
  it("invites only relevant peers and every invited peer produces a visible turn", () => {
    assert.equal(detectCollaborationRequest(ACCEPTANCE_ASK), true);
    const peers = selectRelevantDiscussionParticipants({
      ownerEmployeeId: "alex",
      category: "opportunity",
      title: "Inactive customers to re-engage",
      recommendation: "Recommend contacting inactive accounts today.",
      ceoMessage: ACCEPTANCE_ASK,
      maxPeers: 2,
    });
    assert.ok(peers.length >= 1);
    assert.equal(peers.includes("alex"), false);

    const sales = salesRec("2026-07-30T08:20:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: ACCEPTANCE_ASK,
      now: "2026-07-30T08:21:00.000Z",
    });

    assert.equal(asked.conversationOwnerId, "alex");
    const inviteTurns = asked.internalDiscussion.filter((t) =>
      /invited .+ to the discussion/i.test(t.body)
    );
    assert.ok(inviteTurns.length >= 1);

    for (const invite of inviteTurns) {
      assert.equal(invite.employeeId, "system");
      assert.equal(invite.kind, "system");
      assert.equal(invite.employeeName, "System");
    }

    const peerContribs = asked.internalDiscussion.filter(
      (t) =>
        t.employeeId !== "alex" &&
        t.employeeId !== "ceo" &&
        t.employeeId !== "system" &&
        !/invited .+ to the discussion/i.test(t.body) &&
        t.kind === "handoff"
    );
    assert.ok(peerContribs.length >= 1);
    for (const c of peerContribs) {
      assert.ok(countSentences(c.body) <= 3, c.body);
      assert.equal(isGenericContribution(c.body), false);
      const quality = assertContributionQuality({
        body: c.body,
        employeeId: String(c.employeeId),
        priorBodies: [],
        ceoMessage: ACCEPTANCE_ASK,
      });
      assert.equal(quality.ok, true, `${c.employeeId}: ${quality.reasons.join(",")}`);
    }
  });
});

describe("Part 4 — participant integrity", () => {
  it("lists only employees with actual contributions; owner once", () => {
    const sales = salesRec("2026-07-30T08:30:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: ACCEPTANCE_ASK,
      now: "2026-07-30T08:31:00.000Z",
    });

    const derived = deriveParticipantsFromConversationTurns(
      asked.internalDiscussion,
      "alex"
    );
    assert.equal(derived.filter((p) => p.id === "alex").length, 1);
    assert.deepEqual(
      asked.participatingEmployees.map((p) => p.id).sort(),
      derived.map((p) => p.id).sort()
    );

    for (const p of asked.participatingEmployees) {
      if (p.id === "alex") continue;
      assert.ok(
        asked.internalDiscussion.some(
          (t) =>
            t.employeeId === p.id &&
            t.kind === "handoff" &&
            !/invited/i.test(t.body)
        ),
        `participant ${p.id} lacks contribution turn`
      );
    }

    const integrity = validateDiscussionParticipantIntegrity({
      participants: asked.participatingEmployees,
      turns: asked.internalDiscussion,
      ownerEmployeeId: "alex",
    });
    assert.equal(integrity.ok, true, integrity.reasons.join(","));

    // Invite announcement alone must not invent participants
    const inviteOnly = deriveParticipantsFromConversationTurns(
      [
        {
          id: "i1",
          employeeId: "system",
          employeeName: "System",
          role: "Coordinator",
          body: "Alex invited David to the discussion.",
          at: "2026-07-30T08:00:00.000Z",
          kind: "system",
        },
      ],
      "alex"
    );
    assert.deepEqual(
      inviteOnly.map((p) => p.id),
      ["alex"]
    );
  });
});

describe("Part 4 — chronology and natural language", () => {
  it("keeps CEO → reassignment → owner → invite → peer → synthesis order", () => {
    const sales = salesRec("2026-07-30T08:40:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: ACCEPTANCE_ASK,
      now: "2026-07-30T08:41:00.000Z",
    });
    const d = asked.internalDiscussion;
    for (let i = 1; i < d.length; i++) {
      assert.ok(Date.parse(d[i].at) >= Date.parse(d[i - 1].at));
    }

    const idx = {
      ceo: d.findIndex((t) => t.employeeId === "ceo"),
      reassign: d.findIndex((t) => /reassigned from Sarah to Alex/i.test(t.body)),
      alexOpen: d.findIndex(
        (t, i) =>
          i > 0 &&
          t.employeeId === "alex" &&
          t.kind === "update" &&
          !/invited/i.test(t.body) &&
          Date.parse(t.at) >= Date.parse(d.find((x) => /reassigned from Sarah to Alex/i.test(x.body))!.at)
      ),
      invite: d.findIndex((t) => /invited .+ to the discussion/i.test(t.body)),
      peer: -1,
      synth: d.findIndex((t) => t.employeeId === "alex" && t.kind === "request"),
    };
    idx.peer = d.findIndex(
      (t, i) =>
        i > idx.invite &&
        t.employeeId !== "alex" &&
        t.employeeId !== "ceo" &&
        t.employeeId !== "system" &&
        t.kind === "handoff" &&
        !/invited/i.test(t.body)
    );
    assert.ok(idx.ceo >= 0);
    assert.ok(idx.reassign > idx.ceo);
    assert.ok(idx.alexOpen > idx.reassign);
    assert.ok(idx.invite > idx.alexOpen);
    assert.ok(idx.peer > idx.invite);
    assert.ok(idx.synth > idx.peer);
  });

  it("avoids internal routing language and generic banned openings", () => {
    const opening = buildNaturalOwnerOpening({
      ownerEmployeeId: "alex",
      ceoMessage: ACCEPTANCE_ASK,
      willInvitePeers: true,
      peerNames: ["Sarah", "Emma"],
    });
    assert.equal(containsInternalRoutingLanguage(opening), false);
    assert.equal(/i own this thread/i.test(opening), false);

    const sales = salesRec("2026-07-30T08:50:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: ACCEPTANCE_ASK,
      now: "2026-07-30T08:51:00.000Z",
    });
    for (const t of asked.internalDiscussion) {
      if (t.employeeId === "ceo" || t.employeeId === "system") continue;
      assert.equal(containsInternalRoutingLanguage(t.body), false, t.body);
    }
  });
});

describe("Part 4 — final synthesis quality", () => {
  it("uses peer contributions, required fields, no severity score, one connector caveat", () => {
    const sales = salesRec("2026-07-30T09:00:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: ACCEPTANCE_ASK,
      now: "2026-07-30T09:01:00.000Z",
    });
    const last = asked.internalDiscussion[asked.internalDiscussion.length - 1];
    assert.equal(last.employeeId, "alex");
    assert.match(last.body, /^Alex:\nRecommendation\n/m);
    assert.match(last.body, /\nReasoning\n/);
    assert.match(last.body, /\nExpected Impact\n/);
    assert.match(last.body, /\nRisks\n/);
    assert.match(last.body, /\nMissing Information\n/);
    assert.match(last.body, /\nConfidence\n/);
    assert.match(last.body, /\nParticipants\n/);
    assert.match(last.body, /\nEvidence\n/);
    assert.equal(/severity\s*\d+\s*\/\s*\d+/i.test(last.body), false);
    assert.equal(/signal severity/i.test(last.body), false);
    assert.equal(last.body.includes(ACCEPTANCE_ASK), false);
    assert.equal(/closed after \d{2,} specialist/i.test(last.body), false);

    const caveatMatches = last.body.match(
      /Evidence is based on available internal and demo signals/g
    );
    assert.equal((caveatMatches ?? []).length, 1);

    // Peer names in participants must appear because they contributed
    for (const p of asked.participatingEmployees) {
      if (p.id === "alex") continue;
      assert.match(last.body, new RegExp(p.name, "i"));
    }
  });
});

describe("Part 4 — no collaboration needed and backward compatibility", () => {
  it("keeps owner-only discussion when no invite intent", () => {
    const sales = salesRec("2026-07-30T09:10:00.000Z");
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: "What is the single safest next step today?",
      now: "2026-07-30T09:11:00.000Z",
    });
    assert.equal(asked.conversationOwnerId, "sarah");
    assert.equal(
      asked.internalDiscussion.some((t) => /invited .+ to the discussion/i.test(t.body)),
      false
    );
    assert.deepEqual(
      asked.participatingEmployees.map((p) => p.id),
      ["sarah"]
    );
  });

  it("resolves missing conversationOwnerId via leadEmployeeId; approve still works", () => {
    const sales = salesRec("2026-07-30T09:20:00.000Z");
    const legacy = {
      ...sales,
      conversationOwnerId: undefined,
    };
    assert.equal(
      resolveConversationOwner({
        conversationOwnerId: legacy.conversationOwnerId,
        leadEmployeeId: legacy.leadEmployeeId,
      }),
      "sarah"
    );
    const asked = applyRecommendationDecision(legacy, {
      action: "ask",
      note: "Can you clarify timing?",
      now: "2026-07-30T09:21:00.000Z",
    });
    assert.equal(asked.conversationOwnerId, "sarah");

    const approved = applyRecommendationDecision(asked, {
      action: "approve",
      note: "Ship it",
      now: "2026-07-30T09:22:00.000Z",
    });
    assert.equal(approved.status, "approved");

    const reassigned = applyRecommendationDecision(sales, {
      action: "reassign",
      reassignToEmployeeId: "emma",
      now: "2026-07-30T09:23:00.000Z",
    });
    assert.equal(reassigned.conversationOwnerId, "emma");
    assert.equal(reassigned.status, "reassigned");
  });

  it("buildReassignmentEventTurn records chronological system event", () => {
    const turn = buildReassignmentEventTurn({
      conversationKey: "rec-x",
      fromOwnerId: "sarah",
      toOwnerId: "alex",
      now: "2026-07-30T09:30:00.000Z",
    });
    assert.equal(turn.kind, "system");
    assert.equal(turn.employeeId, "system");
    assert.match(turn.body, /Sarah/);
    assert.match(turn.body, /Alex/);
  });

  it("formatOwnerSynthesisBody does not duplicate connector caveat", () => {
    const body = formatOwnerSynthesisBody("Alex", {
      recommendation: "Reschedule the conflict.",
      reasoningSummary: "Calendar capacity is tight.",
      expectedImpact: "Fewer collisions.",
      risksOrUncertainty: "Timing may shift.",
      missingInformation: "Live calendar unread.",
      confidence: 80,
      confidenceExplanation: "Confidence is 80% based on domain review.",
      participatingEmployees: [{ id: "alex", name: "Alex", role: "Calendar Manager" }],
      dataCaveat:
        "Evidence is based on available internal and demo signals; connected email, calendar, document, and CRM data was not read.",
    });
    const matches = body.match(
      /Evidence is based on available internal and demo signals/g
    );
    assert.equal((matches ?? []).length, 1);
  });
});
