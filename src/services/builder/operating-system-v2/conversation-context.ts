/**
 * Inject real Live Work / Daily Ops state into employee conversation context.
 * Never invents progress — only surfaces recorded fields.
 */

import type { OsV2LiveEmployeeState } from "../operating-system-v2/types";

export function formatRealExecutionContext(input: {
  employeeName: string;
  live: OsV2LiveEmployeeState | null;
  recentTimelineSummaries?: string[];
}): string {
  if (!input.live) {
    return `${input.employeeName} has no recorded active work item right now.`;
  }
  const lines = [
    `Employee: ${input.live.employeeName} (${input.live.role})`,
    input.live.currentMission
      ? `Mission: ${input.live.currentMission}`
      : null,
    input.live.currentTask ? `Task: ${input.live.currentTask}` : "Task: none recorded",
    input.live.currentStep ? `Step: ${input.live.currentStep}` : null,
    `Progress: ${input.live.progress}% (from recorded status only)`,
    input.live.dependency.length
      ? `Dependencies: ${input.live.dependency.join(", ")}`
      : null,
    input.live.blocker ? `Blocker: ${input.live.blocker}` : null,
    input.live.waitingReason
      ? `Waiting: ${input.live.waitingReason}`
      : null,
    `Last update: ${input.live.lastUpdate}`,
  ].filter(Boolean);

  const timeline = (input.recentTimelineSummaries ?? []).slice(0, 5);
  if (timeline.length) {
    lines.push(`Recent recorded events: ${timeline.join(" · ")}`);
  }
  return lines.join("\n");
}

/** Reject generic filler replies that ignore execution context. */
export function looksLikeGenericConversationReply(body: string): boolean {
  const t = body.trim().toLowerCase();
  if (t.length < 12) return true;
  return [
    "sounds good",
    "let me know",
    "happy to help",
    "as an ai",
    "i'm here to help",
    "great question",
  ].some((p) => t === p || t.startsWith(p));
}
