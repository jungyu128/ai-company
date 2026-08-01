/**
 * Work Execution Engine service — loads recorded stores and builds the monitor view.
 */

import { formatHqDateTimeDisplay } from "../format-hq-display";
import { getDailyOpsSnapshot } from "../daily-ops";
import {
  listAwaitingWorkpilotExecutions,
  listWorkpilotExecutions,
} from "../workpilot-execution/workpilot-execution.store";
import type { WorkpilotExecutionPackage } from "../workpilot-execution/types";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { buildWorkExecutionEngineView } from "./work-execution-engine.logic";
import type { WorkExecutionEngineView, WorkpilotLifecycleLink } from "./types";

function packageToLink(pkg: WorkpilotExecutionPackage): WorkpilotLifecycleLink {
  const tests = pkg.testResults ?? [];
  const passed = tests.filter((t) => t.status === "passed").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  const testSummary =
    tests.length === 0
      ? null
      : `${passed} passed / ${failed} failed of ${tests.length}`;
  return {
    id: pkg.id,
    title: pkg.goal || pkg.workItem?.title || pkg.id,
    status: pkg.status,
    branchName: pkg.branchName ?? null,
    prUrl: pkg.prUrl ?? null,
    testSummary,
  };
}

export function getWorkExecutionEngineView(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  brainPrioritized?: boolean;
  executiveRecommendationPresent?: boolean;
  approvalPendingCount?: number;
  protectedPendingCount?: number;
}): WorkExecutionEngineView {
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const snap = getDailyOpsSnapshot({
    repoRoot: input?.repoRoot,
    workspaceId,
    now,
  });

  const allPackages = listWorkpilotExecutions(
    input?.repoRoot,
    workspaceId
  );
  const awaiting = listAwaitingWorkpilotExecutions(
    input?.repoRoot,
    workspaceId
  );
  const byId = new Map<string, WorkpilotExecutionPackage>();
  for (const p of [...allPackages, ...awaiting]) {
    byId.set(p.id, p);
  }
  const workpilot = [...byId.values()].map(packageToLink);

  return buildWorkExecutionEngineView({
    generatedAt: now,
    generatedAtDisplay: formatHqDateTimeDisplay(now),
    directive: snap.today,
    plan: snap.activePlan,
    brainPrioritized: input?.brainPrioritized ?? true,
    executiveRecommendationPresent:
      input?.executiveRecommendationPresent ?? true,
    approvalPendingCount: input?.approvalPendingCount ?? 0,
    protectedPendingCount: input?.protectedPendingCount ?? 0,
    workpilot,
  });
}
