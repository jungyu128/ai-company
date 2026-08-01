/**
 * OS v2 pure helpers — no I/O. Safety: never invent progress, meetings, or blockers.
 */

import type { DailyOpsSnapshot, DailyWorkItem } from "../daily-ops/types";
import type { EmployeeWorkState } from "../continuous-os/types";
import type {
  CeoBriefingV2,
  OsV2LiveEmployeeState,
  OsV2TimelineKind,
} from "./types";

/** Waiting is only valid for a real CEO gate or incomplete dependency. */
export function hasRealWaitingReason(input: {
  pendingCeoApproval: boolean;
  interrupted: boolean;
  dependencyIncomplete: boolean;
  blockedReason: string | null | undefined;
}): boolean {
  if (input.interrupted) return true;
  if (input.pendingCeoApproval) return true;
  if (input.dependencyIncomplete) return true;
  if (input.blockedReason?.trim()) return true;
  return false;
}

/**
 * Advance Continuous OS state without inventing Waiting.
 * Reviewing → Working (or Completed) unless a real CEO/dependency wait exists.
 */
export function nextWorkStateV2(
  state: EmployeeWorkState,
  opts?: {
    pendingCeoApproval?: boolean;
    interrupted?: boolean;
    dependencyIncomplete?: boolean;
    blockedReason?: string | null;
  }
): EmployeeWorkState | null {
  switch (state) {
    case "Idle":
      return "Planning";
    case "Planning":
      return "Working";
    case "Working":
      return "Reviewing";
    case "Reviewing": {
      const wait = hasRealWaitingReason({
        pendingCeoApproval: opts?.pendingCeoApproval === true,
        interrupted: opts?.interrupted === true,
        dependencyIncomplete: opts?.dependencyIncomplete === true,
        blockedReason: opts?.blockedReason ?? null,
      });
      return wait ? "Waiting" : "Working";
    }
    case "Meeting":
      return "Working";
    case "Waiting":
    case "Blocked":
    case "Completed":
      return null;
    default:
      return null;
  }
}

/** Rejected / changes-requested work returns to Planning with explanation. */
export function statusAfterCeoRejection(input: {
  action: "reject" | "request_changes";
  note: string | null;
}): {
  status: "PLANNING";
  approvalState: "rejected" | "changes_requested";
  executionPermission: "DENIED";
  blockedReason: string;
  nextAction: string;
} {
  const note = input.note?.trim() || null;
  if (input.action === "request_changes") {
    return {
      status: "PLANNING",
      approvalState: "changes_requested",
      executionPermission: "DENIED",
      blockedReason: note
        ? `CEO requested changes: ${note}`
        : "CEO requested changes — revise and re-submit",
      nextAction: "Revise plan/work item and request CEO re-approval",
    };
  }
  return {
    status: "PLANNING",
    approvalState: "rejected",
    executionPermission: "DENIED",
    blockedReason: note ?? "Rejected by CEO — returned to Planning",
    nextAction: "Replan work item for CEO re-approval",
  };
}

export function mapDailyItemToLiveEmployee(input: {
  employeeId: string;
  employeeName: string;
  role: string;
  missionTitle: string | null;
  item: DailyWorkItem | null;
  lastUpdate: string;
}): OsV2LiveEmployeeState {
  const w = input.item;
  return {
    employeeId: input.employeeId,
    employeeName: input.employeeName,
    role: input.role,
    currentMission: input.missionTitle,
    currentTask: w?.title ?? null,
    currentStep: w?.currentStep ?? null,
    progress: typeof w?.progress === "number" ? w.progress : 0,
    dependency: w?.dependencies ?? [],
    blocker: w?.blockedReason ?? null,
    waitingReason:
      w?.status === "WAITING" || w?.status === "BLOCKED"
        ? w.blockedReason ?? "Waiting"
        : w?.pendingProtectedAction
          ? `CEO protected action: ${w.pendingProtectedAction}`
          : null,
    estimatedCompletion: null,
    lastUpdate: w?.completedAt ?? w?.startedAt ?? input.lastUpdate,
    workItemId: w?.id ?? null,
    status: w?.status ?? null,
  };
}

export function buildLiveEmployeesFromDailyOps(
  snapshot: DailyOpsSnapshot
): OsV2LiveEmployeeState[] {
  const missionTitle = snapshot.today?.title ?? null;
  return snapshot.employees.map((e) => {
    const item =
      snapshot.activePlan?.proposedWorkItems.find((w) => w.id === e.workItemId) ??
      null;
    return mapDailyItemToLiveEmployee({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      role: e.role,
      missionTitle,
      item,
      lastUpdate: snapshot.asOf,
    });
  });
}

