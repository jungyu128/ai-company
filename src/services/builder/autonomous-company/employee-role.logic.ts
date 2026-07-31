/**
 * Persistent employee role contracts — allowed / prohibited actions for WorkPilot work.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
  type AiCompanyEmployeeDefinition,
  type WorkpilotProductRole,
} from "../ai-company-employees";
import type { CollaborationMission } from "../collaboration.logic";
import {
  activeMissionsRequireComms,
  ceoExplicitlyRequestsComms,
  isUnrelatedCommercialComms,
  isWithinActiveMissionScope,
} from "./mission-scope.logic";

export type EmployeeRoleContract = {
  productRole: WorkpilotProductRole;
  allowedActions: string[];
  prohibitedActions: string[];
  /** Tokens that must appear for on-role WorkPilot engineering output. */
  roleTokens: string[];
};

const COMMS_PROHIBITED = [
  "send_customer_email",
  "draft_outreach",
  "crm_update",
  "sales_pitch",
  "pipeline_motion",
  "customer_reengage",
] as const;

const SAFETY_PROHIBITED = [
  "merge_main",
  "deploy_production",
  "force_push",
  "delete_production_data",
] as const;

export const ROLE_CONTRACTS: Record<WorkpilotProductRole, EmployeeRoleContract> = {
  product: {
    productRole: "product",
    allowedActions: [
      "draft_requirements",
      "set_priorities",
      "write_acceptance_criteria",
      "clarify_scope",
      "open_approvals",
    ],
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      ...SAFETY_PROHIBITED,
      "implement_ui",
      "implement_api",
    ],
    roleTokens: [
      "requirement",
      "priority",
      "acceptance",
      "criteria",
      "scope",
      "product",
      "workpilot",
      "mission",
    ],
  },
  ceo: {
    productRole: "ceo",
    allowedActions: [
      "assemble_recommendation",
      "request_approval",
      "brief_ceo",
      "surface_risk",
    ],
    prohibitedActions: [...COMMS_PROHIBITED, ...SAFETY_PROHIBITED],
    roleTokens: [
      "recommend",
      "approval",
      "decision",
      "risk",
      "workpilot",
      "tradeoff",
      "mission",
    ],
  },
  cto: {
    productRole: "cto",
    allowedActions: [
      "draft_architecture",
      "implementation_plan",
      "review_technical_risk",
      "open_approvals",
    ],
    prohibitedActions: [...COMMS_PROHIBITED, ...SAFETY_PROHIBITED],
    roleTokens: [
      "architecture",
      "plan",
      "design",
      "risk",
      "workpilot",
      "branch",
      "api",
      "component",
    ],
  },
  frontend: {
    productRole: "frontend",
    allowedActions: [
      "implement_ui",
      "review_screens",
      "open_pr_draft",
      "hand_off_qa",
    ],
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      ...SAFETY_PROHIBITED,
      "crm_update",
      "sales_pitch",
    ],
    roleTokens: [
      "ui",
      "component",
      "page",
      "frontend",
      "tsx",
      "accessibility",
      "workpilot",
      "hq",
    ],
  },
  backend: {
    productRole: "backend",
    allowedActions: [
      "implement_api",
      "review_schema",
      "open_pr_draft",
      "document_migration",
    ],
    prohibitedActions: [...COMMS_PROHIBITED, ...SAFETY_PROHIBITED],
    roleTokens: [
      "api",
      "backend",
      "schema",
      "prisma",
      "route",
      "service",
      "workpilot",
      "database",
    ],
  },
  qa: {
    productRole: "qa",
    allowedActions: [
      "design_test_plan",
      "run_tests",
      "file_findings",
      "verify_branch",
      "open_approvals",
    ],
    prohibitedActions: [...COMMS_PROHIBITED, ...SAFETY_PROHIBITED],
    roleTokens: [
      "test",
      "qa",
      "regression",
      "verify",
      "evidence",
      "workpilot",
      "coverage",
    ],
  },
  devops: {
    productRole: "devops",
    allowedActions: [
      "check_builds",
      "review_deploy_risk",
      "release_readiness",
      "open_approvals",
    ],
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      "merge_main",
      "deploy_production",
      "force_push",
    ],
    roleTokens: [
      "ci",
      "build",
      "deploy",
      "release",
      "pipeline",
      "workpilot",
      "readiness",
    ],
  },
};

export function roleContractForEmployee(
  employeeId: string
): EmployeeRoleContract | null {
  const emp = getEmployeeDefinition(employeeId);
  if (!emp) return null;
  return ROLE_CONTRACTS[emp.productRole] ?? null;
}

