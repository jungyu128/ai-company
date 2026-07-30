"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { OnboardingPublicView, OnboardingStepId } from "@/services/builder/onboarding/types";

type Props = {
  initial: OnboardingPublicView;
  workspaceId: string;
};

export function AiCompanyOnboardingWizard({ initial, workspaceId }: Props) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const state = view.state;

  async function post(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/builder/hq/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-company-workspace": workspaceId,
      },
      body: JSON.stringify({ workspaceId, ...body }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      onboarding?: OnboardingPublicView;
    };
    if (!res.ok || !data.ok) {
      if (data.onboarding) setView(data.onboarding);
      setError(data.error ?? "Something went wrong");
      return null;
    }
    if (data.onboarding) setView(data.onboarding);
    return data;
  }

  function advance(step: OnboardingStepId, skip = false) {
    startTransition(() => {
      void post({ action: skip ? "skip" : "advance", step }).then(() =>
        router.refresh()
      );
    });
  }

  function saveSettings(patch: Record<string, unknown>) {
    startTransition(() => {
      void post({ action: "settings", ...patch }).then(() => router.refresh());
    });
  }

  const step = state.currentStep;
  const hqHref = `/builder/hq?workspaceId=${encodeURIComponent(state.workspaceId)}`;

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <p className="hq-mono text-xs tracking-[0.2em] text-[var(--hq-signal)] uppercase">
          AI Company · Launch readiness
        </p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Set up your AI Company workspace
        </h1>
        <p className="max-w-2xl text-sm text-[var(--hq-muted)]">
          A guided path to connect systems, confirm approvals, and enter HQ safely. You can resume
          anytime — nothing is duplicated.
        </p>
        {view.legacyCompatible ? (
          <p className="rounded-xl bg-[var(--hq-signal-soft)] px-3 py-2 text-sm text-[var(--hq-signal)]">
            This primary workspace is already available. You can still review launch settings.
          </p>
        ) : null}
      </header>

      <nav className="flex flex-wrap gap-2">
        {view.steps.map((s, i) => (
          <span
            key={s.id}
            className={`rounded-full px-3 py-1 text-xs ${
              s.status === "current"
                ? "bg-[var(--hq-ink)] text-[var(--hq-paper)]"
                : s.status === "completed" || s.status === "skipped"
                  ? "bg-[var(--hq-signal-soft)] text-[var(--hq-signal)]"
                  : "bg-white text-[var(--hq-muted)]"
            }`}
          >
            {i + 1}. {s.label}
            {s.optional ? " (optional)" : ""}
          </span>
        ))}
      </nav>

      {error ? (
        <p className="rounded-xl bg-[var(--hq-warn-soft)] px-4 py-3 text-sm text-[var(--hq-warn)]">
          {error}
        </p>
      ) : null}

      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-6">
        {step === "workspace" ? (
          <StepShell
            title="Workspace"
            body="Confirm this AI Company workspace. Creating again with the same name reuses the existing workspace."
          >
            <p className="text-sm">
              Active workspace: <strong>{state.workspaceId}</strong>
            </p>
            <button
              type="button"
              disabled={isPending}
              className="mt-4 rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
              onClick={() => advance("workspace")}
            >
              Continue
            </button>
          </StepShell>
        ) : null}

        {step === "team" ? (
          <StepShell
            title="Owner & team access"
            body="Confirm the owner is set. Add teammates later from HQ — memberships are never duplicated."
          >
            <button
              type="button"
              disabled={isPending}
              className="mt-4 rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
              onClick={() => advance("team")}
            >
              Confirm team access
            </button>
          </StepShell>
        ) : null}

        {step === "employees" ? (
          <StepShell
            title="AI Employee responsibilities"
            body="These AI Employees will work in your company. Review their roles before continuing."
          >
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {view.employees.map((e) => (
                <li key={e.id} className="rounded-xl bg-white px-4 py-3 text-sm">
                  <p className="font-medium">
                    {e.name} · {e.role}
                  </p>
                  <p className="mt-1 text-[var(--hq-muted)]">{e.summary}</p>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={isPending}
              className="mt-4 rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
              onClick={() => advance("employees")}
            >
              Continue
            </button>
          </StepShell>
        ) : null}

        {step === "connections" || step === "connection_validate" ? (
          <StepShell
            title={step === "connections" ? "Connect systems" : "Validate connections"}
            body="Connect Gmail, Calendar, and Drive when ready. CRM is deferred. We never show a fake connected state."
          >
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                className="rounded-xl bg-[var(--hq-signal)] px-4 py-2 text-sm text-white"
                onClick={() =>
                  void post({ action: "verify_connections" }).then(() => router.refresh())
                }
              >
                Verify connections
              </button>
              {STEP_OPTIONAL(step) ? (
                <button
                  type="button"
                  disabled={isPending}
                  className="rounded-xl border border-[var(--hq-line)] px-4 py-2 text-sm"
                  onClick={() => advance(step, true)}
                >
                  Skip for now
                </button>
              ) : null}
              <button
                type="button"
                disabled={isPending}
                className="rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
                onClick={() => advance(step)}
              >
                Continue
              </button>
            </div>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {(state.connectionResults.length
                ? state.connectionResults
                : []
              ).map((c) => (
                <li key={c.system} className="rounded-xl bg-white px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{c.label}</span>
                    <span className="text-xs capitalize text-[var(--hq-muted)]">
                      {c.state.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="mt-2 text-[var(--hq-muted)]">{c.explanation}</p>
                  <p className="mt-1 text-xs text-[var(--hq-muted)]">{c.capabilitySummary}</p>
                </li>
              ))}
            </ul>
          </StepShell>
        ) : null}

        {step === "approvals" ? (
          <StepShell
            title="Approval rules"
            body="External writes always require approval. Automatic writes cannot be enabled."
          >
            <label className="mt-4 block text-sm">
              Approval expiration (hours)
              <input
                type="number"
                min={0}
                max={720}
                defaultValue={state.approvalPolicy.approvalExpirationHours}
                className="mt-1 w-full rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
                onBlur={(e) =>
                  saveSettings({
                    approvalPolicy: {
                      ...state.approvalPolicy,
                      approvalExpirationHours: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.approvalPolicy.secondApprovalHighRisk}
                onChange={(e) =>
                  saveSettings({
                    approvalPolicy: {
                      ...state.approvalPolicy,
                      secondApprovalHighRisk: e.target.checked,
                    },
                  })
                }
              />
              Optional second approval for high-risk actions
            </label>
            <p className="mt-3 text-xs text-[var(--hq-muted)]">
              Stale approvals are rejected. Destructive actions stay disabled. Beta Safety Mode is
              on.
            </p>
            <button
              type="button"
              disabled={isPending}
              className="mt-4 rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
              onClick={() => advance("approvals")}
            >
              Save & continue
            </button>
          </StepShell>
        ) : null}

        {step === "workday" ? (
          <StepShell
            title="Workday preferences"
            body="These settings guide scheduling and recommendations only — they never bypass approvals."
          >
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Timezone
                <input
                  defaultValue={state.workdayPreferences.timezone}
                  className="mt-1 w-full rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
                  onBlur={(e) =>
                    saveSettings({
                      workdayPreferences: {
                        ...state.workdayPreferences,
                        timezone: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <label className="text-sm">
                Default start
                <input
                  defaultValue={state.workdayPreferences.defaultStartTime}
                  className="mt-1 w-full rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
                  onBlur={(e) =>
                    saveSettings({
                      workdayPreferences: {
                        ...state.workdayPreferences,
                        defaultStartTime: e.target.value,
                      },
                    })
                  }
                />
              </label>
            </div>
            <button
              type="button"
              disabled={isPending}
              className="mt-4 rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
              onClick={() => advance("workday")}
            >
              Continue
            </button>
          </StepShell>
        ) : null}

        {step === "privacy" ? (
          <StepShell
            title="Privacy & memory"
            body="Control company memory. Disabling stops future learning without erasing audit history."
          >
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={state.privacySettings.memoryEnabled}
                onChange={(e) =>
                  saveSettings({
                    privacySettings: {
                      ...state.privacySettings,
                      memoryEnabled: e.target.checked,
                    },
                  })
                }
              />
              Enable company memory
            </label>
            <label className="mt-3 block text-sm">
              Retention (days)
              <input
                type="number"
                min={7}
                max={730}
                defaultValue={state.privacySettings.retentionDays}
                className="mt-1 w-full rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
                onBlur={(e) =>
                  saveSettings({
                    privacySettings: {
                      ...state.privacySettings,
                      retentionDays: Number(e.target.value),
                    },
                  })
                }
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isPending}
                className="rounded-xl border border-[var(--hq-line)] px-4 py-2 text-sm"
                onClick={() => {
                  startTransition(() => {
                    void fetch(
                      `/api/builder/hq/onboarding?export=memory&workspaceId=${encodeURIComponent(workspaceId)}`,
                      { headers: { "x-ai-company-workspace": workspaceId } }
                    )
                      .then((r) => r.json())
                      .then((d: { export?: { count?: number; enabled?: boolean } }) => {
                        setError(
                          `Memory summary ready: ${d.export?.count ?? 0} items (memory ${d.export?.enabled ? "on" : "off"}).`
                        );
                      });
                  });
                }}
              >
                Export memory summary
              </button>
              <button
                type="button"
                disabled={isPending}
                className="rounded-xl border border-[var(--hq-warn)]/40 px-4 py-2 text-sm text-[var(--hq-warn)]"
                onClick={() => void post({ action: "reset_memory" })}
              >
                Reset memory
              </button>
            </div>
            <button
              type="button"
              disabled={isPending}
              className="mt-4 rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
              onClick={() => advance("privacy")}
            >
              Continue
            </button>
          </StepShell>
        ) : null}

        {step === "readiness" ? (
          <StepShell
            title="Readiness check"
            body="Warnings are OK. Blocking failures must be fixed before entering HQ."
          >
            <button
              type="button"
              disabled={isPending}
              className="mt-4 rounded-xl bg-[var(--hq-signal)] px-4 py-2 text-sm text-white"
              onClick={() =>
                void post({ action: "readiness" }).then(() => {
                  advance("readiness");
                })
              }
            >
              Run readiness check
            </button>
            <ul className="mt-6 space-y-3">
              {state.readinessResults.map((r) => (
                <li key={r.key} className="rounded-xl bg-white px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.key}</span>
                    <span className="text-xs uppercase tracking-wide text-[var(--hq-muted)]">
                      {r.status}
                      {r.blocking ? " · blocking" : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-[var(--hq-muted)]">{r.explanation}</p>
                  {r.status !== "pass" ? (
                    <p className="mt-1 text-xs text-[var(--hq-warn)]">{r.remediation}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </StepShell>
        ) : null}

        {step === "complete" || state.completedAt ? (
          <StepShell
            title="Final review"
            body="Beta Safety Mode stays on. External writes always need approval."
          >
            {view.blockingFailures.length > 0 ? (
              <p className="mt-3 text-sm text-[var(--hq-warn)]">
                Fix blocking readiness issues before entering HQ.
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--hq-signal)]">
                Ready to enter your AI Employee headquarters.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {!state.completedAt ? (
                <button
                  type="button"
                  disabled={isPending || view.blockingFailures.length > 0}
                  className="rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)] disabled:opacity-50"
                  onClick={() =>
                    void post({ action: "complete" }).then((d) => {
                      if (d?.ok) window.location.href = hqHref;
                    })
                  }
                >
                  Complete & enter HQ
                </button>
              ) : (
                <Link
                  href={hqHref}
                  className="rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)]"
                >
                  Enter HQ
                </Link>
              )}
            </div>
          </StepShell>
        ) : null}
      </section>
    </div>
  );
}

function STEP_OPTIONAL(step: OnboardingStepId) {
  return step === "connections" || step === "connection_validate";
}

function StepShell({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-[var(--hq-muted)]">{body}</p>
      {children}
    </div>
  );
}