export function buildCeoBriefingV2(input: {
  snapshot: DailyOpsSnapshot;
  generatedAtDisplay: string;
  now: string;
  pendingApprovalTitles?: string[];
  opportunityTitles?: string[];
}): CeoBriefingV2 {
  const { snapshot } = input;
  const items = snapshot.activePlan?.proposedWorkItems ?? [];
  const whatChanged = snapshot.recentAudit
    .slice(0, 8)
    .map((a) => a.detail)
    .filter(Boolean);
  const currentBlockers = snapshot.blockers.map(
    (b) => `${b.title}: ${b.reason}`
  );
  const risks = (snapshot.activePlan?.risks ?? [])
    .map((r) => r.summary)
    .filter(Boolean)
    .slice(0, 8);
  const decisionsNeeded = [
    ...snapshot.approvalQueue.map((a) => a.summary),
    ...(input.pendingApprovalTitles ?? []),
  ].slice(0, 10);
  const employeesWaiting = snapshot.employees
    .filter((e) => e.waitingFor)
    .map((e) => ({
      employeeId: e.employeeId,
      employeeName: e.employeeName,
      waitingFor: e.waitingFor!,
    }));
  const completedWork = items
    .filter((w) => w.status === "COMPLETED")
    .map((w) => w.title);
  const inFlight = items.filter((w) =>
    ["WORKING", "PLANNING", "REVIEWING", "QA", "APPROVED"].includes(w.status)
  );
  const recommendedNextAction =
    decisionsNeeded[0] ??
    (currentBlockers[0]
      ? `Resolve blocker: ${currentBlockers[0]}`
      : inFlight[0]
        ? `Continue: ${inFlight[0]!.title}`
        : snapshot.today
          ? "Review Daily Directive progress"
          : "Submit today's Daily Directive");

  const headline = snapshot.today
    ? `OS v2 · ${snapshot.today.title}`
    : "OS v2 · Awaiting Daily Directive";

  const summary = [
    whatChanged[0] ?? "No recorded changes yet today.",
    currentBlockers[0] ? `Blocker: ${currentBlockers[0]}.` : "No active blockers.",
    decisionsNeeded[0]
      ? `Decision needed: ${decisionsNeeded[0]}.`
      : "No pending CEO decisions.",
    completedWork.length
      ? `Completed: ${completedWork.length} work item(s).`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    generatedAt: input.now,
    generatedAtDisplay: input.generatedAtDisplay,
    headline,
    summary,
    whatChanged,
    currentBlockers,
    risks,
    decisionsNeeded,
    employeesWaiting,
    completedWork,
    recommendedNextAction,
    highestPriorities: inFlight.map((w) => w.title).slice(0, 5),
    opportunities: (input.opportunityTitles ?? []).slice(0, 5),
    pendingApprovals: decisionsNeeded.slice(0, 5),
    suggestedActions: recommendedNextAction ? [recommendedNextAction] : [],
  };
}

/** Map OS v2 vocabulary → persisted company timeline kinds (compat). */
export function timelineKindForOsV2(
  kind: OsV2TimelineKind
):
  | "directive_submitted"
  | "work_assigned"
  | "work_started"
  | "review_started"
  | "review_completed"
  | "approval_requested"
  | "approval_granted"
  | "work_completed"
  | "blocked"
  | "resumed"
  | "meeting_started"
  | "meeting_completed"
  | "mission"
  | "planning"
  | "discussion"
  | "execution"
  | "deployment_ready" {
  switch (kind) {
    case "mission":
      return "mission";
    case "planning":
      return "planning";
    case "discussion":
      return "discussion";
    case "review":
      return "review_started";
    case "approval":
      return "approval_requested";
    case "execution":
      return "execution";
    case "completed":
      return "work_completed";
    case "blocked":
      return "blocked";
    case "resume":
      return "resumed";
    case "deployment_ready":
      return "deployment_ready";
  }
}

export function shouldEmitDeploymentReady(input: {
  workItemStatus: string;
  hasRecordedArtifacts: boolean;
  devopsReviewComplete: boolean;
}): boolean {
  return (
    input.workItemStatus === "COMPLETED" &&
    input.hasRecordedArtifacts &&
    input.devopsReviewComplete
  );
}
