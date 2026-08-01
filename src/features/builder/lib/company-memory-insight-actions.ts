import type { CompanyMemory } from "@/services/builder/memory/types";

export type InsightAction = "accept" | "ignore" | "remove";

export type MemoryInsightSnapshot = {
  newInsights: CompanyMemory[];
  learnedPreferences: CompanyMemory[];
  recentlyUpdated: CompanyMemory[];
};

/**
 * Pure optimistic transition for Company Memory insight actions.
 * Used by the panel before the API responds; callers roll back on failure.
 */
export function applyInsightActionOptimistic(
  snap: MemoryInsightSnapshot,
  memoryId: string,
  action: InsightAction
): MemoryInsightSnapshot {
  const all = [
    ...snap.newInsights,
    ...snap.learnedPreferences,
    ...snap.recentlyUpdated,
  ];
  const found =
    all.find((m) => m.id === memoryId) ??
    snap.newInsights.find((m) => m.id === memoryId);
  if (!found) return snap;

  const now = new Date().toISOString();
  const nextStatus =
    action === "accept"
      ? ("accepted" as const)
      : action === "ignore"
        ? ("ignored" as const)
        : ("removed" as const);

  const updated: CompanyMemory = {
    ...found,
    ceoStatus: nextStatus,
    lastUpdated: now,
    acceptedAt: action === "accept" ? now : found.acceptedAt,
    ignoredAt: action === "ignore" ? now : found.ignoredAt,
  };

  const without = (list: CompanyMemory[]) => list.filter((m) => m.id !== memoryId);

  if (action === "remove") {
    return {
      newInsights: without(snap.newInsights),
      learnedPreferences: without(snap.learnedPreferences),
      recentlyUpdated: without(snap.recentlyUpdated),
    };
  }

  if (action === "ignore") {
    return {
      newInsights: without(snap.newInsights),
      learnedPreferences: without(snap.learnedPreferences),
      recentlyUpdated: [updated, ...without(snap.recentlyUpdated)].slice(0, 12),
    };
  }

  return {
    newInsights: without(snap.newInsights),
    learnedPreferences: [updated, ...without(snap.learnedPreferences)],
    recentlyUpdated: [updated, ...without(snap.recentlyUpdated)].slice(0, 12),
  };
}
