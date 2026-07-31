/**
 * Persist continuous OS live states, decisions, and tick metadata.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { EmployeeLiveState, OsDecision } from "./types";

export const CONTINUOUS_OS_FILE = "ai-company-continuous-os.json";

export type ContinuousOsStoreShape = {
  employeeStates: EmployeeLiveState[];
  decisions: OsDecision[];
  lastTickAt: string | null;
  /** Soft flag — heartbeat has been armed this process. */
  running: boolean;
};

function emptyStore(): ContinuousOsStoreShape {
  return {
    employeeStates: [],
    decisions: [],
    lastTickAt: null,
    running: false,
  };
}

function fileFor(workspaceId: string) {
  return opsRel(CONTINUOUS_OS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): ContinuousOsStoreShape {
  const parsed = readJson<ContinuousOsStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed) return emptyStore();
  return {
    employeeStates: Array.isArray(parsed.employeeStates)
      ? parsed.employeeStates
      : [],
    decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
    lastTickAt: parsed.lastTickAt ?? null,
    running: Boolean(parsed.running),
  };
}

function writeStore(
  root: string,
  workspaceId: string,
  store: ContinuousOsStoreShape
) {
  writeJson(root, fileFor(workspaceId), store);
}

export function getContinuousOsStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): ContinuousOsStoreShape {
  return readStore(path.resolve(repoRoot), workspaceId);
}

export function saveContinuousOsStore(
  store: ContinuousOsStoreShape,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): ContinuousOsStoreShape {
  const root = path.resolve(repoRoot);
  writeStore(root, workspaceId, store);
  return store;
}

export function appendOsDecisions(
  decisions: OsDecision[],
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): OsDecision[] {
  if (!decisions.length) return [];
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  store.decisions = [...decisions, ...store.decisions].slice(0, 400);
  writeStore(root, workspaceId, store);
  return decisions;
}

export function upsertEmployeeStates(
  states: EmployeeLiveState[],
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): EmployeeLiveState[] {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const byId = new Map(store.employeeStates.map((s) => [s.employeeId, s]));
  for (const state of states) {
    byId.set(state.employeeId, state);
  }
  store.employeeStates = [...byId.values()];
  writeStore(root, workspaceId, store);
  return states;
}

export function markTick(
  tickAt: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): void {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  store.lastTickAt = tickAt;
  store.running = true;
  writeStore(root, workspaceId, store);
}
