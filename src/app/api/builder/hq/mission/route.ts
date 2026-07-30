import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import { createCeoMission } from "@/services/builder/mission.service";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";

/** Node filesystem + Builder Runtime ESM (not Edge). */
export const runtime = "nodejs";

/**
 * POST /api/builder/hq/mission — Assign a CEO Mission to AI Employees.
 * Body: { mission: string }
 * Internal only. No customer / Gmail / CRM data.
 */
export async function POST(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "mission.assign",
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

  const mission =
    body && typeof body === "object" && "mission" in body
      ? (body as { mission: unknown }).mission
      : undefined;
  const employeeId =
    body && typeof body === "object" && "employeeId" in body
      ? (body as { employeeId: unknown }).employeeId
      : undefined;

  if (typeof mission !== "string") {
    return NextResponse.json(
      { ok: false, code: "INVALID", error: "mission must be a string" },
      { status: 400 }
    );
  }

  try {
    const result = await createCeoMission(mission, {
      employeeId: typeof employeeId === "string" ? employeeId : null,
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
        { status: result.status ?? 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      taskId: result.taskId,
      title: result.title,
      status: result.status,
      sprintId: result.sprintId,
      approvalPhrase: result.approvalPhrase,
      plan: {
        summary: result.plan.summary,
        steps: result.plan.steps,
        approvalGate: result.plan.approvalGate,
      },
      collaboration: result.collaboration,
      execution: result.execution,
      hq: result.hq,
    });
  } catch {
    return NextResponse.json(
      { ok: false, code: "MISSION_FAILED", error: "Mission could not be created" },
      { status: 500 }
    );
  }
}
