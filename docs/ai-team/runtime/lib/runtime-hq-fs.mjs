/**
 * Load Builder Runtime artifacts from disk into buildAiCompanyHq().
 * Used by CLI and Next.js via static import of this module — no customer data.
 * Reads markdown/audit files with node:fs (not dynamic import()).
 */

import fs from "node:fs";
import path from "node:path";
import { buildAiCompanyHq, formatAiCompanyHqMarkdown } from "./runtime-hq.mjs";
import { buildCeoAdvisor } from "./runtime-ceo-advisor.mjs";

function readSafe(root, rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return "";
  }
}

function listReleaseHistory(root) {
  const dir = path.join(root, "docs/ai-team/ops/releases");
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith("REL-") && f.endsWith(".md"));
  } catch {
    return [];
  }
  files.sort().reverse();
  return files.map((file) => {
    const body = readSafe(root, `docs/ai-team/ops/releases/${file}`);
    const feature = body.match(/\*\*Feature:\*\*\s*(.+)/)?.[1]?.trim();
    const date = body.match(/\*\*Date:\*\*\s*(.+)/)?.[1]?.trim();
    const id = file.replace(/\.md$/, "");
    return {
      id,
      title: feature ?? id,
      date: date ?? "—",
      path: `docs/ai-team/ops/releases/${file}`,
    };
  });
}

function listAgentDocs(root) {
  const dir = path.join(root, "docs/ai-team/runtime/agents");
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => f.startsWith("AGENT-") && f.endsWith(".md"));
  } catch {
    return [];
  }
  files.sort();
  return files.map((file) => {
    const role = file.replace(/^AGENT-/, "").replace(/\.md$/, "");
    return {
      role,
      content: readSafe(root, `docs/ai-team/runtime/agents/${file}`),
    };
  });
}

/**
 * @param {string} [repoRoot]
 */
export function loadAiCompanyHqFromDisk(repoRoot = process.cwd(), opts = {}) {
  const root = path.resolve(repoRoot);
  const releaseHistory = listReleaseHistory(root);
  const result = buildAiCompanyHq({
    tasksMd: readSafe(root, "docs/ai-team/TASKS.md"),
    sprintsMd: readSafe(root, "docs/ai-team/SPRINTS.md"),
    decisionMemoryMd: readSafe(root, "docs/ai-team/ops/DECISION_MEMORY.md"),
    techDebtMd: readSafe(root, "docs/ai-team/ops/TECH_DEBT.md"),
    improvementBacklogMd: readSafe(root, "docs/ai-team/ops/IMPROVEMENT_BACKLOG.md"),
    auditMd: readSafe(root, "docs/ai-team/runtime/audit/AUDIT.log.md"),
    agentDocs: listAgentDocs(root),
    releaseHistory,
    latestRelease: releaseHistory[0] ?? null,
    generatedAt: new Date().toISOString(),
  });
  if (!result.ok) return result;
  const advisor = buildCeoAdvisor(result.value, {
    lastVisitAt: opts.lastVisitAt ?? null,
  });
  if (advisor.ok) {
    result.value.ceoAdvisor = advisor.value;
  }
  return result;
}

export function writeHqMarkdown(repoRoot, snapshot) {
  let markdown = formatAiCompanyHqMarkdown(snapshot);
  if (snapshot.ceoAdvisor) {
    const a = snapshot.ceoAdvisor;
    const advisorMd = [
      "",
      "## CEO Advisor",
      "",
      `**${a.headline}** (${a.urgency})`,
      "",
      `- **Since last visit:** ${a.sinceLastVisit}`,
      `- **Requires attention:** ${a.requiresAttention}`,
      `- **Why it matters:** ${a.whyItMatters}`,
      `- **Recommended action:** ${a.recommendedAction}`,
      `- **Expected outcome:** ${a.expectedOutcome}`,
      `- **Risks if ignored:** ${a.risksIfIgnored}`,
      "",
    ].join("\n");
    markdown = markdown.replace(
      "## What is my company doing right now?",
      `${advisorMd}## What is my company doing right now?`
    );
  }
  const hqPath = path.join(repoRoot, "docs/ai-team/ops/HQ.md");
  fs.writeFileSync(hqPath, markdown + "\n", "utf8");
  return { markdown, hqPath };
}

export { formatAiCompanyHqMarkdown, buildAiCompanyHq };
