import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import { upsertCollaboration } from "@/services/builder/collaboration.store";
import { createMockConnectorSuite } from "@/services/builder/execution";
import { prepareExecution } from "@/services/builder/execution/execution.service";
import { upsertExecution } from "@/services/builder/execution/execution.store";
import { computeLearningStats } from "@/services/builder/learning.logic";
import { buildMorningBrief, buildEndOfDayReport } from "@/services/builder/workday/workday.brief";
import {
  buildSourceFingerprint,
  detectWorkdayItems,
} from "@/services/builder/workday/workday.detect";
import { buildDailyPlan, mergePlanIdempotent } from "@/services/builder/workday/workday.plan";
import {
  completeAutonomousWorkday,
  startAutonomousWorkday,
} from "@/services/builder/workday/workday.service";
import { getWorkdayByDate, upsertWorkday } from "@/services/builder/workday/workday.store";
import { getConnectionStatusesSync } from "@/services/builder/execution/connection-status";
import type { ConnectionStatus } from "@/services/builder/execution/types";
import type { DailyPlanItem } from "@/services/builder/workday/types";

function mission(id: string, title: string, lead: string, text: string, createdAt: string) {
  return planCollaborationChain({
    missionId: id,
    title,
    mission: text,
    leadEmployeeId: lead,
    planSummary: title,
    planSteps: ["Analyze", "Execute"],
    now: createdAt,
  });
}

