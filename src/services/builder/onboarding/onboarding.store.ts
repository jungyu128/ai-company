/**
 * Workspace-scoped onboarding persistence.
 */

import {
  nowIso,
  readJsonFile,
  writeJsonFile,
  workspaceFile,
} from "../workspace/json-file";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import {
  defaultApprovalPolicy,
  defaultPrivacySettings,
  defaultWorkdayPreferences,
} from "./defaults";
import type { OnboardingState, OnboardingStepId } from "./types";
import { ONBOARDING_STEPS } from "./types";

export const ONBOARDING_FILE = "ai-company-onboarding.json";

function pathFor(repoRoot: string, workspaceId: string) {
  return workspaceFile(repoRoot, ONBOARDING_FILE, workspaceId);
}

export function emptyOnboardingState(workspaceId: string): OnboardingState {
  const now = nowIso();
  return {
    workspaceId,
    currentStep: "workspace",
    completedSteps: [],
    skippedOptionalSteps: [],
    connectionResults: [],
    readinessResults: [],
    approvalPolicy: defaultApprovalPolicy(),
    workdayPreferences: defaultWorkdayPreferences(),
    privacySettings: defaultPrivacySettings(),
    betaSafetyMode: true,
    startedAt: now,
    updatedAt: now,
    completedAt: null,
    completedBy: null,
  };
}

export function getOnboardingState(
  workspaceId = DEFAULT_WORKSPACE_ID,
  repoRoot = process.cwd()
): OnboardingState | null {
  const raw = readJsonFile<OnboardingState | null>(
    pathFor(repoRoot, workspaceId),
    null
  );
  if (!raw || typeof raw !== "object") return null;
  if (!raw.workspaceId) return null;
  return normalizeState(raw);
}

export function saveOnboardingState(
  state: OnboardingState,
  repoRoot = process.cwd()
): OnboardingState {
  const next = normalizeState({
    ...state,
    betaSafetyMode: true,
    updatedAt: nowIso(),
  });
  writeJsonFile(pathFor(repoRoot, next.workspaceId), next);
  return next;
}

/** Idempotent upsert — does not reset an existing in-progress/completed state. */
export function ensureOnboardingState(
  workspaceId: string,
  repoRoot = process.cwd()
): { state: OnboardingState; created: boolean } {
  const existing = getOnboardingState(workspaceId, repoRoot);
  if (existing) return { state: existing, created: false };
  const state = saveOnboardingState(emptyOnboardingState(workspaceId), repoRoot);
  return { state, created: true };
}

function normalizeState(raw: OnboardingState): OnboardingState {
  const completed = Array.isArray(raw.completedSteps)
    ? raw.completedSteps.filter((s): s is OnboardingStepId =>
        (ONBOARDING_STEPS as readonly string[]).includes(s)
      )
    : [];
  const skipped = Array.isArray(raw.skippedOptionalSteps)
    ? raw.skippedOptionalSteps.filter((s): s is OnboardingStepId =>
        (ONBOARDING_STEPS as readonly string[]).includes(s)
      )
    : [];
  const current =
    (ONBOARDING_STEPS as readonly string[]).includes(raw.currentStep)
      ? raw.currentStep
      : "workspace";

  return {
    ...emptyOnboardingState(raw.workspaceId || DEFAULT_WORKSPACE_ID),
    ...raw,
    currentStep: current,
    completedSteps: uniqueSteps(completed),
    skippedOptionalSteps: uniqueSteps(skipped),
    connectionResults: Array.isArray(raw.connectionResults)
      ? raw.connectionResults
      : [],
    readinessResults: Array.isArray(raw.readinessResults)
      ? raw.readinessResults
      : [],
    approvalPolicy: {
      ...defaultApprovalPolicy(),
      ...raw.approvalPolicy,
      externalWritesRequireApproval: true,
      destructiveActionsDisabled: true,
    },
    workdayPreferences: {
      ...defaultWorkdayPreferences(),
      ...raw.workdayPreferences,
      notificationPreferences: {
        ...defaultWorkdayPreferences().notificationPreferences,
        ...raw.workdayPreferences?.notificationPreferences,
      },
    },
    privacySettings: {
      ...defaultPrivacySettings(),
      ...raw.privacySettings,
      acceptedCategories:
        raw.privacySettings?.acceptedCategories ??
        defaultPrivacySettings().acceptedCategories,
      excludedSources: raw.privacySettings?.excludedSources ?? [],
    },
    betaSafetyMode: true,
  };
}

function uniqueSteps(steps: OnboardingStepId[]): OnboardingStepId[] {
  return [...new Set(steps)];
}
