/**
 * Company Memory service — learn, manage, and bias future recommendations only.
 * Never bypasses CEO approval for external writes.
 */

import { listCollaborations } from "../collaboration.store";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { listMissionOutcomes } from "../learning.store";
import type { EmployeeRecommendation } from "../proactive.logic";
import { listExecutionHistory } from "../execution/execution.service";
import type { AutonomousWorkday } from "../workday/types";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import type { WorkspaceHumanRole } from "../workspace/types";
import { getWorkspacePrivacySettings } from "../onboarding/onboarding.service";
import {
  applyExpiration,
  extractLearningDrafts,
  isMemoryActive,
  mergeDraftsIntoMemories,
} from "./memory.engine";
import {
  buildLongTermMemoryDraft,
  recallMemoryHints,
  searchMemories,
  summarizeOldMemories,
} from "./memory-ltm.logic";
import {
  getMemoryMeta,
  listMemories,
  replaceMemories,
  resetMemories,
  upsertMemory,
} from "./memory.store";
import type {
  CompanyMemory,
  LearningInsightSummary,
  MemoryCeoStatus,
  MemoryRecordInput,
  MemorySearchQuery,
} from "./types";

function nowIso() {
  return new Date().toISOString();
}

export function getCompanyMemoryDashboard(options?: {
  repoRoot?: string;
  now?: string;
  workspaceId?: string;
}): {
  memories: CompanyMemory[];
  learnedPreferences: CompanyMemory[];
  newInsights: CompanyMemory[];
  recentlyUpdated: CompanyMemory[];
  lastLearnedAt: string | null;
} {
  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? "default";
  const now = options?.now ?? nowIso();
  const memories = listMemories(root, workspaceId)
    .map((m) => applyExpiration(m, now))
    .filter((m) => m.ceoStatus !== "removed");

  const learnedPreferences = memories.filter(
    (m) => m.ceoStatus === "accepted" && isMemoryActive(m, now)
  );
  const newInsights = memories.filter((m) => m.ceoStatus === "pending");
  const recentlyUpdated = [...memories]
    .sort((a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated))
    .slice(0, 12);

  const meta = getMemoryMeta(root, workspaceId);
  return {
    memories,
    learnedPreferences,
    newInsights,
    recentlyUpdated,
    lastLearnedAt: meta.lastLearnedAt,
  };
}

/**
 * Run learning after a workday closes. Skips unverified / failed execution results.
 */
export function learnFromCompletedWorkday(input: {
  workday: AutonomousWorkday;
  repoRoot?: string;
  now?: string;
  workspaceId?: string;
}):
  | { ok: true; summary: LearningInsightSummary; memories: CompanyMemory[] }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? input.workday.workspaceId ?? "default";
  const now = input.now ?? nowIso();

  // Privacy: disabling memory stops future learning without touching audit history.
  const privacy = getWorkspacePrivacySettings(workspaceId, root);
  if (!privacy.memoryEnabled) {
    return {
      ok: true,
      summary: { created: 0, updated: 0, expired: 0, skippedUnsafe: 0 },
      memories: listMemories(root, workspaceId),
    };
  }

  const meta = getMemoryMeta(root, workspaceId);
  // Idempotent: same workday learning pass can re-run but merges by patternKey
  const outcomes = listMissionOutcomes(root);
  const missions = listCollaborations(root, workspaceId);
  const executions = listExecutionHistory({
    repoRoot: root,
    workspaceId,
    limit: 80,
  }).filter(
    (e) => e.status === "succeeded" && e.executionStatus === "succeeded" && e.verificationResult
  );

  const { drafts, skippedUnsafe } = extractLearningDrafts({
    outcomes,
    missions,
    executions,
    workday: input.workday,
  });

  const existing = listMemories(root, workspaceId);
  const merged = mergeDraftsIntoMemories(existing, drafts, now);
  merged.summary.skippedUnsafe = skippedUnsafe;

  replaceMemories(
    merged.memories,
    {
      lastLearnedAt: now,
      lastWorkdayId: input.workday.id,
    },
    root,
    workspaceId
  );

  // Preserve idempotency marker even on repeat
  if (meta.lastWorkdayId === input.workday.id) {
    // still ok — merge was additive
  }

  return { ok: true, summary: merged.summary, memories: listMemories(root, workspaceId) };
}

