/**
 * Persistent long-term memory — search, summarize, recall for discussions.
 */

import type {
  CompanyMemory,
  MemoryKind,
  MemoryRecordInput,
  MemorySearchQuery,
} from "./types";
import { sanitizeMemoryText, isSafeMemoryPayload } from "./memory.safety";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function dayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function inDateRange(
  occurredAt: string | null | undefined,
  from?: string | null,
  to?: string | null
): boolean {
  const day = dayKey(occurredAt);
  if (!day) return !from && !to;
  if (from && day < from.slice(0, 10)) return false;
  if (to && day > to.slice(0, 10)) return false;
  return true;
}

export function defaultLtmExpiration(kind: MemoryKind): {
  softExpireDays: number;
  hardExpireDays: number;
} {
  if (kind === "ceo_preference" || kind === "recurring_bug") {
    return { softExpireDays: 60, hardExpireDays: 180 };
  }
  if (kind === "blocker" || kind === "decision") {
    return { softExpireDays: 45, hardExpireDays: 120 };
  }
  return { softExpireDays: 30, hardExpireDays: 90 };
}

export function buildLongTermMemoryDraft(
  input: MemoryRecordInput,
  now: string
): CompanyMemory | null {
  const title = sanitizeMemoryText(input.title, 120);
  const insight = sanitizeMemoryText(input.insight, 280);
  if (!title || !insight) return null;
  if (!isSafeMemoryPayload([title, insight, ...(input.sourceRefs ?? [])])) {
    return null;
  }

  const employeeIds = [...new Set((input.employeeIds ?? []).filter(Boolean))];
  const patternKey =
    input.patternKey?.trim() ||
    [
      "ltm",
      input.kind,
      input.workItemId ?? "none",
      employeeIds[0] ?? "company",
      title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40),
    ].join(":");

  return {
    id: newId("mem"),
    kind: input.kind,
    title,
    insight,
    confidence: Math.max(40, Math.min(95, input.confidence ?? 70)),
    evidenceCount: 1,
    sourceRefs: (input.sourceRefs ?? []).slice(0, 8).map((s) => sanitizeMemoryText(s, 80)),
    expiration: defaultLtmExpiration(input.kind),
    ceoStatus: input.ceoStatus ?? "pending",
    patternKey,
    createdAt: now,
    lastUpdated: now,
    acceptedAt: input.ceoStatus === "accepted" ? now : null,
    ignoredAt: null,
    employeeIds,
    projectKey: input.projectKey ?? "workpilot",
    workItemId: input.workItemId ?? null,
    workItemTitle: input.workItemTitle
      ? sanitizeMemoryText(input.workItemTitle, 100)
      : null,
    occurredAt: input.occurredAt ?? now,
    tags: (input.tags ?? []).slice(0, 8),
    summarizesIds: [],
  };
}

