/**
 * Company Analytics — observe-only KPIs, dimensions, history.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { upsertDevTasks } from "@/services/builder/autonomous-company/autonomous-company.store";
import { proposeDevTask } from "@/services/builder/autonomous-company/autonomy.logic";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import { upsertCollaboration } from "@/services/builder/collaboration.store";
import { createCompanyMeeting } from "@/services/builder/meetings";
import { createCompanySprint } from "@/services/builder/sprints";
import { upsertExecution } from "@/services/builder/execution/execution.store";
import type { ExecutionRecord } from "@/services/builder/execution/types";
import {
  computeEmployeeProductivity,
  computeRecurringBlockers,
  computeMeetingEfficiency,
  computeApprovalTurnaround,
  computeQaRates,
  buildCompanyAnalyticsSnapshot,
  filterTasksForDimension,
} from "@/services/builder/analytics/analytics.logic";
import {
  computeCompanyAnalyticsSnapshot,
  getCompanyAnalyticsView,
  recordCompanyAnalyticsSample,
} from "@/services/builder/analytics/analytics.service";
import { getAutonomyStore } from "@/services/builder/autonomous-company/autonomous-company.store";

function exec(
  id: string,
  status: ExecutionRecord["status"]
): ExecutionRecord {
  return {
    id,
    employeeId: "ethan",
    employeeName: "Ethan",
    missionId: null,
    system: "gmail",
    action: "gmail.send_email",
    requestedAction: "Send",
    preview: { summary: "p", details: {}, sourceSnapshot: {} },
    prepareParams: {},
    dataFingerprint: "fp",
    status,
    approvalDecision: status === "succeeded" ? "approve" : null,
    ceoNote: null,
    executionStatus:
      status === "succeeded" ? "succeeded" : status === "failed" ? "failed" : "not_started",
    externalReference: null,
    verificationResult: status === "succeeded" ? "ok" : null,
    errorDetails: status === "failed" ? "boom" : null,
    idempotencyKey: `idem-${id}`,
    connection: {
      system: "gmail",
      connected: true,
      reason: null,
      checkedAt: "2026-07-31T10:00:00.000Z",
    },
    createdAt: "2026-07-31T10:00:00.000Z",
    updatedAt: "2026-07-31T10:00:00.000Z",
    approvedAt: null,
    executedAt: null,
  };
}

describe("analytics logic", () => {
  it("computes productivity, blockers, meetings, approvals, and QA rates", () => {
    const now = "2026-07-31T12:00:00.000Z";
    const done = {
      ...proposeDevTask({
        title: "Done work",
        description: "done",
        ownerEmployeeId: "mia",
        now: "2026-07-31T08:00:00.000Z",
        status: "done",
      }),
      updatedAt: "2026-07-31T11:00:00.000Z",
    };
    const blocked = proposeDevTask({
      title: "Blocked work",
      description: "blocked",
      ownerEmployeeId: "noah",
      now,
      status: "blocked",
    });
    blocked.blocker = "Waiting on CEO acceptance criteria";
    const clarify = proposeDevTask({
      title: "Needs clarity",
      description: "clarify",
      ownerEmployeeId: "ethan",
      now,
      status: "needs_clarification",
    });
    clarify.missingRequirements = ["Waiting on CEO acceptance criteria"];

    const productivity = computeEmployeeProductivity([done, blocked, clarify]);
    const mia = productivity.find((p) => p.employeeId === "mia");
    assert.ok(mia);
    assert.equal(mia.completed, 1);
    assert.ok((mia.avgCompletionHours ?? 0) >= 2);

    const blockers = computeRecurringBlockers([done, blocked, clarify]);
    assert.ok(blockers.some((b) => b.count >= 2));

    const meetings = computeMeetingEfficiency([
      {
        id: "M1",
        kind: "qa_review",
        title: "QA",
        purpose: "p",
        status: "awaiting_ceo",
        participantIds: ["ethan"],
        agenda: [],
        discussion: [],
        decisions: [
          {
            id: "d1",
            text: "Ship",
            proposedByEmployeeId: "ethan",
            status: "proposed",
          },
        ],
        actionItems: [
          {
            id: "a1",
            text: "Test",
            ownerEmployeeId: "ethan",
            ownerName: "Ethan",
            dueDate: "2026-08-01",
            status: "open",
          },
        ],
        owners: ["ethan"],
        dueDates: ["2026-08-01"],
        workItemId: null,
        workItemTitle: null,
        missionId: null,
        synthesis: "Ready",
        ceoJoined: false,
        ceoComments: [],
        ceoDecision: null,
        ceoNote: null,
        createdAt: now,
        updatedAt: now,
        presentedToCeoAt: now,
      },
    ]);
    assert.equal(meetings.efficiencyPercent, 100);

    const mission = planCollaborationChain({
      missionId: "TASK-AN-1",
      title: "Analytics mission",
      mission: "Track KPIs",
      leadEmployeeId: "emma",
      planSummary: "Plan",
      planSteps: ["Measure"],
      now: "2026-07-31T08:00:00.000Z",
    });
    mission.approvalStatus = "approved";
    mission.updatedAt = "2026-07-31T10:00:00.000Z";
    const approvals = computeApprovalTurnaround([mission]);
    assert.equal(approvals.decided, 1);
    assert.ok((approvals.avgTurnaroundHours ?? 0) >= 1);

    const qa = computeQaRates({
      tasks: [clarify],
      executions: [exec("e1", "succeeded"), exec("e2", "failed")],
    });
    assert.ok(qa.pass >= 1);
    assert.ok(qa.fail >= 1);
    assert.ok(qa.passRatePercent != null);
  });

  it("filters tasks by employee, team, sprint, and work item", () => {
    const tasks = [
      {
        ...proposeDevTask({
          title: "A",
          description: "a",
          ownerEmployeeId: "mia",
          now: "2026-07-31T12:00:00.000Z",
        }),
        id: "T1",
        sprintId: "SPRINT-1",
      },
      {
        ...proposeDevTask({
          title: "B",
          description: "b",
          ownerEmployeeId: "noah",
          now: "2026-07-31T12:00:00.000Z",
        }),
        id: "T2",
        sprintId: "SPRINT-2",
      },
    ];
    assert.equal(
      filterTasksForDimension({
        tasks,
        dimension: "employee",
        dimensionId: "mia",
      }).length,
      1
    );
    assert.equal(
      filterTasksForDimension({
        tasks,
        dimension: "team",
        dimensionId: "Engineering",
      }).length,
      2
    );
    assert.equal(
      filterTasksForDimension({
        tasks,
        dimension: "sprint",
        dimensionId: "SPRINT-1",
      })[0]?.id,
      "T1"
    );
    assert.equal(
      filterTasksForDimension({
        tasks,
        dimension: "work_item",
        dimensionId: "T2",
      })[0]?.id,
      "T2"
    );
  });
});

describe("analytics service", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "an-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("builds a company snapshot with all required KPIs", () => {
    const now = "2026-07-31T14:00:00.000Z";
    const tasks = [
      proposeDevTask({
        title: "Active",
        description: "a",
        ownerEmployeeId: "mia",
        now,
        status: "in_progress",
      }),
      proposeDevTask({
        title: "Blocked",
        description: "b",
        ownerEmployeeId: "noah",
        now,
        status: "blocked",
      }),
    ];
    tasks[1]!.blocker = "Waiting on design review";
    upsertDevTasks(tasks, tmp);

    createCompanySprint({
      name: "Analytics Sprint",
      goal: "Measure ops",
      workItemIds: tasks.map((t) => t.id),
      startImmediately: true,
      repoRoot: tmp,
      now,
    });
    createCompanyMeeting({
      kind: "architecture_review",
      workItemTitle: "Analytics",
      repoRoot: tmp,
      now,
    });
    upsertExecution(exec("ex-ok", "succeeded"), tmp);
    upsertExecution(exec("ex-bad", "failed"), tmp);

    const mission = planCollaborationChain({
      missionId: "TASK-AN-SVC",
      title: "Mission",
      mission: "Ship analytics",
      leadEmployeeId: "emma",
      planSummary: "Plan",
      planSteps: ["Build"],
      now: "2026-07-31T10:00:00.000Z",
    });
    mission.approvalStatus = "approved";
    mission.updatedAt = "2026-07-31T12:00:00.000Z";
    upsertCollaboration(mission, tmp);

    const snap = computeCompanyAnalyticsSnapshot({
      repoRoot: tmp,
      now: "2026-07-31T14:05:00.000Z",
    });

    assert.equal(snap.dimension, "company");
    assert.ok(snap.kpis.employeeProductivityAvg >= 0);
    assert.ok(snap.kpis.sprintVelocity >= 0);
    assert.equal(snap.kpis.blockedWorkCount, 1);
    assert.ok(snap.kpis.meetingEfficiencyPercent >= 0);
    assert.ok(snap.kpis.approvalTurnaroundHours != null);
    assert.ok(snap.kpis.qaPassRatePercent != null);
    assert.ok(snap.kpis.companyHealthScore >= 0);
    assert.ok(snap.employees.length >= 1);
    assert.ok(snap.workDistribution.byEmployee.length >= 1);
    assert.ok(snap.recurringBlockers.length >= 1);
    assert.ok(snap.sprint.activeSprintName);

    const beforeTasks = getAutonomyStore(tmp).tasks.length;
    const employeeView = getCompanyAnalyticsView({
      repoRoot: tmp,
      dimension: "employee",
      dimensionId: "mia",
    });
    assert.equal(employeeView.snapshot.dimension, "employee");
    assert.equal(getAutonomyStore(tmp).tasks.length, beforeTasks);
  });

  it("records historical samples without mutating work items", () => {
    const now = "2026-07-31T15:00:00.000Z";
    upsertDevTasks(
      [
        proposeDevTask({
          title: "Sample task",
          description: "s",
          ownerEmployeeId: "alex",
          now,
          status: "in_progress",
        }),
      ],
      tmp
    );
    const before = JSON.stringify(getAutonomyStore(tmp).tasks);

    const first = recordCompanyAnalyticsSample({
      repoRoot: tmp,
      now,
      minIntervalMs: 0,
    });
    assert.equal(first.ok, true);
    if (!first.ok || !first.sample) return;
    assert.ok(first.sample.healthScore >= 0);

    const throttled = recordCompanyAnalyticsSample({
      repoRoot: tmp,
      now: "2026-07-31T15:01:00.000Z",
      minIntervalMs: 120_000,
    });
    assert.equal(throttled.ok, true);
    if (!throttled.ok) return;
    assert.equal(throttled.skipped, true);

    const second = recordCompanyAnalyticsSample({
      repoRoot: tmp,
      now: "2026-07-31T15:10:00.000Z",
      minIntervalMs: 0,
    });
    assert.equal(second.ok, true);

    const view = getCompanyAnalyticsView({ repoRoot: tmp });
    assert.ok(view.history.length >= 2);
    assert.ok(view.trends.health.length >= 2);
    assert.equal(JSON.stringify(getAutonomyStore(tmp).tasks), before);
  });

  it("builds a snapshot purely from inputs without side effects", () => {
    const snap = buildCompanyAnalyticsSnapshot({
      workspaceId: "default",
      now: "2026-07-31T16:00:00.000Z",
      tasks: [],
      missions: [],
      meetings: [],
      executions: [],
      activeSprint: null,
      sprintMetrics: null,
    });
    assert.equal(snap.healthLabel.length > 0, true);
    assert.equal(snap.kpis.activeWorkCount, 0);
  });
});
