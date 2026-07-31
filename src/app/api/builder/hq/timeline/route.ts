import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import { getCompanyTimeline } from "@/services/builder/company-timeline";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/timeline
 * Persisted Company Activity Timeline (chronological lifecycle events).
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
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 80;

  const timeline = getCompanyTimeline({
    workspaceId: access.ctx.workspaceId,
    limit: Number.isFinite(limit) ? limit : 80,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "company_timeline.get",
    durationMs: Date.now() - started,
  });

  return NextResponse.json({ ok: true, timeline });
}
