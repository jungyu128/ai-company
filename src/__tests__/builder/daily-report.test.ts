/**
 * Daily Report — recorded state only; never fabricates completed work or files.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyCeoDailyOpsAction,
  buildDailyReportBody,
  recordWorkItemArtifacts,
} from "@/services/builder/daily-ops";
import { getDailyOpsStore, upsertPlan } from "@/services/builder/daily-ops/daily-ops.store";
import {
  dailyReportViewFromStored,
  getLatestDailyReportView,
} from "@/services/builder/daily-report";

describe("Daily Report", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daily-report-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("includes required sections and keeps completedWork empty until status is COMPLETED", () => {
    const start = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Daily report integrity",
        instruction: "Capture requirements for Daily Report without inventing results",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T16:00:00.000Z",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;

    const body = buildDailyReportBody({
      directive: start.snapshot.today!,
      plan: start.snapshot.activePlan!,
      now: "2026-07-31T16:00:00.000Z",
    });

    assert.equal(body.completedWork.length, 0);
    assert.ok(body.incompleteWork.length >= 1);
    assert.ok(Array.isArray(body.blockers));
    assert.ok(body.approvals.length >= 1);
    assert.ok(Array.isArray(body.reviews));
    assert.deepEqual(body.changedFiles, []);
    assert.ok(body.risks.length >= 1);
    assert.ok(body.nextRecommendations.length >= 1);
    assert.equal(body.integrity.source, "recorded_state_only");
  });

  it("lists changed files only after they are explicitly recorded", () => {
    const start = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Artifact recording",
        instruction: "Plan HQ reporting without deploying",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T16:10:00.000Z",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;

    const workId = start.snapshot.activePlan!.proposedWorkItems[0]!.id;
    const before = buildDailyReportBody({
      directive: start.snapshot.today!,
      plan: start.snapshot.activePlan!,
      now: "2026-07-31T16:10:00.000Z",
    });
    assert.deepEqual(before.changedFiles, []);

    // Completing without recording files still yields empty changedFiles.
    applyCeoDailyOpsAction({
      action: {
        action: "approve_entire_plan",
        planId: start.snapshot.activePlan!.id,
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });

    const recorded = recordWorkItemArtifacts({
      workItemId: workId,
      changedFiles: [
        "src/features/builder/components/daily-report-panel.tsx",
      ],
      outputs: ["DailyReportPanel shipped"],
      repoRoot: tmp,
    });
    assert.equal(recorded.ok, true);

    // Mark that item COMPLETED in store so report can include its files.
    const store = getDailyOpsStore(tmp);
    const plan = store.plans.find((p) => p.id === start.snapshot.activePlan!.id)!;
    const items = plan.proposedWorkItems.map((w) =>
      w.id === workId
        ? {
            ...w,
            status: "COMPLETED" as const,
            progress: 100,
            completedAt: "2026-07-31T16:12:00.000Z",
          }
        : w
    );
    upsertPlan({ ...plan, proposedWorkItems: items }, tmp);

    const afterPlan = getDailyOpsStore(tmp).plans.find((p) => p.id === plan.id)!;
    const body = buildDailyReportBody({
      directive: start.snapshot.today!,
      plan: afterPlan,
      now: "2026-07-31T16:12:00.000Z",
    });
    assert.ok(body.completedWork.some((w) => w.id === workId));
    assert.deepEqual(body.changedFiles, [
      "src/features/builder/components/daily-report-panel.tsx",
    ]);
    assert.ok(
      body.completedWork
        .find((w) => w.id === workId)!
        .outputs.includes("DailyReportPanel shipped")
    );
  });

  it("files Daily Report on complete_directive without inventing completed work", () => {
    const start = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "File report",
        instruction: "Write product notes for Daily Report UX",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T16:20:00.000Z",
    });
    assert.equal(start.ok, true);
    if (!start.ok) return;

    const done = applyCeoDailyOpsAction({
      action: {
        action: "complete_directive",
        directiveId: start.snapshot.today!.id,
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T16:21:00.000Z",
    });
    assert.equal(done.ok, true);
    if (!done.ok) return;

    const view = getLatestDailyReportView({ repoRoot: tmp });
    assert.ok(view);
    assert.equal(view!.body.completedWork.length, 0);
    assert.ok(view!.body.incompleteWork.length >= 1);
    assert.deepEqual(view!.body.changedFiles, []);
    assert.equal(
      dailyReportViewFromStored(done.snapshot.latestFinalReport)?.body.integrity
        .source,
      "recorded_state_only"
    );
  });
});
