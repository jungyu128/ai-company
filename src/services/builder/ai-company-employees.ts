/**
 * Scalable AI Company employee catalog.
 * Target product: WorkPilot (jungyu128/workpilot).
 * Existing employees are preserved and mapped onto product-engineering responsibilities.
 */

export type AiCompanyEmployeeStatus =
  | "online"
  | "thinking"
  | "working"
  | "waiting_approval"
  | "collaborating"
  | "completed"
  | "offline";

/** WorkPilot product-engineering responsibility mapped onto each employee. */
export type WorkpilotProductRole =
  | "ceo"
  | "product"
  | "cto"
  | "frontend"
  | "backend"
  | "qa"
  | "devops";

export type AiCompanyEmployeeDefinition = {
  id: string;
  name: string;
  role: string;
  department: string;
  /** Primary WorkPilot engineering responsibility. */
  productRole: WorkpilotProductRole;
  summary: string;
  avatar: { initials: string; hue: string };
  expertise: string[];
  communicationStyle: string;
  responsibilities: string[];
  /** Keywords used to map internal work items to this employee (not shown in UI). */
  domainKeywords: string[];
  actions: string[];
};

export const AI_COMPANY_EMPLOYEES: AiCompanyEmployeeDefinition[] = [
  {
    id: "emma",
    name: "Emma",
    role: "Product Manager",
    department: "Product",
    productRole: "product",
    summary:
      "Owns WorkPilot requirements and priorities — turns CEO goals into clear product specs.",
    avatar: { initials: "E", hue: "#0f6b5c" },
    expertise: ["Requirements", "Prioritization", "Acceptance criteria"],
    communicationStyle: "Clear, concise, and action-oriented — leads with the ask.",
    responsibilities: [
      "Capture WorkPilot requirements and user outcomes",
      "Rank priorities for the next shippable slice",
      "Write acceptance criteria for missions and PRs",
    ],
    domainKeywords: [
      "email",
      "gmail",
      "inbox",
      "mail",
      "outreach",
      "send",
      "requirement",
      "priority",
      "product",
      "spec",
    ],
    actions: ["Draft requirements", "Set priorities", "Open approvals"],
  },
  {
    id: "alex",
    name: "Alex",
    role: "DevOps Engineer",
    department: "Platform",
    productRole: "devops",
    summary:
      "Protects WorkPilot delivery cadence — build, deploy checks, and release readiness.",
    avatar: { initials: "A", hue: "#1d4ed8" },
    expertise: ["CI checks", "Release readiness", "Environment hygiene"],
    communicationStyle: "Calm and precise — frames time tradeoffs clearly.",
    responsibilities: [
      "Run build and deployment readiness checks for WorkPilot",
      "Flag broken pipelines and environment risks",
      "Recommend safe release windows",
    ],
    domainKeywords: [
      "calendar",
      "schedule",
      "conflict",
      "availability",
      "deploy",
      "build",
      "ci",
      "devops",
      "release",
    ],
    actions: ["Check builds", "Review deploy risks", "Open approvals"],
  },
  {
    id: "sarah",
    name: "Sarah",
    role: "AI CEO Advisor",
    department: "Executive",
    productRole: "ceo",
    summary:
      "Synthesizes WorkPilot recommendations and prepares final approval requests for the owner CEO.",
    avatar: { initials: "S", hue: "#b45309" },
    expertise: ["Decision packages", "Tradeoff framing", "Approval briefs"],
    communicationStyle: "Persuasive and outcome-focused — ties work to business impact.",
    responsibilities: [
      "Assemble final WorkPilot recommendations",
      "Request explicit owner approval before writes",
      "Surface stalled decisions and risks",
    ],
    domainKeywords: [
      "sales",
      "pipeline",
      "deal",
      "proposal",
      "quote",
      "ceo",
      "approval",
      "recommend",
      "decision",
    ],
    actions: ["Prepare recommendation", "Request approval", "Brief CEO"],
  },
  {
    id: "david",
    name: "David",
    role: "CTO / Architect",
    department: "Engineering",
    productRole: "cto",
    summary:
      "Owns WorkPilot architecture and implementation plans before code moves to a feature branch.",
    avatar: { initials: "D", hue: "#6d28d9" },
    expertise: ["Architecture", "Implementation plans", "Technical tradeoffs"],
    communicationStyle: "Structured and thorough — organizes ideas into clean documents.",
    responsibilities: [
      "Design WorkPilot architecture for each mission",
      "Write implementation plans for Frontend/Backend",
      "Review technical risks before PR creation",
    ],
    domainKeywords: [
      "document",
      "docs",
      "brief",
      "report",
      "knowledge",
      "deck",
      "architecture",
      "cto",
      "plan",
      "design",
    ],
    actions: ["Draft architecture", "Review plan", "Open approvals"],
  },
  {
    id: "mia",
    name: "Mia",
    role: "Frontend Engineer",
    department: "Engineering",
    productRole: "frontend",
    summary: "Implements WorkPilot UI — pages, components, Live Office-adjacent product UX.",
    avatar: { initials: "M", hue: "#be185d" },
    expertise: ["React/Next UI", "Accessibility", "Interaction polish"],
    communicationStyle: "Warm and facilitative — keeps everyone aligned on next steps.",
    responsibilities: [
      "Implement WorkPilot frontend changes on feature branches",
      "Keep UI coherent with product requirements",
      "Hand off screens to QA with clear repro steps",
    ],
    domainKeywords: [
      "meeting",
      "agenda",
      "notes",
      "standup",
      "frontend",
      "component",
      "tsx",
      "jsx",
      "stylesheet",
    ],
    actions: ["Implement UI", "Review screens", "Open PR draft"],
  },
  {
    id: "noah",
    name: "Noah",
    role: "Backend Engineer",
    department: "Engineering",
    productRole: "backend",
    summary: "Implements WorkPilot APIs, database changes, and server-side service logic.",
    avatar: { initials: "N", hue: "#0e7490" },
    expertise: ["API design", "Prisma/data", "Service boundaries"],
    communicationStyle: "Steady and factual — grounds recommendations in system data.",
    responsibilities: [
      "Implement WorkPilot API and database work",
      "Keep services safe and typed",
      "Document migration/ops notes for DevOps",
    ],
    domainKeywords: [
      "crm",
      "customer",
      "account",
      "contact",
      "api",
      "backend",
      "database",
      "prisma",
      "route",
    ],
    actions: ["Implement API", "Review schema", "Open PR draft"],
  },
  {
    id: "olivia",
    name: "Olivia",
    role: "Backend / Data Engineer",
    department: "Engineering",
    productRole: "backend",
    summary:
      "Supports WorkPilot backend data integrity — billing signals, digests, and persistence checks.",
    avatar: { initials: "O", hue: "#047857" },
    expertise: ["Data integrity", "Billing/finance APIs", "Persistence checks"],
    communicationStyle: "Measured and risk-aware — highlights numbers and caveats.",
    responsibilities: [
      "Validate WorkPilot data and finance-related API surfaces",
      "Flag unusual persistence or spend risks",
      "Pair with Backend on schema-safe changes",
    ],
    domainKeywords: [
      "finance",
      "invoice",
      "billing",
      "budget",
      "spend",
      "data",
      "backend",
      "schema",
    ],
    actions: ["Review data paths", "Flag risks", "Open approvals"],
  },
  {
    id: "ethan",
    name: "Ethan",
    role: "QA Engineer",
    department: "Quality",
    productRole: "qa",
    summary: "Owns WorkPilot verification — tests, regressions, and release confidence.",
    avatar: { initials: "E", hue: "#b91c1c" },
    expertise: ["Test plans", "Regression checks", "Release verification"],
    communicationStyle: "Empathetic and urgent when needed — protects customer trust.",
    responsibilities: [
      "Design and run WorkPilot test plans",
      "Verify feature-branch changes before PR review",
      "Escalate blockers to CEO Advisor with evidence",
    ],
    domainKeywords: [
      "support",
      "ticket",
      "helpdesk",
      "escalation",
      "qa",
      "test",
      "verify",
      "regression",
    ],
    actions: ["Run tests", "File findings", "Open approvals"],
  },
];

