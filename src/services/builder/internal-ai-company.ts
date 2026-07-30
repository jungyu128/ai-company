/**
 * Internal AI Company feature gate (Builder Runtime HQ only).
 * Not a WorkPilot customer-facing flag.
 */

export function isInternalAiCompanyEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const raw = env.INTERNAL_AI_COMPANY_ENABLED;
  if (raw == null) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}
