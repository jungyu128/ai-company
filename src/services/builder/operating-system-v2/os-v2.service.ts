/**
 * AI Company Operating System v2 — closed-loop orchestration.
 * Preserves Daily Ops gates, Continuous OS, Approval Queue, Live Work, Timeline.
 * Never fabricates progress, meetings, approvals, discussions, or completions.
 */

import path from "node:path";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { formatHqDateTimeDisplay } from "../format-hq-display";
import {
  advanceApprovedDailyWork,
  getDailyOpsSnapshot,
} from "../daily-ops/daily-ops.service";
import { getDailyOpsStore } from "../daily-ops/daily-ops.store";
import { recordCompanyTimelineEvent } from "../company-timeline/company-timeline.service";
import { syncLiveWorkTracker } from "../live-work-tracker/live-work.service";
import {
  buildCeoBriefingV2,
  buildLiveEmployeesFromDailyOps,
  shouldEmitDeploymentReady,
  timelineKindForOsV2,
} from "./os-v2.logic";
import type { CeoBriefingV2, OsV2CycleResult, OsV2TimelineKind } from "./types";

function resolveRoot(repoRoot?: string) {
  return path.resolve(repoRoot ?? process.cwd());
}

function emitOsV2Timeline(input: {
  kind: OsV2TimelineKind;
  summary: string;
  at: string;
  repoRoot: string;
  workspaceId: string;
  directiveId?: string | null;
  workItemId?: string | null;
  employeeId?: string | null;
}) {
  const persisted = timelineKindForOsV2(input.kind);
  recordCompanyTimelineEvent({
    kind: persisted as Parameters<typeof recordCompanyTimelineEvent>[0]["kind"],
    summary: input.summary,
    at: input.at,
    actorName: "AI Company OS v2",
    actorRole: "system",
    directiveId: input.directiveId ?? null,
    workItemId: input.workItemId ?? null,
    employeeId: input.employeeId ?? null,
    relatedType: "operating_system_v2",
    relatedId: input.directiveId ?? input.workItemId ?? null,
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
  });
}

/**
 * Advance every executable Daily Directive for today (idempotent via daily-ops keys).
 */
export function advanceActiveDailyDirectives(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  actorUserId?: string;
  actorName?: string;
}): {
  advanced: string[];
  blocked: string[];
  directiveIds: string[];
} {
  if (!isInternalAiCompanyEnabled()) {
    return { advanced: [], blocked: [], directiveIds: [] };
  }
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const date = now.slice(0, 10);
  const store = getDailyOpsStore(root, workspaceId);
  const advanced: string[] = [];
  const blocked: string[] = [];
  const directiveIds: string[] = [];

  const candidates = store.directives.filter(
    (d) =>
      d.date === date &&
      d.activePlanId &&
      !d.paused &&
      ["APPROVED", "PARTIALLY_APPROVED", "EXECUTING", "BLOCKED"].includes(
        d.status
      )
  );

  for (const dir of candidates) {
    directiveIds.push(dir.id);
    const result = advanceApprovedDailyWork({
      directiveId: dir.id,
      actorUserId: input?.actorUserId ?? "system-os-v2",
      actorName: input?.actorName ?? "AI Company OS v2",
      repoRoot: root,
      workspaceId,
      now,
    });
    if (result.ok) {
      advanced.push(...result.advanced);
      blocked.push(...result.blocked);
    }
  }

  return { advanced, blocked, directiveIds };
}

/**
 * Full OS v2 cycle: advance daily work → sync live tracker → briefing from recorded state.
 */
