import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planCollaborationChain, applyApprovalDecision } from "@/services/builder/collaboration.logic";
import { upsertCollaboration } from "@/services/builder/collaboration.store";
import {
  prioritizeMissions,
  scoreMissionPriority,
  reorderEmployeeQueue,
} from "@/services/builder/priority.logic";
import {
  applyDelegate,
  applySplitMission,
  detectBlockedMissions,
  findDuplicateMissions,
  runCoordination,
} from "@/services/builder/orchestrator.logic";
import {
  applyLearningToRecommendations,
  computeLearningStats,
  recordMissionOutcome,
} from "@/services/builder/learning.logic";
import { buildWorkDayCycle, detectWorkDayPhase } from "@/services/builder/workday.logic";
import { runAutonomyAction, runCompanyOperatingSystem } from "@/services/builder/os.service";
import { buildExecutiveBrief } from "@/services/builder/proactive.logic";
import { computeCompanyHealth } from "@/services/builder/proactive.logic";

function mission(id: string, title: string, lead: string, missionText: string) {
  return planCollaborationChain({
    missionId: id,
    title,
    mission: missionText,
    leadEmployeeId: lead,
    planSummary: title,
    planSteps: ["Analyze", "Execute"],
    now: "2026-07-21T08:00:00.000Z",
  });
}

describe("mission priority engine", () => {
  it("scores urgency, value, effort, owner, and dependencies", () => {
    const m = mission(
      "TASK-OS-P1",
      "Urgent sales pipeline risk proposal",
      "sarah",
      "Critical sales pipeline risk — prepare proposal and email today"
    );
    const scored = scoreMissionPriority(m, { now: "2026-07-21T10:00:00.000Z" });
    assert.ok(["P0", "P1", "P2", "P3"].includes(scored.priority));
    assert.ok(scored.urgency >= 1 && scored.urgency <= 100);
    assert.ok(scored.businessValue >= 1);
    assert.ok(scored.estimatedEffort >= 1);
    assert.ok(scored.recommendedOwnerId.length > 0);
    assert.ok(Array.isArray(scored.dependencies));

    const ordered = prioritizeMissions([
      m,
      mission("TASK-OS-P2", "Routine document tidy", "david", "Organize document templates"),
    ]);
    assert.ok(ordered[0].score >= ordered[1].score);
    const queue = reorderEmployeeQueue("sarah", [m]);
    assert.ok(queue.length >= 1);
  });
});

describe("company coordination", () => {
  it("detects blocked missions, duplicates, and rebalances", () => {
    const a = mission("TASK-OS-D1", "Customer follow-up pack", "sarah", "Sales follow-up email");
    const b = mission("TASK-OS-D2", "Customer follow-up pack", "emma", "Sales follow-up email duplicate");
    const blocked = applyApprovalDecision(a, "reject", "No", "2026-07-21T09:00:00.000Z");
    // force a blocked step for detection
    blocked.chain[blocked.chain.length - 1].status = "blocked";

    const dups = findDuplicateMissions([a, b]);
    assert.ok(dups.length >= 1);

    const blockedList = detectBlockedMissions([blocked]);
    assert.ok(blockedList.length >= 1);

    const plan = runCoordination([a, b, blocked], { now: "2026-07-21T10:00:00.000Z" });
    assert.ok(plan.assignments.length >= 1);
    assert.ok(plan.duplicates.length >= 1);
    assert.ok(plan.autonomyEvents.length >= 1);
  });

  it("supports delegate and split autonomy", () => {
    const m = mission("TASK-OS-A1", "Calendar prep pack", "alex", "Schedule conflict meeting prep");
    const delegated = applyDelegate(m, "mia", "2026-07-21T11:00:00.000Z");
    assert.equal(delegated.mission.leadEmployeeId, "mia");
    assert.equal(delegated.event.kind, "delegate");

    const split = applySplitMission(m, "2026-07-21T11:05:00.000Z");
    assert.equal(split.event.kind, "split");
    assert.ok(split.secondary.id.endsWith("-B"));
  });
});

