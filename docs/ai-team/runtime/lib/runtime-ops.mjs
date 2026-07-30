/**
 * Cursor AI Team — Stage 5 Daily Operations
 * Pure builders/validators for daily company ops.
 * Integrates with Stage 4 runtime; not WorkPilot product code.
 */

import {
  AGENT_ROLES,
  AGENT_OCCUPIED_STATES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  isTerminalTaskStatus,
} from "./runtime-core.mjs";

export const DEBT_SEVERITIES = ["P0", "P1", "P2", "P3"];
export const DEBT_STATUSES = ["OPEN", "PLANNED", "IN_PROGRESS", "DONE", "WONT_FIX"];
export const IMPROVEMENT_STATUSES = ["PROPOSED", "ACCEPTED", "REJECTED", "DONE"];
export const SPRINT_STATUSES = ["PLANNED", "ACTIVE", "CLOSED"];

const TASK_ID_RE = /^TASK-\d{4}-\d{2}-\d{2}-\d{3}$/;
const SPRINT_ID_RE = /^SPRINT-\d{3}$/;
const DECISION_ID_RE = /^DEC-\d{4}-\d{2}-\d{2}-\d{3}$/;
const DEBT_ID_RE = /^DEBT-\d{4}-\d{2}-\d{2}-\d{3}$/;
const IMP_ID_RE = /^IMP-\d{4}-\d{2}-\d{2}-\d{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function fail(code, message, errors = []) {
  return { ok: false, code, message, errors };
}

function ok(value, message) {
  return { ok: true, value, message };
}

/**
 * 1. Daily CEO briefing — summarize board + agent pool for morning start.
 */
export function buildDailyCeoBriefing(input = {}) {
  const errors = [];
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(date)) {
    errors.push({ field: "date", code: "INVALID_DATE", message: "date must be YYYY-MM-DD" });
  }

  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const agents = Array.isArray(input.agents) ? input.agents : [];

  if (errors.length) {
    return fail("VALIDATION_FAILED", "Daily briefing input invalid", errors);
  }

  const byStatus = Object.fromEntries(TASK_STATUSES.map((s) => [s, []]));
  for (const t of tasks) {
    const status = t?.status && TASK_STATUSES.includes(t.status) ? t.status : null;
    if (!status) continue;
    byStatus[status].push({
      id: t.id ?? t.taskId,
      title: t.title ?? "",
      owner: t.ownerRole ?? t.owner ?? "—",
      priority: t.priority ?? "P1",
    });
  }

  const waitingCeo = byStatus.WAITING_CEO;
  const blocked = byStatus.BLOCKED;
  const inFlight = [
    ...byStatus.DISCUSS,
    ...byStatus.PLANNED,
    ...byStatus.ARCHITECT,
    ...byStatus.IN_PROGRESS,
    ...byStatus.QA,
    ...byStatus.SECURITY,
    ...byStatus.REVIEW,
  ];
  const doneToday = (input.completedToday ?? byStatus.DONE).map((t) => ({
    id: t.id ?? t.taskId,
    title: t.title ?? "",
  }));

  const occupied = agents.filter((a) => AGENT_OCCUPIED_STATES.includes(a.state));
  const idle = agents.filter((a) => a.state === "Idle");

  const focus =
    waitingCeo[0] ??
    blocked[0] ??
    inFlight.find((t) => t.priority === "P0") ??
    inFlight[0] ??
    null;

  const briefing = {
    date,
    sprintId: input.sprintId ?? null,
    sprintGoal: input.sprintGoal ?? null,
    headline: focus
      ? `Focus: ${focus.id} — ${focus.title || "(untitled)"}`
      : "No active WorkPilot task — create one after briefing",
    counts: {
      total: tasks.length,
      inFlight: inFlight.length,
      waitingCeo: waitingCeo.length,
      blocked: blocked.length,
      done: byStatus.DONE.length,
      cancelled: byStatus.CANCELLED.length,
    },
    waitingCeo,
    blocked,
    inFlight,
    completedRecently: doneToday,
    agents: {
      occupied: occupied.map((a) => ({
        role: a.role,
        state: a.state,
        currentTask: a.currentTaskId ?? a.currentTask ?? null,
      })),
      idle: idle.map((a) => a.role),
      offline: agents.filter((a) => a.state === "Offline").map((a) => a.role),
    },
    ceoActions: [
      ...waitingCeo.map((t) => `Review/approve ${t.id} (WAITING_CEO)`),
      ...blocked.map((t) => `Unblock ${t.id}: ${t.title || ""}`.trim()),
      ...(focus ? [] : ['Say: Enter AI Company. 오늘 WorkPilot 목표: […]']),
    ],
    markdown: null,
  };

  briefing.markdown = formatDailyBriefingMarkdown(briefing);
  return ok(briefing, "Daily CEO briefing built");
}

