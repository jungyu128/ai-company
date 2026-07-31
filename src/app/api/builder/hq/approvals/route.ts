import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import { decideApproval, listApprovalCenter } from "@/services/builder/approval.service";
import {
  decideCeoApprovalQueueItem,
  listCeoApprovalQueue,
} from "@/services/builder/ceo-approval-queue";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/approvals — unified CEO Approval Queue (+ legacy mission list).
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({ auth, workspaceId });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  const queue = listCeoApprovalQueue({
    workspaceId: access.ctx.workspaceId,
  });

  return NextResponse.json({
    ok: true,
    queue,
    approvals: listApprovalCenter(process.cwd(), access.ctx.workspaceId),
  });
}

/**
 * POST /api/builder/hq/approvals — approve | reject | request_changes.
 * Prefer queueItemId (unified queue). missionId remains for legacy mission-only clients.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "approvals.decide",
  });
  if (!access.ok) {
    logOpsEvent({
      outcome: "denied",
      workspaceId,
      action: "approval.decide",
      code: access.code,
    });
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID", error: "Expected JSON body" },
      { status: 400 }
    );
  }

  const queueItemId =
    body && typeof body === "object" && "queueItemId" in body
      ? (body as { queueItemId: unknown }).queueItemId
      : undefined;
  const missionId =
    body && typeof body === "object" && "missionId" in body
      ? (body as { missionId: unknown }).missionId
      : undefined;
  const decision =
    body && typeof body === "object" && "decision" in body
      ? (body as { decision: unknown }).decision
      : undefined;
  const note =
    body && typeof body === "object" && "note" in body
      ? (body as { note: unknown }).note
      : undefined;

  if (
    decision !== "approve" &&
    decision !== "reject" &&
    decision !== "request_changes"
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID",
        error: "decision must be approve | reject | request_changes",
      },
      { status: 400 }
    );
  }

  const started = Date.now();

  if (typeof queueItemId === "string" && queueItemId.trim()) {
    const result = await decideCeoApprovalQueueItem({
      id: queueItemId.trim(),
      decision,
      note: typeof note === "string" ? note : null,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
      actorIsCeo: access.ctx.role === "owner",
      workspaceId: access.ctx.workspaceId,
    });

    if (!result.ok) {
      logOpsEvent({
        outcome: "error",
        workspaceId: access.ctx.workspaceId,
        action: `approval_queue.${decision}`,
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
      action: `approval_queue.${decision}`,
      durationMs: Date.now() - started,
    });

    return NextResponse.json({
      ok: true,
      queue: result.queue,
      message: result.message,
    });
  }

  if (typeof missionId !== "string" || !missionId.trim()) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID",
        error: "queueItemId or missionId must be a string",
      },
      { status: 400 }
    );
  }

  const result = await decideApproval({
    missionId: missionId.trim(),
    decision,
    note: typeof note === "string" ? note : null,
    workspaceId: access.ctx.workspaceId,
    actor: {
      userId: access.ctx.userId,
      displayName: access.ctx.displayName,
      role: access.ctx.role,
    },
  });

  if (!result.ok) {
    logOpsEvent({
      outcome: "error",
      workspaceId: access.ctx.workspaceId,
      action: `approval.${decision}`,
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
    action: `approval.${decision}`,
    durationMs: Date.now() - started,
  });

  return NextResponse.json({
    ok: true,
    approval: result.item,
    execution: result.execution,
    queue: listCeoApprovalQueue({ workspaceId: access.ctx.workspaceId }),
  });
}
