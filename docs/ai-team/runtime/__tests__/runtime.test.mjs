import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  advanceTask,
  canMarkDone,
  canRecordCeoApproval,
  canRolePerformAction,
  canTransitionAgentState,
  canTransitionTaskStatus,
  cancelTask,
  isAgentAvailable,
  isTerminalTaskStatus,
  requiresCeoApproval,
  validateCeoApprovalPhrase,
  validateCeoTaskInput,
  validateDiscussionRecord,
  validateDispatch,
} from "../lib/runtime-core.mjs";
import { createRuntimeSession } from "../lib/runtime-controller.mjs";

describe("agent state machine", () => {
  it("allows Idle → Assigned → Working", () => {
    assert.equal(canTransitionAgentState("Idle", "Assigned"), true);
    assert.equal(canTransitionAgentState("Assigned", "Working"), true);
  });

  it("denies Idle → Working direct", () => {
    assert.equal(canTransitionAgentState("Idle", "Working"), false);
  });

  it("allows QA path Working → Reviewing → Completed", () => {
    assert.equal(canTransitionAgentState("Working", "Reviewing"), true);
    assert.equal(canTransitionAgentState("Reviewing", "Completed"), true);
  });
});

describe("task status transitions", () => {
  it("allows pipeline IN_PROGRESS → QA → REVIEW", () => {
    assert.equal(canTransitionTaskStatus("IN_PROGRESS", "QA"), true);
    assert.equal(canTransitionTaskStatus("QA", "REVIEW"), true);
  });

  it("allows daily discuss → planned and QA → SECURITY → REVIEW", () => {
    assert.equal(canTransitionTaskStatus("BACKLOG", "DISCUSS"), true);
    assert.equal(canTransitionTaskStatus("DISCUSS", "PLANNED"), true);
    assert.equal(canTransitionTaskStatus("QA", "SECURITY"), true);
    assert.equal(canTransitionTaskStatus("SECURITY", "REVIEW"), true);
  });

  it("allows QA fail back to IN_PROGRESS", () => {
    assert.equal(canTransitionTaskStatus("QA", "IN_PROGRESS"), true);
  });

  it("denies DONE → anything", () => {
    assert.equal(canTransitionTaskStatus("DONE", "IN_PROGRESS"), false);
  });

  it("allows cancel from active gate statuses", () => {
    assert.equal(canTransitionTaskStatus("QA", "CANCELLED"), true);
    assert.equal(canTransitionTaskStatus("WAITING_CEO", "CANCELLED"), true);
  });
});

describe("role capabilities", () => {
  it("PM can create_task but not write_product_code", () => {
    assert.equal(canRolePerformAction("PM", "create_task"), true);
    assert.equal(canRolePerformAction("PM", "write_product_code"), false);
  });

  it("Backend can write_product_code", () => {
    assert.equal(canRolePerformAction("Backend", "write_product_code"), true);
  });

  it("Security and Product have review actions", () => {
    assert.equal(canRolePerformAction("Security", "security_review"), true);
    assert.equal(canRolePerformAction("Product", "product_review"), true);
    assert.equal(canRolePerformAction("Backend", "security_review"), false);
  });
});

