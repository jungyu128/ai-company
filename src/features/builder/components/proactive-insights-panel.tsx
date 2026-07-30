"use client";

import type { CompanyHealth, PriorityAlert } from "@/services/builder/proactive.logic";

type Props = {
  alerts: PriorityAlert[];
  risks: string[];
  opportunities: string[];
  companyHealth: CompanyHealth;
};

const TONE: Record<PriorityAlert["tone"], string> = {
  critical: "bg-red-500",
  warning: "bg-amber-400",
  info: "bg-[var(--hq-signal)]",
};

export function ProactiveInsightsPanel({
  alerts,
  risks,
  opportunities,
  companyHealth,
}: Props) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-warn)] uppercase">
          Priority alerts
        </p>
        {alerts.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--hq-muted)]">No priority alerts.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start gap-3 text-sm">
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE[a.tone]}`} />
                <div>
                  <p className="font-medium">{a.title}</p>
                  <p className="mt-0.5 text-[var(--hq-muted)]">{a.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
          Company health
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {companyHealth.score}
          <span className="ml-2 text-base font-medium text-[var(--hq-muted)]">
            {companyHealth.label}
          </span>
        </p>
        <p className="mt-2 text-sm text-[var(--hq-muted)]">{companyHealth.summary}</p>
        <ul className="mt-3 space-y-1 text-xs text-[var(--hq-muted)]">
          {companyHealth.factors.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">Risks</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {risks.length === 0 ? (
                <li className="list-none pl-0 text-[var(--hq-muted)]">None flagged</li>
              ) : (
                risks.map((r) => <li key={r}>{r}</li>)
              )}
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Opportunities
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {opportunities.length === 0 ? (
                <li className="list-none pl-0 text-[var(--hq-muted)]">None flagged</li>
              ) : (
                opportunities.map((o) => <li key={o}>{o}</li>)
              )}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
