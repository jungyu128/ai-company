/**
 * Cursor AI Team — Stage 5 HQ Entry Experience
 * Aggregates Builder Runtime artifacts into a CEO headquarters view.
 * Not WorkPilot product code. No customer / Gmail / CRM data.
 */

/**
 * @typedef {object} HqSnapshot
 * @property {string} generatedAt
 * @property {{ id: string, name: string, goal: string, status: string } | null} sprint
 * @property {string} activeAgent
 * @property {{ id: string, title: string, status: string, owner: string } | null} currentTask
 * @property {Array<{ id: string, title: string, gate: string, phrase: string }>} pendingCeoApprovals
 * @property {string[]} blockedItems
 * @property {Array<{ id: string, date: string, summary: string, decidedBy: string }>} recentDecisions
 * @property {{ openDebt: number, openImprovements: number, blocked: number, waitingCeo: number, note: string }} engineeringHealth
 * @property {{ id: string, title: string, date: string, path: string } | null} latestRelease
 * @property {Array<{ id: string, title: string, date: string, path: string }>} releaseHistory
 * @property {Array<{ role: string, state: string, currentTask: string | null }>} teamStatus
 * @property {Array<{ id: string, timestamp: string, actorType: string, actorId: string, taskId: string, action: string, rationale: string }>} activityFeed
 * @property {string} recommendedNextMission
 */

function firstMatch(text, re) {
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseTaskRows(tasksMd) {
  const rows = [];
  for (const line of String(tasksMd ?? "").split(/\r?\n/)) {
    // | [TASK-…](…) | Title | Owner | Priority | Status | ...
    const m = line.match(
      /^\|\s*\[(TASK-\d{4}-\d{2}-\d{2}-\d{3})\][^|]*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/
    );
    if (!m) continue;
    rows.push({
      id: m[1].trim(),
      title: m[2].trim(),
      owner: m[3].trim(),
      priority: m[4].trim(),
      status: m[5].trim(),
    });
  }
  return rows;
}

function parseDecisionRows(memoryMd) {
  const rows = [];
  for (const line of String(memoryMd ?? "").split(/\r?\n/)) {
    const m = line.match(
      /^\|\s*\[?(DEC-\d{4}-\d{2}-\d{2}-\d{3})\]?[^|]*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/
    );
    if (!m) continue;
    if (m[1] === "Decision ID" || m[2].includes("----")) continue;
    const summary = m[4].trim();
    if (summary.startsWith("_No ") || summary === "Summary") continue;
    rows.push({
      id: m[1].trim(),
      date: m[2].trim(),
      task: m[3].trim(),
      summary,
      decidedBy: m[5].trim(),
    });
  }
  return rows;
}

function parseDebtOpenCount(debtMd) {
  let n = 0;
  for (const line of String(debtMd ?? "").split(/\r?\n/)) {
    if (!/^\|\s*DEBT-\d{4}-\d{2}-\d{2}-\d{3}\b/.test(line)) continue;
    if (/\|\s*(DONE|WONT_FIX)\s*\|/i.test(line)) continue;
    n += 1;
  }
  return n;
}

function parseImprovementOpenCount(impMd) {
  let n = 0;
  for (const line of String(impMd ?? "").split(/\r?\n/)) {
    if (!/^\|\s*IMP-\d{4}-\d{2}-\d{2}-\d{3}\b/.test(line)) continue;
    if (/\|\s*(DONE|REJECTED)\s*\|/i.test(line)) continue;
    n += 1;
  }
  return n;
}

function parseActiveSprint(sprintsMd) {
  const text = String(sprintsMd ?? "");
  const activeSection = firstMatch(text, /## Active Sprint([\s\S]*?)(?=\n## |\n---\s*\n## |$)/);
  if (!activeSection) return null;
  const id = firstMatch(activeSection, /\|\s*\*\*ID\*\*\s*\|\s*`?(SPRINT-\d{3})`?\s*\|/i);
  const nameFromHeader = firstMatch(activeSection, /###\s+SPRINT-\d{3}\s+[—–-]\s+(.+)/);
  const nameFromTable = firstMatch(activeSection, /\|\s*\*\*Name\*\*\s*\|\s*([^|]+)\|/i);
  const goal = firstMatch(activeSection, /\|\s*\*\*Goal\*\*\s*\|\s*([^|]+)\|/i);
  const status = firstMatch(activeSection, /\|\s*\*\*Status\*\*\s*\|\s*`?([^`|]+)`?\s*\|/i);
  if (!id) return null;
  return {
    id,
    name: (nameFromHeader ?? nameFromTable ?? id).trim(),
    goal: (goal ?? "—").trim(),
    status: (status ?? "ACTIVE").trim(),
  };
}

function gateForStatus(status) {
  if (status === "WAITING_CEO") return "ship_or_proposal";
  return status;
}

function recommendMission({ waiting, blocked, inFlight, currentTask }) {
  if (waiting.length > 0) {
    const t = waiting[0];
    const phrase =
      t.status === "WAITING_CEO"
        ? `Approve ${t.id} only`
        : `Review ${t.id}`;
    return `CEO approval required: ${t.id} — ${t.title}. Say: \`${phrase}\` (use proposal phrase if proposal gate).`;
  }
  if (blocked.length > 0) {
    return `Unblock ${blocked[0].id} — ${blocked[0].title}, then continue Builder Runtime pipeline.`;
  }
  if (inFlight.length > 0 || currentTask) {
    const t = currentTask ?? inFlight[0];
    return `Continue ${t.id} (${t.status}) — ${t.title}. Do not start a new feature until this task advances.`;
  }
  return 'No active WorkPilot builder task. Say: `Enter AI Company. 오늘 WorkPilot 목표: […]` to open DISCUSS.';
}

export function parseAgentStatus(agentMd, fallbackRole = "Agent") {
  const text = String(agentMd ?? "");
  const role = firstMatch(text, /\|\s*\*\*Role\*\*\s*\|\s*([^|]+)\|/i) ?? fallbackRole;
  const stateRaw = firstMatch(text, /\|\s*\*\*State\*\*\s*\|\s*`?([^`|]+)`?\s*\|/i) ?? "Offline";
  const taskRaw = firstMatch(text, /\|\s*\*\*Current task\*\*\s*\|\s*([^|]+)\|/i) ?? "—";
  const currentTask = !taskRaw || taskRaw === "—" || taskRaw === "-" ? null : taskRaw.replace(/`/g, "").trim();
  return {
    role: role.replace(/`/g, "").trim(),
    state: stateRaw.replace(/`/g, "").trim(),
    currentTask,
  };
}

