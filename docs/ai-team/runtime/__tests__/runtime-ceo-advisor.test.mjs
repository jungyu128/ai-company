/**
 * CEO Advisor tests — synthesis, not data echo.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCeoAdvisor } from "../lib/runtime-ceo-advisor.mjs";
import { buildAiCompanyHq } from "../lib/runtime-hq.mjs";
import { createRuntimeSession } from "../lib/runtime-controller.mjs";

function baseHq(overrides = {}) {
  const built = buildAiCompanyHq({
    tasksMd: `
| ID | Title | Owner | Priority | Status |
|----|-------|-------|----------|--------|
| [TASK-2026-07-28-002](t.md) | Gmail AI Employee v1 | Reviewer | P0 | WAITING_CEO |
`,
    sprintsMd: `
## Active Sprint
### SPRINT-004 — First WorkPilot Feature
| Field | Value |
| **ID** | \`SPRINT-004\` |
| **Name** | First WorkPilot Feature |
| **Goal** | Ship Gmail AI Employee v1 |
| **Status** | \`ACTIVE\` |
`,
    decisionMemoryMd: `
| Decision ID | Date | Task | Summary | Decided by |
| [DEC-2026-07-28-001](x.md) | 2026-07-28 | TASK-2026-07-28-002 | Ship Gmail AI Employee v1 | CEO |
`,
    releaseHistory: [
      {
        id: "REL-TASK-2026-07-28-002",
        title: "Gmail AI Employee v1",
        date: "2026-07-28",
        path: "x.md",
      },
    ],
    auditMd: `| Audit ID | Timestamp | Actor type | Actor ID | Task ID | Action | Before → After | Rationale |
| AUD-9 | 2026-07-28T15:30:00+09:00 | ORCHESTRATOR | runtime | TASK-2026-07-28-002 | EXECUTE_FINISH | {} → {} | feature complete awaiting ship |`,
    generatedAt: "2026-07-28T16:00:00.000Z",
    ...overrides,
  });
  assert.equal(built.ok, true);
  return built.value;
}

describe("CEO Advisor", () => {
  it("synthesizes approval urgency with action phrase (not a raw dump)", () => {
    const hq = baseHq();
    const adv = buildCeoAdvisor(hq, {
      lastVisitAt: "2026-07-27T00:00:00.000Z",
      now: "2026-07-28T16:00:00.000Z",
    });
    assert.equal(adv.ok, true);
    assert.equal(adv.value.urgency, "high");
    assert.match(adv.value.headline, /CEO action needed/i);
    assert.match(adv.value.recommendedAction, /Approve TASK-2026-07-28-002 only/);
    assert.match(adv.value.whyItMatters, /CEO gate/i);
    assert.match(adv.value.risksIfIgnored, /bypass|stall|trust/i);
    assert.match(adv.value.sinceLastVisit, /Since your last visit|EXECUTE_FINISH|Release/i);
    // Must not be a mere reprint of the task table row alone
    assert.ok(adv.value.sinceLastVisit.length > 80);
    assert.ok(adv.value.whyItMatters.length > 60);
  });

  it("explains clear board as mission-setting opportunity", () => {
    const hq = baseHq({
      tasksMd: `
| ID | Title | Owner | Priority | Status |
|----|-------|-------|----------|--------|
| [TASK-2026-07-08-001](t.md) | Done | PM | P1 | DONE |
`,
    });
    const adv = buildCeoAdvisor(hq, { lastVisitAt: null, now: "2026-07-28T16:00:00.000Z" });
    assert.equal(adv.ok, true);
    assert.equal(adv.value.urgency, "clear");
    assert.match(adv.value.recommendedAction, /WorkPilot 목표|Enter AI Company/);
    assert.match(adv.value.requiresAttention, /ready for a new/i);
  });

  it("session can attach advisor without changing lifecycle APIs", () => {
    const session = createRuntimeSession("advisor-1");
    const hq = baseHq();
    const adv = session.buildCeoAdvisor(hq, { lastVisitAt: "2026-07-20T00:00:00.000Z" });
    assert.equal(adv.ok, true);
    assert.ok(session.getAudit().some((a) => a.action === "CEO_ADVISOR_BUILT"));
  });
});
