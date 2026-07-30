/**
 * Activity timeline, notifications, audit, and mission comments.
 * Storage-backed (no project fs writes).
 */

import {
  newId,
  nowIso,
  readJsonFile,
  writeJsonFile,
  workspaceFile,
} from "./json-file";
import { DEFAULT_WORKSPACE_ID } from "./types";
import type {
  ActivityItem,
  MissionComment,
  WorkspaceAuditEntry,
  WorkspaceHumanRole,
  WorkspaceNotification,
  ActivityKind,
  NotificationKind,
} from "./types";

type ActivityStore = { items: ActivityItem[] };
type NotificationStore = { items: WorkspaceNotification[] };
type AuditStore = { entries: WorkspaceAuditEntry[] };
type CommentStore = { comments: MissionComment[] };

function activityPath(root: string, workspaceId: string) {
  return workspaceFile(root, "ai-company-activity.json", workspaceId);
}
function notificationsPath(root: string, workspaceId: string) {
  return workspaceFile(root, "ai-company-notifications.json", workspaceId);
}
function auditPath(root: string, workspaceId: string) {
  return workspaceFile(root, "ai-company-audit.json", workspaceId);
}
function commentsPath(root: string, workspaceId: string) {
  return workspaceFile(root, "ai-company-comments.json", workspaceId);
}

export function appendActivity(
  input: Omit<ActivityItem, "id" | "createdAt"> & { createdAt?: string },
  repoRoot = process.cwd()
): ActivityItem {
  const root = repoRoot;
  const item: ActivityItem = {
    ...input,
    id: newId("act"),
    createdAt: input.createdAt ?? nowIso(),
  };
  const store = readJsonFile<ActivityStore>(root, activityPath(root, input.workspaceId), {
    items: [],
  });
  store.items.unshift(item);
  store.items = store.items.slice(0, 500);
  writeJsonFile(root, activityPath(root, input.workspaceId), store);
  return item;
}

export function listActivity(
  workspaceId = DEFAULT_WORKSPACE_ID,
  repoRoot = process.cwd(),
  limit = 80
): ActivityItem[] {
  return readJsonFile<ActivityStore>(repoRoot, activityPath(repoRoot, workspaceId), {
    items: [],
  }).items.slice(0, limit);
}

export function createNotification(
  input: Omit<WorkspaceNotification, "id" | "createdAt" | "read"> & {
    read?: boolean;
    createdAt?: string;
  },
  repoRoot = process.cwd()
): WorkspaceNotification {
  const note: WorkspaceNotification = {
    ...input,
    id: newId("ntf"),
    read: input.read ?? false,
    createdAt: input.createdAt ?? nowIso(),
  };
  const store = readJsonFile<NotificationStore>(
    repoRoot,
    notificationsPath(repoRoot, input.workspaceId),
    { items: [] }
  );
  store.items.unshift(note);
  store.items = store.items.slice(0, 300);
  writeJsonFile(repoRoot, notificationsPath(repoRoot, input.workspaceId), store);
  return note;
}

export function listNotifications(
  workspaceId: string,
  options?: { userId?: string | null; repoRoot?: string; limit?: number }
): WorkspaceNotification[] {
  const root = options?.repoRoot ?? process.cwd();
  let items = readJsonFile<NotificationStore>(root, notificationsPath(root, workspaceId), {
    items: [],
  }).items;
  if (options?.userId) {
    items = items.filter((n) => n.userId == null || n.userId === options.userId);
  }
  return items.slice(0, options?.limit ?? 60);
}

export function markNotificationRead(
  workspaceId: string,
  notificationId: string,
  repoRoot = process.cwd()
): WorkspaceNotification | null {
  const store = readJsonFile<NotificationStore>(
    repoRoot,
    notificationsPath(repoRoot, workspaceId),
    { items: [] }
  );
  const idx = store.items.findIndex((n) => n.id === notificationId);
  if (idx < 0) return null;
  store.items[idx] = { ...store.items[idx], read: true };
  writeJsonFile(repoRoot, notificationsPath(repoRoot, workspaceId), store);
  return store.items[idx];
}

export function appendAudit(
  input: Omit<WorkspaceAuditEntry, "id" | "createdAt"> & { createdAt?: string },
  repoRoot = process.cwd()
): WorkspaceAuditEntry {
  const entry: WorkspaceAuditEntry = {
    ...input,
    id: newId("aud"),
    createdAt: input.createdAt ?? nowIso(),
  };
  const store = readJsonFile<AuditStore>(repoRoot, auditPath(repoRoot, input.workspaceId), {
    entries: [],
  });
  store.entries.unshift(entry);
  store.entries = store.entries.slice(0, 800);
  writeJsonFile(repoRoot, auditPath(repoRoot, input.workspaceId), store);
  return entry;
}

export function listAudit(
  workspaceId = DEFAULT_WORKSPACE_ID,
  repoRoot = process.cwd(),
  limit = 100
): WorkspaceAuditEntry[] {
  return readJsonFile<AuditStore>(repoRoot, auditPath(repoRoot, workspaceId), {
    entries: [],
  }).entries.slice(0, limit);
}

export function addMissionComment(
  input: Omit<MissionComment, "id" | "createdAt"> & { createdAt?: string },
  repoRoot = process.cwd()
): MissionComment {
  const comment: MissionComment = {
    ...input,
    id: newId("cmt"),
    createdAt: input.createdAt ?? nowIso(),
  };
  const store = readJsonFile<CommentStore>(repoRoot, commentsPath(repoRoot, input.workspaceId), {
    comments: [],
  });
  store.comments.unshift(comment);
  store.comments = store.comments.slice(0, 400);
  writeJsonFile(repoRoot, commentsPath(repoRoot, input.workspaceId), store);
  return comment;
}

export function listMissionComments(
  workspaceId: string,
  missionId: string,
  repoRoot = process.cwd()
): MissionComment[] {
  return readJsonFile<CommentStore>(repoRoot, commentsPath(repoRoot, workspaceId), {
    comments: [],
  }).comments.filter((c) => c.missionId === missionId);
}

export function recordWorkspaceEvent(input: {
  workspaceId: string;
  kind: ActivityKind;
  summary: string;
  actorUserId: string | null;
  actorName: string;
  actorRole: WorkspaceHumanRole | "ai_employee" | "system";
  relatedType: string;
  relatedId: string;
  status: string;
  auditAction?: string;
  auditResult?: "ok" | "denied" | "failed";
  notify?: {
    kind: NotificationKind;
    title: string;
    body: string;
    userId?: string | null;
  };
  repoRoot?: string;
}) {
  const root = input.repoRoot ?? process.cwd();
  appendActivity(
    {
      workspaceId: input.workspaceId,
      kind: input.kind,
      summary: input.summary,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      status: input.status,
    },
    root
  );
  appendAudit(
    {
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorRole: input.actorRole,
      action: input.auditAction ?? input.kind,
      targetType: input.relatedType,
      targetId: input.relatedId,
      result: input.auditResult ?? "ok",
      detail: input.summary,
    },
    root
  );
  if (input.notify) {
    createNotification(
      {
        workspaceId: input.workspaceId,
        userId: input.notify.userId ?? null,
        kind: input.notify.kind,
        title: input.notify.title,
        body: input.notify.body,
        relatedType: input.relatedType,
        relatedId: input.relatedId,
      },
      root
    );
  }
}
