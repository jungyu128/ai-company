import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import { runAutonomyAction } from "@/services/builder/os.service";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";

export const runtime = "nodejs";

/**
 * POST /api/builder/hq/autonomy — employee autonomy actions (delegate | split).
 */
export async function POST(request: Request) {
  const started = Date.now();
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "mission.assign",
  });
  if (!access.ok) {
    logOpsEvent({
      outcome: "denied",
      workspaceId,
      action: "autonomy",
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

  const action =
    body && typeof body === "object" && "action" in body
      ? (body as { action: unknown }).action
      : undefined;
  const missionId =
    body && typeof body === "object" && "missionId" in body
      ? (body as { missionId: unknown }).missionId
      : undefined;
  const toEmployeeId =
    body && typeof body === "object" && "toEmployeeId" in body
      ? (body as { toEmployeeId: unknown }).toEmployeeId
      : undefined;

  if (action !== "delegate" && action !== "split") {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "action must be delegate | split") },
      { status: 400 }
    );
  }
  if (typeof missionId !== "string" || !missionId.trim()) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "missionId must be a string") },
      { status: 400 }
    );
  }

  const result = runAutonomyAction({
    action,
    missionId: missionId.trim(),
    toEmployeeId: typeof toEmployeeId === "string" ? toEmployeeId : null,
    workspaceId: access.ctx.workspaceId,
  });

  if (!result.ok) {
    logOpsEvent({
      outcome: "error",
      workspaceId: access.ctx.workspaceId,
      action: `autonomy.${action}`,
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
    action: `autonomy.${action}`,
    durationMs: Date.now() - started,
  });
  return NextResponse.json({ ok: true, events: result.events });
}
