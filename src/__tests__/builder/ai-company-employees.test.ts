import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AI_COMPANY_EMPLOYEES,
  matchEmployeeIdForText,
  getEmployeeDefinition,
} from "@/services/builder/ai-company-employees";
import {
  createCeoMission,
  reconcileTaskIndex,
  TASK_BOARD_REL,
  TASK_DETAILS_DIR_REL,
} from "@/services/builder/mission.service";

describe("AI Company employee catalog", () => {
  it("includes the eight named employees", () => {
    const ids = AI_COMPANY_EMPLOYEES.map((e) => e.id);
    assert.deepEqual(ids, [
      "emma",
      "alex",
      "sarah",
      "david",
      "mia",
      "noah",
      "olivia",
      "ethan",
    ]);
  });

  it("maps domain text to employees without runtime terms", () => {
    assert.equal(matchEmployeeIdForText("Gmail AI Employee inbox triage"), "emma");
    assert.equal(matchEmployeeIdForText("Build Calendar AI Employee v1"), "alex");
    assert.equal(getEmployeeDefinition("alex")?.role, "DevOps Engineer");
    assert.equal(getEmployeeDefinition("alex")?.productRole, "devops");
    assert.equal(getEmployeeDefinition("sarah")?.productRole, "ceo");
    assert.equal(getEmployeeDefinition("david")?.productRole, "cto");
    assert.equal(getEmployeeDefinition("mia")?.productRole, "frontend");
    assert.equal(getEmployeeDefinition("noah")?.productRole, "backend");
    assert.equal(getEmployeeDefinition("ethan")?.productRole, "qa");
    assert.equal(getEmployeeDefinition("emma")?.productRole, "product");
  });

  it("exposes personality fields for each employee", () => {
    for (const emp of AI_COMPANY_EMPLOYEES) {
      assert.ok(emp.avatar.initials.length >= 1);
      assert.ok(emp.expertise.length >= 1);
      assert.ok(emp.communicationStyle.length > 10);
      assert.ok(emp.responsibilities.length >= 1);
    }
  });
});

describe("mission write consistency", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hq-mission-safe-"));
    for (const rel of [
      TASK_DETAILS_DIR_REL,
      "docs/ai-team/ops/sprints",
      "docs/ai-team/runtime/audit",
      "docs/ai-team/runtime/agents",
      "docs/ai-team/ops/releases",
    ]) {
      fs.mkdirSync(path.join(tmp, rel), { recursive: true });
    }
    fs.writeFileSync(
      path.join(tmp, TASK_BOARD_REL),
      `# Task Board

**Last updated:** 2026-07-29

## Summary

| Metric | Count |
|--------|------:|
| Total tasks | 0 |
| Waiting CEO | 0 |

## All Tasks

| ID | Title | Owner | Priority | Status | Sprint | Milestone | Updated |
|----|-------|-------|----------|--------|--------|-----------|---------|
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "docs/ai-team/SPRINTS.md"),
      `## Active Sprint

### SPRINT-004 — Test

| Field | Value |
|-------|--------|
| **ID** | \`SPRINT-004\` |
| **Name** | Test |
| **Goal** | Test |
| **Status** | \`ACTIVE\` |
| **Capacity** | maxActiveTasks: 1 |

**Committed tasks**

| Task ID | Title | Status |
|---------|-------|--------|
`,
      "utf8"
    );
    fs.writeFileSync(
      path.join(tmp, "docs/ai-team/ops/sprints/SPRINT-004.md"),
      `# SPRINT-004

| Field | Value |
|-------|--------|
| **Capacity** | maxActiveTasks: 1 |

## Committed tasks

| Task ID | Title | Priority |
|---------|-------|----------|
`,
      "utf8"
    );
    fs.writeFileSync(path.join(tmp, "docs/ai-team/ops/DECISION_MEMORY.md"), "", "utf8");
    fs.writeFileSync(path.join(tmp, "docs/ai-team/ops/TECH_DEBT.md"), "", "utf8");
    fs.writeFileSync(path.join(tmp, "docs/ai-team/ops/IMPROVEMENT_BACKLOG.md"), "", "utf8");
    fs.writeFileSync(
      path.join(tmp, "docs/ai-team/runtime/audit/AUDIT.log.md"),
      `# Audit

| Audit ID | Timestamp | Actor type | Actor ID | Task ID | Action | Before → After | Rationale |
|----------|-----------|------------|----------|---------|--------|----------------|-----------|
| AUD-INIT-0001 | 2026-07-08T12:40:00+09:00 | SYSTEM | runtime | — | RUNTIME_INITIALIZED | {} → {} | init |
`,
      "utf8"
    );
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("writes board using TASKS.md path and indexes the task", async () => {
    const result = await createCeoMission(
      "Unique calendar conflict digest for Alex employee tests",
      { repoRoot: tmp, employeeId: "alex" }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const board = fs.readFileSync(path.join(tmp, TASK_BOARD_REL), "utf8");
    assert.match(board, new RegExp(result.taskId));
    assert.match(board, /WAITING_CEO/);
    assert.equal(fs.existsSync(path.join(tmp, TASK_DETAILS_DIR_REL, `${result.taskId}.md`)), true);
    assert.ok(result.collaboration);
    assert.equal(result.collaboration.leadEmployeeId, "alex");
    assert.equal(result.collaboration.approvalStatus, "pending");
    assert.ok(result.collaboration.chain.length >= 1);
  });

  it("reconcile is idempotent when already indexed", async () => {
    const created = await createCeoMission(
      "Idempotent reconcile seed mission for board indexing tests",
      { repoRoot: tmp }
    );
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const again = reconcileTaskIndex(created.taskId, { repoRoot: tmp });
    assert.equal(again.ok, true);
    if (again.ok) assert.deepEqual(again.updated, []);
  });

  it("reconcile indexes an orphan detail without duplicating", () => {
    const orphanId = "TASK-2026-07-29-099";
    fs.writeFileSync(
      path.join(tmp, TASK_DETAILS_DIR_REL, `${orphanId}.md`),
      `# ${orphanId}\n\n| Field | Value |\n|-------|--------|\n| **Title** | Orphan calendar mission |\n| **Created** | 2026-07-29 |\n`,
      "utf8"
    );
    const once = reconcileTaskIndex(orphanId, { repoRoot: tmp });
    assert.equal(once.ok, true);
    if (once.ok) assert.ok(once.updated.includes(TASK_BOARD_REL));
    const twice = reconcileTaskIndex(orphanId, { repoRoot: tmp });
    assert.equal(twice.ok, true);
    if (twice.ok) assert.deepEqual(twice.updated, []);
    const board = fs.readFileSync(path.join(tmp, TASK_BOARD_REL), "utf8");
    const rowHits = board.split(`| [${orphanId}]`).length - 1;
    assert.equal(rowHits, 1);
  });
});
