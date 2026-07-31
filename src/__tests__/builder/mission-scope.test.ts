/**
 * Active WorkPilot mission scope — employees stay on the current objective.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import { upsertCollaboration } from "@/services/builder/collaboration.store";
import {
  isUnrelatedCommercialComms,
  isWithinActiveMissionScope,
  listActiveWorkpilotMissions,
  ceoExplicitlyRequestsComms,
  missionScopeFocusLine,
} from "@/services/builder/autonomous-company/mission-scope.logic";
import { runAutonomousCompanyCycle } from "@/services/builder/autonomous-company";
import { getAutonomyStore } from "@/services/builder/autonomous-company/autonomous-company.store";
import { runContinuousOsTick } from "@/services/builder/continuous-os";
import { detectProactiveSignals } from "@/services/builder/proactive.logic";
import { buildEmployeeChatReply } from "@/services/builder/hq-chat.logic";
import { runPeerDiscussion } from "@/services/builder/autonomous-company/peer-discussion.logic";
import { proposeDevTask } from "@/services/builder/autonomous-company/autonomy.logic";

function hqMission(now = "2026-07-31T14:00:00.000Z") {
  return planCollaborationChain({
    missionId: "TASK-SCOPE-HQ-001",
    title: "HQ Conversation autonomy",
    mission:
      "Ship WorkPilot Builder HQ conversation so employees stay on product engineering objectives.",
    leadEmployeeId: "mia",
    planSummary: "HQ chat scope lock",
    planSteps: ["Implement", "Test"],
    now,
  });
}

describe("mission scope guards", () => {
  it("flags unrelated email, outreach, CRM, and sales work", () => {
    assert.equal(isUnrelatedCommercialComms("Draft outreach email to leads"), true);
    assert.equal(isUnrelatedCommercialComms("Sales pipeline follow-up"), true);
    assert.equal(isUnrelatedCommercialComms("Update CRM contact stages"), true);
    assert.equal(
      isUnrelatedCommercialComms("Harden WorkPilot API error contracts"),
      false
    );
  });

  it("locks work to the active WorkPilot mission", () => {
    const mission = hqMission();
    const active = listActiveWorkpilotMissions([mission]);
    assert.equal(active.length, 1);

    assert.equal(
      isWithinActiveMissionScope(
        "Advance: HQ Conversation autonomy — keep chat focused",
        active
      ),
      true
    );
    assert.equal(
      isWithinActiveMissionScope("Draft a Gmail outreach sequence for prospects", active),
      false
    );
    assert.equal(
      isWithinActiveMissionScope(
        "CEO asks please draft outreach email for beta invites",
        active,
        { ceoMessage: "CEO asks please draft outreach email for beta invites" }
      ),
      true
    );
    assert.ok(ceoExplicitlyRequestsComms("CEO asks please send the email today"));
    assert.match(
      missionScopeFocusLine(active) ?? "",
      /Stay on active WorkPilot objective/
    );
  });
});

describe("scoped autonomy + continuous OS + proactive", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mission-scope-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("does not invent unrelated improvement or email work while a mission is active", () => {
    upsertCollaboration(hqMission(), tmp, "default");
    const result = runAutonomousCompanyCycle({
      repoRoot: tmp,
      now: "2026-07-31T14:05:00.000Z",
      deliverToChat: false,
    });
    assert.ok(result.tasksCreated.length >= 1);
    for (const task of result.tasksCreated) {
      assert.match(task.title, /HQ Conversation autonomy|TASK-SCOPE-HQ-001/i);
      assert.equal(
        isUnrelatedCommercialComms(`${task.title} ${task.description}`),
        false
      );
    }
    const store = getAutonomyStore(tmp, "default");
    assert.ok(
      !store.tasks.some((t) =>
        /gmail|outreach|crm|sales pipeline/i.test(`${t.title} ${t.description}`)
      )
    );
  });

  it("continuous OS creates mission-scoped work for idle employees", () => {
    upsertCollaboration(hqMission(), tmp, "default");
    const tick = runContinuousOsTick({
      repoRoot: tmp,
      now: "2026-07-31T14:10:00.000Z",
      force: true,
      runAutonomy: true,
      deliverToChat: false,
    });
    assert.equal(tick.skipped, false);
    const created = tick.decisions.filter((d) => d.kind === "create_work");
    for (const d of created) {
      assert.match(d.summary, /TASK-SCOPE-HQ-001|HQ Conversation/i);
      assert.doesNotMatch(d.summary, /outreach|Gmail|CRM/i);
    }
  });

  it("suppresses unrelated email/sales baselines when an engineering mission is active", () => {
    const signals = detectProactiveSignals({
      missions: [hqMission()],
      pendingApprovals: [],
      now: "2026-07-31T14:15:00.000Z",
    });
    assert.ok(
      !signals.some(
        (s) =>
          s.kind === "unanswered_email" ||
          s.kind === "inactive_customer" ||
          s.kind === "customer_reply"
      )
    );
  });

  it("still detects email/sales when the active mission requires them", () => {
    const sales = planCollaborationChain({
      missionId: "TASK-SCOPE-SALES-001",
      title: "Sales pipeline proposal email",
      mission:
        "Review sales opportunity, prepare proposal document, and send follow-up email",
      leadEmployeeId: "sarah",
      planSummary: "Sales pack",
      planSteps: ["Analyze"],
      now: "2026-07-31T14:20:00.000Z",
    });
    const signals = detectProactiveSignals({
      missions: [sales],
      pendingApprovals: [],
      now: "2026-07-31T14:20:00.000Z",
    });
    assert.ok(signals.some((s) => /email|sales|outreach/i.test(s.kind + s.title)));
  });

  it("keeps peer discussion and chat replies on the WorkPilot objective", () => {
    const mission = hqMission();
    const task = proposeDevTask({
      title: `Advance: ${mission.title}`,
      description: mission.mission,
      ownerEmployeeId: "mia",
      now: "2026-07-31T14:25:00.000Z",
    });
    const discussion = runPeerDiscussion({ task, now: "2026-07-31T14:25:00.000Z" });
    assert.match(discussion.synthesis, /WorkPilot work item|current objective/i);
    assert.doesNotMatch(discussion.synthesis, /draft outreach email/i);

    const reply = buildEmployeeChatReply({
      employeeId: "mia",
      employeeName: "Mia",
      employeeRole: "Frontend Engineer",
      expertise: ["UI"],
      communicationStyle: "Clear",
      currentTask: task.title,
      currentActivity: task.title,
      missionTitle: mission.title,
      missionSummary: mission.mission,
      memoryHints: [],
      knowledgeHints: [],
      recentActivity: [],
      priorMessages: [],
      activeMissions: [mission],
      ceoMessage: "What's next?",
    });
    assert.match(reply, /Stay on active WorkPilot objective/);
    assert.doesNotMatch(reply, /Unanswered emails need triage/);
  });
});
