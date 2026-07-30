/**
 * AI Company runtime storage facade.
 *
 * - Never writes to docs/ or the project filesystem
 * - Memory is the sync source of truth for request handlers
 * - Optional Vercel KV mirror when env is configured
 * - Read-only seed from packaged files when a key is cold (no mkdir)
 */

import fs from "node:fs";
import path from "node:path";
import { createMemoryStorage } from "./memory-storage";
import { hydrateKeyFromKv, isKvConfigured, mirrorToKv } from "./vercel-kv";
import type { RuntimeStorageBackend, RuntimeStorageStatus } from "./types";

const memory = createMemoryStorage();
const hydrated = new Set<string>();

function normalizeRel(rel: string): string {
  return rel.replace(/\\/g, "/").replace(/^\.\//, "");
}

/** Stable namespaced key — isolates test repo roots without touching disk. */
export function storageKey(repoRoot: string, relPath: string): string {
  const ns = path.resolve(repoRoot).replace(/\\/g, "/");
  return `${ns}::${normalizeRel(relPath)}`;
}

function relFromFullKey(fullKey: string, repoRoot: string): string | null {
  const prefix = `${path.resolve(repoRoot).replace(/\\/g, "/")}::`;
  if (!fullKey.startsWith(prefix)) return null;
  return fullKey.slice(prefix.length);
}

/** Read-only seed from the deployment package (never creates directories). */
function readPackagedSeed(repoRoot: string, relPath: string): string | null {
  try {
    const abs = path.join(path.resolve(repoRoot), normalizeRel(relPath));
    const resolvedRoot = path.resolve(repoRoot);
    const resolvedFile = path.resolve(abs);
    if (!resolvedFile.startsWith(resolvedRoot)) return null;
    if (!fs.existsSync(resolvedFile)) return null;
    const stat = fs.statSync(resolvedFile);
    if (!stat.isFile()) return null;
    return fs.readFileSync(resolvedFile, "utf8");
  } catch {
    return null;
  }
}

function listPackagedPrefix(repoRoot: string, relPrefix: string): string[] {
  try {
    const abs = path.join(path.resolve(repoRoot), normalizeRel(relPrefix));
    const resolvedRoot = path.resolve(repoRoot);
    const resolvedDir = path.resolve(abs);
    if (!resolvedDir.startsWith(resolvedRoot)) return [];
    if (!fs.existsSync(resolvedDir) || !fs.statSync(resolvedDir).isDirectory()) {
      return [];
    }
    return fs
      .readdirSync(resolvedDir)
      .filter((f) => {
        try {
          return fs.statSync(path.join(resolvedDir, f)).isFile();
        } catch {
          return false;
        }
      })
      .map((f) => normalizeRel(path.posix.join(normalizeRel(relPrefix), f)));
  } catch {
    return [];
  }
}

export function getText(repoRoot: string, relPath: string): string | null {
  const key = storageKey(repoRoot, relPath);
  const hit = memory.getText(key);
  if (hit != null) return hit;

  const seed = readPackagedSeed(repoRoot, relPath);
  if (seed != null) {
    memory.setText(key, seed);
    return seed;
  }
  return null;
}

export function setText(repoRoot: string, relPath: string, value: string): void {
  const key = storageKey(repoRoot, relPath);
  memory.setText(key, value);
  mirrorToKv(key, value);
}

export function appendText(repoRoot: string, relPath: string, value: string): void {
  const key = storageKey(repoRoot, relPath);
  const next = `${memory.getText(key) ?? getText(repoRoot, relPath) ?? ""}${value}`;
  memory.setText(key, next);
  mirrorToKv(key, next);
}

export function deleteText(repoRoot: string, relPath: string): void {
  const key = storageKey(repoRoot, relPath);
  memory.delete(key);
  mirrorToKv(key, null);
}

export function exists(repoRoot: string, relPath: string): boolean {
  return getText(repoRoot, relPath) != null;
}

/** Relative paths under prefix (e.g. docs/ai-team/tasks/). */
export function listRelKeys(repoRoot: string, relPrefix: string): string[] {
  const prefix = normalizeRel(relPrefix).replace(/\/?$/, "/");
  const fullPrefix = storageKey(repoRoot, prefix).replace(/\/?$/, "");
  const fromMemory = memory
    .listKeys(fullPrefix)
    .map((k) => relFromFullKey(k, repoRoot))
    .filter((r): r is string => Boolean(r));

  const fromPackage = listPackagedPrefix(repoRoot, prefix.replace(/\/$/, ""));
  return [...new Set([...fromMemory, ...fromPackage])].sort();
}

export function readJson<T>(repoRoot: string, relPath: string, fallback: T): T {
  const raw = getText(repoRoot, relPath);
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(repoRoot: string, relPath: string, data: unknown): void {
  setText(repoRoot, relPath, `${JSON.stringify(data, null, 2)}\n`);
}

export function getStorageStatus(): RuntimeStorageStatus {
  const kv = isKvConfigured();
  return {
    backend: kv ? "memory+vercel-kv" : "memory",
    writable: true,
    persistent: kv,
    fallback: !kv,
    detail: kv
      ? "Memory with Vercel KV write-through."
      : "In-memory storage (configure KV_REST_API_URL + KV_REST_API_TOKEN for persistence).",
  };
}

export function getMemoryBackend(): RuntimeStorageBackend {
  return memory;
}

/** Test helper — wipe namespaced keys for a repo root. */
export function resetStorageNamespace(repoRoot: string): void {
  const prefix = `${path.resolve(repoRoot).replace(/\\/g, "/")}::`;
  for (const key of memory.listKeys(prefix)) {
    memory.delete(key);
  }
}

/** Best-effort async hydrate from KV for a workspace file key. */
export async function hydrateFromPersistentStore(
  repoRoot: string,
  relPath: string
): Promise<void> {
  const key = storageKey(repoRoot, relPath);
  if (hydrated.has(key)) return;
  const ok = await hydrateKeyFromKv(memory, key);
  if (ok) hydrated.add(key);
}

// Bridge for docs runtime .mjs loaders (no project writes).
const g = globalThis as typeof globalThis & {
  __AI_COMPANY_STORAGE_GET?: (root: string, rel: string) => string | null;
  __AI_COMPANY_STORAGE_SET?: (root: string, rel: string, value: string) => void;
  __AI_COMPANY_STORAGE_LIST?: (root: string, prefix: string) => string[];
};

g.__AI_COMPANY_STORAGE_GET = getText;
g.__AI_COMPANY_STORAGE_SET = setText;
g.__AI_COMPANY_STORAGE_LIST = listRelKeys;
