/**
 * AI Company Operating System v2 — closed loop + safety regression tests.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  hasRealWaitingReason,
  nextWorkStateV2,
  statusAfterCeoRejection,
  buildCeoBriefingV2,
  buildLiveEmployeesFromDailyOps,
  shouldEmitDeploymentReady,
  mapDailyItemToLiveEmployee,
  formatRealExecutionContext,
  looksLikeGenericConversationReply,
} from "@/services/builder/operating-system-v2";
import {
  submitDailyDirective,
  analyzeAndProposePlan,
  applyCeoDailyOpsAction,
  getDailyOpsSnapshot,
  advanceApprovedDailyWork,
} from "@/services/builder/daily-ops";
import { runOperatingSystemV2Cycle } from "@/services/builder/operating-system-v2";
import type { DailyOpsSnapshot } from "@/services/builder/daily-ops";

describe("OS v2 pure safety invariants", () => {
  it("never enters Waiting without a real dependency or CEO gate", () => {
    assert.equal(nextWorkStateV2("Reviewing"), "Working");
    assert.equal(
      nextWorkStateV2("Reviewing", { pendingCeoApproval: true }),
      "Waiting"
    );
    assert.equal(
      nextWorkStateV2("Reviewing", { dependencyIncomplete: true }),
      "Waiting"
    );
    assert.equal(hasRealWaitingReason({
      pendingCeoApproval: false,
      interrupted: false,
      dependencyIncomplete: false,
      blockedReason: null,
    }), false);
  });

  it("returns rejected work to Planning with explanation", () => {
    const rejected = statusAfterCeoRejection({
      action: "reject",
      note: "Scope wrong",
    });
    assert.equal(rejected.status, "PLANNING");
    assert.equal(rejected.executionPermission, "DENIED");
    assert.match(rejected.blockedReason, /Scope wrong|Planning/);

    const changes = statusAfterCeoRejection({
      action: "request_changes",
      note: "Add QA evidence",
    });
    assert.equal(changes.status, "PLANNING");
    assert.match(changes.blockedReason, /Add QA evidence/);
  });

  it("builds live employee state only from recorded daily-ops fields", () => {
    const live = mapDailyItemToLiveEmployee({
      employeeId: "alex",
      employeeName: "Alex",
      role: "Frontend Engineer",
      missionTitle: "Ship HQ OS v2",
      item: null,
      lastUpdate: "2026-08-01T00:00:00.000Z",
    });
    assert.equal(live.currentMission, "Ship HQ OS v2");
    assert.equal(live.currentTask, null);
    assert.equal(live.progress, 0);
    assert.equal(live.estimatedCompletion, null);
    assert.equal(
      shouldEmitDeploymentReady({
        workItemStatus: "COMPLETED",
        hasRecordedArtifacts: false,
        devopsReviewComplete: true,
      }),
      false
    );
  });

  it("builds CEO briefing from snapshot without inventing blockers", () => {
    const snapshot = {
      asOf: "2026-08-01T12:00:00.000Z",
      today: {
        id: "ddir-1",
        title: "Ship OS v2",
      },
      activePlan: {
        proposedWorkItems: [
          {
            id: "w1",
            title: "HQ briefing panel",
            status: "COMPLETED",
            assignedEmployeeId: "alex",
            progress: 100,
            currentStep: "Completed",
            dependencies: [],
            blockedReason: null,
            pendingProtectedAction: null,
            outputs: [],
            changedFiles: [],
            requiredReviewers: [],
          },
        ],
        risks: [{ id: "r1", summary: "Approval latency", severity: "medium", mitigation: "Queue", relatedWorkItemIds: [] }],
        approvalRequirements: [],
      },
      approvalQueue: [
        { id: "a1", summary: "Approve protected write", status: "pending" },
      ],
      employees: [
        {
          employeeId: "emma",
          employeeName: "Emma",
          role: "QA",
          waitingFor: "CEO protected action",
          workItemId: null,
        },
      ],
      blockers: [],
      recentAudit: [{ detail: "CEO approved plan v1" }],
      workSummary: {},
    } as unknown as DailyOpsSnapshot;

    const brief = buildCeoBriefingV2({
      snapshot,
      generatedAtDisplay: "오후 09:00",
      now: "2026-08-01T12:00:00.000Z",
    });
    assert.match(brief.headline, /OS v2/);
    assert.ok(brief.whatChanged.some((c) => /approved plan/i.test(c)));
    assert.equal(brief.currentBlockers.length, 0);
    assert.ok(brief.decisionsNeeded.length >= 1);
    assert.equal(brief.employeesWaiting[0]?.employeeId, "emma");
    assert.ok(brief.completedWork.includes("HQ briefing panel"));
    assert.ok(brief.recommendedNextAction);

    const live = buildLiveEmployeesFromDailyOps(snapshot);
    assert.ok(live.some((e) => e.employeeId === "emma"));
  });

  it("formats conversation context from recorded execution state only", () => {
    const text = formatRealExecutionContext({
      employeeName: "Alex",
      live: {
        employeeId: "alex",
        employeeName: "Alex",
        role: "Frontend Engineer",
        currentMission: "Ship OS v2",
        currentTask: "Briefing panel",
        currentStep: "Working",
        progress: 40,
        dependency: [],
        blocker: null,
        waitingReason: null,
        estimatedCompletion: null,
        lastUpdate: "2026-08-01T12:00:00.000Z",
        workItemId: "w1",
        status: "WORKING",
      },
    });
    assert.match(text, /Ship OS v2/);
    assert.match(text, /Briefing panel/);
    assert.match(text, /40%/);
    assert.equal(looksLikeGenericConversationReply("Sounds good"), true);
    assert.equal(
      looksLikeGenericConversationReply(
        "Working on Briefing panel — recorded step Working at 40%."
      ),
      false
    );
  });
});

describe("OS v2 closed loop — Daily Directive → advance → briefing", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "osv2-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("submits directive, proposes plan, advances only after CEO grant", () => {
    const submitted = submitDailyDirective({
      title: "Ship Operating System v2",
      instruction:
        "Build the closed-loop OS so Daily Directive drives execution with CEO approvals only.",
      intendedOutcome: "CEO briefing + live state from recorded work",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T01:00:00.000Z",
      date: "2026-08-01",
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const proposed = analyzeAndProposePlan({
      directiveId: submitted.directive.id,
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T01:01:00.000Z",
    });
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    assert.ok(proposed.plan.proposedWorkItems.length >= 1);
    assert.ok(proposed.plan.successCriteria.length >= 1);

    const beforeGrant = advanceApprovedDailyWork({
      directiveId: submitted.directive.id,
      actorUserId: "system",
      actorName: "OS v2",
      repoRoot: tmp,
      now: "2026-08-01T01:02:00.000Z",
    });
    assert.equal(beforeGrant.ok, true);
    if (beforeGrant.ok) {
      assert.equal(beforeGrant.advanced.length, 0);
    }

    const approved = applyCeoDailyOpsAction({
      action: {
        action: "approve_entire_plan",
        planId: proposed.plan.id,
        note: "Ship it",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T01:03:00.000Z",
    });
    assert.equal(approved.ok, true);

    const cycle = runOperatingSystemV2Cycle({
      repoRoot: tmp,
      now: "2026-08-01T01:04:00.000Z",
      syncLiveWork: false,
    });
    assert.equal(cycle.directiveId, submitted.directive.id);
    assert.ok(cycle.briefing.headline.length > 0);
    assert.ok(Array.isArray(cycle.liveEmployees));
    assert.ok(cycle.liveEmployees.every((e) => e.lastUpdate));
  });

  it("reject work item returns to Planning (not terminal REJECTED)", () => {
    const submitted = submitDailyDirective({
      title: "Reject path",
      instruction: "Plan a WorkPilot HQ improvement with acceptance criteria.",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T02:00:00.000Z",
      date: "2026-08-01",
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;
    const proposed = analyzeAndProposePlan({
      directiveId: submitted.directive.id,
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T02:01:00.000Z",
    });
    assert.equal(proposed.ok, true);
    if (!proposed.ok) return;
    const item = proposed.plan.proposedWorkItems[0]!;
    const rejected = applyCeoDailyOpsAction({
      action: {
        action: "reject_work_item",
        planId: proposed.plan.id,
        workItemId: item.id,
        note: "Needs clearer acceptance criteria",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T02:02:00.000Z",
    });
    assert.equal(rejected.ok, true);
    const snap = getDailyOpsSnapshot({
      repoRoot: tmp,
      date: "2026-08-01",
      now: "2026-08-01T02:03:00.000Z",
    });
    const updated = snap.activePlan?.proposedWorkItems.find((w) => w.id === item.id);
    assert.equal(updated?.status, "PLANNING");
    assert.equal(updated?.executionPermission, "DENIED");
    assert.match(updated?.blockedReason ?? "", /acceptance criteria|Planning/i);
  });
});
