/**
 * Persist company activity timeline events.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { CompanyTimelineEvent, CompanyTimelineStoreShape } from "./types";

export const COMPANY_TIMELINE_FILE = "ai-company-company-timeline.json";

function emptyStore(): CompanyTimelineStoreShape {
  return { events: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(COMPANY_TIMELINE_FILE, workspaceId);
}

export function getCompanyTimelineStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyTimelineStoreShape {
  const root = path.resolve(repoRoot);
  const parsed = readJson<CompanyTimelineStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed) return emptyStore();
  return {
    events: Array.isArray(parsed.events) ? parsed.events : [],
  };
}

export function saveCompanyTimelineStore(
  store: CompanyTimelineStoreShape,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyTimelineStoreShape {
  const root = path.resolve(repoRoot);
  writeJson(root, fileFor(workspaceId), {
    events: store.events.slice(0, 1000),
  });
  return store;
}

export function appendCompanyTimelineEvent(
  event: CompanyTimelineEvent,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyTimelineEvent {
  const store = getCompanyTimelineStore(repoRoot, workspaceId);
  store.events.unshift(event);
  saveCompanyTimelineStore(store, repoRoot, workspaceId);
  return event;
}

export function listCompanyTimelineEvents(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID,
  limit = 100
): CompanyTimelineEvent[] {
  const events = getCompanyTimelineStore(repoRoot, workspaceId).events;
  return [...events]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.max(1, limit));
}
