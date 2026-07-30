/**
 * Persist autonomous workday records (adapter layer).
 * Storage-backed (no project fs writes).
 */

import path from "node:path";
import type { AutonomousWorkday, WorkdayStoreShape } from "./types";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";

export const WORKDAYS_FILE = "ai-company-workdays.json";
export const WORKDAYS_REL = opsRel(WORKDAYS_FILE, DEFAULT_WORKSPACE_ID);

function emptyStore(): WorkdayStoreShape {
  return { workdays: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(WORKDAYS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): WorkdayStoreShape {
  const parsed = readJson<WorkdayStoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed || !Array.isArray(parsed.workdays)) return emptyStore();
  return parsed;
}

function writeStore(root: string, workspaceId: string, store: WorkdayStoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function listWorkdays(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): AutonomousWorkday[] {
  return readStore(path.resolve(repoRoot), workspaceId).workdays;
}

export function getWorkdayById(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): AutonomousWorkday | null {
  return listWorkdays(repoRoot, workspaceId).find((w) => w.id === id) ?? null;
}

export function getWorkdayByDate(
  date: string,
  workspaceId = DEFAULT_WORKSPACE_ID,
  repoRoot = process.cwd()
): AutonomousWorkday | null {
  return (
    listWorkdays(repoRoot, workspaceId).find(
      (w) => w.date === date && w.workspaceId === workspaceId
    ) ?? null
  );
}

export function upsertWorkday(
  workday: AutonomousWorkday,
  repoRoot = process.cwd()
): AutonomousWorkday {
  const root = path.resolve(repoRoot);
  const workspaceId = workday.workspaceId || DEFAULT_WORKSPACE_ID;
  const store = readStore(root, workspaceId);
  const idx = store.workdays.findIndex((w) => w.id === workday.id);
  if (idx >= 0) store.workdays[idx] = workday;
  else store.workdays.unshift(workday);
  store.workdays = store.workdays.slice(0, 90);
  writeStore(root, workspaceId, store);
  return workday;
}
