/**
 * Persist AI Company collaboration missions (adapter layer — not Builder Runtime).
 * Scoped by workspaceId (default keeps legacy path). Storage-backed (no project fs writes).
 */

import path from "node:path";
import type { CollaborationMission } from "./collaboration.logic";
import { ensureMissionCommunications } from "./conversation.logic";
import { opsRel } from "./workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";
import { readJson, writeJson } from "./storage";

export const COLLABORATIONS_FILE = "ai-company-collaborations.json";
export const COLLABORATIONS_REL = opsRel(COLLABORATIONS_FILE, DEFAULT_WORKSPACE_ID);

type StoreShape = { missions: CollaborationMission[] };

function emptyStore(): StoreShape {
  return { missions: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(COLLABORATIONS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): StoreShape {
  const parsed = readJson<StoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed || !Array.isArray(parsed.missions)) return emptyStore();
  return {
    missions: parsed.missions.map((m) => ensureMissionCommunications(m)),
  };
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function listCollaborations(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CollaborationMission[] {
  return readStore(path.resolve(repoRoot), workspaceId).missions;
}

export function getCollaboration(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CollaborationMission | null {
  return listCollaborations(repoRoot, workspaceId).find((m) => m.id === id) ?? null;
}

export function upsertCollaboration(
  mission: CollaborationMission,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CollaborationMission {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const enriched = ensureMissionCommunications(mission);
  const idx = store.missions.findIndex((m) => m.id === enriched.id);
  if (idx >= 0) store.missions[idx] = enriched;
  else store.missions.unshift(enriched);
  store.missions = store.missions.slice(0, 100);
  writeStore(root, workspaceId, store);
  return enriched;
}
