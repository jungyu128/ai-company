/**
 * Autonomous AI software company orchestration for WorkPilot.
 * Preserves existing HQ APIs — feeds chat + OS via side effects only.
 */

import path from "node:path";
import { listCollaborations } from "../collaboration.store";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { getEmployeeDefinition } from "../ai-company-employees";
import {
  getConnectionStatus,
  listOpenIssues,
  listRecentPullRequests,
  type GithubIssue,
  type GithubPullRequest,
  type GithubRepoMetadata,
} from "../../github";
import {
  clarificationAlreadyAsked,
  detectMissingRequirements,
} from "./work-items.logic";
import { listActiveWorkpilotMissions, isWithinActiveMissionScope, missionCorpus } from "./mission-scope.logic";
import { getActiveCompanySprint } from "../sprints";
import {
  proposeImprovementTasks,
  proposeTasksFromMissions,
  reportFromRepoChange,
  reportsFromTask,
  buildClarificationChatBody,
} from "./autonomy.logic";
import { buildRepoSnapshot, diffRepoSnapshots } from "./repo-monitor.logic";
import {
  appendAutonomyArtifacts,
  getAutonomyStore,
  listDevTasksForEmployee,
  listUndeliveredCeoReports,
  markReportsDelivered,
  upsertDevTasks,
} from "./autonomous-company.store";
import type {
  AutonomyCycleResult,
  CeoDevReport,
  DevTask,
  RepoSnapshot,
  WorkItemLink,
} from "./types";
import { listDevOwnership } from "./dev-ownership.logic";
import {
  appendChatMessages,
  getChatThread,
} from "../hq-chat.store";
import type { HqChatMessage } from "../hq-chat.logic";
import { newHqChatId } from "../hq-chat.logic";
import { preparePlanOnlyExecution } from "../workpilot-execution";

export type RepoMonitorInput = {
  connected: boolean;
  repository: GithubRepoMetadata | null;
  issues: GithubIssue[];
  pullRequests: GithubPullRequest[];
  error?: string | null;
};

/**
 * Sync autonomy cycle using an optional injected repo snapshot (tests / cached).
 */
export function runAutonomousCompanyCycle(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  repoMonitor?: RepoMonitorInput | null;
  deliverToChat?: boolean;
}): AutonomyCycleResult {
  const root = path.resolve(input?.repoRoot ?? process.cwd());
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const store = getAutonomyStore(root, workspaceId);
  const missions = listCollaborations(root, workspaceId);
  const activeMissions = listActiveWorkpilotMissions(missions);

  const existingIds = new Set(store.tasks.map((t) => t.id));
  const existingTitles = new Set(
    store.tasks.map((t) => t.title.toLowerCase())
  );

  const activeSprint = getActiveCompanySprint({
    repoRoot: root,
    workspaceId,
  });
  const sprintId = activeSprint?.id ?? null;

  const fromMissions = proposeTasksFromMissions({
    missions: activeMissions,
    existingTaskIds: existingIds,
    now,
    sprintId,
  });
  // When a WorkPilot mission is active, do not invent unrelated improvement work.
  const improvements =
    fromMissions.length > 0 || activeMissions.length > 0
      ? []
      : proposeImprovementTasks({ now, existingTitles, sprintId }).filter((t) =>
          isWithinActiveMissionScope(
            `${t.title} ${t.description}`,
            activeMissions
          )
        );

  const tasksCreated = [...fromMissions, ...improvements].filter((t) =>
    isWithinActiveMissionScope(`${t.title} ${t.description}`, activeMissions)
  );
  if (tasksCreated.length) {
    upsertDevTasks(tasksCreated, root, workspaceId);
  }

  const activeTasks = getAutonomyStore(root, workspaceId).tasks.filter(
    (t) =>
      t.status !== "done" &&
      isWithinActiveMissionScope(`${t.title} ${t.description}`, activeMissions)
  );

  const discussions: AutonomyCycleResult["discussions"] = [];
  const reports: CeoDevReport[] = [];

  // Limit peer+CEO traffic per cycle — one CEO report per task unless re-opened later.
  for (const task of activeTasks.slice(0, 4)) {
    const alreadyReported = store.reports.some((r) => r.taskId === task.id);
    if (alreadyReported) continue;
    const produced = reportsFromTask({
      task,
      now,
      withPeerDiscussion: true,
    });
    if (produced.discussion) discussions.push(produced.discussion);
    reports.push(...produced.reports);
  }

  let repoChanges: AutonomyCycleResult["repoChanges"] = [];
  let nextSnapshot: RepoSnapshot | null = store.lastRepoSnapshot;

  if (input?.repoMonitor) {
    const issues = input.repoMonitor.issues;
    const pullRequests = input.repoMonitor.pullRequests;
    nextSnapshot = buildRepoSnapshot({
      capturedAt: now,
      connected: input.repoMonitor.connected,
      repository: input.repoMonitor.repository,
      issues,
      pullRequests,
      error: input.repoMonitor.error,
    });
    repoChanges = diffRepoSnapshots({
      previous: store.lastRepoSnapshot,
      next: nextSnapshot,
      issues,
      pullRequests,
      repository: input.repoMonitor.repository,
    });
    for (const change of repoChanges) {
      reports.push(reportFromRepoChange(change, now));
    }
  }

  appendAutonomyArtifacts({
    discussions,
    reports,
    repoChanges,
    lastRepoSnapshot: nextSnapshot,
    lastCycleAt: now,
    repoRoot: root,
    workspaceId,
  });

  // Controlled execution: architecture / review reports also prepare a plan-only package (no writes).
  for (const report of reports) {
    if (
      report.kind === "architecture_proposal" ||
      report.kind === "code_review_request"
    ) {
      preparePlanOnlyExecution({
        employeeId: report.employeeId,
        workItem: report.workItem,
        goal: report.title,
        planMarkdown: `# ${report.title}\n\n${report.body}\n`,
        repoRoot: root,
        workspaceId,
        now,
      });
    }
  }

  const chatDeliveries =
    input?.deliverToChat === false
      ? []
      : deliverCeoReportsToChat({
          repoRoot: root,
          workspaceId,
          now,
        });

  return {
    tasksCreated,
    discussions,
    reports,
    repoChanges,
    chatDeliveries,
  };
}

