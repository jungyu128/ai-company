/**
 * Persist daily directives, plans, reports, audit, execution keys.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type {
  DailyDirective,
  DailyExecutionPlan,
  DailyOpsAuditEntry,
  DailyOpsStoreShape,
  DailyReport,
} from "./types";

export const DAILY_OPS_FILE = "ai-company-daily-ops.json";

function emptyStore(): DailyOpsStoreShape {
  return {
    directives: [],
    plans: [],
    reports: [],
    audit: [],
    executionKeys: [],
  };
}

function fileFor(workspaceId: string) {
  return opsRel(DAILY_OPS_FILE, workspaceId);
}

export function getDailyOpsStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DailyOpsStoreShape {
  const root = path.resolve(repoRoot);
  const parsed = readJson<DailyOpsStoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed) return emptyStore();
  return {
    directives: Array.isArray(parsed.directives) ? parsed.directives : [],
    plans: (Array.isArray(parsed.plans) ? parsed.plans : []).map((plan) => ({
      ...plan,
      proposedWorkItems: (plan.proposedWorkItems ?? []).map((w) => ({
        ...w,
        outputs: Array.isArray(w.outputs) ? w.outputs : [],
        changedFiles: Array.isArray(w.changedFiles) ? w.changedFiles : [],
      })),
    })),
    reports: Array.isArray(parsed.reports) ? parsed.reports : [],
    audit: Array.isArray(parsed.audit) ? parsed.audit : [],
    executionKeys: Array.isArray(parsed.executionKeys) ? parsed.executionKeys : [],
  };
}

export function saveDailyOpsStore(
  store: DailyOpsStoreShape,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DailyOpsStoreShape {
  const root = path.resolve(repoRoot);
  writeJson(root, fileFor(workspaceId), {
    directives: store.directives.slice(0, 200),
    plans: store.plans.slice(0, 400),
    reports: store.reports.slice(0, 400),
    audit: store.audit.slice(0, 800),
    executionKeys: store.executionKeys.slice(0, 2000),
  });
  return store;
}

export function upsertDirective(
  directive: DailyDirective,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DailyDirective {
  const store = getDailyOpsStore(repoRoot, workspaceId);
  const idx = store.directives.findIndex((d) => d.id === directive.id);
  if (idx >= 0) store.directives[idx] = directive;
  else store.directives.unshift(directive);
  saveDailyOpsStore(store, repoRoot, workspaceId);
  return directive;
}

export function upsertPlan(
  plan: DailyExecutionPlan,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DailyExecutionPlan {
  const store = getDailyOpsStore(repoRoot, workspaceId);
  const idx = store.plans.findIndex((p) => p.id === plan.id);
  if (idx >= 0) store.plans[idx] = plan;
  else store.plans.unshift(plan);
  saveDailyOpsStore(store, repoRoot, workspaceId);
  return plan;
}

export function appendReport(
  report: DailyReport,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DailyReport {
  const store = getDailyOpsStore(repoRoot, workspaceId);
  store.reports.unshift(report);
  saveDailyOpsStore(store, repoRoot, workspaceId);
  return report;
}

export function appendDailyAudit(
  entry: DailyOpsAuditEntry,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): DailyOpsAuditEntry {
  const store = getDailyOpsStore(repoRoot, workspaceId);
  store.audit.unshift(entry);
  saveDailyOpsStore(store, repoRoot, workspaceId);
  return entry;
}

export function registerExecutionKey(
  key: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): boolean {
  const store = getDailyOpsStore(repoRoot, workspaceId);
  if (store.executionKeys.includes(key)) return false;
  store.executionKeys.unshift(key);
  saveDailyOpsStore(store, repoRoot, workspaceId);
  return true;
}

export function hasExecutionKey(
  key: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): boolean {
  return getDailyOpsStore(repoRoot, workspaceId).executionKeys.includes(key);
}
