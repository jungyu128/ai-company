import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyRecommendationDecision,
  buildExecutiveBrief,
  buildRecommendationsFromDiscussions,
  detectProactiveSignals,
  formInternalDiscussions,
  scoreRecommendationConfidence,
} from "@/services/builder/proactive.logic";
import {
  decideProactiveRecommendation,
  scanProactiveIntelligence,
} from "@/services/builder/proactive.service";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import { upsertCollaboration } from "@/services/builder/collaboration.store";

describe("proactive detection", () => {
  it("detects domain signals for email, calendar, sales, and documents", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-PRO-001",
      title: "Sales pipeline proposal email",
      mission:
        "Review sales opportunity, prepare proposal document, and send follow-up email about inactive customer risk",
      leadEmployeeId: "sarah",
      planSummary: "Sales pack",
      planSteps: ["Analyze"],
      now: "2026-07-21T12:00:00.000Z",
    });

    const signals = detectProactiveSignals({
      missions: [mission],
      pendingApprovals: [],
      now: "2026-07-21T12:00:00.000Z",
    });

    const employees = new Set(signals.map((s) => s.employeeId));
    assert.ok(employees.has("emma") || signals.some((s) => /email/i.test(s.title)));
    assert.ok(employees.has("sarah"));
    assert.ok(employees.has("david") || signals.some((s) => /document/i.test(s.title)));
    assert.ok(signals.some((s) => s.kind === "unanswered_email" || s.kind === "urgent_email" || s.kind === "follow_up"));
    assert.ok(signals.some((s) => s.employeeId === "alex"));
  });
});

describe("internal discussion before CEO notify", () => {
  it("assigns Sarah as owner and only lets her speak until others are invited", () => {
    const signals = detectProactiveSignals({
      missions: [],
      pendingApprovals: [],
      now: "2026-07-21T12:00:00.000Z",
    });
    const clusters = formInternalDiscussions(signals, "2026-07-21T12:00:00.000Z");
    const sales = clusters.find((c) => c.leadEmployeeId === "sarah");
    assert.ok(sales);
    assert.deepEqual(sales!.participants, ["sarah"]);
    assert.ok(sales!.suggestedInvitees.includes("david"));
    assert.ok(sales!.suggestedInvitees.includes("emma"));
    assert.equal(sales!.discussion.length, 1);
    assert.equal(sales!.discussion[0].employeeId, "sarah");
    assert.equal(sales!.discussion.some((d) => d.employeeId === "david"), false);
    assert.equal(sales!.discussion.some((d) => d.employeeId === "emma"), false);
    assert.match(sales!.discussion[0].body, /ownership|recommend/i);

    const recs = buildRecommendationsFromDiscussions(signals, "2026-07-21T12:00:00.000Z");
    assert.ok(recs.length > 0);
    assert.ok(recs.every((r) => r.internalDiscussion.length >= 1));
    assert.ok(recs.every((r) => r.status === "pending"));
    const salesRec = recs.find((r) => r.leadEmployeeId === "sarah");
    assert.ok(salesRec);
    assert.equal(salesRec!.conversationOwnerId, "sarah");
    assert.deepEqual(salesRec!.invitedEmployeeIds, []);
  });
});

describe("confidence scoring", () => {
  it("returns confidence, reasoning, and expected impact", () => {
    const scored = scoreRecommendationConfidence({
      severity: 4,
      participantCount: 3,
      hasMissionSource: true,
      category: "opportunity",
    });
    assert.ok(scored.confidence >= 40 && scored.confidence <= 96);
    assert.match(scored.reasoning, /severity|employees|mission|Category/i);
    assert.ok(scored.expectedImpact.length > 10);
  });
});

