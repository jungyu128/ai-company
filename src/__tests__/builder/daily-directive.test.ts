/**
 * Daily Directive — company-wide CEO instruction → plan → approval gate.
 * No implementation before explicit CEO approval.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyCeoDailyOpsAction,
  tryExecuteDailyWorkItem,
} from "@/services/builder/daily-ops";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";
import { listAudit } from "@/services/builder/workspace/collaboration-feed";

describe("Daily Directive", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "daily-directive-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("CEO submits one company-wide directive; company analyzes, plans, assigns, and awaits approval", () => {
    const result = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "HQ Daily Directive",
        instruction:
          "Improve WorkPilot HQ Daily Directive so the CEO gives one company-wide instruction",
        intendedOutcome: "Proposed execution plan ready for CEO approval",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T09:00:00.000Z",
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;

    const directive = result.snapshot.today;
    const plan = result.snapshot.activePlan;
    assert.ok(directive);
    assert.ok(plan);
    assert.equal(directive!.status, "AWAITING_APPROVAL");
    assert.equal(plan!.status, "AWAITING_APPROVAL");
    assert.ok(directive!.clarifiedOutcome);
    assert.ok(plan!.proposedWorkItems.length >= 3);
    assert.ok(plan!.employeeAssignments.length >= 1);
    assert.ok(plan!.dependencies.length >= 1);
    assert.ok(plan!.risks.length >= 1);
    assert.ok(plan!.approvalRequirements.some((a) => a.kind === "plan"));

    // Automatic permanent-role assignment — no CEO micro-assignment
    for (const w of plan!.proposedWorkItems) {
      const emp = AI_COMPANY_EMPLOYEES.find((e) => e.id === w.assignedEmployeeId);
      assert.ok(emp);
      assert.equal(emp!.roleLocked, true);
      assert.equal(w.permanentRole, emp!.role);
      assert.equal(w.executionPermission, "DENIED");
      assert.notEqual(w.status, "WORKING");
      assert.notEqual(w.status, "COMPLETED");
    }

    // Morning plan report filed for CEO
    assert.ok(result.snapshot.latestMorningReport);
    assert.equal(result.snapshot.latestMorningReport!.kind, "morning_plan");

    // Audit records planning-only submission
    const audits = listAudit("default", tmp);
    assert.ok(
      audits.some((a) => String(a.action).includes("daily_ops.submit_directive")) ||
        audits.some((a) => String(a.action).includes("daily_ops.analyze_and_propose"))
    );

    // Explicit: no implementation from submit alone
    const first = plan!.proposedWorkItems[0]!;
    const denied = tryExecuteDailyWorkItem({
      workItemId: first.id,
      executionKey: "directive-must-not-execute",
      repoRoot: tmp,
    });
    assert.equal(denied.ok, false);
  });

  it("only explicit CEO plan approval unlocks executionPermission", () => {
    const submitted = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Approve gate",
        instruction: "Plan a safe HQ improvement with product and QA coverage",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T10:00:00.000Z",
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const planId = submitted.snapshot.activePlan!.id;
    const before = submitted.snapshot.activePlan!.proposedWorkItems.every(
      (w) => w.executionPermission === "DENIED"
    );
    assert.equal(before, true);

    const approved = applyCeoDailyOpsAction({
      action: { action: "approve_entire_plan", planId },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T10:01:00.000Z",
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;

    assert.equal(approved.snapshot.today?.status, "APPROVED");
    assert.ok(
      approved.snapshot.activePlan!.proposedWorkItems.every(
        (w) => w.executionPermission === "GRANTED"
      )
    );
  });
});
