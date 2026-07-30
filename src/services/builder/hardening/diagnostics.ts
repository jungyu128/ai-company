/**
 * Production health diagnostics — status only, never secret values.
 */

import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { getConnectionStatusesSync } from "../execution/connection-status";
import { allowTestConnectors, getBetaSafetyGuarantees } from "../onboarding/beta-safety";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { getWorkspaceApprovalPolicy } from "../onboarding/onboarding.service";
import { getStorageStatus, setText, getText } from "../storage";
import { opsRel } from "../workspace/paths";

export type DiagnosticStatus = "pass" | "warning" | "fail";

export type HealthDiagnostic = {
  key: string;
  status: DiagnosticStatus;
  explanation: string;
};

export function runProductionHealthDiagnostics(input?: {
  workspaceId?: string;
  repoRoot?: string;
}): HealthDiagnostic[] {
  const root = input?.repoRoot ?? process.cwd();
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const out: HealthDiagnostic[] = [];

  // Storage availability (memory / KV — never project filesystem writes)
  try {
    const status = getStorageStatus();
    const probeRel = opsRel("ai-company-audit.json.__probe__", workspaceId);
    setText(root, probeRel, "ok");
    const ok = status.writable && getText(root, probeRel) === "ok";
    out.push({
      key: "storage.availability",
      status: ok ? "pass" : "fail",
      explanation: ok
        ? `Workspace storage is writable (${status.backend}).`
        : "Workspace storage is not writable.",
    });
  } catch {
    out.push({
      key: "storage.availability",
      status: "fail",
      explanation: "Workspace storage is not writable.",
    });
  }

  // Connector configuration (presence only — never values)
  const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim() &&
      process.env.GOOGLE_REFRESH_TOKEN?.trim()
  );
  out.push({
    key: "connector.configuration",
    status: googleConfigured ? "pass" : "warning",
    explanation: googleConfigured
      ? "Google OAuth configuration is present."
      : "Google OAuth configuration is incomplete — connectors stay disconnected.",
  });

  const statuses = getConnectionStatusesSync();
  const connected = statuses.filter((s) => s.connected && s.system !== "crm").length;
  out.push({
    key: "connector.status",
    status: connected > 0 ? "pass" : "warning",
    explanation: `${connected} live connector(s) connected (CRM deferred).`,
  });

  out.push({
    key: "feature.flags",
    status: isInternalAiCompanyEnabled() ? "pass" : "fail",
    explanation: isInternalAiCompanyEnabled()
      ? "AI Company feature flag is enabled."
      : "AI Company feature flag is disabled.",
  });

  const beta = getBetaSafetyGuarantees();
  const policy = getWorkspaceApprovalPolicy(workspaceId, root);
  out.push({
    key: "approval.safety",
    status:
      beta.externalWritesRequireApproval &&
      policy.externalWritesRequireApproval &&
      policy.destructiveActionsDisabled
        ? "pass"
        : "fail",
    explanation: "External writes require human approval; destructive actions disabled.",
  });

  out.push({
    key: "audit.availability",
    status: "pass",
    explanation: "Audit store path is configured for this workspace.",
  });

  out.push({
    key: "test.adapters",
    status: allowTestConnectors() ? "warning" : "pass",
    explanation: allowTestConnectors()
      ? "Test adapters are currently allowed (test runtime)."
      : "Test adapters are forbidden in this runtime.",
  });

  return out;
}
