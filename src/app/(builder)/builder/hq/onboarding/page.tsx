import Link from "next/link";
import { isInternalAiCompanyEnabled } from "@/services/builder/internal-ai-company";
import { getAuthContext } from "@/lib/auth";
import {
  ensureHqAccess,
  DEFAULT_WORKSPACE_ID,
} from "@/services/builder/workspace/workspace.service";
import {
  getOnboardingView,
  startOrResumeOnboarding,
} from "@/services/builder/onboarding";
import { AiCompanyOnboardingWizard } from "@/features/builder/components/ai-company-onboarding-wizard";
import { HqShellPage } from "@/features/builder/components/hq-shell-page";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ workspaceId?: string }>;
};

export default async function OnboardingPage({ searchParams }: PageProps) {
  if (!isInternalAiCompanyEnabled()) {
    return (
      <div className="hq-grid min-h-screen">
        <main className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="text-2xl font-semibold">AI Company unavailable</h1>
          <Link href="/dashboard" className="mt-6 inline-block text-sm text-[var(--hq-signal)]">
            Back to WorkPilot →
          </Link>
        </main>
      </div>
    );
  }

  const params = searchParams ? await searchParams : {};
  const workspaceId = params.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;
  const auth = await getAuthContext();

  let error: string | null = null;
  let view = getOnboardingView({ workspaceId });

  try {
    if (auth) {
      const access = ensureHqAccess({ auth, workspaceId });
      if (!access.ok) {
        error = access.message;
      } else {
        const started = startOrResumeOnboarding({
          actor: {
            userId: access.ctx.userId,
            email: access.ctx.email,
            displayName: access.ctx.displayName,
          },
          workspaceId: access.ctx.workspaceId,
          forceStart: true,
        });
        if (started.ok) view = started.view;
        else error = started.message;
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Onboarding failed to load";
  }

  return (
    <HqShellPage workspaceId={workspaceId}>
      <div className="mx-auto max-w-4xl">
        <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-green-bright)] uppercase">
          Settings · Onboarding
        </p>
        <div className="mt-6">
          {error ? (
            <div className="rounded-2xl border border-[var(--hq-warn)]/30 bg-[var(--hq-warn-soft)] px-5 py-4 text-[var(--hq-warn)]">
              {error}
            </div>
          ) : (
            <AiCompanyOnboardingWizard initial={view} workspaceId={view.state.workspaceId} />
          )}
        </div>
      </div>
    </HqShellPage>
  );
}