export function formatDailyBriefingMarkdown(b) {
  const lines = [
    `# Daily CEO Briefing — ${b.date}`,
    "",
    `> ${b.headline}`,
    "",
    b.sprintId ? `**Sprint:** ${b.sprintId}${b.sprintGoal ? ` — ${b.sprintGoal}` : ""}` : "**Sprint:** —",
    "",
    "## Counts",
    "",
    `| In flight | Waiting CEO | Blocked | Done |`,
    `|----------:|------------:|--------:|-----:|`,
    `| ${b.counts.inFlight} | ${b.counts.waitingCeo} | ${b.counts.blocked} | ${b.counts.done} |`,
    "",
    "## CEO actions",
    "",
    ...(b.ceoActions.length ? b.ceoActions.map((a) => `- ${a}`) : ["- None"]),
    "",
    "## Waiting CEO",
    "",
    ...(b.waitingCeo.length
      ? b.waitingCeo.map((t) => `- ${t.id} (${t.priority}) — ${t.title}`)
      : ["- None"]),
    "",
    "## Blocked",
    "",
    ...(b.blocked.length
      ? b.blocked.map((t) => `- ${t.id} — ${t.title}`)
      : ["- None"]),
    "",
    "## Agents",
    "",
    `- Occupied: ${b.agents.occupied.length ? b.agents.occupied.map((a) => `${a.role}@${a.currentTask}`).join(", ") : "—"}`,
    `- Idle: ${b.agents.idle.length ? b.agents.idle.join(", ") : "—"}`,
  ];
  return lines.join("\n");
}

/**
 * 2. Sprint planning — validate sprint commit list against runtime rules.
 */
export function validateSprintPlan(plan = {}) {
  const errors = [];

  if (!plan.sprintId || !SPRINT_ID_RE.test(plan.sprintId)) {
    errors.push({ field: "sprintId", code: "INVALID_SPRINT_ID", message: "sprintId must match SPRINT-NNN" });
  }
  if (!plan.name || String(plan.name).trim().length < 3) {
    errors.push({ field: "name", code: "INVALID_NAME", message: "name is required" });
  }
  if (!plan.goal || String(plan.goal).trim().length < 3) {
    errors.push({ field: "goal", code: "INVALID_GOAL", message: "goal is required" });
  }
  if (!plan.start || !DATE_RE.test(plan.start)) {
    errors.push({ field: "start", code: "INVALID_DATE", message: "start must be YYYY-MM-DD" });
  }
  if (!plan.end || !DATE_RE.test(plan.end)) {
    errors.push({ field: "end", code: "INVALID_DATE", message: "end must be YYYY-MM-DD" });
  }
  if (plan.start && plan.end && plan.start > plan.end) {
    errors.push({ field: "end", code: "INVALID_RANGE", message: "end must be on or after start" });
  }
  if (plan.status && !SPRINT_STATUSES.includes(plan.status)) {
    errors.push({ field: "status", code: "INVALID_STATUS", message: `status must be ${SPRINT_STATUSES.join("|")}` });
  }

  const committed = Array.isArray(plan.committedTaskIds) ? plan.committedTaskIds : [];
  if (committed.length === 0) {
    errors.push({
      field: "committedTaskIds",
      code: "EMPTY_COMMITMENT",
      message: "At least one committed task id is required",
    });
  }
  for (const id of committed) {
    if (!TASK_ID_RE.test(id)) {
      errors.push({ field: "committedTaskIds", code: "INVALID_TASK_ID", message: `Invalid task id: ${id}` });
    }
  }

  const capacityRaw = plan.capacityHints?.maxActiveTasks ?? 3;
  const capacity = Number(capacityRaw);
  if (!Number.isFinite(capacity) || !Number.isInteger(capacity) || capacity < 1) {
    errors.push({
      field: "capacityHints.maxActiveTasks",
      code: "INVALID_CAPACITY",
      message: "maxActiveTasks must be a positive integer",
    });
  } else if (committed.length > capacity) {
    errors.push({
      field: "committedTaskIds",
      code: "OVER_CAPACITY",
      message: `Committed ${committed.length} tasks exceeds capacity ${capacity}`,
    });
  }

  if (errors.length) return fail("VALIDATION_FAILED", "Sprint plan validation failed", errors);

  return ok(
    {
      sprintId: plan.sprintId,
      name: String(plan.name).trim(),
      goal: String(plan.goal).trim(),
      start: plan.start,
      end: plan.end,
      status: plan.status ?? "PLANNED",
      committedTaskIds: committed,
      capacity,
    },
    "Sprint plan valid"
  );
}

