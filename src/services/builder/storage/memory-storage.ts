/**
 * In-memory runtime storage — default for development and Vercel fallback.
 */

import type { RuntimeStorageBackend } from "./types";

export function createMemoryStorage(
  initial?: Map<string, string>
): RuntimeStorageBackend {
  const data = initial ?? new Map<string, string>();

  return {
    name: "memory",
    getText(key) {
      return data.has(key) ? data.get(key)! : null;
    },
    setText(key, value) {
      data.set(key, value);
    },
    appendText(key, value) {
      data.set(key, `${data.get(key) ?? ""}${value}`);
    },
    delete(key) {
      data.delete(key);
    },
    listKeys(prefix) {
      const out: string[] = [];
      for (const key of data.keys()) {
        if (key.startsWith(prefix)) out.push(key);
      }
      return out.sort();
    },
    isWritable() {
      return true;
    },
  };
}
