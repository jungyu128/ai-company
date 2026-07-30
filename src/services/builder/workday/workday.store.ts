/**
 * Persist autonomous workday records (adapter layer).
 * Scoped by workspaceId (default keeps legacy path).
 */

import fs from "node:fs";
import path from "node:path";
import type { AutonomousWorkday, WorkdayStoreShape } from "./types";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";

export const WORKDAYS_FILE = "ai-company-workdays.json";
export const WORKDAYS_REL = opsRel(WORKDAYS_FILE, DEFAULT_WORKSPACE_ID);

function emptyStore(): WorkdayStoreShape {
  return { workdays: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(WORKDAYS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): WorkdayStoreShape {
  try {
    const raw = fs.readFileSync(path.join(root, fileFor(workspaceId)), "utf8");
    const parsed = JSON.parse(raw) as WorkdayStoreShape;
    if (!parsed || !Array.isArray(parsed.workdays)) return emptyStore();
    return parsed;
  } catch {
    return emptyStore();
  }
}

function writeStore(root: string, workspaceId: string, store: WorkdayStoreShape) {
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
