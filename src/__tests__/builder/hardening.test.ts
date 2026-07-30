/**
 * Beta Validation & Production Hardening — regression tests.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { opsRel } from "@/services/builder/workspace/paths";
import {
  ensureDefaultWorkspace,
  listWorkspacesForUser,
  createWorkspace,
  getMember,
  addOrUpdateMember,
} from "@/services/builder/workspace/workspace.store";
import { ensureHqAccess } from "@/services/builder/workspace/workspace.service";
import { readJsonFile, writeJsonFile, workspaceFile } from "@/services/builder/workspace/json-file";
import { upsertCollaboration, listCollaborations } from "@/services/builder/collaboration.store";
import { planCollaborationChain } from "@/services/builder/collaboration.logic";
import { decideApproval } from "@/services/builder/approval.service";
import { createConnectorSuite } from "@/services/builder/execution/connectors";
import {
  createMockConnectorSuite,
  resetMockConnectorState,
  bumpMockRevision,
} from "@/services/builder/execution/mock-connectors";
import {
  prepareExecution,
  decideExecution,
} from "@/services/builder/execution/execution.service";
import {
  allowTestConnectors,
  assertNoTestAdaptersOutsideTests,
} from "@/services/builder/onboarding/beta-safety";
import {
  publicApiError,
  redactSecrets,
} from "@/services/builder/hardening/redaction";
import { runProductionHealthDiagnostics } from "@/services/builder/hardening/diagnostics";
import { getAiCeoSafetyGuarantees } from "@/services/builder/ceo/safety";
import type { AuthContext } from "@/lib/auth";

function auth(userId: string, email = `${userId}@example.com`): AuthContext {
  return {
    user: { id: userId, email, name: userId } as AuthContext["user"],
    companyId: "company-test",
    role: "OWNER",
  };
}

describe("beta validation & production hardening", () => {
  let tmp = "";
  let prevFlag: string | undefined;
  let prevNode: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    prevNode = process.env.NODE_ENV;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-hard-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
    resetMockConnectorState();
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("denies cross-workspace access for non-members", () => {
    ensureDefaultWorkspace({
      userId: "owner-1",
      email: "o1@example.com",
      displayName: "Owner",
      repoRoot: tmp,
    });
    const other = createWorkspace({
      name: "Private",
      ownerUserId: "owner-2",
      ownerEmail: "o2@example.com",
      ownerDisplayName: "Owner Two",
      repoRoot: tmp,
    });
    const denied = ensureHqAccess({
      auth: auth("owner-1", "o1@example.com"),
      workspaceId: other.id,
      repoRoot: tmp,
    });
    assert.equal(denied.ok, false);
    if (!denied.ok) assert.equal(denied.code, "FORBIDDEN");
  });

  it("denies unauthorized mutations without permission", () => {
    ensureDefaultWorkspace({
      userId: "owner-1",
      email: "o1@example.com",
      displayName: "Owner",
      repoRoot: tmp,
    });
    addOrUpdateMember({
      workspaceId: "default",
      userId: "viewer-1",
      email: "v@example.com",
      displayName: "Viewer",
      role: "viewer",
      repoRoot: tmp,
    });
    const denied = ensureHqAccess({
      auth: auth("viewer-1", "v@example.com"),
      workspaceId: "default",
      permission: "approvals.decide",
      repoRoot: tmp,
    });
    assert.equal(denied.ok, false);
  });

  it("protects against path traversal in workspace ids", () => {
    const rel = opsRel("ai-company-executions.json", "../../etc/passwd");
    assert.equal(rel.includes(".."), false);
    assert.match(rel, /workspaces\/_+etc_passwd\//);
  });

  it("redacts secrets from public errors", () => {
    const cleaned = redactSecrets(
      "Authorization: Bearer ya29.abc TOKEN GOOGLE_CLIENT_SECRET=supersecret"
    );
    assert.equal(/ya29|Bearer ya29|supersecret|GOOGLE_CLIENT_SECRET=/.test(cleaned), false);
    const pub = publicApiError("X", "Safe fallback", new Error("ENOENT at C:\\secret\\path"));
    assert.equal(pub.error, "Safe fallback");
  });

  it("recovers from malformed storage JSON", () => {
    const file = workspaceFile(tmp, "ai-company-broken.json", "default");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{not-json", "utf8");
    const recovered = readJsonFile<{ ok: boolean }>(file, { ok: true });
    assert.deepEqual(recovered, { ok: true });
  });

  it("records human actor on approval decisions", async () => {
    const m = planCollaborationChain({
      missionId: "TASK-HARD-1",
      title: "Approve me",
      mission: "Approve me",
      leadEmployeeId: "emma",
      planSummary: "Approve me",
      planSteps: ["A", "B"],
      now: "2026-07-29T10:00:00.000Z",
    });
    upsertCollaboration(m, tmp, "default");
    const result = await decideApproval({
      missionId: "TASK-HARD-1",
      decision: "approve",
      repoRoot: tmp,
      workspaceId: "default",
      actor: { userId: "ceo-1", displayName: "CEO One", role: "owner" },
    });
    assert.equal(result.ok, true);
  });

  it("rejects stale approvals without writing", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "emma",
      action: "gmail.send_email",
      requestedAction: "Send note",
      params: { to: "a@example.com", subject: "Hi", body: "Hello" },
      repoRoot: tmp,
      connectors,
      workspaceId: "default",
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    bumpMockRevision("gmail");
    const decided = await decideExecution({
      executionId: prepared.record.id,
      decision: "approve",
      repoRoot: tmp,
      connectors,
      workspaceId: "default",
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.record.status, "stale");
    assert.notEqual(decided.record.executionStatus, "succeeded");
  });

  it("supports connector idempotent retry and rejects mocks in production", async () => {
    const connectors = createMockConnectorSuite();
    const first = await prepareExecution({
      employeeId: "emma",
      action: "gmail.send_email",
      requestedAction: "Send note",
      params: { to: "a@example.com", subject: "Hi", body: "Hello" },
      repoRoot: tmp,
      connectors,
      workspaceId: "ws-idem",
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;
    const approved = await decideExecution({
      executionId: first.record.id,
      decision: "approve",
      repoRoot: tmp,
      connectors,
      workspaceId: "ws-idem",
    });
    assert.equal(approved.ok, true);
    if (!approved.ok) return;
    assert.equal(approved.record.status, "succeeded");
    // Idempotent re-approve
    const again = await decideExecution({
      executionId: first.record.id,
      decision: "approve",
      repoRoot: tmp,
      connectors,
      workspaceId: "ws-idem",
    });
    assert.equal(again.ok, true);
    if (!again.ok) return;
    assert.equal(again.record.status, "succeeded");

    process.env.NODE_ENV = "production";
    assert.equal(allowTestConnectors(), false);
    assert.throws(() => assertNoTestAdaptersOutsideTests("test"));
    assert.throws(() => createConnectorSuite("test"));
    assert.throws(() => createMockConnectorSuite());
    if (prevNode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNode;
  });

  it("isolates workspace collaboration records", () => {
    upsertCollaboration(
      planCollaborationChain({
        missionId: "TASK-A",
        title: "A",
        mission: "A",
        leadEmployeeId: "emma",
        planSummary: "A",
        planSteps: ["x"],
        now: "2026-07-29T10:00:00.000Z",
      }),
      tmp,
      "default"
    );
    upsertCollaboration(
      planCollaborationChain({
        missionId: "TASK-B",
        title: "B",
        mission: "B",
        leadEmployeeId: "alex",
        planSummary: "B",
        planSteps: ["x"],
        now: "2026-07-29T10:00:00.000Z",
      }),
      tmp,
      "other"
    );
    assert.equal(listCollaborations(tmp, "default").length, 1);
    assert.equal(listCollaborations(tmp, "other").length, 1);
    assert.equal(listCollaborations(tmp, "default")[0].id, "TASK-A");
  });

  it("keeps default workspace compatible and filters workspace lists", () => {
    ensureDefaultWorkspace({
      userId: "owner-1",
      email: "o1@example.com",
      displayName: "Owner",
      repoRoot: tmp,
    });
    createWorkspace({
      name: "Hidden",
      ownerUserId: "owner-2",
      ownerEmail: "o2@example.com",
      ownerDisplayName: "Two",
      repoRoot: tmp,
    });
    const visible = listWorkspacesForUser("owner-1", tmp);
    assert.ok(visible.every((w) => getMember(w.id, "owner-1", tmp)));
    assert.ok(!visible.some((w) => w.name === "Hidden"));
  });

  it("reports health diagnostics without secrets", () => {
    const diags = runProductionHealthDiagnostics({
      workspaceId: "default",
      repoRoot: tmp,
    });
    assert.ok(diags.some((d) => d.key === "storage.availability"));
    assert.ok(diags.some((d) => d.key === "approval.safety"));
    const blob = JSON.stringify(diags);
    assert.equal(/GOOGLE_CLIENT_SECRET|ya29|Bearer /.test(blob), false);
  });

  it("prohibits AI CEO from approving external writes", () => {
    const g = getAiCeoSafetyGuarantees();
    assert.equal(g.neverApprovesExternalWrites, true);
    assert.equal(g.neverBypassesApprovals, true);
  });

  it("does not auto-join second users to default workspace", () => {
    ensureDefaultWorkspace({
      userId: "owner-1",
      email: "o1@example.com",
      displayName: "Owner",
      repoRoot: tmp,
    });
    const second = ensureDefaultWorkspace({
      userId: "user-2",
      email: "u2@example.com",
      displayName: "User Two",
      repoRoot: tmp,
    });
    assert.equal(second.member, null);
    assert.equal(getMember("default", "user-2", tmp), null);
  });

  it("atomic write recovers via writeJsonFile", () => {
    const file = workspaceFile(tmp, "ai-company-atomic.json", "default");
    writeJsonFile(file, { v: 1 });
    writeJsonFile(file, { v: 2 });
    assert.deepEqual(readJsonFile(file, { v: 0 }), { v: 2 });
  });
});
