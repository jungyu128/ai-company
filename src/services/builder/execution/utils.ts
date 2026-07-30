import { createHash } from "node:crypto";

const VOLATILE_KEYS = new Set([
  "updatedAt",
  "checkedAt",
  "createdAt",
  "timestamp",
  "recordedAt",
  "executedAt",
  "approvedAt",
]);

/** Stable fingerprint of preview source data for stale-approval checks. */
export function fingerprintPayload(payload: unknown): string {
  const normalized = JSON.stringify(sortKeys(payload));
  return createHash("sha256").update(normalized).digest("hex").slice(0, 32);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (VOLATILE_KEYS.has(key)) continue;
      out[key] = sortKeys(obj[key]);
    }
    return out;
  }
  return value;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; delayMs?: number }
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const delayMs = options?.delayMs ?? 40;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable =
        err &&
        typeof err === "object" &&
        "retryable" in err &&
        Boolean((err as { retryable?: boolean }).retryable);
      if (!retryable || i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastError;
}
