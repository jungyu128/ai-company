/**
 * Daily Ops planning, assignment, progress from real state transitions.
 * No fabricated ETAs or fake background progress.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
  matchEmployeeIdForText,
} from "../ai-company-employees";
import { evaluateRoleMissionFit } from "../autonomous-company/employee-role.logic";
import type {
  DailyDependency,
  DailyDirective,
  DailyDirectivePriority,
  DailyEmployeeAssignment,
  DailyExecutionPlan,
  DailyReport,
  DailyRisk,
  DailyWorkItem,
  DailyWorkItemStatus,
  ProtectedActionKind,
} from "./types";

/** Progress derived only from discrete work-item status — never invented mid-step %. */
export const STATUS_PROGRESS: Record<DailyWorkItemStatus, number> = {
  PROPOSED: 0,
  AWAITING_APPROVAL: 0,
  APPROVED: 5,
  PLANNING: 15,
  WORKING: 40,
  REVIEWING: 65,
  QA: 80,
  WAITING: 50,
  BLOCKED: 35,
  COMPLETED: 100,
  REJECTED: 0,
  CANCELLED: 0,
};

export const STATUS_STEP: Record<DailyWorkItemStatus, string> = {
  PROPOSED: "Proposed — awaiting CEO plan approval",
  AWAITING_APPROVAL: "Awaiting CEO approval",
  APPROVED: "Approved — ready to plan",
  PLANNING: "Planning approach",
  WORKING: "Executing approved work",
  REVIEWING: "Peer / role review",
  QA: "QA verification",
  WAITING: "Waiting on dependency or approval",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export const NEXT_ACTION_FOR: Record<DailyWorkItemStatus, string> = {
  PROPOSED: "Await CEO plan decision",
  AWAITING_APPROVAL: "Await CEO work-item approval",
  APPROVED: "Begin planning",
  PLANNING: "Move into working",
  WORKING: "Request review when slice ready",
  REVIEWING: "Address feedback or hand to QA",
  QA: "Verify acceptance criteria",
  WAITING: "Unblock dependency",
  BLOCKED: "Escalate blocker to CEO",
  COMPLETED: "Hand off output",
  REJECTED: "Do not execute",
  CANCELLED: "No further action",
};

export const PROTECTED_ACTIONS: ProtectedActionKind[] = [
  "code_or_file_modification",
  "database_schema_change",
  "external_message_or_email",
  "production_deployment",
  "destructive_action",
  "financial_action",
  "permission_change",
  "role_change",
  "release_action",
  "irreversible_external_side_effect",
];

const PROTECTED_HINTS: Array<{ kind: ProtectedActionKind; patterns: RegExp[] }> = [
  {
    kind: "code_or_file_modification",
    patterns: [/implement/i, /\bcode\b/i, /\bfile\b/i, /\bpr\b/i, /refactor/i],
  },
  {
    kind: "database_schema_change",
    patterns: [/schema/i, /migration/i, /prisma/i, /database/i],
  },
  {
    kind: "external_message_or_email",
    patterns: [/email/i, /send message/i, /outreach/i],
  },
  {
    kind: "production_deployment",
    patterns: [/deploy/i, /production/i],
  },
  {
    kind: "destructive_action",
    patterns: [/delete/i, /drop table/i, /force.?push/i],
  },
  {
    kind: "release_action",
    patterns: [/release/i, /ship to prod/i],
  },
  {
    kind: "role_change",
    patterns: [/change role/i, /reassign role/i],
  },
  {
    kind: "permission_change",
    patterns: [/permission/i, /rbac/i],
  },
];

export function newDailyId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function progressForStatus(status: DailyWorkItemStatus): number {
  return STATUS_PROGRESS[status] ?? 0;
}

export function detectProtectedActionHint(
  text: string
): ProtectedActionKind | null {
  for (const row of PROTECTED_HINTS) {
    if (row.patterns.some((p) => p.test(text))) return row.kind;
  }
  return null;
}

/**
 * Assign work to a permanent employee by domain fit; refuse off-role and recommend.
 */
export function assignEmployeeForObjective(objective: string): {
  employeeId: string;
  permanentRole: string;
  reasonForAssignment: string;
  refusedFrom: string | null;
  refuseMessage: string | null;
} {
  const matched = matchEmployeeIdForText(objective);
  const candidateId = matched ?? "sarah";
  const fit = evaluateRoleMissionFit({
    employeeId: candidateId,
    objectiveText: objective,
  });

  if (fit.ok) {
    const emp = getEmployeeDefinition(candidateId)!;
    return {
      employeeId: emp.id,
      permanentRole: emp.role,
      reasonForAssignment: `Assigned to ${emp.name} (${emp.role}) based on domain fit and permanent responsibilities.`,
      refusedFrom: null,
      refuseMessage: null,
    };
  }

  const recommendedId = fit.recommendedEmployeeId ?? "sarah";
  const emp = getEmployeeDefinition(recommendedId) ?? AI_COMPANY_EMPLOYEES[0]!;
  return {
    employeeId: emp.id,
    permanentRole: emp.role,
    reasonForAssignment: `Reassigned to ${emp.name} (${emp.role}) after off-role refuse for prior candidate.`,
    refusedFrom: candidateId,
    refuseMessage: fit.refuseMessage,
  };
}

export function clarifyDirectiveOutcome(directive: DailyDirective): {
  clarifiedOutcome: string;
  analysisNotes: string;
  assumptions: string[];
} {
  const outcome =
    directive.intendedOutcome.trim() ||
    `Deliver a clear WorkPilot HQ outcome for: ${directive.instruction.slice(0, 160)}`;
  return {
    clarifiedOutcome: outcome,
    analysisNotes: [
      `Interpreted directive "${directive.title}" as a same-day WorkPilot product-engineering objective.`,
      "Planning and discussion may proceed; implementation requires explicit CEO approval of the plan and work items.",
      "Permanent employee roles remain locked — assignments use expertise and allowed actions only.",
    ].join(" "),
    assumptions: [
      "CEO will approve or reject the proposed plan before any implementation.",
      "Protected actions pause for a separate CEO approval.",
      "No WorkPilot customer systems are connected for this plan.",
    ],
  };
}

type SliceSpec = {
  title: string;
  objective: string;
  expectedOutput: string;
  acceptanceCriteria: string[];
  priority: DailyDirectivePriority;
};

function proposeSlices(directive: DailyDirective): SliceSpec[] {
  const base = directive.instruction.trim();
  const outcome = directive.intendedOutcome.trim() || base;
  return [
    {
      title: "Clarify requirements & success criteria",
      objective: `As Product Manager, capture requirements and acceptance criteria for: ${outcome}`,
      expectedOutput: "Requirements brief with acceptance criteria",
      acceptanceCriteria: [
        "Intended outcome is explicit",
        "Out-of-scope items listed",
        "Acceptance criteria are testable",
      ],
      priority: directive.priority,
    },
    {
      title: "Architecture / technical approach",
      objective: `As Software Architect, outline a safe technical approach for: ${outcome}`,
      expectedOutput: "Architecture note with risks and boundaries",
      acceptanceCriteria: [
        "Approach respects role boundaries",
        "Risks and dependencies listed",
        "No production deploy implied",
      ],
      priority: directive.priority,
    },
    {
      title: "Frontend implementation slice",
      objective: `As Frontend Engineer, implement UI for approved scope of: ${outcome}`,
      expectedOutput: "UI slice on a feature branch (requires CEO execution approval)",
      acceptanceCriteria: [
        "Matches product acceptance criteria",
        "Accessible and reviewable",
        "No production deploy",
      ],
      priority: directive.priority,
    },
    {
      title: "Backend / API slice",
      objective: `As Backend Engineer, implement API/data contracts for: ${outcome}`,
      expectedOutput: "API/contract slice (requires CEO execution approval)",
      acceptanceCriteria: [
        "Contracts documented",
        "No schema change without protected-action approval",
        "Error envelopes clear",
      ],
      priority: directive.priority,
    },
    {
      title: "QA verification plan",
      objective: `As QA Engineer, design and run verification for: ${outcome}`,
      expectedOutput: "Test plan + findings",
      acceptanceCriteria: [
        "Acceptance criteria covered",
        "Findings filed with evidence",
        "No incomplete work marked complete",
      ],
      priority: directive.priority,
    },
  ];
}

export function buildProposedPlan(input: {
  directive: DailyDirective;
  planVersion: number;
  now: string;
  changeNote?: string | null;
}): DailyExecutionPlan {
  const { directive, planVersion, now } = input;
  const clarified = clarifyDirectiveOutcome(directive);
  const slices = proposeSlices(directive);
  const planId = newDailyId("dplan");

  const workItems: DailyWorkItem[] = [];
  const refusals: string[] = [];

  for (const slice of slices) {
    const assign = assignEmployeeForObjective(slice.objective);
    if (assign.refuseMessage) {
      refusals.push(assign.refuseMessage);
    }
    const emp = getEmployeeDefinition(assign.employeeId)!;
    const protectedHint = detectProtectedActionHint(slice.objective);
    const id = newDailyId("dwi");
    workItems.push({
      id,
      directiveId: directive.id,
      planId,
      title: slice.title,
      objective: slice.objective,
      assignedEmployeeId: emp.id,
      permanentRole: emp.role,
      reasonForAssignment: assign.reasonForAssignment,
      status: "PROPOSED",
      priority: slice.priority,
      dependencies: [],
      currentStep: STATUS_STEP.PROPOSED,
      progress: progressForStatus("PROPOSED"),
      expectedOutput: slice.expectedOutput,
      acceptanceCriteria: slice.acceptanceCriteria,
      requiredReviewers: defaultReviewersFor(emp.id),
      approvalState: "pending",
      executionPermission: "DENIED",
      startedAt: null,
      completedAt: null,
      blockedReason: null,
      nextAction: NEXT_ACTION_FOR.PROPOSED,
      pendingProtectedAction: protectedHint,
      pendingProtectedReason: protectedHint
        ? `Protected action ${protectedHint} requires separate CEO approval before side effects.`
        : null,
      outputs: [],
      changedFiles: [],
      lastExecutionKey: null,
    });
  }

  // Dependencies: product → architecture → FE/BE → QA
  const deps: DailyDependency[] = [];
  if (workItems.length >= 5) {
    const [pm, arch, fe, be, qa] = workItems;
    deps.push(
      {
        id: newDailyId("dep"),
        fromWorkItemId: pm!.id,
        toWorkItemId: arch!.id,
        description: "Architecture waits on clarified requirements",
      },
      {
        id: newDailyId("dep"),
        fromWorkItemId: arch!.id,
        toWorkItemId: fe!.id,
        description: "Frontend waits on architecture note",
      },
      {
        id: newDailyId("dep"),
        fromWorkItemId: arch!.id,
        toWorkItemId: be!.id,
        description: "Backend waits on architecture note",
      },
      {
        id: newDailyId("dep"),
        fromWorkItemId: fe!.id,
        toWorkItemId: qa!.id,
        description: "QA waits on frontend slice",
      },
      {
        id: newDailyId("dep"),
        fromWorkItemId: be!.id,
        toWorkItemId: qa!.id,
        description: "QA waits on backend slice",
      }
    );
    for (const w of workItems) {
      w.dependencies = deps
        .filter((d) => d.toWorkItemId === w.id)
        .map((d) => d.fromWorkItemId);
    }
  }

  const byEmp = new Map<string, string[]>();
  for (const w of workItems) {
    const list = byEmp.get(w.assignedEmployeeId) ?? [];
    list.push(w.id);
    byEmp.set(w.assignedEmployeeId, list);
  }

  const employeeAssignments: DailyEmployeeAssignment[] = [...byEmp.entries()].map(
    ([employeeId, workItemIds]) => {
      const emp = getEmployeeDefinition(employeeId)!;
      const first = workItems.find((w) => w.id === workItemIds[0]);
      return {
        employeeId,
        employeeName: emp.name,
        permanentRole: emp.role,
        workItemIds,
        reason: first?.reasonForAssignment ?? "Role-appropriate assignment",
      };
    }
  );

  const risks: DailyRisk[] = [
    {
      id: newDailyId("risk"),
      summary: "Implementation must not start before CEO approval",
      severity: "high",
      mitigation: "executionPermission defaults to DENIED on every work item",
      relatedWorkItemIds: workItems.map((w) => w.id),
    },
    {
      id: newDailyId("risk"),
      summary: "Protected actions may pause mid-execution",
      severity: "medium",
      mitigation: "Separate CEO approve_protected_action gate",
      relatedWorkItemIds: workItems
        .filter((w) => w.pendingProtectedAction)
        .map((w) => w.id),
    },
    ...refusals.slice(0, 3).map((msg) => ({
      id: newDailyId("risk"),
      summary: `Off-role refuse during planning: ${msg.slice(0, 120)}`,
      severity: "low" as const,
      mitigation: "Reassigned to permanent role owner",
      relatedWorkItemIds: [] as string[],
    })),
  ];

  if (input.changeNote) {
    risks.unshift({
      id: newDailyId("risk"),
      summary: `Plan change requested: ${input.changeNote.slice(0, 160)}`,
      severity: "medium",
      mitigation: "New plan version requires fresh CEO approval",
      relatedWorkItemIds: [],
    });
  }

  return {
    id: planId,
    directiveId: directive.id,
    objectiveSummary: clarified.clarifiedOutcome,
    assumptions: clarified.assumptions,
    proposedWorkItems: workItems,
    employeeAssignments,
    dependencies: deps,
    risks,
    expectedOutputs: workItems.map((w) => w.expectedOutput),
    successCriteria: [
      "CEO approved plan (full or selected items) before any WORKING status",
      "All completed items have acceptance criteria met",
      "No protected action executed without explicit CEO approval",
      "Permanent roles unchanged",
    ],
    approvalRequirements: [
      {
        id: newDailyId("apr"),
        kind: "plan",
        workItemId: null,
        protectedAction: null,
        summary: `Approve Daily Execution Plan v${planVersion} for "${directive.title}"`,
        status: "pending",
      },
      ...workItems.map((w) => ({
        id: newDailyId("apr"),
        kind: "work_item" as const,
        workItemId: w.id,
        protectedAction: null,
        summary: `Approve work item: ${w.title} → ${w.assignedEmployeeId}`,
        status: "pending" as const,
      })),
      ...workItems
        .filter((w) => w.pendingProtectedAction)
        .map((w) => ({
          id: newDailyId("apr"),
          kind: "protected_action" as const,
          workItemId: w.id,
          protectedAction: w.pendingProtectedAction,
          summary: `Approve protected action ${w.pendingProtectedAction} for: ${w.title}`,
          status: "pending" as const,
        })),
    ],
    estimatedSequence: workItems.map((w) => w.id),
    planVersion,
    status: "PROPOSED",
    createdAt: now,
    updatedAt: now,
    supersededByPlanId: null,
    immutable: false,
  };
}

function defaultReviewersFor(employeeId: string): string[] {
  if (employeeId === "alex" || employeeId === "david") return ["olivia", "emma"];
  if (employeeId === "sarah") return ["sophia"];
  if (employeeId === "olivia") return ["sophia", "noah"];
  if (employeeId === "emma") return ["daniel"];
  return ["emma"];
}

export function applyWorkItemStatus(
  item: DailyWorkItem,
  status: DailyWorkItemStatus,
  now: string,
  extras?: Partial<DailyWorkItem>
): DailyWorkItem {
  const startedAt =
    status === "PLANNING" || status === "WORKING"
      ? item.startedAt ?? now
      : item.startedAt;
  const completedAt = status === "COMPLETED" ? now : item.completedAt;
  return {
    ...item,
    ...extras,
    status,
    progress: progressForStatus(status),
    currentStep: STATUS_STEP[status],
    nextAction: NEXT_ACTION_FOR[status],
    startedAt,
    completedAt,
  };
}

export function dependenciesSatisfied(
  item: DailyWorkItem,
  all: DailyWorkItem[]
): boolean {
  if (!item.dependencies.length) return true;
  const byId = new Map(all.map((w) => [w.id, w]));
  return item.dependencies.every((depId) => {
    const dep = byId.get(depId);
    return dep?.status === "COMPLETED";
  });
}

export function workSummaryCounts(items: DailyWorkItem[]) {
  const executing = new Set([
    "APPROVED",
    "PLANNING",
    "WORKING",
    "REVIEWING",
    "QA",
    "WAITING",
  ]);
  return {
    proposed: items.filter((w) => w.status === "PROPOSED").length,
    awaitingApproval: items.filter((w) => w.status === "AWAITING_APPROVAL").length,
    approved: items.filter(
      (w) => w.executionPermission === "GRANTED" && w.status !== "REJECTED"
    ).length,
    executing: items.filter((w) => executing.has(w.status)).length,
    blocked: items.filter((w) => w.status === "BLOCKED").length,
    completed: items.filter((w) => w.status === "COMPLETED").length,
    rejected: items.filter((w) => w.status === "REJECTED").length,
  };
}

export function buildMorningPlanReport(input: {
  directive: DailyDirective;
  plan: DailyExecutionPlan;
  now: string;
}): DailyReport {
  return {
    id: newDailyId("drep"),
    directiveId: input.directive.id,
    planId: input.plan.id,
    kind: "morning_plan",
    title: `Morning Plan — ${input.directive.title}`,
    body: {
      interpretation: input.directive.clarifiedOutcome ?? input.plan.objectiveSummary,
      proposedAssignments: input.plan.employeeAssignments,
      sequence: input.plan.estimatedSequence.map((id) => {
        const w = input.plan.proposedWorkItems.find((x) => x.id === id);
        return w ? { id, title: w.title, owner: w.assignedEmployeeId } : { id };
      }),
      risks: input.plan.risks,
      expectedOutputs: input.plan.expectedOutputs,
      approvalRequests: input.plan.approvalRequirements,
      note: "No implementation has started. CEO approval is required.",
    },
    createdAt: input.now,
  };
}

export function buildProgressReport(input: {
  directive: DailyDirective;
  plan: DailyExecutionPlan;
  now: string;
}): DailyReport {
  const items = input.plan.proposedWorkItems;
  return {
    id: newDailyId("drep"),
    directiveId: input.directive.id,
    planId: input.plan.id,
    kind: "progress",
    title: `Progress — ${input.directive.title}`,
    body: {
      completed: items.filter((w) => w.status === "COMPLETED").map(summarizeItem),
      active: items
        .filter((w) =>
          ["PLANNING", "WORKING", "REVIEWING", "QA", "WAITING"].includes(w.status)
        )
        .map(summarizeItem),
      blocked: items.filter((w) => w.status === "BLOCKED").map(summarizeItem),
      pendingApprovals: items
        .filter(
          (w) =>
            w.approvalState === "pending" ||
            w.executionPermission === "DENIED" ||
            w.pendingProtectedAction
        )
        .map(summarizeItem),
      planChanges: input.plan.status === "CHANGES_REQUESTED",
    },
    createdAt: input.now,
  };
}

export function buildApprovalRequestReport(input: {
  directiveId: string;
  planId: string | null;
  workItemId: string | null;
  requestedAction: string;
  reason: string;
  expectedImpact: string;
  risks: string[];
  rollback: string;
  responsibleEmployeeId: string;
  requiredReviewers: string[];
  now: string;
}): DailyReport {
  return {
    id: newDailyId("drep"),
    directiveId: input.directiveId,
    planId: input.planId,
    kind: "approval_request",
    title: `Approval Request — ${input.requestedAction}`,
    body: {
      requestedAction: input.requestedAction,
      reason: input.reason,
      expectedImpact: input.expectedImpact,
      risks: input.risks,
      rollbackOrRecovery: input.rollback,
      responsibleEmployee: input.responsibleEmployeeId,
      requiredReviewers: input.requiredReviewers,
      workItemId: input.workItemId,
    },
    createdAt: input.now,
  };
}

export function buildFinalDailyReport(input: {
  directive: DailyDirective;
  plan: DailyExecutionPlan;
  now: string;
}): DailyReport {
  const body = buildDailyReportBody(input);
  return {
    id: newDailyId("drep"),
    directiveId: input.directive.id,
    planId: input.plan.id,
    kind: "final_daily",
    title: `Daily Report — ${input.directive.title}`,
    body: body as unknown as Record<string, unknown>,
    createdAt: input.now,
  };
}

/**
 * Build Daily Report sections from recorded work-item / approval state only.
 * Does not invent completed work, file changes, or review outcomes.
 */
export function buildDailyReportBody(input: {
  directive: DailyDirective;
  plan: DailyExecutionPlan;
  now: string;
}): import("../daily-report/types").DailyReportBody {
  const items = input.plan.proposedWorkItems;
  const completed = items.filter((w) => w.status === "COMPLETED");
  const incomplete = items.filter(
    (w) =>
      w.status !== "COMPLETED" &&
      w.status !== "REJECTED" &&
      w.status !== "CANCELLED"
  );
  const blocked = items.filter((w) => w.status === "BLOCKED");

  const toEntry = (w: DailyWorkItem) => {
    const emp = getEmployeeDefinition(w.assignedEmployeeId);
    return {
      id: w.id,
      title: w.title,
      status: w.status,
      progress: w.progress,
      employeeId: w.assignedEmployeeId,
      employeeName: emp?.name ?? w.assignedEmployeeId,
      permanentRole: w.permanentRole,
      currentStep: w.currentStep,
      blockedReason: w.blockedReason,
      outputs: [...w.outputs],
      completedAt: w.completedAt,
    };
  };

  // Reviews: only items that actually entered a review/QA state (or finished).
  const reviews = items
    .filter((w) =>
      ["REVIEWING", "QA", "COMPLETED"].includes(w.status) ||
      (w.status === "BLOCKED" &&
        (w.currentStep.toLowerCase().includes("review") ||
          w.currentStep.toLowerCase().includes("qa")))
    )
    .map((w) => {
      const emp = getEmployeeDefinition(w.assignedEmployeeId);
      return {
        workItemId: w.id,
        title: w.title,
        status: w.status,
        employeeName: emp?.name ?? w.assignedEmployeeId,
        requiredReviewers: [...w.requiredReviewers],
        reviewCompleted: w.status === "COMPLETED",
      };
    });

  // Changed files: only paths explicitly recorded on COMPLETED items.
  const changedFiles = [
    ...new Set(
      completed.flatMap((w) =>
        (w.changedFiles ?? []).filter((p) => typeof p === "string" && p.trim())
      )
    ),
  ];

  // Risks: recorded plan risks only (never invent new ones at report time).
  const risks = input.plan.risks.map((r) => ({
    id: r.id,
    summary: r.summary,
    severity: r.severity,
    mitigation: r.mitigation,
    relatedWorkItemIds: [...r.relatedWorkItemIds],
  }));

  const nextRecommendations: string[] = [];
  if (blocked.length > 0) {
    nextRecommendations.push(
      `Resolve ${blocked.length} blocker(s) before continuing: ${blocked
        .map((w) => w.title)
        .slice(0, 3)
        .join("; ")}.`
    );
  }
  const pendingApprovals = input.plan.approvalRequirements.filter(
    (a) => a.status === "pending"
  );
  if (pendingApprovals.length > 0) {
    nextRecommendations.push(
      `Decide ${pendingApprovals.length} pending approval(s) in the CEO Approval Queue.`
    );
  }
  if (incomplete.length > 0) {
    nextRecommendations.push(
      `Continue ${incomplete.length} incomplete item(s) under a fresh CEO-approved plan: ${incomplete
        .map((w) => w.title)
        .slice(0, 3)
        .join("; ")}.`
    );
  }
  if (
    completed.length > 0 &&
    incomplete.length === 0 &&
    blocked.length === 0
  ) {
    nextRecommendations.push(
      `All recorded work for “${input.directive.title}” is COMPLETED (${completed.length}). Choose the next directive.`
    );
  }
  if (completed.length === 0 && incomplete.length === 0 && blocked.length === 0) {
    nextRecommendations.push(
      "No work items remain on this directive. Submit a new Daily Directive if further work is needed."
    );
  }

  return {
    generatedAt: input.now,
    directiveId: input.directive.id,
    directiveTitle: input.directive.title,
    planId: input.plan.id,
    planVersion: input.plan.planVersion,
    completedWork: completed.map(toEntry),
    incompleteWork: incomplete.map(toEntry),
    blockers: blocked.map((w) => {
      const emp = getEmployeeDefinition(w.assignedEmployeeId);
      return {
        workItemId: w.id,
        title: w.title,
        employeeName: emp?.name ?? w.assignedEmployeeId,
        reason: w.blockedReason?.trim() || "Blocked (no reason recorded)",
      };
    }),
    approvals: input.plan.approvalRequirements.map((a) => ({
      id: a.id,
      kind: a.kind,
      summary: a.summary,
      status: a.status,
      workItemId: a.workItemId,
      protectedAction: a.protectedAction,
    })),
    reviews,
    changedFiles,
    risks,
    nextRecommendations,
    integrity: {
      source: "recorded_state_only",
      completedCount: completed.length,
      incompleteCount: incomplete.length,
      note:
        "Report reflects recorded company state only. Empty sections mean nothing was recorded — results are not fabricated.",
    },
  };
}

function summarizeItem(w: DailyWorkItem) {
  return {
    id: w.id,
    title: w.title,
    status: w.status,
    progress: w.progress,
    assignedEmployeeId: w.assignedEmployeeId,
    permanentRole: w.permanentRole,
    executionPermission: w.executionPermission,
    blockedReason: w.blockedReason,
    outputs: w.outputs,
    changedFiles: w.changedFiles ?? [],
    currentStep: w.currentStep,
  };
}

/** Chat / mission text must never count as CEO approval. */
export function textLooksLikeFakeApproval(text: string): boolean {
  return /\b(approved|lgtm|ship it|go ahead)\b/i.test(text);
}
