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
import { recordCompanyTimelineEvent } from "../company-timeline";
import { appendAnalyticsSample } from "../analytics/analytics.store";
import { getCompanyAnalyticsView } from "../analytics/analytics.service";
import { appendKnowledgeRecords } from "../company-learning/company-learning.store";
import type { KnowledgeRecord } from "../company-learning/types";
import { logOpsEvent } from "../hardening/ops-log";
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
  appendMemoryDecision,
  deleteMemory,
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
  MemoryDecisionRecord,
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
  | {
      ok: true;
      memory: CompanyMemory;
      decision: MemoryDecisionRecord;
      dashboard: ReturnType<typeof getCompanyMemoryDashboard>;
    }
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

  // Idempotent: already in target state
  const targetStatus: MemoryCeoStatus =
    input.action === "accept"
      ? "accepted"
      : input.action === "ignore"
        ? "ignored"
        : "removed";
  if (found.ceoStatus === targetStatus) {
    const decision: MemoryDecisionRecord = {
      id: `mdec-noop-${found.id}-${Date.now().toString(36)}`,
      at: now,
      memoryId: found.id,
      action: input.action,
      title: found.title,
      insight: found.insight,
      kind: found.kind,
      actorUserId: input.actor?.userId ?? null,
      actorName: input.actor?.displayName ?? null,
      previousStatus: found.ceoStatus,
      nextStatus: found.ceoStatus,
    };
    return {
      ok: true,
      memory: found,
      decision,
      dashboard: getCompanyMemoryDashboard({
        repoRoot: root,
        workspaceId,
        now,
      }),
    };
  }

  const previousStatus = found.ceoStatus;
  const updated: CompanyMemory = {
    ...found,
    ceoStatus: targetStatus,
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
  if (input.action === "remove") {
    deleteMemory(found.id, root, workspaceId);
  } else {
    upsertMemory(updated, root, workspaceId);
  }

  const decision: MemoryDecisionRecord = {
    id: `mdec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at: now,
    memoryId: updated.id,
    action: input.action,
    title: updated.title,
    insight: updated.insight,
    kind: updated.kind,
    actorUserId: input.actor?.userId ?? null,
    actorName: input.actor?.displayName ?? null,
    previousStatus,
    nextStatus: targetStatus,
  };
  appendMemoryDecision(decision, root, workspaceId);

  const actorName = input.actor?.displayName ?? "CEO";
  const actorUserId = input.actor?.userId ?? null;
  const actorRole = input.actor?.role ?? "owner";

  // Audit + workspace feed
  recordWorkspaceEvent({
    workspaceId,
    kind: "memory",
    summary: `${actorName} ${input.action}ed insight “${updated.title}”`,
    actorUserId,
    actorName,
    actorRole,
    relatedType: "memory",
    relatedId: updated.id,
    status: updated.ceoStatus,
    auditAction: `memory.${input.action}`,
    notify:
      input.action === "accept"
        ? {
            kind: "new_insight",
            title: "Insight accepted",
            body: updated.insight.slice(0, 120),
          }
        : undefined,
    repoRoot: root,
  });

  // Timeline event
  const timelineKind =
    input.action === "accept"
      ? ("insight_accepted" as const)
      : input.action === "ignore"
        ? ("insight_ignored" as const)
        : ("insight_removed" as const);
  recordCompanyTimelineEvent({
    kind: timelineKind,
    summary: `${actorName} ${input.action}ed insight: ${updated.title}`,
    at: now,
    actorUserId,
    actorName,
    actorRole: "owner",
    relatedType: "memory",
    relatedId: updated.id,
    repoRoot: root,
    workspaceId,
  });

  // Accept → feed Company Learning Engine (append-only knowledge)
  if (input.action === "accept") {
    const category =
      updated.kind === "ceo_preference" || updated.kind === "ceo_approval_tendency"
        ? ("ceo_preference" as const)
        : updated.kind === "failure_pattern" || updated.kind === "recurring_bug"
          ? ("qa_rule" as const)
          : updated.kind === "preferred_assignment"
            ? ("team_best_practice" as const)
            : ("engineering_pattern" as const);
    const knowledge: KnowledgeRecord = {
      id: `know-insight-${updated.id}-${Date.now().toString(36)}`,
      category,
      title: updated.title,
      body: updated.insight,
      confidence: updated.confidence,
      patternKey: `insight:${updated.patternKey || updated.id}`,
      sourceRefs: [
        `memory:${updated.id}`,
        `decision:${decision.id}`,
        ...updated.sourceRefs.slice(0, 6),
      ],
      derivedFromLessonId: null,
      createdAt: now,
      supersededById: null,
    };
    appendKnowledgeRecords({
      knowledge: [knowledge],
      summary: `Accepted insight: ${updated.title}`,
      repoRoot: root,
      workspaceId,
      at: now,
    });
  }

  // Ignore → analytics snapshot + ops log (audit already recorded)
  if (input.action === "ignore") {
    try {
      const analytics = getCompanyAnalyticsView({
        repoRoot: root,
        workspaceId,
        now,
      });
      appendAnalyticsSample(
        {
          id: `an-ignore-${decision.id}`,
          workspaceId,
          at: now,
          kpis: analytics.snapshot.kpis,
          healthScore: analytics.snapshot.kpis.companyHealthScore,
          blockedWorkCount: analytics.snapshot.kpis.blockedWorkCount,
          sprintVelocity: analytics.snapshot.kpis.sprintVelocity,
          qaPassRatePercent: analytics.snapshot.kpis.qaPassRatePercent,
          approvalTurnaroundHours: analytics.snapshot.kpis.approvalTurnaroundHours,
        },
        root,
        workspaceId
      );
    } catch {
      /* analytics optional — decision still persisted */
    }
  }

  logOpsEvent({
    outcome: "ok",
    workspaceId,
    action: `memory.${input.action}`,
    code: updated.id,
  });

  return {
    ok: true,
    memory: updated,
    decision,
    dashboard: getCompanyMemoryDashboard({
      repoRoot: root,
      workspaceId,
      now,
    }),
  };
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
