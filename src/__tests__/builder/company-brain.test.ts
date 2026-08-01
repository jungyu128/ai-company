/**
 * AI Company Brain — company-level reasoning from recorded state only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompanyBrainView,
  type CompanyBrainInput,
} from "@/services/builder/company-brain";

function baseInput(
  overrides: Partial<CompanyBrainInput> = {}
): CompanyBrainInput {
  return {
    generatedAt: "2026-08-01T12:00:00.000Z",
    generatedAtDisplay: "Aug 1, 12:00",
    directive: {
      title: "Ship AI Company Brain",
      status: "APPROVED",
      instruction: "Observe all HQ systems and recommend the next CEO move",
      paused: false,
    },
    companyHealth: {
      score: 62,
      label: "Watch",
      summary: "Approvals backlog and one blocker",
      factors: ["Approval backlog"],
    },
    executiveHealthScore: 62,
    executionSuccessRate: 85,
    risks: ["Approval bottleneck"],
    opportunities: ["Idle capacity after approvals clear"],
    blockers: [{ title: "CI gate", reason: "Failing checks on main" }],
    approvalQueue: {
      count: 2,
      protectedCount: 1,
      topTitles: ["Approve protected deploy", "Approve daily plan"],
    },
    ceoInbox: { waitingCount: 2, blockerCount: 1, total: 5 },
    sprint: {
      name: "Sprint 4",
      goal: "CEO Operating Center",
      status: "active",
      progressPercent: 35,
      blockedWorkItems: 2,
      completedWorkItems: 3,
      totalWorkItems: 10,
      velocity: 4,
    },
    meetings: [
      {
        title: "Standup",
        status: "completed",
        synthesis: "Team waiting on protected deploy approval",
      },
    ],
    memory: {
      insightCount: 1,
      preferenceCount: 2,
      lastLearnedAt: "2026-08-01T08:00:00.000Z",
    },
    liveWork: {
      working: 2,
      blocked: 1,
      waiting: 2,
      reviewing: 0,
      idle: 1,
      overloadedNames: ["Marcus"],
    },
    continuousOs: {
      running: true,
      lastTickAt: "2026-08-01T11:55:00.000Z",
      activeTaskCount: 4,
      recentDecisionCount: 2,
    },
    timelineRecent: [
      { kind: "approval_requested", summary: "Protected deploy needs CEO" },
      { kind: "blocked", summary: "CI gate blocked Marcus" },
    ],
    analytics: {
      healthScore: 62,
      blockedWorkCount: 2,
      sprintVelocity: 4,
      qaPassRatePercent: 90,
      activeWorkCount: 5,
      completedWorkCount: 3,
      recurringBlockers: [{ label: "CI gate", count: 3 }],
      employeeActive: [
        { name: "Marcus", active: 4, blocked: 1 },
        { name: "Ava", active: 1, blocked: 0 },
        { name: "Sarah", active: 0, blocked: 0 },
      ],
    },
    github: {
      connected: false,
      tokenConfigured: false,
      owner: "acme",
      repo: "workpilot",
      error: "GITHUB_TOKEN not set — read/write unavailable",
      pushedAt: null,
    },
    employeeRecommendations: [
      {
        title: "Unblock CI then deploy",
        status: "pending",
        summary: "Marcus proposes fixing CI before the protected deploy",
      },
    ],
    metrics: {
      employeesWorking: 2,
      waitingForApproval: 2,
      completedToday: 3,
      companyProductivity: 55,
    },
    executiveBrief: {
      headline: "Clear protected approvals",
      summary: "Company gated on CEO protected deploy decision",
      recommendedNextAction: "Review protected deploy",
    },
    dailyOpsLatestUpdate: "Plan approved; deploy waiting",
    ...overrides,
  };
}

describe("AI Company Brain", () => {
  it("produces an Executive Recommendation with all required fields from recorded state", () => {
    const view = buildCompanyBrainView(baseInput());
    const r = view.recommendation;

    assert.ok(r.executiveSummary.length > 0);
    assert.ok(r.whyThisMatters.length > 0);
    assert.ok(r.evidence.length >= 3);
    assert.ok(r.risks.length >= 1);
    assert.ok(r.recommendedAction.length > 0);
    assert.ok(r.expectedImpact.length > 0);
    assert.ok(r.confidence >= 40 && r.confidence <= 95);
    assert.ok(["low", "medium", "high"].includes(r.confidenceLabel));

    for (const e of r.evidence) {
      assert.ok(e.source.length > 0);
      assert.ok(e.fact.length > 0);
    }
  });

  it("never fabricates blockers or meetings when none are recorded", () => {
    const view = buildCompanyBrainView(
      baseInput({
        blockers: [],
        meetings: [],
        liveWork: {
          working: 1,
          blocked: 0,
          waiting: 0,
          reviewing: 0,
          idle: 2,
          overloadedNames: [],
        },
        ceoInbox: { waitingCount: 0, blockerCount: 0, total: 0 },
        risks: [],
        approvalQueue: { count: 0, protectedCount: 0, topTitles: [] },
        analytics: {
          healthScore: 80,
          blockedWorkCount: 0,
          sprintVelocity: 5,
          qaPassRatePercent: 95,
          activeWorkCount: 2,
          completedWorkCount: 5,
          recurringBlockers: [],
          employeeActive: [
            { name: "Ava", active: 1, blocked: 0 },
            { name: "Marcus", active: 1, blocked: 0 },
          ],
        },
        github: {
          connected: true,
          tokenConfigured: true,
          owner: "acme",
          repo: "workpilot",
          error: null,
          pushedAt: "2026-08-01T10:00:00.000Z",
        },
      })
    );

    assert.equal(view.assessments.biggestBlocker, null);
    assert.ok(
      !view.recommendation.evidence.some((e) => e.source === "Meetings")
    );
    assert.match(view.assessments.releaseReadiness ?? "", /Ready signals/i);
  });

  it("prioritizes protected CEO decisions when Approval Queue records them", () => {
    const view = buildCompanyBrainView(baseInput());
    assert.match(view.assessments.highestCompanyPriority ?? "", /protected/i);
    assert.match(view.recommendation.recommendedAction, /protected|Approve/i);
    assert.ok(
      view.recommendation.evidence.some((e) => e.source === "Approval Queue")
    );
  });

  it("cites GitHub, Sprint, Analytics, and Continuous OS when observed", () => {
    const view = buildCompanyBrainView(baseInput());
    assert.ok(view.observedSources.includes("GitHub status"));
    assert.ok(view.observedSources.includes("Sprint"));
    assert.ok(view.observedSources.includes("Analytics"));
    assert.ok(view.observedSources.includes("Continuous OS"));
    assert.ok(view.observedSources.includes("Daily Directive"));
    assert.ok(
      view.recommendation.evidence.some((e) => e.source === "GitHub status")
    );
    assert.ok(view.assessments.weakestSprint);
    assert.ok(view.assessments.workloadImbalance);
    assert.ok(view.assessments.engineeringHealth);
    assert.ok(view.assessments.roadmapImpact);
  });

  it("recommends advancing the Daily Directive when the company is clear", () => {
    const view = buildCompanyBrainView(
      baseInput({
        approvalQueue: { count: 0, protectedCount: 0, topTitles: [] },
        blockers: [],
        risks: [],
        ceoInbox: { waitingCount: 0, blockerCount: 0, total: 1 },
        liveWork: {
          working: 2,
          blocked: 0,
          waiting: 0,
          reviewing: 0,
          idle: 1,
          overloadedNames: [],
        },
        employeeRecommendations: [],
        sprint: {
          name: "Sprint 4",
          goal: "Brain",
          status: "active",
          progressPercent: 70,
          blockedWorkItems: 0,
          completedWorkItems: 7,
          totalWorkItems: 10,
          velocity: 6,
        },
        github: {
          connected: true,
          tokenConfigured: true,
          owner: "acme",
          repo: "workpilot",
          error: null,
          pushedAt: "2026-08-01T10:00:00.000Z",
        },
      })
    );

    assert.match(
      view.assessments.highestCompanyPriority ?? "",
      /Daily Directive|Ship AI Company Brain/i
    );
    assert.ok(view.assessments.recommendedNextMission);
  });
});
