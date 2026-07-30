/**
 * Execution Layer service — preview → CEO approval → execute → verify → audit.
 * External writes never run without explicit approval.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import { createConnectorSuite, getAllConnectionStatuses, type ConnectorMode } from "./connectors";
import {
  getExecution,
  listExecutions,
  listExecutionsForEmployee,
  upsertExecution,
} from "./execution.store";
import { fingerprintPayload, withRetry } from "./utils";
import {
  WRITE_ACTIONS,
  defaultWriteActionForEmployee,
  employeeSystemFor,
  type ConnectorSuite,
  type ExecutionActionKind,
  type ExecutionPreviewPayload,
  type ExecutionRecord,
  type ExternalSystem,
} from "./types";
import { ConnectorError } from "./types";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type PrepareExecutionInput = {
  employeeId: string;
  missionId?: string | null;
  action: ExecutionActionKind;
  requestedAction: string;
  /** Optional guidance / payload for preparing the preview. */
  params?: Record<string, unknown>;
  repoRoot?: string;
  connectorMode?: ConnectorMode;
  connectors?: ConnectorSuite;
  workspaceId?: string;
};

export async function getExecutionConnectionStatuses(options?: {
  connectorMode?: ConnectorMode;
  connectors?: ConnectorSuite;
}) {
  const suite = options?.connectors ?? createConnectorSuite(options?.connectorMode ?? "live");
  return getAllConnectionStatuses(suite);
}

async function buildPreview(
  suite: ConnectorSuite,
  employeeId: string,
  action: ExecutionActionKind,
  params: Record<string, unknown>
): Promise<{ system: ExternalSystem; preview: ExecutionPreviewPayload }> {
  const system = employeeSystemFor(employeeId);
  if (!system) {
    throw new ConnectorError(
      "This employee is not mapped to an external work system.",
      "VALIDATION"
    );
  }

  if (system === "gmail") {
    const status = await suite.gmail.getStatus();
    if (!status.connected) {
      throw new ConnectorError(status.reason ?? "Gmail disconnected.", "DISCONNECTED", {
        status: 503,
      });
    }
    const inbox = await suite.gmail.readInbox({ max: 5 });
    const threadId =
      (typeof params.threadId === "string" && params.threadId) ||
      inbox[0]?.threadId ||
      null;
    if (!threadId) {
      throw new ConnectorError("No Gmail threads available to prepare.", "NOT_FOUND");
    }
    const thread = await suite.gmail.summarizeThread({ threadId });
    const draft = await suite.gmail.prepareReply({
      threadId,
      guidance: typeof params.guidance === "string" ? params.guidance : undefined,
    });
    return {
      system,
      preview: {
        summary:
          action === "gmail.send_reply"
            ? `Send reply to ${draft.to}: ${draft.subject}`
            : `Prepare Gmail reply for “${thread.subject}”`,
        details: { inboxSample: inbox.slice(0, 3), thread, draft, action },
        sourceSnapshot: { thread, draft, inboxRevision: inbox.map((m) => m.id) },
      },
    };
  }

  if (system === "google_calendar") {
    const status = await suite.calendar.getStatus();
    if (!status.connected) {
      throw new ConnectorError(status.reason ?? "Calendar disconnected.", "DISCONNECTED", {
        status: 503,
      });
    }
    const from = (params.from as string) || new Date().toISOString();
    const to =
      (params.to as string) ||
      new Date(Date.now() + 24 * 3_600_000).toISOString();
    const schedule = await suite.calendar.readSchedule({ from, to });
    const conflicts = await suite.calendar.detectConflicts({ from, to });
    const suggestions = await suite.calendar.suggestTimes({
      durationMinutes: Number(params.durationMinutes ?? 30),
      after: from,
    });
    const eventDraft = {
      title: (params.title as string) || "Reschedule: clear conflict",
      start: suggestions[0]?.start ?? from,
      end: suggestions[0]?.end ?? to,
      attendees: (params.attendees as string[]) || [],
    };
    return {
      system,
      preview: {
        summary:
          action === "calendar.update_event"
            ? `Update calendar event for conflict resolution`
            : `Create calendar event “${eventDraft.title}”`,
        details: { schedule, conflicts, suggestions, eventDraft, action },
        sourceSnapshot: { schedule, conflicts, eventDraft },
      },
    };
  }

  if (system === "google_drive") {
    const status = await suite.drive.getStatus();
    if (!status.connected) {
      throw new ConnectorError(status.reason ?? "Drive disconnected.", "DISCONNECTED", {
        status: 503,
      });
    }
    const title = (params.title as string) || "Proposal draft";
    const kind =
      (params.kind as "proposal" | "meeting_notes" | "quote" | "report") || "proposal";
    const body = (params.body as string) || "Generated by David for CEO review.";
    const generated = await suite.drive.generateDocument({ title, kind, body });
    return {
      system,
      preview: {
        summary:
          action === "drive.share_external"
            ? `Share document “${title}” externally`
            : `Save document “${title}” to Drive`,
        details: {
          generated,
          shareEmail: (params.email as string) || null,
          action,
        },
        sourceSnapshot: { generated, shareEmail: (params.email as string) || null },
      },
    };
  }

  // CRM
  const status = await suite.crm.getStatus();
  if (!status.connected) {
    throw new ConnectorError(status.reason ?? "CRM disconnected.", "DISCONNECTED", {
      status: 503,
    });
  }
  const followUps = await suite.crm.identifyFollowUps();
  const recordId =
    (params.recordId as string) || followUps[0]?.id || null;
  if (!recordId) {
    throw new ConnectorError("No CRM follow-ups available.", "NOT_FOUND");
  }
  const update = await suite.crm.prepareUpdate({
    recordId,
    note: (params.note as string) || "Follow-up prepared for CEO approval",
  });
  return {
    system: "crm",
    preview: {
      summary: `Update CRM record ${update.recordId}`,
      details: { followUps: followUps.slice(0, 5), update, action },
      sourceSnapshot: { update, followUps: followUps.map((r) => ({ id: r.id, updatedAt: r.updatedAt })) },
    },
  };
}

