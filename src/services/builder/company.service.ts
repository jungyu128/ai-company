/**
 * Maps internal HQ + collaboration state into AI Employee company views.
 * UI never sees runtime file paths or engine terminology.
 */

import { formatHqDateTimeDisplay } from "./format-hq-display";
import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
  matchEmployeeIdForText,
  type AiCompanyEmployeeDefinition,
  type AiCompanyEmployeeStatus,
} from "./ai-company-employees";
import type { BuilderHqSnapshot } from "./hq.service";
import { getBuilderHqSnapshot } from "./hq.service";
import { deriveLiveEmployeeStatuses, type CollaborationMission } from "./collaboration.logic";
import { listCollaborations } from "./collaboration.store";
import {
  listAllApprovalHistory,
  listApprovalCenter,
  type ApprovalCenterItem,
} from "./approval.service";
import {
  buildCompanyActivityFeed,
  computeCompanyMetrics,
  listInboxForEmployee,
  listMissionHistory,
  type ActivityFeedItem,
  type CompanyDashboardMetrics,
  type InboxMessage,
  type MissionHistoryRecord,
} from "./conversation.logic";
import { runCompanyOperatingSystem, type CeoCommandCenter } from "./os.service";
import type {
  CompanyHealth,
  EmployeeRecommendation,
  ExecutiveBrief,
  PriorityAlert,
} from "./proactive.logic";
import { listExecutionHistory } from "./execution/execution.service";
import type { ExecutionRecord } from "./execution/types";
import {
  DEFAULT_WORKSPACE_ID,
  getWorkspaceCollaborationSnapshot,
} from "./workspace/workspace.service";
import { listWorkspacesForUser } from "./workspace/workspace.store";
import type {
  ActivityItem,
  AiCompanyWorkspace,
  WorkspaceMember,
  WorkspaceNotification,
  WorkspaceAuditEntry,
} from "./workspace/types";
import { getExecutiveDashboard } from "./ceo/ceo.service";
import type { ExecutiveDashboard } from "./ceo/types";

export type CompanyWorkItem = {
  id: string;
  title: string;
  state: "in_progress" | "awaiting_approval" | "done" | "queued";
  ownerEmployeeId: string | null;
};

export type AiCompanyEmployeeCard = {
  id: string;
  name: string;
  role: string;
  department: string;
  summary: string;
  avatar: { initials: string; hue: string };
  expertise: string[];
  communicationStyle: string;
  status: AiCompanyEmployeeStatus;
  currentActivity: string | null;
  currentTask: string | null;
  activeWorkload: number;
  completedToday: number;
  pendingApprovals: number;
  lastActivityDisplay: string;
  performance: {
    throughput: number;
    reliability: number;
    responsiveness: number;
  };
};

export type AiCompanyEmployeeProfile = AiCompanyEmployeeCard & {
  responsibilities: string[];
  actions: string[];
  taskQueue: CompanyWorkItem[];
  completedWork: CompanyWorkItem[];
  waitingApprovals: Array<{ id: string; title: string; actionLabel: string }>;
  companyMemory: string[];
  activityTimeline: Array<{
    id: string;
    whenDisplay: string;
    summary: string;
    kind: "activity" | "collaboration" | "approval" | "mission";
  }>;
  collaborationHistory: CollaborationMission[];
  approvalHistory: ApprovalCenterItem[];
  recentMissions: Array<{ id: string; title: string; status: string }>;
  inbox: InboxMessage[];
  missionHistory: MissionHistoryRecord[];
  executionHistory: ExecutionRecord[];
};

export type AiCompanyDashboard = {
  generatedAtDisplay: string;
  headline: string;
  briefing: string | null;
  employees: AiCompanyEmployeeCard[];
  pendingApprovals: ApprovalCenterItem[];
  activeCollaborations: CollaborationMission[];
  activityFeed: ActivityFeedItem[];
  missionHistory: MissionHistoryRecord[];
  metrics: CompanyDashboardMetrics;
  executiveBrief: ExecutiveBrief;
  recommendations: EmployeeRecommendation[];
  priorityAlerts: PriorityAlert[];
  risks: string[];
  opportunities: string[];
  companyHealth: CompanyHealth;
  /** v4 Command Center — self-operating company view. */
  commandCenter: CeoCommandCenter;
  /** v8 multi-user workspace collaboration. */
  workspace: {
    activeWorkspaceId: string;
    workspaces: AiCompanyWorkspace[];
    members: WorkspaceMember[];
    activityTimeline: ActivityItem[];
    notifications: WorkspaceNotification[];
    audit: WorkspaceAuditEntry[];
  };
  /** v10 AI CEO executive operations. */
  executive: ExecutiveDashboard;
};

