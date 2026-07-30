import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createConnectorSuite } from "@/services/builder/execution/connectors";
import { learnFromCompletedWorkday } from "@/services/builder/memory/memory.service";
import {
  allowTestConnectors,
  assertNoTestAdaptersOutsideTests,
  getBetaSafetyGuarantees,
} from "@/services/builder/onboarding/beta-safety";
import {
  stripInternalTerminology,
  verifyOnboardingConnections,
} from "@/services/builder/onboarding/connection-verify";
import {
  advanceOnboardingStep,
  completeOnboarding,
  getOnboardingView,
  startOrResumeOnboarding,
  updateOnboardingSettings,
  runOnboardingReadiness,
  persistConnectionVerification,
} from "@/services/builder/onboarding/onboarding.service";
import {
  ensureOnboardingState,
  getOnboardingState,
  saveOnboardingState,
} from "@/services/builder/onboarding/onboarding.store";
import {
  assertApprovalPolicySafe,
  clampApprovalPolicy,
} from "@/services/builder/onboarding/policy";
import { ensureDefaultWorkspace } from "@/services/builder/workspace/workspace.store";
import type { AutonomousWorkday } from "@/services/builder/workday/types";

const actor = {
  userId: "owner-1",
  email: "owner@example.com",
  displayName: "Owner One",
};

