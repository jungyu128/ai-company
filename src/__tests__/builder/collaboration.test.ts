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
  it("plans a multi-employee chain for product → backend → QA", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-TEST-001",
      title: "Pipeline follow-up pack",
      mission:
        "Prepare product requirements, implement the API contract, and verify with QA tests",
      leadEmployeeId: "sarah",
      planSummary: "Product leads; David implements; Emma verifies",
      planSteps: ["Analyze", "Implement", "Await approval", "Verify"],
      now: "2026-07-21T00:00:00.000Z",
      ownershipMode: "collaborative",
    });

    const ids = mission.chain.map((s) => s.employeeId);
    assert.ok(ids.includes("sarah"));
    assert.ok(ids.includes("david") || ids.includes("olivia") || ids.includes("emma"));
    assert.equal(mission.approvalStatus, "pending");
    assert.equal(mission.chain[mission.chain.length - 1].status, "waiting_approval");
    assert.equal(mission.chain[0].status, "completed");
  });

  it("keeps strict ownership chain owner-first without soft peer interception", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-TEST-001b",
      title: "Frontend polish",
      mission: "Alex, polish the onboarding UI for the beta release",
      leadEmployeeId: "alex",
      planSummary: "Alex owns UI",
      planSteps: ["Implement", "Review"],
      now: "2026-07-21T00:00:00.000Z",
      ownershipMode: "strict",
    });
    assert.equal(mission.leadEmployeeId, "alex");
    assert.equal(mission.chain[0]?.employeeId, "alex");
    assert.equal(
      mission.chain.some((s) => s.employeeId === "sarah"),
      false
    );
    assert.equal(
      mission.chain.some((s) => s.employeeId === "noah"),
      false
    );
  });

  it("updates live employee statuses from active collaborations", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-TEST-002",
      title: "Email digest",
      mission: "Draft and send email digest",
      leadEmployeeId: "emma",
      planSummary: "Emma owns QA / verification",
      planSteps: ["Draft", "Approve"],
      now: "2026-07-21T00:00:00.000Z",
      ownershipMode: "collaborative",
    });

    const statuses = deriveLiveEmployeeStatuses(
      [mission],
      AI_COMPANY_EMPLOYEES.map((e) => e.id)
    );
    // Single-owner chains finish normalize with lead completed; multi-step waiters use waiting_approval.
    assert.ok(
      statuses.emma === "waiting_approval" || statuses.emma === "completed"
    );
    assert.equal(statuses.alex, "online");
  });

  it("applyApprovalDecision moves waiter to working on approve", () => {
    const mission = planCollaborationChain({
      missionId: "TASK-TEST-003",
      title: "Support reply",
      mission: "Draft support reply and verify with QA regression tests",
      leadEmployeeId: "sarah",
      planSummary: "Product + QA",
      planSteps: ["Triage", "Approve"],
      now: "2026-07-21T00:00:00.000Z",
      ownershipMode: "collaborative",
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
    assert.match(employeeVoiceLine("sarah", "analyze"), /Sarah \(Product Manager\)/);
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
        ownershipMode: "collaborative",
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
          live.emma === "working"
      );
    } finally {
      if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
      else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
