/**
 * Role → permission matrix for AI Company workspaces.
 */

import type { WorkspaceHumanRole, WorkspacePermission } from "./types";

const ALL: WorkspacePermission[] = [
  "approvals.decide",
  "workday.start",
  "workday.complete",
  "mission.assign",
  "memory.manage",
  "execution.view",
  "execution.decide",
  "settings.manage",
  "members.manage",
  "comments.write",
  "timeline.view",
  "notifications.view",
];

const ROLE_PERMISSIONS: Record<WorkspaceHumanRole, WorkspacePermission[]> = {
  owner: [...ALL],
  admin: [...ALL],
  manager: [
    "approvals.decide",
    "workday.start",
    "workday.complete",
    "mission.assign",
    "memory.manage",
    "execution.view",
    "execution.decide",
    "comments.write",
    "timeline.view",
    "notifications.view",
  ],
  member: [
    "mission.assign",
    "execution.view",
    "comments.write",
    "timeline.view",
    "notifications.view",
  ],
  viewer: ["execution.view", "timeline.view", "notifications.view"],
};

export function permissionsForRole(role: WorkspaceHumanRole): WorkspacePermission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHasPermission(
  role: WorkspaceHumanRole,
  permission: WorkspacePermission
): boolean {
  return permissionsForRole(role).includes(permission);
}

export function canDecideApprovals(role: WorkspaceHumanRole) {
  return roleHasPermission(role, "approvals.decide");
}

export function canManageMemory(role: WorkspaceHumanRole) {
  return roleHasPermission(role, "memory.manage");
}

export function canStartWorkday(role: WorkspaceHumanRole) {
  return roleHasPermission(role, "workday.start");
}

export function canAssignMissions(role: WorkspaceHumanRole) {
  return roleHasPermission(role, "mission.assign");
}

export function canManageMembers(role: WorkspaceHumanRole) {
  return roleHasPermission(role, "members.manage");
}
