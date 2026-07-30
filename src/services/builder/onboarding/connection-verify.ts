/**
 * Connector verification for onboarding — never exposes secrets or env values.
 */

import { getConnectionStatusesSync } from "../execution/connection-status";
import type { ExternalSystem } from "../execution/types";
import type { ConnectorUiState, OnboardingConnectionResult } from "./types";

const LABELS: Record<ExternalSystem, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  crm: "CRM",
};

const CAPABILITIES: Record<ExternalSystem, string> = {
  gmail: "Draft and send email after approval",
  google_calendar: "Propose calendar changes after approval",
  google_drive: "Prepare document updates after approval",
  crm: "CRM write updates (deferred — not available yet)",
};

function sanitizeReason(reason: string | null): string {
  if (!reason) return "Not connected.";
  return reason
    .replace(/GOOGLE_[A-Z0-9_]+/gi, "Google credentials")
    .replace(/AI_COMPANY_[A-Z0-9_]+/gi, "feature setting")
    .replace(/process\.env\.[A-Z0-9_]+/gi, "configuration")
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/ya29\.[^\s]+/gi, "[redacted]")
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted]");
}

function classifyState(
  system: ExternalSystem,
  connected: boolean,
  reason: string | null
): ConnectorUiState {
  if (system === "crm") return "unavailable";
  const r = (reason ?? "").toLowerCase();
  if (!connected) {
    if (r.includes("disabled")) return "disabled";
    if (r.includes("permission") || r.includes("scope") || r.includes("denied")) {
      return "insufficient_permission";
    }
    if (
      r.includes("invalid") ||
      r.includes("credential") ||
      r.includes("expired") ||
      r.includes("revoked") ||
      r.includes("unauthorized")
    ) {
      return "invalid_credentials";
    }
    if (r.includes("verif")) return "verification_failed";
    return "disconnected";
  }
  return "connected";
}

/**
 * Sync verification suitable for onboarding UI.
 * Never reports connected without credentials. CRM is always unavailable/deferred.
 */
export function verifyOnboardingConnections(
  now = new Date().toISOString()
): OnboardingConnectionResult[] {
  const statuses = getConnectionStatusesSync();
  return (["gmail", "google_calendar", "google_drive", "crm"] as ExternalSystem[]).map(
    (system) => {
      const hit = statuses.find((s) => s.system === system);
      const connected = Boolean(hit?.connected) && system !== "crm";
      const reason =
        system === "crm"
          ? "CRM is deferred for this release. You can continue onboarding without it."
          : hit?.reason ?? null;
      const state = classifyState(system, connected, reason);
      return {
        system,
        label: LABELS[system],
        state,
        explanation: sanitizeReason(
          system === "crm"
            ? reason
            : connected
              ? `${LABELS[system]} is connected and ready for approved actions.`
              : reason
        ),
        capabilitySummary: connected
          ? CAPABILITIES[system]
          : system === "crm"
            ? CAPABILITIES.crm
            : "No live write capability until connected.",
        checkedAt: hit?.checkedAt ?? now,
        optional: system === "crm" || system === "google_drive",
      };
    }
  );
}

/** Hide internal terminology from any user-facing string. */
export function stripInternalTerminology(text: string): string {
  return text
    .replace(/Builder Runtime/gi, "AI Company")
    .replace(/\bruntime\b/gi, "system")
    .replace(/orchestrat\w*/gi, "coordination")
    .replace(/docs\/ai-team[^\s]*/gi, "[internal]")
    .replace(/process\.cwd\(\)/gi, "")
    .replace(/ConnectorSuite|DeferredCrm|MockConnector/gi, "connection");
}
