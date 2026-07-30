/**
 * Cursor AI Team — Agent Runtime Core (Phase C4 + Stage 4 Beta Stabilization)
 * Pure validation logic. Not part of WorkPilot product.
 */

export const AGENT_ROLES = [
  "PM",
  "Product",
  "Architect",
  "Backend",
  "Frontend",
  "QA",
  "Security",
  "Reviewer",
  "DevOps",
];

export const AGENT_STATES = [
  "Idle",
  "Assigned",
  "Working",
  "Waiting",
  "Blocked",
  "Reviewing",
  "Completed",
  "Failed",
  "Offline",
];

/** States that mean the employee is occupied and must not be overwritten. */
export const AGENT_OCCUPIED_STATES = ["Assigned", "Working", "Waiting", "Reviewing"];

export const TASK_STATUSES = [
  "BACKLOG",
  "DISCUSS",
  "PLANNED",
  "ARCHITECT",
  "IN_PROGRESS",
  "QA",
  "SECURITY",
  "REVIEW",
  "WAITING_CEO",
  "BLOCKED",
  "DONE",
  "CANCELLED",
];

export const TASK_TERMINAL_STATUSES = ["DONE", "CANCELLED"];

export const TASK_PRIORITIES = ["P0", "P1", "P2", "P3"];

const AGENT_TRANSITIONS = {
  Offline: ["Idle"],
  Idle: ["Assigned", "Offline"],
  Assigned: ["Working", "Blocked", "Idle"],
  Working: ["Waiting", "Reviewing", "Completed", "Failed", "Blocked"],
  Waiting: ["Working", "Blocked", "Failed"],
  Blocked: ["Assigned", "Idle"],
  Reviewing: ["Completed", "Failed", "Working"],
  Completed: ["Idle"],
  Failed: ["Assigned", "Idle"],
};

