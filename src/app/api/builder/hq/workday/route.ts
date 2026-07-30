import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  completeAutonomousWorkday,
  getAutonomousWorkday,
  refreshAutonomousWorkday,
  startAutonomousWorkday,
} from "@/services/builder/workday/workday.service";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
  recordWorkspaceEvent,
} from "@/services/builder/workspace/workspace.service";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/workday — today's autonomous workday (if started).
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({ auth, workspaceId });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, code: access.code, error: access.message },
      { status: access.status }
    );
  }

  return NextResponse.json({
    ok: true,
    workday: getAutonomousWorkday({ workspaceId: access.ctx.workspaceId }),
  });
}

/**
 * POST /api/builder/hq/workday
 * body: { action: "start" | "refresh" | "complete" }
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

  const action =
    body && typeof body === "object" && "action" in body
      ? (body as { action: unknown }).action
      : "start";

  if (action === "start") {
    const access = ensureHqAccess({
      auth,
      workspaceId,
      permission: "workday.start",
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, error: access.message },
        { status: access.status }
      );
    }
    const result = await startAutonomousWorkday({
      workspaceId: access.ctx.workspaceId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    recordWorkspaceEvent({
      workspaceId: access.ctx.workspaceId,
      kind: "workday",
      summary: `${access.ctx.displayName} ${result.resumed ? "resumed" : "started"} the workday`,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
      actorRole: access.ctx.role,
      relatedType: "workday",
      relatedId: result.workday.id,
      status: result.workday.status,
      auditAction: result.resumed ? "workday.resume" : "workday.start",
    });
    return NextResponse.json({
      ok: true,
      workday: result.workday,
      resumed: result.resumed,
    });
  }

  if (action === "refresh") {
    const access = ensureHqAccess({ auth, workspaceId });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, error: access.message },
        { status: access.status }
      );
    }
    const result = refreshAutonomousWorkday({
      workspaceId: access.ctx.workspaceId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, workday: result.workday });
  }

  if (action === "complete") {
    const access = ensureHqAccess({
      auth,
      workspaceId,
      permission: "workday.complete",
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, error: access.message },
        { status: access.status }
      );
    }
    const result = completeAutonomousWorkday({
      workspaceId: access.ctx.workspaceId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    recordWorkspaceEvent({
      workspaceId: access.ctx.workspaceId,
      kind: "workday",
      summary: `${access.ctx.displayName} completed the workday`,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
      actorRole: access.ctx.role,
      relatedType: "workday",
      relatedId: result.workday.id,
      status: result.workday.status,
      auditAction: "workday.complete",
      notify: {
        kind: "completed_workday",
        title: "Workday completed",
        body: result.workday.endOfDayReport?.summary ?? "End of day report ready",
      },
    });
    return NextResponse.json({ ok: true, workday: result.workday });
  }

  return NextResponse.json(
    { ok: false, code: "INVALID", error: "action must be start | refresh | complete" },
    { status: 400 }
  );
}
