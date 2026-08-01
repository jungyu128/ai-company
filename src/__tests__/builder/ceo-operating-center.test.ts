/**
 * CEO Operating Center — proactive aggregation from recorded state only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCeoOperatingCenterView,
  buildRecommendedNextAction,
  inboxFromTimeline,
  mergeCeoInbox,
} from "@/services/builder/ceo-operating-center";
import type { CompanyTimelineEvent } from "@/services/builder/company-timeline/company-timeline.client";
import type { CeoApprovalQueueItem } from "@/services/builder/ceo-approval-queue/types";
import type { ExecutiveBrief, PriorityAlert, CompanyHealth } from "@/services/builder/proactive.logic";
import type { CompanyDashboardMetrics } from "@/services/builder/conversation.logic";
import type { AiCompanyEmployeeCard } from "@/services/builder/company.service";
import type { ExecutiveDashboard } from "@/services/builder/ceo/types";

function emptyLiveWork(
  overrides: Partial<AiCompanyEmployeeCard["liveWork"]> = {}
): AiCompanyEmployeeCard["liveWork"] {
  return {
    status: "Idle",
    progressPercent: 0,
    currentStep: "Idle",
    currentTask: null,
    startedAt: null,
    estimatedCompletionAt: null,
    waitingFor: null,
    nextPlannedAction: "Await assignment",
    dependencies: [],
    lastUpdate: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

function employee(
  partial: Partial<AiCompanyEmployeeCard> & Pick<AiCompanyEmployeeCard, "id" | "name">
): AiCompanyEmployeeCard {
  return {
    role: "Engineer",
    department: "Engineering",
    summary: "Test",
    avatar: { initials: "T", hue: "210" },
    expertise: [],
    communicationStyle: "direct",
    status: "online",
    currentActivity: null,
    currentTask: null,
    activeWorkload: 0,
    completedToday: 0,
    pendingApprovals: 0,
    lastActivityDisplay: "now",
    performance: { throughput: 80, reliability: 80, responsiveness: 80 },
    liveWork: emptyLiveWork(),
    ...partial,
  };
}

function minimalExecutive(): ExecutiveDashboard {
  return {
    generatedAt: "2026-08-01T10:00:00.000Z",
    generatedAtDisplay: "Aug 1, 10:00",
    workspaceId: "default",
    health: {
      id: "h1",
      workspaceId: "default",
      score: 72,
      label: "Stable",
      summary: "Stable operations",
      kpis: {
        workload: 50,
        overdueWork: 0,
        approvalBacklog: 1,
        executionSuccessRate: 90,
        workdayCompletion: 40,
        memoryConfidence: 70,
        connectorHealth: 100,
        collaborationQuality: 80,
        missionThroughput: 60,
      },
      factors: ["Approval backlog"],
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    risks: [],
    workloads: [],
    approvalQueue: [],
    missionProgress: [],
    activeWork: [],
    blockedWork: [{ id: "bw1", title: "Blocked deploy", href: "#" }],
    liveWorkTracker: { asOf: "2026-08-01T10:00:00.000Z", employees: [] },
    dailyOps: {
      asOf: "2026-08-01T10:00:00.000Z",
      directive: {
        id: "d1",
        title: "Ship Operating Center",
        instruction: "Deliver CEO Operating Center",
        status: "active",
        priority: "high",
        clarifiedOutcome: null,
        paused: false,
      },
      plan: null,
      workSummary: {
        proposed: 0,
        awaitingApproval: 1,
        approved: 0,
        executing: 2,
        blocked: 1,
        completed: 3,
        rejected: 0,
      },
      approvalQueue: [],
      workItems: [],
      employees: [],
      blockers: [{ workItemId: "w1", title: "CI gate", reason: "Failing checks" }],
      risks: [],
      dependencies: [],
      assignments: [],
      latestUpdate: "Plan awaiting approval",
      morningReportTitle: null,
      finalReportTitle: null,
      dailyReport: null,
    },
    sprintProgress: { active: null, plannedCount: 0, completedCount: 0, items: [] },
    meetingSummaries: [],
    recentDecisions: [],
    executionSuccessRate: 88,
    connectorStatus: [],
    memoryGrowth: { total: 0, pending: 0, accepted: 0, avgConfidence: 0 },
    workdayPerformance: { status: "idle", completed: 0, failed: 0, pending: 0 },
    strategicRecommendations: [],
    kpiHistory: [],
    latestWeeklyReport: null,
    latestMonthlyReport: null,
    safety: {
      neverExternalWrites: true,
      neverDeployWithoutApproval: true,
      neverBypassApprovals: true,
      neverInventProgress: true,
    },
  } as ExecutiveDashboard;
}

describe("CEO Operating Center", () => {
  it("builds inbox from timeline work completed, blockers, reviews, and approvals", () => {
    const events: CompanyTimelineEvent[] = [
      {
        id: "e1",
        kind: "work_completed",
        summary: "Sarah finished API route",
        at: "2026-08-01T09:00:00.000Z",
        atDisplay: "9:00",
        actorUserId: "sarah",
        actorName: "Sarah",
        actorRole: "ai_employee",
        directiveId: null,
        planId: null,
        workItemId: "w1",
        employeeId: "sarah",
        relatedType: null,
        relatedId: null,
      },
      {
        id: "e2",
        kind: "blocked",
        summary: "Marcus blocked on schema",
        at: "2026-08-01T09:10:00.000Z",
        atDisplay: "9:10",
        actorUserId: "marcus",
        actorName: "Marcus",
        actorRole: "ai_employee",
        directiveId: null,
        planId: null,
        workItemId: "w2",
        employeeId: "marcus",
        relatedType: null,
        relatedId: null,
      },
      {
        id: "e3",
        kind: "review_completed",
        summary: "Review finished for UI",
        at: "2026-08-01T09:20:00.000Z",
        atDisplay: "9:20",
        actorUserId: "ava",
        actorName: "Ava",
        actorRole: "ai_employee",
        directiveId: null,
        planId: null,
        workItemId: "w3",
        employeeId: "ava",
        relatedType: null,
        relatedId: null,
      },
      {
        id: "e4",
        kind: "approval_requested",
        summary: "CEO approval for deploy",
        at: "2026-08-01T09:30:00.000Z",
        atDisplay: "9:30",
        actorUserId: "jordan",
        actorName: "Jordan",
        actorRole: "ai_employee",
        directiveId: null,
        planId: null,
        workItemId: "w4",
        employeeId: "jordan",
        relatedType: null,
        relatedId: null,
      },
    ];

    const items = inboxFromTimeline(events);
    assert.equal(items.length, 4);
    assert.ok(items.some((i) => i.kind === "work_completed"));
    assert.ok(items.some((i) => i.kind === "blocker"));
    assert.ok(items.some((i) => i.kind === "review_finished"));
    assert.ok(items.some((i) => i.kind === "approval_required"));
  });

  it("recommends protected approvals first", () => {
    const action = buildRecommendedNextAction({
      decisionCount: 3,
      protectedCount: 2,
      alertCount: 5,
      briefAction: "Review briefing",
      waitingCount: 1,
    });
    assert.ok(action);
    assert.match(action!.title, /protected/i);
    assert.equal(action!.href, "#ops-approvals");
  });

  it("merges inbox preferring critical tone and deduping", () => {
    const merged = mergeCeoInbox([
      {
        id: "a",
        kind: "work_completed",
        tone: "positive",
        title: "Done",
        detail: "x",
        employeeId: "e1",
        employeeName: "E",
        at: "2026-08-01T08:00:00.000Z",
        atDisplay: "8:00",
        href: "#",
      },
      {
        id: "b",
        kind: "blocker",
        tone: "critical",
        title: "Blocked",
        detail: "y",
        employeeId: "e2",
        employeeName: "F",
        at: "2026-08-01T07:00:00.000Z",
        atDisplay: "7:00",
        href: "#",
      },
      {
        id: "c",
        kind: "blocker",
        tone: "critical",
        title: "Blocked",
        detail: "dup",
        employeeId: "e2",
        employeeName: "F",
        at: "2026-08-01T06:00:00.000Z",
        atDisplay: "6:00",
        href: "#",
      },
    ]);
    assert.equal(merged[0]!.kind, "blocker");
    assert.equal(merged.length, 2);
  });

  it("assembles full Operating Center view with all proactive surfaces", () => {
    const brief: ExecutiveBrief = {
      generatedAt: "2026-08-01T10:00:00.000Z",
      generatedAtDisplay: "Aug 1",
      headline: "Morning: ship Operating Center",
      highestPriorities: ["Approvals"],
      risks: ["CI flake"],
      opportunities: [],
      pendingApprovals: ["Plan"],
      suggestedActions: ["Clear queue"],
      recommendedAssignments: [],
      summary: "Team waiting on CEO for plan approval.",
      whatChanged: ["Directive submitted"],
      currentBlockers: ["CI gate"],
      decisionsNeeded: ["Approve plan"],
      completedWork: ["Spec draft"],
      recommendedNextAction: "Approve today's plan",
    };

    const alerts: PriorityAlert[] = [
      {
        id: "pa1",
        tone: "critical",
        title: "Protected deploy waiting",
        detail: "Needs CEO",
        employeeId: "jordan",
      },
    ];

    const health: CompanyHealth = {
      score: 68,
      label: "Watch",
      summary: "Approvals backlog",
      factors: ["Backlog"],
    };

    const metrics: CompanyDashboardMetrics = {
      activeMissions: 1,
      employeesWorking: 2,
      waitingForApproval: 1,
      completedToday: 3,
      averageCompletionTimeMs: null,
      averageCompletionTimeDisplay: null,
      companyProductivity: 70,
    };

    const approval: CeoApprovalQueueItem = {
      id: "apr1",
      source: "daily_ops_plan",
      employee: { id: "sarah", name: "Sarah", role: "PM" },
      requestedAction: "Approve plan",
      reason: "Plan ready",
      expectedImpact: "Unblocks execution",
      risks: ["Scope creep"],
      isProtected: true,
      status: "pending",
      createdAt: "2026-08-01T09:00:00.000Z",
      createdAtDisplay: "9:00",
      planId: "p1",
      workItemId: null,
      missionId: null,
      directiveId: "d1",
      approvalRequirementId: null,
      protectedAction: "deploy",
      title: "Approve daily plan",
    };

    const view = buildCeoOperatingCenterView({
      generatedAt: "2026-08-01T10:00:00.000Z",
      generatedAtDisplay: "Aug 1, 10:00",
      executiveBrief: brief,
      priorityAlerts: alerts,
      companyHealth: health,
      metrics,
      employees: [
        employee({
          id: "marcus",
          name: "Marcus",
          liveWork: emptyLiveWork({
            status: "Blocked",
            waitingFor: "Schema review",
            currentTask: "DB migration",
          }),
        }),
        employee({
          id: "ava",
          name: "Ava",
          liveWork: emptyLiveWork({ status: "Completed", currentTask: "UI polish" }),
        }),
      ],
      ceoApprovalQueue: {
        items: [approval],
        count: 1,
        protectedCount: 1,
      },
      companyTimelineEvents: [],
      executive: minimalExecutive(),
      risks: ["Approval bottleneck rising"],
    });

    assert.ok(view.morningBriefing.headline);
    assert.ok(view.morningBriefing.bullets.length >= 1);
    assert.ok(view.inbox.some((i) => i.kind === "approval_required"));
    assert.ok(view.inbox.some((i) => i.kind === "blocker"));
    assert.ok(view.inbox.some((i) => i.kind === "work_completed"));
    assert.ok(view.inbox.some((i) => i.kind === "risk_increased"));
    assert.equal(view.decisionCenter.count, 1);
    assert.equal(view.decisionCenter.protectedCount, 1);
    assert.ok(view.criticalAlerts.length >= 1);
    assert.ok(view.recommendedNextAction);
    assert.match(view.recommendedNextAction!.title, /protected/i);
    assert.equal(view.companyHealth.score, 68);
    assert.ok(view.liveKpis.length >= 6);
    assert.equal(view.dailySummary.directiveTitle, "Ship Operating Center");
    assert.equal(view.dailySummary.completed, 3);
    assert.equal(view.dailySummary.inProgress, 2);
    assert.ok(view.brain);
    assert.ok(view.brain.recommendation.executiveSummary);
    assert.ok(view.brain.recommendation.evidence.length >= 1);
    assert.ok(view.brain.recommendation.recommendedAction);
    assert.ok(view.brain.observedSources.includes("Company Health"));
    assert.ok(view.workExecution);
    assert.equal(view.workExecution.stages.length, 14);
    assert.ok(view.learning);
    assert.equal(view.learning.companyMaturityLabel, "Emerging");
  });
});
