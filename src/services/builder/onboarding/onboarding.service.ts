/**
 * Onboarding façade — resumable, idempotent launch flow.
 */

import { AI_COMPANY_EMPLOYEES } from "../ai-company-employees";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { listMemories } from "../memory/memory.store";
import {
  createWorkspace,
  ensureDefaultWorkspace,
  listMembers,
  listWorkspaces,
} from "../workspace/workspace.store";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { STEP_META } from "./defaults";
import { verifyOnboardingConnections, stripInternalTerminology } from "./connection-verify";
import {
  ensureOnboardingState,
  getOnboardingState,
  saveOnboardingState,
  emptyOnboardingState,
} from "./onboarding.store";
import {
  clampApprovalPolicy,
  clampPrivacySettings,
  clampWorkdayPreferences,
  assertApprovalPolicySafe,
} from "./policy";
import { readinessSummary, runWorkspaceReadiness } from "./readiness";
import {
  ONBOARDING_STEPS,
  type ApprovalPolicySettings,
  type OnboardingPublicView,
  type OnboardingState,
  type OnboardingStepId,
  type PrivacyMemorySettings,
  type WorkdayPreferenceSettings,
} from "./types";

export type OnboardingActor = {
  userId: string;
  email: string;
  displayName: string;
};

function stepIndex(step: OnboardingStepId) {
  return ONBOARDING_STEPS.indexOf(step);
}

function nextStep(current: OnboardingStepId): OnboardingStepId {
  const i = stepIndex(current);
  return ONBOARDING_STEPS[Math.min(i + 1, ONBOARDING_STEPS.length - 1)];
}

function buildView(
  state: OnboardingState,
  options?: { legacyCompatible?: boolean }
): OnboardingPublicView {
  const summary = readinessSummary(state.readinessResults);
  const steps = ONBOARDING_STEPS.map((id) => {
    const meta = STEP_META[id];
    let status: "pending" | "current" | "completed" | "skipped" = "pending";
    if (state.skippedOptionalSteps.includes(id)) status = "skipped";
    else if (state.completedSteps.includes(id) || state.completedAt) {
      if (id === "complete" && state.completedAt) status = "completed";
      else if (id !== "complete" && state.completedSteps.includes(id)) status = "completed";
    }
    if (id === state.currentStep && !state.completedAt) status = "current";
    return {
      id,
      label: meta.label,
      optional: meta.optional,
      status,
    };
  });

  return {
    state,
    steps,
    employees: AI_COMPANY_EMPLOYEES.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      department: e.department,
      summary: e.summary,
      responsibilities: e.responsibilities,
    })),
    canEnterHq: Boolean(state.completedAt) || summary.canEnterHq,
    blockingFailures: summary.blockingFailures,
    warnings: summary.warnings,
    legacyCompatible: options?.legacyCompatible ?? false,
  };
}

/**
 * Start or resume onboarding for a workspace (idempotent).
 */
export function startOrResumeOnboarding(input: {
  actor: OnboardingActor;
  workspaceId?: string;
  workspaceName?: string;
  createNew?: boolean;
  /** Create a real onboarding record for the default workspace (opt-in). */
  forceStart?: boolean;
  repoRoot?: string;
}):
  | { ok: true; view: OnboardingPublicView; created: boolean }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "AI Company is disabled",
      status: 403,
    };
  }

  const root = input.repoRoot ?? process.cwd();
  ensureDefaultWorkspace({
    userId: input.actor.userId,
    email: input.actor.email,
    displayName: input.actor.displayName,
    repoRoot: root,
  });

  let workspaceId = input.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;

  if (input.createNew) {
    // Idempotent: if actor already owns a non-default workspace with same name, reuse
    const existingWs = listWorkspaces(root).find(
      (w) =>
        w.createdByUserId === input.actor.userId &&
        w.name === (input.workspaceName?.trim() || "AI Company workspace") &&
        w.id !== DEFAULT_WORKSPACE_ID
    );
    if (existingWs) {
      workspaceId = existingWs.id;
    } else {
      const ws = createWorkspace({
        name: input.workspaceName?.trim() || "AI Company workspace",
        ownerUserId: input.actor.userId,
        ownerEmail: input.actor.email,
        ownerDisplayName: input.actor.displayName,
        repoRoot: root,
      });
      workspaceId = ws.id;
    }
  }

  const existing = getOnboardingState(workspaceId, root);
  if (existing) {
    return { ok: true, view: buildView(existing), created: false };
  }

  // Backward compatible: do not auto-create incomplete onboarding for default
  // unless the caller explicitly force-starts the guided flow.
  if (workspaceId === DEFAULT_WORKSPACE_ID && !input.forceStart) {
    return {
      ok: true,
      view: getOnboardingView({ workspaceId, repoRoot: root }),
      created: false,
    };
  }

  const { state, created } = ensureOnboardingState(workspaceId, root);
  void listMembers(workspaceId, root);

  return { ok: true, view: buildView(state), created };
}

