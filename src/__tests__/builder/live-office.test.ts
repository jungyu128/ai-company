/**
 * Live Office UX mapping — visualization helpers only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveOfficeConnections,
  buildLiveOfficeModel,
  mapStatusToLiveOfficeState,
  renderPosition,
  LIVE_OFFICE_DESKS,
  CEO_APPROVAL_ZONE,
  type LiveOfficeEmployeeView,
} from "@/features/builder/live-office/live-office-model";
import {
  bubbleTextFor,
  clampOfficePosition,
  deskTagWidthRemForLayout,
  mapLiveWorkToVisualState,
  officeLayoutModeForWidth,
  separateOverlappingPositions,
  shouldAnimateEmployeeMovement,
  shouldMoveToApprovalZone,
  shouldMoveTowardPartner,
} from "@/features/builder/live-office/live-office-visual-state";
import { formatHqTimeDisplay } from "@/services/builder/format-hq-display";
import type { CollaborationMission } from "@/services/builder/collaboration.logic";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import type { AiCompanyDashboard } from "@/services/builder/company.service";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";

function baseLiveWork(
  overrides: Partial<AiCompanyDashboard["employees"][number]["liveWork"]> = {}
) {
  return {
    status: "Idle",
    progressPercent: 0,
    currentStep: "",
    currentTask: null,
    startedAt: null,
    estimatedCompletionAt: null,
    waitingFor: null,
    nextPlannedAction: "Stand by",
    dependencies: [],
    lastUpdate: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function card(
  id: string,
  liveWork: ReturnType<typeof baseLiveWork>,
  extras: Partial<AiCompanyDashboard["employees"][number]> = {}
): AiCompanyDashboard["employees"][number] {
  const def = AI_COMPANY_EMPLOYEES.find((e) => e.id === id)!;
  return {
    id: def.id,
    name: def.name,
    role: def.role,
    department: def.department,
    summary: def.summary,
    avatar: def.avatar,
    expertise: def.expertise,
    communicationStyle: def.communicationStyle,
    status: "online",
    currentActivity: liveWork.currentStep || null,
    currentTask: liveWork.currentTask,
    activeWorkload: 0,
    completedToday: 0,
    pendingApprovals: 0,
    lastActivityDisplay: "",
    performance: { throughput: 80, reliability: 80, responsiveness: 80 },
    liveWork,
    ...extras,
  };
}

function emptyDash(
  employees: AiCompanyDashboard["employees"],
  overrides: Partial<AiCompanyDashboard> = {}
): AiCompanyDashboard {
  return {
    generatedAtDisplay: "오후 02:00",
    headline: "HQ",
    briefing: null,
    employees,
    pendingApprovals: [],
    ceoApprovalQueue: {
      asOf: "2026-07-31T00:00:00.000Z",
      items: [],
      count: 0,
      protectedCount: 0,
    },
    activeCollaborations: [],
    activityFeed: [],
    missionHistory: [],
    metrics: {} as AiCompanyDashboard["metrics"],
    executiveBrief: {} as AiCompanyDashboard["executiveBrief"],
    recommendations: [],
    priorityAlerts: [],
    risks: [],
    opportunities: [],
    companyHealth: {} as AiCompanyDashboard["companyHealth"],
    commandCenter: {
      companyMemory: { learnedPreferences: [], newInsights: [] },
    } as AiCompanyDashboard["commandCenter"],
    workspace: {
      activityTimeline: [],
    } as AiCompanyDashboard["workspace"],
    ...overrides,
  } as AiCompanyDashboard;
}

describe("Live Office UX mapping", () => {
  it("maps existing employee statuses to office visual states", () => {
    assert.equal(mapStatusToLiveOfficeState("online"), "idle");
    assert.equal(mapStatusToLiveOfficeState("offline"), "idle");
    assert.equal(mapStatusToLiveOfficeState("thinking"), "planning");
    assert.equal(mapStatusToLiveOfficeState("working"), "working");
    assert.equal(mapStatusToLiveOfficeState("collaborating"), "discussion");
    assert.equal(mapStatusToLiveOfficeState("waiting_approval"), "waiting_approval");
    assert.equal(mapStatusToLiveOfficeState("completed"), "completed");
  });

  it("maps each Live Work Tracker status to the correct visual state", () => {
    const cases: Array<{
      status: string;
      approval: boolean;
      partner: boolean;
      expected: string;
    }> = [
      { status: "Idle", approval: false, partner: false, expected: "idle" },
      { status: "Planning", approval: false, partner: false, expected: "planning" },
      { status: "Working", approval: false, partner: false, expected: "working" },
      { status: "Reviewing", approval: false, partner: false, expected: "reviewing" },
      { status: "Meeting", approval: false, partner: true, expected: "discussion" },
      { status: "Meeting", approval: false, partner: false, expected: "waiting" },
      { status: "Waiting", approval: true, partner: false, expected: "waiting_approval" },
      { status: "Waiting", approval: false, partner: false, expected: "waiting" },
      { status: "Blocked", approval: false, partner: false, expected: "blocked" },
      { status: "Completed", approval: false, partner: false, expected: "completed" },
      { status: "Unknown", approval: false, partner: false, expected: "idle" },
    ];
    for (const c of cases) {
      assert.equal(
        mapLiveWorkToVisualState({
          liveWorkStatus: c.status,
          hasPendingApproval: c.approval,
          hasDiscussionPartner: c.partner,
        }),
        c.expected,
        `${c.status} approval=${c.approval} partner=${c.partner}`
      );
    }
  });

  it("never invents approval waiting or discussion without real relationships", () => {
    assert.equal(
      shouldMoveToApprovalZone("waiting_approval", false),
      false
    );
    assert.equal(shouldMoveToApprovalZone("waiting_approval", true), true);
    assert.equal(shouldMoveTowardPartner("discussion", false), false);
    assert.equal(shouldMoveTowardPartner("discussion", true), true);
    assert.equal(shouldMoveTowardPartner("working", true), false);
  });

  it("keeps a permanent desk for every catalog employee", () => {
    const ids = LIVE_OFFICE_DESKS.map((d) => d.employeeId).sort();
    assert.deepEqual(ids, [
      "alex",
      "daniel",
      "david",
      "emma",
      "noah",
      "olivia",
      "sarah",
      "sophia",
    ]);
    const departments = new Set(LIVE_OFFICE_DESKS.map((d) => d.department));
    assert.ok(departments.size >= 5);
  });

  it("moves waiting-approval employees to the CEO zone only with a real pending approval", () => {
    const without = buildLiveOfficeModel(
      emptyDash([
        card("emma", baseLiveWork({ status: "Waiting", waitingFor: "CEO decision" })),
      ])
    );
    const emmaIdleWait = without.employees.find((e) => e.id === "emma")!;
    assert.equal(emmaIdleWait.visualState, "waiting");
    assert.equal(emmaIdleWait.atApprovalZone, false);
    assert.equal(emmaIdleWait.renderX, emmaIdleWait.desk.x);
    assert.equal(emmaIdleWait.renderY, emmaIdleWait.desk.y);

    const withApproval = buildLiveOfficeModel(
      emptyDash(
        [
          card("emma", baseLiveWork({ status: "Waiting", waitingFor: "CEO decision" }), {
            pendingApprovals: 1,
          }),
        ],
        {
          pendingApprovals: [
            {
              id: "a1",
              title: "Ship QA pack",
              mission: "QA pack",
              requestingEmployee: { id: "emma", name: "Emma", role: "QA" },
              collaborationChain: [],
              conversations: [],
              planSummary: "Plan",
              planSteps: ["A"],
              approvalStatus: "pending",
              ceoNote: null,
              createdAt: "2026-07-31T00:00:00.000Z",
              updatedAt: "2026-07-31T00:00:00.000Z",
            },
          ],
        }
      )
    );
    const emma = withApproval.employees.find((e) => e.id === "emma")!;
    assert.equal(emma.visualState, "waiting_approval");
    assert.equal(emma.atApprovalZone, true);
    const pos = renderPosition(emma);
    assert.ok(pos.y >= CEO_APPROVAL_ZONE.y - 4);
    assert.notEqual(pos.x, emma.desk.x);
  });

  it("moves toward a discussion partner only when a real collaboration link exists", () => {
    const mission: CollaborationMission = {
      id: "m1",
      title: "Proposal follow-up",
      mission: "Follow up",
      leadEmployeeId: "sarah",
      chain: [
        {
          employeeId: "sarah",
          employeeName: "Sarah",
          role: "Product Manager",
          stage: "analyze",
          status: "working",
          message: "Reviewing",
        },
        {
          employeeId: "david",
          employeeName: "David",
          role: "Backend Engineer",
          stage: "prepare",
          status: "collaborating",
          message: "Drafting",
        },
      ],
      approvalStatus: "pending",
      planSummary: "Plan",
      planSteps: ["A"],
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      ceoNote: null,
    };

    const noPartner = buildLiveOfficeModel(
      emptyDash([
        card("sarah", baseLiveWork({ status: "Meeting", currentStep: "Sync" })),
        card("david", baseLiveWork({ status: "Idle" })),
      ])
    );
    const alone = noPartner.employees.find((e) => e.id === "sarah")!;
    assert.equal(alone.visualState, "waiting");
    assert.equal(alone.discussionPartnerId, null);
    assert.equal(alone.renderX, alone.desk.x);

    const withPartner = buildLiveOfficeModel(
      emptyDash(
        [
          card("sarah", baseLiveWork({ status: "Meeting", currentStep: "Sync" })),
          card("david", baseLiveWork({ status: "Working", currentTask: "API" })),
        ],
        { activeCollaborations: [mission] }
      )
    );
    const discussing = withPartner.employees.find((e) => e.id === "sarah")!;
    assert.equal(discussing.visualState, "discussion");
    assert.equal(discussing.discussionPartnerId, "david");
    assert.notEqual(discussing.renderX, discussing.desk.x);
  });

  it("restores desk position and state from persisted live work (refresh-safe)", () => {
    const dash = emptyDash([
      card(
        "alex",
        baseLiveWork({
          status: "Working",
          currentTask: "Calendar UI polish",
          currentStep: "Implementing",
          progressPercent: 40,
        })
      ),
      card(
        "noah",
        baseLiveWork({
          status: "Completed",
          currentTask: "Model eval",
          progressPercent: 100,
        })
      ),
    ]);
    const first = buildLiveOfficeModel(dash);
    const second = buildLiveOfficeModel(dash);
    const a1 = first.employees.find((e) => e.id === "alex")!;
    const a2 = second.employees.find((e) => e.id === "alex")!;
    assert.equal(a1.visualState, "working");
    assert.equal(a2.visualState, a1.visualState);
    assert.equal(a2.renderX, a1.renderX);
    assert.equal(a2.renderY, a1.renderY);
    assert.equal(a2.liveWork.currentTask, "Calendar UI polish");

    const done = first.employees.find((e) => e.id === "noah")!;
    assert.equal(done.visualState, "completed");
    assert.equal(done.renderX, done.desk.x);
    assert.equal(done.renderY, done.desk.y);
  });

  it("returns completed employees safely to their home desk", () => {
    const model = buildLiveOfficeModel(
      emptyDash([
        card(
          "olivia",
          baseLiveWork({
            status: "Completed",
            currentTask: "Architecture review",
            progressPercent: 100,
          })
        ),
      ])
    );
    const emp = model.employees.find((e) => e.id === "olivia")!;
    assert.equal(emp.visualState, "completed");
    assert.equal(emp.atApprovalZone, false);
    assert.deepEqual(renderPosition(emp), { x: emp.desk.x, y: emp.desk.y });
  });

  it("disables unnecessary movement under reduced-motion preference", () => {
    assert.equal(shouldAnimateEmployeeMovement(true), false);
    assert.equal(shouldAnimateEmployeeMovement(false), true);
  });

  it("keeps layout budgets readable at 1100px, 1440px, and 1920px", () => {
    assert.equal(officeLayoutModeForWidth(1100), "compact");
    assert.equal(officeLayoutModeForWidth(1440), "wide");
    assert.equal(officeLayoutModeForWidth(1920), "ultrawide");
    assert.equal(deskTagWidthRemForLayout("compact"), 6.4);
    assert.equal(deskTagWidthRemForLayout("wide"), 7.1);
    assert.equal(deskTagWidthRemForLayout("ultrawide"), 7.4);

    const positions = separateOverlappingPositions([
      { id: "a", x: 50, y: 50 },
      { id: "b", x: 51, y: 50 },
      { id: "c", x: 50.5, y: 50.5 },
    ]);
    for (const p of positions) {
      const clamped = clampOfficePosition(p.x, p.y);
      assert.deepEqual(p, { id: p.id, ...clamped });
    }
    const ab = Math.hypot(positions[0]!.x - positions[1]!.x, positions[0]!.y - positions[1]!.y);
    assert.ok(ab >= 5.5);
  });

  it("builds compact status bubbles without inventing progress", () => {
    const idle = bubbleTextFor({
      visualState: "idle",
      currentTask: null,
      currentStep: null,
      waitingFor: null,
    });
    assert.equal(idle.status, "Idle");
    assert.equal(idle.extra, null);

    const working = bubbleTextFor({
      visualState: "working",
      currentTask: "Ship HQ animations",
      currentStep: "CSS",
      waitingFor: null,
      progressPercent: 0,
    });
    assert.equal(working.extra, null);
    assert.match(working.detail, /Ship HQ/);

    const withProgress = bubbleTextFor({
      visualState: "working",
      currentTask: "Ship HQ animations",
      currentStep: "CSS",
      waitingFor: null,
      progressPercent: 35,
    });
    assert.equal(withProgress.extra, "35%");
  });

  it("builds discussion links from real collaboration and recommendation events", () => {
    const mission: CollaborationMission = {
      id: "m1",
      title: "Proposal follow-up",
      mission: "Follow up",
      leadEmployeeId: "sarah",
      chain: [
        {
          employeeId: "sarah",
          employeeName: "Sarah",
          role: "Sales Manager",
          stage: "analyze",
          status: "working",
          message: "Reviewing",
        },
        {
          employeeId: "david",
          employeeName: "David",
          role: "Document Manager",
          stage: "prepare",
          status: "collaborating",
          message: "Drafting",
        },
      ],
      approvalStatus: "pending",
      planSummary: "Plan",
      planSteps: ["A"],
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      ceoNote: null,
    };

    const rec = {
      id: "r1",
      title: "Inactive accounts",
      recommendation: "Contact today",
      reasoning: "Pipeline",
      confidence: 70,
      expectedImpact: "Revenue",
      category: "opportunity",
      leadEmployeeId: "alex",
      conversationOwnerId: "alex",
      participatingEmployees: [
        { id: "alex", name: "Alex", role: "Calendar Manager" },
        { id: "emma", name: "Emma", role: "Email Manager" },
      ],
      internalDiscussion: [],
      status: "pending",
      ceoNote: null,
      reassignedToEmployeeId: null,
      delayedUntil: null,
      signalIds: [],
      createdAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
    } as EmployeeRecommendation;

    const links = buildLiveOfficeConnections([mission], [rec]);
    assert.ok(links.some((l) => l.fromEmployeeId === "sarah" && l.toEmployeeId === "david"));
    assert.ok(links.some((l) => l.fromEmployeeId === "alex" && l.toEmployeeId === "emma"));
  });

  it("formats activity times with fixed ko-KR KST (no browser locale)", () => {
    assert.equal(formatHqTimeDisplay("2026-07-30T03:46:00.000Z"), "오후 12:46");
    assert.equal(formatHqTimeDisplay("2026-07-30T00:05:00.000Z"), "오전 09:05");
    assert.equal(formatHqTimeDisplay("not-a-date"), "not-a-date");
  });

  it("keeps renderPosition compatible with legacy waiting-approval fixtures", () => {
    const base = {
      id: "emma",
      name: "Emma",
      role: "QA Engineer",
      department: "Quality",
      summary: "",
      avatar: { initials: "EM", hue: "#b91c1c" },
      expertise: [],
      communicationStyle: "",
      status: "waiting_approval" as const,
      currentActivity: null,
      currentTask: null,
      activeWorkload: 0,
      completedToday: 0,
      pendingApprovals: 1,
      lastActivityDisplay: "",
      performance: { throughput: 80, reliability: 80, responsiveness: 80 },
      liveWork: baseLiveWork({
        status: "Waiting",
        progressPercent: 50,
        currentStep: "Waiting on dependency",
        waitingFor: "CEO decision",
      }),
      visualState: "waiting_approval" as const,
      visualLabel: "Waiting Approval",
      visualEmoji: "⏳",
      desk: LIVE_OFFICE_DESKS.find((d) => d.employeeId === "emma")!,
      atApprovalZone: true,
      discussionPartnerId: null,
      discussionPartnerName: null,
      renderX: CEO_APPROVAL_ZONE.x,
      renderY: CEO_APPROVAL_ZONE.y,
      relatedMissionId: null,
      relatedMissionTitle: null,
      conversationPreview: [],
      memoryHints: [],
    } satisfies LiveOfficeEmployeeView;

    const pos = renderPosition(base);
    assert.ok(pos.y >= 70);
    assert.notEqual(pos.x, base.desk.x);
  });
});