export function decideMemory(input: {
  memoryId: string;
  action: "accept" | "ignore" | "remove";
  repoRoot?: string;
  now?: string;
  workspaceId?: string;
  actor?: {
    userId: string;
    displayName: string;
    role: WorkspaceHumanRole;
  };
}):
  | { ok: true; memory: CompanyMemory }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? "default";
  const now = input.now ?? nowIso();
  const memories = listMemories(root, workspaceId);
  const found = memories.find((m) => m.id === input.memoryId);
  if (!found) {
    return { ok: false, code: "NOT_FOUND", message: "Memory not found", status: 404 };
  }

  const status: MemoryCeoStatus =
    input.action === "accept"
      ? "accepted"
      : input.action === "ignore"
        ? "ignored"
        : "removed";

  const updated: CompanyMemory = {
    ...found,
    ceoStatus: status,
    lastUpdated: now,
    acceptedAt: input.action === "accept" ? now : found.acceptedAt,
    ignoredAt: input.action === "ignore" ? now : found.ignoredAt,
    confidence:
      input.action === "accept"
        ? Math.min(98, found.confidence + 5)
        : input.action === "ignore"
          ? Math.max(10, found.confidence - 15)
          : found.confidence,
  };
  upsertMemory(updated, root, workspaceId);
  if (input.actor) {
    recordWorkspaceEvent({
      workspaceId,
      kind: "memory",
      summary: `${input.actor.displayName} ${input.action}ed company memory`,
      actorUserId: input.actor.userId,
      actorName: input.actor.displayName,
      actorRole: input.actor.role,
      relatedType: "memory",
      relatedId: updated.id,
      status: updated.ceoStatus,
      auditAction: `memory.${input.action}`,
      notify:
        input.action === "accept"
          ? {
              kind: "new_insight",
              title: "Company memory updated",
              body: updated.insight.slice(0, 120),
            }
          : undefined,
      repoRoot: root,
    });
  }
  return { ok: true, memory: updated };
}

export function resetCompanyMemory(options?: {
  repoRoot?: string;
  workspaceId?: string;
}):
  | { ok: true }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  resetMemories(options?.repoRoot ?? process.cwd(), options?.workspaceId ?? "default");
  return { ok: true };
}

/**
 * Bias recommendation confidence/order using accepted + pending memories.
 * Does not change approval gates.
 */
export function applyMemoryToRecommendations(
  recommendations: EmployeeRecommendation[],
  options?: { repoRoot?: string; now?: string; workspaceId?: string }
): EmployeeRecommendation[] {
  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? "default";
  const now = options?.now ?? nowIso();
  const active = listMemories(root, workspaceId)
    .map((m) => applyExpiration(m, now))
    .filter((m) => isMemoryActive(m, now) && m.ceoStatus !== "ignored");

  if (active.length === 0) return recommendations;

  const scored = recommendations.map((rec) => {
    let delta = 0;
    const notes: string[] = [];
    for (const mem of active) {
      if (mem.kind === "preferred_assignment") {
        const name = rec.participatingEmployees[0]?.name;
        if (
          mem.patternKey.includes(`assign:${rec.leadEmployeeId}:`) ||
          (name && mem.title.includes(name))
        ) {
          delta += Math.round(mem.confidence * 0.08);
          notes.push(mem.title);
        }
      }
      if (mem.kind === "business_priority") {
        const hay = `${rec.title} ${rec.recommendation}`.toLowerCase();
        if (mem.patternKey.includes("priority:crm") && /crm|pipeline|sales/.test(hay)) {
          delta += Math.round(mem.confidence * 0.1);
          notes.push(mem.title);
        }
        if (mem.patternKey.includes("priority:email") && /email|inbox/.test(hay)) {
          delta += Math.round(mem.confidence * 0.08);
          notes.push(mem.title);
        }
      }
      if (mem.kind === "failure_pattern") {
        const hay = `${rec.title} ${rec.recommendation}`.toLowerCase();
        const domain = mem.patternKey.split(":")[1];
        if (domain && hay.includes(domain.replace("fail-", ""))) {
          delta -= 4;
          notes.push(`Caution: ${mem.title}`);
        }
      }
      if (mem.kind === "successful_pattern" || mem.kind === "recurring_workflow") {
        const hay = `${rec.title} ${rec.recommendation}`.toLowerCase();
        if (
          (mem.patternKey.includes("email") && /email/.test(hay)) ||
          (mem.patternKey.includes("crm") && /crm|pipeline/.test(hay)) ||
          (mem.patternKey.includes("calendar") && /calendar|meeting/.test(hay)) ||
          (mem.patternKey.includes("doc") && /document|proposal/.test(hay))
        ) {
          delta += Math.round(mem.confidence * 0.05);
        }
      }
      if (mem.kind === "ceo_approval_tendency" && mem.ceoStatus === "accepted") {
        delta += 2;
      }
    }

    if (delta === 0) return { rec, sort: rec.confidence };
    const confidence = Math.max(35, Math.min(97, rec.confidence + delta));
    const reasoning =
      notes.length > 0
        ? `${rec.reasoning} Company memory adjusted confidence (${notes.slice(0, 2).join("; ")}).`
        : rec.reasoning;
    const next = { ...rec, confidence, reasoning };
    return { rec: next, sort: confidence };
  });

  return scored
    .sort((a, b) => b.sort - a.sort)
    .map((s) => s.rec);
}