describe("Stage 4 employee availability lock", () => {
  it("rejects overwrite when agent is Working on another task", () => {
    const r = isAgentAvailable({
      agentState: "Working",
      currentTaskId: "TASK-A",
      taskId: "TASK-B",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "AGENT_BUSY");
  });

  it("rejects overwrite when agent is Reviewing or Assigned on another task", () => {
    assert.equal(
      isAgentAvailable({ agentState: "Reviewing", currentTaskId: "TASK-A", taskId: "TASK-B" }).code,
      "AGENT_BUSY"
    );
    assert.equal(
      isAgentAvailable({ agentState: "Assigned", currentTaskId: "TASK-A", taskId: "TASK-B" }).code,
      "AGENT_BUSY"
    );
    assert.equal(
      isAgentAvailable({ agentState: "Waiting", currentTaskId: "TASK-A", taskId: "TASK-B" }).code,
      "AGENT_BUSY"
    );
  });

  it("allows same-task re-dispatch while occupied", () => {
    const r = isAgentAvailable({
      agentState: "Working",
      currentTaskId: "TASK-A",
      taskId: "TASK-A",
    });
    assert.equal(r.ok, true);
    assert.equal(r.sameTask, true);
  });

  it("validateDispatch never overwrites occupied employee", () => {
    const r = validateDispatch({
      role: "Backend",
      agentState: "Assigned",
      currentTaskId: "TASK-OLD",
      taskId: "TASK-NEW",
      taskOwnerRole: "Backend",
      taskStatus: "IN_PROGRESS",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "AGENT_BUSY");
  });
});

describe("validateDispatch", () => {
  it("approves Backend on IN_PROGRESS task", () => {
    const r = validateDispatch({
      role: "Backend",
      agentState: "Idle",
      currentTaskId: null,
      taskId: "TASK-2026-07-08-099",
      taskOwnerRole: "Backend",
      taskStatus: "IN_PROGRESS",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.nextAgentState, "Working");
  });

  it("approves Security on SECURITY task", () => {
    const r = validateDispatch({
      role: "Security",
      agentState: "Idle",
      currentTaskId: null,
      taskId: "TASK-1",
      taskOwnerRole: "Security",
      taskStatus: "SECURITY",
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.nextAgentState, "Reviewing");
  });

  it("denies owner mismatch", () => {
    const r = validateDispatch({
      role: "Backend",
      agentState: "Idle",
      currentTaskId: null,
      taskId: "TASK-1",
      taskOwnerRole: "QA",
      taskStatus: "QA",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "OWNER_MISMATCH");
  });

  it("denies busy agent on different task", () => {
    const r = validateDispatch({
      role: "Backend",
      agentState: "Working",
      currentTaskId: "TASK-A",
      taskId: "TASK-B",
      taskOwnerRole: "Backend",
      taskStatus: "IN_PROGRESS",
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "AGENT_BUSY");
  });

  it("denies dispatch on terminal tasks", () => {
    const r = validateDispatch({
      role: "PM",
      agentState: "Idle",
      currentTaskId: null,
      taskId: "TASK-1",
      taskOwnerRole: "PM",
      taskStatus: "DONE",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "TASK_TERMINAL");
  });

  it("denies Completed → Working without Idle (transition enforcement)", () => {
    const r = validateDispatch({
      role: "Backend",
      agentState: "Completed",
      currentTaskId: null,
      taskId: "TASK-2026-07-08-099",
      taskOwnerRole: "Backend",
      taskStatus: "IN_PROGRESS",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "TRANSITION_DENIED");
  });

  it("denies Failed dispatch before transition (invalid dispatch state)", () => {
    const r = validateDispatch({
      role: "Backend",
      agentState: "Failed",
      currentTaskId: null,
      taskId: "TASK-2026-07-08-099",
      taskOwnerRole: "Backend",
      taskStatus: "IN_PROGRESS",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "INVALID_AGENT_STATE");
  });
});

describe("Stage 4 advanceTask / cancelTask lifecycle", () => {
  it("advanceTask allows valid pipeline steps", () => {
    const r = advanceTask({ from: "IN_PROGRESS", to: "QA" });
    assert.equal(r.ok, true);
  });

  it("advanceTask denies terminal source", () => {
    const r = advanceTask({ from: "DONE", to: "QA" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "TASK_TERMINAL");
  });

  it("advanceTask requires CEO approval for WAITING_CEO → DONE", () => {
    const denied = advanceTask({ from: "WAITING_CEO", to: "DONE", ceoApproved: false });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, "CEO_APPROVAL_REQUIRED");
    const ok = advanceTask({ from: "WAITING_CEO", to: "DONE", ceoApproved: true });
    assert.equal(ok.ok, true);
  });

  it("cancelTask rejects while advanceInProgress", () => {
    const r = cancelTask({ from: "IN_PROGRESS", advanceInProgress: true });
    assert.equal(r.ok, false);
    assert.equal(r.code, "ADVANCE_IN_PROGRESS");
  });

  it("cancelTask rejects terminal states", () => {
    assert.equal(cancelTask({ from: "DONE" }).code, "TASK_TERMINAL");
    assert.equal(cancelTask({ from: "CANCELLED" }).code, "TASK_TERMINAL");
  });

  it("cancelTask allows active non-terminal status", () => {
    const r = cancelTask({ from: "IN_PROGRESS", advanceInProgress: false });
    assert.equal(r.ok, true);
    assert.equal(r.to, "CANCELLED");
  });

  it("isTerminalTaskStatus recognizes DONE and CANCELLED", () => {
    assert.equal(isTerminalTaskStatus("DONE"), true);
    assert.equal(isTerminalTaskStatus("CANCELLED"), true);
    assert.equal(isTerminalTaskStatus("QA"), false);
  });
});

describe("Stage 4 runtime validation", () => {
  it("validateCeoTaskInput accepts well-formed input", () => {
    const r = validateCeoTaskInput({
      taskId: "TASK-2026-07-28-001",
      title: "Stabilize builder runtime",
      ceoGoal: "Daily reliable AI Company",
      priority: "P0",
      ownerRole: "PM",
      acceptanceCriteria: ["Lock busy agents", "Cancel race safe"],
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.taskId, "TASK-2026-07-28-001");
  });

  it("validateCeoTaskInput returns field errors", () => {
    const r = validateCeoTaskInput({ taskId: "bad", title: "x", ceoGoal: "" });
    assert.equal(r.ok, false);
    assert.equal(r.code, "VALIDATION_FAILED");
    assert.ok(r.errors.some((e) => e.field === "taskId"));
    assert.ok(r.errors.some((e) => e.field === "ceoGoal"));
  });
});

describe("Stage 4 discussion and approval reliability", () => {
  it("rejects discussion without challenges", () => {
    const r = validateDiscussionRecord({
      taskId: "TASK-2026-07-28-001",
      positions: [
        { role: "Product", challenge: "" },
        { role: "PM", challenge: "" },
      ],
      recommendation: "Ship it",
    });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.code === "DISCUSSION_NO_CHALLENGE"));
  });

  it("accepts discussion with challenge and recommendation", () => {
    const r = validateDiscussionRecord({
      taskId: "TASK-2026-07-28-001",
      positions: [
        { role: "Product", challenge: "Scope too wide" },
        { role: "Architect", challenge: "" },
      ],
      recommendation: "Cut to runtime lock only",
    });
    assert.equal(r.ok, true);
  });

  it("validates CEO approval phrases", () => {
    const ship = validateCeoApprovalPhrase("Approve TASK-2026-07-28-001 only", "TASK-2026-07-28-001");
    assert.equal(ship.ok, true);
    assert.equal(ship.gate, "ship");
    const proposal = validateCeoApprovalPhrase(
      "Approve TASK-2026-07-28-001 proposal only",
      "TASK-2026-07-28-001"
    );
    assert.equal(proposal.ok, true);
    assert.equal(proposal.gate, "proposal");
  });

  it("rejects CEO approval outside WAITING_CEO", () => {
    const r = canRecordCeoApproval({
      taskStatus: "IN_PROGRESS",
      phrase: "Approve TASK-2026-07-28-001 only",
      expectedTaskId: "TASK-2026-07-28-001",
    });
    assert.equal(r.ok, false);
    assert.equal(r.code, "INVALID_TASK_STATUS");
  });
});

describe("approval checkpoints", () => {
  it("detects CEO gate flags", () => {
    assert.equal(requiresCeoApproval({ dbMigration: true }), true);
    assert.equal(requiresCeoApproval({}), false);
  });

  it("canMarkDone requires QA, Security, Review, CEO when gated", () => {
    assert.equal(canMarkDone("WAITING_CEO", "PASS", "APPROVED", false, true).ok, false);
    assert.equal(canMarkDone("REVIEW", "PASS", "APPROVED", true, true).ok, true);
    assert.equal(canMarkDone("REVIEW", "FAIL", "APPROVED", true, false).ok, false);
    assert.equal(canMarkDone("REVIEW", "PASS", "APPROVED", true, false, "FAIL").ok, false);
  });
});

describe("Stage 4 runtime session stability", () => {
  it("records dispatch and transitions", () => {
    const session = createRuntimeSession("test-001");
    const dispatch = session.dispatch({
      role: "PM",
      agentState: "Idle",
      currentTaskId: null,
      taskId: "TASK-1",
      taskOwnerRole: "PM",
      taskStatus: "PLANNED",
    });
    assert.equal(dispatch.ok, true);
    session.transitionTask({
      actorId: "PM",
      from: "PLANNED",
      to: "ARCHITECT",
      taskId: "TASK-1",
      rationale: "handoff",
    });
    const audit = session.getAudit();
    assert.equal(audit.length, 2);
    assert.equal(audit[0].action, "DISPATCH_APPROVED");
  });

  it("rejects cancel while advance lock is held", () => {
    const session = createRuntimeSession("lock-001");
    const lock = session.beginAdvance("TASK-2026-07-28-001");
    assert.equal(lock.ok, true);
    assert.equal(session.isAdvanceInProgress(), true);

    const cancel = session.cancelTask({
      from: "IN_PROGRESS",
      taskId: "TASK-2026-07-28-001",
    });
    assert.equal(cancel.ok, false);
    assert.equal(cancel.code, "ADVANCE_IN_PROGRESS");

    session.endAdvance("TASK-2026-07-28-001");
    const cancelAfter = session.cancelTask({
      from: "IN_PROGRESS",
      taskId: "TASK-2026-07-28-001",
    });
    assert.equal(cancelAfter.ok, true);
  });

  it("allows advanceTask under held beginAdvance lock without releasing it", () => {
    const session = createRuntimeSession("lock-nested");
    assert.equal(session.beginAdvance("TASK-2026-07-28-001").ok, true);

    const advanced = session.advanceTask({
      from: "IN_PROGRESS",
      to: "QA",
      taskId: "TASK-2026-07-28-001",
    });
    assert.equal(advanced.ok, true);
    assert.equal(session.isAdvanceInProgress(), true);

    const cancel = session.cancelTask({
      from: "QA",
      taskId: "TASK-2026-07-28-001",
    });
    assert.equal(cancel.ok, false);
    assert.equal(cancel.code, "ADVANCE_IN_PROGRESS");

    session.endAdvance("TASK-2026-07-28-001");
    assert.equal(session.isAdvanceInProgress(), false);
  });

  it("advanceTask releases lock after completion", () => {
    const session = createRuntimeSession("lock-002");
    const advanced = session.advanceTask({
      from: "IN_PROGRESS",
      to: "QA",
      taskId: "TASK-2026-07-28-001",
    });
    assert.equal(advanced.ok, true);
    assert.equal(session.isAdvanceInProgress(), false);
  });

  it("audits invalid CEO task input", () => {
    const session = createRuntimeSession("val-001");
    const r = session.validateCeoTaskInput({ taskId: "x" });
    assert.equal(r.ok, false);
    assert.ok(session.getAudit().some((a) => a.action === "TASK_INPUT_INVALID"));
  });
});