function performanceFor(status: AiCompanyEmployeeStatus, completedToday: number) {
  const base =
    status === "working" || status === "collaborating"
      ? 88
      : status === "thinking"
        ? 84
        : status === "waiting_approval"
          ? 78
          : status === "completed"
            ? 90
            : status === "online"
              ? 82
              : 55;
  return {
    throughput: Math.min(99, base + completedToday * 3),
    reliability: Math.min(99, base + 4),
    responsiveness: Math.min(99, base + (status === "working" ? 6 : 2)),
  };
}

function fallbackStatusFromHq(
  def: AiCompanyEmployeeDefinition,
  hq: BuilderHqSnapshot
): AiCompanyEmployeeStatus {
  const relatedApprovals = hq.pendingCeoApprovals.filter(
    (a) => matchEmployeeIdForText(`${a.title} ${a.id}`) === def.id
  );
  const current = hq.currentTask;
  const currentMatch =
    current && matchEmployeeIdForText(`${current.title} ${current.id}`) === def.id
      ? current
      : null;

  if (relatedApprovals.length > 0 || currentMatch?.status === "WAITING_CEO") {
    return "waiting_approval";
  }
  if (
    currentMatch &&
    ["IN_PROGRESS", "QA", "SECURITY", "REVIEW", "DISCUSS", "ARCHITECT", "PLANNED"].includes(
      currentMatch.status
    )
  ) {
    return "working";
  }
  if (currentMatch && ["DISCUSS", "ARCHITECT"].includes(currentMatch.status)) {
    return "thinking";
  }
  return "online";
}

function toCard(
  def: AiCompanyEmployeeDefinition,
  hq: BuilderHqSnapshot,
  liveStatuses: Record<string, AiCompanyEmployeeStatus>,
  missions: CollaborationMission[]
): AiCompanyEmployeeCard {
  const relatedMissions = missions.filter((m) =>
    m.chain.some((s) => s.employeeId === def.id)
  );
  const relatedApprovals = hq.pendingCeoApprovals.filter(
    (a) => matchEmployeeIdForText(a.title) === def.id
  );
  const status = liveStatuses[def.id] ?? fallbackStatusFromHq(def, hq);

  const activeStep = relatedMissions
    .flatMap((m) => m.chain.map((s) => ({ m, s })))
    .find(({ s }) => s.employeeId === def.id && s.status !== "queued" && s.status !== "completed");

  const completedToday = hq.activityFeed.filter((e) => {
    const forEmp =
      matchEmployeeIdForText(`${e.action} ${e.rationale} ${e.taskId}`) === def.id ||
      e.actorId.toLowerCase().includes(def.name.toLowerCase());
    return forEmp && /DONE|FINISH|COMPLETE|SHIP|RECONCILED|MISSION/i.test(e.action);
  }).length;

  const last = hq.activityFeed.find((e) => {
    const blob = `${e.action} ${e.rationale} ${e.taskId}`;
    return matchEmployeeIdForText(blob) === def.id || e.actorId.toLowerCase().includes(def.id);
  });

  return {
    id: def.id,
    name: def.name,
    role: def.role,
    department: def.department,
    summary: def.summary,
    avatar: def.avatar,
    expertise: def.expertise,
    communicationStyle: def.communicationStyle,
    status,
    currentActivity: activeStep?.s.message ?? null,
    currentTask:
      activeStep?.m.title ??
      relatedApprovals[0]?.title ??
      (hq.currentTask && matchEmployeeIdForText(hq.currentTask.title) === def.id
        ? hq.currentTask.title
        : null),
    activeWorkload:
      relatedMissions.filter((m) => m.approvalStatus === "pending").length +
      relatedApprovals.length,
    completedToday,
    pendingApprovals: relatedApprovals.length,
    lastActivityDisplay: last
      ? formatHqDateTimeDisplay(last.timestamp)
      : hq.generatedAtDisplay,
    performance: performanceFor(status, completedToday),
  };
}

