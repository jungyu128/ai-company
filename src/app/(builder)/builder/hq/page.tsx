import Link from "next/link";
import { isInternalAiCompanyEnabled } from "@/services/builder/internal-ai-company";
import { getAiCompanyDashboard } from "@/services/builder/company.service";
import { AiCompanyCeoDashboard } from "@/features/builder/components/ai-company-ceo-dashboard";
import { getAuthContext } from "@/lib/auth";
import {
  ensureHqAccess,
  DEFAULT_WORKSPACE_ID,
} from "@/services/builder/workspace/workspace.service";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<{ workspaceId?: string }>;
};

export default async function BuilderHqPage({ searchParams }: PageProps) {
  if (!isInternalAiCompanyEnabled()) {
    return (
      <div className="hq-grid min-h-screen">
        <main className="mx-auto max-w-xl px-6 py-24 text-center">
          <p className="hq-mono text-xs tracking-[0.22em] text-[var(--hq-muted)] uppercase">
            AI Company · Internal
          </p>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--hq-ink)]">
            AI Company unavailable
          </h1>
          <p className="mt-3 text-sm text-[var(--hq-muted)]">
            Set <code className="hq-mono">INTERNAL_AI_COMPANY_ENABLED=true</code> to enable your AI
            Employee headquarters.
          </p>
          <Link
            href="/login"
            className="mt-8 inline-block text-sm text-[var(--hq-signal)] underline-offset-2 hover:underline"
          >
            Owner login →
          </Link>
        </main>
      </div>
    );
  }

  const params = searchParams ? await searchParams : {};
  const workspaceId = params.workspaceId?.trim() || DEFAULT_WORKSPACE_ID;

  let company = null;
  let error: string | null = null;
  try {
    const auth = await getAuthContext();
    if (auth) {
      const access = ensureHqAccess({ auth, workspaceId });
      if (!access.ok) {
        error = access.message;
      } else {
        company = await getAiCompanyDashboard({
          workspaceId: access.ctx.workspaceId,
          userId: access.ctx.userId,
        });
      }
    } else {
      company = await getAiCompanyDashboard({ workspaceId });
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load AI Company";
  }

  return (
    <div className="hq-grid min-h-screen">
      <header className="border-b border-[var(--hq-line)]/80 bg-[var(--hq-panel)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-6 px-6 py-5">
          <div>
            <p className="hq-mono text-xs tracking-[0.22em] text-[var(--hq-signal)] uppercase">
              AI Company · Live Office
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--hq-ink)] md:text-3xl">
              Company headquarters
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/builder/hq/repository"
              className="rounded-full border border-[var(--hq-line)] bg-white px-3 py-1 text-xs text-[var(--hq-ink)] underline-offset-2 hover:underline"
            >
              WorkPilot repo
            </Link>
            <span className="hidden items-center gap-2 rounded-full bg-[var(--hq-signal-soft)] px-3 py-1 text-xs font-medium text-[var(--hq-signal)] sm:inline-flex">
              <span className="hq-live-dot h-1.5 w-1.5 rounded-full bg-[var(--hq-signal)]" />
              Company live
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[92rem] px-6 py-6 md:py-8">
        {error || !company ? (
          <div className="rounded-2xl border border-[var(--hq-warn)]/30 bg-[var(--hq-warn-soft)] px-5 py-4 text-[var(--hq-warn)]">
            {error ?? "Company unavailable"}
          </div>
        ) : (
          <AiCompanyCeoDashboard initial={company} />
        )}
      </main>
    </div>
  );
}