/**
 * Record a long-term memory (completed work, discussion, decision, review, blocker, bug, CEO pref).
 */
export function recordLongTermMemory(input: {
  record: MemoryRecordInput;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}):
  | { ok: true; memory: CompanyMemory }
  | { ok: false; code: string; message: string; status: number } {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }
  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? "default";
  const now = input.now ?? nowIso();
  const privacy = getWorkspacePrivacySettings(workspaceId, root);
  if (!privacy.memoryEnabled) {
    return {
      ok: false,
      code: "PRIVACY",
      message: "Memory is disabled for this workspace",
      status: 403,
    };
  }

  const draft = buildLongTermMemoryDraft(input.record, now);
  if (!draft) {
    return {
      ok: false,
      code: "UNSAFE",
      message: "Memory content rejected by safety filter",
      status: 400,
    };
  }

  const existing = listMemories(root, workspaceId).find(
    (m) => m.patternKey === draft.patternKey
  );
  if (existing) {
    const merged: CompanyMemory = {
      ...existing,
      ...draft,
      id: existing.id,
      evidenceCount: existing.evidenceCount + 1,
      confidence: Math.min(98, existing.confidence + 3),
      lastUpdated: now,
      sourceRefs: [
        ...new Set([...existing.sourceRefs, ...draft.sourceRefs]),
      ].slice(0, 12),
      employeeIds: [
        ...new Set([
          ...(existing.employeeIds ?? []),
          ...(draft.employeeIds ?? []),
        ]),
      ],
      tags: [...new Set([...(existing.tags ?? []), ...(draft.tags ?? [])])].slice(
        0,
        12
      ),
    };
    upsertMemory(merged, root, workspaceId);
    return { ok: true, memory: merged };
  }

  upsertMemory(draft, root, workspaceId);
  return { ok: true, memory: draft };
}

/** Search company memory by employee, project, work item, date, and free text. */
export function searchCompanyMemory(input: {
  query: MemorySearchQuery;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): CompanyMemory[] {
  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? "default";
  const now = input.now ?? nowIso();
  const memories = listMemories(root, workspaceId)
    .map((m) => applyExpiration(m, now))
    .filter((m) => m.ceoStatus !== "removed");
  return searchMemories(memories, input.query);
}

/**
 * Recall summarized memory hints for an employee discussion (auto-use).
 */
export function recallMemoryForDiscussion(input: {
  employeeId: string;
  workItemId?: string | null;
  projectKey?: string | null;
  limit?: number;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): string[] {
  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? "default";
  const now = input.now ?? nowIso();
  const memories = listMemories(root, workspaceId)
    .map((m) => applyExpiration(m, now))
    .filter(
      (m) =>
        (m.ceoStatus === "accepted" || m.ceoStatus === "pending") &&
        isMemoryActive(m, now)
    );
  return recallMemoryHints(memories, {
    employeeId: input.employeeId,
    workItemId: input.workItemId,
    projectKey: input.projectKey,
    limit: input.limit,
  });
}

/**
 * Summarize older memories so discussions don't repeat entire histories.
 */
export function summarizeCompanyMemory(input?: {
  employeeId?: string | null;
  workItemId?: string | null;
  olderThanDays?: number;
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): {
  ok: true;
  summary: CompanyMemory | null;
  supersededCount: number;
} {
  const root = input?.repoRoot ?? process.cwd();
  const workspaceId = input?.workspaceId ?? "default";
  const now = input?.now ?? nowIso();
  const privacy = getWorkspacePrivacySettings(workspaceId, root);
  if (!privacy.memoryEnabled) {
    return { ok: true, summary: null, supersededCount: 0 };
  }

  const memories = listMemories(root, workspaceId);
  const { summary, supersededIds } = summarizeOldMemories({
    memories,
    employeeId: input?.employeeId,
    workItemId: input?.workItemId,
    olderThanDays: input?.olderThanDays,
    now,
  });
  if (!summary) return { ok: true, summary: null, supersededCount: 0 };

  upsertMemory(summary, root, workspaceId);
  for (const id of supersededIds) {
    const found = memories.find((m) => m.id === id);
    if (!found) continue;
    upsertMemory(
      {
        ...found,
        ceoStatus: "removed",
        lastUpdated: now,
        insight: sanitizeSupersededInsight(found.insight),
      },
      root,
      workspaceId
    );
  }
  return { ok: true, summary, supersededCount: supersededIds.length };
}

function sanitizeSupersededInsight(insight: string): string {
  return `Superseded by summary. ${insight}`.slice(0, 240);
}

export type { CompanyMemory, LearningInsightSummary, MemorySearchQuery, MemoryRecordInput };