describe("AI Company onboarding & launch readiness v9", () => {
  let tmp = "";
  let prevFlag: string | undefined;
  let prevAllow: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    prevAllow = process.env.AI_COMPANY_ALLOW_TEST_CONNECTORS;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
    if (prevAllow === undefined) delete process.env.AI_COMPANY_ALLOW_TEST_CONNECTORS;
    else process.env.AI_COMPANY_ALLOW_TEST_CONNECTORS = prevAllow;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-onboard-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
    ensureDefaultWorkspace({
      userId: actor.userId,
      email: actor.email,
      displayName: actor.displayName,
      repoRoot: tmp,
    });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("creates onboarding idempotently", () => {
    const a = startOrResumeOnboarding({
      actor,
      workspaceId: "default",
      forceStart: true,
      repoRoot: tmp,
    });
    assert.equal(a.ok, true);
    if (!a.ok) return;
    assert.equal(a.created, true);
    const b = startOrResumeOnboarding({
      actor,
      workspaceId: "default",
      forceStart: true,
      repoRoot: tmp,
    });
    assert.equal(b.ok, true);
    if (!b.ok) return;
    assert.equal(b.created, false);
    assert.equal(b.view.state.startedAt, a.view.state.startedAt);
  });

  it("resumes from current step without duplicating completions", () => {
    startOrResumeOnboarding({
      actor,
      workspaceId: "default",
      forceStart: true,
      repoRoot: tmp,
    });
    const once = advanceOnboardingStep({
      workspaceId: "default",
      step: "workspace",
      actor,
      repoRoot: tmp,
    });
    assert.equal(once.ok, true);
    const twice = advanceOnboardingStep({
      workspaceId: "default",
      step: "workspace",
      actor,
      repoRoot: tmp,
    });
    assert.equal(twice.ok, true);
    if (!twice.ok) return;
    assert.equal(
      twice.view.state.completedSteps.filter((s) => s === "workspace").length,
      1
    );
    assert.equal(twice.view.state.currentStep, "team");
  });

  it("isolates onboarding state between workspaces", () => {
    const created = startOrResumeOnboarding({
      actor,
      createNew: true,
      workspaceName: "Beta Space",
      repoRoot: tmp,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    const wsId = created.view.state.workspaceId;
    advanceOnboardingStep({
      workspaceId: wsId,
      step: "workspace",
      actor,
      repoRoot: tmp,
    });

    startOrResumeOnboarding({
      actor,
      workspaceId: "default",
      forceStart: true,
      repoRoot: tmp,
    });
    const def = getOnboardingState("default", tmp);
    const other = getOnboardingState(wsId, tmp);
    assert.ok(def);
    assert.ok(other);
    assert.notEqual(def!.currentStep, other!.currentStep);
  });

  it("verifies connections without fake connected CRM", () => {
    const results = verifyOnboardingConnections();
    const crm = results.find((r) => r.system === "crm");
    assert.ok(crm);
    assert.equal(crm!.state, "unavailable");
    assert.notEqual(crm!.state, "connected");
    for (const r of results) {
      assert.equal(r.explanation.includes("ya29."), false);
      assert.equal(/GOOGLE_CLIENT_SECRET/.test(r.explanation), false);
    }
  });

  it("persists disconnected connector verification", () => {
    startOrResumeOnboarding({
      actor,
      workspaceId: "default",
      forceStart: true,
      repoRoot: tmp,
    });
    const view = persistConnectionVerification({
      workspaceId: "default",
      repoRoot: tmp,
    });
    assert.ok(view.state.connectionResults.length >= 4);
    assert.ok(
      view.state.connectionResults.every((c) =>
        [
          "connected",
          "disconnected",
          "disabled",
          "insufficient_permission",
          "invalid_credentials",
          "verification_failed",
          "unavailable",
        ].includes(c.state)
      )
    );
  });

  it("keeps approval policy safety floor", () => {
    const clamped = clampApprovalPolicy({
      // @ts-expect-error intentional unsafe attempt
      externalWritesRequireApproval: false,
      // @ts-expect-error intentional
      destructiveActionsDisabled: false,
      staleApprovalRejection: false,
      allowedApproverRoles: ["viewer"],
    });
    assert.equal(clamped.externalWritesRequireApproval, true);
    assert.equal(clamped.destructiveActionsDisabled, true);
    assert.equal(clamped.staleApprovalRejection, true);
    assert.ok(clamped.allowedApproverRoles.includes("owner") || clamped.allowedApproverRoles.includes("manager") || clamped.allowedApproverRoles.includes("admin"));
    assert.doesNotThrow(() => assertApprovalPolicySafe(clamped));

    const updated = updateOnboardingSettings({
      workspaceId: "default",
      actor,
      repoRoot: tmp,
      approvalPolicy: {
        externalWritesRequireApproval: true,
        destructiveActionsDisabled: true,
        secondApprovalHighRisk: true,
        approvalExpirationHours: 24,
        staleApprovalRejection: true,
        allowedApproverRoles: ["owner", "admin"],
      },
      betaSafetyMode: false,
    });
    assert.equal(updated.ok, false);
    if (!updated.ok) assert.equal(updated.code, "BETA_LOCKED");
  });

  it("persists workday preferences", () => {
    ensureOnboardingState("default", tmp);
    const result = updateOnboardingSettings({
      workspaceId: "default",
      actor,
      repoRoot: tmp,
      workdayPreferences: {
        timezone: "America/New_York",
        defaultStartTime: "08:30",
        prioritySensitivity: "high",
        weekendHandling: "light",
        endOfDayReport: true,
        includedDataSources: ["gmail", "missions"],
        notificationPreferences: {
          pendingApprovals: true,
          workdayComplete: false,
          failedExecutions: true,
          newInsights: true,
        },
      },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.view.state.workdayPreferences.timezone, "America/New_York");
    assert.equal(result.view.state.workdayPreferences.defaultStartTime, "08:30");
    assert.equal(result.view.state.workdayPreferences.prioritySensitivity, "high");
  });

  it("disables memory learning without corrupting state", () => {
    ensureOnboardingState("default", tmp);
    updateOnboardingSettings({
      workspaceId: "default",
      actor,
      repoRoot: tmp,
      privacySettings: { memoryEnabled: false },
    });
    const workday: AutonomousWorkday = {
      id: "workday-2026-07-29",
      date: "2026-07-29",
      workspaceId: "default",
      status: "completed",
      detectedItems: [],
      plan: [],
      morningBrief: null,
      endOfDayReport: {
        generatedAt: "2026-07-29T18:00:00.000Z",
        completed: ["x"],
        skipped: [],
        failed: [],
        stale: [],
        pending: [],
        blocked: [],
        learningNote: "n/a",
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
    };
    const learned = learnFromCompletedWorkday({
      workday,
      repoRoot: tmp,
      workspaceId: "default",
    });
    assert.equal(learned.ok, true);
    if (!learned.ok) return;
    assert.equal(learned.summary.created, 0);
  });

  it("blocks completion when readiness has blocking failures", () => {
    // Fresh tmp without feature... feature is on. Force fail by clearing workspace file memberships indirectly:
    // Use unknown workspace id without owner.
    const ws = "orphan-ws";
    ensureOnboardingState(ws, tmp);
    const readiness = runOnboardingReadiness({ workspaceId: ws, repoRoot: tmp });
    assert.equal(readiness.ok, true);
    if (!readiness.ok) return;
    assert.ok(readiness.view.blockingFailures.length > 0);

    const done = completeOnboarding({
      workspaceId: ws,
      actor,
      repoRoot: tmp,
    });
    assert.equal(done.ok, false);
    if (!done.ok) {
      assert.equal(done.code, "BLOCKING_READINESS");
      assert.equal(getOnboardingState(ws, tmp)?.completedAt, null);
    }
  });

  it("allows completion with warning-only readiness", () => {
    // default with owner + feature flag should pass blocking; connections may warn
    startOrResumeOnboarding({
      actor,
      workspaceId: "default",
      forceStart: true,
      repoRoot: tmp,
    });
    const readiness = runOnboardingReadiness({
      workspaceId: "default",
      repoRoot: tmp,
    });
    assert.equal(readiness.ok, true);
    if (!readiness.ok) return;
    assert.equal(readiness.view.blockingFailures.length, 0);

    // Walk to complete
    let step = getOnboardingState("default", tmp)!.currentStep;
    const guard = 20;
    for (let i = 0; i < guard && step !== "complete"; i++) {
      const optional = step === "connections" || step === "connection_validate";
      const adv = advanceOnboardingStep({
        workspaceId: "default",
        step,
        actor,
        skip: optional,
        repoRoot: tmp,
      });
      assert.equal(adv.ok, true);
      if (!adv.ok) return;
      step = adv.view.state.currentStep;
    }

    const done = completeOnboarding({
      workspaceId: "default",
      actor,
      repoRoot: tmp,
    });
    assert.equal(done.ok, true);
    if (!done.ok) return;
    assert.ok(done.view.state.completedAt);
    assert.equal(done.view.state.completedBy, actor.userId);
    assert.equal(done.view.state.betaSafetyMode, true);
  });

  it("enforces Beta Safety Mode guarantees", () => {
    const g = getBetaSafetyGuarantees();
    assert.equal(g.betaSafetyMode, true);
    assert.equal(g.externalWritesRequireApproval, true);
    assert.equal(g.noFakeSuccess, true);
    assert.equal(g.noHiddenMockFallback, true);

    const state = ensureOnboardingState("default", tmp).state;
    assert.equal(state.betaSafetyMode, true);
    const forced = saveOnboardingState(
      { ...state, betaSafetyMode: true },
      tmp
    );
    assert.equal(forced.betaSafetyMode, true);
  });

  it("forbids test adapters outside tests", () => {
    delete process.env.AI_COMPANY_ALLOW_TEST_CONNECTORS;
    const prevNode = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    assert.equal(allowTestConnectors(), false);
    assert.throws(() => assertNoTestAdaptersOutsideTests("test"));
    assert.throws(() => createConnectorSuite("test"));
    // Production never allows mocks — even with the escape hatch env set.
    process.env.AI_COMPANY_ALLOW_TEST_CONNECTORS = "1";
    assert.equal(allowTestConnectors(), false);
    assert.throws(() => createConnectorSuite("test"));
    process.env.NODE_ENV = prevNode;
    delete process.env.AI_COMPANY_ALLOW_TEST_CONNECTORS;
  });

  it("hides internal terminology from user-facing strings", () => {
    const cleaned = stripInternalTerminology(
      "Builder Runtime orchestration failed at docs/ai-team/ops/foo MockConnector"
    );
    assert.equal(/Builder Runtime/i.test(cleaned), false);
    assert.equal(/docs\/ai-team/.test(cleaned), false);
    assert.equal(/MockConnector/.test(cleaned), false);
  });

  it("keeps default workspace backward compatible without onboarding file", () => {
    const view = getOnboardingView({ workspaceId: "default", repoRoot: tmp });
    assert.equal(view.legacyCompatible, true);
    assert.ok(view.state.completedAt);
    assert.equal(getOnboardingState("default", tmp), null);
  });
});
