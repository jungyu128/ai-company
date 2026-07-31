/**
 * Live Office UX mapping — visualization helpers only.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLiveOfficeConnections,
  mapStatusToLiveOfficeState,
  renderPosition,
  LIVE_OFFICE_DESKS,
  type LiveOfficeEmployeeView,
} from "@/features/builder/live-office/live-office-model";
import { formatHqTimeDisplay } from "@/services/builder/format-hq-display";
import type { CollaborationMission } from "@/services/builder/collaboration.logic";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";

describe("Live Office UX mapping", () => {
  it("maps existing employee statuses to office visual states", () => {
    assert.equal(mapStatusToLiveOfficeState("online"), "idle");
    assert.equal(mapStatusToLiveOfficeState("offline"), "idle");
    assert.equal(mapStatusToLiveOfficeState("thinking"), "thinking");
    assert.equal(mapStatusToLiveOfficeState("working"), "working");
    assert.equal(mapStatusToLiveOfficeState("collaborating"), "discussion");
    assert.equal(mapStatusToLiveOfficeState("waiting_approval"), "waiting_approval");
    assert.equal(mapStatusToLiveOfficeState("completed"), "completed");
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

  it("moves waiting-approval employees to the CEO zone", () => {
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
      liveWork: {
        status: "Waiting",
        progressPercent: 50,
        currentStep: "Waiting on dependency",
        currentTask: null,
        startedAt: null,
        estimatedCompletionAt: null,
        waitingFor: "CEO decision",
        nextPlannedAction: "Unblock dependency and resume work",
        dependencies: [],
        lastUpdate: "",
      },
      visualState: "waiting_approval" as const,
      visualLabel: "Waiting Approval",
      visualEmoji: "⏳",
      desk: LIVE_OFFICE_DESKS.find((d) => d.employeeId === "emma")!,
      atApprovalZone: true,
      relatedMissionId: null,
      relatedMissionTitle: null,
      conversationPreview: [],
      memoryHints: [],
    } satisfies LiveOfficeEmployeeView;

    const pos = renderPosition(base);
    assert.ok(pos.y >= 70);
    assert.notEqual(pos.x, base.desk.x);
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
    // 2026-07-30T03:46:00.000Z = 12:46 KST afternoon
    assert.equal(formatHqTimeDisplay("2026-07-30T03:46:00.000Z"), "오후 12:46");
    // 2026-07-30T00:05:00.000Z = 09:05 KST morning
    assert.equal(formatHqTimeDisplay("2026-07-30T00:05:00.000Z"), "오전 09:05");
    assert.equal(formatHqTimeDisplay("not-a-date"), "not-a-date");
  });
});
