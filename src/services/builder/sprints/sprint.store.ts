/**
 * Persist AI Company sprints.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { CompanySprint, SprintStatus } from "./types";

export const SPRINTS_FILE = "ai-company-sprints.json";

export type SprintsStoreShape = {
  sprints: CompanySprint[];
};

function emptyStore(): SprintsStoreShape {
  return { sprints: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(SPRINTS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): SprintsStoreShape {
  const parsed = readJson<SprintsStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed || !Array.isArray(parsed.sprints)) return emptyStore();
  return { sprints: parsed.sprints };
}

function writeStore(root: string, workspaceId: string, store: SprintsStoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function getSprintsStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): SprintsStoreShape {
  return readStore(path.resolve(repoRoot), workspaceId);
}

export function listSprints(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanySprint[] {
  return getSprintsStore(repoRoot, workspaceId).sprints;
}

export function getSprintById(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanySprint | null {
  return listSprints(repoRoot, workspaceId).find((s) => s.id === id) ?? null;
}

export function getActiveSprint(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanySprint | null {
  return (
    listSprints(repoRoot, workspaceId).find((s) => s.status === "active") ??
    null
  );
}

export function upsertSprint(
  sprint: CompanySprint,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanySprint {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.sprints.findIndex((s) => s.id === sprint.id);
  if (idx >= 0) store.sprints[idx] = sprint;
  else store.sprints.unshift(sprint);
  store.sprints = store.sprints.slice(0, 200);
  writeStore(root, workspaceId, store);
  return sprint;
}

export function listSprintsByStatus(
  status: SprintStatus,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanySprint[] {
  return listSprints(repoRoot, workspaceId).filter((s) => s.status === status);
}
