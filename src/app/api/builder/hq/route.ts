import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import { getAiCompanyDashboard } from "@/services/builder/company.service";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { publicApiError } from "@/services/builder/hardening/redaction";
import { runProductionHealthDiagnostics } from "@/services/builder/hardening/diagnostics";
import { logOpsEvent } from "@/services/builder/hardening/ops-log";

/** Node filesystem + Builder Runtime ESM (not Edge). */
export const runtime = "nodejs";

/**
 * GET /api/builder/hq — AI Company CEO dashboard (employee view).
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const workspaceId = resolveWorkspaceIdFromRequest(request);
  const access = ensureHqAccess({ auth, workspaceId });
  if (!access.ok) {
    logOpsEvent({
      outcome: "denied",
      workspaceId,
      action: "hq.dashboard",
      code: access.code,
    });
    return NextResponse.json(
      { ok: false, ...publicApiError(access.code, access.message) },
      { status: access.status }
    );
  }

  try {
    const url = new URL(request.url);
    const lastVisitAt = url.searchParams.get("lastVisit");
    const includeDiagnostics = url.searchParams.get("diagnostics") === "1";
    const started = Date.now();
    const company = await getAiCompanyDashboard({
      lastVisitAt: lastVisitAt && lastVisitAt.length > 0 ? lastVisitAt : null,
      workspaceId: access.ctx.workspaceId,
      userId: access.ctx.userId,
    });
    logOpsEvent({
      outcome: "ok",
      workspaceId: access.ctx.workspaceId,
      action: "hq.dashboard",
      durationMs: Date.now() - started,
    });
    return NextResponse.json({
      ok: true,
      company,
      workspaceContext: {
        workspaceId: access.ctx.workspaceId,
        role: access.ctx.role,
        permissions: access.ctx.permissions,
      },
      diagnostics: includeDiagnostics
        ? runProductionHealthDiagnostics({
            workspaceId: access.ctx.workspaceId,
          })
        : undefined,
      meta: {
        source: "ai-company",
        productData: false,
        customerData: false,
        employees: company.employees.length,
      },
    });
  } catch {
    logOpsEvent({
      outcome: "error",
      workspaceId: access.ctx.workspaceId,
      action: "hq.dashboard",
      code: "LOAD_FAILED",
    });
    return NextResponse.json(
      { ok: false, ...publicApiError("LOAD_FAILED", "Company load failed") },
      { status: 500 }
    );
  }
}
