/**
 * Append-only analytics history. Never mutates execution / mission / approval stores.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { AnalyticsHistorySample } from "./types";

export const ANALYTICS_FILE = "ai-company-analytics.json";

export type AnalyticsStoreShape = {
  samples: AnalyticsHistorySample[];
  lastRecordedAt: string | null;
};

function emptyStore(): AnalyticsStoreShape {
  return { samples: [], lastRecordedAt: null };
}

function fileFor(workspaceId: string) {
  return opsRel(ANALYTICS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): AnalyticsStoreShape {
  const parsed = readJson<AnalyticsStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed || !Array.isArray(parsed.samples)) return emptyStore();
  return {
    samples: parsed.samples,
    lastRecordedAt: parsed.lastRecordedAt ?? null,
  };
}

function writeStore(
  root: string,
  workspaceId: string,
  store: AnalyticsStoreShape
) {
  writeJson(root, fileFor(workspaceId), store);
}

export function getAnalyticsStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): AnalyticsStoreShape {
  return readStore(path.resolve(repoRoot), workspaceId);
}

export function listAnalyticsSamples(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID,
  limit = 60
): AnalyticsHistorySample[] {
  return getAnalyticsStore(repoRoot, workspaceId).samples.slice(0, limit);
}

export function appendAnalyticsSample(
  sample: AnalyticsHistorySample,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): AnalyticsHistorySample {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  store.samples.unshift(sample);
  store.samples = store.samples.slice(0, 180);
  store.lastRecordedAt = sample.at;
  writeStore(root, workspaceId, store);
  return sample;
}
