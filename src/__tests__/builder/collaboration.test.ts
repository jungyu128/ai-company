import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyApprovalDecision,
  deriveLiveEmployeeStatuses,
  planCollaborationChain,
} from "@/services/builder/collaboration.logic";
import { listCollaborations, upsertCollaboration } from "@/services/builder/collaboration.store";
import { decideApproval, listApprovalCenter } from "@/services/builder/approval.service";
import { AI_COMPANY_EMPLOYEES, employeeVoiceLine } from "@/services/builder/ai-company-employees";

describe("collaboration workflow", () => {
  it("plans a multi-employee chain for sales → documents → email", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-TEST-001",
      title: "Pipeline follow-up pack",
      mission: "Prepare sales pipeline brief, document the offer, and send follow-up email",
      leadEmployeeId: "sarah",
      planSummary: "Sales leads; David drafts; Emma waits for CEO",
      planSteps: ["Analyze", "Document", "Await approval", "Send"],
      now: "2026-07-21T00:00:00.000Z",
    });

    const ids = mission.chain.map((s) => s.employeeId);
    assert.ok(ids.includes("sarah"));
    assert.ok(ids.includes("david"));
    assert.ok(ids.includes("emma"));
    assert.equal(mission.approvalStatus, "pending");
    assert.equal(mission.chain[mission.chain.length - 1].status, "waiting_approval");
    assert.equal(mission.chain[0].status, "completed");
  });

  it("updates live employee statuses from active collaborations", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-TEST-002",
      title: "Email digest",
      mission: "Draft and send email digest",
      leadEmployeeId: "emma",
      planSummary: "Emma owns email",
      planSteps: ["Draft", "Approve"],
      now: "2026-07-21T00:00:00.000Z",
    });

    const statuses = deriveLiveEmployeeStatuses(
      [mission],
      AI_COMPANY_EMPLOYEES.map((e) => e.id)
    );
    assert.equal(statuses.emma, "waiting_approval");
    assert.equal(statuses.alex, "online");
  });

  it("applyApprovalDecision moves waiter to working on approve", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-TEST-003",
      title: "Support reply",
      mission: "Draft support reply email",
      leadEmployeeId: "ethan",
      planSummary: "Support + email",
      planSteps: ["Triage", "Approve"],
      now: "2026-07-21T00:00:00.000Z",
    });

    const approved = applyApprovalDecision(mission, "approve", "Ship it");
    assert.equal(approved.approvalStatus, "approved");
    assert.ok(approved.chain.some((s) => s.status === "working"));
    assert.match(approved.chain.find((s) => s.status === "working")!.message, /Executing/);

    const rejected = applyApprovalDecision(mission, "reject", "Not now");
    assert.equal(rejected.approvalStatus, "rejected");

    const changes = applyApprovalDecision(mission, "request_changes", "Tighten tone");
    assert.equal(changes.approvalStatus, "changes_requested");
    assert.ok(changes.chain.some((s) => s.status === "thinking"));
  });

  it("employee voice lines reflect role personality", () => {
    assert.match(employeeVoiceLine("sarah", "analyze"), /Sarah \(AI CEO Advisor\)/);
    assert.match(employeeVoiceLine("david", "collaborate"), /David/);
    assert.match(employeeVoiceLine("emma", "await_approval"), /approval/);
  });
});

describe("approval center persistence", () => {
  it("stores collaborations and decides approvals", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-collab-"));
    const prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    try {
      fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
      const mission = planCollaborationChain({
        missionId: "TASK-STORE-001",
        title: "Calendar brief",
        mission: "Prepare calendar conflict brief and email digest",
        leadEmployeeId: "alex",
        planSummary: "Alex leads",
        planSteps: ["Analyze", "Approve"],
        now: "2026-07-21T01:00:00.000Z",
      });
      upsertCollaboration(mission, tmp);
      assert.equal(listCollaborations(tmp).length, 1);
      assert.equal(listApprovalCenter(tmp).length, 1);

      process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
      const decided = await decideApproval({
        missionId: mission.id,
        decision: "approve",
        note: "Looks good",
        repoRoot: tmp,
      });
      assert.equal(decided.ok, true);
      if (!decided.ok) return;
      assert.equal(decided.item.approvalStatus, "approved");
      assert.equal(listApprovalCenter(tmp).length, 0);

      const after = listCollaborations(tmp)[0];
      const live = deriveLiveEmployeeStatuses(
        [after],
        AI_COMPANY_EMPLOYEES.map((e) => e.id)
      );
      assert.ok(
        live.alex === "working" ||
          live.alex === "completed" ||
          live.mia === "working" ||
          live.emma === "working"
      );
    } finally {
      if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
      else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
