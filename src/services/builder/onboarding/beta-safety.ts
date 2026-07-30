/**
 * Beta Safety Mode — always on in v9; cannot be disabled.
 * Guards external writes and forbids test adapters outside tests.
 */

export function isBetaSafetyModeEnabled(): true {
  return true;
}

/**
 * True when mock/test connectors may be constructed.
 * Always false in production — no env escape hatch can unlock mocks there.
 */
export function allowTestConnectors(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.NODE_ENV === "test") return true;
  if (env.AI_COMPANY_ALLOW_TEST_CONNECTORS === "1") return true;
  // tsx/node test runners often leave NODE_ENV unset
  if (!env.NODE_ENV) return true;
  return false;
}

export function assertNoTestAdaptersOutsideTests(
  mode: "live" | "test" | undefined,
  env: NodeJS.ProcessEnv = process.env
): void {
  if (mode === "test" && !allowTestConnectors(env)) {
    throw new Error(
      "Test adapters are forbidden outside tests. Use live connectors in production."
    );
  }
}

export type BetaSafetyGuarantees = {
  betaSafetyMode: true;
  externalWritesRequireApproval: true;
  destructiveActionsDisabled: true;
  executionVerificationRequired: true;
  noFakeSuccess: true;
  noHiddenMockFallback: true;
  staleApprovalRejectionRequired: true;
};

export function getBetaSafetyGuarantees(): BetaSafetyGuarantees {
  return {
    betaSafetyMode: true,
    externalWritesRequireApproval: true,
    destructiveActionsDisabled: true,
    executionVerificationRequired: true,
    noFakeSuccess: true,
    noHiddenMockFallback: true,
    staleApprovalRejectionRequired: true,
  };
}
