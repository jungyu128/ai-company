import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  decideMemory,
  getCompanyMemoryDashboard,
  resetCompanyMemory,
  searchCompanyMemory,
} from "@/services/builder/memory/memory.service";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";

export const runtime = "nodejs";

/**
 * GET /api/builder/hq/memory — company memory dashboard.
 * Optional search: ?employeeId=&projectKey=&workItemId=&from=&to=&q=&kind=
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

  const url = new URL(request.url);
  const employeeId = url.searchParams.get("employeeId");
  const projectKey = url.searchParams.get("projectKey");
  const workItemId = url.searchParams.get("workItemId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const q = url.searchParams.get("q");
  const kind = url.searchParams.get("kind");
  const hasSearch = Boolean(
    employeeId || projectKey || workItemId || from || to || q || kind
  );

  if (hasSearch) {
    const results = searchCompanyMemory({
      workspaceId: access.ctx.workspaceId,
      query: {
        employeeId,
        projectKey,
        workItemId,
        from,
        to,
        q,
        kind: kind as never,
        limit: 40,
      },
    });
    return NextResponse.json({ ok: true, results, count: results.length });
  }

  return NextResponse.json({
    ok: true,
    ...getCompanyMemoryDashboard({ workspaceId: access.ctx.workspaceId }),
  });
}

/**
 * POST /api/builder/hq/memory
 * { action: "accept"|"ignore"|"remove", memoryId }
 * { action: "reset" }
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "memory.manage",
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, code: access.code, error: access.message },
      { status: access.status }
    );
  }

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

  if (action === "reset") {
    const result = resetCompanyMemory({ workspaceId: access.ctx.workspaceId });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, reset: true });
  }

  const memoryId =
    body && typeof body === "object" && "memoryId" in body
      ? (body as { memoryId: unknown }).memoryId
      : undefined;

  if (action !== "accept" && action !== "ignore" && action !== "remove") {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID",
        error: "action must be accept | ignore | remove | reset",
      },
      { status: 400 }
    );
  }

  if (typeof memoryId !== "string" || !memoryId.trim()) {
    return NextResponse.json(
      { ok: false, code: "INVALID", error: "memoryId must be a string" },
      { status: 400 }
    );
  }

  const result = decideMemory({
    memoryId: memoryId.trim(),
    action,
    workspaceId: access.ctx.workspaceId,
    actor: {
      userId: access.ctx.userId,
      displayName: access.ctx.displayName,
      role: access.ctx.role,
    },
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, code: result.code, error: result.message },
      { status: result.status }
    );
  }
  return NextResponse.json({
    ok: true,
    memory: result.memory,
    decision: result.decision,
    dashboard: result.dashboard,
  });
}
