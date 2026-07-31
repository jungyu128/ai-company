/**
 * Company Activity Timeline — record + list typed lifecycle events.
 */

import path from "node:path";
import { formatHqDateTimeDisplay } from "../format-hq-display";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import {
  appendCompanyTimelineEvent,
  listCompanyTimelineEvents,
} from "./company-timeline.store";
import {
  COMPANY_TIMELINE_LABELS,
  type CompanyTimelineEvent,
  type CompanyTimelineEventKind,
  type CompanyTimelineView,
} from "./types";

function resolveRoot(repoRoot?: string) {
  return path.resolve(repoRoot ?? process.cwd());
}

function newEventId(): string {
  return `ctl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function workspaceKindFor(
  kind: CompanyTimelineEventKind
): "mission" | "approval" | "assignment" | "execution" | "workday" {
  switch (kind) {
    case "approval_requested":
    case "approval_granted":
      return "approval";
    case "directive_submitted":
      return "workday";
    case "work_completed":
      return "execution";
    case "work_assigned":
    case "work_started":
    case "review_started":
    case "review_completed":
    case "blocked":
    case "resumed":
    default:
      return "assignment";
  }
}

export function recordCompanyTimelineEvent(input: {
  kind: CompanyTimelineEventKind;
  summary?: string;
  at?: string;
  actorUserId?: string | null;
  actorName: string;
  actorRole?: "owner" | "ai_employee" | "system";
  directiveId?: string | null;
  planId?: string | null;
  workItemId?: string | null;
  employeeId?: string | null;
  relatedType?: string | null;
  relatedId?: string | null;
  repoRoot?: string;
  workspaceId?: string;
  /** Also mirror into workspace activity feed (default true). */
  mirrorWorkspace?: boolean;
}): CompanyTimelineEvent {
  const root = resolveRoot(input.repoRoot);
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const at = input.at ?? new Date().toISOString();
  const label = COMPANY_TIMELINE_LABELS[input.kind];
  const summary = input.summary?.trim() || label;

  const event: CompanyTimelineEvent = {
    id: newEventId(),
    kind: input.kind,
    summary,
    at,
    atDisplay: formatHqDateTimeDisplay(at),
    actorUserId: input.actorUserId ?? null,
    actorName: input.actorName,
    actorRole: input.actorRole ?? "system",
    directiveId: input.directiveId ?? null,
    planId: input.planId ?? null,
    workItemId: input.workItemId ?? null,
    employeeId: input.employeeId ?? null,
    relatedType: input.relatedType ?? "company_timeline",
    relatedId:
      input.relatedId ??
      input.workItemId ??
      input.planId ??
      input.directiveId ??
      null,
  };

  appendCompanyTimelineEvent(event, root, workspaceId);

  if (input.mirrorWorkspace !== false) {
    recordWorkspaceEvent({
      workspaceId,
      kind: workspaceKindFor(input.kind),
      summary: `[${label}] ${summary}`,
      actorUserId: event.actorUserId,
      actorName: event.actorName,
      actorRole: event.actorRole,
      relatedType: event.relatedType ?? "company_timeline",
      relatedId: event.relatedId ?? event.id,
      status: event.kind,
      auditAction: `company_timeline.${event.kind}`,
      auditResult: "ok",
      repoRoot: root,
    });
  }

  return event;
}

export function getCompanyTimeline(input?: {
  repoRoot?: string;
  workspaceId?: string;
  limit?: number;
  now?: string;
}): CompanyTimelineView {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const events = listCompanyTimelineEvents(
    root,
    workspaceId,
    input?.limit ?? 80
  );
  return {
    asOf: now,
    events,
    count: events.length,
  };
}

export function recordWorkStateTimelineTransition(input: {
  fromStatus: string | null;
  toStatus: string;
  employeeId: string;
  employeeName: string;
  workItemId?: string | null;
  taskTitle?: string | null;
  directiveId?: string | null;
  planId?: string | null;
  at?: string;
  repoRoot?: string;
  workspaceId?: string;
}): CompanyTimelineEvent | null {
  const title = input.taskTitle ? ` · ${input.taskTitle}` : "";
  const base = {
    actorName: input.employeeName,
    actorRole: "ai_employee" as const,
    employeeId: input.employeeId,
    workItemId: input.workItemId ?? null,
    directiveId: input.directiveId ?? null,
    planId: input.planId ?? null,
    at: input.at,
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
  };

  // Prefer resume over start when leaving blocked.
  if (
    (input.toStatus === "Working" ||
      input.toStatus === "WORKING" ||
      input.toStatus === "Planning" ||
      input.toStatus === "PLANNING") &&
    (input.fromStatus === "Blocked" || input.fromStatus === "BLOCKED")
  ) {
    return recordCompanyTimelineEvent({
      ...base,
      kind: "resumed",
      summary: `${input.employeeName} resumed work${title}`,
    });
  }

  if (input.toStatus === "Working" || input.toStatus === "PLANNING" || input.toStatus === "WORKING") {
    if (
      input.fromStatus === "APPROVED" ||
      input.fromStatus === "PLANNING" ||
      input.fromStatus === "Planning" ||
      input.fromStatus === "Idle" ||
      input.fromStatus === "Waiting" ||
      input.fromStatus === "WAITING" ||
      input.fromStatus === "QA"
    ) {
      if (input.toStatus === "Working" || input.toStatus === "WORKING") {
        return recordCompanyTimelineEvent({
          ...base,
          kind: "work_started",
          summary: `${input.employeeName} started work${title}`,
        });
      }
    }
  }

  if (input.toStatus === "Reviewing" || input.toStatus === "REVIEWING") {
    return recordCompanyTimelineEvent({
      ...base,
      kind: "review_started",
      summary: `${input.employeeName} started review${title}`,
    });
  }

  if (
    (input.toStatus === "QA" || input.toStatus === "Waiting" || input.toStatus === "WAITING") &&
    (input.fromStatus === "Reviewing" || input.fromStatus === "REVIEWING")
  ) {
    return recordCompanyTimelineEvent({
      ...base,
      kind: "review_completed",
      summary: `${input.employeeName} completed review${title}`,
    });
  }

  if (input.toStatus === "Completed" || input.toStatus === "COMPLETED") {
    return recordCompanyTimelineEvent({
      ...base,
      kind: "work_completed",
      summary: `${input.employeeName} completed work${title}`,
    });
  }

  if (input.toStatus === "Blocked" || input.toStatus === "BLOCKED") {
    return recordCompanyTimelineEvent({
      ...base,
      kind: "blocked",
      summary: `${input.employeeName} blocked${title}`,
    });
  }

  return null;
}