export async function getAiCompanyDashboard(options?: {
  lastVisitAt?: string | null;
  repoRoot?: string;
  workspaceId?: string;
  userId?: string;
}): Promise<AiCompanyDashboard> {
  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const hq = await getBuilderHqSnapshot({
    lastVisitAt: options?.lastVisitAt ?? null,
    repoRoot: root,
  });
  const missions = listCollaborations(root, workspaceId);
  const liveStatuses = deriveLiveEmployeeStatuses(
    missions,
    AI_COMPANY_EMPLOYEES.map((e) => e.id)
  );
  const employees = AI_COMPANY_EMPLOYEES.map((def) =>
    toCard(def, hq, liveStatuses, missions)
  );
  const pendingApprovals = listApprovalCenter(root, workspaceId);
  const activeCollaborations = missions.filter(
    (m) => m.approvalStatus === "pending" || m.approvalStatus === "approved"
  );
  const employeesWorking = employees.filter((e) =>
    ["working", "collaborating", "thinking"].includes(e.status)
  ).length;

  const metrics = computeCompanyMetrics(missions, employeesWorking);
  const os = runCompanyOperatingSystem({
    repoRoot: root,
    generatedAtDisplay: hq.generatedAtDisplay,
    metrics,
    workspaceId,
  });

  const collab = getWorkspaceCollaborationSnapshot({
    workspaceId,
    userId: options?.userId ?? "anonymous",
    repoRoot: root,
  });
  const visibleWorkspaces = options?.userId
    ? listWorkspacesForUser(options.userId, root)
    : collab.workspaces.filter((w) => w.id === workspaceId);

  const executive = getExecutiveDashboard({
    workspaceId,
    repoRoot: root,
    refresh: true,
  });

  return {
    generatedAtDisplay: hq.generatedAtDisplay,
    headline: os.executiveBrief.headline,
    briefing: os.executiveBrief.summary,
    employees,
    pendingApprovals,
    activeCollaborations,
    activityFeed: buildCompanyActivityFeed(missions),
    missionHistory: listMissionHistory(missions),
    metrics,
    executiveBrief: os.executiveBrief,
    recommendations: os.recommendations,
    priorityAlerts: os.priorityAlerts,
    risks: os.risks,
    opportunities: os.opportunities,
    companyHealth: os.companyHealth,
    commandCenter: os.commandCenter,
    workspace: {
      activeWorkspaceId: workspaceId,
      workspaces: visibleWorkspaces,
      members: collab.members,
      activityTimeline: collab.activity,
      notifications: collab.notifications,
      audit: collab.audit,
    },
    executive,
  };
}

export async function getAiCompanyEmployeeProfile(
  employeeId: string,
  repoRoot = process.cwd()
): Promise<AiCompanyEmployeeProfile | null> {
  const def = getEmployeeDefinition(employeeId);
  if (!def) return null;
  const hq = await getBuilderHqSnapshot({ repoRoot });
  const missions = listCollaborations(repoRoot);
  const liveStatuses = deriveLiveEmployeeStatuses(
    missions,
    AI_COMPANY_EMPLOYEES.map((e) => e.id)
  );
  const card = toCard(def, hq, liveStatuses, missions);

  const mine = missions.filter((m) => m.chain.some((s) => s.employeeId === def.id));
  const waitingApprovals = listApprovalCenter(repoRoot)
    .filter((a) => a.requestingEmployee.id === def.id || a.collaborationChain.some((c) => c.employeeId === def.id))
    .map((a) => ({
      id: a.id,
      title: a.title,
      actionLabel: "Review & approve",
    }));

  const taskQueue: CompanyWorkItem[] = mine
    .filter((m) => m.approvalStatus === "pending" || m.approvalStatus === "approved")
    .map((m) => ({
      id: m.id,
      title: m.title,
      state:
        m.approvalStatus === "pending" ? ("awaiting_approval" as const) : ("in_progress" as const),
      ownerEmployeeId: def.id,
    }));

  const completedWork: CompanyWorkItem[] = [
    ...mine
      .filter((m) => m.approvalStatus === "approved")
      .map((m) => ({
        id: m.id,
        title: m.title,
        state: "done" as const,
        ownerEmployeeId: def.id,
      })),
    ...hq.recentDecisions
      .filter((d) => matchEmployeeIdForText(d.summary) === def.id)
      .map((d) => ({
        id: d.id,
        title: d.summary,
        state: "done" as const,
        ownerEmployeeId: def.id,
      })),
  ];

  const activityTimeline = [
    ...mine.slice(0, 6).map((m) => ({
      id: `mission-${m.id}`,
      whenDisplay: formatHqDateTimeDisplay(m.updatedAt),
      summary: m.chain.find((s) => s.employeeId === def.id)?.message ?? m.title,
      kind: "mission" as const,
    })),
    ...hq.activityFeed
      .filter((e) => {
        const blob = `${e.action} ${e.rationale} ${e.taskId}`;
        return matchEmployeeIdForText(blob) === def.id || e.actorId.toLowerCase().includes(def.id);
      })
      .slice(0, 6)
      .map((e) => ({
        id: e.id,
        whenDisplay: formatHqDateTimeDisplay(e.timestamp),
        summary: e.rationale || e.action,
        kind: "activity" as const,
      })),
  ].slice(0, 12);

  const approvalHistory = listAllApprovalHistory(repoRoot)
    .filter((a) => a.collaborationChain.some((c) => c.employeeId === def.id))
    .slice(0, 8);

  return {
    ...card,
    responsibilities: def.responsibilities,
    actions: def.actions,
    taskQueue,
    completedWork,
    waitingApprovals,
    companyMemory: hq.recentDecisions.slice(0, 4).map((d) => d.summary),
    activityTimeline,
    collaborationHistory: mine.slice(0, 8),
    approvalHistory,
    recentMissions: mine.slice(0, 8).map((m) => ({
      id: m.id,
      title: m.title,
      status: m.approvalStatus,
    })),
    inbox: listInboxForEmployee(def.id, missions).slice(0, 20),
    missionHistory: listMissionHistory(mine, 10),
    executionHistory: listExecutionHistory({
      repoRoot,
      employeeId: def.id,
      limit: 20,
    }),
  };
}
