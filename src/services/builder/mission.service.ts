/**
 * CEO Mission → Builder Runtime task (HQ adapter).
 * Writes mission artifacts via runtime storage only (Vercel-safe — no project fs writes).
 */

import path from "node:path";
import { formatAuditLine, validateCeoTaskInput } from "../../../docs/ai-team/runtime/lib/runtime-core.mjs";
import { generateMissionPlan, type MissionPlan } from "./mission-plan";
import { validateCeoMissionInput } from "./mission-validation";
import { getBuilderHqSnapshot, type BuilderHqSnapshot } from "./hq.service";
import { isInternalAiCompanyEnabled } from "./internal-ai-company";
import { matchEmployeeIdForText } from "./ai-company-employees";
import { planCollaborationChain, type CollaborationMission } from "./collaboration.logic";
import { upsertCollaboration } from "./collaboration.store";
import { prepareExternalWorkForEmployee } from "./execution/execution.service";
import type { ExecutionRecord } from "./execution/types";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";
import { recordWorkspaceEvent } from "./workspace/collaboration-feed";
import type { WorkspaceHumanRole } from "./workspace/types";
import {
  deleteText,
  exists,
  getText,
  listRelKeys,
  setText,
} from "./storage";

/** Exact board index path — never confuse with the `docs/ai-team/tasks/` directory. */
export const TASK_BOARD_REL = "docs/ai-team/TASKS.md";
/** Per-task detail directory. */
export const TASK_DETAILS_DIR_REL = "docs/ai-team/tasks";
export const SPRINTS_REL = "docs/ai-team/SPRINTS.md";
export const AUDIT_REL = "docs/ai-team/runtime/audit/AUDIT.log.md";

export type CreateCeoMissionResult =
  | {
      ok: true;
      taskId: string;
      title: string;
      status: "WAITING_CEO";
      sprintId: string | null;
      approvalPhrase: string;
      plan: MissionPlan;
      hq: BuilderHqSnapshot;
      collaboration: CollaborationMission;
      /** External write preview when the lead maps to Gmail/Calendar/Drive/CRM. */
      execution: ExecutionRecord | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      status?: number;
    };

function readSafe(root: string, rel: string): string {
  return getText(root, rel) ?? "";
}

function todayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function kstStamp(): string {
  const ms = Date.now() + 9 * 60 * 60 * 1000;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}+09:00`;
}

function allocateTaskId(root: string, date = todayUtcDate()): string {
  let max = 0;
  for (const rel of listRelKeys(root, TASK_DETAILS_DIR_REL)) {
    const f = rel.split("/").pop() ?? "";
    const m = f.match(new RegExp(`^TASK-${date}-(\\d{3})\\.md$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const tasksMd = readSafe(root, TASK_BOARD_REL);
  for (const line of tasksMd.split(/\r?\n/)) {
    const m = line.match(new RegExp(`TASK-${date}-(\\d{3})`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `TASK-${date}-${String(max + 1).padStart(3, "0")}`;
}

function collectExistingTitlesAndGoals(root: string): string[] {
  const out: string[] = [];
  const tasksMd = readSafe(root, TASK_BOARD_REL);
  for (const line of tasksMd.split(/\r?\n/)) {
    const m = line.match(
      /^\|\s*\[(TASK-\d{4}-\d{2}-\d{2}-\d{3})\][^|]*\|\s*([^|]+)\|/
    );
    if (m) out.push(m[2].trim());
  }
  for (const rel of listRelKeys(root, TASK_DETAILS_DIR_REL)) {
    const f = rel.split("/").pop() ?? "";
    if (!f.startsWith("TASK-") || !f.endsWith(".md")) continue;
    const body = readSafe(root, rel);
    const ceo = body.match(/\|\s*\*\*CEO Goal\*\*\s*\|\s*([^|]+)\|/i)?.[1]?.trim();
    const title = body.match(/\|\s*\*\*Title\*\*\s*\|\s*([^|]+)\|/i)?.[1]?.trim();
    if (ceo) out.push(ceo);
    if (title) out.push(title);
  }
  return out;
}

/** True if task id already appears on the board index, sprint files, or audit log. */
export function taskAlreadyIndexed(root: string, taskId: string): boolean {
  const board = readSafe(root, TASK_BOARD_REL);
  if (board.includes(taskId)) return true;
  const sprints = readSafe(root, SPRINTS_REL);
  if (sprints.includes(taskId)) return true;
  const audit = readSafe(root, AUDIT_REL);
  if (audit.includes(taskId)) return true;
  return false;
}

function writeAtomic(root: string, rel: string, contents: string) {
  setText(root, rel, contents);
}

function parseActiveSprintId(sprintsMd: string): string | null {
  const active = sprintsMd.match(/## Active Sprint([\s\S]*?)(?=\n## |\n---\s*\n## |$)/);
  if (!active) return null;
  const id = active[1].match(/\|\s*\*\*ID\*\*\s*\|\s*`?(SPRINT-\d{3})`?\s*\|/i)?.[1];
  return id ?? null;
}

function buildTaskMarkdown(input: {
  taskId: string;
  title: string;
  mission: string;
  sprintId: string | null;
  plan: MissionPlan;
  createdAt: string;
}): string {
  const { taskId, title, mission, sprintId, plan, createdAt } = input;
  const date = createdAt.slice(0, 10);
  return [
    `# ${taskId} — ${title}`,
    "",
    "## Metadata",
    "",
    "| Field | Value |",
    "|-------|--------|",
    `| **ID** | \`${taskId}\` |`,
    `| **Title** | ${title} |`,
    `| **CEO Goal** | ${mission.replace(/\r?\n/g, " ").replace(/\|/g, "/")} |`,
    `| **Status** | \`WAITING_CEO\` |`,
    `| **Gate** | \`proposal\` (no code until CEO proposal approval) |`,
    `| **Priority** | \`P1\` |`,
    `| **Owner role** | PM → CEO (proposal) |`,
    `| **Sprint** | ${sprintId ?? "—"} |`,
    `| **Milestone** | — |`,
    `| **Depends on** | None |`,
    `| **Created** | ${date} |`,
    `| **Updated** | ${date} |`,
    "",
    "---",
    "",
    "## Acceptance Criteria",
    "",
    "- [ ] Discussion Record + Final Proposal completed",
    `- [ ] CEO proposal phrase accepted: \`${plan.approvalGate}\``,
    "- [ ] Implementation stays within accepted IN scope",
    "- [ ] QA + Security + Reviewer records before ship",
    "",
    "---",
    "",
    "## Scope",
    "",
    "**IN:** Builder Runtime task artifacts, Discussion, proposal for CEO gate",
    "",
    "**OUT:** Product code until proposal approval; Stage 6; Feature 38; customer data",
    "",
    "---",
    "",
    plan.markdown.trimEnd(),
    "",
    "---",
    "",
    "## CEO Gates",
    "",
    `- [x] Proposal — say: \`${plan.approvalGate}\``,
    `- [ ] Ship — say: \`Approve ${taskId} only\` (after implementation)`,
    "",
    "---",
    "",
    "## Activity Log",
    "",
    "| Timestamp | Actor | Action | Details |",
    "|-----------|-------|--------|---------|",
    `| ${createdAt} | CEO | CREATED | HQ Mission Execute — ${title.replace(/\|/g, "/")} |`,
    `| ${createdAt} | Orchestrator | STATUS | → WAITING_CEO (proposal gate; code locked) |`,
    `| ${createdAt} | Orchestrator | MISSION_PLAN | Pre-execution plan recorded |`,
    "",
  ].join("\n");
}

function insertTaskBoardRow(
  tasksMd: string,
  row: {
    taskId: string;
    title: string;
    sprintId: string | null;
    date: string;
  }
): string {
  const line = `| [${row.taskId}](tasks/${row.taskId}.md) | ${row.title.replace(/\|/g, "/")} | PM | P1 | WAITING_CEO | ${row.sprintId ?? "—"} | — | ${row.date} |`;
  const marker = "|----|-------|-------|----------|--------|--------|-----------|---------|";
  const idx = tasksMd.indexOf(marker);
  if (idx === -1) {
    return `${tasksMd.trimEnd()}\n\n## All Tasks\n\n| ID | Title | Owner | Priority | Status | Sprint | Milestone | Updated |\n${marker}\n${line}\n`;
  }
  const insertAt = idx + marker.length;
  return `${tasksMd.slice(0, insertAt)}\n${line}${tasksMd.slice(insertAt)}`;
}

function bumpWaitingCeoSummary(tasksMd: string): string {
  return tasksMd.replace(
    /(\|\s*Waiting CEO\s*\|\s*)(\d+)(\s*\|)/i,
    (_m, a, n, c) => `${a}${Number(n) + 1}${c}`
  ).replace(
    /(\|\s*Total tasks\s*\|\s*)(\d+)(\s*\|)/i,
    (_m, a, n, c) => `${a}${Number(n) + 1}${c}`
  );
}

function appendSprintCommitted(
  sprintsMd: string,
  row: { taskId: string; title: string }
): string {
  const committedHeader = /\*\*Committed tasks\*\*[\s\S]*?\n\|[-| ]+\|\n/;
  const m = sprintsMd.match(committedHeader);
  if (!m || m.index == null) return sprintsMd;
  const insertAt = m.index + m[0].length;
  const line = `| ${row.taskId} | ${row.title.replace(/\|/g, "/")} | WAITING_CEO |\n`;
  let next = `${sprintsMd.slice(0, insertAt)}${line}${sprintsMd.slice(insertAt)}`;
  next = next.replace(
    /(\|\s*\*\*Capacity\*\*\s*\|\s*maxActiveTasks:\s*)(\d+)/i,
    (_x, a, n) => `${a}${Math.max(Number(n), 2)}`
  );
  return next;
}

function appendSprintDetailCommitted(
  detailMd: string,
  row: { taskId: string; title: string }
): string {
  const header = /## Committed tasks[\s\S]*?\n\|[-| ]+\|\n/;
  const m = detailMd.match(header);
  if (!m || m.index == null) {
    return `${detailMd.trimEnd()}\n\n## Committed tasks\n\n| Task ID | Title | Priority |\n|---------|-------|----------|\n| ${row.taskId} | ${row.title} | P1 |\n`;
  }
  const insertAt = m.index + m[0].length;
  const line = `| ${row.taskId} | ${row.title.replace(/\|/g, "/")} | P1 |\n`;
  let next = `${detailMd.slice(0, insertAt)}${line}${detailMd.slice(insertAt)}`;
  next = next.replace(
    /(\|\s*\*\*Capacity\*\*\s*\|\s*maxActiveTasks:\s*)(\d+)/i,
    (_x, a, n) => `${a}${Math.max(Number(n), 2)}`
  );
  return next;
}

function nextAuditId(auditMd: string, date = todayUtcDate()): string {
  let max = 0;
  for (const line of auditMd.split(/\r?\n/)) {
    const m = line.match(new RegExp(`AUD-${date}-(\\d{4})`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `AUD-${date}-${String(max + 1).padStart(4, "0")}`;
}

function appendAuditRow(auditMd: string, line: string): string {
  const rows = auditMd.split(/\r?\n/);
  let lastTableRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (/^\|\s*AUD-/.test(rows[i])) lastTableRow = i;
  }
  if (lastTableRow === -1) {
    return `${auditMd.trimEnd()}\n${line}\n`;
  }
  rows.splice(lastTableRow + 1, 0, line);
  return rows.join("\n");
}

/**
 * Create a CEO mission as a WAITING_CEO Builder Runtime task (proposal gate).
 * Writes use atomic rename; on failure after creating the task detail file, that
 * file is rolled back so orphans are not left behind.
 * @param repoRoot — injectable for tests
 */
export async function createCeoMission(
  missionText: string,
  options?: {
    repoRoot?: string;
    employeeId?: string | null;
    workspaceId?: string;
    actor?: {
      userId: string;
      displayName: string;
      role: WorkspaceHumanRole;
    };
  }
): Promise<CreateCeoMissionResult> {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled (INTERNAL_AI_COMPANY_ENABLED)",
      status: 403,
    };
  }

  const root = path.resolve(options?.repoRoot ?? process.cwd());
  const existing = collectExistingTitlesAndGoals(root);
  const validated = validateCeoMissionInput(missionText, existing);
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code,
      message: validated.message,
      status: 400,
    };
  }

  const { mission, title } = validated.value;
  const taskId = allocateTaskId(root);
  if (taskAlreadyIndexed(root, taskId)) {
    return {
      ok: false,
      code: "DUPLICATE",
      message: `Task ${taskId} already exists on the board, sprint, or audit log`,
      status: 409,
    };
  }

  const createdAt = kstStamp();
  const date = createdAt.slice(0, 10);
  const sprintsMd = readSafe(root, SPRINTS_REL);
  const sprintId = parseActiveSprintId(sprintsMd);
  const employeeId = options?.employeeId ?? null;

  const runtimeCheck = validateCeoTaskInput({
    taskId,
    title,
    ceoGoal: mission,
    priority: "P1",
    status: "WAITING_CEO",
    ownerRole: "PM",
    acceptanceCriteria: [
      "Discussion + Final Proposal",
      `CEO proposal approval: Approve ${taskId} proposal only`,
      "No product code before proposal approval",
    ],
  }) as { ok: boolean; message?: string };

  if (!runtimeCheck.ok) {
    return {
      ok: false,
      code: "RUNTIME_VALIDATION",
      message: runtimeCheck.message ?? "Builder Runtime rejected task input",
      status: 400,
    };
  }

  const plan = generateMissionPlan({ taskId, title, mission });
  const taskBody = buildTaskMarkdown({
    taskId,
    title,
    mission,
    sprintId,
    plan,
    createdAt,
  });

  const tasksRel = `${TASK_DETAILS_DIR_REL}/${taskId}.md`;
  if (exists(root, tasksRel)) {
    return {
      ok: false,
      code: "DUPLICATE",
      message: `Task file already exists: ${taskId}`,
      status: 409,
    };
  }

  const detailRel = sprintId ? `docs/ai-team/ops/sprints/${sprintId}.md` : null;

  const boardBefore = readSafe(root, TASK_BOARD_REL);
  const sprintsBefore = sprintsMd;
  const detailBefore = detailRel ? readSafe(root, detailRel) : "";
  const auditBefore = readSafe(root, AUDIT_REL);

  let step = "task_detail";
  try {
    writeAtomic(root, tasksRel, taskBody);

    step = "task_board";
    let tasksMd = boardBefore;
    tasksMd = insertTaskBoardRow(tasksMd, { taskId, title, sprintId, date });
    tasksMd = bumpWaitingCeoSummary(tasksMd);
    tasksMd = tasksMd.replace(
      /(\*\*Last updated:\*\*\s*)\d{4}-\d{2}-\d{2}/,
      `$1${date}`
    );
    writeAtomic(root, TASK_BOARD_REL, tasksMd);

    if (sprintId) {
      step = "sprint_index";
      writeAtomic(root, SPRINTS_REL, appendSprintCommitted(sprintsBefore, { taskId, title }));
      if (detailRel && detailBefore) {
        step = "sprint_detail";
        writeAtomic(
          root,
          detailRel,
          appendSprintDetailCommitted(detailBefore, { taskId, title })
        );
      }
    }

    step = "audit_log";
    const auditId = nextAuditId(auditBefore, date);
    const auditLine = formatAuditLine({
      auditId,
      timestamp: createdAt,
      actorType: "CEO",
      actorId: employeeId ? `employee:${employeeId}` : "hq-mission",
      taskId,
      action: "CEO_MISSION_CREATED",
      before: { status: null },
      after: {
        status: "WAITING_CEO",
        gate: "proposal",
        sprint: sprintId,
        planSteps: plan.steps.length,
        employeeId,
      },
      rationale: `HQ Execute Mission — ${title}`,
    }) as string;
    writeAtomic(root, AUDIT_REL, appendAuditRow(auditBefore, auditLine));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    try {
      deleteText(root, tasksRel);
    } catch {
      /* ignore rollback errors */
    }
    try {
      writeAtomic(root, TASK_BOARD_REL, boardBefore);
    } catch {
      /* ignore */
    }
    try {
      writeAtomic(root, SPRINTS_REL, sprintsBefore);
    } catch {
      /* ignore */
    }
    if (detailRel && detailBefore) {
      try {
        writeAtomic(root, detailRel, detailBefore);
      } catch {
        /* ignore */
      }
    }
    try {
      writeAtomic(root, AUDIT_REL, auditBefore);
    } catch {
      /* ignore */
    }
    return {
      ok: false,
      code: "WRITE_FAILED",
      message: `Mission write failed at step "${step}": ${reason}`,
      status: 500,
    };
  }

  const leadEmployeeId =
    employeeId ?? matchEmployeeIdForText(`${title} ${mission}`) ?? "emma";
  const collaboration = planCollaborationChain({
    missionId: taskId,
    title,
    mission,
    leadEmployeeId,
    planSummary: plan.summary,
    planSteps: plan.steps,
    now: new Date().toISOString(),
  });
  upsertCollaboration(collaboration, root, options?.workspaceId ?? DEFAULT_WORKSPACE_ID);

  // Execution Layer: prepare external preview for mapped employees (never auto-write).
  let execution: ExecutionRecord | null = null;
  const prepared = await prepareExternalWorkForEmployee({
    employeeId: leadEmployeeId,
    missionId: taskId,
    requestedAction: title,
    params: { guidance: mission, body: mission, note: mission, title },
    repoRoot: root,
    workspaceId: options?.workspaceId ?? DEFAULT_WORKSPACE_ID,
  });
  if (prepared.ok && prepared.record) {
    execution = prepared.record;
  }

  if (options?.actor) {
    recordWorkspaceEvent({
      workspaceId: options.workspaceId ?? DEFAULT_WORKSPACE_ID,
      kind: "assignment",
      summary: `${options.actor.displayName} assigned “${title}”`,
      actorUserId: options.actor.userId,
      actorName: options.actor.displayName,
      actorRole: options.actor.role,
      relatedType: "mission",
      relatedId: taskId,
      status: "WAITING_CEO",
      auditAction: "mission.assign",
      notify: {
        kind: "pending_approval",
        title: "Mission awaiting approval",
        body: title,
      },
      repoRoot: root,
    });
  }

  const hq = await getBuilderHqSnapshot({ repoRoot: root });

  return {
    ok: true,
    taskId,
    title,
    status: "WAITING_CEO",
    sprintId,
    approvalPhrase: plan.approvalGate,
    plan,
    hq,
    collaboration,
    execution,
  };
}

/**
 * Index an existing task detail file onto the board / sprint / audit if missing.
 * Idempotent — skips any artifact that already mentions the task id.
 */
export function reconcileTaskIndex(
  taskId: string,
  options?: { repoRoot?: string; title?: string }
): { ok: true; updated: string[] } | { ok: false; message: string } {
  const root = path.resolve(options?.repoRoot ?? process.cwd());
  const taskRel = `${TASK_DETAILS_DIR_REL}/${taskId}.md`;
  if (!exists(root, taskRel)) {
    return { ok: false, message: `Task detail missing: ${TASK_DETAILS_DIR_REL}/${taskId}.md` };
  }

  const body = readSafe(root, taskRel);
  const title =
    options?.title ??
    body.match(/\|\s*\*\*Title\*\*\s*\|\s*([^|]+)\|/i)?.[1]?.trim() ??
    taskId;
  const date =
    body.match(/\|\s*\*\*Created\*\*\s*\|\s*(\d{4}-\d{2}-\d{2})/i)?.[1]?.trim() ??
    todayUtcDate();
  const sprintsMd = readSafe(root, SPRINTS_REL);
  const sprintId = parseActiveSprintId(sprintsMd);
  const updated: string[] = [];

  let board = readSafe(root, TASK_BOARD_REL);
  if (!board.includes(taskId)) {
    board = insertTaskBoardRow(board, { taskId, title, sprintId, date });
    board = bumpWaitingCeoSummary(board);
    board = board.replace(/(\*\*Last updated:\*\*\s*)\d{4}-\d{2}-\d{2}/, `$1${date}`);
    writeAtomic(root, TASK_BOARD_REL, board);
    updated.push(TASK_BOARD_REL);
  }

  if (sprintId && !sprintsMd.includes(taskId)) {
    writeAtomic(root, SPRINTS_REL, appendSprintCommitted(sprintsMd, { taskId, title }));
    updated.push(SPRINTS_REL);
    const detailRel = `docs/ai-team/ops/sprints/${sprintId}.md`;
    const detail = readSafe(root, detailRel);
    if (detail && !detail.includes(taskId)) {
      writeAtomic(root, detailRel, appendSprintDetailCommitted(detail, { taskId, title }));
      updated.push(detailRel);
    }
  }

  const audit = readSafe(root, AUDIT_REL);
  if (!audit.includes(taskId)) {
    const stamp = kstStamp();
    const line = formatAuditLine({
      auditId: nextAuditId(audit, date),
      timestamp: stamp,
      actorType: "SYSTEM",
      actorId: "reconcile",
      taskId,
      action: "CEO_MISSION_RECONCILED",
      before: { indexed: false },
      after: { indexed: true, sprint: sprintId },
      rationale: `Reconcile orphan task detail into board — ${title}`,
    }) as string;
    writeAtomic(root, AUDIT_REL, appendAuditRow(audit, line));
    updated.push(AUDIT_REL);
  }

  return { ok: true, updated };
}
