import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import { decideProactiveRecommendation } from "@/services/builder/proactive.service";
import type { CeoRecommendationAction } from "@/services/builder/proactive.logic";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";

export const runtime = "nodejs";

const ACTIONS = new Set<CeoRecommendationAction>([
  "approve",
  "reject",
  "ask",
  "reassign",
  "delay",
]);

/**
 * POST /api/builder/hq/recommendations — CEO decision on a proactive recommendation.
 */
export async function POST(request: Request) {
  const started = Date.now();
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({
    auth,
    workspaceId,
    permission: "approvals.decide",
  });
  if (!access.ok) {
    logOpsEvent({
      outcome: "denied",
      workspaceId,
      action: "recommendations.decide",
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

  const recommendationId =
    body && typeof body === "object" && "recommendationId" in body
      ? (body as { recommendationId: unknown }).recommendationId
      : undefined;
  const action =
    body && typeof body === "object" && "action" in body
      ? (body as { action: unknown }).action
      : undefined;
  const note =
    body && typeof body === "object" && "note" in body
      ? (body as { note: unknown }).note
      : undefined;
  const reassignToEmployeeId =
    body && typeof body === "object" && "reassignToEmployeeId" in body
      ? (body as { reassignToEmployeeId: unknown }).reassignToEmployeeId
      : undefined;
  const delayUntil =
    body && typeof body === "object" && "delayUntil" in body
      ? (body as { delayUntil: unknown }).delayUntil
      : undefined;

  if (typeof recommendationId !== "string" || !recommendationId.trim()) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "recommendationId must be a string") },
      { status: 400 }
    );
  }

  if (typeof action !== "string" || !ACTIONS.has(action as CeoRecommendationAction)) {
    return NextResponse.json(
      {
        ok: false,
        ...publicApiError(
          "INVALID",
          "action must be approve | reject | ask | reassign | delay"
        ),
      },
      { status: 400 }
    );
  }

  const result = await decideProactiveRecommendation({
    recommendationId: recommendationId.trim(),
    action: action as CeoRecommendationAction,
    note: typeof note === "string" ? note : null,
    reassignToEmployeeId:
      typeof reassignToEmployeeId === "string" ? reassignToEmployeeId : null,
    delayUntil: typeof delayUntil === "string" ? delayUntil : null,
    workspaceId: access.ctx.workspaceId,
    actor: {
      userId: access.ctx.userId,
      displayName: access.ctx.displayName,
      role: access.ctx.role,
    },
  });

  if (!result.ok) {
    logOpsEvent({
      outcome: "error",
      workspaceId: access.ctx.workspaceId,
      action: `recommendations.${action}`,
      code: result.code,
      durationMs: Date.now() - started,
    });
    return NextResponse.json(
      { ok: false, ...publicApiError(result.code, result.message) },
      { status: result.status }
    );
  }

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: `recommendations.${action}`,
    executionStatus: result.execution?.status ?? null,
    durationMs: Date.now() - started,
  });
  return NextResponse.json({
    ok: true,
    recommendation: result.recommendation,
    execution: result.execution,
  });
}
