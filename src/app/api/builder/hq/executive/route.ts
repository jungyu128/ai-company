import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  applyCeoPlanningAction,
  generateExecutiveReports,
  getCeoDashboardDrill,
  getExecutiveDashboard,
  runAiCeoCycle,
  type CeoDashboardDrillSection,
} from "@/services/builder/ceo";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";

export const runtime = "nodejs";

const DRILL_SECTIONS = new Set<CeoDashboardDrillSection>([
  "health",
  "workload",
  "active_work",
  "blocked_work",
  "sprint",
  "meeting",
  "risk",
  "approval",
  "decision",
  "kpi",
  "live_work",
  "daily_ops",
]);

/**
 * GET /api/builder/hq/executive — AI CEO Executive Dashboard (real-time).
 * GET /api/builder/hq/executive?section=…&id=… — drill into a dashboard item.
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
  const section = url.searchParams.get("section")?.trim() ?? "";
  const id = url.searchParams.get("id")?.trim() ?? "";
  if (section) {
    if (!DRILL_SECTIONS.has(section as CeoDashboardDrillSection)) {
      return NextResponse.json(
        { ok: false, code: "INVALID", error: "Unknown drill section" },
        { status: 400 }
      );
    }
    const result = getCeoDashboardDrill({
      section: section as CeoDashboardDrillSection,
      id,
      workspaceId: access.ctx.workspaceId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({
      ok: true,
      drill: result.drill,
      meta: {
        productData: false,
        customerData: false,
        aiCeoApprovesWrites: false,
      },
    });
  }

  const dashboard = getExecutiveDashboard({
    workspaceId: access.ctx.workspaceId,
    refresh: true,
  });

  return NextResponse.json({
    ok: true,
    executive: dashboard,
    meta: {
      productData: false,
      customerData: false,
      aiCeoApprovesWrites: false,
    },
  });
}

/**
 * POST /api/builder/hq/executive
 * { action: "refresh" | "reports" | "apply_plan", planningId? }
 */
export async function POST(request: Request) {
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
      ? String((body as { action: unknown }).action ?? "refresh")
      : "refresh";

  if (action === "refresh") {
    const executive = runAiCeoCycle({ workspaceId: access.ctx.workspaceId });
    return NextResponse.json({ ok: true, executive });
  }

  if (action === "reports") {
    const executive = generateExecutiveReports({
      workspaceId: access.ctx.workspaceId,
    });
    return NextResponse.json({ ok: true, executive });
  }

  if (action === "apply_plan") {
    const planningId =
      body && typeof body === "object" && "planningId" in body
        ? String((body as { planningId: unknown }).planningId ?? "")
        : "";
    if (!planningId.trim()) {
      return NextResponse.json(
        { ok: false, code: "INVALID", error: "planningId required" },
        { status: 400 }
      );
    }
    // Reassignment is an internal assignment change — still requires mission.assign
    const gated = ensureHqAccess({
      auth,
      workspaceId: access.ctx.workspaceId,
      permission: "mission.assign",
    });
    if (!gated.ok) {
      return NextResponse.json(
        { ok: false, code: gated.code, error: gated.message },
        { status: gated.status }
      );
    }
    const result = applyCeoPlanningAction({
      workspaceId: access.ctx.workspaceId,
      planningId: planningId.trim(),
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    const executive = runAiCeoCycle({ workspaceId: access.ctx.workspaceId });
    return NextResponse.json({
      ok: true,
      missionId: result.missionId,
      executive,
      note: "Assignment updated. External writes still require human approval.",
    });
  }

  return NextResponse.json(
    {
      ok: false,
      code: "INVALID",
      error: "action must be refresh | reports | apply_plan",
    },
    { status: 400 }
  );
}
