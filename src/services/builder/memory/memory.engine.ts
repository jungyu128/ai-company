/**
 * Learning engine — extract safe operational patterns after successful outcomes.
 * Never learns from incomplete or failed verification results.
 */

import { createHash } from "node:crypto";
import { getEmployeeDefinition } from "../ai-company-employees";
import type { CollaborationMission } from "../collaboration.logic";
import type { MissionOutcomeRecord } from "../learning.logic";
import type { ExecutionRecord } from "../execution/types";
import type { AutonomousWorkday } from "../workday/types";
import { isSafeMemoryPayload, sanitizeMemoryText } from "./memory.safety";
import type {
  CompanyMemory,
  LearningInsightSummary,
  MemoryExpirationPolicy,
  MemoryKind,
} from "./types";

const DEFAULT_EXPIRATION: MemoryExpirationPolicy = {
  softExpireDays: 30,
  hardExpireDays: 90,
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function patternId(key: string) {
  return `mem-${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
}

function daysBetween(a: string, b: string) {
  return Math.max(0, (Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export function applyExpiration(
  memory: CompanyMemory,
  now = new Date().toISOString()
): CompanyMemory {
  const age = daysBetween(memory.lastUpdated, now);
  if (age >= memory.expiration.hardExpireDays) {
    return { ...memory, confidence: 0 };
  }
  if (age >= memory.expiration.softExpireDays) {
    const over = age - memory.expiration.softExpireDays;
    const span = Math.max(
      1,
      memory.expiration.hardExpireDays - memory.expiration.softExpireDays
    );
    const decay = Math.round((over / span) * 40);
    return { ...memory, confidence: clamp(memory.confidence - decay, 0, 100) };
  }
  return memory;
}

export function isMemoryActive(memory: CompanyMemory, now = new Date().toISOString()) {
  if (memory.ceoStatus === "removed" || memory.ceoStatus === "ignored") return false;
  const aged = applyExpiration(memory, now);
  return aged.confidence >= 25;
}

type DraftMemory = {
  kind: MemoryKind;
  patternKey: string;
  title: string;
  insight: string;
  sourceRefs: string[];
  confidenceBoost: number;
};

function upsertDraft(
  map: Map<string, DraftMemory>,
  draft: DraftMemory
) {
  if (!isSafeMemoryPayload([draft.title, draft.insight, draft.patternKey, ...draft.sourceRefs])) {
    return;
  }
  const existing = map.get(draft.patternKey);
  if (!existing) {
    map.set(draft.patternKey, {
      ...draft,
      title: sanitizeMemoryText(draft.title, 120),
      insight: sanitizeMemoryText(draft.insight, 280),
    });
    return;
  }
  existing.confidenceBoost += draft.confidenceBoost;
  existing.sourceRefs = Array.from(
    new Set([...existing.sourceRefs, ...draft.sourceRefs])
  ).slice(0, 12);
  existing.insight = sanitizeMemoryText(draft.insight, 280);
  existing.title = sanitizeMemoryText(draft.title, 120);
}

/**
 * Extract candidate memories from verified successful outcomes only.
 */
export function extractLearningDrafts(input: {
  outcomes: MissionOutcomeRecord[];
  missions: CollaborationMission[];
  executions: ExecutionRecord[];
  workday: AutonomousWorkday | null;
}): { drafts: DraftMemory[]; skippedUnsafe: number } {
  const map = new Map<string, DraftMemory>();
  let skippedUnsafe = 0;

  const successOutcomes = input.outcomes.filter((o) => o.success && o.approved);
  const failedOutcomes = input.outcomes.filter((o) => !o.success);

  for (const o of successOutcomes) {
    const emp = getEmployeeDefinition(o.leadEmployeeId);
    upsertDraft(map, {
      kind: "preferred_assignment",
      patternKey: `assign:${o.leadEmployeeId}:${domainFromTitle(o.title)}`,
      title: `Prefer ${emp?.name ?? o.leadEmployeeId} for ${domainFromTitle(o.title)} work`,
      insight: `${emp?.name ?? o.leadEmployeeId} successfully led “${o.title}”.`,
      sourceRefs: [`mission:${o.missionId}`],
      confidenceBoost: 12,
    });

    if (o.participantIds.length >= 2) {
      upsertDraft(map, {
        kind: "recurring_workflow",
        patternKey: `workflow:${[...o.participantIds].sort().join(">")}`,
        title: `Collaboration path ${o.participantIds
          .map((id) => getEmployeeDefinition(id)?.name ?? id)
          .join(" → ")}`,
        insight: `Successful multi-employee collaboration on “${o.title}”.`,
        sourceRefs: [`mission:${o.missionId}`],
        confidenceBoost: 10,
      });
    }

    if (/customer|acme|account|client/i.test(o.title)) {
      const customer = extractCustomerLabel(o.title);
      if (customer) {
        upsertDraft(map, {
          kind: "recurring_customer",
          patternKey: `customer:${customer.toLowerCase()}`,
          title: `Recurring customer: ${customer}`,
          insight: `Successful work involving ${customer}.`,
          sourceRefs: [`mission:${o.missionId}`],
          confidenceBoost: 8,
        });
      }
    }

    if (/meeting|standup|sync|brief/i.test(o.title)) {
      upsertDraft(map, {
        kind: "recurring_meeting",
        patternKey: `meeting:${domainFromTitle(o.title)}`,
        title: `Recurring meeting pattern: ${domainFromTitle(o.title)}`,
        insight: `Meeting-related mission completed successfully.`,
        sourceRefs: [`mission:${o.missionId}`],
        confidenceBoost: 8,
      });
    }

    if (/proposal|report|quote|document|notes/i.test(o.title)) {
      upsertDraft(map, {
        kind: "document_format",
        patternKey: `docfmt:${domainFromTitle(o.title)}`,
        title: `Preferred document style for ${domainFromTitle(o.title)}`,
        insight: `Document work completed successfully — keep structured drafts.`,
        sourceRefs: [`mission:${o.missionId}`],
        confidenceBoost: 7,
      });
      upsertDraft(map, {
        kind: "template_usage",
        patternKey: `template:${domainFromTitle(o.title)}`,
        title: `Template: ${domainFromTitle(o.title)}`,
        insight: `Reuse the successful document approach for similar requests.`,
        sourceRefs: [`mission:${o.missionId}`],
        confidenceBoost: 6,
      });
    }

    upsertDraft(map, {
      kind: "successful_pattern",
      patternKey: `success:${domainFromTitle(o.title)}`,
      title: `Successful pattern: ${domainFromTitle(o.title)}`,
      insight: `Approved and completed with collaboration efficiency ${o.collaborationEfficiency}.`,
      sourceRefs: [`mission:${o.missionId}`],
      confidenceBoost: 9,
    });

    if (/pipeline|revenue|sales|urgent|risk/i.test(o.title)) {
      upsertDraft(map, {
        kind: "business_priority",
        patternKey: `priority:${domainFromTitle(o.title)}`,
        title: `Business priority signal: ${domainFromTitle(o.title)}`,
        insight: `CEO-approved work in this area — raise future ranking.`,
        sourceRefs: [`mission:${o.missionId}`],
        confidenceBoost: 11,
      });
    }
  }

  // CEO approval tendencies from outcomes
  const approved = input.outcomes.filter((o) => o.approved).length;
  const rejected = input.outcomes.filter(
    (o) => !o.approved && !o.success
  ).length;
  if (approved + rejected >= 3) {
    const rate = approved / (approved + rejected);
    upsertDraft(map, {
      kind: "ceo_approval_tendency",
      patternKey: "ceo:approval-rate",
      title: "CEO approval tendency",
      insight:
        rate >= 0.7
          ? "CEO tends to approve well-prepared plans — keep previews concise."
          : rate <= 0.4
            ? "CEO often requests changes — emphasize risks and options."
            : "CEO approval rate is balanced — keep clear tradeoffs.",
      sourceRefs: input.outcomes.slice(0, 8).map((o) => `mission:${o.missionId}`),
      confidenceBoost: 10,
    });
  }

  // Executions — only verified successes
  for (const e of input.executions) {
    if (e.status !== "succeeded" || e.executionStatus !== "succeeded") continue;
    if (!e.verificationResult) continue; // never learn from failed/missing verification
    if (containsUnsafeRef(e)) {
      skippedUnsafe += 1;
      continue;
    }
    upsertDraft(map, {
      kind: "successful_pattern",
      patternKey: `exec:${e.system}:${e.action}`,
      title: `Successful ${e.system.replace(/_/g, " ")} action`,
      insight: sanitizeMemoryText(
        `${e.employeeName} completed “${e.requestedAction}” — ${e.verificationResult}`,
        240
      ),
      sourceRefs: [`execution:${e.id}`],
      confidenceBoost: 10,
    });

    if (e.system === "crm") {
      upsertDraft(map, {
        kind: "recurring_workflow",
        patternKey: "workflow:crm-followup",
        title: "CRM follow-up workflow",
        insight: "Verified CRM updates succeed after CEO approval.",
        sourceRefs: [`execution:${e.id}`],
        confidenceBoost: 8,
      });
    }
    if (e.system === "gmail") {
      upsertDraft(map, {
        kind: "recurring_workflow",
        patternKey: "workflow:email-reply",
        title: "Email reply workflow",
        insight: "Verified email sends succeed after CEO approval of drafts.",
        sourceRefs: [`execution:${e.id}`],
        confidenceBoost: 8,
      });
    }
  }

  // Failure patterns from failed missions (not unverified executions)
  for (const o of failedOutcomes.slice(0, 20)) {
    upsertDraft(map, {
      kind: "failure_pattern",
      patternKey: `fail:${domainFromTitle(o.title)}`,
      title: `Watch-out: ${domainFromTitle(o.title)}`,
      insight: `Past attempt on “${o.title}” did not succeed — prepare stronger rationale.`,
      sourceRefs: [`mission:${o.missionId}`],
      confidenceBoost: 7,
    });
  }

  // Workday results — only completed/partial with verified completed items
  if (input.workday?.endOfDayReport) {
    for (const title of input.workday.endOfDayReport.completed.slice(0, 10)) {
      upsertDraft(map, {
        kind: "successful_pattern",
        patternKey: `workday-done:${domainFromTitle(title)}`,
        title: `Workday win: ${domainFromTitle(title)}`,
        insight: `Completed during workday ${input.workday.date}.`,
        sourceRefs: [`workday:${input.workday.id}`],
        confidenceBoost: 6,
      });
    }
    for (const title of input.workday.endOfDayReport.failed.slice(0, 8)) {
      upsertDraft(map, {
        kind: "failure_pattern",
        patternKey: `workday-fail:${domainFromTitle(title)}`,
        title: `Workday friction: ${domainFromTitle(title)}`,
        insight: `Failed during workday ${input.workday.date} — review before retry.`,
        sourceRefs: [`workday:${input.workday.id}`],
        confidenceBoost: 6,
      });
    }
  }

  // Count unsafe skips from rejected drafts attempt
  for (const o of successOutcomes) {
    if (!isSafeMemoryPayload([o.title])) skippedUnsafe += 1;
  }

  return { drafts: [...map.values()], skippedUnsafe };
}

function containsUnsafeRef(e: ExecutionRecord) {
  return !isSafeMemoryPayload([
    e.requestedAction,
    e.preview.summary,
    e.verificationResult ?? "",
    e.errorDetails ?? "",
  ]);
}

function domainFromTitle(title: string) {
  const t = title.toLowerCase();
  if (/email|inbox|gmail|outreach/.test(t)) return "email";
  if (/calendar|schedule|meeting|conflict/.test(t)) return "calendar";
  if (/document|proposal|report|quote|notes/.test(t)) return "documents";
  if (/crm|pipeline|customer|deal/.test(t)) return "crm";
  if (/finance|invoice|budget/.test(t)) return "finance";
  return "general";
}

function extractCustomerLabel(title: string): string | null {
  const m = title.match(/\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})\b/);
  if (!m) return null;
  const skip = new Set([
    "Pending",
    "Overdue",
    "Urgent",
    "Meeting",
    "Document",
    "Calendar",
    "Customer",
    "Pipeline",
  ]);
  if (skip.has(m[1])) return null;
  return m[1];
}

export function mergeDraftsIntoMemories(
  existing: CompanyMemory[],
  drafts: DraftMemory[],
  now = new Date().toISOString()
): { memories: CompanyMemory[]; summary: LearningInsightSummary } {
  const byKey = new Map(
    existing.map((m) => [m.patternKey, applyExpiration(m, now)])
  );
  let created = 0;
  let updated = 0;

  for (const draft of drafts) {
    const prev = byKey.get(draft.patternKey);
    if (!prev) {
      created += 1;
      byKey.set(draft.patternKey, {
        id: patternId(draft.patternKey),
        kind: draft.kind,
        title: draft.title,
        insight: draft.insight,
        confidence: clamp(45 + draft.confidenceBoost, 25, 92),
        evidenceCount: 1,
        sourceRefs: draft.sourceRefs,
        expiration: DEFAULT_EXPIRATION,
        ceoStatus: "pending",
        patternKey: draft.patternKey,
        createdAt: now,
        lastUpdated: now,
        acceptedAt: null,
        ignoredAt: null,
      });
      continue;
    }
    if (prev.ceoStatus === "removed") continue;
    updated += 1;
    const confBoost =
      prev.ceoStatus === "accepted"
        ? draft.confidenceBoost + 4
        : draft.confidenceBoost;
    byKey.set(draft.patternKey, {
      ...prev,
      title: draft.title,
      insight: draft.insight,
      confidence: clamp(prev.confidence + Math.round(confBoost / 2), 0, 98),
      evidenceCount: prev.evidenceCount + 1,
      sourceRefs: Array.from(
        new Set([...prev.sourceRefs, ...draft.sourceRefs])
      ).slice(0, 16),
      lastUpdated: now,
    });
  }

  // Expire stale
  let expired = 0;
  const memories: CompanyMemory[] = [];
  for (const m of byKey.values()) {
    const aged = applyExpiration(m, now);
    if (aged.confidence <= 0 && aged.ceoStatus !== "accepted") {
      expired += 1;
      memories.push({ ...aged, ceoStatus: aged.ceoStatus === "removed" ? "removed" : aged.ceoStatus });
      continue;
    }
    memories.push(aged);
  }

  memories.sort(
    (a, b) => Date.parse(b.lastUpdated) - Date.parse(a.lastUpdated)
  );

  return {
    memories,
    summary: {
      created,
      updated,
      expired,
      skippedUnsafe: 0,
    },
  };
}
