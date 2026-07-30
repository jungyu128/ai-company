/**
 * GitHub integration safety rules for AI Company → WorkPilot.
 * - never merge automatically
 * - never push directly to main
 * - write actions require explicit owner approval
 */

import {
  assertSafeFeatureBranch,
  getWorkpilotGithubConfig,
} from "./github-config";

export type OwnerWriteApproval = {
  /** Must be literally true from an authenticated owner action. */
  ownerApproved: true;
  /** Human-readable reason recorded in audits. */
  reason: string;
};

export function requireOwnerWriteApproval(
  approval: OwnerWriteApproval | null | undefined
): asserts approval is OwnerWriteApproval {
  if (!approval || approval.ownerApproved !== true) {
    throw new Error("Owner approval required before any GitHub write action");
  }
  if (!approval.reason?.trim()) {
    throw new Error("Write approval reason is required");
  }
}

export function assertWriteTargetBranch(branch: string): void {
  const { defaultBranch } = getWorkpilotGithubConfig();
  assertSafeFeatureBranch(branch, defaultBranch);
}

/** Merge is intentionally unsupported. */
export function refuseMerge(): never {
  throw new Error("Automatic merge is disabled. Create a PR and merge manually on GitHub.");
}
