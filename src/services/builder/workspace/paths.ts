/**
 * Workspace-scoped ops paths. Default workspace keeps legacy flat paths.
 */

import path from "node:path";
import { DEFAULT_WORKSPACE_ID } from "./types";

const OPS = "docs/ai-team/ops";

/** Relative path for a store file, isolated per workspace. */
export function opsRel(fileName: string, workspaceId = DEFAULT_WORKSPACE_ID): string {
  const id = (workspaceId || DEFAULT_WORKSPACE_ID).trim() || DEFAULT_WORKSPACE_ID;
  if (id === DEFAULT_WORKSPACE_ID) {
    return path.posix.join(OPS, fileName);
  }
  // Sanitize id to prevent path traversal
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  return path.posix.join(OPS, "workspaces", safe, fileName);
}

export function resolveOpsPath(
  repoRoot: string,
  fileName: string,
  workspaceId = DEFAULT_WORKSPACE_ID
): string {
  return path.join(path.resolve(repoRoot), opsRel(fileName, workspaceId));
}
