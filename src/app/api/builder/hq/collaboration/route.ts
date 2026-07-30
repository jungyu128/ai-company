import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import {
  addMissionComment,
  listActivity,
  listMissionComments,
  listNotifications,
  markNotificationRead,
  recordWorkspaceEvent,
} from "@/services/builder/workspace/collaboration-feed";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/collaboration — timeline, notifications, comments.
 * query: missionId? for comments
 */
export async function GET(request: Request) {
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
      { ok: false, code: access.code, error: access.message },
      { status: access.status }
    );
  }

  const url = new URL(request.url);
  const missionId = url.searchParams.get("missionId");

  return NextResponse.json({
    ok: true,
    activity: listActivity(access.ctx.workspaceId),
    notifications: listNotifications(access.ctx.workspaceId, {
      userId: access.ctx.userId,
    }),
    comments: missionId
      ? listMissionComments(access.ctx.workspaceId, missionId)
      : [],
  });
}

/**
 * POST /api/builder/hq/collaboration
 * { action: "comment", missionId, body }
 * { action: "read_notification", notificationId }
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
      : undefined;

  if (action === "comment") {
    const access = ensureHqAccess({
      auth,
      workspaceId,
      permission: "comments.write",
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, error: access.message },
        { status: access.status }
      );
    }
    const missionId =
      body && typeof body === "object" && "missionId" in body
        ? String((body as { missionId: unknown }).missionId ?? "")
        : "";
    const text =
      body && typeof body === "object" && "body" in body
        ? String((body as { body: unknown }).body ?? "")
        : "";
    if (!missionId.trim() || !text.trim()) {
      return NextResponse.json(
        { ok: false, code: "INVALID", error: "missionId and body required" },
        { status: 400 }
      );
    }
    const comment = addMissionComment({
      workspaceId: access.ctx.workspaceId,
      missionId: missionId.trim(),
      authorUserId: access.ctx.userId,
      authorName: access.ctx.displayName,
      body: text.trim().slice(0, 2000),
    });
    recordWorkspaceEvent({
      workspaceId: access.ctx.workspaceId,
      kind: "comment",
      summary: `${access.ctx.displayName} commented on mission`,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
      actorRole: access.ctx.role,
      relatedType: "mission",
      relatedId: missionId.trim(),
      status: "commented",
      auditAction: "comment.create",
      notify: {
        kind: "collaboration_request",
        title: "New mission comment",
        body: text.trim().slice(0, 120),
      },
    });
    return NextResponse.json({ ok: true, comment });
  }

  if (action === "read_notification") {
    const access = ensureHqAccess({
      auth,
      workspaceId,
      permission: "notifications.view",
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, error: access.message },
        { status: access.status }
      );
    }
    const notificationId =
      body && typeof body === "object" && "notificationId" in body
        ? String((body as { notificationId: unknown }).notificationId ?? "")
        : "";
    const updated = markNotificationRead(
      access.ctx.workspaceId,
      notificationId.trim()
    );
    if (!updated) {
      return NextResponse.json(
        { ok: false, code: "NOT_FOUND", error: "Notification not found" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, notification: updated });
  }

  return NextResponse.json(
    {
      ok: false,
      code: "INVALID",
      error: "action must be comment | read_notification",
    },
    { status: 400 }
  );
}
