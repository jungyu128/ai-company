/**
 * Company Memory v7 — CEO-facing structured learning contracts.
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
  | "failure_pattern";

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
};

export type MemoryStoreShape = {
  memories: CompanyMemory[];
  lastLearnedAt: string | null;
  lastWorkdayId: string | null;
};

export type LearningInsightSummary = {
  created: number;
  updated: number;
  expired: number;
  skippedUnsafe: number;
};
