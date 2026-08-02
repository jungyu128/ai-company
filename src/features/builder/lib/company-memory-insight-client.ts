import type { CompanyMemory } from "@/services/builder/memory/types";
import {
  applyInsightActionOptimistic,
  type InsightAction,
  type MemoryInsightSnapshot,
} from "@/features/builder/lib/company-memory-insight-actions";

export type InsightActionRequest =
  | { action: "reset"; workspaceId?: string }
  | { action: InsightAction; memoryId: string; workspaceId?: string };

export type InsightActionApiResponse = {
  ok?: boolean;
  error?: string;
  memory?: CompanyMemory;
  dashboard?: MemoryInsightSnapshot;
};

export type AppliedInsightDecision = {
  memoryId: string;
  action: InsightAction;
};

export function buildInsightActionUrl(workspaceId: string): string {
  const id = workspaceId.trim() || "default";
  return `/api/builder/hq/memory?workspaceId=${encodeURIComponent(id)}`;
}

/** Normalize GET/POST dashboard payloads into the panel snapshot shape. */
export function snapshotFromDashboardPayload(
  dashboard: Partial<MemoryInsightSnapshot> | null | undefined
): MemoryInsightSnapshot {
  return {
    newInsights: dashboard?.newInsights ?? [],
    learnedPreferences: dashboard?.learnedPreferences ?? [],
    recentlyUpdated: dashboard?.recentlyUpdated ?? [],
  };
}

/**
 * Live Company Memory dashboard (avoids acting on stale SSR insight IDs).
 */
export async function fetchInsightDashboard(
  workspaceId: string,
  init?: RequestInit
): Promise<MemoryInsightSnapshot | null> {
  try {
    const res = await fetch(buildInsightActionUrl(workspaceId), {
      method: "GET",
      ...init,
      headers: {
        "x-ai-company-workspace": workspaceId.trim() || "default",
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as InsightActionApiResponse &
      Partial<MemoryInsightSnapshot>;
    if (!data || data.ok === false) return null;
    return snapshotFromDashboardPayload(data);
  } catch {
    return null;
  }
}

export function buildInsightActionRequest(
  action: InsightAction | "reset",
  memoryId?: string,
  workspaceId?: string
): InsightActionRequest {
  const ws =
    typeof workspaceId === "string" && workspaceId.trim()
      ? workspaceId.trim()
      : undefined;
  if (action === "reset") {
    return ws ? { action: "reset", workspaceId: ws } : { action: "reset" };
  }
  if (!memoryId) {
    throw new Error("memoryId required for insight actions");
  }
  return ws ? { action, memoryId, workspaceId: ws } : { action, memoryId };
}

/**
 * Apply API result to local snapshot.
 * On failure, returns previous (rollback). On success, prefers server dashboard.
 */
export function resolveInsightActionResult(input: {
  previous: MemoryInsightSnapshot;
  optimistic: MemoryInsightSnapshot;
  response: InsightActionApiResponse | null;
  ok: boolean;
}): { snapshot: MemoryInsightSnapshot; rolledBack: boolean } {
  if (!input.ok || !input.response?.ok) {
    return { snapshot: input.previous, rolledBack: true };
  }
  if (input.response.dashboard) {
    return {
      snapshot: snapshotFromDashboardPayload(input.response.dashboard),
      rolledBack: false,
    };
  }
  return { snapshot: input.optimistic, rolledBack: false };
}

/**
 * Re-apply confirmed decisions onto SSR props.
 * Prevents a slow router.refresh() from resurrecting Pending insights.
 */
export function mergePropsWithAppliedDecisions(
  props: MemoryInsightSnapshot,
  applied: AppliedInsightDecision[]
): MemoryInsightSnapshot {
  let snap: MemoryInsightSnapshot = {
    newInsights: [...props.newInsights],
    learnedPreferences: [...props.learnedPreferences],
    recentlyUpdated: [...props.recentlyUpdated],
  };
  for (const d of applied) {
    if (snap.newInsights.some((m) => m.id === d.memoryId)) {
      snap = applyInsightActionOptimistic(snap, d.memoryId, d.action);
      continue;
    }
    if (d.action === "remove") {
      snap = {
        newInsights: snap.newInsights.filter((m) => m.id !== d.memoryId),
        learnedPreferences: snap.learnedPreferences.filter(
          (m) => m.id !== d.memoryId
        ),
        recentlyUpdated: snap.recentlyUpdated.filter((m) => m.id !== d.memoryId),
      };
    }
  }
  return snap;
}

export function recordAppliedDecision(
  applied: AppliedInsightDecision[],
  memoryId: string,
  action: InsightAction
): AppliedInsightDecision[] {
  return [
    ...applied.filter((d) => d.memoryId !== memoryId),
    { memoryId, action },
  ];
}

/** Keep only decisions that SSR props have not caught up with yet. */
export function pruneAppliedDecisions(
  applied: AppliedInsightDecision[],
  props: MemoryInsightSnapshot
): AppliedInsightDecision[] {
  return applied.filter((d) =>
    props.newInsights.some((m) => m.id === d.memoryId)
  );
}

export function insightRemovedFromPending(
  snap: MemoryInsightSnapshot,
  memoryId: string
): boolean {
  return !snap.newInsights.some((m) => m.id === memoryId);
}

export function samplePendingInsight(
  overrides?: Partial<CompanyMemory>
): CompanyMemory {
  return {
    id: "mem-pending-1",
    kind: "successful_pattern",
    title: "Prefer concise previews",
    insight: "Keep CEO previews short",
    confidence: 70,
    evidenceCount: 2,
    sourceRefs: ["mission:a"],
    expiration: { softExpireDays: 30, hardExpireDays: 90 },
    ceoStatus: "pending",
    patternKey: "success:preview",
    createdAt: "2026-08-01T01:00:00.000Z",
    lastUpdated: "2026-08-01T01:00:00.000Z",
    acceptedAt: null,
    ignoredAt: null,
    ...overrides,
  };
}
