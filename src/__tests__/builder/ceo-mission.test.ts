import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  MISSION_MAX_CHARS,
  validateCeoMissionInput,
} from "@/services/builder/mission-validation";
import { generateMissionPlan } from "@/services/builder/mission-plan";
import { isInternalAiCompanyEnabled } from "@/services/builder/internal-ai-company";
import { createCeoMission } from "@/services/builder/mission.service";
import { getText } from "@/services/builder/storage";

describe("CEO Mission validation", () => {
  it("rejects empty mission", () => {
    const r = validateCeoMissionInput("   ");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "EMPTY");
  });

  it("rejects overly long mission", () => {
    const r = validateCeoMissionInput("x".repeat(MISSION_MAX_CHARS + 1));
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "TOO_LONG");
  });

  it("rejects duplicate title/goal", () => {
    const r = validateCeoMissionInput("Ship calendar digest", [
      "Ship calendar digest",
    ]);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DUPLICATE");
  });

  it("accepts a valid mission and derives title", () => {
    const r = validateCeoMissionInput("Add conflict warnings to morning brief");
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, "Add conflict warnings to morning brief");
      assert.match(r.value.mission, /conflict warnings/);
    }
  });
});

describe("CEO Mission plan", () => {
  it("requires proposal approval before code", () => {
    const plan = generateMissionPlan({
      taskId: "TASK-2026-07-28-099",
      title: "Test mission",
      mission: "Do the thing",
    });
    assert.match(plan.approvalGate, /proposal only/);
    assert.ok(plan.steps.length >= 3);
    assert.match(plan.markdown, /no code|WAITING_CEO|proposal/i);
    assert.match(plan.steps.join(" "), /proposal only/);
  });
});

describe("INTERNAL_AI_COMPANY_ENABLED", () => {
  it("is off by default", () => {
    assert.equal(isInternalAiCompanyEnabled({}), false);
  });

  it("accepts true/1/on", () => {
    assert.equal(isInternalAiCompanyEnabled({ INTERNAL_AI_COMPANY_ENABLED: "true" }), true);
    assert.equal(isInternalAiCompanyEnabled({ INTERNAL_AI_COMPANY_ENABLED: "1" }), true);
    assert.equal(isInternalAiCompanyEnabled({ INTERNAL_AI_COMPANY_ENABLED: "on" }), true);
  });
});

describe("createCeoMission FS", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hq-mission-"));
    const layout = [
      "docs/ai-team/tasks",
      "docs/ai-team/ops/sprints",
      "docs/ai-team/runtime/audit",
      "docs/ai-team/runtime/agents",
      "docs/ai-team/ops/releases",
    ];
    for (const rel of layout) fs.mkdirSync(path.join(tmp, rel), { recursive: true });

    fs.writeFileSync(
      path.join(tmp, "docs/ai-team/TASKS.md"),
      `# Task Board

**Last updated:** 2026-07-28

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

### SPRINT-004 — Test Sprint

| Field | Value |
|-------|--------|
| **ID** | \`SPRINT-004\` |
| **Name** | Test Sprint |
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
      `# Runtime Audit Log

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

  it("writes task, board, sprint, audit, and returns WAITING_CEO plan", async () => {
    const result = await createCeoMission(
      "Unique mission about executive digest alerts for HQ tests",
      { repoRoot: tmp }
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.status, "WAITING_CEO");
    assert.match(result.approvalPhrase, /proposal only/);
    assert.ok(result.plan.steps.length > 0);

    const taskRel = `docs/ai-team/tasks/${result.taskId}.md`;
    const body = getText(tmp, taskRel) ?? "";
    assert.match(body, /Mission Plan \(pre-execution\)/);
    assert.match(body, /WAITING_CEO/);
    assert.match(body, /proposal/);

    const board = getText(tmp, "docs/ai-team/TASKS.md") ?? "";
    assert.match(board, new RegExp(result.taskId));
    assert.match(board, /WAITING_CEO/);

    const sprints = getText(tmp, "docs/ai-team/SPRINTS.md") ?? "";
    assert.match(sprints, new RegExp(result.taskId));

    const audit = getText(tmp, "docs/ai-team/runtime/audit/AUDIT.log.md") ?? "";
    assert.match(audit, /CEO_MISSION_CREATED/);
    assert.match(audit, new RegExp(result.taskId));

    assert.equal(result.hq.currentTask?.id, result.taskId);
    assert.equal(result.hq.sprint?.id, "SPRINT-004");
  });

  it("rejects duplicate against board titles", async () => {
    const again = await createCeoMission(
      "Unique mission about executive digest alerts for HQ tests",
      { repoRoot: tmp }
    );
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.code, "DUPLICATE");
  });

  it("rejects when flag disabled", async () => {
    process.env.INTERNAL_AI_COMPANY_ENABLED = "false";
    const r = await createCeoMission("Another distinct mission text here", {
      repoRoot: tmp,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "DISABLED");
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });
});
