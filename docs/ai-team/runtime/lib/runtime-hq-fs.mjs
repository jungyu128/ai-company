/**
 * Load Builder Runtime artifacts into buildAiCompanyHq().
 * Reads via storage bridge (preferred) or packaged read-only files.
 * Never writes to the project filesystem (Vercel-safe).
 */

import fs from "node:fs";
import path from "node:path";
import { buildAiCompanyHq, formatAiCompanyHqMarkdown } from "./runtime-hq.mjs";
import { buildCeoAdvisor } from "./runtime-ceo-advisor.mjs";

function storageGet(root, rel) {
  const g = globalThis;
  if (typeof g.__AI_COMPANY_STORAGE_GET === "function") {
    const v = g.__AI_COMPANY_STORAGE_GET(root, rel);
    if (v != null) return v;
  }
  return null;
}

function storageSet(root, rel, value) {
  const g = globalThis;
  if (typeof g.__AI_COMPANY_STORAGE_SET === "function") {
    g.__AI_COMPANY_STORAGE_SET(root, rel, value);
    return true;
  }
  return false;
}

function storageList(root, prefix) {
  const g = globalThis;
  if (typeof g.__AI_COMPANY_STORAGE_LIST === "function") {
    return g.__AI_COMPANY_STORAGE_LIST(root, prefix) ?? [];
  }
  return [];
}

function readSafe(root, rel) {
  const fromStorage = storageGet(root, rel);
  if (fromStorage != null) return fromStorage;
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return "";
  }
}

function listReleaseHistory(root) {
  const fromStorage = storageList(root, "docs/ai-team/ops/releases")
    .filter((f) => f.includes("/REL-") && f.endsWith(".md"))
    .sort()
    .reverse();

  let files = fromStorage.map((rel) => path.posix.basename(rel));
  if (files.length === 0) {
    const dir = path.join(root, "docs/ai-team/ops/releases");
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("REL-") && f.endsWith(".md"))
        .sort()
        .reverse();
    } catch {
      files = [];
    }
  }

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
  const fromStorage = storageList(root, "docs/ai-team/runtime/agents").filter(
    (f) => f.includes("/AGENT-") && f.endsWith(".md")
  );

  let files = fromStorage.map((rel) => path.posix.basename(rel));
  if (files.length === 0) {
    const dir = path.join(root, "docs/ai-team/runtime/agents");
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => f.startsWith("AGENT-") && f.endsWith(".md"))
        .sort();
    } catch {
      files = [];
    }
  } else {
    files = files.sort();
  }

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
  // Ensure TS storage bridge is registered when loaded from Next.js.
  try {
    // Side-effect import path is resolved by Next/tsx when HQ is loaded via hq.service.
  } catch {
    /* ignore */
  }

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
  const rel = "docs/ai-team/ops/HQ.md";
  const body = markdown + "\n";
  const wrote = storageSet(repoRoot, rel, body);
  // Never write to project filesystem — return virtual path when storage is used.
  return { markdown, hqPath: wrote ? rel : null };
}

export { formatAiCompanyHqMarkdown, buildAiCompanyHq };
