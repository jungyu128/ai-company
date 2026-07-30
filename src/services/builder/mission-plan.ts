/**
 * Short pre-execution mission plan (deterministic).
 * Does not run agents or modify product code — plan only.
 */

export type MissionPlan = {
  summary: string;
  steps: string[];
  approvalGate: string;
  markdown: string;
};

export function generateMissionPlan(input: {
  taskId: string;
  title: string;
  mission: string;
}): MissionPlan {
  const { taskId, title, mission } = input;
  const proposalPhrase = `Approve ${taskId} proposal only`;
  const shipPhrase = `Approve ${taskId} only`;

  const steps = [
    "Capture CEO goal on the Task Board and open a short Discussion Record.",
    "Produce a Final Proposal (scope IN/OUT, risks, acceptance criteria) — no product code yet.",
    `Pause at WAITING_CEO. CEO must say exactly: \`${proposalPhrase}\` before any implementation begins.`,
    "After proposal approval: Architect → Backend/Frontend implement within accepted scope.",
    "QA + Security + Reviewer gates, then ship with `" + shipPhrase + "`.",
  ];

  const summary = `Pre-execution plan for “${title}”: clarify → propose → CEO proposal gate → implement → ship.`;

  const markdown = [
    "## Mission Plan (pre-execution)",
    "",
    `> Generated before any code changes. Gate: **proposal** — \`${proposalPhrase}\``,
    "",
    `**CEO Goal:** ${mission}`,
    "",
    ...steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "**OUT until proposal approval:** WorkPilot product code changes, schema migrations, Stage 6.",
    "",
  ].join("\n");

  return {
    summary,
    steps,
    approvalGate: proposalPhrase,
    markdown,
  };
}
