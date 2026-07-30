import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth";
import {
  advanceOnboardingStep,
  completeOnboarding,
  exportMemorySummary,
  getOnboardingView,
  persistConnectionVerification,
  runOnboardingReadiness,
  startOrResumeOnboarding,
  updateOnboardingSettings,
  type OnboardingStepId,
  ONBOARDING_STEPS,
} from "@/services/builder/onboarding";
import {
  ensureHqAccess,
  resolveWorkspaceIdFromRequest,
} from "@/services/builder/workspace/workspace.service";
import { resetCompanyMemory } from "@/services/builder/memory/memory.service";

export const runtime = "nodejs";

function actorFrom(auth: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>) {
  return {
    userId: auth.user.id,
    email: auth.user.email,
    displayName: auth.user.name?.trim() || auth.user.email,
  };
}

/**
 * GET /api/builder/hq/onboarding — current onboarding view (+ optional memory export).
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
  if (url.searchParams.get("export") === "memory") {
    return NextResponse.json({
      ok: true,
      export: exportMemorySummary({ workspaceId: access.ctx.workspaceId }),
    });
  }

  const view = getOnboardingView({ workspaceId: access.ctx.workspaceId });
  return NextResponse.json({ ok: true, onboarding: view });
}

/**
 * POST /api/builder/hq/onboarding
 * actions: start | advance | skip | settings | verify_connections | readiness | complete | reset_memory
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
      ? String((body as { action: unknown }).action ?? "")
      : "";
  const workspaceId =
    body && typeof body === "object" && "workspaceId" in body
      ? String((body as { workspaceId: unknown }).workspaceId ?? "")
      : resolveWorkspaceIdFromRequest(request);

  const actor = actorFrom(auth);

  if (action === "start") {
    const createNew =
      body && typeof body === "object" && "createNew" in body
        ? Boolean((body as { createNew: unknown }).createNew)
        : false;
    const targetWs = workspaceId || "default";

    if (!createNew) {
      const access = ensureHqAccess({ auth, workspaceId: targetWs });
      if (!access.ok) {
        return NextResponse.json(
          { ok: false, code: access.code, error: access.message },
          { status: access.status }
        );
      }
    } else {
      // Creating a new workspace requires membership + members.manage on default
      const access = ensureHqAccess({
        auth,
        workspaceId: "default",
        permission: "members.manage",
      });
      if (!access.ok) {
        return NextResponse.json(
          { ok: false, code: access.code, error: access.message },
          { status: access.status }
        );
      }
    }

    const workspaceName =
      body && typeof body === "object" && "workspaceName" in body
        ? String((body as { workspaceName: unknown }).workspaceName ?? "")
        : undefined;
    const result = startOrResumeOnboarding({
      actor,
      workspaceId: createNew ? undefined : targetWs,
      createNew,
      workspaceName,
      forceStart: true,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({
      ok: true,
      created: result.created,
      onboarding: result.view,
    });
  }

  const access = ensureHqAccess({
    auth,
    workspaceId: workspaceId || "default",
    permission: action === "settings" || action === "reset_memory" ? "settings.manage" : undefined,
  });
  if (!access.ok) {
    // members.manage not required for advance — owners/admins use settings.manage for settings
    if (action === "settings" || action === "reset_memory") {
      return NextResponse.json(
        { ok: false, code: access.code, error: access.message },
        { status: access.status }
      );
    }
    // retry without settings permission for advance/complete
    const soft = ensureHqAccess({ auth, workspaceId: workspaceId || "default" });
    if (!soft.ok) {
      return NextResponse.json(
        { ok: false, code: soft.code, error: soft.message },
        { status: soft.status }
      );
    }
    return handleAction(action, body, soft.ctx.workspaceId, actor);
  }

  return handleAction(action, body, access.ctx.workspaceId, actor);
}

async function handleAction(
  action: string,
  body: unknown,
  workspaceId: string,
  actor: ReturnType<typeof actorFrom>
) {
  if (action === "advance" || action === "skip") {
    const step =
      body && typeof body === "object" && "step" in body
        ? String((body as { step: unknown }).step ?? "")
        : "";
    if (!(ONBOARDING_STEPS as readonly string[]).includes(step)) {
      return NextResponse.json(
        { ok: false, code: "INVALID", error: "Unknown onboarding step" },
        { status: 400 }
      );
    }
    const result = advanceOnboardingStep({
      workspaceId,
      step: step as OnboardingStepId,
      actor,
      skip: action === "skip",
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, onboarding: result.view });
  }

  if (action === "settings") {
    const approvalPolicy =
      body && typeof body === "object" && "approvalPolicy" in body
        ? (body as { approvalPolicy: unknown }).approvalPolicy
        : undefined;
    const workdayPreferences =
      body && typeof body === "object" && "workdayPreferences" in body
        ? (body as { workdayPreferences: unknown }).workdayPreferences
        : undefined;
    const privacySettings =
      body && typeof body === "object" && "privacySettings" in body
        ? (body as { privacySettings: unknown }).privacySettings
        : undefined;
    const betaSafetyMode =
      body && typeof body === "object" && "betaSafetyMode" in body
        ? (body as { betaSafetyMode: unknown }).betaSafetyMode
        : undefined;

    const result = updateOnboardingSettings({
      workspaceId,
      actor,
      approvalPolicy:
        approvalPolicy && typeof approvalPolicy === "object"
          ? (approvalPolicy as Record<string, unknown>)
          : undefined,
      workdayPreferences:
        workdayPreferences && typeof workdayPreferences === "object"
          ? (workdayPreferences as Record<string, unknown>)
          : undefined,
      privacySettings:
        privacySettings && typeof privacySettings === "object"
          ? (privacySettings as Record<string, unknown>)
          : undefined,
      betaSafetyMode: typeof betaSafetyMode === "boolean" ? betaSafetyMode : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, onboarding: result.view });
  }

  if (action === "verify_connections") {
    const view = persistConnectionVerification({ workspaceId });
    return NextResponse.json({
      ok: true,
      connections: view.state.connectionResults,
      onboarding: view,
    });
  }

  if (action === "readiness") {
    const result = runOnboardingReadiness({ workspaceId });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, onboarding: result.view });
  }

  if (action === "complete") {
    const result = completeOnboarding({ workspaceId, actor });
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          code: result.code,
          error: result.message,
          onboarding: result.view,
        },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, onboarding: result.view });
  }

  if (action === "reset_memory") {
    const result = resetCompanyMemory({ workspaceId });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, code: result.code, error: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({
      ok: true,
      reset: true,
      export: exportMemorySummary({ workspaceId }),
    });
  }

  return NextResponse.json(
    {
      ok: false,
      code: "INVALID",
      error:
        "action must be start | advance | skip | settings | verify_connections | readiness | complete | reset_memory",
    },
    { status: 400 }
  );
}
