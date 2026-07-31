/**
 * Company Activity Timeline — persist + typed lifecycle events.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  getCompanyTimeline,
  recordCompanyTimelineEvent,
  recordWorkStateTimelineTransition,
} from "@/services/builder/company-timeline";
import { getCompanyTimelineStore } from "@/services/builder/company-timeline/company-timeline.store";
import { applyCeoDailyOpsAction } from "@/services/builder/daily-ops";

describe("Company Activity Timeline", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "company-timeline-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("records and persists events, listing newest-first from store", () => {
    recordCompanyTimelineEvent({
      kind: "directive_submitted",
      summary: "Directive submitted: Alpha",
      at: "2026-07-31T10:00:00.000Z",
      actorName: "CEO",
      actorRole: "owner",
      repoRoot: tmp,
    });
    recordCompanyTimelineEvent({
      kind: "work_assigned",
      summary: "Work assigned to Alex",
      at: "2026-07-31T10:01:00.000Z",
      actorName: "AI Company",
      actorRole: "system",
      repoRoot: tmp,
    });

    const store = getCompanyTimelineStore(tmp);
    assert.equal(store.events.length, 2);
    assert.equal(store.events[0]!.kind, "work_assigned");

    const view = getCompanyTimeline({ repoRoot: tmp, limit: 10 });
    assert.equal(view.count, 2);
    assert.equal(view.events[0]!.kind, "work_assigned");
    assert.equal(view.events[1]!.kind, "directive_submitted");
    assert.ok(view.events[0]!.atDisplay);
  });

  it("maps work-state transitions to timeline kinds", () => {
    const started = recordWorkStateTimelineTransition({
      fromStatus: "APPROVED",
      toStatus: "WORKING",
      employeeId: "alex",
      employeeName: "Alex",
      taskTitle: "HQ timeline",
      at: "2026-07-31T11:00:00.000Z",
      repoRoot: tmp,
    });
    assert.equal(started?.kind, "work_started");

    const review = recordWorkStateTimelineTransition({
      fromStatus: "WORKING",
      toStatus: "REVIEWING",
      employeeId: "maya",
      employeeName: "Maya",
      at: "2026-07-31T11:05:00.000Z",
      repoRoot: tmp,
    });
    assert.equal(review?.kind, "review_started");

    const reviewDone = recordWorkStateTimelineTransition({
      fromStatus: "REVIEWING",
      toStatus: "QA",
      employeeId: "maya",
      employeeName: "Maya",
      at: "2026-07-31T11:10:00.000Z",
      repoRoot: tmp,
    });
    assert.equal(reviewDone?.kind, "review_completed");

    const blocked = recordWorkStateTimelineTransition({
      fromStatus: "WORKING",
      toStatus: "BLOCKED",
      employeeId: "alex",
      employeeName: "Alex",
      at: "2026-07-31T11:15:00.000Z",
      repoRoot: tmp,
    });
    assert.equal(blocked?.kind, "blocked");

    const resumed = recordWorkStateTimelineTransition({
      fromStatus: "BLOCKED",
      toStatus: "WORKING",
      employeeId: "alex",
      employeeName: "Alex",
      at: "2026-07-31T11:20:00.000Z",
      repoRoot: tmp,
    });
    assert.equal(resumed?.kind, "resumed");

    const done = recordWorkStateTimelineTransition({
      fromStatus: "QA",
      toStatus: "COMPLETED",
      employeeId: "alex",
      employeeName: "Alex",
      at: "2026-07-31T11:30:00.000Z",
      repoRoot: tmp,
    });
    assert.equal(done?.kind, "work_completed");
  });

  it("records directive_submitted, work_assigned, and approval_requested on Daily Directive flow", () => {
    const result = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Timeline coverage",
        instruction: "Ship Company Activity Timeline with persisted events",
        intendedOutcome: "Timeline events recorded end-to-end",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T12:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const view = getCompanyTimeline({ repoRoot: tmp, limit: 100 });
    const kinds = view.events.map((e) => e.kind);
    assert.ok(kinds.includes("directive_submitted"));
    assert.ok(kinds.includes("work_assigned"));
    assert.ok(kinds.includes("approval_requested"));

    const planId = result.snapshot.activePlan?.id;
    assert.ok(planId);

    const approve = applyCeoDailyOpsAction({
      action: {
        action: "approve_entire_plan",
        planId: planId!,
        note: "Ship it",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T12:05:00.000Z",
    });
    assert.equal(approve.ok, true);

    const after = getCompanyTimeline({ repoRoot: tmp, limit: 100 });
    assert.ok(after.events.some((e) => e.kind === "approval_granted"));

    // Persist across reload
    const reloaded = getCompanyTimelineStore(tmp);
    assert.ok(reloaded.events.length >= 4);
  });
});
