import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import {
  decideWorkpilotExecution,
  getWorkpilotExecution,
  listAwaitingWorkpilotExecutions,
  listWorkpilotExecutions,
  prepareWorkpilotExecution,
  toCeoPreview,
} from "@/services/builder/workpilot-execution";
import type { CeoWorkpilotExecutionDecision } from "@/services/builder/workpilot-execution";
import type { WorkItemLink } from "@/services/builder/autonomous-company/types";
import type { WorkpilotFileChange } from "@/services/builder/workpilot-execution";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";

export const runtime = "nodejs";

const DECISIONS = new Set<CeoWorkpilotExecutionDecision>([
  "approve",
  "request_changes",
  "reject",
  "delay",
]);

/**
 * GET /api/builder/hq/workpilot-execution
 * ?awaiting=1 | ?id=…
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "execution.view",
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
    const pkg = getWorkpilotExecution(id, undefined, access.ctx.workspaceId);
    if (!pkg) {
      return NextResponse.json(
        { ok: false, ...publicApiError("NOT_FOUND", "Execution not found") },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      package: pkg,
      preview: toCeoPreview(pkg),
    });
  }

  const awaiting = url.searchParams.get("awaiting") === "1";
  const packages = awaiting
    ? listAwaitingWorkpilotExecutions(undefined, access.ctx.workspaceId)
    : listWorkpilotExecutions(undefined, access.ctx.workspaceId);

  return NextResponse.json({
    ok: true,
    packages,
    previews: packages.map(toCeoPreview),
  });
}

/**
 * POST /api/builder/hq/workpilot-execution
 * { mode: "prepare", ... } | { mode: "decide", executionId, decision, note? }
 */
export async function POST(request: Request) {
  const started = Date.now();
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  const workspaceId = resolveWorkspaceIdFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "Expected JSON body") },
      { status: 400 }
    );
  }

  const mode =
    body && typeof body === "object" && "mode" in body
      ? (body as { mode: unknown }).mode
      : "prepare";

  if (mode === "decide") {
    const access = ensureHqAccess({
      auth,
      workspaceId,
      permission: "execution.decide",
    });
    if (!access.ok) {
      logOpsEvent({
        outcome: "denied",
        workspaceId,
        action: "workpilot_execution.decide",
        code: access.code,
        durationMs: Date.now() - started,
      });
      return NextResponse.json(
        { ok: false, ...publicApiError(access.code, access.message) },
        { status: access.status }
      );
    }

    const executionId =
      body && typeof body === "object" && "executionId" in body
        ? (body as { executionId: unknown }).executionId
        : undefined;
    const decision =
      body && typeof body === "object" && "decision" in body
        ? (body as { decision: unknown }).decision
        : undefined;
    const note =
      body && typeof body === "object" && "note" in body
        ? (body as { note: unknown }).note
        : undefined;
    const delayUntil =
      body && typeof body === "object" && "delayUntil" in body
        ? (body as { delayUntil: unknown }).delayUntil
        : undefined;

    if (typeof executionId !== "string" || !executionId.trim()) {
      return NextResponse.json(
        { ok: false, ...publicApiError("INVALID", "executionId required") },
        { status: 400 }
      );
    }
    if (typeof decision !== "string" || !DECISIONS.has(decision as CeoWorkpilotExecutionDecision)) {
      return NextResponse.json(
        {
          ok: false,
          ...publicApiError(
            "INVALID",
            "decision must be approve | request_changes | reject | delay"
          ),
        },
        { status: 400 }
      );
    }

    const result = await decideWorkpilotExecution({
      executionId: executionId.trim(),
      decision: decision as CeoWorkpilotExecutionDecision,
      note: typeof note === "string" ? note : null,
      delayUntil: typeof delayUntil === "string" ? delayUntil : null,
      actor: {
        userId: access.ctx.userId,
        displayName: access.ctx.displayName,
        role: access.ctx.role,
      },
      workspaceId: access.ctx.workspaceId,
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, ...publicApiError(result.code, result.message) },
        { status: result.status }
      );
    }

    return NextResponse.json({
      ok: true,
      package: result.package,
      preview: result.preview,
    });
  }

  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "mission.assign",
  });
  if (!access.ok) {
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  const employeeId =
    body && typeof body === "object" && "employeeId" in body
      ? (body as { employeeId: unknown }).employeeId
      : undefined;
  const goal =
    body && typeof body === "object" && "goal" in body
      ? (body as { goal: unknown }).goal
      : undefined;
  const workItem =
    body && typeof body === "object" && "workItem" in body
      ? (body as { workItem: unknown }).workItem
      : undefined;
  const filesChanged =
    body && typeof body === "object" && "filesChanged" in body
      ? (body as { filesChanged: unknown }).filesChanged
      : undefined;
  const reasoning =
    body && typeof body === "object" && "reasoning" in body
      ? (body as { reasoning: unknown }).reasoning
      : undefined;
  const missingRequirements =
    body && typeof body === "object" && "missingRequirements" in body
      ? (body as { missingRequirements: unknown }).missingRequirements
      : undefined;

  if (typeof employeeId !== "string" || !employeeId.trim()) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "employeeId required") },
      { status: 400 }
    );
  }
  if (typeof goal !== "string" || !goal.trim()) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "goal required") },
      { status: 400 }
    );
  }
  if (!workItem || typeof workItem !== "object") {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "workItem required") },
      { status: 400 }
    );
  }
  if (!Array.isArray(filesChanged)) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "filesChanged required") },
      { status: 400 }
    );
  }

  const result = prepareWorkpilotExecution({
    employeeId: employeeId.trim(),
    goal: goal.trim(),
    workItem: workItem as WorkItemLink,
    filesChanged: filesChanged as WorkpilotFileChange[],
    reasoning: typeof reasoning === "string" ? reasoning : undefined,
    missingRequirements: Array.isArray(missingRequirements)
      ? (missingRequirements as string[])
      : undefined,
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
    action: "workpilot_execution.prepare",
    executionStatus: result.package.status,
    durationMs: Date.now() - started,
  });

  return NextResponse.json({
    ok: true,
    package: result.package,
    preview: result.preview,
  });
}
