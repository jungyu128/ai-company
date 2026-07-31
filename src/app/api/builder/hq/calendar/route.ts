import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import {
  applyCeoCalendarAction,
  createCalendarEvent,
  getCalendarSnapshot,
  getCompanyCalendarEvent,
  listCompanyCalendarEvents,
  runCalendarMaintenance,
  type CalendarEventKind,
  type CeoCalendarAction,
} from "@/services/builder/calendar";

export const runtime = "nodejs";

const KINDS = new Set<CalendarEventKind>([
  "meeting",
  "review",
  "deadline",
  "release",
  "milestone",
  "work_block",
]);

const CEO_ACTIONS = new Set<CeoCalendarAction>([
  "approve",
  "reject",
  "edit",
  "cancel",
  "reschedule",
]);

/**
 * GET /api/builder/hq/calendar
 * GET /api/builder/hq/calendar?id=…
 * GET /api/builder/hq/calendar?snapshot=1
 * GET /api/builder/hq/calendar?from=&to=
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
    const event = getCompanyCalendarEvent({
      eventId: id,
      workspaceId: access.ctx.workspaceId,
    });
    if (!event) {
      return NextResponse.json(
        { ok: false, ...publicApiError("NOT_FOUND", "Calendar event not found") },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, event });
  }

  if (url.searchParams.get("snapshot") === "1") {
    const snapshot = getCalendarSnapshot({
      workspaceId: access.ctx.workspaceId,
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: "calendar.snapshot",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, ...snapshot });
  }

  const events = listCompanyCalendarEvents({
    workspaceId: access.ctx.workspaceId,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "calendar.list",
    durationMs: Date.now() - started,
  });
  return NextResponse.json({ ok: true, events });
}

/**
 * POST /api/builder/hq/calendar
 * { action: "create", kind, title, startAt, endAt, ... }
 * { action: "auto_reserve" }
 * { action: "approve"|"reject"|"edit"|"cancel"|"reschedule", eventId, ... }
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
      action: "calendar",
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

  if (action === "auto_reserve") {
    const result = runCalendarMaintenance({
      workspaceId: access.ctx.workspaceId,
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: "calendar.auto_reserve",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "create") {
    const o = body as Record<string, unknown>;
    const kind = typeof o.kind === "string" ? o.kind : "";
    if (!KINDS.has(kind as CalendarEventKind)) {
      return NextResponse.json(
        {
          ok: false,
          ...publicApiError(
            "INVALID",
            "kind must be meeting|review|deadline|release|milestone|work_block"
          ),
        },
        { status: 400 }
      );
    }
    const title = typeof o.title === "string" ? o.title : "";
    const startAt = typeof o.startAt === "string" ? o.startAt : "";
    const endAt = typeof o.endAt === "string" ? o.endAt : "";
    const attendeeIds = Array.isArray(o.attendeeIds)
      ? o.attendeeIds.filter((x): x is string => typeof x === "string")
      : [];
    const result = createCalendarEvent({
      kind: kind as CalendarEventKind,
      title,
      description: typeof o.description === "string" ? o.description : null,
      startAt,
      endAt,
      attendeeIds,
      workItemId: typeof o.workItemId === "string" ? o.workItemId : null,
      workItemTitle:
        typeof o.workItemTitle === "string" ? o.workItemTitle : null,
      meetingId: typeof o.meetingId === "string" ? o.meetingId : null,
      missionId: typeof o.missionId === "string" ? o.missionId : null,
      sprintId: typeof o.sprintId === "string" ? o.sprintId : null,
      workspaceId: access.ctx.workspaceId,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
      createdBy: "ceo",
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
      action: "calendar.create",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      event: result.event,
      conflicts: result.conflicts,
    });
  }

  if (CEO_ACTIONS.has(action as CeoCalendarAction)) {
    const o = body as Record<string, unknown>;
    const eventId =
      typeof o.eventId === "string" ? o.eventId.trim() : "";
    if (!eventId) {
      return NextResponse.json(
        { ok: false, ...publicApiError("INVALID", "eventId required") },
        { status: 400 }
      );
    }
    const attendeeIds = Array.isArray(o.attendeeIds)
      ? o.attendeeIds.filter((x): x is string => typeof x === "string")
      : null;
    const result = applyCeoCalendarAction({
      eventId,
      action: action as CeoCalendarAction,
      note: typeof o.note === "string" ? o.note : null,
      startAt: typeof o.startAt === "string" ? o.startAt : null,
      endAt: typeof o.endAt === "string" ? o.endAt : null,
      title: typeof o.title === "string" ? o.title : null,
      description: typeof o.description === "string" ? o.description : null,
      attendeeIds,
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
      action: `calendar.${action}`,
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      event: result.event,
      conflicts: result.conflicts,
    });
  }

  return NextResponse.json(
    {
      ok: false,
      ...publicApiError(
        "INVALID",
        "action must be create | auto_reserve | approve | reject | edit | cancel | reschedule"
      ),
    },
    { status: 400 }
  );
}
