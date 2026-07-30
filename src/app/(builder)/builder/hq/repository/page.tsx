import Link from "next/link";
import { getAuthContext } from "@/lib/auth";
import { getRepositoryDashboard } from "@/services/github";
import { formatHqDateTimeDisplay } from "@/services/builder/format-hq-display";

export const dynamic = "force-dynamic";

export default async function WorkpilotRepositoryPage() {
  const auth = await getAuthContext();
  if (!auth) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-[var(--hq-warn)]">Owner authentication required.</p>
        <Link href="/login" className="mt-4 inline-block text-[var(--hq-signal)] underline">
          Sign in
        </Link>
      </main>
    );
  }

  const dash = await getRepositoryDashboard();
  const { status, branches, issues, pullRequests } = dash;

  return (
    <div className="hq-grid min-h-screen">
      <header className="border-b border-[var(--hq-line)]/80 bg-[var(--hq-panel)]/80">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="hq-mono text-xs tracking-[0.22em] text-[var(--hq-signal)] uppercase">
              WorkPilot connection
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Product repository</h1>
          </div>
          <Link
            href="/builder/hq"
            className="text-sm text-[var(--hq-signal)] underline-offset-2 hover:underline"
          >
            ← Live Office HQ
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[92rem] space-y-8 px-6 py-8">
        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-muted)] uppercase">
            Connection status
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                status.connected
                  ? "bg-[var(--hq-signal-soft)] text-[var(--hq-signal)]"
                  : "bg-[var(--hq-warn-soft)] text-[var(--hq-warn)]"
              }`}
            >
              {status.connected ? "Connected" : "Not connected"}
            </span>
            <span className="text-sm text-[var(--hq-ink)]">
              {status.owner}/{status.repo}
            </span>
            <span className="text-sm text-[var(--hq-muted)]">
              default branch · {status.defaultBranch}
            </span>
            <span className="text-sm text-[var(--hq-muted)]">
              token · {status.tokenConfigured ? "configured" : "missing"}
            </span>
          </div>
          {status.error ? (
            <p className="mt-3 text-sm text-[var(--hq-warn)]">{status.error}</p>
          ) : null}
          {status.repository ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">
              {status.repository.description ?? "No description"} ·{" "}
              <a
                href={status.repository.htmlUrl}
                className="text-[var(--hq-signal)] underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Open on GitHub
              </a>
              {status.repository.pushedAt
                ? ` · last push ${formatHqDateTimeDisplay(status.repository.pushedAt)}`
                : null}
            </p>
          ) : null}
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
            <h2 className="text-lg font-semibold">Branches</h2>
            <p className="mt-1 text-xs text-[var(--hq-muted)]">
              Current default: {status.defaultBranch}
            </p>
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
              {branches.length === 0 ? (
                <li className="text-[var(--hq-muted)]">No branches loaded.</li>
              ) : (
                branches.slice(0, 40).map((b) => (
                  <li
                    key={b.name}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                  >
                    <span>{b.name}</span>
                    {b.protected ? (
                      <span className="text-[10px] uppercase text-[var(--hq-muted)]">protected</span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
            <h2 className="text-lg font-semibold">Open issues</h2>
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
              {issues.length === 0 ? (
                <li className="text-[var(--hq-muted)]">No open issues.</li>
              ) : (
                issues.map((i) => (
                  <li key={i.number} className="rounded-lg bg-white px-3 py-2">
                    <a
                      href={i.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[var(--hq-ink)] hover:underline"
                    >
                      #{i.number} {i.title}
                    </a>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
            <h2 className="text-lg font-semibold">Recent pull requests</h2>
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
              {pullRequests.length === 0 ? (
                <li className="text-[var(--hq-muted)]">No pull requests.</li>
              ) : (
                pullRequests.map((p) => (
                  <li key={p.number} className="rounded-lg bg-white px-3 py-2">
                    <a
                      href={p.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      #{p.number} {p.title}
                    </a>
                    <p className="mt-1 text-[11px] text-[var(--hq-muted)]">
                      {p.state}
                      {p.draft ? " · draft" : ""} · {p.headRef} → {p.baseRef}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>

        <p className="text-xs text-[var(--hq-muted)]">
          Safety: writes require explicit owner approval, always use a feature branch + PR, never
          auto-merge, never push to main. GITHUB_TOKEN stays server-side only.
        </p>
      </main>
    </div>
  );
}
