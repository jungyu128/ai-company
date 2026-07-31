/**
 * Continuous AI Company Operating System — employee live states, tick, CEO control.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  workStateFromDevStatus,
  nextWorkState,
  deriveEmployeeLiveStates,
  createEmployeeWork,
  splitDevTask,
  delegateDevTask,
  requestReview,
  runContinuousOsTick,
  applyCeoOsAction,
  getContinuousOsSnapshot,
  ensureEmployeeRoster,
  stopContinuousOsHeartbeat,
} from "@/services/builder/continuous-os";
import { upsertDevTasks } from "@/services/builder/autonomous-company/autonomous-company.store";
import { listAudit, listActivity } from "@/services/builder/workspace/collaboration-feed";

describe("employee work state mapping", () => {
  it("maps every DevTask status to a live work state", () => {
    assert.equal(workStateFromDevStatus("proposed"), "Planning");
    assert.equal(workStateFromDevStatus("in_progress"), "Working");
    assert.equal(workStateFromDevStatus("peer_review"), "Reviewing");
    assert.equal(workStateFromDevStatus("awaiting_ceo"), "Waiting");
    assert.equal(workStateFromDevStatus("blocked"), "Blocked");
    assert.equal(workStateFromDevStatus("needs_clarification"), "Blocked");
    assert.equal(workStateFromDevStatus("done"), "Completed");
  });

  it("advances Planning → Working → Reviewing → Waiting", () => {
    assert.equal(nextWorkState("Planning"), "Working");
    assert.equal(nextWorkState("Working"), "Reviewing");
    assert.equal(nextWorkState("Reviewing"), "Waiting");
    assert.equal(nextWorkState("Waiting"), null);
    assert.equal(nextWorkState("Blocked"), null);
  });

  it("derives live states for all employees and preserves interrupts", () => {
    const task = createEmployeeWork({
      title: "HQ shell polish",
      description: "Tighten HQ layout with acceptance criteria for desktop.",
      ownerEmployeeId: "mia",
      now: "2026-07-31T08:00:00.000Z",
    });
    task.status = "in_progress";
    const states = deriveEmployeeLiveStates({
      tasks: [task],
      previous: [
        {
          employeeId: "noah",
          employeeName: "Noah",
          state: "Working",
          activeTaskId: null,
          note: "Hold",
          priority: 2,
          interrupted: true,
          updatedAt: "2026-07-31T07:00:00.000Z",
        },
      ],
      now: "2026-07-31T08:00:00.000Z",
    });
    assert.ok(states.length >= 8);
    const mia = states.find((s) => s.employeeId === "mia");
    const noah = states.find((s) => s.employeeId === "noah");
    assert.equal(mia?.state, "Working");
    assert.equal(mia?.activeTaskId, task.id);
    assert.equal(noah?.interrupted, true);
    assert.equal(noah?.state, "Waiting");
  });
});

describe("employee work actions", () => {
  it("creates, splits, delegates, and requests review", () => {
    const now = "2026-07-31T09:00:00.000Z";
    const created = createEmployeeWork({
      title: "API contract tidy",
      description: "Normalize WorkPilot error envelopes with clear acceptance criteria.",
      ownerEmployeeId: "noah",
      now,
    });
    assert.equal(created.ownerEmployeeId, "noah");
    assert.equal(created.status, "proposed");

    const { primary, secondary } = splitDevTask({
      task: { ...created, status: "in_progress" },
      now,
      secondaryOwnerId: "ethan",
    });
    assert.equal(secondary.ownerEmployeeId, "ethan");
    assert.match(primary.progressNote ?? "", /Split/);

    const delegated = delegateDevTask({
      task: primary,
      toEmployeeId: "mia",
      now,
    });
    assert.equal(delegated.ownerEmployeeId, "mia");
    assert.ok(delegated.collaboratorIds.includes("noah"));

    const review = requestReview({ task: delegated, now, reviewerId: "ethan" });
    assert.equal(review.status, "peer_review");
    assert.ok(review.collaboratorIds.includes("ethan"));
  });
});

describe("continuous OS tick + CEO control", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    stopContinuousOsHeartbeat();
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cont-os-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    stopContinuousOsHeartbeat();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("runs a tick that updates live states and audit timeline", () => {
    ensureEmployeeRoster({
      repoRoot: tmp,
      now: "2026-07-31T10:00:00.000Z",
    });
    const result = runContinuousOsTick({
      repoRoot: tmp,
      now: "2026-07-31T10:00:00.000Z",
      force: true,
      deliverToChat: false,
    });
    assert.equal(result.skipped, false);
    assert.ok(result.stateUpdates.length >= 8);
    assert.ok(result.decisions.some((d) => d.kind === "tick"));

    const snap = getContinuousOsSnapshot({ repoRoot: tmp });
    assert.equal(snap.lastTickAt, "2026-07-31T10:00:00.000Z");
    assert.ok(snap.employeeStates.length >= 8);

    const audits = listAudit("default", tmp);
    assert.ok(
      audits.some((a) => String(a.action).startsWith("continuous_os.")),
      "expected continuous_os audit entries"
    );
    const activity = listActivity("default", tmp);
    assert.ok(activity.some((a) => a.relatedType === "continuous_os"));
  });

  it("throttles ticks unless force is set", () => {
    runContinuousOsTick({
      repoRoot: tmp,
      now: "2026-07-31T11:00:00.000Z",
      force: true,
      deliverToChat: false,
    });
    const second = runContinuousOsTick({
      repoRoot: tmp,
      now: "2026-07-31T11:00:30.000Z",
      minIntervalMs: 60_000,
      deliverToChat: false,
    });
    assert.equal(second.skipped, true);
    assert.equal(second.reason, "throttled");
  });

  it("lets the CEO interrupt, reprioritize, and approve work", () => {
    const now = "2026-07-31T12:00:00.000Z";
    const task = createEmployeeWork({
      title: "CEO approval slice",
      description: "Ship a WorkPilot docs plan with acceptance criteria.",
      ownerEmployeeId: "emma",
      now,
    });
    task.status = "awaiting_ceo";
    upsertDevTasks([task], tmp, "default");
    ensureEmployeeRoster({ repoRoot: tmp, now });

    const interrupted = applyCeoOsAction({
      action: { action: "interrupt", employeeId: "emma", note: "Pause Emma" },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now,
    });
    assert.equal(interrupted.ok, true);
    if (!interrupted.ok) return;
    const emma = interrupted.snapshot.employeeStates.find(
      (s) => s.employeeId === "emma"
    );
    assert.equal(emma?.interrupted, true);
    assert.equal(emma?.state, "Waiting");

    const reprio = applyCeoOsAction({
      action: {
        action: "reprioritize",
        employeeId: "mia",
        priority: 1,
        note: "Mia first",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now,
    });
    assert.equal(reprio.ok, true);
    if (!reprio.ok) return;
    assert.equal(
      reprio.snapshot.employeeStates.find((s) => s.employeeId === "mia")?.priority,
      1
    );

    const approved = applyCeoOsAction({
      action: { action: "approve", taskId: task.id, note: "Ship it" },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now,
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.equal(approved.decision.kind, "ceo_approve");
    assert.ok(
      listAudit("default", tmp).some((a) => a.action === "continuous_os.ceo_approve")
    );
  });

  it("does not advance interrupted employees during a tick", () => {
    const now = "2026-07-31T13:00:00.000Z";
    applyCeoOsAction({
      action: { action: "interrupt", employeeId: "alex", note: "Hold devops" },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now,
    });
    const before = getContinuousOsSnapshot({ repoRoot: tmp }).employeeStates.find(
      (s) => s.employeeId === "alex"
    );
    runContinuousOsTick({
      repoRoot: tmp,
      now: "2026-07-31T13:05:00.000Z",
      force: true,
      runAutonomy: false,
      deliverToChat: false,
    });
    const after = getContinuousOsSnapshot({ repoRoot: tmp }).employeeStates.find(
      (s) => s.employeeId === "alex"
    );
    assert.equal(before?.interrupted, true);
    assert.equal(after?.interrupted, true);
    assert.equal(after?.state, "Waiting");
  });
});
