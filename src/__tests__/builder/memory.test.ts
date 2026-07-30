import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planCollaborationChain, applyApprovalDecision } from "@/services/builder/collaboration.logic";
import { upsertCollaboration } from "@/services/builder/collaboration.store";
import { recordMissionOutcome } from "@/services/builder/learning.logic";
import { syncOutcomesFromMissions } from "@/services/builder/learning.store";
import { upsertExecution } from "@/services/builder/execution/execution.store";
import {
  applyExpiration,
  extractLearningDrafts,
  mergeDraftsIntoMemories,
} from "@/services/builder/memory/memory.engine";
import {
  containsSecretMaterial,
  sanitizeMemoryText,
} from "@/services/builder/memory/memory.safety";
import {
  applyMemoryToRecommendations,
  decideMemory,
  getCompanyMemoryDashboard,
  learnFromCompletedWorkday,
  resetCompanyMemory,
} from "@/services/builder/memory/memory.service";
import { listMemories, upsertMemory } from "@/services/builder/memory/memory.store";
import type { CompanyMemory } from "@/services/builder/memory/types";
import type { AutonomousWorkday } from "@/services/builder/workday/types";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";

function mission(id: string, title: string, lead: string, text: string) {
  return planCollaborationChain({
    missionId: id,
    title,
    mission: text,
    leadEmployeeId: lead,
    planSummary: title,
    planSteps: ["Analyze", "Execute"],
    now: "2026-07-20T01:00:00.000Z",
  });
}

function sampleWorkday(overrides?: Partial<AutonomousWorkday>): AutonomousWorkday {
  return {
    id: "workday-2026-07-29",
    date: "2026-07-29",
    workspaceId: "default",
    status: "completed",
    detectedItems: [],
    plan: [],
    morningBrief: null,
    endOfDayReport: {
      generatedAt: "2026-07-29T18:00:00.000Z",
      completed: ["Send follow-up email", "Pipeline risk proposal"],
      skipped: [],
      failed: [],
      stale: [],
      pending: [],
      blocked: [],
      learningNote: "ok",
      summary: "done",
      fullyCompleted: true,
    },
    recommendationIds: [],
    approvalIds: [],
    executionIds: [],
    dataFingerprint: "fp",
    startedAt: "2026-07-29T09:00:00.000Z",
    completedAt: "2026-07-29T18:00:00.000Z",
    createdAt: "2026-07-29T09:00:00.000Z",
    updatedAt: "2026-07-29T18:00:00.000Z",
    ...overrides,
  };
}

