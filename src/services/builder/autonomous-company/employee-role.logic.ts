/**
 * Persistent employee role contracts — allowed / prohibited actions for WorkPilot work.
 * Missions never override permanent roles; conflicts refuse + recommend a colleague.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
  matchEmployeeIdForText,
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
  /** Strong off-role signals that belong to another specialty. */
  foreignSignals: string[];
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
    foreignSignals: [
      "implement the ui",
      "implement api",
      "prisma migration",
      "deploy to production",
      "run the regression suite as qa owner",
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
      "implement_api",
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
    foreignSignals: [
      "prisma schema",
      "database migration",
      "ci pipeline owner",
      "write the api route as backend owner",
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
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      ...SAFETY_PROHIBITED,
      "implement_ui",
      "deploy_production",
    ],
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
    foreignSignals: [
      "implement the react page",
      "css layout",
      "own the qa regression pack",
      "set company technical strategy as cto",
    ],
  },
  ai_engineer: {
    productRole: "ai_engineer",
    allowedActions: [
      "design_ai_system",
      "evaluate_agent",
      "define_ai_safety_rails",
      "open_approvals",
    ],
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      ...SAFETY_PROHIBITED,
      "implement_ui",
      "deploy_production",
    ],
    roleTokens: [
      "ai",
      "agent",
      "model",
      "prompt",
      "evaluation",
      "safety",
      "workpilot",
      "llm",
    ],
    foreignSignals: [
      "own the devops pipeline",
      "ship the marketing page css",
      "write prisma billing schema as sole backend",
    ],
  },
  architect: {
    productRole: "architect",
    allowedActions: [
      "draft_architecture",
      "implementation_plan",
      "review_technical_risk",
      "open_approvals",
    ],
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      ...SAFETY_PROHIBITED,
      "deploy_production",
      "merge_main",
    ],
    roleTokens: [
      "architecture",
      "design",
      "boundary",
      "tradeoff",
      "workpilot",
      "plan",
      "module",
    ],
    foreignSignals: [
      "send customer email",
      "run production deploy",
      "own qa test execution exclusively",
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
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      ...SAFETY_PROHIBITED,
      "implement_ui",
      "implement_api",
    ],
    roleTokens: [
      "test",
      "qa",
      "regression",
      "verify",
      "evidence",
      "workpilot",
      "coverage",
    ],
    foreignSignals: [
      "implement the api",
      "implement the ui as owner",
      "set technical strategy as cto",
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
    foreignSignals: [
      "write product requirements as pm",
      "implement frontend components as owner",
      "own ai model evaluation as chief ai",
    ],
  },
  cto: {
    productRole: "cto",
    allowedActions: [
      "set_technical_strategy",
      "review_engineering_standards",
      "sequence_bets",
      "brief_ceo",
      "open_approvals",
    ],
    prohibitedActions: [
      ...COMMS_PROHIBITED,
      ...SAFETY_PROHIBITED,
      "deploy_production",
      "merge_main",
    ],
    roleTokens: [
      "strategy",
      "standards",
      "cto",
      "sequencing",
      "risk",
      "workpilot",
      "engineering",
    ],
    foreignSignals: [
      "write the css page as frontend owner",
      "own the qa regression execution",
      "personally implement every prisma migration",
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

/**
 * Detect mission/task objectives that conflict with the employee's permanent role.
 * Mission may assign work objectives — never replace the role.
 */
export function evaluateRoleMissionFit(input: {
  employeeId: string;
  objectiveText: string;
}): {
  ok: boolean;
  conflict: boolean;
  reason: string | null;
  recommendedEmployeeId: string | null;
  recommendedName: string | null;
  recommendedRole: string | null;
  refuseMessage: string | null;
} {
  const emp = getEmployeeDefinition(input.employeeId);
  const contract = roleContractForEmployee(input.employeeId);
  if (!emp || !contract) {
    return {
      ok: false,
      conflict: true,
      reason: "unknown_employee",
      recommendedEmployeeId: null,
      recommendedName: null,
      recommendedRole: null,
      refuseMessage: "Unknown employee — cannot accept mission work.",
    };
  }

  const hay = input.objectiveText.toLowerCase();
  const foreignHit = contract.foreignSignals.some((s) => hay.includes(s));
  const matchedOther = matchEmployeeIdForText(input.objectiveText);
  const other = matchedOther ? getEmployeeDefinition(matchedOther) : null;

  const strongOtherRole =
    other &&
    other.id !== emp.id &&
    other.productRole !== emp.productRole &&
    other.domainKeywords.some((k) => hay.includes(k)) &&
    !emp.domainKeywords.some((k) => hay.includes(k));

  if (!foreignHit && !strongOtherRole) {
    return {
      ok: true,
      conflict: false,
      reason: null,
      recommendedEmployeeId: null,
      recommendedName: null,
      recommendedRole: null,
      refuseMessage: null,
    };
  }

  const recommended =
    other && other.id !== emp.id
      ? other
      : AI_COMPANY_EMPLOYEES.find((e) =>
          e.domainKeywords.some((k) => hay.includes(k) && e.id !== emp.id)
        ) ?? null;

  const recommendedEmployeeId = recommended?.id ?? null;
  const refuseMessage = recommended
    ? `I have to refuse this assignment as outside my permanent role (${emp.role}). Missions set objectives only — they cannot make me act as ${recommended.role}. Please assign this to ${recommended.name} (${recommended.role}).`
    : `I have to refuse this assignment as outside my permanent role (${emp.role}). Missions set objectives only and cannot override my role. Please reassign to the appropriate specialist.`;

  return {
    ok: false,
    conflict: true,
    reason: "role_conflict",
    recommendedEmployeeId,
    recommendedName: recommended?.name ?? null,
    recommendedRole: recommended?.role ?? null,
    refuseMessage,
  };
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

  if (
    !allowComms &&
    /\b(draft\s+(an?\s+)?outreach|outreach\s+email|send\s+(the\s+)?email|update\s+(the\s+)?crm|crm\s+sales|sales\s+leads?|sales\s+pipeline|re-?engage\s+(crm|customers?|leads?)|gmail\s+outreach)\b/i.test(
      input.text
    )
  ) {
    if (!reasons.includes("unrelated_comms")) reasons.push("unrelated_comms");
  }

  // Reject outputs that claim a different permanent role
  if (
    /\b(as (your|the) (product manager|frontend engineer|backend engineer|qa engineer|devops engineer|cto|software architect|chief ai engineer))\b/i.test(
      input.text
    )
  ) {
    const claimed = input.text.match(
      /\bas (?:your|the) ([a-z /]+?)(?:\.|,|$)/i
    )?.[1]
      ?.trim()
      .toLowerCase();
    if (claimed && !emp.role.toLowerCase().includes(claimed.slice(0, 12))) {
      reasons.push("role_override_attempt");
    }
  }

  if (
    input.activeMissions.length > 0 &&
    !isWithinActiveMissionScope(input.text, input.activeMissions, {
      ceoMessage: input.ceoMessage,
    })
  ) {
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
  product: ["cto", "frontend", "backend", "qa", "devops", "architect", "ai_engineer"],
  frontend: ["product", "architect", "qa", "backend", "devops", "cto", "ai_engineer"],
  backend: ["product", "architect", "qa", "frontend", "devops", "cto", "ai_engineer"],
  ai_engineer: ["product", "architect", "backend", "cto", "qa", "frontend"],
  architect: ["product", "frontend", "backend", "qa", "devops", "cto", "ai_engineer"],
  qa: ["frontend", "backend", "product", "architect", "devops", "cto", "ai_engineer"],
  devops: ["architect", "backend", "qa", "cto", "product", "frontend"],
  cto: ["product", "architect", "ai_engineer", "qa", "devops", "frontend", "backend"],
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

/** Strip legacy mission prompt language that tries to reassign role. */
export function stripMissionRoleOverrides(text: string): string {
  return text
    .replace(
      /\b(you are now|act as|acting as|temporarily act as|your temporary role is|role override[:\s]+|for this mission you are)\b[^.!\n]*/gi,
      ""
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}
