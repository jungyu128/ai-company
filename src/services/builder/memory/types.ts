/**
 * Company Memory v7 — CEO-facing structured learning contracts.
 * Extended for persistent per-employee long-term memory.
 * Never stores secrets, tokens, or raw credentials.
 */

export type MemoryKind =
  | "recurring_customer"
  | "recurring_meeting"
  | "document_format"
  | "ceo_approval_tendency"
  | "preferred_assignment"
  | "recurring_workflow"
  | "business_priority"
  | "template_usage"
  | "successful_pattern"
  | "failure_pattern"
  /** Persistent LTM categories */
  | "completed_work"
  | "discussion"
  | "decision"
  | "review"
  | "blocker"
  | "recurring_bug"
  | "ceo_preference";

export type MemoryCeoStatus = "pending" | "accepted" | "ignored" | "removed";

export type MemoryExpirationPolicy = {
  /** Days after lastUpdated before confidence starts decaying. */
  softExpireDays: number;
  /** Days after lastUpdated when memory is considered expired. */
  hardExpireDays: number;
};

export type CompanyMemory = {
  id: string;
  kind: MemoryKind;
  title: string;
  insight: string;
  /** 0–100 */
  confidence: number;
  evidenceCount: number;
  sourceRefs: string[];
  expiration: MemoryExpirationPolicy;
  ceoStatus: MemoryCeoStatus;
  /** Optional operational key used for dedupe (never a secret). */
  patternKey: string;
  createdAt: string;
  lastUpdated: string;
  acceptedAt: string | null;
  ignoredAt: string | null;
  /** Long-term memory scope (optional for legacy entries). */
  employeeIds?: string[];
  projectKey?: string | null;
  workItemId?: string | null;
  workItemTitle?: string | null;
  /** When the remembered event occurred (defaults to createdAt). */
  occurredAt?: string | null;
  tags?: string[];
  /** If set, this entry summarizes older memories (ids). */
  summarizesIds?: string[];
};

export type MemoryDecisionRecord = {
  id: string;
  at: string;
  memoryId: string;
  action: "accept" | "ignore" | "remove";
  title: string;
  insight: string;
  kind: MemoryKind;
  actorUserId: string | null;
  actorName: string | null;
  previousStatus: MemoryCeoStatus;
  nextStatus: MemoryCeoStatus;
};

export type MemoryStoreShape = {
  memories: CompanyMemory[];
  lastLearnedAt: string | null;
  lastWorkdayId: string | null;
  /** Append-only CEO insight decision history (never rewritten). */
  decisionHistory: MemoryDecisionRecord[];
};

export type LearningInsightSummary = {
  created: number;
  updated: number;
  expired: number;
  skippedUnsafe: number;
};

export type MemorySearchQuery = {
  employeeId?: string | null;
  projectKey?: string | null;
  workItemId?: string | null;
  /** Inclusive ISO date or YYYY-MM-DD */
  from?: string | null;
  /** Inclusive ISO date or YYYY-MM-DD */
  to?: string | null;
  kind?: MemoryKind | null;
  q?: string | null;
  limit?: number;
};

export type MemoryRecordInput = {
  kind: MemoryKind;
  title: string;
  insight: string;
  employeeIds?: string[];
  projectKey?: string | null;
  workItemId?: string | null;
  workItemTitle?: string | null;
  occurredAt?: string | null;
  sourceRefs?: string[];
  tags?: string[];
  confidence?: number;
  patternKey?: string;
  ceoStatus?: MemoryCeoStatus;
};
