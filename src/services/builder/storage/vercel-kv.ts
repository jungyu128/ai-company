/**
 * Optional Vercel KV write-through mirror.
 * Never throws into request paths — failures fall back to memory silently.
 */

import type { RuntimeStorageBackend } from "./types";

type KvLike = {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
};

function kvConfigured(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim()
  );
}

let kvClient: KvLike | null | undefined;

async function loadKv(): Promise<KvLike | null> {
  if (kvClient !== undefined) return kvClient;
  if (!kvConfigured()) {
    kvClient = null;
    return null;
  }
  try {
    const mod = await import("@vercel/kv");
    kvClient = mod.kv as KvLike;
    return kvClient;
  } catch {
    kvClient = null;
    return null;
  }
}

/** Fire-and-forget persist. Safe no-op when KV is unavailable. */
export function mirrorToKv(key: string, value: string | null): void {
  void (async () => {
    try {
      const kv = await loadKv();
      if (!kv) return;
      if (value == null) await kv.del(key);
      else await kv.set(key, value);
    } catch {
      /* graceful fallback — memory remains source of truth for this instance */
    }
  })();
}

/** Best-effort hydrate a key from KV into the memory backend. */
export async function hydrateKeyFromKv(
  memory: RuntimeStorageBackend,
  key: string
): Promise<boolean> {
  try {
    const kv = await loadKv();
    if (!kv) return false;
    const value = await kv.get(key);
    if (typeof value === "string") {
      memory.setText(key, value);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export function isKvConfigured(): boolean {
  return kvConfigured();
}