export function parseAuditFeed(auditMd, limit = 12) {
  const rows = [];
  for (const line of String(auditMd ?? "").split(/\r?\n/)) {
    const m = line.match(
      /^\|\s*(AUD-[^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]*)\|\s*([^|]*)\|/
    );
    if (!m) continue;
    const id = m[1].trim();
    if (id === "Audit ID" || id.startsWith("---")) continue;
    rows.push({
      id,
      timestamp: m[2].trim(),
      actorType: m[3].trim(),
      actorId: m[4].trim(),
      taskId: m[5].trim() === "—" ? "" : m[5].trim(),
      action: m[6].trim(),
      rationale: (m[8] ?? "").trim(),
    });
  }
  return rows.slice(-limit).reverse();
}

/**
 * Build HQ snapshot from already-loaded Builder artifact text.
 * @param {object} input
 */
export function buildAiCompanyHq(input = {}) {
  const tasks = parseTaskRows(input.tasksMd);
  const decisions = parseDecisionRows(input.decisionMemoryMd).slice(0, 5);
  const sprint = parseActiveSprint(input.sprintsMd);
  const openDebt = parseDebtOpenCount(input.techDebtMd);
  const openImprovements = parseImprovementOpenCount(input.improvementBacklogMd);

  const waiting = tasks.filter((t) => t.status === "WAITING_CEO");
  const blocked = tasks.filter((t) => t.status === "BLOCKED");
  const inFlight = tasks.filter((t) =>
    ["DISCUSS", "PLANNED", "ARCHITECT", "IN_PROGRESS", "QA", "SECURITY", "REVIEW"].includes(t.status)
  );

  const currentTask =
    waiting[0] ??
    blocked[0] ??
    inFlight[0] ??
    null;

  const activeAgent =
    input.activeAgent ??
    (currentTask
      ? currentTask.status === "WAITING_CEO"
        ? "CEO"
        : currentTask.owner || "Orchestrator"
      : "Orchestrator");

  const pendingCeoApprovals = waiting.map((t) => ({
    id: t.id,
    title: t.title,
    gate: gateForStatus(t.status),
    phrase: `Approve ${t.id} only`,
  }));

  const releaseHistory = Array.isArray(input.releaseHistory) ? input.releaseHistory : [];
  const latestRelease = input.latestRelease ?? releaseHistory[0] ?? null;

  const teamStatus = Array.isArray(input.teamStatus)
    ? input.teamStatus
    : Array.isArray(input.agentDocs)
      ? input.agentDocs.map((a) => parseAgentStatus(a.content, a.role))
      : [];

  const activityFeed = Array.isArray(input.activityFeed)
    ? input.activityFeed
    : parseAuditFeed(input.auditMd, input.activityLimit ?? 12);

  const snapshot = {
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    sprint,
    activeAgent,
    currentTask: currentTask
      ? { id: currentTask.id, title: currentTask.title, status: currentTask.status, owner: currentTask.owner }
      : null,
    pendingCeoApprovals,
    blockedItems: blocked.map((t) => `${t.id} — ${t.title}`),
    recentDecisions: decisions.map((d) => ({
      id: d.id,
      date: d.date,
      summary: d.summary,
      decidedBy: d.decidedBy,
    })),
    engineeringHealth: {
      openDebt,
      openImprovements,
      blocked: blocked.length,
      waitingCeo: waiting.length,
      note:
        openDebt === 0 && blocked.length === 0
          ? "Builder health clear — no open tracked P-debt rows; watch WAITING_CEO queue."
          : "Review tech debt / blockers before starting net-new scope.",
    },
    latestRelease,
    releaseHistory,
    teamStatus,
    activityFeed,
    recommendedNextMission: recommendMission({ waiting, blocked, inFlight, currentTask }),
  };

  return { ok: true, value: snapshot, message: "AI Company HQ snapshot built" };
}