/**
 * 3. Company memory — durable decision records (file-backed via docs).
 */
export function validateDecisionMemory(entry = {}) {
  const errors = [];

  if (!entry.decisionId || !DECISION_ID_RE.test(entry.decisionId)) {
    errors.push({
      field: "decisionId",
      code: "INVALID_DECISION_ID",
      message: "decisionId must match DEC-YYYY-MM-DD-NNN",
    });
  }
  if (!entry.summary || String(entry.summary).trim().length < 5) {
    errors.push({ field: "summary", code: "INVALID_SUMMARY", message: "summary is required" });
  }
  if (!entry.decision || String(entry.decision).trim().length < 3) {
    errors.push({ field: "decision", code: "INVALID_DECISION", message: "decision is required" });
  }
  if (!entry.decidedBy || !["CEO", "Orchestrator", ...AGENT_ROLES].includes(entry.decidedBy)) {
    errors.push({ field: "decidedBy", code: "INVALID_ACTOR", message: "decidedBy must be CEO, Orchestrator, or a role" });
  }
  if (entry.taskId && !TASK_ID_RE.test(entry.taskId)) {
    errors.push({ field: "taskId", code: "INVALID_TASK_ID", message: "taskId must match TASK-YYYY-MM-DD-NNN" });
  }
  if (entry.date && !DATE_RE.test(entry.date)) {
    errors.push({ field: "date", code: "INVALID_DATE", message: "date must be YYYY-MM-DD" });
  }

  if (errors.length) return fail("VALIDATION_FAILED", "Decision memory validation failed", errors);

  return ok(
    {
      decisionId: entry.decisionId,
      date: entry.date ?? new Date().toISOString().slice(0, 10),
      taskId: entry.taskId ?? null,
      summary: String(entry.summary).trim(),
      decision: String(entry.decision).trim(),
      rationale: entry.rationale ? String(entry.rationale).trim() : "",
      decidedBy: entry.decidedBy,
      tags: Array.isArray(entry.tags) ? entry.tags : [],
    },
    "Decision memory entry valid"
  );
}

