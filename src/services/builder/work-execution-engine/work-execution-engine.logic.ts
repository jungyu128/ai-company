/**
 * Work Execution Engine — pure lifecycle projection from recorded state.
 * Never creates work items; never invents progress, files, or approvals.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import { normalizeDailyWorkItem } from "../daily-ops/daily-ops.logic";
import type { DailyDirective, DailyExecutionPlan, DailyWorkItem } from "../daily-ops/types";
import type {
  WorkExecutionEngineView,
  WorkExecutionItemView,
  WorkLifecycleStage,
  WorkLifecycleStageId,
  WorkLifecycleStageStatus,
  WorkpilotLifecycleLink,
} from "./types";

const STAGE_LABELS: Record<WorkLifecycleStageId, string> = {
  ceo_directive: "CEO Directive",
  company_brain: "Company Brain prioritizes",
  product_planning: "Product planning",
  architecture: "Architecture",
  task_breakdown: "Task breakdown",
  automatic_assignment: "Automatic assignment",
  development: "Development",
  internal_reviews: "Internal reviews",
  qa: "QA",
  regression_tests: "Regression tests",
  executive_recommendation: "Executive recommendation",
  ceo_approval: "CEO approval",
  merge_ready: "Merge ready",
  deployment_ready: "Deployment ready",
};

function employeeName(id: string): string {
  return getEmployeeDefinition(id)?.name ?? id;
}

function isPlanningItem(w: DailyWorkItem): boolean {
  return /product manager|requirements|success criteria/i.test(
    `${w.title} ${w.objective} ${w.permanentRole}`
  );
}

function isArchitectureItem(w: DailyWorkItem): boolean {
  return /architect|architecture|technical approach/i.test(
    `${w.title} ${w.objective} ${w.permanentRole}`
  );
}

function isDevItem(w: DailyWorkItem): boolean {
  return /frontend|backend|engineer|implement/i.test(
    `${w.title} ${w.objective} ${w.permanentRole}`
  );
}

function isQaItem(w: DailyWorkItem): boolean {
  return /qa|verification|test plan/i.test(
    `${w.title} ${w.objective} ${w.permanentRole}`
  );
}

function stageStatus(opts: {
  active?: boolean;
  completed: boolean;
  blocked?: boolean;
  waitingCeo?: boolean;
  started?: boolean;
}): WorkLifecycleStageStatus {
  if (opts.waitingCeo) return "waiting_ceo";
  if (opts.blocked) return "blocked";
  if (opts.completed) return "completed";
  if (opts.active) return "active";
  if (opts.started) return "active";
  return "not_started";
}

function anyStatus(
  items: DailyWorkItem[],
  statuses: string[]
): DailyWorkItem[] {
  return items.filter((w) => statuses.includes(w.status));
}

function allDone(items: DailyWorkItem[]): boolean {
  return items.length > 0 && items.every((w) => w.status === "COMPLETED");
}

function anyPast(
  items: DailyWorkItem[],
  statuses: string[]
): boolean {
  const order = [
    "PROPOSED",
    "AWAITING_APPROVAL",
    "APPROVED",
    "PLANNING",
    "WORKING",
    "REVIEWING",
    "QA",
    "COMPLETED",
  ];
  const minIdx = Math.min(
    ...statuses.map((s) => order.indexOf(s)).filter((i) => i >= 0)
  );
  return items.some((w) => {
    const idx = order.indexOf(w.status);
    return idx >= minIdx && idx >= 0;
  });
}

export function toWorkExecutionItemView(
  item: DailyWorkItem,
  all: DailyWorkItem[]
): WorkExecutionItemView {
  const w = normalizeDailyWorkItem(item);
  const byId = new Map(all.map((x) => [x.id, x]));
  return {
    id: w.id,
    title: w.title,
    objective: w.objective,
    ownerId: w.assignedEmployeeId,
    ownerName: employeeName(w.assignedEmployeeId),
    permanentRole: w.permanentRole,
    status: w.status,
    progress: w.progress,
    currentStep: w.currentStep,
    nextAction: w.nextAction,
    dependencies: w.dependencies,
    dependencyTitles: w.dependencies.map(
      (id) => byId.get(id)?.title ?? id
    ),
    acceptanceCriteria: w.acceptanceCriteria,
    implementationPlan: w.implementationPlan,
    affectedModules: w.affectedModules,
    estimatedEffort: w.estimatedEffort,
    risks: w.risks,
    testPlan: w.testPlan,
    reviewOwnerId: w.reviewOwnerId,
    reviewOwnerName: employeeName(w.reviewOwnerId),
    qaOwnerId: w.qaOwnerId,
    qaOwnerName: employeeName(w.qaOwnerId),
    executionPermission: w.executionPermission,
    pendingProtectedAction: w.pendingProtectedAction,
    blockedReason: w.blockedReason,
    changedFiles: w.changedFiles,
    outputs: w.outputs,
  };
}

export function buildCollaborationNotes(
  items: DailyWorkItem[],
  deps: DailyExecutionPlan["dependencies"] | undefined
): string[] {
  const notes: string[] = [];
  for (const d of deps ?? []) {
    const from = items.find((w) => w.id === d.fromWorkItemId);
    const to = items.find((w) => w.id === d.toWorkItemId);
    if (from && to) {
      notes.push(
        `${employeeName(from.assignedEmployeeId)} → ${employeeName(to.assignedEmployeeId)}: ${d.description}`
      );
    }
  }
  for (const w of items) {
    const nw = normalizeDailyWorkItem(w);
    if (nw.status === "REVIEWING" || nw.status === "QA") {
      notes.push(
        `${employeeName(nw.assignedEmployeeId)} collaborating with review=${employeeName(nw.reviewOwnerId)}, QA=${employeeName(nw.qaOwnerId)} on “${nw.title}”`
      );
    }
  }
  return notes.slice(0, 12);
}

export function buildLifecycleStages(input: {
  directive: DailyDirective | null;
  plan: DailyExecutionPlan | null;
  workItems: DailyWorkItem[];
  brainPrioritized: boolean;
  executiveRecommendationPresent: boolean;
  approvalPendingCount: number;
  protectedPendingCount: number;
  workpilot: WorkpilotLifecycleLink[];
}): WorkLifecycleStage[] {
  const items = input.workItems.map(normalizeDailyWorkItem);
  const planning = items.filter(isPlanningItem);
  const architecture = items.filter(isArchitectureItem);
  const development = items.filter(isDevItem);
  const qaItems = items.filter(isQaItem);

  const mergeReady = input.workpilot.filter(
    (p) => p.status === "succeeded" || p.status === "approved"
  );
  const deployBlocked =
    input.protectedPendingCount > 0 ||
    items.some(
      (w) =>
        w.pendingProtectedAction === "production_deployment" ||
        w.pendingProtectedAction === "release_action"
    );

  const allWorkComplete = allDone(items);
  const anyGranted = items.some((w) => w.executionPermission === "GRANTED");
  const anyReview = anyStatus(items, ["REVIEWING"]).length > 0 ||
    anyPast(items, ["QA"]);
  const anyQa =
    anyStatus(items, ["QA"]).length > 0 || anyPast(qaItems.length ? qaItems : items, ["COMPLETED"]);
  const regressionDone =
    qaItems.some((w) => w.status === "COMPLETED") ||
    input.workpilot.some(
      (p) => p.testSummary && /pass|passed|ok/i.test(p.testSummary)
    );

  const stages: WorkLifecycleStage[] = [
    {
      id: "ceo_directive",
      label: STAGE_LABELS.ceo_directive,
      status: stageStatus({
        completed: !!input.directive,
        active: !!input.directive && !input.plan,
        started: !!input.directive,
      }),
      detail: input.directive
        ? `${input.directive.title} (${input.directive.status})`
        : "No Daily Directive recorded",
      workItemIds: [],
    },
    {
      id: "company_brain",
      label: STAGE_LABELS.company_brain,
      status: stageStatus({
        completed: input.brainPrioritized && !!input.directive,
        active: input.brainPrioritized && !!input.directive,
        started: input.brainPrioritized,
      }),
      detail: input.brainPrioritized
        ? "Brain recommendation derived from recorded company state"
        : "Brain not yet observed for this cycle",
      workItemIds: [],
    },
    {
      id: "product_planning",
      label: STAGE_LABELS.product_planning,
      status: stageStatus({
        completed: allDone(planning) || (planning.length === 0 && anyPast(items, ["APPROVED"])),
        active: anyStatus(planning, ["PLANNING", "WORKING", "APPROVED"]).length > 0,
        blocked: anyStatus(planning, ["BLOCKED"]).length > 0,
        waitingCeo: anyStatus(planning, ["AWAITING_APPROVAL", "PROPOSED"]).length > 0 &&
          !anyGranted,
        started: planning.length > 0,
      }),
      detail:
        planning[0] != null
          ? `${planning[0].title} · ${planning[0].status}`
          : items.length > 0
            ? "No dedicated product-planning item in recorded plan"
            : null,
      workItemIds: planning.map((w) => w.id),
    },
    {
      id: "architecture",
      label: STAGE_LABELS.architecture,
      status: stageStatus({
        completed: allDone(architecture),
        active: anyStatus(architecture, ["PLANNING", "WORKING", "APPROVED", "REVIEWING"]).length > 0,
        blocked: anyStatus(architecture, ["BLOCKED"]).length > 0,
        started: architecture.length > 0,
      }),
      detail: architecture[0]
        ? `${architecture[0].title} · ${architecture[0].status}`
        : null,
      workItemIds: architecture.map((w) => w.id),
    },
    {
      id: "task_breakdown",
      label: STAGE_LABELS.task_breakdown,
      status: stageStatus({
        completed: !!input.plan && items.length > 0,
        active: !!input.plan && items.some((w) => w.status === "PROPOSED"),
        started: !!input.plan,
      }),
      detail: input.plan
        ? `Plan v${input.plan.planVersion}: ${items.length} work item(s)`
        : "No execution plan recorded",
      workItemIds: items.map((w) => w.id),
    },
    {
      id: "automatic_assignment",
      label: STAGE_LABELS.automatic_assignment,
      status: stageStatus({
        completed:
          !!input.plan &&
          (input.plan.employeeAssignments?.length ?? 0) > 0 &&
          items.every((w) => !!w.assignedEmployeeId),
        active: items.some((w) => !!w.assignedEmployeeId),
        started: items.length > 0,
      }),
      detail:
        items.length > 0
          ? `${new Set(items.map((w) => w.assignedEmployeeId)).size} owner(s) assigned by permanent role`
          : null,
      workItemIds: items.map((w) => w.id),
    },
    {
      id: "development",
      label: STAGE_LABELS.development,
      status: stageStatus({
        completed:
          development.length > 0
            ? allDone(development) ||
              development.every((w) =>
                ["REVIEWING", "QA", "COMPLETED"].includes(w.status)
              )
            : anyPast(items, ["REVIEWING"]),
        active: anyStatus(development.length ? development : items, [
          "WORKING",
          "PLANNING",
        ]).length > 0,
        blocked: anyStatus(development.length ? development : items, ["BLOCKED"])
          .length > 0,
        waitingCeo:
          input.protectedPendingCount > 0 &&
          anyStatus(development.length ? development : items, ["BLOCKED"]).length >
            0,
        started: anyGranted || anyPast(items, ["WORKING"]),
      }),
      detail:
        anyStatus(items, ["WORKING"]).map((w) => w.title).join("; ") ||
        (anyGranted ? "Granted work advancing" : "Awaiting CEO execution grant"),
      workItemIds: (development.length ? development : anyStatus(items, ["WORKING", "PLANNING"])).map(
        (w) => w.id
      ),
    },
    {
      id: "internal_reviews",
      label: STAGE_LABELS.internal_reviews,
      status: "not_started",
      detail: null,
      workItemIds: [],
    },
    {
      id: "qa",
      label: STAGE_LABELS.qa,
      status: stageStatus({
        completed:
          qaItems.length > 0
            ? allDone(qaItems)
            : anyStatus(items, ["QA"]).length === 0 && anyPast(items, ["COMPLETED"]),
        active: anyStatus(items, ["QA"]).length > 0,
        started: anyQa,
      }),
      detail:
        anyStatus(items, ["QA"])
          .map(
            (w) =>
              `${w.title} → QA ${employeeName(normalizeDailyWorkItem(w).qaOwnerId)}`
          )
          .join("; ") || null,
      workItemIds: anyStatus(items, ["QA"]).map((w) => w.id),
    },
    {
      id: "regression_tests",
      label: STAGE_LABELS.regression_tests,
      status: stageStatus({
        completed: regressionDone,
        active:
          anyStatus(items, ["QA"]).length > 0 ||
          input.workpilot.some((p) => p.status === "applying" || p.status === "preparing"),
        started: anyQa || input.workpilot.length > 0,
      }),
      detail:
        input.workpilot
          .map((p) => p.testSummary)
          .filter(Boolean)
          .slice(0, 2)
          .join("; ") ||
        (regressionDone
          ? "QA completion recorded (regression covered by test plan)"
          : null),
      workItemIds: qaItems.map((w) => w.id),
    },
    {
      id: "executive_recommendation",
      label: STAGE_LABELS.executive_recommendation,
      status: stageStatus({
        completed: input.executiveRecommendationPresent,
        active: input.executiveRecommendationPresent,
        started: input.executiveRecommendationPresent,
      }),
      detail: input.executiveRecommendationPresent
        ? "Company Brain recommendation available in Operating Center"
        : null,
      workItemIds: [],
    },
    {
      id: "ceo_approval",
      label: STAGE_LABELS.ceo_approval,
      status: stageStatus({
        waitingCeo: input.approvalPendingCount > 0 || input.protectedPendingCount > 0,
        completed:
          input.approvalPendingCount === 0 &&
          input.protectedPendingCount === 0 &&
          (anyGranted || allWorkComplete),
        active: input.approvalPendingCount > 0 || input.protectedPendingCount > 0,
        started: !!input.plan,
      }),
      detail:
        input.protectedPendingCount > 0
          ? `${input.protectedPendingCount} protected action(s) need CEO`
          : input.approvalPendingCount > 0
            ? `${input.approvalPendingCount} approval(s) pending`
            : anyGranted
              ? "Execution grants recorded"
              : null,
      workItemIds: items
        .filter(
          (w) =>
            w.approvalState === "pending" || w.pendingProtectedAction != null
        )
        .map((w) => w.id),
    },
    {
      id: "merge_ready",
      label: STAGE_LABELS.merge_ready,
      status: stageStatus({
        completed: mergeReady.length > 0,
        waitingCeo: input.workpilot.some((p) => p.status === "awaiting_approval"),
        active: input.workpilot.some(
          (p) => p.status === "awaiting_approval" || p.status === "applying"
        ),
        started: input.workpilot.length > 0,
      }),
      detail:
        mergeReady.length > 0
          ? `${mergeReady.length} package(s) PR-ready (merge refused without separate CEO process)`
          : input.workpilot.some((p) => p.status === "awaiting_approval")
            ? "WorkPilot package awaiting CEO approval before PR"
            : "No WorkPilot execution package recorded",
      workItemIds: [],
    },
    {
      id: "deployment_ready",
      label: STAGE_LABELS.deployment_ready,
      status: stageStatus({
        waitingCeo: deployBlocked || (allWorkComplete && mergeReady.length > 0),
        completed: false, // never auto-complete deploy
        blocked: deployBlocked,
        started: allWorkComplete || mergeReady.length > 0,
      }),
      detail: deployBlocked
        ? "Deployment blocked — protected CEO approval required"
        : allWorkComplete && mergeReady.length > 0
          ? "Lifecycle complete through merge-ready; deployment still requires explicit CEO approval"
          : allWorkComplete
            ? "Work complete; no deploy without protected CEO approval"
            : null,
      workItemIds: items
        .filter(
          (w) =>
            w.pendingProtectedAction === "production_deployment" ||
            w.pendingProtectedAction === "release_action"
        )
        .map((w) => w.id),
    },
  ];

  // Internal reviews — derived after other stages for clearer status.
  const reviewStage = stages.find((s) => s.id === "internal_reviews")!;
  const reviewingNow = anyStatus(items, ["REVIEWING"]);
  const reviewsDone =
    items.some((w) => ["QA", "COMPLETED"].includes(w.status)) &&
    reviewingNow.length === 0 &&
    anyReview;
  reviewStage.status = stageStatus({
    completed: reviewsDone,
    active: reviewingNow.length > 0,
    started: anyReview,
  });
  reviewStage.detail =
    reviewingNow
      .map(
        (w) =>
          `${w.title} → review ${employeeName(normalizeDailyWorkItem(w).reviewOwnerId)}`
      )
      .join("; ") ||
    (reviewsDone ? "Reviews completed for advancing items" : null);
  reviewStage.workItemIds = reviewingNow.map((w) => w.id);

  return stages;
}

export function buildWorkExecutionEngineView(input: {
  generatedAt: string;
  generatedAtDisplay: string;
  directive: DailyDirective | null;
  plan: DailyExecutionPlan | null;
  brainPrioritized: boolean;
  executiveRecommendationPresent: boolean;
  approvalPendingCount: number;
  protectedPendingCount: number;
  workpilot: WorkpilotLifecycleLink[];
}): WorkExecutionEngineView {
  const rawItems = (input.plan?.proposedWorkItems ?? []).map(normalizeDailyWorkItem);
  const workItems = rawItems.map((w) => toWorkExecutionItemView(w, rawItems));
  const stages = buildLifecycleStages({
    directive: input.directive,
    plan: input.plan,
    workItems: rawItems,
    brainPrioritized: input.brainPrioritized,
    executiveRecommendationPresent: input.executiveRecommendationPresent,
    approvalPendingCount: input.approvalPendingCount,
    protectedPendingCount: input.protectedPendingCount,
    workpilot: input.workpilot,
  });

  const mergeReadyCount = input.workpilot.filter(
    (p) => p.status === "succeeded" || p.status === "approved"
  ).length;
  const deploymentBlockedReason =
    input.protectedPendingCount > 0
      ? `${input.protectedPendingCount} protected approval(s) still required`
      : rawItems.some(
            (w) =>
              w.pendingProtectedAction === "production_deployment" ||
              w.pendingProtectedAction === "release_action"
          )
        ? "Production/release protected action pending CEO"
        : null;

  const deploymentReady =
    rawItems.length > 0 &&
    rawItems.every((w) => w.status === "COMPLETED") &&
    mergeReadyCount > 0 &&
    !deploymentBlockedReason;

  const activeStage = stages.find((s) => s.status === "active" || s.status === "waiting_ceo");
  const summary = !input.directive
    ? "No recorded CEO directive — Work Execution Engine idle (nothing fabricated)."
    : activeStage
      ? `Lifecycle at “${activeStage.label}”: ${activeStage.detail ?? activeStage.status}`
      : `Directive “${input.directive.title}” recorded with ${workItems.length} work item(s).`;

  return {
    generatedAt: input.generatedAt,
    generatedAtDisplay: input.generatedAtDisplay,
    hasRecordedWork: !!input.directive || workItems.length > 0,
    directive: input.directive
      ? {
          id: input.directive.id,
          title: input.directive.title,
          status: input.directive.status,
          priority: input.directive.priority,
          paused: input.directive.paused,
        }
      : null,
    plan: input.plan
      ? {
          id: input.plan.id,
          version: input.plan.planVersion,
          status: input.plan.status,
          objectiveSummary: input.plan.objectiveSummary,
        }
      : null,
    stages,
    workItems,
    collaborationNotes: buildCollaborationNotes(
      rawItems,
      input.plan?.dependencies
    ),
    workpilotPackages: input.workpilot,
    protectedApprovalsPending: input.protectedPendingCount,
    mergeReadyCount,
    deploymentReady,
    deploymentBlockedReason,
    summary,
  };
}
