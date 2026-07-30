/**
 * AI Company Workspace v8 — multi-user collaboration contracts.
 * Builder-local workspaces (not product organization workspaces).
 */

export const DEFAULT_WORKSPACE_ID = "default";

export type WorkspaceHumanRole =
  | "owner"
  | "admin"
  | "manager"
  | "member"
  | "viewer";

export type WorkspacePermission =
  | "approvals.decide"
  | "workday.start"
  | "workday.complete"
  | "mission.assign"
  | "memory.manage"
  | "execution.view"
  | "execution.decide"
  | "settings.manage"
  | "members.manage"
  | "comments.write"
  | "timeline.view"
  | "notifications.view";

export type AiCompanyWorkspace = {
  id: string;
  name: string;
  organizationKey: string;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  email: string;
  displayName: string;
  role: WorkspaceHumanRole;
  joinedAt: string;
  updatedAt: string;
};

export type ActivityKind =
  | "mission"
  | "approval"
  | "execution"
  | "workday"
  | "memory"
  | "comment"
  | "assignment"
  | "failure"
  | "member"
  | "notification";

export type ActivityItem = {
  id: string;
  workspaceId: string;
  kind: ActivityKind;
  summary: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: WorkspaceHumanRole | "ai_employee" | "system";
  relatedType: string;
  relatedId: string;
  status: string;
  createdAt: string;
};

export type NotificationKind =
  | "pending_approval"
  | "failed_execution"
  | "completed_workday"
  | "new_insight"
  | "overdue_mission"
  | "collaboration_request";

export type WorkspaceNotification = {
  id: string;
  workspaceId: string;
  userId: string | null;
  kind: NotificationKind;
  title: string;
  body: string;
  relatedType: string | null;
  relatedId: string | null;
  read: boolean;
  createdAt: string;
};

export type WorkspaceAuditEntry = {
  id: string;
  workspaceId: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: WorkspaceHumanRole | "ai_employee" | "system";
  action: string;
  targetType: string;
  targetId: string;
  result: "ok" | "denied" | "failed";
  detail: string;
  createdAt: string;
};

export type MissionComment = {
  id: string;
  workspaceId: string;
  missionId: string;
  authorUserId: string;
  authorName: string;
  body: string;
  createdAt: string;
};
