import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  addOrUpdateMember,
  createWorkspace,
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import type { WorkspaceHumanRole } from "@/services/builder/workspace/types";
import { listWorkspaces, listWorkspacesForUser, listMembers } from "@/services/builder/workspace/workspace.store";
import { recordWorkspaceEvent } from "@/services/builder/workspace/collaboration-feed";
import { publicApiError } from "@/services/builder/hardening/redaction";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";

export const runtime = "nodejs";

const ROLES = new Set<WorkspaceHumanRole>([
  "owner",
  "admin",
  "manager",
  "member",
  "viewer",
]);

/**
 * GET /api/builder/hq/workspaces — list workspaces + active members.
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
    activeWorkspaceId: access.ctx.workspaceId,
    role: access.ctx.role,
    permissions: access.ctx.permissions,
    workspaces: listWorkspacesForUser(access.ctx.userId),
    members: listMembers(access.ctx.workspaceId),
  });
}

/**
 * POST /api/builder/hq/workspaces
 * { action: "create", name }
 * { action: "add_member", workspaceId, email, displayName, userId, role }
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

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

  if (action === "create") {
    const access = ensureHqAccess({
      auth,
      workspaceId: "default",
      permission: "members.manage",
    });
    if (!access.ok) {
      logOpsEvent({
        outcome: "denied",
        workspaceId: "default",
        action: "workspace.create",
        code: access.code,
      });
      return NextResponse.json(
        { ok: false, ...publicApiError(access.code, access.message) },
        { status: access.status }
      );
    }
    const name =
      body && typeof body === "object" && "name" in body
        ? String((body as { name: unknown }).name ?? "")
        : "";
    const workspace = createWorkspace({
      name,
      ownerUserId: auth.user.id,
      ownerEmail: auth.user.email,
      ownerDisplayName: auth.user.name?.trim() || auth.user.email,
    });
    recordWorkspaceEvent({
      workspaceId: workspace.id,
      kind: "member",
      summary: `Workspace “${workspace.name}” created`,
      actorUserId: auth.user.id,
      actorName: auth.user.name?.trim() || auth.user.email,
      actorRole: "owner",
      relatedType: "workspace",
      relatedId: workspace.id,
      status: "created",
      auditAction: "workspace.create",
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId: workspace.id,
      action: "workspace.create",
    });
    return NextResponse.json({ ok: true, workspace });
  }

  if (action === "add_member") {
    const workspaceId =
      body && typeof body === "object" && "workspaceId" in body
        ? String((body as { workspaceId: unknown }).workspaceId ?? "")
        : resolveWorkspaceIdFromRequest(request);
    const access = ensureHqAccess({
      auth,
      workspaceId,
      permission: "members.manage",
    });
    if (!access.ok) {
      return NextResponse.json(
        { ok: false, code: access.code, error: access.message },
        { status: access.status }
      );
    }
    const email =
      body && typeof body === "object" && "email" in body
        ? String((body as { email: unknown }).email ?? "")
        : "";
    const displayName =
      body && typeof body === "object" && "displayName" in body
        ? String((body as { displayName: unknown }).displayName ?? email)
        : email;
    const userId =
      body && typeof body === "object" && "userId" in body
        ? String((body as { userId: unknown }).userId ?? "")
        : `invite:${email.toLowerCase()}`;
    const roleRaw =
      body && typeof body === "object" && "role" in body
        ? String((body as { role: unknown }).role ?? "member")
        : "member";
    if (!email.trim() || !ROLES.has(roleRaw as WorkspaceHumanRole)) {
      return NextResponse.json(
        { ok: false, code: "INVALID", error: "email and valid role required" },
        { status: 400 }
      );
    }
    const member = addOrUpdateMember({
      workspaceId: access.ctx.workspaceId,
      userId,
      email: email.trim(),
      displayName: displayName.trim() || email.trim(),
      role: roleRaw as WorkspaceHumanRole,
    });
    recordWorkspaceEvent({
      workspaceId: access.ctx.workspaceId,
      kind: "member",
      summary: `${access.ctx.displayName} added ${member.displayName} as ${member.role}`,
      actorUserId: access.ctx.userId,
      actorName: access.ctx.displayName,
      actorRole: access.ctx.role,
      relatedType: "member",
      relatedId: member.id,
      status: "added",
      auditAction: "members.add",
      notify: {
        kind: "collaboration_request",
        title: "Added to AI Company workspace",
        body: `You joined as ${member.role}`,
        userId: member.userId,
      },
    });
    return NextResponse.json({ ok: true, member });
  }

  return NextResponse.json(
    { ok: false, code: "INVALID", error: "action must be create | add_member" },
    { status: 400 }
  );
}
