/**
 * Persist execution records (adapter layer).
 * Scoped by workspaceId (default keeps legacy path).
 */

import fs from "node:fs";
import path from "node:path";
import type { ExecutionRecord } from "./types";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";

export const EXECUTIONS_FILE = "ai-company-executions.json";
export const EXECUTIONS_REL = opsRel(EXECUTIONS_FILE, DEFAULT_WORKSPACE_ID);

type StoreShape = { executions: ExecutionRecord[] };

function emptyStore(): StoreShape {
  return { executions: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(EXECUTIONS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): StoreShape {
  try {
    const raw = fs.readFileSync(path.join(root, fileFor(workspaceId)), "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    if (!parsed || !Array.isArray(parsed.executions)) return emptyStore();
    return parsed;
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

export function listExecutions(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): ExecutionRecord[] {
  return readStore(path.resolve(repoRoot), workspaceId).executions;
}

export function getExecution(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): ExecutionRecord | null {
  return listExecutions(repoRoot, workspaceId).find((e) => e.id === id) ?? null;
}

export function upsertExecution(
  record: ExecutionRecord,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): ExecutionRecord {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.executions.findIndex((e) => e.id === record.id);
  if (idx >= 0) store.executions[idx] = record;
  else store.executions.unshift(record);
  store.executions = store.executions.slice(0, 300);
  writeStore(root, workspaceId, store);
  return record;
}

export function listExecutionsForEmployee(
  employeeId: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): ExecutionRecord[] {
  return listExecutions(repoRoot, workspaceId).filter((e) => e.employeeId === employeeId);
}