async function refetchFingerprint(
  suite: ConnectorSuite,
  record: ExecutionRecord
): Promise<string> {
  const rebuilt = await buildPreview(
    suite,
    record.employeeId,
    record.action,
    record.prepareParams ?? {}
  );
  return fingerprintPayload(rebuilt.preview.sourceSnapshot);
}

async function performWrite(
  suite: ConnectorSuite,
  record: ExecutionRecord
): Promise<{ externalReference: string; verificationResult: string }> {
  if (!WRITE_ACTIONS.has(record.action)) {
    return {
      externalReference: `preview-only-${record.id}`,
      verificationResult: "Preview-only action — no external write performed.",
    };
  }

  if (record.system === "gmail" && record.action === "gmail.send_reply") {
    const draft = record.preview.details.draft as {
      threadId: string;
      to: string;
      subject: string;
      body: string;
      inReplyToMessageId: string;
    };
    const result = await withRetry(() =>
      suite.gmail.sendReply({ draft, idempotencyKey: record.idempotencyKey })
    );
    return {
      externalReference: result.externalReference,
      verificationResult: result.verified
        ? result.details
        : "Send completed but verification incomplete",
    };
  }

  if (record.system === "google_calendar") {
    const eventDraft = record.preview.details.eventDraft as {
      title: string;
      start: string;
      end: string;
      attendees?: string[];
    };
    if (record.action === "calendar.update_event") {
      const eventId =
        (record.preview.details.schedule as Array<{ id: string }> | undefined)?.[0]?.id ??
        "unknown";
      const result = await withRetry(() =>
        suite.calendar.updateEvent({
          eventId,
          title: eventDraft.title,
          start: eventDraft.start,
          end: eventDraft.end,
          idempotencyKey: record.idempotencyKey,
        })
      );
      return {
        externalReference: result.externalReference,
        verificationResult: result.details,
      };
    }
    const result = await withRetry(() =>
      suite.calendar.createEvent({
        ...eventDraft,
        idempotencyKey: record.idempotencyKey,
      })
    );
    return {
      externalReference: result.externalReference,
      verificationResult: result.details,
    };
  }

  if (record.system === "google_drive") {
    const generated = record.preview.details.generated as {
      title: string;
      content: string;
    };
    if (record.action === "drive.share_external") {
      const email = record.preview.details.shareEmail as string;
      if (!email) {
        throw new ConnectorError("Share email is required.", "VALIDATION");
      }
      // Save first if needed, then share — for preview we share using generated title as doc id in mock.
      const saved = await withRetry(() =>
        suite.drive.saveFile({
          title: generated.title,
          content: generated.content,
          idempotencyKey: `${record.idempotencyKey}-save`,
        })
      );
      const shared = await withRetry(() =>
        suite.drive.shareExternal({
          documentId: saved.document.id,
          email,
          idempotencyKey: record.idempotencyKey,
        })
      );
      return {
        externalReference: shared.externalReference,
        verificationResult: `${saved.details}; ${shared.details}`,
      };
    }
    const saved = await withRetry(() =>
      suite.drive.saveFile({
        title: generated.title,
        content: generated.content,
        idempotencyKey: record.idempotencyKey,
      })
    );
    return {
      externalReference: saved.externalReference,
      verificationResult: saved.document.webViewLink ?? saved.details,
    };
  }

  if (record.system === "crm") {
    const update = record.preview.details.update as {
      recordId: string;
      fields: Record<string, string>;
      rationale: string;
    };
    const result = await withRetry(() =>
      suite.crm.writeUpdate({ preview: update, idempotencyKey: record.idempotencyKey })
    );
    return {
      externalReference: result.externalReference,
      verificationResult: result.details,
    };
  }

  throw new ConnectorError("Unsupported write action.", "VALIDATION");
}

