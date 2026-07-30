/**
 * Persist learning outcomes for the AI Company.
 * Storage-backed (no project fs writes).
 */

import path from "node:path";
import type { MissionOutcomeRecord } from "./learning.logic";
import { opsRel } from "./workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";
import { readJson, writeJson } from "./storage";

export const LEARNING_FILE = "ai-company-learning.json";
export const LEARNING_REL = opsRel(LEARNING_FILE, DEFAULT_WORKSPACE_ID);

type StoreShape = { outcomes: MissionOutcomeRecord[] };

function emptyStore(): StoreShape {
  return { outcomes: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(LEARNING_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): StoreShape {
  const parsed = readJson<StoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed || !Array.isArray(parsed.outcomes)) return emptyStore();
  return parsed;
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function listMissionOutcomes(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): MissionOutcomeRecord[] {
  return readStore(path.resolve(repoRoot), workspaceId).outcomes;
}

export function upsertMissionOutcome(
  outcome: MissionOutcomeRecord,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): MissionOutcomeRecord {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.outcomes.findIndex((o) => o.missionId === outcome.missionId);
  if (idx >= 0) store.outcomes[idx] = outcome;
  else store.outcomes.unshift(outcome);
  store.outcomes = store.outcomes.slice(0, 500);
  writeStore(root, workspaceId, store);
  return outcome;
}

export function syncOutcomesFromMissions(
  outcomes: MissionOutcomeRecord[],
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): MissionOutcomeRecord[] {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const byId = new Map(store.outcomes.map((o) => [o.missionId, o]));
  for (const o of outcomes) byId.set(o.missionId, o);
  store.outcomes = [...byId.values()]
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
    .slice(0, 500);
  writeStore(root, workspaceId, store);
  return store.outcomes;
}