const TASK_TRANSITIONS = {
  BACKLOG: ["DISCUSS", "PLANNED", "CANCELLED"],
  DISCUSS: ["PLANNED", "ARCHITECT", "WAITING_CEO", "BLOCKED", "CANCELLED"],
  PLANNED: ["ARCHITECT", "DISCUSS", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  ARCHITECT: ["PLANNED", "WAITING_CEO", "IN_PROGRESS", "BLOCKED", "CANCELLED"],
  IN_PROGRESS: ["QA", "BLOCKED", "WAITING_CEO", "CANCELLED"],
  QA: ["IN_PROGRESS", "SECURITY", "REVIEW", "BLOCKED", "CANCELLED"],
  SECURITY: ["QA", "IN_PROGRESS", "REVIEW", "BLOCKED", "CANCELLED"],
  REVIEW: ["IN_PROGRESS", "WAITING_CEO", "DONE", "BLOCKED", "CANCELLED"],
  WAITING_CEO: ["DONE", "IN_PROGRESS", "PLANNED", "DISCUSS", "BLOCKED", "CANCELLED"],
  BLOCKED: ["DISCUSS", "PLANNED", "ARCHITECT", "IN_PROGRESS", "QA", "SECURITY", "REVIEW", "BACKLOG"],
  DONE: [],
  CANCELLED: [],
};

const ROLE_TASK_OWNER = {
  PM: ["BACKLOG", "DISCUSS", "PLANNED", "BLOCKED"],
  Product: ["DISCUSS", "PLANNED"],
  Architect: ["ARCHITECT", "PLANNED", "DISCUSS"],
  Backend: ["IN_PROGRESS"],
  Frontend: ["IN_PROGRESS"],
  QA: ["QA", "DISCUSS"],
  Security: ["SECURITY", "DISCUSS"],
  Reviewer: ["REVIEW"],
  DevOps: ["IN_PROGRESS", "WAITING_CEO"],
};

export const ROLE_ACTIONS = {
  create_task: ["PM"],
  write_adr: ["Architect"],
  write_product_code: ["Backend", "Frontend"],
  run_tests: ["QA"],
  security_review: ["Security"],
  product_review: ["Product"],
  code_review: ["Reviewer"],
  deploy_staging: ["DevOps"],
  deploy_production: ["DevOps"],
  assign_task: ["PM"],
  approve_ceo_gate: ["PM"],
  facilitate_discussion: ["PM", "Product"],
};

const TASK_ID_RE = /^TASK-\d{4}-\d{2}-\d{2}-\d{3}$/;
const CEO_APPROVE_RE = /^Approve\s+(TASK-\d{4}-\d{2}-\d{2}-\d{3})(?:\s+proposal)?\s+only\s*$/i;

export function canTransitionAgentState(from, to) {
  return (AGENT_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Dispatch may assign+start in one step (Idle → Working/Reviewing) or
 * Assigned → Reviewing for gate roles. All other moves must match the agent FSM.
 */
export function canDispatchAgentTransition(from, to) {
  if (canTransitionAgentState(from, to)) return true;
  if (from === "Idle" && (to === "Working" || to === "Reviewing")) return true;
  if (from === "Assigned" && to === "Reviewing") return true;
  return false;
}

export function canTransitionTaskStatus(from, to) {
  return (TASK_TRANSITIONS[from] ?? []).includes(to);
}

export function canRolePerformAction(role, action) {
  return (ROLE_ACTIONS[action] ?? []).includes(role);
}

export function isRoleValidForTaskStatus(role, status) {
  return (ROLE_TASK_OWNER[role] ?? []).includes(status);
}

export function isTerminalTaskStatus(status) {
  return TASK_TERMINAL_STATUSES.includes(status);
}

/**
 * Stage 4 — employee availability.
 * Occupied agents must never be overwritten for a different task.
 */
export function isAgentAvailable({ agentState, currentTaskId, taskId }) {
  if (!AGENT_OCCUPIED_STATES.includes(agentState)) {
    return { ok: true };
  }
  if (!currentTaskId) {
    return {
      ok: false,
      code: "AGENT_OCCUPIED_INCONSISTENT",
      message: `Agent state ${agentState} requires currentTaskId`,
    };
  }
  if (taskId && currentTaskId === taskId) {
    return { ok: true, sameTask: true };
  }
  return {
    ok: false,
    code: "AGENT_BUSY",
    message: `Agent already occupied on ${currentTaskId} (state=${agentState}); reject — do not overwrite`,
  };
}

export function validateDispatch(input) {
  const { role, agentState, currentTaskId, taskId, taskOwnerRole, taskStatus } = input;

  if (!taskId || typeof taskId !== "string") {
    return { ok: false, code: "INVALID_TASK_ID", message: "taskId is required" };
  }

  if (!AGENT_ROLES.includes(role)) {
    return { ok: false, code: "INVALID_ROLE", message: `Unknown role: ${role}` };
  }

  if (!AGENT_STATES.includes(agentState)) {
    return { ok: false, code: "INVALID_AGENT_STATE", message: `Unknown agent state: ${agentState}` };
  }

  if (!TASK_STATUSES.includes(taskStatus)) {
    return { ok: false, code: "INVALID_TASK_STATUS", message: `Unknown task status: ${taskStatus}` };
  }

  if (isTerminalTaskStatus(taskStatus)) {
    return { ok: false, code: "TASK_TERMINAL", message: "Task is terminal" };
  }

  const availability = isAgentAvailable({ agentState, currentTaskId, taskId });
  if (!availability.ok) {
    return availability;
  }

  if (!["Idle", "Completed", "Assigned", "Offline", "Working", "Reviewing"].includes(agentState)) {
    if (!(availability.sameTask && ["Waiting"].includes(agentState))) {
      return {
        ok: false,
        code: "INVALID_AGENT_STATE",
        message: `Cannot dispatch to agent in state ${agentState}`,
      };
    }
  }

  if (agentState === "Waiting" && !availability.sameTask) {
    return {
      ok: false,
      code: "AGENT_BUSY",
      message: `Agent waiting on ${currentTaskId}; reject — do not overwrite`,
    };
  }

  const ownerNormalized = normalizeOwnerRole(taskOwnerRole);
  if (ownerNormalized !== role) {
    return {
      ok: false,
      code: "OWNER_MISMATCH",
      message: `Task owner ${taskOwnerRole} does not match role ${role}`,
    };
  }

  if (!isRoleValidForTaskStatus(role, taskStatus)) {
    return {
      ok: false,
      code: "STATUS_MISMATCH",
      message: `Role ${role} cannot work on task in status ${taskStatus}`,
    };
  }

  const nextAgentState =
    role === "QA" || role === "Reviewer" || role === "Security" || role === "Product"
      ? "Reviewing"
      : "Working";

  const effectiveState = agentState === "Offline" ? "Idle" : agentState;

  // Same-task re-dispatch: already on this task in an active work state.
  const sameTaskActive =
    availability.sameTask &&
    (effectiveState === nextAgentState ||
      effectiveState === "Working" ||
      effectiveState === "Reviewing" ||
      effectiveState === "Assigned" ||
      effectiveState === "Waiting");

  if (!sameTaskActive && !canDispatchAgentTransition(effectiveState, nextAgentState)) {
    return {
      ok: false,
      code: "TRANSITION_DENIED",
      message: `Cannot transition agent ${agentState} → ${nextAgentState}`,
    };
  }

  return {
    ok: true,
    nextAgentState,
    message: `Dispatch approved for ${role} on ${taskId}`,
  };
}

/**
 * Stage 4 — advance task status with terminal protection.
 * @param {{ from: string, to: string, advanceInProgress?: boolean, ceoApproved?: boolean }} input
 */
export function advanceTask(input) {
  const { from, to, advanceInProgress = false, ceoApproved = false } = input ?? {};

  if (advanceInProgress) {
    return {
      ok: false,
      code: "ADVANCE_IN_PROGRESS",
      message: "Another advance is already in progress for this session",
    };
  }

  if (!TASK_STATUSES.includes(from) || !TASK_STATUSES.includes(to)) {
    return { ok: false, code: "INVALID_TASK_STATUS", message: `Invalid transition ${from} → ${to}` };
  }

  if (isTerminalTaskStatus(from)) {
    return {
      ok: false,
      code: "TASK_TERMINAL",
      message: `Cannot advance terminal task status ${from}`,
    };
  }

  if (!canTransitionTaskStatus(from, to)) {
    return {
      ok: false,
      code: "TRANSITION_DENIED",
      message: `Task transition ${from} → ${to} is not allowed`,
    };
  }

  if (to === "DONE" && from === "WAITING_CEO" && !ceoApproved) {
    return {
      ok: false,
      code: "CEO_APPROVAL_REQUIRED",
      message: "Cannot advance WAITING_CEO → DONE without CEO approval",
    };
  }

  return { ok: true, from, to, message: `Advance ${from} → ${to} approved` };
}

/**
 * Stage 4 — cancel task; reject if advance in progress or already terminal.
 * @param {{ from: string, advanceInProgress?: boolean }} input
 */
export function cancelTask(input) {
  const { from, advanceInProgress = false } = input ?? {};

  if (advanceInProgress) {
    return {
      ok: false,
      code: "ADVANCE_IN_PROGRESS",
      message: "Cannot cancel while advance is in progress",
    };
  }

  if (!TASK_STATUSES.includes(from)) {
    return { ok: false, code: "INVALID_TASK_STATUS", message: `Unknown task status: ${from}` };
  }

  if (isTerminalTaskStatus(from)) {
    return {
      ok: false,
      code: "TASK_TERMINAL",
      message: `Task already terminal (${from}); cancel rejected`,
    };
  }

  if (!canTransitionTaskStatus(from, "CANCELLED")) {
    return {
      ok: false,
      code: "TRANSITION_DENIED",
      message: `Cannot cancel from status ${from}`,
    };
  }

  return { ok: true, from, to: "CANCELLED", message: `Cancel from ${from} approved` };
}

/**
 * Stage 4 — validate CEO / PM task creation inputs.
 */
export function validateCeoTaskInput(input) {
  const errors = [];
  const data = input ?? {};

  if (!data.taskId || typeof data.taskId !== "string" || !TASK_ID_RE.test(data.taskId)) {
    errors.push({ field: "taskId", code: "INVALID_TASK_ID", message: "taskId must match TASK-YYYY-MM-DD-NNN" });
  }

  if (!data.title || typeof data.title !== "string" || data.title.trim().length < 3) {
    errors.push({ field: "title", code: "INVALID_TITLE", message: "title is required (min 3 chars)" });
  }

  if (!data.ceoGoal || typeof data.ceoGoal !== "string" || data.ceoGoal.trim().length < 3) {
    errors.push({ field: "ceoGoal", code: "INVALID_CEO_GOAL", message: "ceoGoal is required" });
  }

  if (data.priority && !TASK_PRIORITIES.includes(data.priority)) {
    errors.push({ field: "priority", code: "INVALID_PRIORITY", message: `priority must be one of ${TASK_PRIORITIES.join(", ")}` });
  }

  if (data.status && !TASK_STATUSES.includes(data.status)) {
    errors.push({ field: "status", code: "INVALID_TASK_STATUS", message: `Unknown status: ${data.status}` });
  }

  if (data.ownerRole) {
    const normalized = normalizeOwnerRole(data.ownerRole);
    if (!normalized) {
      errors.push({ field: "ownerRole", code: "INVALID_ROLE", message: `Unknown ownerRole: ${data.ownerRole}` });
    }
  }

  if (data.acceptanceCriteria !== undefined) {
    if (!Array.isArray(data.acceptanceCriteria) || data.acceptanceCriteria.length === 0) {
      errors.push({
        field: "acceptanceCriteria",
        code: "INVALID_ACCEPTANCE_CRITERIA",
        message: "acceptanceCriteria must be a non-empty array",
      });
    }
  }

  if (errors.length > 0) {
    return { ok: false, code: "VALIDATION_FAILED", errors, message: "CEO task input validation failed" };
  }

  return {
    ok: true,
    value: {
      taskId: data.taskId,
      title: data.title.trim(),
      ceoGoal: data.ceoGoal.trim(),
      priority: data.priority ?? "P1",
      status: data.status ?? "BACKLOG",
      ownerRole: data.ownerRole ? normalizeOwnerRole(data.ownerRole) : "PM",
      acceptanceCriteria: data.acceptanceCriteria ?? [],
    },
    message: "CEO task input valid",
  };
}

/**
 * Stage 4 — discussion reliability: require challenge content before close.
 */
export function validateDiscussionRecord(record) {
  const errors = [];
  const data = record ?? {};

  if (!data.taskId || !TASK_ID_RE.test(data.taskId)) {
    errors.push({ field: "taskId", code: "INVALID_TASK_ID", message: "taskId required" });
  }

  const positions = Array.isArray(data.positions) ? data.positions : [];
  if (positions.length < 2) {
    errors.push({
      field: "positions",
      code: "DISCUSSION_INCOMPLETE",
      message: "At least two role positions are required",
    });
  }

  const withChallenge = positions.filter(
    (p) => p && typeof p.challenge === "string" && p.challenge.trim().length > 0
  );
  if (positions.length >= 2 && withChallenge.length < 1) {
    errors.push({
      field: "positions",
      code: "DISCUSSION_NO_CHALLENGE",
      message: "Silent unanimous agreement is invalid; at least one challenge required",
    });
  }

  if (!data.recommendation || typeof data.recommendation !== "string" || data.recommendation.trim().length < 3) {
    errors.push({
      field: "recommendation",
      code: "DISCUSSION_NO_RECOMMENDATION",
      message: "recommendation is required before closing discussion",
    });
  }

  if (errors.length > 0) {
    return { ok: false, code: "VALIDATION_FAILED", errors, message: "Discussion record validation failed" };
  }

  return { ok: true, message: "Discussion record valid" };
}

/**
 * Stage 4 — CEO approval phrase reliability.
 */
export function validateCeoApprovalPhrase(phrase, expectedTaskId) {
  if (!phrase || typeof phrase !== "string") {
    return { ok: false, code: "INVALID_APPROVAL_PHRASE", message: "CEO approval phrase is required" };
  }

  const trimmed = phrase.trim();
  const match = trimmed.match(CEO_APPROVE_RE);
  if (!match) {
    return {
      ok: false,
      code: "INVALID_APPROVAL_PHRASE",
      message: 'Phrase must match: Approve TASK-YYYY-MM-DD-NNN only | Approve TASK-… proposal only',
    };
  }

  const normalizedTaskId = match[1];
  if (expectedTaskId && normalizedTaskId !== expectedTaskId) {
    return {
      ok: false,
      code: "TASK_ID_MISMATCH",
      message: `Approval phrase task ${normalizedTaskId} does not match ${expectedTaskId}`,
    };
  }

  const isProposal = /\sproposal\s+only\s*$/i.test(trimmed);

  return {
    ok: true,
    taskId: normalizedTaskId,
    gate: isProposal ? "proposal" : "ship",
    message: `CEO approval phrase valid (${isProposal ? "proposal" : "ship"})`,
  };
}

export function canRecordCeoApproval({ taskStatus, phrase, expectedTaskId }) {
  if (taskStatus !== "WAITING_CEO") {
    return {
      ok: false,
      code: "INVALID_TASK_STATUS",
      message: `CEO approval only allowed in WAITING_CEO (was ${taskStatus})`,
    };
  }
  return validateCeoApprovalPhrase(phrase, expectedTaskId);
}

export function normalizeOwnerRole(owner) {
  const map = {
    PM: "PM",
    pm: "PM",
    "Project Manager": "PM",
    Product: "Product",
    product: "Product",
    Architect: "Architect",
    architect: "Architect",
    Backend: "Backend",
    backend: "Backend",
    Frontend: "Frontend",
    frontend: "Frontend",
    QA: "QA",
    qa: "QA",
    Security: "Security",
    security: "Security",
    Reviewer: "Reviewer",
    reviewer: "Reviewer",
    DevOps: "DevOps",
    devops: "DevOps",
  };
  return map[owner] ?? null;
}

export function requiresCeoApproval(flags) {
  return Boolean(
    flags?.dbMigration ||
      flags?.authChange ||
      flags?.breakingApi ||
      flags?.prodDeploy ||
      flags?.ceoGate
  );
}

export function canMarkDone(
  taskStatus,
  qaVerdict,
  reviewVerdict,
  ceoApproved,
  needsCeo,
  securityVerdict = "PASS"
) {
  if (qaVerdict !== "PASS") {
    return { ok: false, reason: "QA must PASS" };
  }
  if (securityVerdict !== "PASS" && securityVerdict !== "PASS_WITH_GATES") {
    return { ok: false, reason: "Security must PASS" };
  }
  if (reviewVerdict !== "APPROVED") {
    return { ok: false, reason: "Reviewer must APPROVE" };
  }
  if (needsCeo && !ceoApproved) {
    return { ok: false, reason: "CEO approval required" };
  }
  if (taskStatus === "WAITING_CEO" && !ceoApproved) {
    return { ok: false, reason: "Task waiting on CEO" };
  }
  if (
    !canTransitionTaskStatus(taskStatus, "DONE") &&
    taskStatus !== "REVIEW" &&
    taskStatus !== "WAITING_CEO"
  ) {
    return { ok: false, reason: `Cannot transition ${taskStatus} → DONE` };
  }
  return { ok: true, reason: "OK" };
}

export function buildProgressReport(agents) {
  const working = agents.filter((a) => ["Working", "Reviewing", "Assigned"].includes(a.state));
  const blocked = agents.filter((a) => a.state === "Blocked" || a.state === "Waiting");
  const idle = agents.filter((a) => a.state === "Idle");
  return {
    summary: { working: working.length, blocked: blocked.length, idle: idle.length, total: agents.length },
    agents,
    working,
    blocked,
    idle,
  };
}

export function formatAuditLine(entry) {
  return `| ${entry.auditId} | ${entry.timestamp} | ${entry.actorType} | ${entry.actorId} | ${entry.taskId ?? "—"} | ${entry.action} | ${JSON.stringify(entry.before)} → ${JSON.stringify(entry.after)} | ${entry.rationale ?? ""} |`;
}