/**
 * Fetch external data, generate preview, and queue for CEO approval.
 * Write actions are never executed here.
 */
export async function prepareExecution(
  input: PrepareExecutionInput
): Promise<
  | { ok: true; record: ExecutionRecord }
  | { ok: false; code: string; message: string; status: number }
> {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const emp = getEmployeeDefinition(input.employeeId);
  if (!emp) {
    return {
      ok: false,
      code: "INVALID_EMPLOYEE",
      message: "Unknown AI Employee",
      status: 400,
    };
  }

  const suite =
    input.connectors ?? createConnectorSuite(input.connectorMode ?? "live");
  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? "default";
  const now = nowIso();
  const prepareParams = input.params ?? {};

  try {
    const { system, preview } = await buildPreview(
      suite,
      input.employeeId,
      input.action,
      prepareParams
    );
    // Persist resolved identifiers so stale checks re-fetch the same resources.
    const resolvedParams: Record<string, unknown> = { ...prepareParams };
    const draft = preview.details.draft as { threadId?: string } | undefined;
    if (draft?.threadId) resolvedParams.threadId = draft.threadId;
    const update = preview.details.update as { recordId?: string } | undefined;
    if (update?.recordId) resolvedParams.recordId = update.recordId;
    const generated = preview.details.generated as
      | { title?: string; kind?: string; content?: string }
      | undefined;
    if (generated?.title) resolvedParams.title = generated.title;
    if (generated?.kind) resolvedParams.kind = generated.kind;
    if (typeof prepareParams.body === "string") resolvedParams.body = prepareParams.body;
    const connection =
      system === "gmail"
        ? await suite.gmail.getStatus()
        : system === "google_calendar"
          ? await suite.calendar.getStatus()
          : system === "google_drive"
            ? await suite.drive.getStatus()
            : await suite.crm.getStatus();

    const writeAction = WRITE_ACTIONS.has(input.action)
      ? input.action
      : defaultWriteActionForEmployee(input.employeeId) ?? defaultWriteAction(system);

    const record: ExecutionRecord = {
      id: newId("exec"),
      employeeId: emp.id,
      employeeName: emp.name,
      missionId: input.missionId ?? null,
      system,
      action: writeAction,
      requestedAction: input.requestedAction,
      preview,
      prepareParams: resolvedParams,
      dataFingerprint: fingerprintPayload(preview.sourceSnapshot),
      status: "awaiting_approval",
      approvalDecision: null,
      ceoNote: null,
      executionStatus: "not_started",
      externalReference: null,
      verificationResult: null,
      errorDetails: null,
      idempotencyKey: `idem-${emp.id}-${writeAction}-${fingerprintPayload(preview.sourceSnapshot)}`,
      connection,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      executedAt: null,
    };

    upsertExecution(record, root, workspaceId);
    return { ok: true, record };
  } catch (err) {
    if (err instanceof ConnectorError && err.code === "DISCONNECTED") {
      const system = employeeSystemFor(input.employeeId)!;
      const connection =
        system === "gmail"
          ? await suite.gmail.getStatus()
          : system === "google_calendar"
            ? await suite.calendar.getStatus()
            : system === "google_drive"
              ? await suite.drive.getStatus()
              : await suite.crm.getStatus();
      const record: ExecutionRecord = {
        id: newId("exec"),
        employeeId: emp.id,
        employeeName: emp.name,
        missionId: input.missionId ?? null,
        system,
        action: input.action,
        requestedAction: input.requestedAction,
        preview: {
          summary: "Connector disconnected — cannot prepare execution",
          details: { reason: err.message },
          sourceSnapshot: { disconnected: true },
        },
        prepareParams,
        dataFingerprint: fingerprintPayload({ disconnected: true, at: now }),
        status: "disconnected",
        approvalDecision: null,
        ceoNote: null,
        executionStatus: "skipped",
        externalReference: null,
        verificationResult: null,
        errorDetails: err.message,
        idempotencyKey: `idem-disconnected-${emp.id}-${now}`,
        connection,
        createdAt: now,
        updatedAt: now,
        approvedAt: null,
        executedAt: null,
      };
      upsertExecution(record, root, workspaceId);
      return { ok: true, record };
    }
    return {
      ok: false,
      code: err instanceof ConnectorError ? err.code : "UNKNOWN",
      message: err instanceof Error ? err.message : "Prepare failed",
      status: err instanceof ConnectorError ? err.status : 500,
    };
  }
}

