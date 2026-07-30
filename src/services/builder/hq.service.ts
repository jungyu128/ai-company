/**
 * Next.js adapter for AI Company HQ + CEO Advisor.
 *
 * Turbopack cannot resolve `import(pathToFileURL(...).href)` ("expression is too dynamic").
 * This module uses a static literal import of the Builder Runtime FS loader instead.
 * Runtime libs stay pure (node:fs + static relative imports among themselves).
 *
 * Display timestamps are pre-formatted here so client components never call Intl/Date formatters.
 */

import { loadAiCompanyHqFromDisk } from "../../../docs/ai-team/runtime/lib/runtime-hq-fs.mjs";
import { formatHqDateTimeDisplay } from "./format-hq-display";
import "./storage"; // register storage bridge for runtime-hq-fs.mjs

export type BuilderCeoAdvisor = {
  generatedAt: string;
  lastVisitAt: string | null;
  /** Server-preformatted lastVisitAt for SSR-safe render. */
  lastVisitDisplay: string | null;
  urgency: "critical" | "high" | "watch" | "clear";
  headline: string;
  sinceLastVisit: string;
  requiresAttention: string;
  whyItMatters: string;
  recommendedAction: string;
  expectedOutcome: string;
  risksIfIgnored: string;
  evidence: string[];
};

export type BuilderHqSnapshot = {
  generatedAt: string;
  /** Server-preformatted generatedAt for SSR-safe render. */
  generatedAtDisplay: string;
  sprint: { id: string; name: string; goal: string; status: string } | null;
  activeAgent: string;
  currentTask: { id: string; title: string; status: string; owner: string } | null;
  pendingCeoApprovals: Array<{ id: string; title: string; gate: string; phrase: string }>;
  blockedItems: string[];
  recentDecisions: Array<{ id: string; date: string; summary: string; decidedBy: string }>;
  engineeringHealth: {
    openDebt: number;
    openImprovements: number;
    blocked: number;
    waitingCeo: number;
    note: string;
  };
  latestRelease: { id: string; title: string; date: string; path: string } | null;
  releaseHistory: Array<{ id: string; title: string; date: string; path: string }>;
  teamStatus: Array<{ role: string; state: string; currentTask: string | null }>;
  activityFeed: Array<{
    id: string;
    timestamp: string;
    actorType: string;
    actorId: string;
    taskId: string;
    action: string;
    rationale: string;
  }>;
  recommendedNextMission: string;
  ceoAdvisor?: BuilderCeoAdvisor;
};

type HqLoadResult = {
  ok: boolean;
  value?: Omit<BuilderHqSnapshot, "generatedAtDisplay"> & {
    ceoAdvisor?: Omit<BuilderCeoAdvisor, "lastVisitDisplay">;
  };
  message?: string;
};

function attachDisplayFields(hq: HqLoadResult["value"]): BuilderHqSnapshot {
  if (!hq) {
    throw new Error("Failed to load AI Company HQ");
  }

  const generatedAtDisplay = formatHqDateTimeDisplay(hq.generatedAt);
  const ceoAdvisor = hq.ceoAdvisor
    ? {
        ...hq.ceoAdvisor,
        lastVisitDisplay: hq.ceoAdvisor.lastVisitAt
          ? formatHqDateTimeDisplay(hq.ceoAdvisor.lastVisitAt)
          : null,
      }
    : undefined;

  return {
    ...hq,
    generatedAtDisplay,
    ceoAdvisor,
  };
}

/**
 * Load AI Company HQ + CEO Advisor from Builder Runtime docs on disk.
 * CEO Advisor is attached inside `loadAiCompanyHqFromDisk` (runtime-hq-fs.mjs).
 * Display strings are attached here (server only).
 */
export async function getBuilderHqSnapshot(options?: {
  lastVisitAt?: string | null;
  repoRoot?: string;
}): Promise<BuilderHqSnapshot> {
  const result = loadAiCompanyHqFromDisk(options?.repoRoot ?? process.cwd(), {
    lastVisitAt: options?.lastVisitAt ?? null,
  }) as HqLoadResult;

  if (!result?.ok || !result.value) {
    throw new Error(result?.message ?? "Failed to load AI Company HQ");
  }

  return attachDisplayFields(result.value);
}
