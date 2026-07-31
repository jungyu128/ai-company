/**
 * Live Employee Status — real Continuous OS state only, no fabricated progress.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveEmployeeStatus,
  toDisplayStatus,
} from "@/services/builder/live-employee-status";
import { progressForStatus } from "@/services/builder/live-work-tracker";

describe("Live Employee Status", () => {
  it("maps Meeting to Waiting for display and keeps required statuses", () => {
    assert.equal(toDisplayStatus("Meeting"), "Waiting");
    assert.equal(toDisplayStatus("Idle"), "Idle");
    assert.equal(toDisplayStatus("Working"), "Working");
    assert.equal(toDisplayStatus("Blocked"), "Blocked");
  });

  it("derives progress only from discrete work state", () => {
    assert.equal(progressForStatus("Idle"), 0);
    assert.equal(progressForStatus("Planning"), 15);
    assert.equal(progressForStatus("Working"), 40);
    assert.equal(progressForStatus("Reviewing"), 65);
    assert.equal(progressForStatus("Completed"), 100);
  });

  it("builds a complete status view from live work without inventing activity", () => {
    const view = buildLiveEmployeeStatus({
      employeeId: "alex",
      currentTask: "HQ live status strip",
      lastUpdateFallback: "fallback",
      liveWork: {
        status: "Working",
        currentStep: "Executing work",
        progressPercent: 99,
        waitingFor: null,
        lastUpdate: "2026-07-31 13:00",
      },
    });
    assert.equal(view.status, "Working");
    assert.equal(view.currentTask, "HQ live status strip");
    assert.equal(view.currentStep, "Executing work");
    // Recomputed from status — ignores stale invented 99%
    assert.equal(view.progress, 40);
    assert.equal(view.waitingFor, null);
    assert.equal(view.lastUpdate, "2026-07-31 13:00");
  });

  it("shows Idle with zero progress when there is no live work or task", () => {
    const view = buildLiveEmployeeStatus({
      employeeId: "sarah",
      currentTask: null,
      lastUpdateFallback: "now",
      liveWork: null,
    });
    assert.equal(view.status, "Idle");
    assert.equal(view.progress, 0);
    assert.equal(view.currentTask, null);
    assert.equal(view.waitingFor, null);
  });
});