/**
 * Load onboarding for a workspace. Missing state on default = legacy compatible.
 */
export function getOnboardingView(input: {
  workspaceId?: string;
  repoRoot?: string;
}): OnboardingPublicView {
  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
  const existing = getOnboardingState(workspaceId, root);
  if (existing) return buildView(existing);

  // Backward compatible: default workspace without onboarding record can enter HQ
  if (workspaceId === DEFAULT_WORKSPACE_ID) {
    const legacy = emptyOnboardingState(DEFAULT_WORKSPACE_ID);
    legacy.completedAt = legacy.startedAt;
    legacy.completedBy = "legacy";
    legacy.currentStep = "complete";
    legacy.completedSteps = [...ONBOARDING_STEPS];
    legacy.readinessResults = runWorkspaceReadiness({
      workspaceId,
      state: legacy,
      repoRoot: root,
    });
    return buildView(legacy, { legacyCompatible: true });
  }

  const { state } = ensureOnboardingState(workspaceId, root);
  return buildView(state);
}

export function advanceOnboardingStep(input: {
  workspaceId: string;
  step: OnboardingStepId;
  actor: OnboardingActor;
  repoRoot?: string;
  skip?: boolean;
}):
  | { ok: true; view: OnboardingPublicView }
  | { ok: false; code: string; message: string; status: number } {
  const root = input.repoRoot ?? process.cwd();
  const { state } = ensureOnboardingState(input.workspaceId, root);

  if (state.completedAt) {
    return { ok: true, view: buildView(state) };
  }

  if (input.step !== state.currentStep) {
    // Idempotent: if already completed this step, allow resume from current
    if (state.completedSteps.includes(input.step)) {
      return { ok: true, view: buildView(state) };
    }
    return {
      ok: false,
      code: "STALE_STEP",
      message: "This onboarding step is out of date. Resume from the current step.",
      status: 409,
    };
  }

  const meta = STEP_META[input.step];
  if (input.skip && !meta.optional) {
    return {
      ok: false,
      code: "NOT_OPTIONAL",
      message: "This step cannot be skipped.",
      status: 400,
    };
  }

  let next = { ...state };

  if (input.step === "connections" || input.step === "connection_validate") {
    next.connectionResults = verifyOnboardingConnections();
  }

  if (input.step === "readiness") {
    next.readinessResults = runWorkspaceReadiness({
      workspaceId: input.workspaceId,
      state: next,
      repoRoot: root,
    });
  }

  if (input.skip) {
    next.skippedOptionalSteps = unique([
      ...next.skippedOptionalSteps,
      input.step,
    ]);
  } else {
    next.completedSteps = unique([...next.completedSteps, input.step]);
  }

  next.currentStep = nextStep(input.step);
  next = saveOnboardingState(next, root);
  return { ok: true, view: buildView(next) };
}

export function updateOnboardingSettings(input: {
  workspaceId: string;
  actor: OnboardingActor;
  approvalPolicy?: Partial<ApprovalPolicySettings>;
  workdayPreferences?: Partial<WorkdayPreferenceSettings>;
  privacySettings?: Partial<PrivacyMemorySettings>;
  /** Ignored — always remains true. */
  betaSafetyMode?: boolean;
  repoRoot?: string;
}):
  | { ok: true; view: OnboardingPublicView }
  | { ok: false; code: string; message: string; status: number } {
  const root = input.repoRoot ?? process.cwd();
  const { state } = ensureOnboardingState(input.workspaceId, root);

  if (input.betaSafetyMode === false) {
    return {
      ok: false,
      code: "BETA_LOCKED",
      message: "Beta Safety Mode cannot be disabled in this release.",
      status: 400,
    };
  }

  try {
    const approvalPolicy = clampApprovalPolicy({
      ...state.approvalPolicy,
      ...input.approvalPolicy,
    });
    assertApprovalPolicySafe(approvalPolicy);
    const next = saveOnboardingState(
      {
        ...state,
        approvalPolicy,
        workdayPreferences: clampWorkdayPreferences({
          ...state.workdayPreferences,
          ...input.workdayPreferences,
        }),
        privacySettings: clampPrivacySettings({
          ...state.privacySettings,
          ...input.privacySettings,
        }),
        betaSafetyMode: true,
      },
      root
    );
    return { ok: true, view: buildView(next) };
  } catch (err) {
    return {
      ok: false,
      code: "INVALID_SETTINGS",
      message: stripInternalTerminology(
        err instanceof Error ? err.message : "Invalid settings"
      ),
      status: 400,
    };
  }
}