describe("learning system", () => {
  it("records outcomes and improves recommendation confidence", () => {
    const m = applyApprovalDecision(
      mission("TASK-OS-L1", "Email digest", "emma", "Draft email digest"),
      "approve",
      null,
      "2026-07-21T12:00:00.000Z"
    );
    const outcome = recordMissionOutcome(m, "2026-07-21T12:00:00.000Z");
    assert.equal(outcome.success, true);
    assert.equal(outcome.approved, true);
    assert.ok(outcome.collaborationEfficiency > 0);

    const stats = computeLearningStats([
      outcome,
      { ...outcome, missionId: "TASK-OS-L2", success: true, approved: true },
      { ...outcome, missionId: "TASK-OS-L3", success: false, approved: false },
    ]);
    assert.ok(stats.sampleSize === 3);
    assert.ok(stats.byEmployee.emma);

    const adjusted = applyLearningToRecommendations(
      [
        {
          id: "rec-1",
          title: "t",
          recommendation: "Recommend sending proposal before 3 PM.",
          reasoning: "Base.",
          confidence: 70,
          expectedImpact: "impact",
          category: "opportunity",
          leadEmployeeId: "emma",
          participatingEmployees: [],
          internalDiscussion: [],
          status: "pending",
          ceoNote: null,
          reassignedToEmployeeId: null,
          delayedUntil: null,
          signalIds: [],
          createdAt: "2026-07-21T12:00:00.000Z",
          updatedAt: "2026-07-21T12:00:00.000Z",
        },
      ],
      stats
    );
    assert.notEqual(adjusted[0].confidence, 70);
    assert.match(adjusted[0].reasoning, /Historical success/);
  });
});

describe("work day cycle", () => {
  it("builds morning, working, and end-of-day snapshots", () => {
    const phase = detectWorkDayPhase(new Date("2026-07-21T01:00:00.000Z")); // UTC+9 morning-ish
    assert.ok(["morning", "working", "end_of_day"].includes(phase));

    const brief = buildExecutiveBrief({
      recommendations: [],
      pendingApprovals: [],
      generatedAtDisplay: "now",
    });
    const health = computeCompanyHealth({
      metrics: {
        activeMissions: 1,
        employeesWorking: 2,
        waitingForApproval: 1,
        completedToday: 1,
        averageCompletionTimeMs: 1000,
        averageCompletionTimeDisplay: "1s",
        companyProductivity: 75,
      },
      recommendations: [],
      risks: ["Schedule conflict"],
    });
    const cycle = buildWorkDayCycle({
      phase: "morning",
      now: "2026-07-21T00:00:00.000Z",
      executiveBrief: brief,
      companyHealth: health,
      metrics: {
        activeMissions: 1,
        employeesWorking: 2,
        waitingForApproval: 1,
        completedToday: 1,
        averageCompletionTimeMs: 1000,
        averageCompletionTimeDisplay: "1s",
        companyProductivity: 75,
      },
      priorities: [],
      coordination: {
        assignments: [],
        rebalanced: [],
        blocked: [],
        optimizedChains: [],
        duplicates: [],
        autonomyEvents: [],
      },
      learning: {
        successRate: 0.8,
        approvalRate: 0.7,
        averageCompletionTimeMs: 1000,
        averageCollaborationEfficiency: 80,
        sampleSize: 5,
        byEmployee: {},
      },
      risks: ["Schedule conflict"],
      opportunities: ["Inactive customers"],
    });

    assert.equal(cycle.phase, "morning");
    assert.ok(cycle.morning.checklist.includes("Review email"));
    assert.ok(cycle.working.monitoring.includes("Collaborate automatically"));
    assert.ok(cycle.endOfDay.productivityNote.length > 0);
  });
});

describe("operating system integration", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-os-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
    upsertCollaboration(
      mission(
        "TASK-OS-INT",
        "Urgent sales proposal email",
        "sarah",
        "Sales opportunity proposal document and email"
      ),
      tmp
    );
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("runs command center payload and autonomy API actions", () => {
    const os = runCompanyOperatingSystem({
      repoRoot: tmp,
      now: "2026-07-21T02:00:00.000Z",
      generatedAtDisplay: "2026-07-21 11:00",
    });
    assert.ok(os.commandCenter.companyHealth.score >= 1);
    assert.ok(Array.isArray(os.commandCenter.activeMissions));
    assert.ok(os.commandCenter.workday.phase);
    assert.ok(os.commandCenter.missionPriorities.length >= 1);
    assert.ok(os.executiveBrief.headline.length > 0);

    const delegated = runAutonomyAction({
      action: "delegate",
      missionId: "TASK-OS-INT",
      toEmployeeId: "david",
      repoRoot: tmp,
      now: "2026-07-21T03:00:00.000Z",
    });
    assert.equal(delegated.ok, true);
  });
});
