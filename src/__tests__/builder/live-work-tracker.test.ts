/**
 * Live Work Tracker — real-time employee states, timeline on change, CEO snapshot.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildLiveWorkTrackerSnapshot,
  enrichEmployeeLiveState,
  progressForStatus,
} from "@/services/builder/live-work-tracker";
import {
  syncLiveWorkTracker,
  getLiveWorkTrackerSnapshot,
} from "@/services/builder/live-work-tracker/server";
import {
  createEmployeeWork,
  deriveEmployeeLiveStates,
  upsertEmployeeStates,
} from "@/services/builder/continuous-os";
import { upsertDevTasks } from "@/services/builder/autonomous-company/autonomous-company.store";
import { listActivity, listAudit } from "@/services/builder/workspace/collaboration-feed";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";

describe("live work tracker logic", () => {
  it("computes progress and enriches Idle / Meeting / Working fields", () => {
    assert.equal(progressForStatus("Idle"), 0);
    assert.equal(progressForStatus("Working"), 40);
    assert.equal(progressForStatus("Completed"), 100);

    const base = {
      employeeId: "alex",
      employeeName: "Alex",
      state: "Working" as const,
      activeTaskId: "task-1",
      note: "Building UI",
      priority: 2,
      interrupted: false,
      updatedAt: "2026-07-31T10:00:00.000Z",
    };

    const idle = enrichEmployeeLiveState({
      base: { ...base, activeTaskId: null, state: "Planning" },
      task: null,
      inMeeting: false,
      meetingTitle: null,
      now: "2026-07-31T10:05:00.000Z",
    });
    assert.equal(idle.state, "Idle");
    assert.equal(idle.progressPercent, 0);
    assert.equal(idle.estimatedCompletionAt, null);
    assert.ok(idle.nextPlannedAction);

    const meeting = enrichEmployeeLiveState({
      base,
      task: null,
      inMeeting: true,
      meetingTitle: "Architecture sync",
      now: "2026-07-31T10:05:00.000Z",
    });
    assert.equal(meeting.state, "Meeting");
    assert.match(meeting.note ?? "", /Architecture sync/);
    assert.equal(meeting.waitingFor, "Architecture sync");
  });

  it("builds a snapshot for every permanent employee and detects changes", () => {
    const now = "2026-07-31T11:00:00.000Z";
    const task = createEmployeeWork({
      title: "HQ live tracker UI",
      description: "Wire live work status into CEO dashboard with acceptance criteria.",
      ownerEmployeeId: "alex",
      now,
    });
    task.status = "in_progress";
    task.progressNote = "Implementing panel 40%";

    const liveStates = deriveEmployeeLiveStates({
      tasks: [task],
      previous: [],
      now,
    }).map((s) =>
      s.employeeId === "alex"
        ? enrichEmployeeLiveState({
            base: s,
            task,
            inMeeting: false,
            meetingTitle: null,
            now,
          })
        : enrichEmployeeLiveState({
            base: s,
            task: null,
            inMeeting: false,
            meetingTitle: null,
            now,
          })
    );

    const snap = buildLiveWorkTrackerSnapshot({
      liveStates,
      tasks: [task],
      previousFingerprints: [],
      now,
    });

    assert.equal(snap.employees.length, AI_COMPANY_EMPLOYEES.length);
    const alex = snap.employees.find((e) => e.employeeId === "alex");
    assert.ok(alex);
    assert.equal(alex!.status, "Working");
    assert.equal(alex!.currentTask, task.title);
    assert.equal(alex!.progressPercent, 40);
    assert.ok(alex!.startedAt);
    assert.equal(alex!.estimatedCompletionAt, null);
    assert.ok(alex!.currentStep);
    assert.ok(alex!.nextPlannedAction);
    assert.ok(snap.summary.working >= 1);
    assert.ok(snap.recentChanges.some((c) => c.employeeId === "alex"));

    const again = buildLiveWorkTrackerSnapshot({
      liveStates,
      tasks: [task],
      previousFingerprints: snap.employees.map((e) => ({
        employeeId: e.employeeId,
        status: e.status,
        currentTaskId: e.currentTaskId,
        progressPercent: e.progressPercent,
        currentStep: e.currentStep,
      })),
      now: "2026-07-31T11:01:00.000Z",
    });
    assert.equal(again.recentChanges.length, 0);
  });
});

describe("live work tracker sync + timeline", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lwt-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("syncs Continuous OS states and appends timeline on change", () => {
    const now = "2026-07-31T12:00:00.000Z";
    const workspaceId = "default";
    const task = createEmployeeWork({
      title: "Tracker timeline",
      description: "Ensure state changes land on the activity timeline.",
      ownerEmployeeId: "david",
      now,
    });
    task.status = "in_progress";
    upsertDevTasks([task], tmp, workspaceId);

    const states = deriveEmployeeLiveStates({
      tasks: [task],
      previous: [],
      now,
    });
    upsertEmployeeStates(states, tmp, workspaceId);

    const snap1 = syncLiveWorkTracker({
      repoRoot: tmp,
      workspaceId,
      now,
      recordTimeline: true,
    });
    assert.ok(
      snap1.employees.some((e) => e.employeeId === "david" && e.status === "Working")
    );

    const activity1 = listActivity(workspaceId, tmp, 50);
    assert.ok(
      activity1.some((a) => a.relatedType === "live_work" && a.relatedId === "david")
    );
    const audit1 = listAudit(workspaceId, tmp, 50);
    assert.ok(audit1.some((a) => a.action === "live_work.state_change"));

    const snap2 = syncLiveWorkTracker({
      repoRoot: tmp,
      workspaceId,
      now: "2026-07-31T12:05:00.000Z",
      recordTimeline: true,
    });
    const activity2 = listActivity(workspaceId, tmp, 50).filter(
      (a) => a.relatedType === "live_work" && a.relatedId === "david"
    );
    assert.equal(
      activity2.length,
      activity1.filter((a) => a.relatedId === "david").length
    );
    assert.equal(snap2.recentChanges.length, 0);

    const cached = getLiveWorkTrackerSnapshot({
      repoRoot: tmp,
      workspaceId,
      sync: false,
    });
    assert.ok(cached.employees.length >= 8);
  });
});
