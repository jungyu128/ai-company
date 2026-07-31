import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";
import { publicApiError } from "@/services/builder/hardening/redaction";
import {
  getCompanyAnalyticsView,
  recordCompanyAnalyticsSample,
  type AnalyticsDimension,
} from "@/services/builder/analytics";

export const runtime = "nodejs";

const DIMENSIONS = new Set<AnalyticsDimension>([
  "company",
  "employee",
  "team",
  "sprint",
  "work_item",
]);

/**
 * GET /api/builder/hq/analytics
 * GET /api/builder/hq/analytics?dimension=employee&id=mia
 * GET /api/builder/hq/analytics?history=1
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
  const dimensionRaw = url.searchParams.get("dimension")?.trim() || "company";
  if (!DIMENSIONS.has(dimensionRaw as AnalyticsDimension)) {
    return NextResponse.json(
      {
        ok: false,
        ...publicApiError(
          "INVALID",
          "dimension must be company|employee|team|sprint|work_item"
        ),
      },
      { status: 400 }
    );
  }
  const dimension = dimensionRaw as AnalyticsDimension;
  const dimensionId = url.searchParams.get("id")?.trim() || null;
  if (dimension !== "company" && !dimensionId) {
    return NextResponse.json(
      { ok: false, ...publicApiError("INVALID", "id required for dimension") },
      { status: 400 }
    );
  }

  const view = getCompanyAnalyticsView({
    workspaceId: access.ctx.workspaceId,
    dimension,
    dimensionId,
    historyLimit: url.searchParams.get("history") === "1" ? 60 : 40,
  });

  logOpsEvent({
    outcome: "ok",
    workspaceId: access.ctx.workspaceId,
    action: "analytics.view",
    durationMs: Date.now() - started,
  });

  return NextResponse.json({
    ok: true,
    ...view,
    meta: {
      productData: false,
      customerData: false,
      observeOnly: true,
    },
  });
}

/**
 * POST /api/builder/hq/analytics
 * { action: "record" } — append a historical sample (does not affect execution).
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

  if (action === "record") {
    const force =
      body &&
      typeof body === "object" &&
      "force" in body &&
      (body as { force?: unknown }).force === true;
    const result = recordCompanyAnalyticsSample({
      workspaceId: access.ctx.workspaceId,
      minIntervalMs: force ? 0 : undefined,
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
      action: "analytics.record",
      durationMs: Date.now() - started,
    });
    const view = getCompanyAnalyticsView({
      workspaceId: access.ctx.workspaceId,
    });
    return NextResponse.json({
      ok: true,
      skipped: "skipped" in result ? result.skipped : false,
      sample: result.sample,
      ...view,
    });
  }

  return NextResponse.json(
    { ok: false, ...publicApiError("INVALID", "action must be record") },
    { status: 400 }
  );
}
