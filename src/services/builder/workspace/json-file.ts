/**
 * JSON helpers for workspace-scoped stores — storage-backed (no project fs writes).
 */

import { opsRel } from "./paths";
import { DEFAULT_WORKSPACE_ID } from "./types";
import { readJson, writeJson } from "../storage";

export function readJsonFile<T>(
  repoRoot: string,
  relPath: string,
  fallback: T
): T {
  return readJson(repoRoot, relPath, fallback);
}

export function writeJsonFile(
  repoRoot: string,
  relPath: string,
  data: unknown
): void {
  writeJson(repoRoot, relPath, data);
}

/** Relative ops key for a store file (not a filesystem path). */
export function workspaceFile(
  _repoRoot: string,
  fileName: string,
  workspaceId = DEFAULT_WORKSPACE_ID
): string {
  return opsRel(fileName, workspaceId);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
