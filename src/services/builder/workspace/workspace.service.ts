/**
 * Workspace access + HQ collaboration façade.
 */

import type { AuthContext } from "@/lib/auth";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { roleHasPermission, permissionsForRole } from "./permissions";
import {
  addOrUpdateMember,
  createWorkspace,
  ensureDefaultWorkspace,
  getMember,
  getWorkspace,
  listMembers,
  listWorkspaces,
} from "./workspace.store";
import {
  addMissionComment,
  appendAudit,
  listActivity,
  listAudit,
  listMissionComments,
  listNotifications,
  markNotificationRead,
  recordWorkspaceEvent,
} from "./collaboration-feed";
import {
  DEFAULT_WORKSPACE_ID,
  type WorkspaceHumanRole,
  type WorkspacePermission,
} from "./types";
import { opsRel } from "./paths";

export type HqWorkspaceContext = {
  workspaceId: string;
  role: WorkspaceHumanRole;
  permissions: WorkspacePermission[];
  userId: string;
  email: string;
  displayName: string;
  memberId: string;
};

export function resolveWorkspaceIdFromRequest(request: Request): string {
  const header = request.headers.get("x-ai-company-workspace")?.trim();
  if (header) return header;
  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("workspaceId")?.trim();
    if (q) return q;
  } catch {
    /* ignore */
  }
  return DEFAULT_WORKSPACE_ID;
}

export function ensureHqAccess(input: {
  auth: AuthContext;
  workspaceId?: string;
  permission?: WorkspacePermission;
  repoRoot?: string;
}):
  | { ok: true; ctx: HqWorkspaceContext }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = input.repoRoot ?? process.cwd();
  const userId = input.auth.user.id;
  const email = input.auth.user.email;
  const displayName = input.auth.user.name?.trim() || email;

  ensureDefaultWorkspace({
    userId,
    email,
    displayName,
    repoRoot: root,
  });

  const workspaceId = input.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
  const workspace = getWorkspace(workspaceId, root);
  if (!workspace) {
    return {
      ok: false,
      code: "WORKSPACE_NOT_FOUND",
      message: "Workspace not found",
      status: 404,
    };
  }

  const member = getMember(workspaceId, userId, root);
  if (!member) {
    appendAudit(
      {
        workspaceId,
        actorUserId: userId,
        actorName: displayName,
        actorRole: "viewer",
        action: "access.denied",
        targetType: "workspace",
        targetId: workspaceId,
        result: "denied",
        detail: "User is not a member of this workspace",
      },
      root
    );
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You are not a member of this AI Company workspace",
      status: 403,
    };
  }

  if (input.permission && !roleHasPermission(member.role, input.permission)) {
    appendAudit(
      {
        workspaceId,
        actorUserId: userId,
        actorName: displayName,
        actorRole: member.role,
        action: input.permission,
        targetType: "permission",
        targetId: input.permission,
        result: "denied",
        detail: `Role ${member.role} lacks ${input.permission}`,
      },
      root
    );
    return {
      ok: false,
      code: "FORBIDDEN",
      message: "You do not have permission for this action",
      status: 403,
    };
  }

  return {
    ok: true,
    ctx: {
      workspaceId,
      role: member.role,
      permissions: permissionsForRole(member.role),
      userId,
      email,
      displayName,
      memberId: member.id,
    },
  };
}

export function getWorkspaceCollaborationSnapshot(input: {
  workspaceId: string;
  userId: string;
  repoRoot?: string;
}) {
  const root = input.repoRoot ?? process.cwd();
  return {
    workspace: getWorkspace(input.workspaceId, root),
    members: listMembers(input.workspaceId, root),
    activity: listActivity(input.workspaceId, root, 40),
    notifications: listNotifications(input.workspaceId, {
      userId: input.userId,
      repoRoot: root,
      limit: 30,
    }),
    audit: listAudit(input.workspaceId, root, 40),
    workspaces: listWorkspaces(root),
  };
}

export {
  createWorkspace,
  addOrUpdateMember,
  listWorkspaces,
  listMembers,
  addMissionComment,
  listMissionComments,
  markNotificationRead,
  recordWorkspaceEvent,
  listActivity,
  listNotifications,
  listAudit,
  opsRel,
  DEFAULT_WORKSPACE_ID,
};
