/**
 * Strict employee message routing — only the addressed employee may answer.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canEmployeeParticipate,
  canEmployeeRespondToCeoMessage,
  resolveMissionOwnerFromCeoText,
  resolveStrictMessageRoute,
  withOwnerInvites,
} from "@/services/builder/employee-message-routing.logic";
import { resolveExplicitCeoAddressee } from "@/services/builder/ceo-discussion-orchestration.logic";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import {
  applyRecommendationDecision,
  buildRecommendationsFromDiscussions,
  detectProactiveSignals,
} from "@/services/builder/proactive.logic";
import { sendHqChatMessage } from "@/services/builder/hq-chat.service";
import { getChatThread } from "@/services/builder/hq-chat.store";
import { proposeDevTask } from "@/services/builder/autonomous-company/autonomy.logic";

function salesRec(now = "2026-08-01T10:00:00.000Z") {
  const signals = detectProactiveSignals({
    missions: [],
    pendingApprovals: [],
    now,
  });
  const recs = buildRecommendationsFromDiscussions(signals, now);
  const sales = recs.find((r) => r.leadEmployeeId === "sarah");
  assert.ok(sales, "expected Sarah-owned sales recommendation");
  return sales!;
}

describe("strict employee message routing", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "strict-route-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("detects Alex, Noah, and Sarah only when explicitly addressed", () => {
    assert.equal(resolveExplicitCeoAddressee("Alex, review the frontend PR."), "alex");
    assert.equal(resolveExplicitCeoAddressee("@Noah please harden the AI eval."), "noah");
    assert.equal(resolveExplicitCeoAddressee("Hey Sarah, clarify acceptance criteria."), "sarah");
    assert.equal(resolveExplicitCeoAddressee("Ask Noah to lead the AI plan."), "noah");

    // Incidental name mentions must not hijack ownership
    assert.equal(
      resolveExplicitCeoAddressee(
        "Please compare this plan with Alex on the side notes later."
      ),
      null
    );
    assert.equal(
      resolveExplicitCeoAddressee("Noah mentioned this last week in standup."),
      null
    );
    assert.equal(
      resolveExplicitCeoAddressee("Sarah's prior note is attached for context."),
      null
    );
  });

  it("lets only the addressed employee respond; others cannot intercept", () => {
    for (const [message, owner, blocked] of [
      ["Alex, ship the UI polish today.", "alex", ["noah", "sarah", "emma"]],
      ["Noah, evaluate the model safety gates.", "noah", ["alex", "sarah", "emma"]],
      ["Sarah, rewrite the acceptance criteria.", "sarah", ["alex", "noah", "emma"]],
    ] as const) {
      const route = resolveStrictMessageRoute({
        ceoMessage: message,
        currentOwnerEmployeeId: "emma",
        currentLeadEmployeeId: "emma",
      });
      assert.equal(route.ownerEmployeeId, owner);
      assert.equal(route.addressedEmployeeId, owner);
      assert.equal(route.ownershipMode, "strict");
      assert.equal(canEmployeeRespondToCeoMessage(route, owner), true);
      for (const id of blocked) {
        assert.equal(
          canEmployeeRespondToCeoMessage(route, id),
          false,
          `${id} must not answer when ${owner} is addressed`
        );
      }
    }
  });

  it("makes the addressed employee the mission owner and keeps chain strict", () => {
    const ownership = resolveMissionOwnerFromCeoText(
      "Alex, implement the onboarding polish and prepare for QA ship.",
      { preferredEmployeeId: "sarah" }
    );
    assert.equal(ownership.ownerEmployeeId, "alex");
    assert.equal(ownership.ownershipMode, "strict");

    const chain = planCollaborationChain({
      missionId: "TASK-route-1",
      title: "Onboarding polish",
      mission: "Alex, implement the onboarding polish and prepare for QA ship.",
      leadEmployeeId: "alex",
      planSummary: "UI polish",
      planSteps: ["Implement", "QA"],
      ownershipMode: "strict",
    });
    assert.equal(chain.leadEmployeeId, "alex");
    assert.equal(chain.chain[0]?.employeeId, "alex");
    // Soft collaborators (e.g. default peers) must not auto-join; QA may as dependency.
    assert.equal(
      chain.chain.some((s) => s.employeeId === "sarah"),
      false
    );
    assert.equal(
      chain.chain.some((s) => s.employeeId === "noah"),
      false
    );
  });

  it("routes recommendation ask so only Alex answers first; Sarah/Noah stay silent until invited", () => {
    const sales = salesRec();
    const asked = applyRecommendationDecision(sales, {
      action: "ask",
      note: "Alex, explain the UI risk before I approve.",
      now: "2026-08-01T10:05:00.000Z",
    });

    assert.equal(asked.conversationOwnerId, "alex");
    assert.equal(asked.leadEmployeeId, "alex");

    const ceoIdx = asked.internalDiscussion.findIndex((t) => t.employeeId === "ceo");
    const afterCeo = asked.internalDiscussion.slice(ceoIdx + 1);
    const firstEmployee = afterCeo.find(
      (t) => t.employeeId !== "ceo" && t.employeeId !== "system"
    );
    assert.ok(firstEmployee);
    assert.equal(firstEmployee!.employeeId, "alex");

    // Without collaboration request, Sarah and Noah must not speak after the ask.
    assert.equal(
      afterCeo.some((t) => t.employeeId === "sarah"),
      false
    );
    assert.equal(
      afterCeo.some((t) => t.employeeId === "noah"),
      false
    );
  });

  it("preserves autonomous collaboration after ownership via owner invites", () => {
    const route = resolveStrictMessageRoute({
      ceoMessage: "Noah, harden evaluation before ship.",
      currentOwnerEmployeeId: "sarah",
    });
    assert.equal(route.ownerEmployeeId, "noah");
    assert.equal(canEmployeeParticipate(route, "emma"), true); // QA dependency for ship
    assert.equal(canEmployeeParticipate(route, "sarah"), false);

    const expanded = withOwnerInvites(route, ["olivia"]);
    assert.equal(canEmployeeParticipate(expanded, "olivia"), true);
    assert.equal(canEmployeeRespondToCeoMessage(expanded, "olivia"), false);
  });

  it("routes HQ chat to the addressed owner even if another thread was selected", () => {
    const result = sendHqChatMessage({
      employeeId: "sarah",
      message: "Alex, what is blocking the frontend slice?",
      repoRoot: tmp,
      now: "2026-08-01T10:10:00.000Z",
      clientRequestId: "route-chat-1",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.employeeMessage.employeeId, "alex");
    assert.equal(result.ceoMessage.employeeId, "alex");

    const alexThread = getChatThread("alex", tmp);
    assert.ok(alexThread.messages.some((m) => m.id === result.ceoMessage.id));

    const sarahThread = getChatThread("sarah", tmp);
    assert.equal(
      sarahThread.messages.some((m) => m.id === result.ceoMessage.id),
      false
    );
  });

  it("assigns Live Work / work items to the addressed owner", () => {
    const ownership = resolveMissionOwnerFromCeoText(
      "Noah, own the AI evaluation work item this sprint."
    );
    const task = proposeDevTask({
      title: "AI evaluation hardening",
      description: "Noah, own the AI evaluation work item this sprint.",
      ownerEmployeeId: ownership.ownerEmployeeId,
      now: "2026-08-01T10:15:00.000Z",
    });
    assert.equal(task.ownerEmployeeId, "noah");
    assert.equal(task.ownerEmployeeId === "alex", false);
    assert.equal(task.ownerEmployeeId === "sarah", false);
  });
});
