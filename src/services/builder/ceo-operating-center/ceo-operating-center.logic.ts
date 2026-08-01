/**
 * CEO Operating Center — pure aggregation from recorded HQ state.
 * Employees "notify" the CEO via inbox items derived from timeline, live work,
 * approvals, and daily ops — never invented meetings/progress/blockers.
 */

import type { CompanyTimelineEvent } from "../company-timeline/company-timeline.client";
import type { CeoApprovalQueueItem } from "../ceo-approval-queue/types";
import type { ExecutiveBrief, PriorityAlert, CompanyHealth } from "../proactive.logic";
import type { CompanyDashboardMetrics } from "../conversation.logic";
import type { AiCompanyEmployeeCard } from "../company.service";
import type { ExecutiveDashboard } from "../ceo/types";
import type {
  CompanyBrainAnalyticsInput,
  CompanyBrainGithubInput,
  CompanyBrainView,
} from "../company-brain/types";
import { buildCompanyBrainView } from "../company-brain/company-brain.logic";
import type { WorkExecutionEngineView } from "../work-execution-engine/types";
import { buildWorkExecutionEngineView } from "../work-execution-engine/work-execution-engine.logic";
import type { CompanyLearningView } from "../company-learning/types";
import { buildCompanyLearningView } from "../company-learning/company-learning.logic";
import type {
  CeoCriticalAlert,
  CeoDailySummary,
  CeoDecisionItem,
  CeoInboxItem,
  CeoInboxKind,
  CeoMorningBriefing,
  CeoOperatingCenterKpi,
  CeoOperatingCenterTone,
  CeoOperatingCenterView,
  CeoRecommendedAction,
} from "./types";

function toneForInbox(kind: CeoInboxKind): CeoOperatingCenterTone {
  switch (kind) {
    case "blocker":
    case "risk_increased":
      return "critical";
    case "approval_required":
    case "waiting_ceo":
    case "priority_changed":
      return "warning";
    case "work_completed":
    case "review_finished":
      return "positive";
    case "directive":
      return "info";
    default:
      return "neutral";
  }
}

function hrefForInbox(kind: CeoInboxKind, employeeId: string | null): string {
  switch (kind) {
    case "approval_required":
    case "waiting_ceo":
      return "#ops-approvals";
    case "blocker":
    case "risk_increased":
      return "#ops-operating-center";
    case "work_completed":
    case "review_finished":
      return "#ops-activity";
    case "priority_changed":
      return "#ops-command";
    case "directive":
      return "#ops-executive";
    default:
      return employeeId
        ? `/builder/hq/employees/${employeeId}`
        : "#ops-operating-center";
  }
}