/**
 * Format HQ snapshot for CEO display (Cursor chat / CLI).
 * @param {HqSnapshot} hq
 */
export function formatAiCompanyHqMarkdown(hq) {
  const sprintLine = hq.sprint
    ? `${hq.sprint.id} — ${hq.sprint.name} (${hq.sprint.status})\n  Goal: ${hq.sprint.goal}`
    : "— (no active sprint in SPRINTS.md)";

  const taskLine = hq.currentTask
    ? `${hq.currentTask.id} — ${hq.currentTask.title} [${hq.currentTask.status}] (owner: ${hq.currentTask.owner})`
    : "—";

  const approvals =
    hq.pendingCeoApprovals.length === 0
      ? ["- None"]
      : hq.pendingCeoApprovals.map(
          (a) => `- **${a.id}** — ${a.title}\n  Say: \`${a.phrase}\``
        );

  const blocked =
    hq.blockedItems.length === 0 ? ["- None"] : hq.blockedItems.map((b) => `- ${b}`);

  const decisions =
    hq.recentDecisions.length === 0
      ? ["- None recorded"]
      : hq.recentDecisions.map(
          (d) => `- **${d.id}** (${d.date}, ${d.decidedBy}) — ${d.summary}`
        );

  const release = hq.latestRelease
    ? `${hq.latestRelease.id} — ${hq.latestRelease.title} (${hq.latestRelease.date})`
    : "—";

  const h = hq.engineeringHealth;
  const team =
    (hq.teamStatus ?? []).length === 0
      ? ["- No agent files loaded"]
      : hq.teamStatus.map(
          (a) => `- **${a.role}** — ${a.state}${a.currentTask ? ` @ ${a.currentTask}` : ""}`
        );
  const releases =
    (hq.releaseHistory ?? []).length === 0
      ? [release === "—" ? "- None" : `- ${release}`]
      : hq.releaseHistory.map((r) => `- **${r.id}** — ${r.title} (${r.date})`);
  const feed =
    (hq.activityFeed ?? []).length === 0
      ? ["- No audit events"]
      : hq.activityFeed
          .slice(0, 8)
          .map((e) => `- ${e.timestamp} · **${e.action}** (${e.actorId}) ${e.taskId || ""}`.trim());

  return [
    "# AI Company Headquarters",
    "",
    "> Internal Builder Runtime only. No WorkPilot customer, Gmail, Calendar, or CRM data.",
    "",
    `Generated: ${hq.generatedAt}`,
    "",
    "## What is my company doing right now?",
    "",
    `| Field | Value |`,
    `|-------|-------|`,
    `| **Current Sprint** | ${sprintLine.replace(/\n/g, "<br>")} |`,
    `| **Current Active Agent** | ${hq.activeAgent} |`,
    `| **Current Task** | ${taskLine} |`,
    "",
    "## What requires my approval?",
    "",
    ...approvals,
    "",
    "## Blocked Items",
    "",
    ...blocked,
    "",
    "## Team Status",
    "",
    ...team,
    "",
    "## Recent Decisions",
    "",
    ...decisions,
    "",
    "## Engineering Health",
    "",
    `| Signal | Count |`,
    `|--------|------:|`,
    `| Waiting CEO | ${h.waitingCeo} |`,
    `| Blocked tasks | ${h.blocked} |`,
    `| Open tech debt rows | ${h.openDebt} |`,
    `| Open improvements | ${h.openImprovements} |`,
    "",
    `_${h.note}_`,
    "",
    "## Release History",
    "",
    ...releases,
    "",
    "## Live Activity Feed",
    "",
    ...feed,
    "",
    "## Recommended Next Mission",
    "",
    hq.recommendedNextMission,
    "",
    "---",
    "",
    "Primary web HQ: `/builder/hq`. After CEO approval, continue the existing Builder Runtime. No Stage 6.",
    "",
  ].join("\n");
}
