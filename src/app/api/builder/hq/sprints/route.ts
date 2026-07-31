import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import {
  applyCeoSprintAction,
  createCompanySprint,
  getCompanySprint,
  getSprintSnapshot,
  listCompanySprints,
  type CeoSprintAction,
} from "@/services/builder/sprints";

export const runtime = "nodejs";

const CEO_ACTIONS = new Set<CeoSprintAction>([
  "start",
  "pause",
  "reprioritize",
  "close",
  "archive",
]);

/**
 * GET /api/builder/hq/sprints
 * GET /api/builder/hq/sprints?id=…
 * GET /api/builder/hq/sprints?snapshot=1
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
  const id = url.searchParams.get("id")?.trim();
  if (id) {
    const sprint = getCompanySprint({
      sprintId: id,
      workspaceId: access.ctx.workspaceId,
    });
    if (!sprint) {
      return NextResponse.json(
        { ok: false, ...publicApiError("NOT_FOUND", "Sprint not found") },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, sprint });
  }

  if (url.searchParams.get("snapshot") === "1") {
    const snapshot = getSprintSnapshot({
      workspaceId: access.ctx.workspaceId,
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: "sprints.snapshot",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, ...snapshot });
  }

  const sprints = listCompanySprints({
    workspaceId: access.ctx.workspaceId,
  });
  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "sprints.list",
    durationMs: Date.now() - started,
  });
  return NextResponse.json({ ok: true, sprints });
}

/**
 * POST /api/builder/hq/sprints
 * { action: "create", name, goal, workItemIds?, startImmediately? }
 * { action: "start"|"pause"|"reprioritize"|"close"|"archive", sprintId, note?, priorityOrder? }
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
      action: "sprints",
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

  if (action === "create") {
    const o = body as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name : "";
    const goal = typeof o.goal === "string" ? o.goal : "";
    if (!name.trim() || !goal.trim()) {
      return NextResponse.json(
        { ok: false, ...publicApiError("INVALID", "name and goal required") },
        { status: 400 }
      );
    }
    const workItemIds = Array.isArray(o.workItemIds)
      ? o.workItemIds.filter((x): x is string => typeof x === "string")
      : [];
    const result = createCompanySprint({
      name,
      goal,
      workItemIds,
      startImmediately: o.startImmediately === true,
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
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
      action: "sprints.create",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      sprint: result.sprint,
      metrics: result.metrics,
    });
  }

  if (CEO_ACTIONS.has(action as CeoSprintAction)) {
    const o = body as Record<string, unknown>;
    const sprintId =
      typeof o.sprintId === "string" ? o.sprintId.trim() : "";
    if (!sprintId) {
      return NextResponse.json(
        { ok: false, ...publicApiError("INVALID", "sprintId required") },
        { status: 400 }
      );
    }
    const priorityOrder = Array.isArray(o.priorityOrder)
      ? o.priorityOrder.filter((x): x is string => typeof x === "string")
      : null;
    const result = applyCeoSprintAction({
      sprintId,
      action: action as CeoSprintAction,
      note: typeof o.note === "string" ? o.note : null,
      priorityOrder,
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
      action: `sprints.${action}`,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      sprint: result.sprint,
      metrics: result.metrics,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      ...publicApiError(
        "INVALID",
        "action must be create | start | pause | reprioritize | close | archive"
      ),
    },
    { status: 400 }
  );
}
