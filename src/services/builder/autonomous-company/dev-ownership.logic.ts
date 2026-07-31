/**
 * Maps AI employees onto real WorkPilot development disciplines.
 * Ownership follows permanent roles — missions do not reassign expertise.
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
  sarah: {
    disciplines: ["product"],
    owns: [
      "requirements",
      "acceptance criteria",
      "roadmap prioritization",
      "product recommendations",
    ],
  },
  alex: {
    disciplines: ["frontend", "design"],
    owns: [
      "UI implementation",
      "UX coherence",
      "design polish",
      "frontend QA handoff",
    ],
  },
  david: {
    disciplines: ["backend"],
    owns: ["APIs", "services", "typed contracts", "backend bug fixes"],
  },
  noah: {
    disciplines: ["ai"],
    owns: [
      "AI system design",
      "agent evaluation",
      "AI safety rails",
      "model/tool contracts",
    ],
  },
  olivia: {
    disciplines: ["architecture"],
    owns: [
      "architecture proposals",
      "system boundaries",
      "tech risk review",
      "pre-PR design review",
    ],
  },
  emma: {
    disciplines: ["qa"],
    owns: ["test plans", "regression evidence", "bug reports", "branch verification"],
  },
  daniel: {
    disciplines: ["devops"],
    owns: [
      "CI/CD readiness",
      "deployment approvals",
      "release windows",
      "environment hygiene",
    ],
  },
  sophia: {
    disciplines: ["architecture", "ceo_advisor"],
    owns: [
      "technical strategy",
      "engineering standards",
      "cross-team sequencing",
      "CTO risk briefs",
    ],
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
  kind?: string | null;
  preferDiscipline?: DevDiscipline;
}): string {
  const text = `${input.title} ${input.kind ?? ""}`.toLowerCase();
  if (input.preferDiscipline) {
    const hit = employeesForDiscipline(input.preferDiscipline)[0];
    if (hit) return hit.id;
  }
  if (/deploy|ci|release|pipeline|vercel/.test(text)) return "daniel";
  if (/test|qa|regression|bug|failing/.test(text)) return "emma";
  if (/ui|ux|css|layout|design|frontend|component/.test(text)) return "alex";
  if (/api|route|service|prisma|schema|backend/.test(text)) return "david";
  if (/architect|design doc|adr|boundary|module/.test(text)) return "olivia";
  if (/ai|llm|agent|embedding|prompt|model/.test(text)) return "noah";
  if (/cto|strategy|standards|sequencing/.test(text)) return "sophia";
  if (/roadmap|requirement|acceptance|product/.test(text)) return "sarah";
  return "sarah";
}

export function formatWorkItemLine(workItem: {
  kind: string;
  id: string;
  title: string;
  refs?: string[];
}): string {
  const refs = workItem.refs?.length ? workItem.refs.join(", ") : workItem.id;
  return `[WorkPilot · ${workItem.kind} · ${refs} · ${workItem.title}]`;
}
