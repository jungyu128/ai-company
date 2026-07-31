/**
 * Persist last live-work fingerprints for change detection / timeline sync.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { LiveWorkTrackerStoreShape } from "./types";

export const LIVE_WORK_TRACKER_FILE = "ai-company-live-work-tracker.json";

function emptyStore(): LiveWorkTrackerStoreShape {
  return {
    fingerprints: [],
    lastSyncAt: null,
    lastSnapshot: null,
  };
}

function fileFor(workspaceId: string) {
  return opsRel(LIVE_WORK_TRACKER_FILE, workspaceId);
}

export function getLiveWorkTrackerStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): LiveWorkTrackerStoreShape {
  const root = path.resolve(repoRoot);
  const parsed = readJson<LiveWorkTrackerStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed) return emptyStore();
  return {
    fingerprints: Array.isArray(parsed.fingerprints) ? parsed.fingerprints : [],
    lastSyncAt: parsed.lastSyncAt ?? null,
    lastSnapshot: parsed.lastSnapshot ?? null,
  };
}

export function saveLiveWorkTrackerStore(
  store: LiveWorkTrackerStoreShape,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): LiveWorkTrackerStoreShape {
  const root = path.resolve(repoRoot);
  writeJson(root, fileFor(workspaceId), store);
  return store;
}
