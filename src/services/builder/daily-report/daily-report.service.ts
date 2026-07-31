/**
 * Daily Report — read/parse end-of-execution reports without inventing fields.
 */

import path from "node:path";
import { formatHqDateTimeDisplay } from "../format-hq-display";
import { getDailyOpsSnapshot } from "../daily-ops/daily-ops.service";
import { buildDailyReportBody } from "../daily-ops/daily-ops.logic";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import type { DailyReportBody, DailyReportView } from "./types";

function resolveRoot(repoRoot?: string) {
  return path.resolve(repoRoot ?? process.cwd());
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : [];
}

function parseBody(raw: Record<string, unknown>, fallbackTitle: string): DailyReportBody | null {
  if (
    !Array.isArray(raw.completedWork) ||
    !Array.isArray(raw.incompleteWork) ||
    !Array.isArray(raw.blockers) ||
    !Array.isArray(raw.approvals) ||
    !Array.isArray(raw.reviews) ||
    !Array.isArray(raw.changedFiles) ||
    !Array.isArray(raw.risks) ||
    !Array.isArray(raw.nextRecommendations)
  ) {
    return null;
  }
  return {
    generatedAt:
      typeof raw.generatedAt === "string" ? raw.generatedAt : new Date(0).toISOString(),
    directiveId: typeof raw.directiveId === "string" ? raw.directiveId : "",
    directiveTitle:
      typeof raw.directiveTitle === "string" ? raw.directiveTitle : fallbackTitle,
    planId: typeof raw.planId === "string" ? raw.planId : "",
    planVersion: typeof raw.planVersion === "number" ? raw.planVersion : 0,
    completedWork: raw.completedWork as DailyReportBody["completedWork"],
    incompleteWork: raw.incompleteWork as DailyReportBody["incompleteWork"],
    blockers: raw.blockers as DailyReportBody["blockers"],
    approvals: raw.approvals as DailyReportBody["approvals"],
    reviews: raw.reviews as DailyReportBody["reviews"],
    changedFiles: asStringArray(raw.changedFiles),
    risks: raw.risks as DailyReportBody["risks"],
    nextRecommendations: asStringArray(raw.nextRecommendations),
    integrity:
      raw.integrity && typeof raw.integrity === "object"
        ? (raw.integrity as DailyReportBody["integrity"])
        : {
            source: "recorded_state_only",
            completedCount: (raw.completedWork as unknown[]).length,
            incompleteCount: (raw.incompleteWork as unknown[]).length,
            note: "Report reflects recorded company state only.",
          },
  };
}

export function dailyReportViewFromStored(
  report: {
    id: string;
    title: string;
    createdAt: string;
    body: Record<string, unknown>;
  } | null
): DailyReportView | null {
  if (!report) return null;
  const body = parseBody(report.body, report.title);
  if (!body) return null;
  return {
    id: report.id,
    title: report.title,
    createdAt: report.createdAt,
    createdAtDisplay: formatHqDateTimeDisplay(report.createdAt),
    body,
  };
}

export function getLatestDailyReportView(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): DailyReportView | null {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const snap = getDailyOpsSnapshot({
    repoRoot: root,
    workspaceId,
    now: input?.now,
  });
  return dailyReportViewFromStored(snap.latestFinalReport);
}

/** Preview current directive state as a Daily Report without persisting. */
export function previewDailyReport(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): DailyReportView | null {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const snap = getDailyOpsSnapshot({ repoRoot: root, workspaceId, now });
  if (!snap.today || !snap.activePlan) return null;
  const body = buildDailyReportBody({
    directive: snap.today,
    plan: snap.activePlan,
    now,
  });
  return {
    id: `preview-${snap.today.id}`,
    title: `Daily Report — ${snap.today.title}`,
    createdAt: now,
    createdAtDisplay: formatHqDateTimeDisplay(now),
    body,
  };
}
