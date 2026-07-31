import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import {
  applyCeoOsAction,
  ensureContinuousOsHeartbeat,
  ensureEmployeeRoster,
  getContinuousOsSnapshot,
  runContinuousOsTick,
  type CeoOsAction,
} from "@/services/builder/continuous-os";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/continuous-os — live employee work states + recent decisions.
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

  ensureContinuousOsHeartbeat({ workspaceId: access.ctx.workspaceId });
  ensureEmployeeRoster({ workspaceId: access.ctx.workspaceId });
  const snapshot = getContinuousOsSnapshot({
    workspaceId: access.ctx.workspaceId,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "continuous_os.get",
    durationMs: Date.now() - started,
  });

  return NextResponse.json({ ok: true, ...snapshot });
}

/**
 * POST /api/builder/hq/continuous-os
 * body: { action: "tick" | "interrupt" | "reprioritize" | "approve" | "resume", ... }
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
      action: "continuous_os",
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
      ? String((body as { action: unknown }).action)
      : "";

  ensureContinuousOsHeartbeat({ workspaceId: access.ctx.workspaceId });

  if (action === "tick") {
    const force =
      typeof body === "object" &&
      body !== null &&
      (body as { force?: unknown }).force === true;
    const result = runContinuousOsTick({
      workspaceId: access.ctx.workspaceId,
      force: force === true,
      deliverToChat: true,
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: "continuous_os.tick",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, result });
  }

  if (
    action === "interrupt" ||
    action === "reprioritize" ||
    action === "approve" ||
    action === "resume"
  ) {
    const ceoAction = parseCeoAction(action, body);
    if (!ceoAction) {
      return NextResponse.json(
        { ok: false, ...publicApiError("INVALID", "Missing required fields") },
        { status: 400 }
      );
    }
    const result = applyCeoOsAction({
      action: ceoAction,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
      workspaceId: access.ctx.workspaceId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, ...publicApiError(result.code, result.message) },
        { status: result.status }
      );
    }
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: `continuous_os.${action}`,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      decision: result.decision,
      snapshot: result.snapshot,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      ...publicApiError(
        "INVALID",
        "action must be tick | interrupt | reprioritize | approve | resume"
      ),
    },
    { status: 400 }
  );
}

function parseCeoAction(action: string, body: unknown): CeoOsAction | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (action === "interrupt") {
    if (typeof o.employeeId !== "string" || !o.employeeId.trim()) return null;
    return {
      action: "interrupt",
      employeeId: o.employeeId.trim(),
      note: typeof o.note === "string" ? o.note : null,
    };
  }
  if (action === "resume") {
    if (typeof o.employeeId !== "string" || !o.employeeId.trim()) return null;
    return {
      action: "resume",
      employeeId: o.employeeId.trim(),
      note: typeof o.note === "string" ? o.note : null,
    };
  }
  if (action === "reprioritize") {
    if (typeof o.employeeId !== "string" || !o.employeeId.trim()) return null;
    const priority = Number(o.priority);
    if (!Number.isFinite(priority)) return null;
    return {
      action: "reprioritize",
      employeeId: o.employeeId.trim(),
      priority,
      taskId: typeof o.taskId === "string" ? o.taskId : null,
      note: typeof o.note === "string" ? o.note : null,
    };
  }
  if (action === "approve") {
    if (typeof o.taskId !== "string" || !o.taskId.trim()) return null;
    return {
      action: "approve",
      taskId: o.taskId.trim(),
      note: typeof o.note === "string" ? o.note : null,
    };
  }
  return null;
}
