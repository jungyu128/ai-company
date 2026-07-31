/**
 * CEO Dashboard — real-time health panels + drill-down.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { upsertDevTasks } from "@/services/builder/autonomous-company/autonomous-company.store";
import { proposeDevTask } from "@/services/builder/autonomous-company/autonomy.logic";
import { createCompanyMeeting } from "@/services/builder/meetings";
import { createCompanySprint, applyCeoSprintAction } from "@/services/builder/sprints";
import {
  buildActiveWorkItems,
  buildBlockedWorkItems,
  buildMeetingSummaries,
  buildSprintProgressPanel,
  drillHref,
} from "@/services/builder/ceo/dashboard-panels";
import {
  getCeoDashboardDrill,
  runAiCeoCycle,
} from "@/services/builder/ceo/ceo.service";
import { recordWorkspaceEvent } from "@/services/builder/workspace/collaboration-feed";

describe("CEO dashboard panel builders", () => {
  it("builds active and blocked work refs with drill hrefs", () => {
    const now = "2026-07-31T12:00:00.000Z";
    const active = proposeDevTask({
      title: "Ship HQ calendar",
      description: "active",
      ownerEmployeeId: "mia",
      now,
      status: "in_progress",
    });
    const blocked = proposeDevTask({
      title: "Clarify release window",
      description: "blocked",
      ownerEmployeeId: "ethan",
      now,
      status: "needs_clarification",
    });
    const activeItems = buildActiveWorkItems([active, blocked]);
    const blockedItems = buildBlockedWorkItems([active, blocked]);
    assert.equal(activeItems.length, 1);
    assert.equal(activeItems[0]?.id, active.id);
    assert.equal(blockedItems.length, 1);
    assert.match(blockedItems[0]!.href, /drill=blocked_work/);
    assert.match(drillHref("workload", "mia"), /\/builder\/hq\/employees\/mia/);
  });

  it("summarizes sprint progress and meetings", () => {
    const sprintPanel = buildSprintProgressPanel({
      active: {
        id: "SPRINT-1",
        name: "July",
        goal: "CEO dashboard",
        status: "active",
        workItemIds: ["a", "b"],
        priorityOrder: ["a", "b"],
        startAt: "2026-07-29T00:00:00.000Z",
        endAt: null,
        pausedAt: null,
        closedAt: null,
        createdAt: "2026-07-29T00:00:00.000Z",
        updatedAt: "2026-07-29T00:00:00.000Z",
        ceoNote: null,
      },
      metrics: {
        totalWorkItems: 2,
        completedWorkItems: 1,
        blockedWorkItems: 0,
        inProgressWorkItems: 1,
        progressPercent: 50,
        velocity: 0.5,
        goal: "CEO dashboard",
      },
      plannedCount: 1,
      completedCount: 0,
    });
    assert.equal(sprintPanel.active?.progressPercent, 50);
    assert.equal(sprintPanel.items.length, 1);

    const meetings = buildMeetingSummaries([
      {
        id: "MTG-1",
        kind: "architecture_review",
        title: "Architecture review",
        purpose: "Review HQ calendar",
        status: "awaiting_ceo",
        participantIds: ["david", "mia"],
        agenda: [],
        discussion: [],
        decisions: [{ id: "d1", text: "Ship panels", proposedByEmployeeId: "david", status: "proposed" }],
        actionItems: [],
        owners: ["david"],
        dueDates: [],
        workItemId: null,
        workItemTitle: "CEO Dashboard",
        missionId: null,
        synthesis: "Ready for CEO",
        ceoJoined: false,
        ceoComments: [],
        ceoDecision: null,
        ceoNote: null,
        createdAt: "2026-07-31T10:00:00.000Z",
        updatedAt: "2026-07-31T10:00:00.000Z",
        presentedToCeoAt: "2026-07-31T10:00:00.000Z",
      },
    ]);
    assert.equal(meetings[0]?.synthesis, "Ready for CEO");
    assert.match(meetings[0]!.href, /drill=meeting/);
  });
});

describe("CEO dashboard service", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ceo-dash-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("aggregates real-time health, work, sprint, meetings, decisions, KPIs", () => {
    const now = "2026-07-31T12:00:00.000Z";
    const tasks = [
      proposeDevTask({
        title: "Active HQ panel",
        description: "active",
        ownerEmployeeId: "mia",
        now,
        status: "in_progress",
      }),
      proposeDevTask({
        title: "Blocked clarification",
        description: "blocked",
        ownerEmployeeId: "noah",
        now,
        status: "blocked",
      }),
    ];
    upsertDevTasks(tasks, tmp);

    const sprint = createCompanySprint({
      name: "Dash Sprint",
      goal: "CEO visibility",
      workItemIds: tasks.map((t) => t.id),
      startImmediately: true,
      repoRoot: tmp,
      now,
      actorUserId: "ceo-1",
      actorName: "CEO",
    });
    assert.equal(sprint.ok, true);

    createCompanyMeeting({
      kind: "release_review",
      workItemTitle: "CEO Dashboard",
      repoRoot: tmp,
      now,
    });

    recordWorkspaceEvent({
      workspaceId: "default",
      kind: "approval",
      summary: "CEO approved schedule change",
      actorUserId: "ceo-1",
      actorName: "CEO",
      actorRole: "owner",
      relatedType: "calendar",
      relatedId: "CAL-1",
      status: "approved",
      auditAction: "calendar.approve",
      repoRoot: tmp,
    });

    const dash = runAiCeoCycle({
      repoRoot: tmp,
      now: "2026-07-31T12:05:00.000Z",
    });

    assert.ok(dash.health.score >= 0);
    assert.ok(dash.health.kpis);
    assert.ok(dash.activeWork.some((w) => w.title.includes("Active")));
    assert.ok(dash.blockedWork.some((w) => w.title.includes("Blocked")));
    assert.equal(dash.sprintProgress.active?.name, "Dash Sprint");
    assert.ok(dash.meetingSummaries.length >= 1);
    assert.ok(dash.recentDecisions.length >= 1);
    assert.ok(Array.isArray(dash.workloads));
    assert.ok(Array.isArray(dash.approvalQueue));
    assert.ok(dash.safety.neverApprovesExternalWrites);
  });

  it("lets the CEO drill into sprint, meeting, work, and health", () => {
    const now = "2026-07-31T13:00:00.000Z";
    const task = proposeDevTask({
      title: "Drill task",
      description: "detail",
      ownerEmployeeId: "emma",
      now,
      status: "in_progress",
    });
    upsertDevTasks([task], tmp);

    const sprint = createCompanySprint({
      name: "Drill Sprint",
      goal: "Drill coverage",
      workItemIds: [task.id],
      startImmediately: true,
      repoRoot: tmp,
      now,
    });
    assert.equal(sprint.ok, true);
    if (!sprint.ok) return;

    const meeting = createCompanyMeeting({
      kind: "qa_review",
      workItemTitle: "Drill",
      repoRoot: tmp,
      now,
    });
    assert.equal(meeting.ok, true);
    if (!meeting.ok) return;

    const healthDrill = getCeoDashboardDrill({
      section: "health",
      id: "health",
      repoRoot: tmp,
    });
    assert.equal(healthDrill.ok, true);
    if (!healthDrill.ok) return;
    assert.ok(healthDrill.drill.detail.health);

    const workDrill = getCeoDashboardDrill({
      section: "active_work",
      id: task.id,
      repoRoot: tmp,
    });
    assert.equal(workDrill.ok, true);
    if (!workDrill.ok) return;
    assert.equal((workDrill.drill.detail.task as { id: string }).id, task.id);

    const sprintDrill = getCeoDashboardDrill({
      section: "sprint",
      id: sprint.sprint.id,
      repoRoot: tmp,
    });
    assert.equal(sprintDrill.ok, true);

    const meetingDrill = getCeoDashboardDrill({
      section: "meeting",
      id: meeting.meeting.id,
      repoRoot: tmp,
    });
    assert.equal(meetingDrill.ok, true);

    applyCeoSprintAction({
      sprintId: sprint.sprint.id,
      action: "close",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T13:10:00.000Z",
    });
  });
});