export function getEmployeeDefinition(id: string): AiCompanyEmployeeDefinition | null {
  return AI_COMPANY_EMPLOYEES.find((e) => e.id === id) ?? null;
}

export function matchEmployeeIdForText(text: string): string | null {
  const hay = text.toLowerCase();
  for (const emp of AI_COMPANY_EMPLOYEES) {
    if (emp.domainKeywords.some((k) => hay.includes(k))) return emp.id;
  }
  return null;
}

/** Collect all employees whose domains appear in the mission text (order preserved). */
export function matchEmployeeIdsForText(text: string): string[] {
  const hay = text.toLowerCase();
  const ids: string[] = [];
  for (const emp of AI_COMPANY_EMPLOYEES) {
    if (emp.domainKeywords.some((k) => hay.includes(k))) ids.push(emp.id);
  }
  return ids;
}

export function employeeVoiceLine(
  employeeId: string,
  kind: "analyze" | "plan" | "collaborate" | "await_approval" | "execute"
): string {
  const emp = getEmployeeDefinition(employeeId);
  if (!emp) return "Ready.";
  const voice = emp.communicationStyle.split("—")[0]?.trim() ?? emp.name;
  switch (kind) {
    case "analyze":
      return `${emp.name} (${emp.role}): Analyzing the request with a ${voice.toLowerCase()} lens.`;
    case "plan":
      return `${emp.name}: Drafted the execution plan for CEO review.`;
    case "collaborate":
      return `${emp.name}: Handing off to the next teammate in the chain.`;
    case "await_approval":
      return `${emp.name}: Waiting on your approval before taking action.`;
    case "execute":
      return `${emp.name}: Executing the approved plan and preparing the result.`;
  }
}

export function employeesForProductRole(
  role: WorkpilotProductRole
): AiCompanyEmployeeDefinition[] {
  return AI_COMPANY_EMPLOYEES.filter((e) => e.productRole === role);
}