function defaultWriteAction(system: ExternalSystem): ExecutionActionKind {
  switch (system) {
    case "gmail":
      return "gmail.send_reply";
    case "google_calendar":
      return "calendar.create_event";
    case "google_drive":
      return "drive.save_file";
    case "crm":
      return "crm.write_update";
  }
}

/**
 * CEO decision on an execution preview.
 * Approve re-fetches source data; stale fingerprints are rejected without writing.
 */
export async function decideExecution(input: {
  executionId: string;
  decision: "approve" | "reject";
  note?: string | null;
  repoRoot?: string;
  connectorMode?: ConnectorMode;
  connectors?: ConnectorSuite;
  workspaceId?: string;
}): Promise<
  | { ok: true; record: ExecutionRecord }
  | { ok: false; code: string; message: string; status: number }
> {
  if (!isInternalAiCompanyEnabled()) {
    return {
      ok: false,
      code: "DISABLED",
      message: "Internal AI Company is disabled",
      status: 403,
    };
  }

  const root = input.repoRoot ?? process.cwd();
  const workspaceId = input.workspaceId ?? "default";
  const existing = getExecution(input.executionId, root, workspaceId);
  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: "Execution not found", status: 404 };
  }

  if (existing.status === "disconnected") {
    return {
      ok: false,
      code: "DISCONNECTED",
      message: existing.errorDetails ?? "Connector disconnected",
      status: 503,
    };
  }

  if (existing.status === "succeeded" || existing.status === "failed") {
    // Idempotent return of final state
    return { ok: true, record: existing };
  }

  const now = nowIso();
  const suite =
    input.connectors ?? createConnectorSuite(input.connectorMode ?? "live");

  if (input.decision === "reject") {
    const rejected: ExecutionRecord = {
      ...existing,
      status: "rejected",
      approvalDecision: "reject",
      ceoNote: input.note?.trim() || null,
      executionStatus: "skipped",
      updatedAt: now,
      approvedAt: now,
    };
    upsertExecution(rejected, root, workspaceId);
    return { ok: true, record: rejected };
  }

  // Approve path — never write without stale check
  try {
    const freshFingerprint = await refetchFingerprint(suite, existing);
    if (freshFingerprint !== existing.dataFingerprint) {
      const stale: ExecutionRecord = {
        ...existing,
        status: "stale",
        approvalDecision: "approve",
        ceoNote: input.note?.trim() || "Rejected: underlying data changed after preview",
        executionStatus: "skipped",
        errorDetails:
          "Stale approval — source data changed after preview. Prepare a new execution.",
        updatedAt: now,
        approvedAt: now,
      };
      upsertExecution(stale, root, workspaceId);
      return { ok: true, record: stale };
    }

    const executing: ExecutionRecord = {
      ...existing,
      status: "executing",
      approvalDecision: "approve",
      ceoNote: input.note?.trim() || null,
      updatedAt: now,
      approvedAt: now,
    };
    upsertExecution(executing, root, workspaceId);

    const write = await performWrite(suite, executing);
    const succeeded: ExecutionRecord = {
      ...executing,
      status: "succeeded",
      executionStatus: "succeeded",
      externalReference: write.externalReference,
      verificationResult: write.verificationResult,
      errorDetails: null,
      updatedAt: nowIso(),
      executedAt: nowIso(),
    };
    upsertExecution(succeeded, root, workspaceId);
    return { ok: true, record: succeeded };
  } catch (err) {
    const failed: ExecutionRecord = {
      ...existing,
      status: "failed",
      approvalDecision: "approve",
      ceoNote: input.note?.trim() || null,
      executionStatus: "failed",
      errorDetails: err instanceof Error ? err.message : "Execution failed",
      updatedAt: nowIso(),
      approvedAt: now,
      executedAt: nowIso(),
    };
    upsertExecution(failed, root, workspaceId);
    return { ok: true, record: failed };
  }
}

