import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import {
  getHqChatThreadView,
  listProactiveChatTargets,
  sendHqChatMessage,
} from "@/services/builder/hq-chat.service";
import { getEmployeeDefinition } from "@/services/builder/ai-company-employees";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import { chunkReplyForStream } from "@/services/builder/hq-chat.logic";
import { refreshAutonomousCompany } from "@/services/builder/autonomous-company";
import {
  ensureContinuousOsHeartbeat,
  runContinuousOsTick,
} from "@/services/builder/continuous-os";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/chat?employeeId=…
 * GET /api/builder/hq/chat?proactive=1 — employees with unread proactive openers
 */
export async function GET(request: Request) {
  const started = Date.now();
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "timeline.view",
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("proactive") === "1") {
    // Refresh WorkPilot repo monitor, then surface proactive desk openers.
    await refreshAutonomousCompany({
      workspaceId: access.ctx.workspaceId,
      deliverToChat: true,
    }).catch(() => null);
    // Continuous OS tick (throttled) — company keeps working between CEO visits
    ensureContinuousOsHeartbeat({ workspaceId: access.ctx.workspaceId });
    runContinuousOsTick({
      workspaceId: access.ctx.workspaceId,
      runAutonomy: false,
      deliverToChat: false,
    });
    const targets = listProactiveChatTargets({
      workspaceId: access.ctx.workspaceId,
    });
    return NextResponse.json({ ok: true, employeeIds: targets });
  }

  const employeeId = url.searchParams.get("employeeId")?.trim() ?? "";
  if (!employeeId || !getEmployeeDefinition(employeeId)) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "employeeId is required") },
      { status: 400 }
    );
  }

  const markRead = url.searchParams.get("markRead") !== "0";
  const view = getHqChatThreadView({
    employeeId,
    workspaceId: access.ctx.workspaceId,
    markRead,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "chat.get",
    durationMs: Date.now() - started,
  });

  return NextResponse.json({ ok: true, ...view });
}

/**
 * POST /api/builder/hq/chat
 * Body: { employeeId, message, clientRequestId?, stream? }
 * When stream:true → text/event-stream token chunks.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "comments.write",
  });
  if (!access.ok) {
    logOpsEvent({
      outcome: "denied",
      workspaceId,
      action: "chat.send",
      code: access.code,
      durationMs: Date.now() - started,
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
      { ok: false, ...publicApiError("INVALID", "Expected JSON body") },
      { status: 400 }
    );
  }

  const employeeId =
    body && typeof body === "object" && "employeeId" in body
      ? (body as { employeeId: unknown }).employeeId
      : undefined;
  const message =
    body && typeof body === "object" && "message" in body
      ? (body as { message: unknown }).message
      : undefined;
  const clientRequestId =
    body && typeof body === "object" && "clientRequestId" in body
      ? (body as { clientRequestId: unknown }).clientRequestId
      : undefined;
  const stream =
    body && typeof body === "object" && "stream" in body
      ? Boolean((body as { stream: unknown }).stream)
      : true;

  if (typeof employeeId !== "string" || !employeeId.trim()) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "employeeId must be a string") },
      { status: 400 }
    );
  }
  if (typeof message !== "string") {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "message must be a string") },
      { status: 400 }
    );
  }

  const result = sendHqChatMessage({
    employeeId: employeeId.trim(),
    message,
    clientRequestId:
      typeof clientRequestId === "string" ? clientRequestId : null,
    workspaceId: access.ctx.workspaceId,
  });

  if (!result.ok) {
    logOpsEvent({
      outcome: "error",
      workspaceId: access.ctx.workspaceId,
      action: "chat.send",
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
    action: "chat.send",
    durationMs: Date.now() - started,
  });

  if (!stream) {
    return NextResponse.json({
      ok: true,
      ceoMessage: result.ceoMessage,
      employeeMessage: result.employeeMessage,
      quickActions: result.quickActions,
      relatedRecommendationId: result.relatedRecommendationId,
      replayed: result.replayed,
    });
  }

  const encoder = new TextEncoder();
  const chunks = result.chunks.length
    ? result.chunks
    : chunkReplyForStream(result.employeeMessage.body);

  const readable = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };
      send({ type: "ceo", message: result.ceoMessage });
      send({
        type: "employee_start",
        message: {
          ...result.employeeMessage,
          body: "",
        },
      });
      for (const token of chunks) {
        send({ type: "token", text: token });
        await new Promise((r) => setTimeout(r, 12));
      }
      send({
        type: "done",
        message: result.employeeMessage,
        quickActions: result.quickActions,
        relatedRecommendationId: result.relatedRecommendationId,
        replayed: result.replayed,
      });
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
