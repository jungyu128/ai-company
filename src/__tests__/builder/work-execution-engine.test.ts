/**
 * Work Execution Engine — lifecycle from recorded daily-ops / WorkPilot state only.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyCeoDailyOpsAction,
  buildProposedPlan,
  normalizeDailyWorkItem,
} from "@/services/builder/daily-ops";
import {
  buildWorkExecutionEngineView,
  getWorkExecutionEngineView,
} from "@/services/builder/work-execution-engine";
import type { DailyDirective } from "@/services/builder/daily-ops/types";

describe("Work Execution Engine", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "work-exec-engine-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("proposed work items include full execution fields", () => {
    const directive: DailyDirective = {
      id: "dir-1",
      organizationId: "default",
      date: "2026-08-01",
      title: "Ship Work Execution Engine",
      instruction: "Implement lifecycle monitor for CEO directives",
      intendedOutcome: "CEO can monitor directive → deploy-ready",
      constraints: [],
      priority: "P1",
      status: "ANALYZING",
      createdBy: "ceo",
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-08-01T10:00:00.000Z",
      activePlanId: null,
      paused: false,
      analysisNotes: null,
      clarifiedOutcome: null,
    };
    const plan = buildProposedPlan({
      directive,
      planVersion: 1,
      now: "2026-08-01T10:00:00.000Z",
    });
    assert.ok(plan.proposedWorkItems.length >= 5);
    for (const w of plan.proposedWorkItems) {
      assert.ok(w.objective);
      assert.ok(w.assignedEmployeeId);
      assert.ok(Array.isArray(w.dependencies));
      assert.ok(w.acceptanceCriteria.length >= 1);
      assert.ok(w.implementationPlan.length >= 1);
      assert.ok(w.affectedModules.length >= 1);
      assert.ok(["S", "M", "L"].includes(w.estimatedEffort));
      assert.ok(w.risks.length >= 1);
      assert.ok(w.testPlan.length >= 1);
      assert.ok(w.reviewOwnerId);
      assert.ok(w.qaOwnerId);
      assert.equal(w.executionPermission, "DENIED");
    }
  });

  it("does not fabricate work when no directive is recorded", () => {
    const view = buildWorkExecutionEngineView({
      generatedAt: "2026-08-01T12:00:00.000Z",
      generatedAtDisplay: "Aug 1",
      directive: null,
      plan: null,
      brainPrioritized: false,
      executiveRecommendationPresent: false,
      approvalPendingCount: 0,
      protectedPendingCount: 0,
      workpilot: [],
    });
    assert.equal(view.hasRecordedWork, false);
    assert.equal(view.workItems.length, 0);
    assert.equal(view.stages[0]!.status, "not_started");
    assert.match(view.summary, /No recorded CEO directive/i);
  });

  it("projects full lifecycle stages from a real submitted directive + plan", () => {
    const submitted = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Lifecycle engine",
        instruction: "Build Work Execution Engine monitor",
        intendedOutcome: "CEO sees directive to deployment-ready",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T14:00:00.000Z",
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const analyzed = applyCeoDailyOpsAction({
      action: {
        action: "analyze_and_propose",
        directiveId: submitted.snapshot.today!.id,
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T14:05:00.000Z",
    });
    assert.equal(analyzed.ok, true);

    const view = getWorkExecutionEngineView({
      repoRoot: tmp,
      now: "2026-08-01T14:10:00.000Z",
      brainPrioritized: true,
      executiveRecommendationPresent: true,
      approvalPendingCount: 3,
      protectedPendingCount: 1,
    });

    assert.equal(view.hasRecordedWork, true);
    assert.ok(view.directive);
    assert.ok(view.plan);
    assert.ok(view.workItems.length >= 5);
    assert.equal(view.stages.length, 14);
    assert.equal(view.stages[0]!.id, "ceo_directive");
    assert.equal(view.stages[0]!.status, "completed");
    assert.equal(view.stages.find((s) => s.id === "task_breakdown")!.status, "completed");
    assert.equal(
      view.stages.find((s) => s.id === "ceo_approval")!.status,
      "waiting_ceo"
    );
    assert.ok(view.collaborationNotes.length >= 1);

    const sample = view.workItems[0]!;
    assert.ok(sample.objective);
    assert.ok(sample.implementationPlan.length >= 1);
    assert.ok(sample.testPlan.length >= 1);
    assert.ok(sample.reviewOwnerName);
    assert.ok(sample.qaOwnerName);
  });

  it("normalizes legacy work items without inventing progress", () => {
    const legacy = normalizeDailyWorkItem({
      id: "w1",
      directiveId: "d1",
      planId: "p1",
      title: "Legacy item",
      objective: "Do the thing",
      assignedEmployeeId: "alex",
      permanentRole: "Frontend Engineer",
      reasonForAssignment: "FE",
      status: "WORKING",
      priority: "P2",
      dependencies: [],
      currentStep: "Implementing",
      progress: 45,
      expectedOutput: "UI",
      acceptanceCriteria: ["Works"],
      requiredReviewers: ["olivia", "emma"],
      approvalState: "approved",
      executionPermission: "GRANTED",
      startedAt: "2026-08-01T10:00:00.000Z",
      completedAt: null,
      blockedReason: null,
      nextAction: "Continue",
      pendingProtectedAction: null,
      pendingProtectedReason: null,
      outputs: [],
      changedFiles: ["src/a.tsx"],
      lastExecutionKey: null,
    } as ReturnType<typeof normalizeDailyWorkItem>);

    assert.equal(legacy.progress, 45);
    assert.deepEqual(legacy.changedFiles, ["src/a.tsx"]);
    assert.ok(legacy.implementationPlan.length >= 1);
    assert.equal(legacy.reviewOwnerId, "olivia");
    assert.equal(legacy.qaOwnerId, "emma");
  });

  it("never marks deployment_ready completed automatically", () => {
    const view = buildWorkExecutionEngineView({
      generatedAt: "2026-08-01T12:00:00.000Z",
      generatedAtDisplay: "Aug 1",
      directive: null,
      plan: null,
      brainPrioritized: true,
      executiveRecommendationPresent: true,
      approvalPendingCount: 0,
      protectedPendingCount: 0,
      workpilot: [
        {
          id: "wp1",
          title: "PR package",
          status: "succeeded",
          branchName: "feat/x",
          prUrl: "https://example.com/pr/1",
          testSummary: "3 passed / 0 failed of 3",
        },
      ],
    });
    const deploy = view.stages.find((s) => s.id === "deployment_ready")!;
    assert.notEqual(deploy.status, "completed");
    assert.equal(view.deploymentReady, false);
  });
});
