import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  bumpMockRevision,
  createMockConnectorSuite,
  decideExecution,
  prepareExecution,
  resetMockConnectorState,
} from "@/services/builder/execution";
import { getConnectionStatusesSync } from "@/services/builder/execution/connection-status";
import { listExecutions } from "@/services/builder/execution/execution.store";
import { ConnectorError } from "@/services/builder/execution/types";

describe("execution layer v5", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ai-exec-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetMockConnectorState();
  });

  it("prepares a preview without executing writes", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "emma",
      action: "gmail.prepare_reply",
      requestedAction: "Draft reply to unanswered email",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.equal(prepared.record.status, "awaiting_approval");
    assert.equal(prepared.record.executionStatus, "not_started");
    assert.equal(prepared.record.externalReference, null);
    assert.ok(prepared.record.preview.summary.length > 0);
    assert.ok(prepared.record.dataFingerprint.length > 10);
  });

  it("rejects approval when source data became stale", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "emma",
      action: "gmail.send_reply",
      requestedAction: "Send follow-up email",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    bumpMockRevision("gmail");

    const decided = await decideExecution({
      executionId: prepared.record.id,
      decision: "approve",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.record.status, "stale");
    assert.equal(decided.record.executionStatus, "skipped");
    assert.equal(decided.record.externalReference, null);
    assert.match(decided.record.errorDetails ?? "", /Stale approval/i);
  });

  it("executes after approval and verifies result", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "emma",
      action: "gmail.send_reply",
      requestedAction: "Send approved reply",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const decided = await decideExecution({
      executionId: prepared.record.id,
      decision: "approve",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.record.status, "succeeded");
    assert.equal(decided.record.executionStatus, "succeeded");
    assert.ok(decided.record.externalReference);
    assert.ok(decided.record.verificationResult);
  });

  it("is idempotent for repeated write approvals with same key", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "david",
      action: "drive.save_file",
      requestedAction: "Save proposal document",
      params: { title: "Acme Proposal", body: "Proposal body" },
      repoRoot: tmp,
      connectors,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const first = await decideExecution({
      executionId: prepared.record.id,
      decision: "approve",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(first.ok, true);
    if (!first.ok) return;

    // Re-run write through connector with same idempotency key
    const again = await connectors.drive.saveFile({
      title: "Acme Proposal",
      content: "Proposal body",
      idempotencyKey: prepared.record.idempotencyKey,
    });
    assert.equal(again.externalReference, first.record.externalReference);
  });

  it("records audit fields on success and failure paths", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "sarah",
      action: "crm.write_update",
      requestedAction: "Update CRM follow-up",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    const rejected = await decideExecution({
      executionId: prepared.record.id,
      decision: "reject",
      note: "Hold",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(rejected.ok, true);
    if (!rejected.ok) return;
    assert.equal(rejected.record.status, "rejected");
    assert.equal(rejected.record.approvalDecision, "reject");
    assert.equal(rejected.record.ceoNote, "Hold");

    const rows = listExecutions(tmp);
    assert.ok(rows.some((r) => r.id === prepared.record.id));
    assert.ok(rows.every((r) => r.createdAt && r.updatedAt));
  });

  it("shows disconnected state without fake success when credentials missing", async () => {
    // Live mode without credentials — must not pretend to succeed.
    const live = await prepareExecution({
      employeeId: "emma",
      action: "gmail.send_reply",
      requestedAction: "Send email",
      repoRoot: tmp,
      connectorMode: "live",
    });
    assert.equal(live.ok, true);
    if (!live.ok) return;
    assert.equal(live.record.status, "disconnected");
    assert.equal(live.record.executionStatus, "skipped");
    assert.equal(live.record.connection.connected, false);
    assert.ok(live.record.errorDetails);

    const statuses = getConnectionStatusesSync();
    assert.ok(statuses.some((s) => s.system === "gmail" && s.connected === false));
  });

  it("supports calendar, drive, and crm preview preparation", async () => {
    const connectors = createMockConnectorSuite();
    for (const emp of ["alex", "david", "sarah"] as const) {
      const prepared = await prepareExecution({
        employeeId: emp,
        action:
          emp === "alex"
            ? "calendar.create_event"
            : emp === "david"
              ? "drive.save_file"
              : "crm.write_update",
        requestedAction: `Work for ${emp}`,
        repoRoot: tmp,
        connectors,
      });
      assert.equal(prepared.ok, true);
      if (!prepared.ok) return;
      assert.equal(prepared.record.status, "awaiting_approval");
    }
  });

  it("records failed execution without fake success", async () => {
    const connectors = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "emma",
      action: "gmail.send_reply",
      requestedAction: "Send reply that will fail",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;

    // Force write failure after fingerprint still matches
    connectors.gmail.sendReply = async () => {
      throw new ConnectorError("Gmail send failed in test", "TRANSIENT", {
        retryable: false,
      });
    };

    const decided = await decideExecution({
      executionId: prepared.record.id,
      decision: "approve",
      repoRoot: tmp,
      connectors,
    });
    assert.equal(decided.ok, true);
    if (!decided.ok) return;
    assert.equal(decided.record.status, "failed");
    assert.equal(decided.record.executionStatus, "failed");
    assert.equal(decided.record.externalReference, null);
    assert.match(decided.record.errorDetails ?? "", /Gmail send failed/i);
  });

  it("keeps CRM live deferred while mock CRM works in tests", async () => {
    const live = await prepareExecution({
      employeeId: "sarah",
      action: "crm.write_update",
      requestedAction: "CRM update",
      repoRoot: tmp,
      connectorMode: "live",
    });
    assert.equal(live.ok, true);
    if (!live.ok) return;
    assert.equal(live.record.status, "disconnected");
    assert.match(live.record.errorDetails ?? "", /deferred/i);

    const statuses = getConnectionStatusesSync();
    const crm = statuses.find((s) => s.system === "crm");
    assert.ok(crm);
    assert.equal(crm.connected, false);
    assert.match(crm.reason ?? "", /deferred/i);

    const mock = createMockConnectorSuite();
    const prepared = await prepareExecution({
      employeeId: "sarah",
      action: "crm.write_update",
      requestedAction: "CRM update via mock",
      repoRoot: tmp,
      connectors: mock,
    });
    assert.equal(prepared.ok, true);
    if (!prepared.ok) return;
    assert.equal(prepared.record.status, "awaiting_approval");
  });
});