export function runOnboardingReadiness(input: {
  workspaceId: string;
  repoRoot?: string;
}):
  | { ok: true; view: OnboardingPublicView }
  | { ok: false; code: string; message: string; status: number } {
  const root = input.repoRoot ?? process.cwd();
  const { state } = ensureOnboardingState(input.workspaceId, root);
  const results = runWorkspaceReadiness({
    workspaceId: input.workspaceId,
    state,
    repoRoot: root,
  });
  const next = saveOnboardingState(
    {
      ...state,
      readinessResults: results,
      connectionResults: state.connectionResults.length
        ? state.connectionResults
        : verifyOnboardingConnections(),
    },
    root
  );
  return { ok: true, view: buildView(next) };
}

export function completeOnboarding(input: {
  workspaceId: string;
  actor: OnboardingActor;
  repoRoot?: string;
}):
  | { ok: true; view: OnboardingPublicView }
  | {
      ok: false;
      code: string;
      message: string;
      status: number;
      view?: OnboardingPublicView;
    } {
  const root = input.repoRoot ?? process.cwd();
  const { state } = ensureOnboardingState(input.workspaceId, root);

  if (state.completedAt) {
    return { ok: true, view: buildView(state) };
  }

  const readinessResults = runWorkspaceReadiness({
    workspaceId: input.workspaceId,
    state,
    repoRoot: root,
  });
  const summary = readinessSummary(readinessResults);
  if (!summary.canEnterHq) {
    const next = saveOnboardingState(
      {
        ...state,
        readinessResults,
        currentStep: "readiness",
      },
      root
    );
    return {
      ok: false,
      code: "BLOCKING_READINESS",
      message:
        "Onboarding cannot complete while blocking readiness checks fail. Fix the issues and try again.",
      status: 409,
      view: buildView(next),
    };
  }

  const next = saveOnboardingState(
    {
      ...state,
      readinessResults,
      completedSteps: unique([...state.completedSteps, "readiness", "complete"]),
      currentStep: "complete",
      completedAt: new Date().toISOString(),
      completedBy: input.actor.userId,
      betaSafetyMode: true,
    },
    root
  );
  return { ok: true, view: buildView(next) };
}

export function exportMemorySummary(input: {
  workspaceId: string;
  repoRoot?: string;
}): {
  enabled: boolean;
  count: number;
  categories: string[];
  items: Array<{ title: string; insight: string; confidence: number; status: string }>;
} {
  const root = input.repoRoot ?? process.cwd();
  const state = getOnboardingState(input.workspaceId, root);
  const privacy = state?.privacySettings ?? clampPrivacySettings({});
  const memories = listMemories(root, input.workspaceId);
  return {
    enabled: privacy.memoryEnabled,
    count: memories.length,
    categories: privacy.acceptedCategories,
    items: memories.slice(0, 50).map((m) => ({
      title: m.title,
      insight: m.insight,
      confidence: m.confidence,
      status: m.ceoStatus,
    })),
  };
}

export function getWorkspacePrivacySettings(
  workspaceId: string,
  repoRoot = process.cwd()
): PrivacyMemorySettings {
  const state = getOnboardingState(workspaceId, repoRoot);
  return state?.privacySettings ?? clampPrivacySettings({});
}

export function getWorkspaceApprovalPolicy(
  workspaceId: string,
  repoRoot = process.cwd()
): ApprovalPolicySettings {
  const state = getOnboardingState(workspaceId, repoRoot);
  return clampApprovalPolicy(state?.approvalPolicy);
}

export function getWorkspaceWorkdayPreferences(
  workspaceId: string,
  repoRoot = process.cwd()
): WorkdayPreferenceSettings {
  const state = getOnboardingState(workspaceId, repoRoot);
  return clampWorkdayPreferences(state?.workdayPreferences);
}

export function persistConnectionVerification(input: {
  workspaceId: string;
  repoRoot?: string;
}): OnboardingPublicView {
  const root = input.repoRoot ?? process.cwd();
  const { state } = ensureOnboardingState(input.workspaceId, root);
  const next = saveOnboardingState(
    {
      ...state,
      connectionResults: verifyOnboardingConnections(),
    },
    root
  );
  return buildView(next);
}

function unique(steps: OnboardingStepId[]): OnboardingStepId[] {
  return [...new Set(steps)];
}

export {
  verifyOnboardingConnections,
  runWorkspaceReadiness,
  readinessSummary,
  clampApprovalPolicy,
  clampPrivacySettings,
  clampWorkdayPreferences,
  getOnboardingState,
  ensureOnboardingState,
};
