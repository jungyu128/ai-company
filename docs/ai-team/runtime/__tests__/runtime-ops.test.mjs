/**
 * Stage 5 Daily Operations — Builder Runtime tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RELEASE_CHECK_KEYS,
  buildDailyCeoBriefing,
  buildWeeklyEngineeringReport,
  prioritizeTechDebt,
  proposeImprovements,
  validateDecisionMemory,
  validateImprovementProposal,
  validateReleaseChecklist,
  validateSprintPlan,
  validateTechDebtItem,
} from "../lib/runtime-ops.mjs";
import { createRuntimeSession } from "../lib/runtime-controller.mjs";

const TASK = "TASK-2026-07-21-001";

describe("daily CEO briefing", () => {
  it("builds briefing with focus on WAITING_CEO", () => {
    const result = buildDailyCeoBriefing({
      date: "2026-07-21",
      sprintId: "SPRINT-001",
      sprintGoal: "Ship ops",
      tasks: [
        { id: TASK, title: "Ops stage", status: "WAITING_CEO", priority: "P0", ownerRole: "PM" },
        { id: "TASK-2026-07-21-002", title: "Other", status: "IN_PROGRESS", priority: "P1", ownerRole: "Backend" },
      ],
      agents: [
        { role: "Backend", state: "Working", currentTaskId: "TASK-2026-07-21-002" },
        { role: "PM", state: "Idle" },
      ],
    });
    assert.equal(result.ok, true);
    assert.match(result.value.headline, /TASK-2026-07-21-001/);
    assert.equal(result.value.counts.waitingCeo, 1);
    assert.equal(result.value.agents.occupied.length, 1);
    assert.equal(result.value.agents.idle.includes("PM"), true);
    assert.match(result.value.markdown, /Daily CEO Briefing/);
  });

  it("rejects invalid date", () => {
    const result = buildDailyCeoBriefing({ date: "21-07-2026" });
    assert.equal(result.ok, false);
    assert.equal(result.code, "VALIDATION_FAILED");
  });
});

describe("sprint planning", () => {
  it("validates a capacity-safe plan", () => {
    const result = validateSprintPlan({
      sprintId: "SPRINT-002",
      name: "Daily Ops",
      goal: "Run company like software shop",
      start: "2026-07-21",
      end: "2026-07-28",
      status: "ACTIVE",
      committedTaskIds: [TASK],
      capacityHints: { maxActiveTasks: 3 },
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.capacity, 3);
  });

  it("rejects over-capacity and bad ids", () => {
    const result = validateSprintPlan({
      sprintId: "bad",
      name: "x",
      goal: "y",
      start: "2026-07-28",
      end: "2026-07-21",
      committedTaskIds: ["NOT-A-TASK", TASK, "TASK-2026-07-21-002", "TASK-2026-07-21-003"],
      capacityHints: { maxActiveTasks: 2 },
    });
    assert.equal(result.ok, false);
    const codes = result.errors.map((e) => e.code);
    assert.ok(codes.includes("INVALID_SPRINT_ID"));
    assert.ok(codes.includes("INVALID_RANGE"));
    assert.ok(codes.includes("OVER_CAPACITY"));
    assert.ok(codes.includes("INVALID_TASK_ID"));
  });

  it("rejects NaN / non-integer capacity", () => {
    const nanCap = validateSprintPlan({
      sprintId: "SPRINT-004",
      name: "Capacity guard",
      goal: "Reject invalid capacity",
      start: "2026-07-21",
      end: "2026-07-28",
      committedTaskIds: [TASK],
      capacityHints: { maxActiveTasks: "abc" },
    });
    assert.equal(nanCap.ok, false);
    assert.ok(nanCap.errors.some((e) => e.code === "INVALID_CAPACITY"));

    const frac = validateSprintPlan({
      sprintId: "SPRINT-005",
      name: "Capacity guard",
      goal: "Reject fractional capacity",
      start: "2026-07-21",
      end: "2026-07-28",
      committedTaskIds: [TASK],
      capacityHints: { maxActiveTasks: 1.5 },
    });
    assert.equal(frac.ok, false);
    assert.ok(frac.errors.some((e) => e.code === "INVALID_CAPACITY"));
  });
});

describe("decision memory", () => {
  it("validates and formats decision entries", () => {
    const result = validateDecisionMemory({
      decisionId: "DEC-2026-07-21-001",
      date: "2026-07-21",
      taskId: TASK,
      summary: "Use Builder Runtime for daily ops",
      decision: "Stage 5 ops stay in docs/ai-team/ops",
      rationale: "Feature 38 deferred",
      decidedBy: "CEO",
      tags: ["stage5", "ops"],
    });
    assert.equal(result.ok, true);
    assert.match(result.value.decisionId, /^DEC-/);
  });

  it("rejects incomplete memory", () => {
    const result = validateDecisionMemory({ decisionId: "x", summary: "no" });
    assert.equal(result.ok, false);
  });
});

describe("improvement proposals", () => {
  it("proposes from AGENT_BUSY and P0 debt", () => {
    const result = proposeImprovements({
      date: "2026-07-21",
      deniedDispatches: [{ code: "AGENT_BUSY", role: "Backend", taskId: TASK }],
      openDebt: [{ debtId: "DEBT-2026-07-21-001", title: "Flaky gate", severity: "P0", impact: "Blocks ship" }],
      failedGates: [{ gate: "qa", message: "tests failed twice" }],
    });
    assert.equal(result.ok, true);
    assert.ok(result.value.proposals.length >= 3);
    assert.equal(result.value.proposals[0].improvementId, "IMP-2026-07-21-001");
    const v = validateImprovementProposal(result.value.proposals[0]);
    assert.equal(v.ok, true);
  });

  it("returns empty set when no signals", () => {
    const result = proposeImprovements({ date: "2026-07-21" });
    assert.equal(result.ok, true);
    assert.equal(result.value.proposals.length, 0);
  });

  it("skips existing improvement ids for uniqueness", () => {
    const result = proposeImprovements({
      date: "2026-07-21",
      existingIds: ["IMP-2026-07-21-001", "IMP-2026-07-21-002"],
      deniedDispatches: [{ code: "AGENT_BUSY", role: "Backend", taskId: TASK }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.proposals.length, 1);
    assert.equal(result.value.proposals[0].improvementId, "IMP-2026-07-21-003");
  });
});

describe("weekly engineering report", () => {
  it("summarizes shipped, open, debt, risks", () => {
    const result = buildWeeklyEngineeringReport({
      weekOf: "2026-07-21",
      sprintId: "SPRINT-001",
      tasks: [
        { id: TASK, title: "Done item", status: "DONE" },
        { id: "TASK-2026-07-21-002", title: "Blocked", status: "BLOCKED", ownerRole: "PM" },
      ],
      decisions: [{ decisionId: "DEC-2026-07-21-001", summary: "Ops in builder" }],
      debt: [{ debtId: "DEBT-2026-07-21-001", title: "P0 debt", severity: "P0", status: "OPEN" }],
      improvements: [{ improvementId: "IMP-2026-07-21-001", title: "Fix busy", status: "PROPOSED" }],
      releases: ["REL-TASK-2026-07-21-001"],
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.shipped.length, 1);
    assert.equal(result.value.stillOpen.length, 1);
    assert.ok(result.value.risks.some((r) => r.includes("Blocked")));
    assert.ok(result.value.risks.some((r) => r.includes("P0 debt")));
    assert.match(result.value.markdown, /Weekly Engineering Report/);
  });
});

describe("release checklist", () => {
  it("passes when all checks true", () => {
    const checks = Object.fromEntries(RELEASE_CHECK_KEYS.map((k) => [k, true]));
    const result = validateReleaseChecklist({ taskId: TASK, ...checks });
    assert.equal(result.ok, true);
    assert.equal(result.value.ready, true);
    assert.equal(result.value.recommendation, "READY_FOR_CEO_SHIP");
  });

  it("blocks when any check false", () => {
    const checks = Object.fromEntries(RELEASE_CHECK_KEYS.map((k) => [k, true]));
    checks.testsGreen = false;
    const result = validateReleaseChecklist({ taskId: TASK, ...checks });
    assert.equal(result.ok, true);
    assert.equal(result.value.ready, false);
    assert.deepEqual(result.value.failed, ["testsGreen"]);
  });

  it("rejects missing boolean checks", () => {
    const result = validateReleaseChecklist({ taskId: TASK });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.code === "MISSING_CHECK"));
  });
});

describe("tech debt tracking", () => {
  it("validates and prioritizes debt", () => {
    const a = validateTechDebtItem({
      debtId: "DEBT-2026-07-21-001",
      title: "Missing migration docs",
      severity: "P2",
      status: "OPEN",
      ownerRole: "DevOps",
    });
    const b = validateTechDebtItem({
      debtId: "DEBT-2026-07-21-002",
      title: "Race in cancel",
      severity: "P0",
      status: "OPEN",
      relatedTaskId: TASK,
      ownerRole: "Backend",
    });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    const p = prioritizeTechDebt([a.value, b.value, { debtId: "x", severity: "P1", status: "DONE", title: "done" }]);
    assert.equal(p.ok, true);
    assert.equal(p.value.items[0].severity, "P0");
    assert.equal(p.value.count, 2);
  });
});

describe("session Stage 5 hooks", () => {
  it("audits daily briefing and sprint validation", () => {
    const session = createRuntimeSession("ops-test");
    const briefing = session.buildDailyCeoBriefing({
      date: "2026-07-21",
      tasks: [{ id: TASK, title: "T", status: "BLOCKED", priority: "P1" }],
      agents: [],
    });
    assert.equal(briefing.ok, true);
    const sprint = session.validateSprintPlan({
      sprintId: "SPRINT-003",
      name: "Ops sprint",
      goal: "Daily company cadence",
      start: "2026-07-21",
      end: "2026-07-28",
      committedTaskIds: [TASK],
    });
    assert.equal(sprint.ok, true);
    const actions = session.getAudit().map((a) => a.action);
    assert.ok(actions.includes("DAILY_BRIEFING_BUILT"));
    assert.ok(actions.includes("SPRINT_PLAN_VALID"));
  });

  it("audits improvements, release, and debt", () => {
    const session = createRuntimeSession("ops-test-2");
    session.proposeImprovements({
      date: "2026-07-21",
      cancelDenied: [{ code: "ADVANCE_IN_PROGRESS" }],
    });
    const checks = Object.fromEntries(RELEASE_CHECK_KEYS.map((k) => [k, true]));
    session.validateReleaseChecklist({ taskId: TASK, ...checks });
    session.validateTechDebtItem({
      debtId: "DEBT-2026-07-21-003",
      title: "Doc drift",
      severity: "P3",
    });
    session.validateDecisionMemory({
      decisionId: "DEC-2026-07-21-002",
      summary: "Keep builder ops separate from Feature 38",
      decision: "No Feature 38 in this stage",
      decidedBy: "CEO",
    });
    const actions = session.getAudit().map((a) => a.action);
    assert.ok(actions.includes("IMPROVEMENTS_PROPOSED"));
    assert.ok(actions.includes("RELEASE_CHECKLIST_VALID"));
    assert.ok(actions.includes("TECH_DEBT_VALID"));
    assert.ok(actions.includes("DECISION_MEMORY_VALID"));
  });
});
