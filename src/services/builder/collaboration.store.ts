/**
 * Persist AI Company collaboration missions (adapter layer — not Builder Runtime).
 * Scoped by workspaceId (default keeps legacy path).
 */

import fs from "node:fs";
import path from "node:path";
import type { CollaborationMission } from "./collaboration.logic";
import { ensureMissionCommunications } from "./conversation.logic";
import { opsRel } from "./workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";

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
  try {
    const raw = fs.readFileSync(path.join(root, fileFor(workspaceId)), "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.missions)) return emptyStore();
    return {
      missions: parsed.missions.map((m) => ensureMissionCommunications(m)),
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  const filePath = path.join(root, fileFor(workspaceId));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", "utf8");
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.copyFileSync(tmp, filePath);
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
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