/**
 * Refresh from live GitHub (or degraded offline), then run autonomy cycle.
 */
export async function refreshAutonomousCompany(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  deliverToChat?: boolean;
}): Promise<AutonomyCycleResult> {
  const now = input?.now ?? new Date().toISOString();
  let repoMonitor: RepoMonitorInput | null = null;
  try {
    const status = await getConnectionStatus();
    if (status.connected && status.repository) {
      const [issues, pullRequests] = await Promise.all([
        listOpenIssues().catch(() => [] as GithubIssue[]),
        listRecentPullRequests().catch(() => [] as GithubPullRequest[]),
      ]);
      repoMonitor = {
        connected: true,
        repository: status.repository,
        issues,
        pullRequests,
        error: null,
      };
    } else {
      repoMonitor = {
        connected: false,
        repository: null,
        issues: [],
        pullRequests: [],
        error: status.error,
      };
    }
  } catch (e) {
    repoMonitor = {
      connected: false,
      repository: null,
      issues: [],
      pullRequests: [],
      error: e instanceof Error ? e.message : "GitHub monitor failed",
    };
  }

  return runAutonomousCompanyCycle({
    repoRoot: input?.repoRoot,
    workspaceId: input?.workspaceId,
    now,
    repoMonitor,
    deliverToChat: input?.deliverToChat,
  });
}

export function deliverCeoReportsToChat(input: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  limit?: number;
}): Array<{ employeeId: string; reportId: string }> {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input.now ?? new Date().toISOString();
  const undelivered = listUndeliveredCeoReports(root, workspaceId).slice(
    0,
    input.limit ?? 8
  );
  const deliveries: Array<{ employeeId: string; reportId: string }> = [];

  for (const report of undelivered) {
    const thread = getChatThread(report.employeeId, root, workspaceId);
    const already = thread.messages.some(
      (m) =>
        m.kind === "proactive" &&
        m.body.includes(report.workItem.id) &&
        m.body.includes(report.title.slice(0, 40))
    );
    if (already) {
      markReportsDelivered([report.id], root, workspaceId);
      continue;
    }

    const message: HqChatMessage = {
      id: newHqChatId("hqchat-auto"),
      employeeId: report.employeeId,
      role: "employee",
      speakerName: report.employeeName,
      speakerRole:
        getEmployeeDefinition(report.employeeId)?.role ?? "AI Employee",
      body: `${reportKindLabel(report.kind)}\n${report.body}`,
      at: now,
      kind: "proactive",
      proactiveReason: mapReportToProactiveReason(report),
      recommendationId: null,
      clientRequestId: null,
    };

    appendChatMessages({
      employeeId: report.employeeId,
      messages: [message],
      unreadProactive: true,
      repoRoot: root,
      workspaceId,
    });
    markReportsDelivered([report.id], root, workspaceId);
    deliveries.push({ employeeId: report.employeeId, reportId: report.id });
  }

  return deliveries;
}

