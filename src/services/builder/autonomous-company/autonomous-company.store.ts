/**
 * Persist autonomous company state (tasks, discussions, CEO reports, repo snapshot).
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type {
  CeoDevReport,
  DevTask,
  PeerDiscussion,
  RepoChangeEvent,
  RepoSnapshot,
} from "./types";

export const AUTONOMY_FILE = "ai-company-autonomy.json";

type StoreShape = {
  tasks: DevTask[];
  discussions: PeerDiscussion[];
  reports: CeoDevReport[];
  repoChanges: RepoChangeEvent[];
  lastRepoSnapshot: RepoSnapshot | null;
  lastCycleAt: string | null;
};

function emptyStore(): StoreShape {
  return {
    tasks: [],
    discussions: [],
    reports: [],
    repoChanges: [],
    lastRepoSnapshot: null,
    lastCycleAt: null,
  };
}

function fileFor(workspaceId: string) {
  return opsRel(AUTONOMY_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): StoreShape {
  const parsed = readJson<StoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed || !Array.isArray(parsed.tasks)) return emptyStore();
  return {
    tasks: parsed.tasks,
    discussions: Array.isArray(parsed.discussions) ? parsed.discussions : [],
    reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    repoChanges: Array.isArray(parsed.repoChanges) ? parsed.repoChanges : [],
    lastRepoSnapshot: parsed.lastRepoSnapshot ?? null,
    lastCycleAt: parsed.lastCycleAt ?? null,
  };
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function getAutonomyStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): StoreShape {
  return readStore(path.resolve(repoRoot), workspaceId);
}

export function saveAutonomyStore(
  store: StoreShape,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): StoreShape {
  const root = path.resolve(repoRoot);
  writeStore(root, workspaceId, store);
  return store;
}

export function upsertDevTasks(
  tasks: DevTask[],
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DevTask[] {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const byId = new Map(store.tasks.map((t) => [t.id, t]));
  for (const task of tasks) {
    byId.set(task.id, task);
  }
  store.tasks = [...byId.values()];
  writeStore(root, workspaceId, store);
  return tasks;
}

export function appendAutonomyArtifacts(input: {
  discussions?: PeerDiscussion[];
  reports?: CeoDevReport[];
  repoChanges?: RepoChangeEvent[];
  lastRepoSnapshot?: RepoSnapshot | null;
  lastCycleAt?: string | null;
  repoRoot?: string;
  workspaceId?: string;
}): StoreShape {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const store = readStore(root, workspaceId);
  if (input.discussions?.length) {
    store.discussions = [...input.discussions, ...store.discussions].slice(0, 200);
  }
  if (input.reports?.length) {
    const existing = new Set(store.reports.map((r) => r.id));
    for (const report of input.reports) {
      if (!existing.has(report.id)) store.reports.unshift(report);
    }
    store.reports = store.reports.slice(0, 300);
  }
  if (input.repoChanges?.length) {
    store.repoChanges = [...input.repoChanges, ...store.repoChanges].slice(0, 200);
  }
  if (input.lastRepoSnapshot !== undefined) {
    store.lastRepoSnapshot = input.lastRepoSnapshot;
  }
  if (input.lastCycleAt !== undefined) {
    store.lastCycleAt = input.lastCycleAt;
  }
  writeStore(root, workspaceId, store);
  return store;
}

export function listUndeliveredCeoReports(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CeoDevReport[] {
  return getAutonomyStore(repoRoot, workspaceId).reports.filter(
    (r) => !r.deliveredToChat
  );
}

export function markReportsDelivered(
  reportIds: string[],
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): void {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const set = new Set(reportIds);
  store.reports = store.reports.map((r) =>
    set.has(r.id) ? { ...r, deliveredToChat: true } : r
  );
  writeStore(root, workspaceId, store);
}

export function listDevTasksForEmployee(
  employeeId: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DevTask[] {
  return getAutonomyStore(repoRoot, workspaceId).tasks.filter(
    (t) =>
      t.ownerEmployeeId === employeeId || t.collaboratorIds.includes(employeeId)
  );
}
