/**
 * AI Company Onboarding & Launch Readiness v9 — contracts.
 * Product-facing only; no internal architecture terms.
 */

import type { WorkspaceHumanRole } from "../workspace/types";
import type { ExternalSystem } from "../execution/types";
import type { MemoryKind } from "../memory/types";

export const ONBOARDING_STEPS = [
  "workspace",
  "team",
  "employees",
  "connections",
  "connection_validate",
  "approvals",
  "workday",
  "privacy",
  "readiness",
  "complete",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number];

export type ConnectorUiState =
  | "connected"
  | "disconnected"
  | "disabled"
  | "insufficient_permission"
  | "invalid_credentials"
  | "verification_failed"
  | "unavailable";

export type OnboardingConnectionResult = {
  system: ExternalSystem;
  label: string;
  state: ConnectorUiState;
  /** User-facing explanation — never secrets. */
  explanation: string;
  /** Short live capability summary when connected. */
  capabilitySummary: string;
  checkedAt: string;
  optional: boolean;
};

export type ReadinessStatus = "pass" | "warning" | "fail" | "unavailable";

export type ReadinessCheckResult = {
  key: string;
  status: ReadinessStatus;
  explanation: string;
  remediation: string;
  blocking: boolean;
};

export type ApprovalPolicySettings = {
  /** Locked true under Beta Safety Mode — cannot enable auto-writes. */
  externalWritesRequireApproval: true;
  allowedApproverRoles: WorkspaceHumanRole[];
  staleApprovalRejection: boolean;
  /** Hours after which pending approvals expire (0 = no expiration). */
  approvalExpirationHours: number;
  secondApprovalHighRisk: boolean;
  /** Locked true under Beta Safety Mode. */
  destructiveActionsDisabled: true;
};

export type WorkdayPreferenceSettings = {
  timezone: string;
  defaultStartTime: string;
  prioritySensitivity: "low" | "medium" | "high";
  includedDataSources: Array<"gmail" | "google_calendar" | "google_drive" | "crm" | "missions">;
  notificationPreferences: {
    pendingApprovals: boolean;
    workdayComplete: boolean;
    failedExecutions: boolean;
    newInsights: boolean;
  };
  endOfDayReport: boolean;
  weekendHandling: "skip" | "light" | "full";
};

export type PrivacyMemorySettings = {
  memoryEnabled: boolean;
  retentionDays: number;
  confidenceDecay: boolean;
  acceptedCategories: MemoryKind[];
  excludedSources: string[];
};

export type OnboardingState = {
  workspaceId: string;
  currentStep: OnboardingStepId;
  completedSteps: OnboardingStepId[];
  skippedOptionalSteps: OnboardingStepId[];
  connectionResults: OnboardingConnectionResult[];
  readinessResults: ReadinessCheckResult[];
  approvalPolicy: ApprovalPolicySettings;
  workdayPreferences: WorkdayPreferenceSettings;
  privacySettings: PrivacyMemorySettings;
  /** Always true in v9 — cannot be disabled. */
  betaSafetyMode: true;
  startedAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
};

export type OnboardingPublicView = {
  state: OnboardingState;
  steps: Array<{
    id: OnboardingStepId;
    label: string;
    optional: boolean;
    status: "pending" | "current" | "completed" | "skipped";
  }>;
  employees: Array<{
    id: string;
    name: string;
    role: string;
    department: string;
    summary: string;
    responsibilities: string[];
  }>;
  canEnterHq: boolean;
  blockingFailures: ReadinessCheckResult[];
  warnings: ReadinessCheckResult[];
  legacyCompatible: boolean;
};
