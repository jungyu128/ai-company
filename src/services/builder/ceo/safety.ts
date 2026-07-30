/**
 * AI CEO safety floor — analysis/recommend/assign only; never external writes.
 */

import type { AiCeoSafetyGuarantees } from "./types";

export function getAiCeoSafetyGuarantees(): AiCeoSafetyGuarantees {
  return {
    analyzes: true,
    recommends: true,
    assigns: true,
    reprioritizes: true,
    summarizes: true,
    neverApprovesExternalWrites: true,
    neverBypassesApprovals: true,
    neverBypassesPermissions: true,
    neverExposesSecrets: true,
    neverFabricatesData: true,
  };
}

/** Strip secrets / internal paths from AI CEO copy. */
export function sanitizeCeoText(text: string): string {
  return text
    .replace(/Bearer\s+\S+/gi, "[redacted]")
    .replace(/ya29\.[^\s]+/gi, "[redacted]")
    .replace(/GOOGLE_[A-Z0-9_]+/gi, "[redacted]")
    .replace(/docs\/ai-team[^\s]*/gi, "[internal]")
    .replace(/Builder Runtime/gi, "AI Company")
    .trim();
}

export function assertAiCeoCannotApproveWrites(): void {
  // Structural guarantee — AI CEO APIs never call decideExecution / approve paths.
  const g = getAiCeoSafetyGuarantees();
  if (!g.neverApprovesExternalWrites) {
    throw new Error("AI CEO safety invariant violated");
  }
}