export function listExecutionHistory(options?: {
  repoRoot?: string;
  employeeId?: string;
  limit?: number;
  workspaceId?: string;
}): ExecutionRecord[] {
  const root = options?.repoRoot ?? process.cwd();
  const workspaceId = options?.workspaceId ?? "default";
  const rows = options?.employeeId
    ? listExecutionsForEmployee(options.employeeId, root, workspaceId)
    : listExecutions(root, workspaceId);
  return rows.slice(0, options?.limit ?? 40);
}

export function listPendingExecutions(
  repoRoot = process.cwd(),
  workspaceId = "default"
): ExecutionRecord[] {
  return listExecutions(repoRoot, workspaceId).filter((e) => e.status === "awaiting_approval");
}

/**
 * Best-effort prepare for employees mapped to external systems.
 * Used after mission assign / recommendation approve. Never auto-writes.
 */
export async function prepareExternalWorkForEmployee(input: {
  employeeId: string;
  missionId?: string | null;
  requestedAction: string;
  params?: Record<string, unknown>;
  repoRoot?: string;
  connectorMode?: ConnectorMode;
  connectors?: ConnectorSuite;
  workspaceId?: string;
}): Promise<
  | { ok: true; record: ExecutionRecord | null; skipped: boolean }
  | { ok: false; code: string; message: string; status: number }
> {
  const action = defaultWriteActionForEmployee(input.employeeId);
  if (!action) {
    return { ok: true, record: null, skipped: true };
  }
  const result = await prepareExecution({
    employeeId: input.employeeId,
    missionId: input.missionId ?? null,
    action,
    requestedAction: input.requestedAction,
    params: input.params,
    repoRoot: input.repoRoot,
    connectorMode: input.connectorMode,
    connectors: input.connectors,
    workspaceId: input.workspaceId,
  });
  if (!result.ok) return result;
  return { ok: true, record: result.record, skipped: false };
}
