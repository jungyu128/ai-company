/**
 * AI Company Sprint Management — lifecycle, membership, priority, audit.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { upsertDevTasks } from "@/services/builder/autonomous-company/autonomous-company.store";
import { proposeDevTask } from "@/services/builder/autonomous-company/autonomy.logic";
import {
  applyPriorityOrder,
  buildSprintDraft,
  computeSprintMetrics,
  prioritizeTasksForActiveSprint,
  createCompanySprint,
  applyCeoSprintAction,
  assignTasksToSprint,
  ensureTasksBelongToSprint,
  getSprintSnapshot,
  getPrioritizedSprintTasks,
} from "@/services/builder/sprints";
import { listActivity, listAudit } from "@/services/builder/workspace/collaboration-feed";

describe("sprint logic", () => {
  it("builds planned sprints with goals and ordered work items", () => {
    const draft = buildSprintDraft({
      name: "HQ Sprint 1",
      goal: "Ship sprint management",
      now: "2026-07-31T10:00:00.000Z",
      workItemIds: ["T1", "T2", "T1"],
    });
    assert.equal(draft.status, "planned");
    assert.equal(draft.goal, "Ship sprint management");
    assert.deepEqual(draft.workItemIds, ["T1", "T2"]);
    assert.deepEqual(draft.priorityOrder, ["T1", "T2"]);
    assert.match(draft.id, /^SPRINT-/);
  });

  it("computes progress, velocity, blocked, and completed metrics", () => {
    const now = "2026-07-31T12:00:00.000Z";
    const sprint = buildSprintDraft({
      name: "Metrics",
      goal: "Measure velocity",
      now: "2026-07-29T12:00:00.000Z",
      workItemIds: ["a", "b", "c", "d"],
    });
    sprint.status = "active";
    sprint.startAt = "2026-07-29T12:00:00.000Z";

    const tasks = [
      proposeDevTask({
        title: "Done A",
        description: "done",
        ownerEmployeeId: "mia",
        now,
        status: "done",
        sprintId: sprint.id,
      }),
      proposeDevTask({
        title: "Blocked B",
        description: "blocked",
        ownerEmployeeId: "noah",
        now,
        status: "blocked",
        sprintId: sprint.id,
      }),
      proposeDevTask({
        title: "Progress C",
        description: "wip",
        ownerEmployeeId: "ethan",
        now,
        status: "in_progress",
        sprintId: sprint.id,
      }),
      proposeDevTask({
        title: "Clarify D",
        description: "need ceo",
        ownerEmployeeId: "emma",
        now,
        status: "needs_clarification",
        sprintId: sprint.id,
      }),
    ].map((t, i) => ({ ...t, id: ["a", "b", "c", "d"][i]! }));

    const metrics = computeSprintMetrics({ sprint, tasks, now });
    assert.equal(metrics.totalWorkItems, 4);
    assert.equal(metrics.completedWorkItems, 1);
    assert.equal(metrics.blockedWorkItems, 2);
    assert.equal(metrics.inProgressWorkItems, 1);
    assert.equal(metrics.progressPercent, 25);
    assert.equal(metrics.goal, "Measure velocity");
    assert.ok(metrics.velocity > 0);
  });

  it("prioritizes active-sprint work by priorityOrder", () => {
    const sprint = buildSprintDraft({
      name: "Prio",
      goal: "Order matters",
      now: "2026-07-31T10:00:00.000Z",
      workItemIds: ["low", "high", "mid"],
    });
    sprint.status = "active";
    const reordered = applyPriorityOrder(sprint, ["high", "mid", "low"]);
    const tasks = [
      {
        ...proposeDevTask({
          title: "Low",
          description: "x",
          ownerEmployeeId: "mia",
          now: "2026-07-31T09:00:00.000Z",
          sprintId: reordered.id,
        }),
        id: "low",
      },
      {
        ...proposeDevTask({
          title: "High",
          description: "x",
          ownerEmployeeId: "mia",
          now: "2026-07-31T08:00:00.000Z",
          sprintId: reordered.id,
        }),
        id: "high",
      },
      {
        ...proposeDevTask({
          title: "Mid",
          description: "x",
          ownerEmployeeId: "mia",
          now: "2026-07-31T07:00:00.000Z",
          sprintId: reordered.id,
        }),
        id: "mid",
      },
      {
        ...proposeDevTask({
          title: "Outside",
          description: "other sprint",
          ownerEmployeeId: "mia",
          now: "2026-07-31T11:00:00.000Z",
          sprintId: "other",
        }),
        id: "out",
      },
    ];

    const ordered = prioritizeTasksForActiveSprint({
      tasks,
      activeSprint: reordered,
    });
    assert.equal(ordered[0]?.id, "high");
    assert.equal(ordered[1]?.id, "mid");
    assert.equal(ordered[2]?.id, "low");
    assert.equal(ordered[3]?.id, "out");
  });
});

describe("sprint service + CEO actions + audit", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "spr-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function seedTasks(now: string) {
    const tasks = [
      proposeDevTask({
        title: "Nav polish",
        description: "WorkPilot nav",
        ownerEmployeeId: "mia",
        now,
        status: "in_progress",
      }),
      proposeDevTask({
        title: "API contracts",
        description: "WorkPilot API",
        ownerEmployeeId: "noah",
        now,
        status: "proposed",
      }),
      proposeDevTask({
        title: "QA pack",
        description: "WorkPilot tests",
        ownerEmployeeId: "ethan",
        now,
        status: "blocked",
      }),
    ];
    upsertDevTasks(tasks, tmp);
    return tasks;
  }

  it("creates a sprint, assigns work items, and records timeline + audit", () => {
    const now = "2026-07-31T14:00:00.000Z";
    const tasks = seedTasks(now);
    const result = createCompanySprint({
      name: "July HQ Sprint",
      goal: "Land sprint OS for AI Company",
      workItemIds: tasks.map((t) => t.id),
      startImmediately: true,
      repoRoot: tmp,
      now,
      actorUserId: "ceo-1",
      actorName: "CEO",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.sprint.status, "active");
    assert.equal(result.sprint.workItemIds.length, 3);
    assert.equal(result.metrics.totalWorkItems, 3);
    assert.equal(result.metrics.blockedWorkItems, 1);

    const audits = listAudit("default", tmp);
    assert.ok(audits.some((a) => a.action === "sprint.create"));
    const activity = listActivity("default", tmp);
    assert.ok(activity.some((a) => a.relatedType === "sprint"));
  });

  it("ensures every orphan work item belongs to a sprint", () => {
    const now = "2026-07-31T14:10:00.000Z";
    const created = createCompanySprint({
      name: "Catch orphans",
      goal: "No unassigned work",
      startImmediately: true,
      repoRoot: tmp,
      now,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const orphan = proposeDevTask({
      title: "Orphan task",
      description: "needs sprint",
      ownerEmployeeId: "alex",
      now,
    });
    assert.equal(orphan.sprintId, null);
    upsertDevTasks([orphan], tmp);

    const ensured = ensureTasksBelongToSprint({
      repoRoot: tmp,
      now: "2026-07-31T14:11:00.000Z",
    });
    assert.equal(ensured.assigned, 1);
    assert.equal(ensured.sprint?.id, created.sprint.id);
    assert.ok(ensured.sprint?.workItemIds.includes(orphan.id));
  });

  it("lets the CEO start, pause, reprioritize, and close a sprint", () => {
    const now = "2026-07-31T15:00:00.000Z";
    const tasks = seedTasks(now);
    const created = createCompanySprint({
      name: "CEO Control",
      goal: "Exercise CEO controls",
      workItemIds: tasks.map((t) => t.id),
      repoRoot: tmp,
      now,
      actorUserId: "ceo-1",
      actorName: "CEO",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.sprint.status, "planned");

    const started = applyCeoSprintAction({
      sprintId: created.sprint.id,
      action: "start",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T15:01:00.000Z",
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.equal(started.sprint.status, "active");

    const paused = applyCeoSprintAction({
      sprintId: created.sprint.id,
      action: "pause",
      note: "Hold for mission clarity",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T15:02:00.000Z",
    });
    assert.equal(paused.ok, true);
    if (!paused.ok) return;
    assert.equal(paused.sprint.status, "planned");
    assert.ok(paused.sprint.pausedAt);

    const resumed = applyCeoSprintAction({
      sprintId: created.sprint.id,
      action: "start",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T15:03:00.000Z",
    });
    assert.equal(resumed.ok, true);
    if (!resumed.ok) return;

    const order = [...created.sprint.workItemIds].reverse();
    const reprio = applyCeoSprintAction({
      sprintId: created.sprint.id,
      action: "reprioritize",
      priorityOrder: order,
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T15:04:00.000Z",
    });
    assert.equal(reprio.ok, true);
    if (!reprio.ok) return;
    assert.deepEqual(reprio.sprint.priorityOrder.slice(0, order.length), order);

    const prioritized = getPrioritizedSprintTasks({ repoRoot: tmp });
    assert.equal(prioritized[0]?.id, order[0]);

    const closed = applyCeoSprintAction({
      sprintId: created.sprint.id,
      action: "close",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T15:05:00.000Z",
    });
    assert.equal(closed.ok, true);
    if (!closed.ok) return;
    assert.equal(closed.sprint.status, "completed");
    assert.ok(closed.sprint.closedAt);

    const snapshot = getSprintSnapshot({
      repoRoot: tmp,
      now: "2026-07-31T15:06:00.000Z",
    });
    assert.equal(snapshot.active, null);
    assert.ok(snapshot.completed.some((s) => s.id === created.sprint.id));

    const audits = listAudit("default", tmp);
    for (const action of [
      "sprint.create",
      "sprint.start",
      "sprint.pause",
      "sprint.reprioritize",
      "sprint.close",
    ]) {
      assert.ok(
        audits.some((a) => a.action === action),
        `missing audit ${action}`
      );
    }
  });

  it("archives completed sprints and rejects a second active sprint", () => {
    const now = "2026-07-31T16:00:00.000Z";
    const first = createCompanySprint({
      name: "Active One",
      goal: "Only one active",
      startImmediately: true,
      repoRoot: tmp,
      now,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;

    const second = createCompanySprint({
      name: "Active Two",
      goal: "Should conflict",
      startImmediately: true,
      repoRoot: tmp,
      now: "2026-07-31T16:01:00.000Z",
    });
    assert.equal(second.ok, false);
    if (second.ok) return;
    assert.equal(second.code, "ACTIVE_EXISTS");

    applyCeoSprintAction({
      sprintId: first.sprint.id,
      action: "close",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T16:02:00.000Z",
    });
    const archived = applyCeoSprintAction({
      sprintId: first.sprint.id,
      action: "archive",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T16:03:00.000Z",
    });
    assert.equal(archived.ok, true);
    if (!archived.ok) return;
    assert.equal(archived.sprint.status, "archived");

    const snap = getSprintSnapshot({ repoRoot: tmp });
    assert.ok(snap.archived.some((s) => s.id === first.sprint.id));
  });

  it("assigns tasks onto an existing sprint", () => {
    const now = "2026-07-31T17:00:00.000Z";
    const created = createCompanySprint({
      name: "Assign later",
      goal: "Late joiners",
      startImmediately: true,
      repoRoot: tmp,
      now,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const late = proposeDevTask({
      title: "Late join",
      description: "join sprint",
      ownerEmployeeId: "david",
      now,
    });
    upsertDevTasks([late], tmp);
    const sprint = assignTasksToSprint({
      sprintId: created.sprint.id,
      taskIds: [late.id],
      repoRoot: tmp,
      now: "2026-07-31T17:01:00.000Z",
    });
    assert.ok(sprint?.workItemIds.includes(late.id));
    assert.ok(sprint?.priorityOrder.includes(late.id));
  });
});
