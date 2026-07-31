/**
 * Persist WorkPilot execution packages (storage-backed).
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { WorkpilotExecutionPackage } from "./types";

export const WORKPILOT_EXEC_FILE = "ai-company-workpilot-executions.json";

type StoreShape = {
  packages: WorkpilotExecutionPackage[];
};

function emptyStore(): StoreShape {
  return { packages: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(WORKPILOT_EXEC_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): StoreShape {
  const parsed = readJson<StoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed || !Array.isArray(parsed.packages)) return emptyStore();
  return { packages: parsed.packages };
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function listWorkpilotExecutions(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): WorkpilotExecutionPackage[] {
  return readStore(path.resolve(repoRoot), workspaceId).packages;
}

export function getWorkpilotExecution(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): WorkpilotExecutionPackage | null {
  return listWorkpilotExecutions(repoRoot, workspaceId).find((p) => p.id === id) ?? null;
}

export function upsertWorkpilotExecution(
  pkg: WorkpilotExecutionPackage,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): WorkpilotExecutionPackage {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.packages.findIndex((p) => p.id === pkg.id);
  if (idx >= 0) store.packages[idx] = pkg;
  else store.packages.unshift(pkg);
  store.packages = store.packages.slice(0, 200);
  writeStore(root, workspaceId, store);
  return pkg;
}

export function listAwaitingWorkpilotExecutions(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): WorkpilotExecutionPackage[] {
  return listWorkpilotExecutions(repoRoot, workspaceId).filter(
    (p) => p.status === "awaiting_approval"
  );
}
