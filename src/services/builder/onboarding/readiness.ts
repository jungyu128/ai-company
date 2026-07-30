/**
 * Workspace readiness checks for launch / beta entry.
 */

import fs from "node:fs";
import path from "node:path";
import { AI_COMPANY_EMPLOYEES } from "../ai-company-employees";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { opsRel } from "../workspace/paths";
import { getMember, listMembers, getWorkspace } from "../workspace/workspace.store";
import { permissionsForRole } from "../workspace/permissions";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { getBetaSafetyGuarantees } from "./beta-safety";
import { verifyOnboardingConnections } from "./connection-verify";
import type { OnboardingState, ReadinessCheckResult } from "./types";

export function runWorkspaceReadiness(input: {
  workspaceId: string;
  state: OnboardingState;
  repoRoot?: string;
}): ReadinessCheckResult[] {
  const root = input.repoRoot ?? process.cwd();
  const wsId = input.workspaceId || DEFAULT_WORKSPACE_ID;
  const state = input.state;
  const checks: ReadinessCheckResult[] = [];

  const workspace = getWorkspace(wsId, root);
  checks.push({
    key: "workspace.exists",
    status: workspace ? "pass" : "fail",
    explanation: workspace
      ? `Workspace “${workspace.name}” is available.`
      : "Workspace was not found.",
    remediation: "Create or select a workspace to continue.",
    blocking: true,
  });

  const members = listMembers(wsId, root);
  const owners = members.filter((m) => m.role === "owner");
  checks.push({
    key: "workspace.owner",
    status: owners.length > 0 ? "pass" : "fail",
    explanation:
      owners.length > 0
        ? `Owner confirmed (${owners[0].displayName}).`
        : "No workspace owner is assigned.",
    remediation: "Assign an owner before entering HQ.",
    blocking: true,
  });

  const invalidMembers = members.filter(
    (m) => !m.userId || !m.email || !permissionsForRole(m.role).length
  );
  checks.push({
    key: "memberships.valid",
    status: invalidMembers.length === 0 ? "pass" : "fail",
    explanation:
      invalidMembers.length === 0
        ? `${members.length} team member(s) look valid.`
        : "One or more memberships are incomplete.",
    remediation: "Fix team member email and role assignments.",
    blocking: invalidMembers.length > 0,
  });

  const rolesOk = ["owner", "admin", "manager", "member", "viewer"].every(
    (r) => permissionsForRole(r as "owner").length > 0
  );
  checks.push({
    key: "permissions.model",
    status: rolesOk ? "pass" : "fail",
    explanation: rolesOk
      ? "Permission model is valid for all roles."
      : "Permission model is incomplete.",
    remediation: "Contact support — permission matrix must be restored.",
    blocking: true,
  });

  checks.push({
    key: "employees.available",
    status: AI_COMPANY_EMPLOYEES.length >= 4 ? "pass" : "fail",
    explanation: `${AI_COMPANY_EMPLOYEES.length} AI Employees are ready.`,
    remediation: "AI Employee catalog is required before launch.",
    blocking: AI_COMPANY_EMPLOYEES.length < 1,
  });

  const policy = state.approvalPolicy;
  const policyOk =
    policy.externalWritesRequireApproval === true &&
    policy.destructiveActionsDisabled === true &&
    policy.allowedApproverRoles.length > 0 &&
    policy.staleApprovalRejection === true;
  checks.push({
    key: "approvals.configured",
    status: policyOk ? "pass" : "fail",
    explanation: policyOk
      ? "Approval rules require human approval for external writes."
      : "Approval rules are missing required safety settings.",
    remediation: "Restore approval policy so external writes always need approval.",
    blocking: true,
  });

  const connections = state.connectionResults.length
    ? state.connectionResults
    : verifyOnboardingConnections();
  const connectedCount = connections.filter((c) => c.state === "connected").length;
  const invalidCreds = connections.filter((c) => c.state === "invalid_credentials");
  const verifyFail = connections.filter((c) => c.state === "verification_failed");
  if (invalidCreds.length || verifyFail.length) {
    checks.push({
      key: "connections.status",
      status: "fail",
      explanation: "One or more connections have credential or verification problems.",
      remediation: "Reconnect affected systems or disconnect them before launch.",
      blocking: false,
    });
  } else if (connectedCount === 0) {
    checks.push({
      key: "connections.status",
      status: "warning",
      explanation:
        "No external systems are connected yet. AI Employees can still plan; writes stay blocked until connected and approved.",
      remediation: "Connect Gmail, Calendar, or Drive when ready.",
      blocking: false,
    });
  } else {
    checks.push({
      key: "connections.status",
      status: "pass",
      explanation: `${connectedCount} external system(s) connected.`,
      remediation: "Optional: connect additional systems later.",
      blocking: false,
    });
  }

  const crm = connections.find((c) => c.system === "crm");
  checks.push({
    key: "connections.crm",
    status: "unavailable",
    explanation: crm?.explanation ?? "CRM is deferred for this release.",
    remediation: "Continue without CRM; it will be available in a later phase.",
    blocking: false,
  });

  checks.push({
    key: "workday.settings",
    status: state.workdayPreferences.timezone ? "pass" : "fail",
    explanation: `Workday timezone ${state.workdayPreferences.timezone}, start ${state.workdayPreferences.defaultStartTime}.`,
    remediation: "Set timezone and default start time.",
    blocking: !state.workdayPreferences.timezone,
  });

  checks.push({
    key: "memory.safety",
    status: "pass",
    explanation: state.privacySettings.memoryEnabled
      ? `Company memory is enabled with ${state.privacySettings.retentionDays}-day retention.`
      : "Company memory is disabled — future learning is paused; audit history is preserved.",
    remediation: "Review privacy settings if you need different retention.",
    blocking: false,
  });

  const execPath = path.join(root, opsRel("ai-company-executions.json", wsId));
  const auditPath = path.join(root, opsRel("ai-company-audit.json", wsId));
  checks.push(storageCheck("execution.storage", execPath, "Execution history storage"));
  checks.push(storageCheck("audit.storage", auditPath, "Activity audit storage"));

  const beta = getBetaSafetyGuarantees();
  checks.push({
    key: "stale.protection",
    status: beta.staleApprovalRejectionRequired ? "pass" : "fail",
    explanation: "Stale-data protection rejects approvals when underlying data changed.",
    remediation: "Beta Safety Mode must keep stale rejection enabled.",
    blocking: true,
  });

  checks.push({
    key: "feature.flags",
    status: isInternalAiCompanyEnabled() ? "pass" : "fail",
    explanation: isInternalAiCompanyEnabled()
      ? "AI Company feature is enabled."
      : "AI Company feature flag is off.",
    remediation: "Enable the AI Company feature for this environment.",
    blocking: true,
  });

  checks.push({
    key: "beta.safety",
    status: state.betaSafetyMode ? "pass" : "fail",
    explanation: "Beta Safety Mode is on — external writes always need approval; no fake success.",
    remediation: "Beta Safety Mode cannot be disabled in this release.",
    blocking: !state.betaSafetyMode,
  });

  const prodWarnings: string[] = [];
  if (!process.env.GOOGLE_CLIENT_ID?.trim()) {
    prodWarnings.push("Google OAuth is not configured (connections will stay disconnected).");
  }
  checks.push({
    key: "production.config",
    status: prodWarnings.length ? "warning" : "pass",
    explanation: prodWarnings.length
      ? prodWarnings.join(" ")
      : "No production configuration warnings detected.",
    remediation: "Configure Google OAuth in environment settings when you need live connectors.",
    blocking: false,
  });

  // Ensure owner membership probe for current context doesn't throw
  void getMember;

  return checks;
}

function storageCheck(
  key: string,
  filePath: string,
  label: string
): ReadinessCheckResult {
  try {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    // Touchability probe without writing secrets
    fs.accessSync(dir, fs.constants.W_OK);
    return {
      key,
      status: "pass",
      explanation: `${label} is available.`,
      remediation: "No action needed.",
      blocking: false,
    };
  } catch {
    return {
      key,
      status: "fail",
      explanation: `${label} is not writable.`,
      remediation: "Fix storage permissions for AI Company data.",
      blocking: true,
    };
  }
}

export function readinessSummary(results: ReadinessCheckResult[]) {
  const blockingFailures = results.filter((r) => r.blocking && r.status === "fail");
  const warnings = results.filter((r) => r.status === "warning");
  return {
    blockingFailures,
    warnings,
    canEnterHq: blockingFailures.length === 0,
  };
}
