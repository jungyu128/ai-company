/**
 * Clamp / validate settings so safety floors are never weakened.
 */

import type { WorkspaceHumanRole } from "../workspace/types";
import type { MemoryKind } from "../memory/types";
import { ALL_MEMORY_CATEGORIES } from "./defaults";
import type {
  ApprovalPolicySettings,
  PrivacyMemorySettings,
  WorkdayPreferenceSettings,
} from "./types";
import { defaultApprovalPolicy, defaultPrivacySettings, defaultWorkdayPreferences } from "./defaults";

const ROLES: WorkspaceHumanRole[] = [
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
];

export function clampApprovalPolicy(
  input: Partial<ApprovalPolicySettings> | null | undefined
): ApprovalPolicySettings {
  const base = defaultApprovalPolicy();
  const roles = (input?.allowedApproverRoles ?? base.allowedApproverRoles).filter(
    (r): r is WorkspaceHumanRole => ROLES.includes(r as WorkspaceHumanRole)
  );
  // Approvers must include at least owner or admin or manager — never empty
  const allowed =
    roles.filter((r) => r === "owner" || r === "admin" || r === "manager").length > 0
      ? roles.filter((r) => r !== "viewer")
      : [...base.allowedApproverRoles];

  return {
    externalWritesRequireApproval: true,
    destructiveActionsDisabled: true,
    allowedApproverRoles: allowed,
    // Beta Safety: stale rejection cannot be disabled
    staleApprovalRejection: true,
    approvalExpirationHours: clampInt(
      input?.approvalExpirationHours ?? base.approvalExpirationHours,
      0,
      720
    ),
    secondApprovalHighRisk: Boolean(input?.secondApprovalHighRisk),
  };
}

export function clampWorkdayPreferences(
  input: Partial<WorkdayPreferenceSettings> | null | undefined
): WorkdayPreferenceSettings {
  const base = defaultWorkdayPreferences();
  const sensitivity = input?.prioritySensitivity;
  return {
    timezone: (input?.timezone ?? base.timezone).trim() || base.timezone,
    defaultStartTime: /^\d{2}:\d{2}$/.test(input?.defaultStartTime ?? "")
      ? (input!.defaultStartTime as string)
      : base.defaultStartTime,
    prioritySensitivity:
      sensitivity === "low" || sensitivity === "medium" || sensitivity === "high"
        ? sensitivity
        : base.prioritySensitivity,
    includedDataSources:
      Array.isArray(input?.includedDataSources) && input!.includedDataSources.length
        ? input!.includedDataSources
        : base.includedDataSources,
    notificationPreferences: {
      ...base.notificationPreferences,
      ...input?.notificationPreferences,
    },
    endOfDayReport: input?.endOfDayReport !== false,
    weekendHandling:
      input?.weekendHandling === "light" ||
      input?.weekendHandling === "full" ||
      input?.weekendHandling === "skip"
        ? input.weekendHandling
        : base.weekendHandling,
  };
}

export function clampPrivacySettings(
  input: Partial<PrivacyMemorySettings> | null | undefined
): PrivacyMemorySettings {
  const base = defaultPrivacySettings();
  const cats = Array.isArray(input?.acceptedCategories)
    ? input!.acceptedCategories.filter((c): c is MemoryKind =>
        ALL_MEMORY_CATEGORIES.includes(c)
      )
    : base.acceptedCategories;
  return {
    memoryEnabled: input?.memoryEnabled !== false,
    retentionDays: clampInt(input?.retentionDays ?? base.retentionDays, 7, 730),
    confidenceDecay: input?.confidenceDecay !== false,
    acceptedCategories: cats.length ? cats : base.acceptedCategories,
    excludedSources: Array.isArray(input?.excludedSources)
      ? input!.excludedSources.map(String).slice(0, 50)
      : [],
  };
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Reject any attempt to enable automatic external writes. */
export function assertApprovalPolicySafe(policy: ApprovalPolicySettings): void {
  if (policy.externalWritesRequireApproval !== true) {
    throw new Error("External writes must always require approval.");
  }
  if (policy.destructiveActionsDisabled !== true) {
    throw new Error("Destructive actions must remain disabled.");
  }
}
