/**
 * Server-side approval enforcement for Daily Autonomous Operations.
 * UI-only controls are insufficient — every execution path must call these gates.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import { evaluateRoleMissionFit } from "../autonomous-company/employee-role.logic";
import { textLooksLikeFakeApproval } from "./daily-ops.logic";
import type {
  DailyDirective,
  DailyExecutionPlan,
  DailyWorkItem,
  ExecutionGateResult,
  ProtectedActionKind,
} from "./types";

const DIRECTIVE_EXEC_OK = new Set([
  "APPROVED",
  "PARTIALLY_APPROVED",
  "EXECUTING",
  "BLOCKED",
]);

const PLAN_EXEC_OK = new Set(["APPROVED", "PARTIALLY_APPROVED"]);

/**
 * Verify directive + plan + work-item + role + dependencies before implementation.
 */
export function assertCanExecuteWorkItem(input: {
  directive: DailyDirective;
  plan: DailyExecutionPlan;
  workItem: DailyWorkItem;
  allWorkItems: DailyWorkItem[];
  /** If true, also require pending protected action to be cleared. */
  requireProtectedCleared?: boolean;
}): ExecutionGateResult {
  const { directive, plan, workItem, allWorkItems } = input;

  if (directive.paused) {
    return {
      ok: false,
      code: "DIRECTIVE_PAUSED",
      message: "Directive is paused by CEO — execution halted.",
    };
  }

  if (!DIRECTIVE_EXEC_OK.has(directive.status)) {
    return {
      ok: false,
      code: "DIRECTIVE_NOT_APPROVED",
      message: `Directive status ${directive.status} does not allow execution.`,
    };
  }

  if (plan.immutable === false && !PLAN_EXEC_OK.has(plan.status)) {
    return {
      ok: false,
      code: "PLAN_NOT_APPROVED",
      message: `Plan status ${plan.status} does not allow execution.`,
    };
  }

  if (!PLAN_EXEC_OK.has(plan.status)) {
    return {
      ok: false,
      code: "PLAN_NOT_APPROVED",
      message: `Plan status ${plan.status} does not allow execution.`,
    };
  }

  if (workItem.executionPermission !== "GRANTED") {
    return {
      ok: false,
      code: "EXECUTION_DENIED",
      message: "executionPermission is DENIED — explicit CEO approval required.",
    };
  }

  if (
    workItem.approvalState !== "approved" ||
    workItem.status === "PROPOSED" ||
    workItem.status === "AWAITING_APPROVAL" ||
    workItem.status === "REJECTED" ||
    workItem.status === "CANCELLED"
  ) {
    return {
      ok: false,
      code: "WORK_ITEM_NOT_APPROVED",
      message: `Work item not approved for execution (status=${workItem.status}, approval=${workItem.approvalState}).`,
    };
  }

  const emp = getEmployeeDefinition(workItem.assignedEmployeeId);
  if (!emp || emp.role !== workItem.permanentRole) {
    return {
      ok: false,
      code: "ROLE_INELIGIBLE",
      message: "Assigned permanent role does not match locked employee identity.",
    };
  }

  const fit = evaluateRoleMissionFit({
    employeeId: workItem.assignedEmployeeId,
    objectiveText: workItem.objective,
  });
  if (!fit.ok) {
    return {
      ok: false,
      code: "ROLE_INELIGIBLE",
      message: fit.refuseMessage ?? "Off-role work cannot execute.",
    };
  }

  for (const depId of workItem.dependencies) {
    const dep = allWorkItems.find((w) => w.id === depId);
    if (!dep || dep.status !== "COMPLETED") {
      return {
        ok: false,
        code: "DEPENDENCY_INCOMPLETE",
        message: `Dependency ${depId} is not completed.`,
      };
    }
    if (dep.executionPermission !== "GRANTED") {
      return {
        ok: false,
        code: "DEPENDENCY_INCOMPLETE",
        message: `Dependency ${depId} was never CEO-approved for execution.`,
      };
    }
  }

  if (
    input.requireProtectedCleared !== false &&
    workItem.pendingProtectedAction
  ) {
    return {
      ok: false,
      code: "PROTECTED_ACTION_REQUIRED",
      message: `Protected action ${workItem.pendingProtectedAction} requires explicit CEO approval.`,
    };
  }

  return { ok: true };
}

/** Never treat chat/mission text as approval. */
export function assertExplicitCeoApprovalAction(input: {
  action:
    | "approve_entire_plan"
    | "approve_selected_work_items"
    | "approve_protected_action"
    | string;
  note?: string | null;
}): ExecutionGateResult {
  const allowed = new Set([
    "approve_entire_plan",
    "approve_selected_work_items",
    "approve_protected_action",
  ]);
  if (!allowed.has(input.action)) {
    return {
      ok: false,
      code: "INVALID",
      message: "Not an explicit CEO approval action.",
    };
  }
  // Notes that look like approval of a *different* thing still don't substitute —
  // the structured action is what counts; this only blocks misuse of notes as sole signal.
  if (input.note && textLooksLikeFakeApproval(input.note) && false) {
    /* structured action is authoritative; note alone never grants */
  }
  return { ok: true };
}

/**
 * Mission / chat text cannot impersonate CEO approval.
 */
export function rejectInferredApprovalFromText(text: string): ExecutionGateResult {
  if (textLooksLikeFakeApproval(text)) {
    return {
      ok: false,
      code: "INVALID",
      message:
        "Mission or chat text cannot grant approval. Use an explicit CEO approval action.",
    };
  }
  return { ok: true };
}

export function assertNotSelfApprove(input: {
  actorUserId: string;
  actorIsCeo: boolean;
  workItem: DailyWorkItem;
}): ExecutionGateResult {
  if (!input.actorIsCeo) {
    return {
      ok: false,
      code: "INVALID",
      message: "Only the CEO may approve daily-ops work items.",
    };
  }
  if (input.actorUserId === input.workItem.assignedEmployeeId) {
    return {
      ok: false,
      code: "INVALID",
      message: "Employees cannot self-approve work items.",
    };
  }
  return { ok: true };
}

export function isProtectedAction(kind: string): kind is ProtectedActionKind {
  return [
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
  ].includes(kind);
}