export function searchMemories(
  memories: CompanyMemory[],
  query: MemorySearchQuery
): CompanyMemory[] {
  const limit = query.limit ?? 20;
  const q = query.q?.trim().toLowerCase() ?? "";
  const scored = memories
    .filter((m) => m.ceoStatus !== "removed")
    .filter((m) => {
      if (query.kind && m.kind !== query.kind) return false;
      if (
        query.employeeId &&
        !(m.employeeIds ?? []).includes(query.employeeId) &&
        !m.patternKey.includes(`:${query.employeeId}:`) &&
        !m.insight.toLowerCase().includes(query.employeeId.toLowerCase())
      ) {
        return false;
      }
      if (
        query.projectKey &&
        (m.projectKey ?? "workpilot") !== query.projectKey &&
        !m.patternKey.includes(query.projectKey)
      ) {
        return false;
      }
      if (
        query.workItemId &&
        m.workItemId !== query.workItemId &&
        !m.sourceRefs.some((r) => r.includes(query.workItemId!)) &&
        !m.patternKey.includes(query.workItemId)
      ) {
        return false;
      }
      if (!inDateRange(m.occurredAt ?? m.createdAt, query.from, query.to)) {
        return false;
      }
      if (q) {
        const hay = [
          m.title,
          m.insight,
          m.workItemTitle ?? "",
          m.projectKey ?? "",
          ...(m.tags ?? []),
          ...(m.employeeIds ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .map((m) => {
      let score = m.confidence + m.evidenceCount;
      if (m.ceoStatus === "accepted") score += 10;
      if (m.summarizesIds?.length) score += 5;
      if (query.employeeId && (m.employeeIds ?? []).includes(query.employeeId)) {
        score += 8;
      }
      if (query.workItemId && m.workItemId === query.workItemId) score += 12;
      return { m, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.m.occurredAt ?? b.m.lastUpdated) -
          Date.parse(a.m.occurredAt ?? a.m.lastUpdated)
    );

  return scored.slice(0, limit).map((s) => s.m);
}

/**
 * Collapse older matching memories into a single summary entry.
 * Returns the summary draft + ids that should be marked removed/superseded.
 */
export function summarizeOldMemories(input: {
  memories: CompanyMemory[];
  employeeId?: string | null;
  workItemId?: string | null;
  olderThanDays?: number;
  now: string;
  maxSource?: number;
}): {
  summary: CompanyMemory | null;
  supersededIds: string[];
} {
  const olderThanDays = input.olderThanDays ?? 21;
  const cutoff = Date.parse(input.now) - olderThanDays * 86_400_000;
  const candidates = input.memories.filter((m) => {
    if (m.ceoStatus === "removed") return false;
    if (m.summarizesIds && m.summarizesIds.length > 0) return false;
    if (input.employeeId && !(m.employeeIds ?? []).includes(input.employeeId)) {
      return false;
    }
    if (input.workItemId && m.workItemId !== input.workItemId) return false;
    const t = Date.parse(m.occurredAt ?? m.createdAt);
    return Number.isFinite(t) && t < cutoff;
  });

  if (candidates.length < 3) {
    return { summary: null, supersededIds: [] };
  }

  const take = candidates
    .sort(
      (a, b) =>
        Date.parse(a.occurredAt ?? a.createdAt) -
        Date.parse(b.occurredAt ?? b.createdAt)
    )
    .slice(0, input.maxSource ?? 8);

  const kinds = [...new Set(take.map((m) => m.kind))];
  const bullets = take.map(
    (m) =>
      `${dayKey(m.occurredAt ?? m.createdAt)} · ${m.kind}: ${sanitizeMemoryText(m.insight, 90)}`
  );
  const employeeIds = [
    ...new Set(take.flatMap((m) => m.employeeIds ?? [])),
  ];
  const workItemId = input.workItemId ?? take.find((m) => m.workItemId)?.workItemId ?? null;
  const workItemTitle =
    take.find((m) => m.workItemTitle)?.workItemTitle ?? null;

  const summary = buildLongTermMemoryDraft(
    {
      kind: "discussion",
      title: `Summary: ${workItemTitle ?? employeeIds[0] ?? "company"} history`,
      insight: `Compressed ${take.length} older memories (${kinds.join(", ")}). ${bullets.slice(0, 4).join(" | ")}`,
      employeeIds,
      projectKey: take[0]?.projectKey ?? "workpilot",
      workItemId,
      workItemTitle,
      occurredAt: input.now,
      sourceRefs: take.map((m) => m.id),
      tags: ["summary", "ltm"],
      confidence: 75,
      patternKey: `ltm:summary:${workItemId ?? "company"}:${employeeIds[0] ?? "all"}:${dayKey(input.now)}`,
      ceoStatus: "accepted",
    },
    input.now
  );

  if (!summary) return { summary: null, supersededIds: [] };
  summary.summarizesIds = take.map((m) => m.id);
  return { summary, supersededIds: take.map((m) => m.id) };
}

/** Build short recall lines for chat/discussion — prefers summaries over raw history. */
export function recallMemoryHints(
  memories: CompanyMemory[],
  input: {
    employeeId: string;
    workItemId?: string | null;
    projectKey?: string | null;
    limit?: number;
  }
): string[] {
  const ranked = searchMemories(memories, {
    employeeId: input.employeeId,
    workItemId: input.workItemId,
    projectKey: input.projectKey ?? "workpilot",
    limit: 30,
  });

  const summaries = ranked.filter((m) => (m.summarizesIds?.length ?? 0) > 0);
  const fresh = ranked.filter((m) => !(m.summarizesIds?.length ?? 0));
  const picked = [...summaries.slice(0, 2), ...fresh.slice(0, input.limit ?? 4)].slice(
    0,
    input.limit ?? 5
  );

  return picked.map((m) => {
    const scope = m.workItemTitle
      ? `${m.workItemTitle}`
      : m.kind.replace(/_/g, " ");
    return `[Memory · ${m.kind}] ${scope}: ${sanitizeMemoryText(m.insight, 140)}`;
  });
}

export const LTM_KINDS: MemoryKind[] = [
  "completed_work",
  "discussion",
  "decision",
  "review",
  "blocker",
  "recurring_bug",
  "ceo_preference",
];
