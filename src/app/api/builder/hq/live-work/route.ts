import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import {
  getLiveWorkTrackerSnapshot,
  syncLiveWorkTracker,
} from "@/services/builder/live-work-tracker/server";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/live-work
 * Real-time Live Work Tracker snapshot for every employee.
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
  const sync = url.searchParams.get("sync") !== "0";
  const snapshot = getLiveWorkTrackerSnapshot({
    workspaceId: access.ctx.workspaceId,
    sync,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "live_work.get",
    durationMs: Date.now() - started,
  });

  return NextResponse.json({ ok: true, liveWork: snapshot });
}

/**
 * POST /api/builder/hq/live-work  { action: "sync" }
 * Force a Live Work Tracker sync (timeline on changes).
 */
export async function POST(request: Request) {
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

  let body: { action?: string } = {};
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    body = {};
  }

  if (body.action && body.action !== "sync") {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "action must be sync") },
      { status: 400 }
    );
  }

  const snapshot = syncLiveWorkTracker({
    workspaceId: access.ctx.workspaceId,
    recordTimeline: true,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "live_work.sync",
    durationMs: Date.now() - started,
  });

  return NextResponse.json({ ok: true, liveWork: snapshot });
}