/** Map persisted timeline events → CEO inbox notifications. */
export function inboxFromTimeline(
  events: CompanyTimelineEvent[],
  limit = 12
): CeoInboxItem[] {
  const items: CeoInboxItem[] = [];
  for (const e of events.slice(0, 40)) {
    let kind: CeoInboxKind | null = null;
    if (e.kind === "work_completed") kind = "work_completed";
    else if (e.kind === "blocked") kind = "blocker";
    else if (e.kind === "review_completed") kind = "review_finished";
    else if (e.kind === "approval_requested") kind = "approval_required";
    else if (e.kind === "directive_submitted" || e.kind === "mission") kind = "directive";
    else if (e.kind === "resumed" || e.kind === "work_started" || e.kind === "execution")
      kind = "priority_changed";
    else if (e.kind === "approval_granted" || e.kind === "deployment_ready")
      kind = "priority_changed";
    if (!kind) continue;
    items.push({
      id: `inbox-tl-${e.id}`,
      kind,
      tone: toneForInbox(kind),
      title: e.summary,
      detail: e.summary,
      employeeId: e.employeeId,
      employeeName: e.actorRole === "ai_employee" ? e.actorName : null,
      at: e.at,
      atDisplay: e.atDisplay,
      href: hrefForInbox(kind, e.employeeId),
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** Live Work Waiting/Blocked → proactive CEO notifications. */
export function inboxFromLiveEmployees(
  employees: AiCompanyEmployeeCard[],
  nowDisplay: string,
  nowIso: string
): CeoInboxItem[] {
  const items: CeoInboxItem[] = [];
  for (const emp of employees) {
    const lw = emp.liveWork;
    if (lw.status === "Blocked" || (lw.waitingFor && /block/i.test(lw.waitingFor))) {
      items.push({
        id: `inbox-block-${emp.id}`,
        kind: "blocker",
        tone: "critical",
        title: `${emp.name} blocked`,
        detail: lw.waitingFor || lw.currentStep || "Work blocked",
        employeeId: emp.id,
        employeeName: emp.name,
        at: lw.lastUpdate || nowIso,
        atDisplay: nowDisplay,
        href: "#ops-operating-center",
      });
    } else if (
      lw.status === "Waiting" ||
      emp.status === "waiting_approval" ||
      emp.pendingApprovals > 0
    ) {
      items.push({
        id: `inbox-wait-${emp.id}`,
        kind: "waiting_ceo",
        tone: "warning",
        title: `${emp.name} waiting`,
        detail: lw.waitingFor || "Waiting for CEO decision",
        employeeId: emp.id,
        employeeName: emp.name,
        at: lw.lastUpdate || nowIso,
        atDisplay: nowDisplay,
        href: "#ops-approvals",
      });
    } else if (lw.status === "Completed") {
      items.push({
        id: `inbox-done-${emp.id}-${lw.lastUpdate}`,
        kind: "work_completed",
        tone: "positive",
        title: `${emp.name} completed work`,
        detail: lw.currentTask || lw.currentStep || "Work completed",
        employeeId: emp.id,
        employeeName: emp.name,
        at: lw.lastUpdate || nowIso,
        atDisplay: nowDisplay,
        href: "#ops-activity",
      });
    } else if (lw.status === "Reviewing") {
      items.push({
        id: `inbox-rev-${emp.id}`,
        kind: "review_finished",
        tone: "info",
        title: `${emp.name} in review`,
        detail: lw.currentTask || lw.currentStep || "Review in progress",
        employeeId: emp.id,
        employeeName: emp.name,
        at: lw.lastUpdate || nowIso,
        atDisplay: nowDisplay,
        href: "#ops-activity",
      });
    }
  }
  return items;
}

export function inboxFromApprovals(
  items: CeoApprovalQueueItem[],
  nowDisplay: string
): CeoInboxItem[] {
  return items.slice(0, 10).map((a) => ({
    id: `inbox-apr-${a.id}`,
    kind: "approval_required" as const,
    tone: a.isProtected ? ("critical" as const) : ("warning" as const),
    title: a.isProtected
      ? `Protected approval: ${a.title}`
      : `Approval needed: ${a.title}`,
    detail: a.reason || a.requestedAction,
    employeeId: a.employee.id,
    employeeName: a.employee.name,
    at: a.createdAt,
    atDisplay: a.createdAtDisplay || nowDisplay,
    href: "#ops-approvals",
  }));
}

export function mergeCeoInbox(parts: CeoInboxItem[], limit = 20): CeoInboxItem[] {
  const seen = new Set<string>();
  const merged: CeoInboxItem[] = [];
  const rank: Record<CeoOperatingCenterTone, number> = {
    critical: 0,
    warning: 1,
    info: 2,
    positive: 3,
    neutral: 4,
  };
  const sorted = [...parts].sort((a, b) => {
    const tr = rank[a.tone] - rank[b.tone];
    if (tr !== 0) return tr;
    return b.at.localeCompare(a.at);
  });
  for (const item of sorted) {
    const key = `${item.kind}:${item.employeeId ?? ""}:${item.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

export function buildDecisionCenter(
  queue: CeoApprovalQueueItem[]
): CeoOperatingCenterView["decisionCenter"] {
  const items: CeoDecisionItem[] = queue.slice(0, 12).map((a) => ({
    id: a.id,
    title: a.title,
    employeeName: a.employee.name,
    reason: a.reason || a.requestedAction,
    isProtected: a.isProtected,
    href: "#ops-approvals",
  }));
  return {
    count: queue.length,
    protectedCount: queue.filter((q) => q.isProtected).length,
    items,
  };
}

export function buildCriticalAlerts(input: {
  priorityAlerts: PriorityAlert[];
  risks: string[];
  blockedTitles: string[];
  protectedCount: number;
}): CeoCriticalAlert[] {
  const alerts: CeoCriticalAlert[] = [];
  if (input.protectedCount > 0) {
    alerts.push({
      id: "alert-protected",
      tone: "critical",
      title: `${input.protectedCount} protected action(s) need CEO`,
      detail: "Side-effecting work is paused until you approve.",
      href: "#ops-approvals",
    });
  }
  for (const b of input.blockedTitles.slice(0, 4)) {
    alerts.push({
      id: `alert-block-${b}`,
      tone: "critical",
      title: `Blocker: ${b}`,
      detail: b,
      href: "#ops-operating-center",
    });
  }
  for (const a of input.priorityAlerts.filter((p) => p.tone === "critical").slice(0, 4)) {
    alerts.push({
      id: a.id,
      tone: "critical",
      title: a.title,
      detail: a.detail,
      href: "#ops-command",
    });
  }
  for (const r of input.risks.slice(0, 3)) {
    alerts.push({
      id: `alert-risk-${r.slice(0, 24)}`,
      tone: "warning",
      title: "Risk",
      detail: r,
      href: "#ops-operating-center",
    });
  }
  return alerts.slice(0, 10);
}

export function buildRecommendedNextAction(input: {
  decisionCount: number;
  protectedCount: number;
  alertCount: number;
  briefAction: string | null | undefined;
  waitingCount: number;
}): CeoRecommendedAction | null {
  if (input.protectedCount > 0) {
    return {
      title: "Review protected approvals",
      reason: `${input.protectedCount} protected action(s) are blocking execution.`,
      href: "#ops-approvals",
    };
  }
  if (input.decisionCount > 0) {
    return {
      title: "Clear Decision Center",
      reason: `${input.decisionCount} decision(s) waiting on you.`,
      href: "#ops-approvals",
    };
  }
  if (input.alertCount > 0) {
    return {
      title: "Triage critical alerts",
      reason: `${input.alertCount} alert(s) need attention.`,
      href: "#ops-operating-center",
    };
  }
  if (input.waitingCount > 0) {
    return {
      title: "Unblock waiting employees",
      reason: `${input.waitingCount} employee(s) are waiting on CEO.`,
      href: "#ops-approvals",
    };
  }
  if (input.briefAction?.trim()) {
    return {
      title: input.briefAction.trim(),
      reason: "From recorded Daily Directive / OS briefing.",
      href: "#ops-executive",
    };
  }
  return {
    title: "Review morning briefing",
    reason: "No urgent decisions — stay aligned with today’s directive.",
    href: "#ops-operating-center",
  };
}

export function buildMorningBriefing(input: {
  executiveBrief: ExecutiveBrief;
  dailySummary: CeoDailySummary;
  decisionCount: number;
}): CeoMorningBriefing {
  const bullets = [
    ...(input.executiveBrief.whatChanged ?? []).slice(0, 3),
    ...(input.executiveBrief.currentBlockers ?? []).slice(0, 2).map((b) => `Blocker: ${b}`),
    input.decisionCount > 0
      ? `${input.decisionCount} decision(s) in Decision Center`
      : null,
    input.dailySummary.directiveTitle
      ? `Directive: ${input.dailySummary.directiveTitle}`
      : "No Daily Directive recorded for today",
    input.dailySummary.completed > 0
      ? `${input.dailySummary.completed} work item(s) completed`
      : null,
  ].filter(Boolean) as string[];

  return {
    headline: input.executiveBrief.headline || "Morning Briefing",
    summary: input.executiveBrief.summary,
    bullets: bullets.slice(0, 8),
  };
}

export function buildLiveKpis(input: {
  metrics: CompanyDashboardMetrics;
  health: CompanyHealth;
  executive: ExecutiveDashboard;
  decisionCount: number;
  inboxCount: number;
}): CeoOperatingCenterKpi[] {
  const blocked = input.executive.blockedWork.length;
  const overdue = input.executive.health.kpis.overdueWork;
  return [
    {
      id: "health",
      label: "Company health",
      value: `${input.health.score}`,
      tone:
        input.health.score >= 75
          ? "positive"
          : input.health.score >= 50
            ? "info"
            : "critical",
    },
    {
      id: "working",
      label: "Employees working",
      value: String(input.metrics.employeesWorking),
      tone: "info",
    },
    {
      id: "waiting",
      label: "Waiting approval",
      value: String(input.metrics.waitingForApproval),
      tone: input.metrics.waitingForApproval > 0 ? "warning" : "positive",
    },
    {
      id: "decisions",
      label: "Decisions open",
      value: String(input.decisionCount),
      tone: input.decisionCount > 0 ? "warning" : "positive",
    },
    {
      id: "completed",
      label: "Completed today",
      value: String(input.metrics.completedToday),
      tone: "positive",
    },
    {
      id: "exec",
      label: "Execution success",
      value: `${Math.round(input.executive.executionSuccessRate)}%`,
      tone:
        input.executive.executionSuccessRate >= 80
          ? "positive"
          : input.executive.executionSuccessRate >= 50
            ? "warning"
            : "critical",
    },
    {
      id: "inbox",
      label: "CEO inbox",
      value: String(input.inboxCount),
      tone: input.inboxCount > 0 ? "info" : "neutral",
    },
    {
      id: "blocked",
      label: "Blocked work",
      value: String(blocked || overdue),
      tone: blocked > 0 || overdue > 0 ? "critical" : "positive",
    },
  ];
}

export function buildDailySummaryFromExecutive(
  executive: ExecutiveDashboard
): CeoDailySummary {
  const d = executive.dailyOps;
  return {
    directiveTitle: d?.directive?.title ?? null,
    completed: d?.workSummary?.completed ?? 0,
    inProgress: d?.workSummary?.executing ?? 0,
    blocked: d?.blockers?.length ?? executive.blockedWork.length,
    waitingApprovals: executive.approvalQueue.length,
    latestUpdate: d?.latestUpdate ?? null,
  };
}

export function buildCeoOperatingCenterView(input: {
  generatedAt: string;
  generatedAtDisplay: string;
  executiveBrief: ExecutiveBrief;
  priorityAlerts: PriorityAlert[];
  companyHealth: CompanyHealth;
  metrics: CompanyDashboardMetrics;
  employees: AiCompanyEmployeeCard[];
  ceoApprovalQueue: {
    items: CeoApprovalQueueItem[];
    count: number;
    protectedCount: number;
  };
  companyTimelineEvents: CompanyTimelineEvent[];
  executive: ExecutiveDashboard;
  risks: string[];
  opportunities?: string[];
  /** Optional observed slices for AI Company Brain. */
  brainExtras?: {
    analytics: CompanyBrainAnalyticsInput | null;
    github: CompanyBrainGithubInput | null;
    continuousOs: {
      running: boolean;
      lastTickAt: string | null;
      activeTaskCount: number;
      recentDecisionCount: number;
    } | null;
    employeeRecommendations: Array<{
      title: string;
      status: string;
      summary: string;
    }>;
    memory: {
      insightCount: number;
      preferenceCount: number;
      lastLearnedAt: string | null;
    };
  };
  /** Pre-built Work Execution Engine view (from recorded stores). */
  workExecution?: WorkExecutionEngineView;
  /** Pre-built Company Learning view (from recorded knowledge). */
  learning?: CompanyLearningView;
}): CeoOperatingCenterView {
  const decisionCenter = buildDecisionCenter(input.ceoApprovalQueue.items);
  const dailySummary = buildDailySummaryFromExecutive(input.executive);

  const inbox = mergeCeoInbox([
    ...inboxFromApprovals(input.ceoApprovalQueue.items, input.generatedAtDisplay),
    ...inboxFromLiveEmployees(
      input.employees,
      input.generatedAtDisplay,
      input.generatedAt
    ),
    ...inboxFromTimeline(input.companyTimelineEvents),
    ...input.risks.slice(0, 5).map((r, i) => ({
      id: `inbox-risk-${i}`,
      kind: "risk_increased" as const,
      tone: "critical" as const,
      title: "Risk increased",
      detail: r,
      employeeId: null,
      employeeName: null,
      at: input.generatedAt,
      atDisplay: input.generatedAtDisplay,
      href: "#ops-operating-center",
    })),
    ...input.priorityAlerts
      .filter((p) => p.tone === "critical" || p.tone === "warning")
      .slice(0, 4)
      .map((p) => ({
        id: `inbox-alert-${p.id}`,
        kind:
          p.tone === "critical"
            ? ("risk_increased" as const)
            : ("priority_changed" as const),
        tone:
          p.tone === "critical" ? ("critical" as const) : ("warning" as const),
        title: p.title,
        detail: p.detail,
        employeeId: p.employeeId,
        employeeName: null,
        at: input.generatedAt,
        atDisplay: input.generatedAtDisplay,
        href: "#ops-command",
      })),
  ]);

  const blockedTitles = [
    ...(input.executive.dailyOps?.blockers ?? []).map(
      (b) => ("title" in b ? `${b.title}: ${b.reason}` : String(b))
    ),
    ...input.executive.blockedWork.map((w) => w.title),
  ];

  const criticalAlerts = buildCriticalAlerts({
    priorityAlerts: input.priorityAlerts,
    risks: input.risks,
    blockedTitles,
    protectedCount: input.ceoApprovalQueue.protectedCount,
  });

  const waitingCount = inbox.filter(
    (i) => i.kind === "waiting_ceo" || i.kind === "approval_required"
  ).length;

  const recommendedNextAction = buildRecommendedNextAction({
    decisionCount: decisionCenter.count,
    protectedCount: decisionCenter.protectedCount,
    alertCount: criticalAlerts.length,
    briefAction: input.executiveBrief.recommendedNextAction,
    waitingCount,
  });

  const brain = buildBrainForOperatingCenter(input, inbox);

  const workExecution =
    input.workExecution ??
    buildWorkExecutionEngineView({
      generatedAt: input.generatedAt,
      generatedAtDisplay: input.generatedAtDisplay,
      directive: null,
      plan: null,
      brainPrioritized: true,
      executiveRecommendationPresent: !!brain.recommendation.executiveSummary,
      approvalPendingCount: decisionCenter.count,
      protectedPendingCount: decisionCenter.protectedCount,
      workpilot: [],
    });

  const learning =
    input.learning ??
    buildCompanyLearningView({
      generatedAt: input.generatedAt,
      lessons: [],
      knowledge: [],
      evolution: [],
    });

  return {
    generatedAt: input.generatedAt,
    generatedAtDisplay: input.generatedAtDisplay,
    morningBriefing: buildMorningBriefing({
      executiveBrief: input.executiveBrief,
      dailySummary,
      decisionCount: decisionCenter.count,
    }),
    inbox,
    decisionCenter,
    criticalAlerts,
    recommendedNextAction,
    companyHealth: {
      score: input.companyHealth.score,
      label: input.companyHealth.label,
      summary: input.companyHealth.summary,
      factors: input.companyHealth.factors ?? [],
    },
    liveKpis: buildLiveKpis({
      metrics: input.metrics,
      health: input.companyHealth,
      executive: input.executive,
      decisionCount: decisionCenter.count,
      inboxCount: inbox.length,
    }),
    dailySummary,
    brain,
    workExecution,
    learning,
  };
}

function buildBrainForOperatingCenter(
  input: Parameters<typeof buildCeoOperatingCenterView>[0],
  inbox: CeoInboxItem[]
): CompanyBrainView {
  const extras = input.brainExtras;
  const d = input.executive.dailyOps;
  const sprint = input.executive.sprintProgress?.active ?? null;

  const liveCounts = {
    working: 0,
    blocked: 0,
    waiting: 0,
    reviewing: 0,
    idle: 0,
    overloadedNames: [] as string[],
  };
  for (const emp of input.employees) {
    const s = emp.liveWork.status;
    if (s === "Blocked") liveCounts.blocked += 1;
    else if (s === "Waiting") liveCounts.waiting += 1;
    else if (s === "Reviewing") liveCounts.reviewing += 1;
    else if (s === "Working" || s === "Meeting" || s === "Planning")
      liveCounts.working += 1;
    else liveCounts.idle += 1;
    if (emp.activeWorkload >= 3) liveCounts.overloadedNames.push(emp.name);
  }

  return buildCompanyBrainView({
    generatedAt: input.generatedAt,
    generatedAtDisplay: input.generatedAtDisplay,
    directive: d?.directive
      ? {
          title: d.directive.title,
          status: d.directive.status,
          instruction: d.directive.instruction,
          paused: d.directive.paused,
        }
      : null,
    companyHealth: {
      score: input.companyHealth.score,
      label: input.companyHealth.label,
      summary: input.companyHealth.summary,
      factors: input.companyHealth.factors ?? [],
    },
    executiveHealthScore: input.executive.health?.score ?? null,
    executionSuccessRate: input.executive.executionSuccessRate ?? null,
    risks: input.risks,
    opportunities: input.opportunities ?? [],
    blockers: (d?.blockers ?? []).map((b) => ({
      title: b.title,
      reason: b.reason,
    })),
    approvalQueue: {
      count: input.ceoApprovalQueue.count,
      protectedCount: input.ceoApprovalQueue.protectedCount,
      topTitles: input.ceoApprovalQueue.items.slice(0, 5).map((i) => i.title),
    },
    ceoInbox: {
      waitingCount: inbox.filter(
        (i) => i.kind === "waiting_ceo" || i.kind === "approval_required"
      ).length,
      blockerCount: inbox.filter((i) => i.kind === "blocker").length,
      total: inbox.length,
    },
    sprint: sprint
      ? {
          name: sprint.name,
          goal: sprint.goal,
          status: sprint.status,
          progressPercent: sprint.progressPercent,
          blockedWorkItems: sprint.blockedWorkItems,
          completedWorkItems: sprint.completedWorkItems,
          totalWorkItems: sprint.totalWorkItems,
          velocity: sprint.velocity,
        }
      : null,
    meetings: (input.executive.meetingSummaries ?? []).map((m) => ({
      title: m.title,
      status: m.status,
      synthesis: m.synthesis,
    })),
    memory: extras?.memory ?? {
      insightCount: 0,
      preferenceCount: 0,
      lastLearnedAt: null,
    },
    liveWork: liveCounts,
    continuousOs: extras?.continuousOs ?? null,
    timelineRecent: input.companyTimelineEvents.slice(0, 8).map((e) => ({
      kind: e.kind,
      summary: e.summary,
    })),
    analytics: extras?.analytics ?? null,
    github: extras?.github ?? null,
    employeeRecommendations: extras?.employeeRecommendations ?? [],
    metrics: {
      employeesWorking: input.metrics.employeesWorking,
      waitingForApproval: input.metrics.waitingForApproval,
      completedToday: input.metrics.completedToday,
      companyProductivity: input.metrics.companyProductivity,
    },
    executiveBrief: {
      headline: input.executiveBrief.headline,
      summary: input.executiveBrief.summary,
      recommendedNextAction: input.executiveBrief.recommendedNextAction ?? null,
    },
    dailyOpsLatestUpdate: d?.latestUpdate ?? null,
  });
}
