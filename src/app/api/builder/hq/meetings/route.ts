import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import {
  applyCeoMeetingAction,
  autoCreateNeededMeetings,
  createCompanyMeeting,
  getCompanyMeeting,
  listCompanyMeetings,
  type CeoMeetingAction,
  type MeetingKind,
} from "@/services/builder/meetings";

export const runtime = "nodejs";

const KINDS = new Set<MeetingKind>([
  "sprint_planning",
  "daily_standup",
  "architecture_review",
  "design_review",
  "qa_review",
  "release_review",
  "incident_review",
]);

const CEO_ACTIONS = new Set<CeoMeetingAction>([
  "join",
  "comment",
  "approve",
  "postpone",
  "reject",
]);

/**
 * GET /api/builder/hq/meetings
 * GET /api/builder/hq/meetings?id=…
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
    const meeting = getCompanyMeeting({
      meetingId: id,
      workspaceId: access.ctx.workspaceId,
    });
    if (!meeting) {
      return NextResponse.json(
        { ok: false, ...publicApiError("NOT_FOUND", "Meeting not found") },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, meeting });
  }

  const meetings = listCompanyMeetings({
    workspaceId: access.ctx.workspaceId,
  });
  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "meetings.list",
    durationMs: Date.now() - started,
  });
  return NextResponse.json({ ok: true, meetings });
}

/**
 * POST /api/builder/hq/meetings
 * body:
 *  { action: "create", kind, ... }
 *  { action: "auto_create" }
 *  { action: "join"|"comment"|"approve"|"postpone"|"reject", meetingId, note? }
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
      action: "meetings",
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

  if (action === "auto_create") {
    const created = autoCreateNeededMeetings({
      workspaceId: access.ctx.workspaceId,
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: "meetings.auto_create",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, meetings: created });
  }

  if (action === "create") {
    const kind =
      body && typeof body === "object" && "kind" in body
        ? String((body as { kind: unknown }).kind)
        : "";
    if (!KINDS.has(kind as MeetingKind)) {
      return NextResponse.json(
        { ok: false, ...publicApiError("INVALID", "Invalid meeting kind") },
        { status: 400 }
      );
    }
    const o = body as Record<string, unknown>;
    const result = createCompanyMeeting({
      kind: kind as MeetingKind,
      workItemId: typeof o.workItemId === "string" ? o.workItemId : null,
      workItemTitle:
        typeof o.workItemTitle === "string" ? o.workItemTitle : null,
      missionId: typeof o.missionId === "string" ? o.missionId : null,
      purpose: typeof o.purpose === "string" ? o.purpose : null,
      organizerEmployeeId:
        typeof o.organizerEmployeeId === "string"
          ? o.organizerEmployeeId
          : null,
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
      action: "meetings.create",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, meeting: result.meeting });
  }

  if (CEO_ACTIONS.has(action as CeoMeetingAction)) {
    const o = body as Record<string, unknown>;
    const meetingId =
      typeof o.meetingId === "string" ? o.meetingId.trim() : "";
    if (!meetingId) {
      return NextResponse.json(
        { ok: false, ...publicApiError("INVALID", "meetingId required") },
        { status: 400 }
      );
    }
    const result = applyCeoMeetingAction({
      meetingId,
      action: action as CeoMeetingAction,
      note: typeof o.note === "string" ? o.note : null,
      postponeUntil:
        typeof o.postponeUntil === "string" ? o.postponeUntil : null,
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
      action: `meetings.ceo_${action}`,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, meeting: result.meeting });
  }

  return NextResponse.json(
    {
      ok: false,
      ...publicApiError(
        "INVALID",
        "action must be create | auto_create | join | comment | approve | postpone | reject"
      ),
    },
    { status: 400 }
  );
}