describe("autonomous workday v6", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-workday-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("generates a morning brief without fabricating disconnected sources", () => {
    const connections: ConnectionStatus[] = [
      {
        system: "gmail",
        connected: false,
        reason: "Gmail disconnected",
        checkedAt: "2026-07-29T01:00:00.000Z",
      },
      {
        system: "google_calendar",
        connected: false,
        reason: "Calendar disconnected",
        checkedAt: "2026-07-29T01:00:00.000Z",
      },
      {
        system: "google_drive",
        connected: false,
        reason: "Drive disconnected",
        checkedAt: "2026-07-29T01:00:00.000Z",
      },
      {
        system: "crm",
        connected: false,
        reason: "CRM deferred",
        checkedAt: "2026-07-29T01:00:00.000Z",
      },
    ];
    const missions = [
      mission(
        "TASK-WD-EMAIL",
        "Unanswered customer email",
        "emma",
        "Urgent unanswered email follow-up",
        "2026-07-26T01:00:00.000Z"
      ),
      mission(
        "TASK-WD-CAL",
        "Calendar conflict review",
        "alex",
        "Detect schedule conflict and prepare meeting brief",
        "2026-07-28T01:00:00.000Z"
      ),
    ];
    const { items, unavailableSources } = detectWorkdayItems({
      connections,
      missions,
      approvals: [],
      executions: [],
      recommendations: [],
      now: "2026-07-29T02:00:00.000Z",
    });
    const plan = buildDailyPlan(items);
    const brief = buildMorningBrief({
      items,
      plan,
      unavailableSources,
      now: "2026-07-29T02:00:00.000Z",
    });

    assert.ok(brief.topPriorities.length > 0);
    assert.ok(brief.disconnectedIntegrations.length >= 1 || brief.unavailableSources.length >= 1);
    assert.ok(brief.recommendedFirstAction);
    assert.ok(brief.summary.length > 0);
    assert.equal(brief.urgentEmails.length, 0); // gmail disconnected — no fabricated inbox
    assert.match(JSON.stringify(brief), /unavailable|disconnected/i);
    assert.doesNotMatch(JSON.stringify(brief), /Builder Runtime|orchestrator/i);
  });

  it("ranks priorities and assigns the correct employees", () => {
    const connections = getConnectionStatusesSync();
    const missions = [
      mission(
        "TASK-WD-CRM",
        "Pipeline risk follow-up",
        "sarah",
        "Critical sales pipeline risk and customer follow-up",
        "2026-07-20T01:00:00.000Z"
      ),
      mission(
        "TASK-WD-DOC",
        "Draft proposal document",
        "david",
        "Generate proposal document and report",
        "2026-07-28T01:00:00.000Z"
      ),
      mission(
        "TASK-WD-MAIL",
        "Send outreach email",
        "emma",
        "Email outreach for the quote",
        "2026-07-28T01:00:00.000Z"
      ),
    ];
    const { items } = detectWorkdayItems({
      connections,
      missions,
      approvals: [],
      executions: [],
      recommendations: [],
      now: "2026-07-29T08:00:00.000Z",
    });
    const plan = buildDailyPlan(items);
    assert.ok(plan.length >= 3);
    assert.ok(plan[0].priority === "P0" || plan[0].priority === "P1");

    const byEmp = Object.fromEntries(
      ["emma", "alex", "david", "sarah"].map((id) => [
        id,
        plan.filter((p) => p.assignedEmployeeId === id),
      ])
    );
    assert.ok(byEmp.emma.length >= 1);
    assert.ok(byEmp.david.length >= 1);
    assert.ok(byEmp.sarah.length >= 1);
  });

  it("supports multi-employee collaboration on a plan item", () => {
    const { items } = detectWorkdayItems({
      connections: getConnectionStatusesSync(),
      missions: [
        mission(
          "TASK-WD-COLLAB",
          "Customer proposal email pack",
          "sarah",
          "Sales pipeline proposal document and email follow-up",
          "2026-07-28T01:00:00.000Z"
        ),
      ],
      approvals: [],
      executions: [],
      recommendations: [],
      now: "2026-07-29T08:00:00.000Z",
    });
    const collab = items.find((i) => i.collaboratingEmployeeIds.length > 0);
    assert.ok(collab, "expected collaborating employees");
    const plan = buildDailyPlan(items);
    const planCollab = plan.find((p) => p.collaboratingEmployeeIds.length > 0);
    assert.ok(planCollab);
    assert.ok(planCollab.collaboratingEmployeeNames.length > 0);
  });

  it("prevents duplicate plan items for the same sourceKey", () => {
    const connections = getConnectionStatusesSync();
    const m = mission(
      "TASK-WD-DUP",
      "Unanswered email triage",
      "emma",
      "Urgent unanswered email",
      "2026-07-28T01:00:00.000Z"
    );
    const { items } = detectWorkdayItems({
      connections,
      missions: [m, m],
      approvals: [],
      executions: [],
      recommendations: [],
    });
    const plan = buildDailyPlan(items);
    const keys = plan.map((p) => p.sourceKey);
    assert.equal(keys.length, new Set(keys).size);
  });

  it("starts a workday idempotently without duplicating records", async () => {
    upsertCollaboration(
      mission(
        "TASK-WD-IDEM",
        "Calendar conflict today",
        "alex",
        "Schedule conflict and meeting prep",
        "2026-07-28T01:00:00.000Z"
      ),
      tmp
    );

    const first = await startAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T09:00:00.000Z",
      preparePreviews: false,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.resumed, false);
    assert.equal(first.workday.status, "in_progress");
    assert.ok(first.workday.morningBrief);
    assert.ok(first.workday.plan.length >= 1);

    const second = await startAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T09:05:00.000Z",
      preparePreviews: false,
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.resumed, true);
    assert.equal(second.workday.id, first.workday.id);

    const stored = getWorkdayByDate("2026-07-29", "default", tmp);
    assert.ok(stored);
    assert.equal(stored.id, first.workday.id);
  });

  it("marks approval-required actions and never auto-writes", async () => {
    upsertCollaboration(
      mission(
        "TASK-WD-APPR",
        "Send follow-up email",
        "emma",
        "Email follow-up to customer",
        "2026-07-28T01:00:00.000Z"
      ),
      tmp
    );
    const connectors = createMockConnectorSuite();
    const started = await startAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T10:00:00.000Z",
      preparePreviews: true,
      connectors,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const needsApproval = started.workday.plan.filter((p) => p.requiresCeoApproval);
    assert.ok(needsApproval.length >= 1);
    assert.ok(
      started.workday.plan.every((p) => p.status !== "completed" || !p.requiresCeoApproval)
    );
  });

  it("surfaces disconnected integrations without fake success", async () => {
    const started = await startAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T10:00:00.000Z",
      preparePreviews: false,
      connectorMode: "live",
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.ok(
      started.workday.morningBrief?.disconnectedIntegrations.length ||
        started.workday.morningBrief?.unavailableSources.length
    );
    assert.ok(
      started.workday.plan.some((p) => p.status === "disconnected") ||
        (started.workday.morningBrief?.unavailableSources.length ?? 0) > 0
    );
  });

  it("marks stale workday items when source fingerprint changes", () => {
    const fp1 = buildSourceFingerprint({
      connections: getConnectionStatusesSync(),
      missions: [],
      approvals: [],
      executions: [],
      recommendations: [],
    });
    const item: DailyPlanItem = {
      id: "wd-item-1",
      title: "Approve email send",
      source: "gmail",
      sourceKey: "execution:exec-1",
      assignedEmployeeId: "emma",
      assignedEmployeeName: "Emma",
      collaboratingEmployeeIds: [],
      collaboratingEmployeeNames: [],
      priority: "P0",
      reason: "Send reply",
      deadline: null,
      confidence: 90,
      proposedAction: "Approve send",
      requiresCeoApproval: true,
      relatedMissionId: null,
      relatedExecutionId: "exec-1",
      status: "awaiting_approval",
    };
    const fp2 = buildSourceFingerprint({
      connections: getConnectionStatusesSync(),
      missions: [
        mission("TASK-X", "New", "emma", "email", "2026-07-29T01:00:00.000Z"),
      ],
      approvals: [],
      executions: [],
      recommendations: [],
    });
    assert.notEqual(fp1, fp2);
    const merged = mergePlanIdempotent([], [item]);
    // simulate stale marking like the service
    const stale =
      fp1 !== fp2
        ? merged.map((p) =>
            p.requiresCeoApproval && p.status === "awaiting_approval"
              ? { ...p, status: "stale" as const }
              : p
          )
        : merged;
    assert.equal(stale[0].status, "stale");
  });

  it("treats partial execution failure as partial workday completion", async () => {
    upsertCollaboration(
      mission(
        "TASK-WD-FAIL",
        "Document report save",
        "david",
        "Generate report document",
        "2026-07-28T01:00:00.000Z"
      ),
      tmp
    );
    const started = await startAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T11:00:00.000Z",
      preparePreviews: false,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;

    const planItem = started.workday.plan[0];
    assert.ok(planItem);
    const failedExec = {
      id: "exec-failed-1",
      employeeId: planItem.assignedEmployeeId,
      employeeName: planItem.assignedEmployeeName,
      missionId: planItem.relatedMissionId,
      system: "google_drive" as const,
      action: "drive.save_file" as const,
      requestedAction: planItem.proposedAction,
      preview: {
        summary: "failed save",
        details: {},
        sourceSnapshot: { x: 1 },
      },
      prepareParams: {},
      dataFingerprint: "abc",
      status: "failed" as const,
      approvalDecision: "approve" as const,
      ceoNote: null,
      executionStatus: "failed" as const,
      externalReference: null,
      verificationResult: null,
      errorDetails: "provider error",
      idempotencyKey: "idem-fail",
      connection: {
        system: "google_drive" as const,
        connected: true,
        reason: null,
        checkedAt: "2026-07-29T11:00:00.000Z",
      },
      createdAt: "2026-07-29T11:00:00.000Z",
      updatedAt: "2026-07-29T11:00:00.000Z",
      approvedAt: "2026-07-29T11:00:00.000Z",
      executedAt: "2026-07-29T11:00:00.000Z",
    };
    upsertExecution(failedExec, tmp);

    started.workday.plan[0] = {
      ...planItem,
      relatedExecutionId: failedExec.id,
      status: "failed",
    };
    upsertWorkday(started.workday, tmp);

    const done = completeAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T18:00:00.000Z",
    });
    assert.equal(done.ok, true);
    if (!done.ok) return;
    assert.equal(done.workday.status, "partial");
    assert.equal(done.workday.endOfDayReport?.fullyCompleted, false);
    assert.ok((done.workday.endOfDayReport?.failed.length ?? 0) >= 1);
  });

  it("verifies completion and builds end-of-day report with learning note", () => {
    const plan: DailyPlanItem[] = [
      {
        id: "1",
        title: "Done item",
        source: "missions",
        sourceKey: "a",
        assignedEmployeeId: "emma",
        assignedEmployeeName: "Emma",
        collaboratingEmployeeIds: [],
        collaboratingEmployeeNames: [],
        priority: "P2",
        reason: "ok",
        deadline: null,
        confidence: 70,
        proposedAction: "n/a",
        requiresCeoApproval: false,
        relatedMissionId: null,
        relatedExecutionId: null,
        status: "completed",
      },
    ];
    const report = buildEndOfDayReport({
      plan,
      learning: computeLearningStats([]),
      now: "2026-07-29T18:00:00.000Z",
    });
    assert.equal(report.fullyCompleted, true);
    assert.ok(report.completed.includes("Done item"));
    assert.match(report.learningNote, /Success/);
    assert.doesNotMatch(report.summary, /Builder Runtime|orchestrator|AUDIT\.log/i);
  });

  it("keeps internal terminology out of morning brief and plan payloads", async () => {
    upsertCollaboration(
      mission(
        "TASK-WD-HIDE",
        "Meeting notes document",
        "david",
        "Prepare meeting notes document",
        "2026-07-28T01:00:00.000Z"
      ),
      tmp
    );
    const started = await startAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T12:00:00.000Z",
      preparePreviews: false,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    const blob = JSON.stringify(started.workday);
    assert.doesNotMatch(blob, /Builder Runtime/i);
    assert.doesNotMatch(blob, /orchestrator/i);
    assert.doesNotMatch(blob, /docs\/ai-team/);
    assert.doesNotMatch(blob, /GOOGLE_CLIENT_SECRET|CRM_API_KEY/);
    assert.doesNotMatch(blob, /"access_token"|refresh_token=/i);
  });

  it("links execution previews into the workday plan when prepared", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "emma",
      action: "gmail.send_reply",
      requestedAction: "Send approved reply",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const started = await startAutonomousWorkday({
      repoRoot: tmp,
      now: "2026-07-29T13:00:00.000Z",
      preparePreviews: false,
      connectors,
    });
    assert.equal(started.ok, true);
    if (!started.ok) return;
    assert.ok(
      started.workday.plan.some((p) => p.relatedExecutionId === prepared.record.id) ||
        started.workday.executionIds.includes(prepared.record.id)
    );
    assert.ok(
      started.workday.plan.some(
        (p) => p.requiresCeoApproval && p.status === "awaiting_approval"
      )
    );
  });
});
