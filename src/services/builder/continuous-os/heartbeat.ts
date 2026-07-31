/**
 * Soft in-process heartbeat so the company keeps ticking while the Node server runs.
 * Safe on serverless (interval is process-local; API cron can still POST /continuous-os).
 */

import { runContinuousOsTick } from "./continuous-os.service";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";

type HeartbeatGlobal = typeof globalThis & {
  __aiCompanyContinuousOsHeartbeat?: ReturnType<typeof setInterval>;
};

const DEFAULT_HEARTBEAT_MS = 120_000;

export function ensureContinuousOsHeartbeat(input?: {
  intervalMs?: number;
  workspaceId?: string;
  repoRoot?: string;
}): void {
  const g = globalThis as HeartbeatGlobal;
  if (g.__aiCompanyContinuousOsHeartbeat) return;

  const intervalMs = input?.intervalMs ?? DEFAULT_HEARTBEAT_MS;
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const repoRoot = input?.repoRoot;

  g.__aiCompanyContinuousOsHeartbeat = setInterval(() => {
    try {
      runContinuousOsTick({
        repoRoot,
        workspaceId,
        minIntervalMs: intervalMs,
        deliverToChat: true,
      });
    } catch {
      /* never crash the host process */
    }
  }, intervalMs);

  g.__aiCompanyContinuousOsHeartbeat.unref?.();
}

export function stopContinuousOsHeartbeat(): void {
  const g = globalThis as HeartbeatGlobal;
  if (g.__aiCompanyContinuousOsHeartbeat) {
    clearInterval(g.__aiCompanyContinuousOsHeartbeat);
    g.__aiCompanyContinuousOsHeartbeat = undefined;
  }
}
