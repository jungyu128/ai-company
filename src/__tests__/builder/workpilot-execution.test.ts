/**
 * Controlled WorkPilot execution — approval gates and safe apply.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assertNoForbiddenIntent,
  assertSafeExecutionPlan,
  refuseDeploy,
  refuseDestructiveAction,
  refuseMerge,
  refuseSend,
} from "@/services/builder/workpilot-execution/safety.logic";
import {
  prepareWorkpilotExecution,
  decideWorkpilotExecution,
  getWorkpilotExecution,
  toCeoPreview,
} from "@/services/builder/workpilot-execution";
import type { WorkpilotGithubWriter } from "@/services/builder/workpilot-execution";
import { listAudit } from "@/services/builder/workspace/collaboration-feed";

function workItem() {
  return {
    kind: "feature" as const,
    id: "feature-hq-chat",
    title: "HQ Conversation autonomy",
    url: null,
    refs: ["feature:hq-chat", "TASK-2026-07-31-002"],
  };
}

function sampleFiles() {
  return [
    {
      path: "src/features/os/chat.ts",
      action: "create" as const,
      content: "export const ok = true;\n",
      reason: "Add chat helper",
    },
    {
      path: "src/features/os/chat.test.ts",
      action: "create" as const,
      content: "import assert from 'node:assert';\nassert.equal(true, true);\n",
      reason: "Focused test",
    },
  ];
}

function mockWriter(log: string[]): WorkpilotGithubWriter {
  return {
    async createBranch({ branch, approval }) {
      log.push(`branch:${branch}:${approval.reason}`);
      return { ref: `refs/heads/${branch}`, sha: "sha-base" };
    },
    async createOrUpdateFile({ path: filePath, branch, approval }) {
      log.push(`file:${filePath}@${branch}:${approval.ownerApproved}`);
      return {
        contentPath: filePath,
        commitSha: `commit-${log.length}`,
        htmlUrl: null,
      };
    },
    async createPullRequest({ title, head, approval }) {
      log.push(`pr:${head}:${title.slice(0, 20)}:${approval.ownerApproved}`);
      return {
        number: 101,
        htmlUrl: "https://github.com/jungyu128/workpilot/pull/101",
      };
    },
  };
}

describe("workpilot execution safety", () => {
  it("refuses merge, deploy, send, and deletes without approval", () => {
    assert.throws(() => refuseMerge(), /merge/i);
    assert.throws(() => refuseDeploy(), /deploy/i);
    assert.throws(() => refuseSend(), /send/i);
    assert.throws(() => refuseDestructiveAction("delete"), /delete/i);
    assert.throws(() => assertNoForbiddenIntent("please merge this PR"), /merge/i);
    assert.throws(
      () => assertNoForbiddenIntent("auto-deploy to production tonight"),
      /deploy/i
    );
    assert.throws(
      () =>
        assertSafeExecutionPlan({
          branchName: "main",
          filesChanged: sampleFiles(),
        }),
      /main/
    );
    assert.throws(
      () =>
        assertSafeExecutionPlan({
          branchName: "ai/emma/feature",
          filesChanged: [
            {
              path: "x.ts",
              action: "delete",
              content: "",
              reason: "remove",
            },
          ],
          allowDeletes: false,
        }),
      /delete/i
    );
  });
});

describe("workpilot execution prepare + decide", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wp-exec-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("requires a tracked WorkPilot work item", () => {
    const result = prepareWorkpilotExecution({
      employeeId: "mia",
      workItem: { kind: "feature", id: "", title: "", refs: [] },
      goal: "Ship UI",
      filesChanged: sampleFiles(),
      repoRoot: tmp,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "WORK_ITEM_REQUIRED");
  });

  it("prepares a CEO preview without writing to GitHub", () => {
    const writes: string[] = [];
    const result = prepareWorkpilotExecution({
      employeeId: "mia",
      workItem: workItem(),
      goal: "Add HQ chat helper with acceptance criteria for desktop HQ.",
      filesChanged: sampleFiles(),
      reasoning: "Enables controlled conversation utilities.",
      missingRequirements: [],
      repoRoot: tmp,
      now: "2026-07-31T06:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.package.status, "awaiting_approval");
    assert.equal(writes.length, 0);
    const preview = toCeoPreview(result.package);
    assert.ok(preview.goal);
    assert.ok(preview.filesChanged.length >= 2);
    assert.ok(preview.reasoning);
    assert.ok(preview.risks.length >= 1);
    assert.ok(preview.testResults.length >= 1);
    assert.ok(preview.rollbackPlan.length > 10);
    assert.match(preview.branchName, /^ai\/mia\//);
  });

  it("blocks on failed tests and records a blocker", () => {
    const result = prepareWorkpilotExecution({
      employeeId: "ethan",
      workItem: workItem(),
      goal: "Add regression coverage with clear acceptance criteria.",
      filesChanged: sampleFiles(),
      missingRequirements: [],
      runTests: () => [
        {
          id: "t1",
          name: "Unit suite",
          command: "npm test",
          status: "failed",
          output: "1 failing",
        },
      ],
      repoRoot: tmp,
      now: "2026-07-31T06:10:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.package.status, "blocked");
    assert.match(result.package.blockerReason ?? "", /Failed tests/i);
  });

  it("blocks on unclear requirements", () => {
    const result = prepareWorkpilotExecution({
      employeeId: "emma",
      workItem: workItem(),
      goal: "Figure out something TBD for the product",
      filesChanged: sampleFiles(),
      missingRequirements: ["acceptance criteria / definition of done"],
      repoRoot: tmp,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.package.status, "blocked");
    assert.match(result.package.blockerReason ?? "", /Unclear requirements/i);
  });

  it("supports CEO request_changes, reject, and delay without GitHub writes", async () => {
    const prepared = prepareWorkpilotExecution({
      employeeId: "noah",
      workItem: workItem(),
      goal: "Harden API errors with acceptance criteria documented.",
      filesChanged: sampleFiles(),
      missingRequirements: [],
      repoRoot: tmp,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const changes = await decideWorkpilotExecution({
      executionId: prepared.package.id,
      decision: "request_changes",
      note: "Add more tests",
      repoRoot: tmp,
      actor: { userId: "owner", displayName: "CEO", role: "owner" },
    });
    assert.equal(changes.ok, true);
    if (!changes.ok) return;
    assert.equal(changes.package.status, "changes_requested");

    const prepared2 = prepareWorkpilotExecution({
      employeeId: "noah",
      workItem: workItem(),
      goal: "Second package with acceptance criteria for APIs.",
      filesChanged: sampleFiles(),
      missingRequirements: [],
      repoRoot: tmp,
    });
    assert.equal(prepared2.ok, true);
    if (!prepared2.ok) return;

    const rejected = await decideWorkpilotExecution({
      executionId: prepared2.package.id,
      decision: "reject",
      note: "Out of scope",
      repoRoot: tmp,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    assert.equal(rejected.package.status, "rejected");

    const prepared3 = prepareWorkpilotExecution({
      employeeId: "alex",
      workItem: workItem(),
      goal: "Deploy readiness checklist docs with acceptance criteria.",
      filesChanged: [
        {
          path: "docs/deploy-checklist.md",
          action: "create",
          content: "# Checklist\n",
          reason: "Docs only",
        },
      ],
      missingRequirements: [],
      repoRoot: tmp,
    });
    assert.equal(prepared3.ok, true);
    if (!prepared3.ok) return;

    const delayed = await decideWorkpilotExecution({
      executionId: prepared3.package.id,
      decision: "delay",
      delayUntil: "2026-08-01T00:00:00.000Z",
      repoRoot: tmp,
    });
    assert.equal(delayed.ok, true);
    if (!delayed.ok) return;
    assert.equal(delayed.package.status, "delayed");
    assert.equal(delayed.package.delayedUntil, "2026-08-01T00:00:00.000Z");
  });

  it("applies branch/files/PR on approve but never merges", async () => {
    const log: string[] = [];
    const prepared = prepareWorkpilotExecution({
      employeeId: "mia",
      workItem: workItem(),
      goal: "Ship chat helper with acceptance criteria for desktop.",
      filesChanged: sampleFiles(),
      missingRequirements: [],
      repoRoot: tmp,
      now: "2026-07-31T07:00:00.000Z",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const decided = await decideWorkpilotExecution({
      executionId: prepared.package.id,
      decision: "approve",
      note: "Approved for feature branch PR",
      repoRoot: tmp,
      writer: mockWriter(log),
      actor: { userId: "owner", displayName: "CEO", role: "owner" },
      now: "2026-07-31T07:01:00.000Z",
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.package.status, "succeeded");
    assert.equal(decided.package.prNumber, 101);
    assert.ok(decided.package.commitShas.length >= 2);
    assert.ok(log.some((l) => l.startsWith("branch:")));
    assert.ok(log.some((l) => l.startsWith("file:")));
    assert.ok(log.some((l) => l.startsWith("pr:")));
    assert.equal(log.some((l) => /merge/i.test(l)), false);

    const stored = getWorkpilotExecution(prepared.package.id, tmp);
    assert.equal(stored?.status, "succeeded");
    assert.ok(stored?.audit.some((a) => a.action === "approve"));

    const audits = listAudit("default", tmp, 20);
    assert.ok(
      audits.some((a) => a.action === "workpilot_execution.approve" || a.action === "workpilot_execution.prepare")
    );
  });
});
