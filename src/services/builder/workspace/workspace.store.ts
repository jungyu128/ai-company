/**
 * Workspace + membership persistence.
 */

import {
  newId,
  nowIso,
  readJsonFile,
  writeJsonFile,
  workspaceFile,
} from "./json-file";
import { DEFAULT_WORKSPACE_ID, type AiCompanyWorkspace, type WorkspaceMember, type WorkspaceHumanRole } from "./types";

const WORKSPACES_FILE = "ai-company-workspaces.json";
const MEMBERS_FILE = "ai-company-memberships.json";

type WorkspaceStore = { workspaces: AiCompanyWorkspace[] };
type MemberStore = { members: WorkspaceMember[] };

function workspacesPath(repoRoot: string) {
  // Global registry (not per-workspace)
  return workspaceFile(repoRoot, WORKSPACES_FILE, DEFAULT_WORKSPACE_ID);
}

function membersPath(repoRoot: string) {
  return workspaceFile(repoRoot, MEMBERS_FILE, DEFAULT_WORKSPACE_ID);
}

export function listWorkspaces(repoRoot = process.cwd()): AiCompanyWorkspace[] {
  return readJsonFile<WorkspaceStore>(repoRoot, workspacesPath(repoRoot), {
    workspaces: [],
  }).workspaces;
}

export function listWorkspacesForUser(
  userId: string,
  repoRoot = process.cwd()
): AiCompanyWorkspace[] {
  const all = listWorkspaces(repoRoot);
  return all.filter((w) => Boolean(getMember(w.id, userId, repoRoot)));
}

export function getWorkspace(
  id: string,
  repoRoot = process.cwd()
): AiCompanyWorkspace | null {
  return listWorkspaces(repoRoot).find((w) => w.id === id) ?? null;
}

export function upsertWorkspace(
  workspace: AiCompanyWorkspace,
  repoRoot = process.cwd()
): AiCompanyWorkspace {
  const store = readJsonFile<WorkspaceStore>(repoRoot, workspacesPath(repoRoot), {
    workspaces: [],
  });
  const idx = store.workspaces.findIndex((w) => w.id === workspace.id);
  if (idx >= 0) store.workspaces[idx] = workspace;
  else store.workspaces.unshift(workspace);
  writeJsonFile(repoRoot, workspacesPath(repoRoot), store);
  return workspace;
}

export function listMembers(
  workspaceId: string,
  repoRoot = process.cwd()
): WorkspaceMember[] {
  return readJsonFile<MemberStore>(repoRoot, membersPath(repoRoot), { members: [] }).members.filter(
    (m) => m.workspaceId === workspaceId
  );
}

export function getMember(
  workspaceId: string,
  userId: string,
  repoRoot = process.cwd()
): WorkspaceMember | null {
  return (
    listMembers(workspaceId, repoRoot).find((m) => m.userId === userId) ?? null
  );
}

export function upsertMember(
  member: WorkspaceMember,
  repoRoot = process.cwd()
): WorkspaceMember {
  const store = readJsonFile<MemberStore>(repoRoot, membersPath(repoRoot), { members: [] });
  const idx = store.members.findIndex(
    (m) => m.workspaceId === member.workspaceId && m.userId === member.userId
  );
  if (idx >= 0) store.members[idx] = member;
  else store.members.unshift(member);
  writeJsonFile(repoRoot, membersPath(repoRoot), store);
  return member;
}

export function ensureDefaultWorkspace(input: {
  userId: string;
  email: string;
  displayName: string;
  repoRoot?: string;
}): { workspace: AiCompanyWorkspace; member: WorkspaceMember | null; created: boolean } {
  const root = input.repoRoot ?? process.cwd();
  const now = nowIso();
  let workspace = getWorkspace(DEFAULT_WORKSPACE_ID, root);
  let created = false;
  if (!workspace) {
    workspace = {
      id: DEFAULT_WORKSPACE_ID,
      name: "Primary AI Company",
      organizationKey: "primary",
      createdAt: now,
      updatedAt: now,
      createdByUserId: input.userId,
    };
    upsertWorkspace(workspace, root);
    created = true;
  }

  let member = getMember(DEFAULT_WORKSPACE_ID, input.userId, root);
  if (!member) {
    const existingOwners = listMembers(DEFAULT_WORKSPACE_ID, root).filter(
      (m) => m.role === "owner"
    );
    // Only auto-seed the first owner. Later users must be invited.
    if (existingOwners.length === 0) {
      member = {
        id: newId("wsm"),
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: input.userId,
        email: input.email,
        displayName: input.displayName,
        role: "owner",
        joinedAt: now,
        updatedAt: now,
      };
      upsertMember(member, root);
    }
  }

  return { workspace, member, created };
}

export function createWorkspace(input: {
  name: string;
  organizationKey?: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerDisplayName: string;
  repoRoot?: string;
}): AiCompanyWorkspace {
  const root = input.repoRoot ?? process.cwd();
  const now = nowIso();
  const id = newId("ws");
  const workspace: AiCompanyWorkspace = {
    id,
    name: input.name.trim() || "AI Company workspace",
    organizationKey: (input.organizationKey ?? id).slice(0, 64),
    createdAt: now,
    updatedAt: now,
    createdByUserId: input.ownerUserId,
  };
  upsertWorkspace(workspace, root);
  upsertMember(
    {
      id: newId("wsm"),
      workspaceId: id,
      userId: input.ownerUserId,
      email: input.ownerEmail,
      displayName: input.ownerDisplayName,
      role: "owner",
      joinedAt: now,
      updatedAt: now,
    },
    root
  );
  return workspace;
}

export function addOrUpdateMember(input: {
  workspaceId: string;
  userId: string;
  email: string;
  displayName: string;
  role: WorkspaceHumanRole;
  repoRoot?: string;
}): WorkspaceMember {
  const root = input.repoRoot ?? process.cwd();
  const now = nowIso();
  const existing = getMember(input.workspaceId, input.userId, root);
  const member: WorkspaceMember = {
    id: existing?.id ?? newId("wsm"),
    workspaceId: input.workspaceId,
    userId: input.userId,
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    joinedAt: existing?.joinedAt ?? now,
    updatedAt: now,
  };
  return upsertMember(member, root);
}
