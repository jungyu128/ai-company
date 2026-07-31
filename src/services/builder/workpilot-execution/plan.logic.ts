/**
 * Pure helpers — build packages, run gated tests, preview for CEO.
 */

import { createHash } from "node:crypto";
import { getEmployeeDefinition } from "../ai-company-employees";
import type { WorkItemLink } from "../autonomous-company/types";
import { formatWorkItemLine } from "../autonomous-company/dev-ownership.logic";
import { detectMissingRequirements } from "../autonomous-company/work-items.logic";
import type {
  WorkpilotExecutionPackage,
  WorkpilotExecutionPreview,
  WorkpilotFileChange,
  WorkpilotTestResult,
} from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function fingerprintPlan(files: WorkpilotFileChange[]): string {
  const payload = files
    .map((f) => `${f.action}:${f.path}:${f.content.length}:${f.reason}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function suggestBranchName(workItem: WorkItemLink, employeeId: string): string {
  const slug = workItem.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `ai/${employeeId}/${slug || "work"}`;
}

export function defaultImplementationPlan(input: {
  goal: string;
  filesChanged: WorkpilotFileChange[];
}): string[] {
  return [
    `Inspect WorkPilot context for: ${input.goal}`,
    "Create a feature branch (never main)",
    ...input.filesChanged.map(
      (f) => `${f.action.toUpperCase()} ${f.path} — ${f.reason}`
    ),
    "Run focused tests for touched areas",
    "Prepare commit + pull request (no merge/deploy)",
  ];
}

export function defaultRollbackPlan(branchName: string): string {
  return `Close the PR without merging, delete feature branch \`${branchName}\`, and restore prior contents from default branch if any preview commits were pushed.`;
}

export function defaultRisks(files: WorkpilotFileChange[]): string[] {
  const risks = [
    "Change may affect WorkPilot production behavior after human merge",
    "Tests may not cover all regression surfaces",
  ];
  if (files.some((f) => /\.prisma$|migration/i.test(f.path))) {
    risks.push("Schema/migration risk — requires careful review before apply");
  }
  if (files.some((f) => /auth|permission|middleware/i.test(f.path))) {
    risks.push("Auth/permission surface touched — security review recommended");
  }
  return risks;
}

/** Deterministic package tests (no network). Failed tests must block execution. */
export function runDefaultPackageTests(files: WorkpilotFileChange[]): WorkpilotTestResult[] {
  const results: WorkpilotTestResult[] = [];

  results.push({
    id: "test-paths",
    name: "Safe file paths",
    command: "validate:paths",
    status: files.every((f) => f.path && !f.path.includes("..") && !f.path.startsWith("/"))
      ? "passed"
      : "failed",
    output: "Reject path traversal and absolute paths",
  });

  results.push({
    id: "test-no-empty",
    name: "Non-empty change set",
    command: "validate:changeset",
    status: files.length > 0 && files.every((f) => f.action === "delete" || f.content.length > 0)
      ? "passed"
      : "failed",
    output: files.length === 0 ? "No files proposed" : "Content present for create/update",
  });

  results.push({
    id: "test-no-delete",
    name: "No destructive deletes in pre-approval plan",
    command: "validate:no-delete",
    status: files.some((f) => f.action === "delete") ? "failed" : "passed",
    output: files.some((f) => f.action === "delete")
      ? "Delete actions require explicit CEO-approved destructive mode"
      : "No deletes planned",
  });

  const hasTestFile = files.some((f) =>
    /\.(test|spec)\.(ts|tsx|js|mjs)$/i.test(f.path)
  );
  results.push({
    id: "test-coverage-hint",
    name: "Test or doc companion present",
    command: "validate:tests-or-docs",
    status: hasTestFile || files.some((f) => /\.md$/i.test(f.path)) ? "passed" : "skipped",
    output: hasTestFile
      ? "Includes test file"
      : "No test file in package — skipped (docs-only allowed)",
  });

  return results;
}

export function buildExecutionPackage(input: {
  employeeId: string;
  workItem: WorkItemLink;
  goal: string;
  filesChanged: WorkpilotFileChange[];
  reasoning?: string;
  risks?: string[];
  implementationPlan?: string[];
  testResults: WorkpilotTestResult[];
  now: string;
  status: WorkpilotExecutionPackage["status"];
  blockerReason?: string | null;
}): WorkpilotExecutionPackage {
  const emp = getEmployeeDefinition(input.employeeId);
  const branchName = suggestBranchName(input.workItem, input.employeeId);
  const workLine = formatWorkItemLine(input.workItem);
  return {
    id: newId("wpexec"),
    workItem: input.workItem,
    employeeId: input.employeeId,
    employeeName: emp?.name ?? input.employeeId,
    goal: input.goal.trim(),
    branchName,
    implementationPlan:
      input.implementationPlan?.length
        ? input.implementationPlan
        : defaultImplementationPlan(input),
    filesChanged: input.filesChanged,
    reasoning:
      input.reasoning?.trim() ||
      `${emp?.name ?? input.employeeId} prepared WorkPilot changes for ${workLine}.`,
    risks: input.risks?.length ? input.risks : defaultRisks(input.filesChanged),
    testResults: input.testResults,
    rollbackPlan: defaultRollbackPlan(branchName),
    status: input.status,
    ceoDecision: null,
    ceoNote: null,
    blockerReason: input.blockerReason ?? null,
    prNumber: null,
    prUrl: null,
    commitShas: [],
    audit: [
      {
        at: input.now,
        action: "prepare",
        detail: `Prepared package with ${input.filesChanged.length} file(s)`,
        actor: input.employeeId,
      },
    ],
    createdAt: input.now,
    updatedAt: input.now,
    delayedUntil: null,
    planFingerprint: fingerprintPlan(input.filesChanged),
  };
}

export function toCeoPreview(pkg: WorkpilotExecutionPackage): WorkpilotExecutionPreview {
  return {
    goal: pkg.goal,
    filesChanged: pkg.filesChanged.map((f) => ({
      path: f.path,
      action: f.action,
      reason: f.reason,
    })),
    reasoning: pkg.reasoning,
    risks: pkg.risks,
    testResults: pkg.testResults,
    rollbackPlan: pkg.rollbackPlan,
    workItem: pkg.workItem,
    branchName: pkg.branchName,
    implementationPlan: pkg.implementationPlan,
  };
}

export function evaluateBlockers(input: {
  workItem: WorkItemLink;
  goal: string;
  filesChanged: WorkpilotFileChange[];
  missingRequirements?: string[];
  testResults: WorkpilotTestResult[];
}): string | null {
  const missing =
    input.missingRequirements?.length
      ? input.missingRequirements
      : detectMissingRequirements({
          title: input.workItem.title,
          description: `${input.goal}\n${input.filesChanged.map((f) => f.reason).join("\n")}`,
        });

  // Only block on requirements when explicitly provided or goal is clearly TBD
  if (
    (input.missingRequirements?.length ?? 0) > 0 ||
    /\b(tbd|unclear|todo:|figure out)\b/i.test(input.goal)
  ) {
    const list = missing.length ? missing : ["clarified scope"];
    return `Unclear requirements — execution stopped. Need CEO input: ${list.join("; ")}`;
  }

  const failed = input.testResults.filter((t) => t.status === "failed");
  if (failed.length > 0) {
    return `Failed tests stopped execution: ${failed.map((f) => f.name).join(", ")}`;
  }

  if (input.filesChanged.length === 0) {
    return "No file changes proposed — nothing to execute";
  }

  return null;
}

export { newId as newWorkpilotExecutionId };
