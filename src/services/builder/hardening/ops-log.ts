/**
 * Safe structured operational logging for AI Company HQ.
 * Never logs message bodies, documents, tokens, or credentials.
 */

import { redactSecrets } from "./redaction";

export type OpsLogEvent = {
  outcome: "ok" | "error" | "denied";
  workspaceId?: string;
  action: string;
  connector?: string | null;
  executionStatus?: string | null;
  durationMs?: number;
  retryCount?: number;
  verificationResult?: "passed" | "failed" | "skipped" | null;
  code?: string | null;
};

export function logOpsEvent(event: OpsLogEvent): void {
  const payload = {
    source: "ai-company",
    ts: new Date().toISOString(),
    outcome: event.outcome,
    workspaceId: event.workspaceId ? String(event.workspaceId).slice(0, 64) : undefined,
    action: event.action,
    connector: event.connector ?? undefined,
    executionStatus: event.executionStatus ?? undefined,
    durationMs: event.durationMs,
    retryCount: event.retryCount,
    verificationResult: event.verificationResult ?? undefined,
    code: event.code ? redactSecrets(event.code) : undefined,
  };
  // Structured single-line JSON — no secret fields present by construction
  if (event.outcome === "error" || event.outcome === "denied") {
    console.warn(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }
}
