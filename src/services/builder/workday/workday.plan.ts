/**
 * Rank detected items into a daily action plan (deduped by sourceKey).
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import type {
  DailyPlanItem,
  WorkdayDetectedItem,
  WorkdayPriority,
} from "./types";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreItem(item: WorkdayDetectedItem) {
  return clamp(
    Math.round(item.urgency * 0.4 + item.impact * 0.35 + item.confidence * 0.25),
    1,
    100
  );
}

function toPriority(score: number): WorkdayPriority {
  if (score >= 85) return "P0";
  if (score >= 70) return "P1";
  if (score >= 50) return "P2";
  return "P3";
}

export function buildDailyPlan(items: WorkdayDetectedItem[]): DailyPlanItem[] {
  const byKey = new Map<string, WorkdayDetectedItem>();
  for (const item of items) {
    const existing = byKey.get(item.sourceKey);
    if (!existing || scoreItem(item) > scoreItem(existing)) {
      byKey.set(item.sourceKey, item);
    }
  }

  return Array.from(byKey.values())
    .sort((a, b) => scoreItem(b) - scoreItem(a))
    .map((item) => {
      const emp = getEmployeeDefinition(item.assignedEmployeeId);
      const collabNames = item.collaboratingEmployeeIds.map(
        (id) => getEmployeeDefinition(id)?.name ?? id
      );
      const score = scoreItem(item);
      return {
        id: item.id,
        title: item.title,
        source: item.source,
        sourceKey: item.sourceKey,
        assignedEmployeeId: item.assignedEmployeeId,
        assignedEmployeeName: emp?.name ?? item.assignedEmployeeId,
        collaboratingEmployeeIds: item.collaboratingEmployeeIds,
        collaboratingEmployeeNames: collabNames,
        priority: toPriority(score),
        reason: item.detail,
        deadline: item.deadline,
        confidence: item.confidence,
        proposedAction: item.proposedAction,
        requiresCeoApproval: item.requiresCeoApproval,
        relatedMissionId: item.relatedMissionId,
        relatedExecutionId: item.relatedExecutionId,
        status:
          item.status === "detected" || item.status === "planned"
            ? ("assigned" as const)
            : item.status,
      };
    });
}

/** Merge plan statuses from prior workday without duplicating sourceKeys. */
export function mergePlanIdempotent(
  previous: DailyPlanItem[],
  next: DailyPlanItem[]
): DailyPlanItem[] {
  const prevByKey = new Map(previous.map((p) => [p.sourceKey, p]));
  const merged: DailyPlanItem[] = [];
  const seen = new Set<string>();

  for (const item of next) {
    seen.add(item.sourceKey);
    const prior = prevByKey.get(item.sourceKey);
    if (!prior) {
      merged.push(item);
      continue;
    }
    // Preserve terminal outcomes; refresh metadata otherwise
    if (["completed", "failed", "skipped"].includes(prior.status)) {
      merged.push({ ...item, status: prior.status, relatedExecutionId: prior.relatedExecutionId ?? item.relatedExecutionId });
    } else if (prior.status === "stale") {
      merged.push({ ...item, status: "stale" });
    } else {
      merged.push({
        ...item,
        relatedMissionId: prior.relatedMissionId ?? item.relatedMissionId,
        relatedExecutionId: prior.relatedExecutionId ?? item.relatedExecutionId,
        status: prior.status === "awaiting_approval" ? prior.status : item.status,
      });
    }
  }

  // Keep prior terminal items not re-detected
  for (const prior of previous) {
    if (seen.has(prior.sourceKey)) continue;
    if (["completed", "failed", "skipped", "stale"].includes(prior.status)) {
      merged.push(prior);
    }
  }

  return merged.sort((a, b) => {
    const order = { P0: 0, P1: 1, P2: 2, P3: 3 };
    return order[a.priority] - order[b.priority] || b.confidence - a.confidence;
  });
}