describe("company memory v7", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-memory-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates memories from successful verified outcomes", () => {
    const approved = applyApprovalDecision(
      mission("TASK-M1", "Acme pipeline risk proposal", "sarah", "Sales pipeline risk"),
      "approve",
      "Go",
      "2026-07-21T02:00:00.000Z"
    );
    const outcome = recordMissionOutcome(approved, "2026-07-21T03:00:00.000Z");
    const { drafts } = extractLearningDrafts({
      outcomes: [outcome],
      missions: [approved],
      executions: [],
      workday: null,
    });
    assert.ok(drafts.length >= 1);
    const { memories, summary } = mergeDraftsIntoMemories([], drafts, "2026-07-21T04:00:00.000Z");
    assert.ok(summary.created >= 1);
    assert.ok(memories.every((m) => m.confidence > 0 && m.evidenceCount >= 1));
    assert.ok(memories.every((m) => m.sourceRefs.length > 0));
    assert.ok(memories.every((m) => m.expiration.hardExpireDays > 0));
  });

  it("updates confidence and evidence on duplicate patterns", () => {
    const m1 = applyApprovalDecision(
      mission("TASK-M2", "Customer email follow-up", "emma", "Email follow-up"),
      "approve",
      null,
      "2026-07-21T02:00:00.000Z"
    );
    const m2 = applyApprovalDecision(
      mission("TASK-M3", "Customer email outreach", "emma", "Email outreach"),
      "approve",
      null,
      "2026-07-22T02:00:00.000Z"
    );
    const drafts1 = extractLearningDrafts({
      outcomes: [recordMissionOutcome(m1)],
      missions: [m1],
      executions: [],
      workday: null,
    }).drafts;
    const first = mergeDraftsIntoMemories([], drafts1, "2026-07-21T04:00:00.000Z");
    const drafts2 = extractLearningDrafts({
      outcomes: [recordMissionOutcome(m2)],
      missions: [m2],
      executions: [],
      workday: null,
    }).drafts;
    const second = mergeDraftsIntoMemories(
      first.memories,
      drafts2,
      "2026-07-22T04:00:00.000Z"
    );
    assert.ok(second.summary.updated >= 1 || second.summary.created >= 0);
    const emailAssign = second.memories.find((m) =>
      m.patternKey.includes("assign:emma:email")
    );
    assert.ok(emailAssign);
    assert.ok(emailAssign.evidenceCount >= 2);
    assert.ok(emailAssign.confidence >= 45);
  });

  it("applies expiration decay and hard expiry", () => {
    const mem: CompanyMemory = {
      id: "mem-1",
      kind: "successful_pattern",
      title: "Old pattern",
      insight: "stale",
      confidence: 80,
      evidenceCount: 2,
      sourceRefs: ["mission:x"],
      expiration: { softExpireDays: 10, hardExpireDays: 20 },
      ceoStatus: "pending",
      patternKey: "success:general",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUpdated: "2026-01-01T00:00:00.000Z",
      acceptedAt: null,
      ignoredAt: null,
    };
    const soft = applyExpiration(mem, "2026-01-15T00:00:00.000Z");
    assert.ok(soft.confidence < 80);
    const hard = applyExpiration(mem, "2026-02-01T00:00:00.000Z");
    assert.equal(hard.confidence, 0);
  });

  it("prevents duplicate memories for the same patternKey", () => {
    const approved = applyApprovalDecision(
      mission("TASK-M4", "Meeting notes document", "david", "Document notes"),
      "approve",
      null,
      "2026-07-21T02:00:00.000Z"
    );
    const drafts = extractLearningDrafts({
      outcomes: [recordMissionOutcome(approved)],
      missions: [approved],
      executions: [],
      workday: null,
    }).drafts;
    const once = mergeDraftsIntoMemories([], drafts);
    const twice = mergeDraftsIntoMemories(once.memories, drafts);
    const keys = twice.memories.map((m) => m.patternKey);
    assert.equal(keys.length, new Set(keys).size);
  });

  it("learns after a successful workday without storing secrets", () => {
    const approved = applyApprovalDecision(
      mission("TASK-M5", "Pipeline risk proposal", "sarah", "Sales pipeline"),
      "approve",
      null,
      "2026-07-21T02:00:00.000Z"
    );
    upsertCollaboration(approved, tmp);
    syncOutcomesFromMissions([recordMissionOutcome(approved)], tmp);

    upsertExecution(
      {
        id: "exec-ok",
        employeeId: "emma",
        employeeName: "Emma",
        missionId: "TASK-M5",
        system: "gmail",
        action: "gmail.send_reply",
        requestedAction: "Send follow-up",
        preview: { summary: "Send reply", details: {}, sourceSnapshot: {} },
        prepareParams: {},
        dataFingerprint: "x",
        status: "succeeded",
        approvalDecision: "approve",
        ceoNote: null,
        executionStatus: "succeeded",
        externalReference: "msg-1",
        verificationResult: "Sent message msg-1",
        errorDetails: null,
        idempotencyKey: "idem",
        connection: {
          system: "gmail",
          connected: true,
          reason: null,
          checkedAt: "2026-07-29T10:00:00.000Z",
        },
        createdAt: "2026-07-29T10:00:00.000Z",
        updatedAt: "2026-07-29T10:00:00.000Z",
        approvedAt: "2026-07-29T10:00:00.000Z",
        executedAt: "2026-07-29T10:00:00.000Z",
      },
      tmp
    );

    const result = learnFromCompletedWorkday({
      workday: sampleWorkday(),
      repoRoot: tmp,
      now: "2026-07-29T18:30:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.summary.created + result.summary.updated >= 1);
    const blob = JSON.stringify(listMemories(tmp));
    assert.doesNotMatch(blob, /GOOGLE_CLIENT_SECRET|CRM_API_KEY|access_token/i);
    assert.doesNotMatch(blob, /Builder Runtime|orchestrator/i);
  });

  it("does not learn from executions lacking verification", () => {
    const { drafts } = extractLearningDrafts({
      outcomes: [],
      missions: [],
      executions: [
        {
          id: "exec-bad",
          employeeId: "emma",
          employeeName: "Emma",
          missionId: null,
          system: "gmail",
          action: "gmail.send_reply",
          requestedAction: "Send",
          preview: { summary: "x", details: {}, sourceSnapshot: {} },
          prepareParams: {},
          dataFingerprint: "x",
          status: "failed",
          approvalDecision: "approve",
          ceoNote: null,
          executionStatus: "failed",
          externalReference: null,
          verificationResult: null,
          errorDetails: "fail",
          idempotencyKey: "i",
          connection: {
            system: "gmail",
            connected: true,
            reason: null,
            checkedAt: "2026-07-29T10:00:00.000Z",
          },
          createdAt: "2026-07-29T10:00:00.000Z",
          updatedAt: "2026-07-29T10:00:00.000Z",
          approvedAt: null,
          executedAt: null,
        },
      ],
      workday: null,
    });
    assert.equal(
      drafts.filter((d) => d.sourceRefs.some((r) => r.includes("exec-bad"))).length,
      0
    );
  });

  it("handles accept, ignore, remove, and reset", () => {
    const mem: CompanyMemory = {
      id: "mem-ceo-1",
      kind: "ceo_approval_tendency",
      title: "CEO approval tendency",
      insight: "Keep previews concise",
      confidence: 60,
      evidenceCount: 3,
      sourceRefs: ["mission:a"],
      expiration: { softExpireDays: 30, hardExpireDays: 90 },
      ceoStatus: "pending",
      patternKey: "ceo:approval-rate",
      createdAt: "2026-07-29T01:00:00.000Z",
      lastUpdated: "2026-07-29T01:00:00.000Z",
      acceptedAt: null,
      ignoredAt: null,
    };
    upsertMemory(mem, tmp);

    const accepted = decideMemory({
      memoryId: mem.id,
      action: "accept",
      repoRoot: tmp,
    });
    assert.equal(accepted.ok, true);
    if (!accepted.ok) return;
    assert.equal(accepted.memory.ceoStatus, "accepted");

    const ignored = decideMemory({
      memoryId: mem.id,
      action: "ignore",
      repoRoot: tmp,
    });
    assert.equal(ignored.ok, true);
    if (!ignored.ok) return;
    assert.equal(ignored.memory.ceoStatus, "ignored");

    const removed = decideMemory({
      memoryId: mem.id,
      action: "remove",
      repoRoot: tmp,
    });
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.equal(removed.memory.ceoStatus, "removed");
    assert.equal(listMemories(tmp).length, 0);

    upsertMemory({ ...mem, ceoStatus: "pending" }, tmp);
    const reset = resetCompanyMemory({ repoRoot: tmp });
    assert.equal(reset.ok, true);
    assert.equal(listMemories(tmp).length, 0);
  });

  it("improves recommendation ordering using company memory", () => {
    upsertMemory(
      {
        id: "mem-pref",
        kind: "preferred_assignment",
        title: "Prefer Emma for email work",
        insight: "Emma succeeds on email",
        confidence: 90,
        evidenceCount: 5,
        sourceRefs: ["mission:a"],
        expiration: { softExpireDays: 30, hardExpireDays: 90 },
        ceoStatus: "accepted",
        patternKey: "assign:emma:email",
        createdAt: "2026-07-29T01:00:00.000Z",
        lastUpdated: "2026-07-29T01:00:00.000Z",
        acceptedAt: "2026-07-29T01:00:00.000Z",
        ignoredAt: null,
      },
      tmp
    );

    const recs: EmployeeRecommendation[] = [
      {
        id: "r1",
        title: "Routine document tidy",
        recommendation: "Organize templates",
        reasoning: "low",
        confidence: 55,
        expectedImpact: "small",
        category: "follow_up",
        leadEmployeeId: "david",
        participatingEmployees: [{ id: "david", name: "David", role: "Document Manager" }],
        internalDiscussion: [],
        status: "pending",
        ceoNote: null,
        reassignedToEmployeeId: null,
        delayedUntil: null,
        signalIds: [],
        createdAt: "2026-07-29T01:00:00.000Z",
        updatedAt: "2026-07-29T01:00:00.000Z",
      },
      {
        id: "r2",
        title: "Unanswered email triage",
        recommendation: "Draft reply",
        reasoning: "inbox",
        confidence: 60,
        expectedImpact: "medium",
        category: "alert",
        leadEmployeeId: "emma",
        participatingEmployees: [{ id: "emma", name: "Emma", role: "Email Manager" }],
        internalDiscussion: [],
        status: "pending",
        ceoNote: null,
        reassignedToEmployeeId: null,
        delayedUntil: null,
        signalIds: [],
        createdAt: "2026-07-29T01:00:00.000Z",
        updatedAt: "2026-07-29T01:00:00.000Z",
      },
    ];

    const ranked = applyMemoryToRecommendations(recs, { repoRoot: tmp });
    assert.equal(ranked[0].leadEmployeeId, "emma");
    assert.ok(ranked[0].confidence >= recs[1].confidence);
    assert.match(ranked[0].reasoning, /Company memory/i);
  });

  it("filters unsafe secret material from memory text", () => {
    assert.equal(containsSecretMaterial("Bearer abc.def.ghi"), true);
    assert.equal(containsSecretMaterial("GOOGLE_CLIENT_SECRET=xyz"), true);
    assert.equal(containsSecretMaterial("Normal operational insight"), false);
    const cleaned = sanitizeMemoryText(
      "Draft reply GOOGLE_CLIENT_SECRET=abc access_token=zzz for customer"
    );
    assert.doesNotMatch(cleaned, /GOOGLE_CLIENT_SECRET=abc/);
    assert.match(cleaned, /\[redacted\]/);
  });

  it("exposes CEO memory dashboard without internal terminology", () => {
    upsertMemory(
      {
        id: "mem-dash",
        kind: "business_priority",
        title: "Business priority signal: crm",
        insight: "Raise CRM ranking",
        confidence: 70,
        evidenceCount: 2,
        sourceRefs: ["mission:z"],
        expiration: { softExpireDays: 30, hardExpireDays: 90 },
        ceoStatus: "pending",
        patternKey: "priority:crm",
        createdAt: "2026-07-29T01:00:00.000Z",
        lastUpdated: "2026-07-29T01:00:00.000Z",
        acceptedAt: null,
        ignoredAt: null,
      },
      tmp
    );
    const dash = getCompanyMemoryDashboard({ repoRoot: tmp });
    assert.ok(dash.newInsights.length >= 1);
    const blob = JSON.stringify(dash);
    assert.doesNotMatch(blob, /Builder Runtime|orchestrator|docs\/ai-team/i);
  });
});
