/**
 * Persist execution records (adapter layer).
 * Scoped by workspaceId. Storage-backed (no project fs writes).
 */

import path from "node:path";
import type { ExecutionRecord } from "./types";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";

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
  const parsed = readJson<StoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed || !Array.isArray(parsed.executions)) return emptyStore();
  return parsed;
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  writeJson(root, fileFor(workspaceId), store);
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