export function enrichEmployeeWithRoleContract(
  emp: AiCompanyEmployeeDefinition
): AiCompanyEmployeeDefinition & {
  allowedActions: string[];
  prohibitedActions: string[];
} {
  const contract = ROLE_CONTRACTS[emp.productRole];
  return {
    ...emp,
    allowedActions: emp.allowedActions?.length
      ? emp.allowedActions
      : contract.allowedActions,
    prohibitedActions: emp.prohibitedActions?.length
      ? emp.prohibitedActions
      : contract.prohibitedActions,
  };
}

/** Task text may temporarily permit commercial comms for this employee. */
export function taskExplicitlyRequiresComms(taskText: string | null | undefined): boolean {
  if (!taskText?.trim()) return false;
  return isUnrelatedCommercialComms(taskText);
}

export function validateEmployeeOutput(input: {
  employeeId: string;
  text: string;
  activeMissions: CollaborationMission[];
  assignedTask?: string | null;
  ceoMessage?: string | null;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const emp = getEmployeeDefinition(input.employeeId);
  const contract = roleContractForEmployee(input.employeeId);
  if (!emp || !contract) {
    reasons.push("unknown_employee");
    return { ok: false, reasons };
  }

  const hay = input.text.toLowerCase();
  const task = input.assignedTask ?? "";
  const allowComms =
    ceoExplicitlyRequestsComms(input.ceoMessage ?? "") ||
    taskExplicitlyRequiresComms(task) ||
    activeMissionsRequireComms(input.activeMissions);

  if (isUnrelatedCommercialComms(input.text) && !allowComms) {
    reasons.push("unrelated_comms");
  }

  // Explicit commercial behavior phrases always blocked unless allowed
  if (
    !allowComms &&
    /\b(draft\s+(an?\s+)?outreach|outreach\s+email|send\s+(the\s+)?email|update\s+(the\s+)?crm|crm\s+sales|sales\s+leads?|sales\s+pipeline|re-?engage\s+(crm|customers?|leads?)|gmail\s+outreach)\b/i.test(
      input.text
    )
  ) {
    if (!reasons.includes("unrelated_comms")) reasons.push("unrelated_comms");
  }

  if (
    input.activeMissions.length > 0 &&
    !isWithinActiveMissionScope(input.text, input.activeMissions, {
      ceoMessage: input.ceoMessage,
    })
  ) {
    // Allow short role-framed replies that still reference WorkPilot engineering
    const onRole = contract.roleTokens.some((t) => hay.includes(t));
    const mentionsMission = input.activeMissions.some((m) =>
      hay.includes(m.title.toLowerCase().slice(0, 12))
    );
    if (!onRole && !mentionsMission) {
      reasons.push("off_mission");
    }
  }

  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

/** Compatible product-role pairs for cross-department collaboration. */
const COLLAB_MATRIX: Record<WorkpilotProductRole, WorkpilotProductRole[]> = {
  product: ["cto", "frontend", "backend", "qa", "ceo", "devops"],
  ceo: ["product", "cto", "qa", "devops", "frontend", "backend"],
  cto: ["product", "frontend", "backend", "qa", "devops", "ceo"],
  frontend: ["product", "cto", "qa", "backend", "devops"],
  backend: ["product", "cto", "qa", "frontend", "devops"],
  qa: ["frontend", "backend", "product", "cto", "devops", "ceo"],
  devops: ["cto", "backend", "qa", "ceo", "product", "frontend"],
};

export function isValidCollaboratorPair(
  ownerEmployeeId: string,
  peerEmployeeId: string
): boolean {
  if (ownerEmployeeId === peerEmployeeId) return false;
  const owner = getEmployeeDefinition(ownerEmployeeId);
  const peer = getEmployeeDefinition(peerEmployeeId);
  if (!owner || !peer) return false;
  return COLLAB_MATRIX[owner.productRole]?.includes(peer.productRole) ?? false;
}

export function filterValidCollaborators(
  ownerEmployeeId: string,
  peerIds: string[]
): string[] {
  return peerIds.filter((id) => isValidCollaboratorPair(ownerEmployeeId, id));
}

export function listEmployeesWithRoleContracts(): Array<
  AiCompanyEmployeeDefinition & {
    allowedActions: string[];
    prohibitedActions: string[];
  }
> {
  return AI_COMPANY_EMPLOYEES.map(enrichEmployeeWithRoleContract);
}
