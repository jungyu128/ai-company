/**
 * Maps AI employees onto real WorkPilot development disciplines.
 */

import {
  AI_COMPANY_EMPLOYEES,
  getEmployeeDefinition,
  type AiCompanyEmployeeDefinition,
} from "../ai-company-employees";
import type { DevDiscipline } from "./types";

export type DevOwnership = {
  employeeId: string;
  name: string;
  role: string;
  disciplines: DevDiscipline[];
  owns: string[];
};

const OWNERSHIP: Record<string, { disciplines: DevDiscipline[]; owns: string[] }> = {
  emma: {
    disciplines: ["product"],
    owns: [
      "requirements",
      "acceptance criteria",
      "roadmap prioritization",
      "product recommendations",
    ],
  },
  alex: {
    disciplines: ["devops"],
    owns: [
      "CI/CD readiness",
      "deployment approvals",
      "release windows",
      "environment hygiene",
    ],
  },
  sarah: {
    disciplines: ["ceo_advisor", "ai"],
    owns: [
      "executive recommendations",
      "AI feature guidance",
      "stalled decision escalation",
      "CEO briefings",
    ],
  },
  david: {
    disciplines: ["architecture", "ai"],
    owns: [
      "architecture proposals",
      "tech risk review",
      "AI/system design",
      "pre-PR design review",
    ],
  },
  mia: {
    disciplines: ["frontend", "design"],
    owns: [
      "UI implementation",
      "UX coherence",
      "design polish",
      "frontend QA handoff",
    ],
  },
  noah: {
    disciplines: ["backend"],
    owns: ["APIs", "services", "typed contracts", "backend bug fixes"],
  },
  olivia: {
    disciplines: ["backend"],
    owns: ["data integrity", "persistence", "schema changes", "finance-critical paths"],
  },
  ethan: {
    disciplines: ["qa"],
    owns: ["test plans", "regression evidence", "bug reports", "branch verification"],
  },
};

export function listDevOwnership(): DevOwnership[] {
  return AI_COMPANY_EMPLOYEES.map((e) => {
    const o = OWNERSHIP[e.id] ?? {
      disciplines: ["product"] as DevDiscipline[],
      owns: e.responsibilities,
    };
    return {
      employeeId: e.id,
      name: e.name,
      role: e.role,
      disciplines: o.disciplines,
      owns: o.owns,
    };
  });
}

export function ownershipForEmployee(employeeId: string): DevOwnership | null {
  return listDevOwnership().find((o) => o.employeeId === employeeId) ?? null;
}

export function employeesForDiscipline(discipline: DevDiscipline): AiCompanyEmployeeDefinition[] {
  return listDevOwnership()
    .filter((o) => o.disciplines.includes(discipline))
    .map((o) => getEmployeeDefinition(o.employeeId))
    .filter((e): e is AiCompanyEmployeeDefinition => Boolean(e));
}

export function pickOwnerForWork(input: {
  title: string;
  kind: string;
  preferDiscipline?: DevDiscipline;
}): string {
  const text = `${input.title} ${input.kind}`.toLowerCase();
  if (input.preferDiscipline) {
    const hit = employeesForDiscipline(input.preferDiscipline)[0];
    if (hit) return hit.id;
  }
  if (/deploy|ci|release|pipeline|vercel/.test(text)) return "alex";
  if (/test|qa|regression|bug|failing/.test(text)) return "ethan";
  if (/ui|ux|css|layout|design|frontend|component/.test(text)) return "mia";
  if (/api|route|service|prisma|schema|backend/.test(text)) return "noah";
  if (/data|migration|finance|ledger/.test(text)) return "olivia";
  if (/architect|design doc|adr|refactor/.test(text)) return "david";
  if (/ai|llm|agent|embedding/.test(text)) return "sarah";
  if (/roadmap|requirement|acceptance|product/.test(text)) return "emma";
  return "emma";
}

export function formatWorkItemLine(workItem: {
  kind: string;
  id: string;
  title: string;
  refs: string[];
}): string {
  const refs = workItem.refs.length ? workItem.refs.join(", ") : workItem.id;
  return `[WorkPilot · ${workItem.kind} · ${refs} · ${workItem.title}]`;
}
