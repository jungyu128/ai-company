/**
 * Safe defaults for onboarding / launch readiness (v9).
 * Beta Safety Mode is always enabled and cannot be weakened.
 */

import type {
  ApprovalPolicySettings,
  PrivacyMemorySettings,
  WorkdayPreferenceSettings,
} from "./types";
import type { MemoryKind } from "../memory/types";

export const ALL_MEMORY_CATEGORIES: MemoryKind[] = [
  "recurring_customer",
  "recurring_meeting",
  "document_format",
  "ceo_approval_tendency",
  "preferred_assignment",
  "recurring_workflow",
  "business_priority",
  "template_usage",
  "successful_pattern",
  "failure_pattern",
];

export function defaultApprovalPolicy(): ApprovalPolicySettings {
  return {
    externalWritesRequireApproval: true,
    allowedApproverRoles: ["owner", "admin", "manager"],
    staleApprovalRejection: true,
    approvalExpirationHours: 72,
    secondApprovalHighRisk: false,
    destructiveActionsDisabled: true,
  };
}

export function defaultWorkdayPreferences(): WorkdayPreferenceSettings {
  return {
    timezone: "Asia/Seoul",
    defaultStartTime: "09:00",
    prioritySensitivity: "medium",
    includedDataSources: ["gmail", "google_calendar", "google_drive", "missions"],
    notificationPreferences: {
      pendingApprovals: true,
      workdayComplete: true,
      failedExecutions: true,
      newInsights: true,
    },
    endOfDayReport: true,
    weekendHandling: "skip",
  };
}

export function defaultPrivacySettings(): PrivacyMemorySettings {
  return {
    memoryEnabled: true,
    retentionDays: 90,
    confidenceDecay: true,
    acceptedCategories: [...ALL_MEMORY_CATEGORIES],
    excludedSources: [],
  };
}

export const STEP_META: Record<
  string,
  { label: string; optional: boolean }
> = {
  workspace: { label: "Workspace", optional: false },
  team: { label: "Team access", optional: false },
  employees: { label: "AI Employees", optional: false },
  connections: { label: "Connect systems", optional: true },
  connection_validate: { label: "Validate connections", optional: true },
  approvals: { label: "Approval rules", optional: false },
  workday: { label: "Workday preferences", optional: false },
  privacy: { label: "Privacy & memory", optional: false },
  readiness: { label: "Readiness check", optional: false },
  complete: { label: "Enter HQ", optional: false },
};
