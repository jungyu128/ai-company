/**
 * Persist company memories (adapter layer).
 * Scoped by workspaceId (default keeps legacy path).
 */

import fs from "node:fs";
import path from "node:path";
import type { CompanyMemory, MemoryStoreShape } from "./types";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";

export const MEMORY_FILE = "ai-company-memory.json";
export const MEMORY_REL = opsRel(MEMORY_FILE, DEFAULT_WORKSPACE_ID);

function emptyStore(): MemoryStoreShape {
  return { memories: [], lastLearnedAt: null, lastWorkdayId: null };
}

function fileFor(workspaceId: string) {
  return opsRel(MEMORY_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): MemoryStoreShape {
  try {
    const raw = fs.readFileSync(path.join(root, fileFor(workspaceId)), "utf8");
    const parsed = JSON.parse(raw) as MemoryStoreShape;
    if (!parsed || !Array.isArray(parsed.memories)) return emptyStore();
    return {
      memories: parsed.memories,
      lastLearnedAt: parsed.lastLearnedAt ?? null,
      lastWorkdayId: parsed.lastWorkdayId ?? null,
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(root: string, workspaceId: string, store: MemoryStoreShape) {
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

export function listMemories(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyMemory[] {
  return readStore(path.resolve(repoRoot), workspaceId).memories.filter(
    (m) => m.ceoStatus !== "removed"
  );
}

export function listAllMemoriesIncludingRemoved(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyMemory[] {
  return readStore(path.resolve(repoRoot), workspaceId).memories;
}

export function getMemoryMeta(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): {
  lastLearnedAt: string | null;
  lastWorkdayId: string | null;
} {
  const s = readStore(path.resolve(repoRoot), workspaceId);
  return { lastLearnedAt: s.lastLearnedAt, lastWorkdayId: s.lastWorkdayId };
}

export function upsertMemory(
  memory: CompanyMemory,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyMemory {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.memories.findIndex(
    (m) => m.id === memory.id || m.patternKey === memory.patternKey
  );
  if (idx >= 0) {
    store.memories[idx] = { ...store.memories[idx], ...memory, id: store.memories[idx].id };
  } else {
    store.memories.unshift(memory);
  }
  store.memories = store.memories.slice(0, 400);
  writeStore(root, workspaceId, store);
  return store.memories.find((m) => m.patternKey === memory.patternKey) ?? memory;
}

export function replaceMemories(
  memories: CompanyMemory[],
  meta: { lastLearnedAt?: string | null; lastWorkdayId?: string | null },
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyMemory[] {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  store.memories = memories.slice(0, 400);
  if (meta.lastLearnedAt !== undefined) store.lastLearnedAt = meta.lastLearnedAt;
  if (meta.lastWorkdayId !== undefined) store.lastWorkdayId = meta.lastWorkdayId;
  writeStore(root, workspaceId, store);
  return store.memories;
}

export function resetMemories(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): void {
  writeStore(path.resolve(repoRoot), workspaceId, emptyStore());
}