describe("executive briefing", () => {
  it("includes priorities, risks, opportunities, approvals, actions, assignments", () => {
    const signals = detectProactiveSignals({
      missions: [],
      pendingApprovals: [
        {
          id: "TASK-AP-1",
          title: "Approve email draft",
          mission: "Send email",
          requestingEmployee: { id: "emma", name: "Emma", role: "Email Manager" },
          collaborationChain: [],
          conversations: [],
          planSummary: "Send",
          planSteps: ["Draft"],
          approvalStatus: "pending",
          ceoNote: null,
          createdAt: "2026-07-21T12:00:00.000Z",
          updatedAt: "2026-07-21T12:00:00.000Z",
        },
      ],
      now: "2026-07-21T12:00:00.000Z",
    });
    const recs = buildRecommendationsFromDiscussions(signals, "2026-07-21T12:00:00.000Z");
    const brief = buildExecutiveBrief({
      recommendations: recs,
      pendingApprovals: [
        {
          id: "TASK-AP-1",
          title: "Approve email draft",
          mission: "Send email",
          requestingEmployee: { id: "emma", name: "Emma", role: "Email Manager" },
          collaborationChain: [],
          conversations: [],
          planSummary: "Send",
          planSteps: ["Draft"],
          approvalStatus: "pending",
          ceoNote: null,
          createdAt: "2026-07-21T12:00:00.000Z",
          updatedAt: "2026-07-21T12:00:00.000Z",
        },
      ],
      generatedAtDisplay: "2026-07-21 21:00",
    });

    assert.ok(brief.headline.length > 0);
    assert.ok(Array.isArray(brief.highestPriorities));
    assert.ok(Array.isArray(brief.risks));
    assert.ok(Array.isArray(brief.opportunities));
    assert.ok(brief.pendingApprovals.includes("Approve email draft"));
    assert.ok(brief.suggestedActions.length >= 0);
    assert.ok(Array.isArray(brief.recommendedAssignments));
  });
});

describe("CEO recommendation actions", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-proactive-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
    const mission = planCollaborationChain({
      missionId: "TASK-PRO-REASSIGN",
      title: "Calendar conflict brief",
      mission: "Resolve schedule conflict and prepare meeting notes",
      leadEmployeeId: "alex",
      planSummary: "Calendar",
      planSteps: ["Detect"],
      now: "2026-07-21T13:00:00.000Z",
    });
    upsertCollaboration(mission, tmp);
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("supports approve, reject, ask, reassign, and delay", async () => {
    const scanned = scanProactiveIntelligence({
      repoRoot: tmp,
      now: "2026-07-21T13:00:00.000Z",
    });
    assert.ok(scanned.recommendations.length > 0);
    const target = scanned.recommendations[0];

    const approved = applyRecommendationDecision(target, {
      action: "approve",
      note: "Go",
      now: "2026-07-21T13:05:00.000Z",
    });
    assert.equal(approved.status, "approved");

    const rejected = applyRecommendationDecision(target, {
      action: "reject",
      now: "2026-07-21T13:06:00.000Z",
    });
    assert.equal(rejected.status, "rejected");

    const asked = applyRecommendationDecision(target, {
      action: "ask",
      note: "Which customer?",
      now: "2026-07-21T13:07:00.000Z",
    });
    assert.equal(asked.status, "questioned");
    assert.ok(asked.internalDiscussion.some((t) => t.employeeId === "ceo"));
    const ownerId = asked.conversationOwnerId ?? asked.leadEmployeeId;
    const afterCeo = asked.internalDiscussion.filter((t) => {
      const ceoIdx = asked.internalDiscussion.findIndex((x) => x.employeeId === "ceo" && /Which customer/i.test(x.body));
      const idx = asked.internalDiscussion.indexOf(t);
      return ceoIdx >= 0 && idx > ceoIdx;
    });
    assert.ok(afterCeo.length >= 1);
    assert.equal(afterCeo[0].employeeId, ownerId);
    assert.equal(
      afterCeo.some(
        (t) =>
          t.employeeId !== "ceo" &&
          t.employeeId !== "system" &&
          t.employeeId !== ownerId &&
          !asked.invitedEmployeeIds?.includes(String(t.employeeId))
      ),
      false
    );
    assert.equal(
      afterCeo.some((t) => /Which customer\?/i.test(t.body) && t.employeeId !== "ceo"),
      false
    );

    const reassigned = applyRecommendationDecision(target, {
      action: "reassign",
      reassignToEmployeeId: "mia",
      now: "2026-07-21T13:08:00.000Z",
    });
    assert.equal(reassigned.status, "reassigned");
    assert.equal(reassigned.leadEmployeeId, "mia");
    assert.equal(reassigned.reassignedToEmployeeId, "mia");

    const delayed = applyRecommendationDecision(target, {
      action: "delay",
      delayUntil: "2026-07-22T13:00:00.000Z",
      now: "2026-07-21T13:09:00.000Z",
    });
    assert.equal(delayed.status, "delayed");
    assert.equal(delayed.delayedUntil, "2026-07-22T13:00:00.000Z");

    const viaService = await decideProactiveRecommendation({
      recommendationId: target.id,
      action: "reassign",
      reassignToEmployeeId: "emma",
      repoRoot: tmp,
    });
    assert.equal(viaService.ok, true);
    if (viaService.ok) {
      assert.equal(viaService.recommendation.leadEmployeeId, "emma");
    }
  });
});
