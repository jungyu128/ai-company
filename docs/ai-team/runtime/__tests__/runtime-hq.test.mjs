/**
 * Stage 5 — AI Company HQ entry experience tests
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildAiCompanyHq, formatAiCompanyHqMarkdown } from "../lib/runtime-hq.mjs";
import { createRuntimeSession } from "../lib/runtime-controller.mjs";

const TASKS = `
| ID | Title | Owner | Priority | Status | Sprint |
|----|-------|-------|----------|--------|--------|
| [TASK-2026-07-28-002](tasks/x.md) | Gmail AI Employee v1 | Reviewer | P0 | WAITING_CEO | SPRINT-004 |
| [TASK-2026-07-28-001](tasks/y.md) | Ops pack | PM | P0 | DONE | SPRINT-003 |
`;

const SPRINTS = `
## Active Sprint

### SPRINT-004 — First WorkPilot Feature

| Field | Value |
|-------|--------|
| **ID** | \`SPRINT-004\` |
| **Name** | First WorkPilot Feature |
| **Goal** | Ship Gmail AI Employee v1 |
| **Status** | \`ACTIVE\` |
`;

const DECISIONS = `
| Decision ID | Date | Task | Summary | Decided by |
|-------------|------|------|---------|------------|
| [DEC-2026-07-28-001](./decisions/x.md) | 2026-07-28 | TASK-2026-07-28-002 | Ship Gmail AI Employee v1 | CEO |
| — | — | — | _No decisions yet_ | — |
`;

describe("AI Company HQ entry", () => {
  it("builds HQ with sprint, waiting CEO, decisions, recommendation", () => {
    const result = buildAiCompanyHq({
      tasksMd: TASKS,
      sprintsMd: SPRINTS,
      decisionMemoryMd: DECISIONS,
      techDebtMd: "| — | — | — | _No open debt_ | — | — |",
      improvementBacklogMd: "| — | — | — | — | — | _No proposals yet_ |",
      latestRelease: {
        id: "REL-TASK-2026-07-28-002",
        title: "Gmail AI Employee v1",
        date: "2026-07-28",
        path: "docs/ai-team/ops/releases/REL-TASK-2026-07-28-002.md",
      },
      generatedAt: "2026-07-28T14:00:00.000Z",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.sprint?.id, "SPRINT-004");
    assert.equal(result.value.currentTask?.id, "TASK-2026-07-28-002");
    assert.equal(result.value.activeAgent, "CEO");
    assert.equal(result.value.pendingCeoApprovals.length, 1);
    assert.equal(result.value.recentDecisions[0].id, "DEC-2026-07-28-001");
    assert.match(result.value.recommendedNextMission, /Approve TASK-2026-07-28-002/);
    assert.equal(result.value.latestRelease?.title, "Gmail AI Employee v1");
  });

  it("formats HQ markdown without product/customer domains", () => {
    const { value } = buildAiCompanyHq({
      tasksMd: TASKS,
      sprintsMd: SPRINTS,
      decisionMemoryMd: DECISIONS,
      generatedAt: "2026-07-28T14:00:00.000Z",
    });
    const md = formatAiCompanyHqMarkdown(value);
    assert.match(md, /AI Company Headquarters/);
    assert.match(md, /What requires my approval/);
    assert.match(md, /Recommended Next Mission/);
    assert.match(md, /No WorkPilot customer, Gmail, Calendar, or CRM data/);
    assert.doesNotMatch(md, /customer@|inbox thread|CRM deal/i);
  });

  it("recommends new goal when board is idle", () => {
    const result = buildAiCompanyHq({
      tasksMd: `| ID | Title | Owner | Priority | Status |
|----|-------|-------|----------|--------|
| [TASK-2026-07-08-001](t.md) | Done | PM | P1 | DONE |`,
      sprintsMd: SPRINTS,
      decisionMemoryMd: "",
    });
    assert.match(result.value.recommendedNextMission, /오늘 WorkPilot 목표/);
  });

  it("session hook audits HQ build", () => {
    const session = createRuntimeSession("hq-test");
    const result = session.buildAiCompanyHq({
      tasksMd: TASKS,
      sprintsMd: SPRINTS,
      decisionMemoryMd: DECISIONS,
    });
    assert.equal(result.ok, true);
    assert.ok(session.getAudit().some((a) => a.action === "HQ_BUILT"));
  });

  it("includes team status, release history, and activity feed", () => {
    const result = buildAiCompanyHq({
      tasksMd: TASKS,
      sprintsMd: SPRINTS,
      decisionMemoryMd: DECISIONS,
      agentDocs: [
        {
          role: "PM",
          content: `| **Role** | PM |\n| **State** | \`Working\` |\n| **Current task** | TASK-2026-07-28-002 |`,
        },
      ],
      releaseHistory: [
        {
          id: "REL-TASK-2026-07-28-002",
          title: "Gmail AI Employee v1",
          date: "2026-07-28",
          path: "docs/ai-team/ops/releases/REL-TASK-2026-07-28-002.md",
        },
      ],
      auditMd: `| Audit ID | Timestamp | Actor type | Actor ID | Task ID | Action | Before → After | Rationale |
|----------|-----------|------------|----------|---------|--------|----------------|-----------|
| AUD-1 | 2026-07-28T15:00:00+09:00 | ORCHESTRATOR | runtime | TASK-2026-07-28-002 | EXECUTE_FINISH | {} → {} | shipped v1 |`,
      generatedAt: "2026-07-28T14:00:00.000Z",
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.teamStatus[0].role, "PM");
    assert.equal(result.value.teamStatus[0].state, "Working");
    assert.equal(result.value.releaseHistory[0].id, "REL-TASK-2026-07-28-002");
    assert.equal(result.value.activityFeed[0].action, "EXECUTE_FINISH");
    assert.match(formatAiCompanyHqMarkdown(result.value), /Team Status/);
    assert.match(formatAiCompanyHqMarkdown(result.value), /Live Activity Feed/);
  });
});