export function runOperatingSystemV2Cycle(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  syncLiveWork?: boolean;
}): OsV2CycleResult {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const timelineKindsEmitted: OsV2TimelineKind[] = [];

  if (!isInternalAiCompanyEnabled()) {
    const emptyBrief = buildCeoBriefingV2({
      snapshot: getDailyOpsSnapshot({ repoRoot: root, workspaceId, now }),
      generatedAtDisplay: formatHqDateTimeDisplay(now),
      now,
    });
    return {
      at: now,
      directiveId: null,
      advancedWorkItemIds: [],
      blockedWorkItemIds: [],
      briefing: emptyBrief,
      liveEmployees: [],
      timelineKindsEmitted,
    };
  }

  const before = getDailyOpsSnapshot({ repoRoot: root, workspaceId, now });
  if (before.today && !before.activePlan) {
    emitOsV2Timeline({
      kind: "mission",
      summary: `Mission received: ${before.today.title}`,
      at: now,
      repoRoot: root,
      workspaceId,
      directiveId: before.today.id,
    });
    timelineKindsEmitted.push("mission");
  }

  const progressed = advanceActiveDailyDirectives({
    repoRoot: root,
    workspaceId,
    now,
  });

  if (progressed.advanced.length) {
    emitOsV2Timeline({
      kind: "execution",
      summary: `Execution advanced ${progressed.advanced.length} work item(s)`,
      at: now,
      repoRoot: root,
      workspaceId,
      directiveId: progressed.directiveIds[0] ?? null,
    });
    timelineKindsEmitted.push("execution");
  }

  const snapshot = getDailyOpsSnapshot({ repoRoot: root, workspaceId, now });
  const items = snapshot.activePlan?.proposedWorkItems ?? [];

  for (const item of items) {
    if (item.status === "PLANNING" && progressed.advanced.includes(item.id)) {
      emitOsV2Timeline({
        kind: "planning",
        summary: `Planning: ${item.title}`,
        at: now,
        repoRoot: root,
        workspaceId,
        directiveId: snapshot.today?.id,
        workItemId: item.id,
        employeeId: item.assignedEmployeeId,
      });
      timelineKindsEmitted.push("planning");
    }
    if (item.status === "REVIEWING") {
      emitOsV2Timeline({
        kind: "review",
        summary: `Review: ${item.title}`,
        at: now,
        repoRoot: root,
        workspaceId,
        directiveId: snapshot.today?.id,
        workItemId: item.id,
        employeeId: item.assignedEmployeeId,
      });
      timelineKindsEmitted.push("review");
    }
    if (item.status === "BLOCKED") {
      emitOsV2Timeline({
        kind: "blocked",
        summary: `Blocked: ${item.title} — ${item.blockedReason ?? "blocked"}`,
        at: now,
        repoRoot: root,
        workspaceId,
        directiveId: snapshot.today?.id,
        workItemId: item.id,
        employeeId: item.assignedEmployeeId,
      });
      timelineKindsEmitted.push("blocked");
    }
    if (item.status === "COMPLETED") {
      emitOsV2Timeline({
        kind: "completed",
        summary: `Completed: ${item.title}`,
        at: now,
        repoRoot: root,
        workspaceId,
        directiveId: snapshot.today?.id,
        workItemId: item.id,
        employeeId: item.assignedEmployeeId,
      });
      timelineKindsEmitted.push("completed");
      const artifacts = item.outputs?.length || item.changedFiles?.length;
      if (
        shouldEmitDeploymentReady({
          workItemStatus: item.status,
          hasRecordedArtifacts: Boolean(artifacts),
          devopsReviewComplete: (item.requiredReviewers ?? []).some(
            (r) => r === "daniel" || /devops/i.test(r)
          ),
        })
      ) {
        emitOsV2Timeline({
          kind: "deployment_ready",
          summary: `Deployment ready (recorded artifacts): ${item.title}`,
          at: now,
          repoRoot: root,
          workspaceId,
          directiveId: snapshot.today?.id,
          workItemId: item.id,
        });
        timelineKindsEmitted.push("deployment_ready");
      }
    }
  }

  if (input?.syncLiveWork !== false) {
    try {
      syncLiveWorkTracker({
        repoRoot: root,
        workspaceId,
        now,
        recordTimeline: true,
      });
    } catch {
      /* non-blocking */
    }
  }

  const briefing = buildCeoBriefingV2({
    snapshot,
    generatedAtDisplay: formatHqDateTimeDisplay(now),
    now,
  });

  return {
    at: now,
    directiveId: snapshot.today?.id ?? null,
    advancedWorkItemIds: progressed.advanced,
    blockedWorkItemIds: progressed.blocked,
    briefing,
    liveEmployees: buildLiveEmployeesFromDailyOps(snapshot),
    timelineKindsEmitted: [...new Set(timelineKindsEmitted)],
  };
}

export function getCeoBriefingV2(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): CeoBriefingV2 {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const snapshot = getDailyOpsSnapshot({ repoRoot: root, workspaceId, now });
  return buildCeoBriefingV2({
    snapshot,
    generatedAtDisplay: formatHqDateTimeDisplay(now),
    now,
  });
}
