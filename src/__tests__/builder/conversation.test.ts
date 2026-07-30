import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyApprovalDecision,
  planCollaborationChain,
} from "@/services/builder/collaboration.logic";
import {
  buildCompanyActivityFeed,
  computeCompanyMetrics,
  ensureMissionCommunications,
  listInboxForEmployee,
  listMissionHistory,
  toMissionHistory,
} from "@/services/builder/conversation.logic";

function sampleMission() {
  return planCollaborationChain({
    missionId: "TASK-CONV-001",
    title: "Customer proposal pack",
    mission: "Analyze sales requirements, document the proposal, and draft follow-up email",
    leadEmployeeId: "sarah",
    planSummary: "Sarah → David → Emma",
    planSteps: ["Analyze", "Document", "Email", "Approve"],
    now: "2026-07-21T10:00:00.000Z",
  });
}

describe("employee conversations", () => {
  it("builds a natural conversation timeline across employees", () => {
    const mission = sampleMission();
    assert.ok(mission.conversations && mission.conversations.length >= 3);
    const bodies = mission.conversations!.map((t) => t.body);
    assert.ok(bodies.some((b) => /Customer requirements analyzed/i.test(b)));
    assert.ok(bodies.some((b) => /proposal/i.test(b)));
    assert.ok(bodies.some((b) => /Draft email is ready|email/i.test(b)));
    assert.ok(mission.conversations!.some((t) => t.employeeId === "ceo"));
  });

  it("enriches legacy missions missing conversation fields", () => {
    const mission = sampleMission();
    const legacy = {
      ...mission,
      conversations: undefined,
      activityEvents: undefined,
      inbox: undefined,
      executionTimeline: undefined,
    };
    const enriched = ensureMissionCommunications(legacy);
    assert.ok((enriched.conversations?.length ?? 0) > 0);
    assert.ok((enriched.inbox?.length ?? 0) > 0);
    assert.ok((enriched.activityEvents?.length ?? 0) > 0);
  });
});

describe("company activity feed", () => {
  it("lists newest activity first with employee updates", () => {
    const mission = sampleMission();
    const feed = buildCompanyActivityFeed([mission]);
    assert.ok(feed.length > 0);
    for (let i = 1; i < feed.length; i++) {
      assert.ok(Date.parse(feed[i - 1].at) >= Date.parse(feed[i].at));
    }
    assert.ok(feed.some((f) => /Sarah|David|Emma|CEO|approval/i.test(f.summary)));
  });
});

describe("employee inbox", () => {
  it("lets employees receive, send, wait, and complete work", () => {
    const mission = sampleMission();
    const sarahInbox = listInboxForEmployee("sarah", [mission]);
    const davidInbox = listInboxForEmployee("david", [mission]);
    const emmaInbox = listInboxForEmployee("emma", [mission]);

    assert.ok(sarahInbox.some((m) => m.status === "received" || m.status === "sent"));
    assert.ok(davidInbox.some((m) => m.status === "received" || m.status === "sent"));
    assert.ok(emmaInbox.some((m) => m.status === "waiting_reply"));

    const approved = applyApprovalDecision(mission, "approve", "Ship it", "2026-07-21T11:00:00.000Z");
    const emmaAfter = listInboxForEmployee("emma", [approved]);
    assert.ok(
      emmaAfter.some((m) => m.status === "completed" || /cleared to execute|Approved/i.test(m.body))
    );
  });
});

describe("mission history", () => {
  it("records participants, conversations, approvals, timeline, outcome, duration", () => {
    const mission = sampleMission();
    const approved = applyApprovalDecision(
      mission,
      "approve",
      "Looks good",
      "2026-07-21T10:30:00.000Z"
    );
    const history = toMissionHistory(approved);
    assert.ok(history.participatingEmployees.length >= 2);
    assert.ok(history.conversations.length >= 2);
    assert.ok(history.approvals.some((a) => a.decision === "approve"));
    assert.ok(history.executionTimeline.length >= 2);
    assert.equal(history.finalOutcome, "completed");
    assert.ok(typeof history.durationMs === "number");
    assert.ok(history.durationDisplay);

    const list = listMissionHistory([approved]);
    assert.equal(list[0].id, approved.id);
  });

  it("computes company dashboard metrics", () => {
    const pending = sampleMission();
    const done = applyApprovalDecision(
      planCollaborationChain({
        missionId: "TASK-CONV-002",
        title: "Email only",
        mission: "Draft email digest",
        leadEmployeeId: "emma",
        planSummary: "Emma",
        planSteps: ["Draft"],
        now: new Date().toISOString(),
      }),
      "approve",
      null,
      new Date().toISOString()
    );
    const metrics = computeCompanyMetrics([pending, done], 3);
    assert.ok(metrics.activeMissions >= 1);
    assert.equal(metrics.employeesWorking, 3);
    assert.ok(metrics.waitingForApproval >= 1);
    assert.ok(metrics.completedToday >= 1);
    assert.ok(metrics.companyProductivity >= 12 && metrics.companyProductivity <= 99);
  });
});
