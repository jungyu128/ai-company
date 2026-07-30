import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  decideExecution,
  listExecutionHistory,
  listPendingExecutions,
  prepareExecution,
} from "@/services/builder/execution/execution.service";
import type { ExecutionActionKind } from "@/services/builder/execution/types";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
  recordWorkspaceEvent,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import {
  publicApiError,
  sanitizeConnectorErrorMessage,
} from "@/services/builder/hardening/redaction";
import type { ExecutionRecord } from "@/services/builder/execution/types";

export const runtime = "nodejs";

function publicExecution(record: ExecutionRecord): ExecutionRecord {
  return {
    ...record,
    errorDetails: record.errorDetails
      ? sanitizeConnectorErrorMessage(record.errorDetails)
      : null,
    verificationResult: record.verificationResult
      ? sanitizeConnectorErrorMessage(record.verificationResult)
      : null,
  };
}

/**
 * GET /api/builder/hq/executions — pending + recent execution history.
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "execution.view",
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  return NextResponse.json({
    ok: true,
    pending: listPendingExecutions(process.cwd(), access.ctx.workspaceId).map(
      publicExecution
    ),
    history: listExecutionHistory({
      limit: 40,
      workspaceId: access.ctx.workspaceId,
    }).map(publicExecution),
  });
}

/**
 * POST /api/builder/hq/executions
 * - prepare: { mode: "prepare", employeeId, action, requestedAction, missionId?, params? }
 * - decide:  { mode: "decide", executionId, decision: approve|reject, note? }
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID", error: "Expected JSON body" },
      { status: 400 }
    );
  }

  const mode =
    body && typeof body === "object" && "mode" in body
      ? (body as { mode: unknown }).mode
      : "decide";

  if (mode === "prepare") {
    const access = ensureHqAccess({
      auth,
      workspaceId,
      permission: "execution.view",
    });
    if (!access.ok) {
      logOpsEvent({
        outcome: "denied",
        workspaceId,
        action: "execution.prepare",
        code: access.code,
      });
      return NextResponse.json(
        { ok: false, ...publicApiError(access.code, access.message) },
        { status: access.status }
      );
    }
    const employeeId =
      body && typeof body === "object" && "employeeId" in body
        ? (body as { employeeId: unknown }).employeeId
        : undefined;
    const action =
      body && typeof body === "object" && "action" in body
        ? (body as { action: unknown }).action
        : undefined;
    const requestedAction =
      body && typeof body === "object" && "requestedAction" in body
        ? (body as { requestedAction: unknown }).requestedAction
        : undefined;
    const missionId =
      body && typeof body === "object" && "missionId" in body
        ? (body as { missionId: unknown }).missionId
        : undefined;
    const params =
      body && typeof body === "object" && "params" in body
        ? (body as { params: unknown }).params
        : undefined;

    if (typeof employeeId !== "string" || typeof action !== "string") {
      return NextResponse.json(
        { ok: false, code: "INVALID", error: "employeeId and action are required" },
        { status: 400 }
      );
    }

    const started = Date.now();
    const result = await prepareExecution({
      employeeId,
      action: action as ExecutionActionKind,
      requestedAction:
        typeof requestedAction === "string" ? requestedAction : `Prepare ${action}`,
      missionId: typeof missionId === "string" ? missionId : null,
      params:
        params && typeof params === "object" ? (params as Record<string, unknown>) : {},
      workspaceId: access.ctx.workspaceId,
    });

    if (!result.ok) {
      logOpsEvent({
        outcome: "error",
        workspaceId: access.ctx.workspaceId,
        action: "execution.prepare",
        code: result.code,
        durationMs: Date.now() - started,
      });
      return NextResponse.json(
        { ok: false, ...publicApiError(result.code, result.message) },
        { status: result.status }
      );
    }
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: "execution.prepare",
      connector: result.record.system,
      executionStatus: result.record.status,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, execution: publicExecution(result.record) });
  }

  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "execution.decide",
  });
  if (!access.ok) {
    logOpsEvent({
      outcome: "denied",
      workspaceId,
      action: "execution.decide",
      code: access.code,
    });
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  const executionId =
    body && typeof body === "object" && "executionId" in body
      ? (body as { executionId: unknown }).executionId
      : undefined;
  const decision =
    body && typeof body === "object" && "decision" in body
      ? (body as { decision: unknown }).decision
      : undefined;
  const note =
    body && typeof body === "object" && "note" in body
      ? (body as { note: unknown }).note
      : undefined;

  if (typeof executionId !== "string" || !executionId.trim()) {
    return NextResponse.json(
      { ok: false, code: "INVALID", error: "executionId must be a string" },
      { status: 400 }
    );
  }
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json(
      { ok: false, code: "INVALID", error: "decision must be approve | reject" },
      { status: 400 }
    );
  }

  const started = Date.now();
  const result = await decideExecution({
    executionId: executionId.trim(),
    decision,
    note: typeof note === "string" ? note : null,
    workspaceId: access.ctx.workspaceId,
  });

  if (!result.ok) {
    logOpsEvent({
      outcome: "error",
      workspaceId: access.ctx.workspaceId,
      action: `execution.${decision}`,
      code: result.code,
      durationMs: Date.now() - started,
    });
    return NextResponse.json(
      { ok: false, ...publicApiError(result.code, result.message) },
      { status: result.status }
    );
  }

  recordWorkspaceEvent({
    workspaceId: access.ctx.workspaceId,
    kind: decision === "approve" ? "execution" : "failure",
    summary: `${access.ctx.displayName} ${decision}d external execution`,
    actorUserId: access.ctx.userId,
    actorName: access.ctx.displayName,
    actorRole: access.ctx.role,
    relatedType: "execution",
    relatedId: result.record.id,
    status: result.record.status,
    auditAction: `execution.${decision}`,
    notify:
      result.record.status === "failed"
        ? {
            kind: "failed_execution",
            title: "Execution failed",
            body: sanitizeConnectorErrorMessage(
              result.record.errorDetails ?? result.record.requestedAction
            ),
          }
        : undefined,
  });

  logOpsEvent({
    outcome:
      result.record.status === "failed" || result.record.status === "stale"
        ? "error"
        : "ok",
    workspaceId: access.ctx.workspaceId,
    action: `execution.${decision}`,
    connector: result.record.system,
    executionStatus: result.record.status,
    durationMs: Date.now() - started,
    verificationResult:
      result.record.status === "succeeded"
        ? "passed"
        : result.record.status === "failed"
          ? "failed"
          : "skipped",
  });

  return NextResponse.json({ ok: true, execution: publicExecution(result.record) });
}
