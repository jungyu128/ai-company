/**
 * Morning brief + end-of-day report builders.
 */

import type { LearningStats } from "../learning.logic";
import { employeeName } from "./workday.detect";
import type {
  DailyPlanItem,
  EndOfDayReport,
  MorningBrief,
  WorkdayDetectedItem,
} from "./types";

export function buildMorningBrief(input: {
  items: WorkdayDetectedItem[];
  plan: DailyPlanItem[];
  unavailableSources: string[];
  now?: string;
}): MorningBrief {
  const generatedAt = input.now ?? new Date().toISOString();
  const byCat = (cat: WorkdayDetectedItem["category"]) =>
    input.items.filter((i) => i.category === cat);

  const topPriorities = input.plan.slice(0, 5).map((p) => ({
    title: p.title,
    reason: p.reason,
    confidence: p.confidence,
    assignedEmployeeName: p.assignedEmployeeName,
  }));

  const first = input.plan.find(
    (p) => p.status !== "disconnected" && p.status !== "completed"
  );

  const emails = byCat("email");
  const calendar = byCat("calendar");
  const docs = byCat("document");
  const crm = byCat("crm");
  const missions = byCat("mission");
  const approvals = byCat("approval");
  const integrations = byCat("integration");

  const unavailable = [...input.unavailableSources];

  return {
    generatedAt,
    topPriorities,
    urgentEmails: emails
      .filter((i) => i.urgency >= 65 && i.status !== "disconnected")
      .map((i) => i.title),
    unansweredConversations: emails
      .filter((i) => /unanswered|follow|conversation/i.test(`${i.title} ${i.detail}`))
      .map((i) => i.title),
    calendarSchedule: calendar
      .filter((i) => i.status !== "disconnected")
      .map((i) => i.title),
    calendarConflicts: calendar
      .filter((i) => /conflict/i.test(`${i.title} ${i.detail}`))
      .map((i) => i.title),
    meetingsNeedingPrep: calendar
      .filter((i) => /prep|brief|meeting/i.test(`${i.title} ${i.detail}`))
      .map((i) => i.title),
    crmFollowUps: crm
      .filter((i) => i.status !== "disconnected")
      .map((i) => i.title),
    pipelineRisks: crm
      .filter((i) => /pipeline|risk/i.test(`${i.title} ${i.detail}`))
      .map((i) => i.title),
    documentTasks: docs.map((i) => i.title),
    overdueMissions: missions
      .filter((i) => /overdue/i.test(i.title))
      .map((i) => i.title),
    pendingApprovals: approvals.map((i) => i.title),
    disconnectedIntegrations: integrations.map((i) => i.title),
    recommendedFirstAction: first
      ? {
          title: first.title,
          reason: first.reason,
          confidence: first.confidence,
          assignedEmployeeName: first.assignedEmployeeName,
        }
      : null,
    unavailableSources: unavailable,
    summary: [
      `${topPriorities.length} top priorities`,
      approvals.length > 0 ? `${approvals.length} waiting on you` : "no pending approvals",
      unavailable.length > 0
        ? `${unavailable.length} sources unavailable (no fabricated data)`
        : "connected sources inspected",
      first
        ? `start with ${first.title} (${employeeName(first.assignedEmployeeId)})`
        : "queue clear",
    ].join(" · "),
  };
}

export function buildEndOfDayReport(input: {
  plan: DailyPlanItem[];
  learning: LearningStats;
  now?: string;
}): EndOfDayReport {
  const generatedAt = input.now ?? new Date().toISOString();
  const completed = input.plan.filter((p) => p.status === "completed").map((p) => p.title);
  const skipped = input.plan.filter((p) => p.status === "skipped").map((p) => p.title);
  const failed = input.plan.filter((p) => p.status === "failed").map((p) => p.title);
  const stale = input.plan.filter((p) => p.status === "stale").map((p) => p.title);
  const pending = input.plan
    .filter((p) =>
      ["detected", "planned", "assigned", "awaiting_approval", "executing"].includes(p.status)
    )
    .map((p) => p.title);
  const blocked = input.plan
    .filter((p) => p.status === "blocked" || p.status === "disconnected")
    .map((p) => p.title);

  const hasBlocking =
    failed.length > 0 ||
    pending.length > 0 ||
    stale.length > 0 ||
    input.plan.some((p) => p.requiresCeoApproval && p.status === "disconnected");

  return {
    generatedAt,
    completed,
    skipped,
    failed,
    stale,
    pending,
    blocked,
    learningNote: `Success ${(input.learning.successRate * 100).toFixed(0)}% · approval ${(input.learning.approvalRate * 100).toFixed(0)}% · samples ${input.learning.sampleSize}`,
    summary: hasBlocking
      ? `Workday partially finished — ${completed.length} done, ${failed.length} failed, ${pending.length} still open.`
      : `Workday wrapped — ${completed.length} completed, ${skipped.length} skipped.`,
    fullyCompleted: !hasBlocking && (completed.length > 0 || input.plan.length === 0),
  };
}
