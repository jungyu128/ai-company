/**
 * AI Company Calendar — schedule, conflicts, auto-reserve, CEO approve/edit.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { upsertDevTasks } from "@/services/builder/autonomous-company/autonomous-company.store";
import { proposeDevTask } from "@/services/builder/autonomous-company/autonomy.logic";
import { createCompanyMeeting } from "@/services/builder/meetings";
import {
  intervalsOverlap,
  detectEventConflicts,
  proposeAlternativeSlots,
  buildCalendarEventDraft,
  buildWorkBlockForTask,
  createCalendarEvent,
  autoReserveWorkBlocks,
  syncMeetingsToCalendar,
  applyCeoCalendarAction,
  getCalendarSnapshot,
  runCalendarMaintenance,
} from "@/services/builder/calendar";
import { listActivity, listAudit } from "@/services/builder/workspace/collaboration-feed";

describe("calendar logic", () => {
  it("detects overlapping intervals and attendee conflicts", () => {
    assert.equal(
      intervalsOverlap(
        "2026-07-31T09:00:00.000Z",
        "2026-07-31T10:00:00.000Z",
        "2026-07-31T09:30:00.000Z",
        "2026-07-31T10:30:00.000Z"
      ),
      true
    );
    assert.equal(
      intervalsOverlap(
        "2026-07-31T09:00:00.000Z",
        "2026-07-31T10:00:00.000Z",
        "2026-07-31T10:00:00.000Z",
        "2026-07-31T11:00:00.000Z"
      ),
      false
    );

    const existing = [
      buildCalendarEventDraft({
        kind: "meeting",
        title: "Standup",
        startAt: "2026-07-31T09:00:00.000Z",
        endAt: "2026-07-31T09:45:00.000Z",
        now: "2026-07-31T08:00:00.000Z",
        attendeeIds: ["mia", "noah"],
      }),
    ];
    const candidate = buildCalendarEventDraft({
      kind: "review",
      title: "Design review",
      startAt: "2026-07-31T09:15:00.000Z",
      endAt: "2026-07-31T10:00:00.000Z",
      now: "2026-07-31T08:00:00.000Z",
      attendeeIds: ["mia", "olivia"],
    });
    const conflicts = detectEventConflicts({ event: candidate, existing });
    assert.equal(conflicts.length, 1);
    assert.deepEqual(conflicts[0]?.attendeeIds, ["mia"]);
  });

  it("proposes alternative free slots after a conflict", () => {
    const busy = buildCalendarEventDraft({
      kind: "meeting",
      title: "Busy",
      startAt: "2026-07-31T09:00:00.000Z",
      endAt: "2026-07-31T10:30:00.000Z",
      now: "2026-07-31T08:00:00.000Z",
      attendeeIds: ["ethan"],
    });
    const alts = proposeAlternativeSlots({
      durationMinutes: 45,
      attendeeIds: ["ethan"],
      existing: [busy],
      from: "2026-07-31T09:00:00.000Z",
      count: 2,
    });
    assert.ok(alts.length >= 1);
    for (const slot of alts) {
      assert.equal(
        intervalsOverlap(slot.startAt, slot.endAt, busy.startAt, busy.endAt),
        false
      );
    }
  });

  it("builds a work block linked to a work item", () => {
    const task = proposeDevTask({
      title: "HQ calendar slice",
      description: "Implement calendar OS",
      ownerEmployeeId: "mia",
      now: "2026-07-31T08:00:00.000Z",
      status: "in_progress",
    });
    const block = buildWorkBlockForTask({
      task,
      existing: [],
      now: "2026-07-31T08:00:00.000Z",
    });
    assert.equal(block.kind, "work_block");
    assert.equal(block.workItemId, task.id);
    assert.deepEqual(block.attendeeIds, ["mia"]);
    assert.ok(Date.parse(block.endAt) > Date.parse(block.startAt));
  });
});

describe("calendar service + CEO actions + audit", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cal-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("schedules meetings, reviews, deadlines, releases, and milestones", () => {
    const kinds = [
      "meeting",
      "review",
      "deadline",
      "release",
      "milestone",
    ] as const;
    for (let i = 0; i < kinds.length; i++) {
      const kind = kinds[i]!;
      const result = createCalendarEvent({
        kind,
        title: `${kind} event`,
        startAt: `2026-07-31T1${i}:00:00.000Z`,
        endAt: `2026-07-31T1${i}:30:00.000Z`,
        attendeeIds: ["emma", "david"],
        workItemId: `WI-${kind}`,
        workItemTitle: `Work for ${kind}`,
        repoRoot: tmp,
        now: "2026-07-31T08:00:00.000Z",
        actorUserId: "ceo-1",
        actorName: "CEO",
      });
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.event.kind, kind);
      assert.equal(result.event.workItemId, `WI-${kind}`);
    }
    const audits = listAudit("default", tmp);
    assert.ok(audits.filter((a) => a.action === "calendar.create").length >= 5);
  });

  it("auto-reserves employee time for assigned work items", () => {
    const now = "2026-07-31T08:00:00.000Z";
    const tasks = [
      proposeDevTask({
        title: "Nav polish",
        description: "WorkPilot nav",
        ownerEmployeeId: "mia",
        now,
        status: "in_progress",
      }),
      proposeDevTask({
        title: "API harden",
        description: "WorkPilot API",
        ownerEmployeeId: "noah",
        now,
        status: "proposed",
      }),
    ];
    upsertDevTasks(tasks, tmp);

    const reserved = autoReserveWorkBlocks({
      repoRoot: tmp,
      now,
    });
    assert.equal(reserved.created.length, 2);
    assert.ok(reserved.created.every((e) => e.kind === "work_block"));
    assert.ok(reserved.created.every((e) => e.workItemId));

    const again = autoReserveWorkBlocks({ repoRoot: tmp, now });
    assert.equal(again.created.length, 0);
    assert.equal(again.skipped, 2);

    const activity = listActivity("default", tmp);
    assert.ok(activity.some((a) => a.relatedType === "calendar"));
  });

  it("links meetings onto the calendar", () => {
    const meeting = createCompanyMeeting({
      kind: "architecture_review",
      workItemTitle: "HQ Calendar",
      missionId: "TASK-CAL-001",
      repoRoot: tmp,
      now: "2026-07-31T09:00:00.000Z",
    });
    assert.equal(meeting.ok, true);
    if (!meeting.ok) return;

    const synced = syncMeetingsToCalendar({
      repoRoot: tmp,
      now: "2026-07-31T09:05:00.000Z",
    });
    assert.ok(synced.created.length >= 1);
    assert.ok(synced.created.some((e) => e.meetingId === meeting.meeting.id));
  });

  it("detects conflicts, proposes alternatives, and lets CEO edit/approve", () => {
    const first = createCalendarEvent({
      kind: "meeting",
      title: "First",
      startAt: "2026-07-31T09:00:00.000Z",
      endAt: "2026-07-31T10:00:00.000Z",
      attendeeIds: ["mia"],
      repoRoot: tmp,
      now: "2026-07-31T08:00:00.000Z",
      actorUserId: "ceo-1",
      actorName: "CEO",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const second = createCalendarEvent({
      kind: "review",
      title: "Conflict review",
      startAt: "2026-07-31T09:30:00.000Z",
      endAt: "2026-07-31T10:30:00.000Z",
      attendeeIds: ["mia", "ethan"],
      repoRoot: tmp,
      now: "2026-07-31T08:01:00.000Z",
      actorUserId: "ceo-1",
      actorName: "CEO",
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.ok(second.conflicts.length >= 1);
    assert.equal(second.event.status, "pending_ceo");
    assert.ok(second.event.proposedAlternatives.length >= 1);
    assert.ok(second.event.pendingChange);

    const edited = applyCeoCalendarAction({
      eventId: second.event.id,
      action: "edit",
      startAt: second.event.proposedAlternatives[0]!.startAt,
      endAt: second.event.proposedAlternatives[0]!.endAt,
      note: "Move to free slot",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T08:10:00.000Z",
    });
    assert.equal(edited.ok, true);
    if (!edited.ok) return;
    assert.equal(edited.event.status, "approved");
    assert.equal(edited.event.pendingChange, null);

    const approved = applyCeoCalendarAction({
      eventId: first.event.id,
      action: "approve",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T08:11:00.000Z",
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.equal(approved.event.status, "approved");

    const cancelled = applyCeoCalendarAction({
      eventId: first.event.id,
      action: "cancel",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T08:12:00.000Z",
    });
    assert.equal(cancelled.ok, true);
    if (!cancelled.ok) return;
    assert.equal(cancelled.event.status, "cancelled");

    const audits = listAudit("default", tmp);
    for (const action of [
      "calendar.create",
      "calendar.edit",
      "calendar.approve",
      "calendar.cancel",
    ]) {
      assert.ok(
        audits.some((a) => a.action === action),
        `missing audit ${action}`
      );
    }

    const snap = getCalendarSnapshot({
      repoRoot: tmp,
      now: "2026-07-31T08:00:00.000Z",
    });
    assert.ok(snap.events.length >= 2);
  });

  it("runs calendar maintenance from Continuous OS entrypoint", () => {
    const now = "2026-07-31T08:00:00.000Z";
    upsertDevTasks(
      [
        proposeDevTask({
          title: "Maintenance task",
          description: "needs block",
          ownerEmployeeId: "alex",
          now,
          status: "in_progress",
        }),
      ],
      tmp
    );
    createCompanyMeeting({
      kind: "qa_review",
      workItemTitle: "Maintenance",
      repoRoot: tmp,
      now,
    });

    const result = runCalendarMaintenance({ repoRoot: tmp, now });
    assert.ok(result.workBlocks.length >= 1);
    assert.ok(result.meetingEvents.length >= 1);
  });
});