function reportKindLabel(kind: CeoDevReport["kind"]): string {
  switch (kind) {
    case "completed_report":
      return "Completed report";
    case "architecture_proposal":
      return "Architecture proposal";
    case "bug_report":
      return "Bug report";
    case "code_review_request":
      return "Code review request";
    case "deployment_approval":
      return "Deployment approval";
    case "product_recommendation":
      return "Product recommendation";
    case "clarification_request":
      return "Clarification needed";
    case "progress_update":
      return "Progress update";
    case "blocker":
      return "Blocker";
    case "repo_change":
      return "WorkPilot repository update";
    default:
      return "Update";
  }
}

function mapReportToProactiveReason(
  report: CeoDevReport
): HqChatMessage["proactiveReason"] {
  if (report.kind === "clarification_request") return "question";
  if (report.kind === "blocker" || report.kind === "bug_report") return "risk";
  if (
    report.kind === "deployment_approval" ||
    report.kind === "architecture_proposal" ||
    report.kind === "code_review_request"
  ) {
    return "approval_request";
  }
  return "report";
}

export function getEmployeeDevContext(input: {
  employeeId: string;
  repoRoot?: string;
  workspaceId?: string;
}): {
  ownership: ReturnType<typeof listDevOwnership>[number] | null;
  tasks: DevTask[];
  primaryWorkItem: WorkItemLink | null;
  missingRequirements: string[];
} {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const ownership =
    listDevOwnership().find((o) => o.employeeId === input.employeeId) ?? null;
  const tasks = listDevTasksForEmployee(input.employeeId, root, workspaceId);
  const primary =
    tasks.find((t) => t.status === "needs_clarification") ??
    tasks.find((t) => t.status === "blocked") ??
    tasks.find((t) => t.status === "in_progress") ??
    tasks[0] ??
    null;
  return {
    ownership,
    tasks,
    primaryWorkItem: primary?.workItem ?? null,
    missingRequirements: primary?.missingRequirements ?? [],
  };
}

/**
 * Used by HQ chat when the CEO message hits incomplete requirements.
 */
export function maybeClarificationReply(input: {
  employeeId: string;
  ceoMessage: string;
  repoRoot?: string;
  workspaceId?: string;
  priorMessages?: Array<{ role: string; body: string }>;
}): string | null {
  const ctx = getEmployeeDevContext(input);
  const task =
    ctx.tasks.find((t) => t.status === "needs_clarification") ??
    ctx.tasks.find((t) => t.missingRequirements.length > 0) ??
    null;
  if (!task || !ctx.primaryWorkItem) return null;

  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const missions = listCollaborations(root, workspaceId);
  const active = listActiveWorkpilotMissions(missions);
  const missionCorpusText = active.map(missionCorpus).join("\n");
  const repoEvidence = [
    ...task.workItem.refs,
    task.progressNote ?? "",
    ...(ctx.ownership?.owns ?? []),
  ].filter(Boolean);

  const ceo = input.ceoMessage.trim();
  if (
    ceo.length >= 48 &&
    /\b(accept|criteria|done when|desktop|mobile|auth|permission|deadline|ship|priority|scope)\b/i.test(
      ceo
    )
  ) {
    return null;
  }

  const needed = detectMissingRequirements({
    title: task.title,
    description: task.description,
    ceoMessage: input.ceoMessage,
    missionCorpus: missionCorpusText,
    repositoryEvidence: repoEvidence,
  });

  // Group: keep only stored misses that are still unresolved, else fresh list.
  const finalMissing = (
    task.missingRequirements.length > 0
      ? task.missingRequirements.filter((m) =>
          needed.some(
            (n) =>
              n === m ||
              n.toLowerCase().includes(m.toLowerCase().slice(0, 12)) ||
              m.toLowerCase().includes(n.toLowerCase().slice(0, 12))
          )
        )
      : needed
  ).slice(0, 4);

  if (finalMissing.length === 0) return null;

  const prior =
    input.priorMessages ??
    getChatThread(input.employeeId, root, workspaceId).messages.map((m) => ({
      role: m.role,
      body: m.body,
    }));
  if (clarificationAlreadyAsked(prior, finalMissing)) return null;

  const emp = getEmployeeDefinition(input.employeeId);
  return buildClarificationChatBody({
    employeeName: emp?.name ?? input.employeeId,
    workItem: task.workItem,
    missingRequirements: finalMissing,
    ceoMessage: input.ceoMessage,
  });
}

export function listCeoDevInbox(input?: {
  repoRoot?: string;
  workspaceId?: string;
  limit?: number;
}): CeoDevReport[] {
  const store = getAutonomyStore(
    input?.repoRoot ?? process.cwd(),
    input?.workspaceId ?? DEFAULT_WORKSPACE_ID
  );
  return store.reports.slice(0, input?.limit ?? 40);
}