export function formatDecisionMemoryMarkdown(entry) {
  return [
    `# ${entry.decisionId}`,
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Date** | ${entry.date} |`,
    `| **Task** | ${entry.taskId ?? "—"} |`,
    `| **Decided by** | ${entry.decidedBy} |`,
    `| **Tags** | ${(entry.tags ?? []).join(", ") || "—"} |`,
    "",
    "## Summary",
    "",
    entry.summary,
    "",
    "## Decision",
    "",
    entry.decision,
    "",
    "## Rationale",
    "",
    entry.rationale || "_None_",
    "",
  ].join("\n");
}

/**
 * 4. Automatic improvement proposals — from runtime signals (no new product features).
 */
export function proposeImprovements(input = {}) {
  const date = input.date ?? new Date().toISOString().slice(0, 10);
  const used = new Set(
    (input.existingIds ?? []).filter((id) => typeof id === "string" && IMP_ID_RE.test(id))
  );
  let idx = 1;
  const makeId = () => {
    let id = `IMP-${date}-${String(idx).padStart(3, "0")}`;
    while (used.has(id)) {
      idx += 1;
      id = `IMP-${date}-${String(idx).padStart(3, "0")}`;
    }
    used.add(id);
    idx += 1;
    return id;
  };
  const out = [];
  const add = (source, title, detail, severity = "P2") => {
    out.push({
      improvementId: makeId(),
      date,
      source,
      title,
      detail,
      severity,
      status: "PROPOSED",
    });
  };

  for (const a of input.deniedDispatches ?? []) {
    if (a.code === "AGENT_BUSY") {
      add(
        "availability_lock",
        "Reduce concurrent assignment pressure",
        `Dispatch denied (AGENT_BUSY) for ${a.role ?? "agent"} on ${a.taskId ?? "task"} — finish or release before reassigning.`,
        "P1"
      );
    }
  }

  for (const c of input.cancelDenied ?? []) {
    if (c.code === "ADVANCE_IN_PROGRESS") {
      add(
        "lifecycle",
        "Serialize cancel with advance lock",
        "Cancel attempted while advance lock held — orchestrator must endAdvance before cancel.",
        "P1"
      );
    }
  }

  for (const d of input.discussionFailures ?? []) {
    add(
      "discussion",
      "Enforce challenge before closing DISCUSS",
      d.message ?? "Discussion closed without challenge",
      "P2"
    );
  }

  for (const debt of input.openDebt ?? []) {
    if (debt.severity === "P0" || debt.severity === "P1") {
      add(
        "tech_debt",
        `Address ${debt.debtId ?? "debt"}: ${debt.title ?? ""}`.trim(),
        debt.impact ?? "High-severity debt remains open",
        debt.severity
      );
    }
  }

  for (const g of input.failedGates ?? []) {
    add(
      "quality_gate",
      `Repair recurring ${g.gate ?? "gate"} failure`,
      g.message ?? "Gate failed",
      "P1"
    );
  }

  if (out.length === 0 && input.forceEmptyProposal) {
    add("ops", "No automatic improvements this cycle", "Runtime signals are clean", "P3");
  }

  return ok({ date, proposals: out }, `Generated ${out.length} improvement proposal(s)`);
}

export function validateImprovementProposal(p = {}) {
  const errors = [];
  if (!p.improvementId || !IMP_ID_RE.test(p.improvementId)) {
    errors.push({ field: "improvementId", code: "INVALID_ID", message: "improvementId must match IMP-YYYY-MM-DD-NNN" });
  }
  if (!p.title || String(p.title).trim().length < 3) {
    errors.push({ field: "title", code: "INVALID_TITLE", message: "title is required" });
  }
  if (p.severity && !TASK_PRIORITIES.includes(p.severity)) {
    errors.push({ field: "severity", code: "INVALID_SEVERITY", message: "invalid severity" });
  }
  if (p.status && !IMPROVEMENT_STATUSES.includes(p.status)) {
    errors.push({ field: "status", code: "INVALID_STATUS", message: "invalid status" });
  }
  if (errors.length) return fail("VALIDATION_FAILED", "Improvement proposal invalid", errors);
  return ok(p, "Improvement proposal valid");
}

/**
 * 5. Weekly engineering report
 */
export function buildWeeklyEngineeringReport(input = {}) {
  const errors = [];
  const weekOf = input.weekOf ?? new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(weekOf)) {
    errors.push({ field: "weekOf", code: "INVALID_DATE", message: "weekOf must be YYYY-MM-DD" });
  }
  if (errors.length) return fail("VALIDATION_FAILED", "Weekly report input invalid", errors);

  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  const done = tasks.filter((t) => t.status === "DONE");
  const cancelled = tasks.filter((t) => t.status === "CANCELLED");
  const open = tasks.filter((t) => t.status && !isTerminalTaskStatus(t.status));
  const decisions = Array.isArray(input.decisions) ? input.decisions : [];
  const debt = Array.isArray(input.debt) ? input.debt : [];
  const improvements = Array.isArray(input.improvements) ? input.improvements : [];
  const releases = Array.isArray(input.releases) ? input.releases : [];

  const report = {
    weekOf,
    sprintId: input.sprintId ?? null,
    shipped: done.map((t) => ({ id: t.id ?? t.taskId, title: t.title ?? "" })),
    cancelled: cancelled.map((t) => ({ id: t.id ?? t.taskId, title: t.title ?? "" })),
    stillOpen: open.map((t) => ({
      id: t.id ?? t.taskId,
      title: t.title ?? "",
      status: t.status,
      owner: t.ownerRole ?? t.owner ?? "—",
    })),
    decisions: decisions.map((d) => ({
      id: d.decisionId,
      summary: d.summary,
      taskId: d.taskId ?? null,
    })),
    debtOpen: debt.filter((d) => d.status === "OPEN" || d.status === "PLANNED" || d.status === "IN_PROGRESS"),
    improvementsProposed: improvements.filter((i) => i.status === "PROPOSED"),
    releases,
    risks: [
      ...open.filter((t) => t.status === "BLOCKED").map((t) => `Blocked: ${t.id ?? t.taskId}`),
      ...debt.filter((d) => d.severity === "P0").map((d) => `P0 debt: ${d.debtId}`),
    ],
    markdown: null,
  };

  report.markdown = formatWeeklyReportMarkdown(report);
  return ok(report, "Weekly engineering report built");
}

export function formatWeeklyReportMarkdown(r) {
  return [
    `# Weekly Engineering Report — week of ${r.weekOf}`,
    "",
    r.sprintId ? `**Sprint:** ${r.sprintId}` : "",
    "",
    "## Shipped",
    "",
    ...(r.shipped.length ? r.shipped.map((t) => `- ${t.id} — ${t.title}`) : ["- None"]),
    "",
    "## Still open",
    "",
    ...(r.stillOpen.length
      ? r.stillOpen.map((t) => `- ${t.id} [${t.status}] (${t.owner}) — ${t.title}`)
      : ["- None"]),
    "",
    "## Decisions",
    "",
    ...(r.decisions.length ? r.decisions.map((d) => `- ${d.id}: ${d.summary}`) : ["- None"]),
    "",
    "## Tech debt (active)",
    "",
    ...(r.debtOpen.length
      ? r.debtOpen.map((d) => `- ${d.debtId} (${d.severity}) — ${d.title}`)
      : ["- None"]),
    "",
    "## Improvement proposals",
    "",
    ...(r.improvementsProposed.length
      ? r.improvementsProposed.map((i) => `- ${i.improvementId}: ${i.title}`)
      : ["- None"]),
    "",
    "## Risks",
    "",
    ...(r.risks.length ? r.risks.map((x) => `- ${x}`) : ["- None"]),
    "",
    "## Releases",
    "",
    ...(r.releases.length ? r.releases.map((x) => `- ${x}`) : ["- None"]),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * 6. Release checklist — builder release gate before CEO ship.
 */
export const RELEASE_CHECK_KEYS = [
  "taskDoneOrWaitingCeo",
  "qaPass",
  "securityPass",
  "reviewerApproved",
  "ceoApprovalRecorded",
  "handoffUpdated",
  "testsGreen",
  "noOpenP0Debt",
  "auditLogged",
];

export function validateReleaseChecklist(checklist = {}) {
  const errors = [];
  const taskId = checklist.taskId;
  if (!taskId || !TASK_ID_RE.test(taskId)) {
    errors.push({ field: "taskId", code: "INVALID_TASK_ID", message: "taskId required" });
  }

  const checks = {};
  for (const key of RELEASE_CHECK_KEYS) {
    const val = checklist[key];
    if (typeof val !== "boolean") {
      errors.push({ field: key, code: "MISSING_CHECK", message: `${key} must be boolean` });
      checks[key] = false;
    } else {
      checks[key] = val;
    }
  }

  if (errors.length) return fail("VALIDATION_FAILED", "Release checklist validation failed", errors);

  const failed = RELEASE_CHECK_KEYS.filter((k) => !checks[k]);
  const ready = failed.length === 0;

  return ok(
    {
      taskId,
      checks,
      failed,
      ready,
      recommendation: ready ? "READY_FOR_CEO_SHIP" : "BLOCKED",
    },
    ready ? "Release checklist passed" : `Release blocked: ${failed.join(", ")}`
  );
}

/**
 * 7. Technical debt tracking
 */
export function validateTechDebtItem(item = {}) {
  const errors = [];
  if (!item.debtId || !DEBT_ID_RE.test(item.debtId)) {
    errors.push({ field: "debtId", code: "INVALID_DEBT_ID", message: "debtId must match DEBT-YYYY-MM-DD-NNN" });
  }
  if (!item.title || String(item.title).trim().length < 3) {
    errors.push({ field: "title", code: "INVALID_TITLE", message: "title is required" });
  }
  if (!item.severity || !DEBT_SEVERITIES.includes(item.severity)) {
    errors.push({ field: "severity", code: "INVALID_SEVERITY", message: `severity must be ${DEBT_SEVERITIES.join("|")}` });
  }
  if (item.status && !DEBT_STATUSES.includes(item.status)) {
    errors.push({ field: "status", code: "INVALID_STATUS", message: "invalid debt status" });
  }
  if (item.relatedTaskId && !TASK_ID_RE.test(item.relatedTaskId)) {
    errors.push({ field: "relatedTaskId", code: "INVALID_TASK_ID", message: "invalid relatedTaskId" });
  }

  if (errors.length) return fail("VALIDATION_FAILED", "Tech debt item invalid", errors);

  return ok(
    {
      debtId: item.debtId,
      title: String(item.title).trim(),
      severity: item.severity,
      status: item.status ?? "OPEN",
      impact: item.impact ? String(item.impact).trim() : "",
      relatedTaskId: item.relatedTaskId ?? null,
      ownerRole: item.ownerRole && AGENT_ROLES.includes(item.ownerRole) ? item.ownerRole : "PM",
    },
    "Tech debt item valid"
  );
}

export function prioritizeTechDebt(items = []) {
  const rank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const active = items.filter((i) => i && i.status !== "DONE" && i.status !== "WONT_FIX");
  const sorted = [...active].sort((a, b) => {
    const ra = rank[a.severity] ?? 9;
    const rb = rank[b.severity] ?? 9;
    if (ra !== rb) return ra - rb;
    return String(a.debtId).localeCompare(String(b.debtId));
  });
  return ok({ items: sorted, count: sorted.length }, `Prioritized ${sorted.length} debt item(s)`);
}
