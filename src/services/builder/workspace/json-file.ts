/**
 * Small JSON file helper for workspace-scoped stores.
 */

import fs from "node:fs";
import path from "node:path";
import { resolveOpsPath } from "./paths";
import { DEFAULT_WORKSPACE_ID } from "./types";

export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, data: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
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

export function workspaceFile(
  repoRoot: string,
  fileName: string,
  workspaceId = DEFAULT_WORKSPACE_ID
) {
  return resolveOpsPath(repoRoot, fileName, workspaceId);
}

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
