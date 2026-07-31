/**
 * CEO Dashboard panel builders — active/blocked work, sprints, meetings, decisions.
 * Pure aggregations over existing HQ OS stores (no product/customer data).
 */

import { AI_COMPANY_EMPLOYEES, getEmployeeDefinition } from "../ai-company-employees";
import type { DevTask } from "../autonomous-company/types";
import type { CompanyMeeting } from "../meetings/types";
import type { CompanySprint, SprintMetrics } from "../sprints/types";
import type { ActivityItem, WorkspaceAuditEntry } from "../workspace/types";
import type {
  CeoDashboardDrillSection,
  CeoDashboardItemRef,
  CeoMeetingSummary,
  CeoRecentDecision,
  CeoSprintProgressPanel,
} from "./types";

export function employeeName(id: string): string {
  return getEmployeeDefinition(id)?.name ?? AI_COMPANY_EMPLOYEES.find((e) => e.id === id)?.name ?? id;
}

export function drillHref(section: CeoDashboardDrillSection, id: string): string {
  switch (section) {
    case "workload":
      return `/builder/hq/employees/${encodeURIComponent(id)}`;
    case "approval":
      return "#ops-approvals";
    case "sprint":
    case "meeting":
    case "active_work":
    case "blocked_work":
    case "risk":
    case "decision":
    case "kpi":
    case "health":
    default:
      return `#ops-executive?drill=${encodeURIComponent(section)}&id=${encodeURIComponent(id)}`;
  }
}

export function buildActiveWorkItems(tasks: DevTask[]): CeoDashboardItemRef[] {
  return tasks
    .filter(
      (t) =>
        t.status === "in_progress" ||
        t.status === "peer_review" ||
        t.status === "proposed" ||
        t.status === "awaiting_ceo"
    )
    .slice(0, 24)
    .map((t) => ({
      id: t.id,
      section: "active_work" as const,
      title: t.title,
      subtitle: `${employeeName(t.ownerEmployeeId)} · ${t.status.replace(/_/g, " ")}`,
      status: t.status,
      href: drillHref("active_work", t.id),
      meta: {
        ownerEmployeeId: t.ownerEmployeeId,
        sprintId: t.sprintId,
        workItemKind: t.workItem.kind,
      },
    }));
}

export function buildBlockedWorkItems(tasks: DevTask[]): CeoDashboardItemRef[] {
  return tasks
    .filter(
      (t) => t.status === "blocked" || t.status === "needs_clarification"
    )
    .slice(0, 24)
    .map((t) => ({
      id: t.id,
      section: "blocked_work" as const,
      title: t.title,
      subtitle:
        t.blocker?.trim() ||
        t.missingRequirements[0] ||
        `${employeeName(t.ownerEmployeeId)} · ${t.status.replace(/_/g, " ")}`,
      status: t.status,
      href: drillHref("blocked_work", t.id),
      meta: {
        ownerEmployeeId: t.ownerEmployeeId,
        sprintId: t.sprintId,
        blocker: t.blocker,
      },
    }));
}

export function buildSprintProgressPanel(input: {
  active: CompanySprint | null;
  metrics: SprintMetrics | null;
  plannedCount: number;
  completedCount: number;
}): CeoSprintProgressPanel {
  const active = input.active;
  const metrics = input.metrics;
  const items: CeoDashboardItemRef[] = [];
  if (active) {
    items.push({
      id: active.id,
      section: "sprint",
      title: active.name,
      subtitle: active.goal,
      status: active.status,
      href: drillHref("sprint", active.id),
      meta: {
        progressPercent: metrics?.progressPercent ?? 0,
        velocity: metrics?.velocity ?? 0,
        blocked: metrics?.blockedWorkItems ?? 0,
        completed: metrics?.completedWorkItems ?? 0,
        total: metrics?.totalWorkItems ?? active.workItemIds.length,
      },
    });
  }
  return {
    active: active
      ? {
          id: active.id,
          name: active.name,
          goal: active.goal,
          status: active.status,
          progressPercent: metrics?.progressPercent ?? 0,
          velocity: metrics?.velocity ?? 0,
          blockedWorkItems: metrics?.blockedWorkItems ?? 0,
          completedWorkItems: metrics?.completedWorkItems ?? 0,
          totalWorkItems: metrics?.totalWorkItems ?? active.workItemIds.length,
        }
      : null,
    plannedCount: input.plannedCount,
    completedCount: input.completedCount,
    items,
  };
}

export function buildMeetingSummaries(
  meetings: CompanyMeeting[]
): CeoMeetingSummary[] {
  return meetings.slice(0, 12).map((m) => ({
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: m.status,
    synthesis:
      m.synthesis?.trim() ||
      m.decisions[0]?.text ||
      m.purpose.slice(0, 160),
    workItemTitle: m.workItemTitle,
    participantCount: m.participantIds.length,
    href: drillHref("meeting", m.id),
  }));
}

export function buildRecentDecisions(input: {
  activity: ActivityItem[];
  audits: WorkspaceAuditEntry[];
}): CeoRecentDecision[] {
  const fromActivity = input.activity
    .filter(
      (a) =>
        /decision|approv|reject|close|start|pause|repriorit/i.test(a.summary) ||
        a.kind === "approval" ||
        a.status === "approved" ||
        a.status === "rejected" ||
        a.status === "completed"
    )
    .slice(0, 16)
    .map((a) => ({
      id: a.id,
      summary: a.summary,
      at: a.createdAt,
      relatedType: a.relatedType,
      relatedId: a.relatedId,
      actorName: a.actorName,
      href: drillHref("decision", a.id),
    }));

  if (fromActivity.length >= 6) return fromActivity.slice(0, 16);

  const seen = new Set(fromActivity.map((d) => d.summary));
  const fromAudit = input.audits
    .filter((a) =>
      /approv|reject|sprint\.|meeting\.|calendar\.|decision/i.test(a.action)
    )
    .slice(0, 12)
    .map((a) => ({
      id: a.id,
      summary: `${a.action}: ${a.detail}`,
      at: a.createdAt,
      relatedType: a.targetType || "audit",
      relatedId: a.targetId || a.id,
      actorName: a.actorName,
      href: drillHref("decision", a.id),
    }))
    .filter((d) => !seen.has(d.summary));

  return [...fromActivity, ...fromAudit].slice(0, 16);
}

export function buildWorkloadDrillItems(
  workloads: Array<{
    employeeId: string;
    employeeName: string;
    role: string;
    activeItems: number;
    status: string;
  }>
): CeoDashboardItemRef[] {
  return workloads.map((w) => ({
    id: w.employeeId,
    section: "workload" as const,
    title: w.employeeName,
    subtitle: `${w.role} · ${w.activeItems} active · ${w.status}`,
    status: w.status,
    href: drillHref("workload", w.employeeId),
    meta: { activeItems: w.activeItems },
  }));
}
