/**
 * Client-safe Company Activity Timeline types + labels.
 * Serializable only — never import stores, storage, or Node built-ins from here.
 */

export type CompanyTimelineEventKind =
  | "directive_submitted"
  | "work_assigned"
  | "work_started"
  | "review_started"
  | "review_completed"
  | "approval_requested"
  | "approval_granted"
  | "work_completed"
  | "blocked"
  | "resumed"
  | "meeting_started"
  | "meeting_completed";

export type CompanyTimelineEvent = {
  id: string;
  kind: CompanyTimelineEventKind;
  summary: string;
  at: string;
  /** Preformatted display timestamp (SSR-safe). */
  atDisplay: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: "owner" | "ai_employee" | "system";
  directiveId: string | null;
  planId: string | null;
  workItemId: string | null;
  employeeId: string | null;
  relatedType: string | null;
  relatedId: string | null;
};

export type CompanyTimelineStoreShape = {
  events: CompanyTimelineEvent[];
};

export type CompanyTimelineView = {
  asOf: string;
  events: CompanyTimelineEvent[];
  count: number;
};

export const COMPANY_TIMELINE_LABELS: Record<CompanyTimelineEventKind, string> = {
  directive_submitted: "Directive submitted",
  work_assigned: "Work assigned",
  work_started: "Work started",
  review_started: "Review started",
  review_completed: "Review completed",
  approval_requested: "Approval requested",
  approval_granted: "Approval granted",
  work_completed: "Work completed",
  blocked: "Blocked",
  resumed: "Resumed",
  meeting_started: "Meeting started",
  meeting_completed: "Meeting completed",
};
