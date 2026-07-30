"use client";

import type { BuilderCeoAdvisor } from "@/services/builder/hq.service";

const URGENCY_STYLES: Record<
  BuilderCeoAdvisor["urgency"],
  { label: string; bar: string; soft: string; text: string }
> = {
  critical: {
    label: "Critical",
    bar: "bg-[var(--hq-warn)]",
    soft: "bg-[var(--hq-warn-soft)]",
    text: "text-[var(--hq-warn)]",
  },
  high: {
    label: "Needs you",
    bar: "bg-[var(--hq-live)]",
    soft: "bg-[var(--hq-warn-soft)]",
    text: "text-[var(--hq-live)]",
  },
  watch: {
    label: "Watch",
    bar: "bg-[var(--hq-signal)]",
    soft: "bg-[var(--hq-signal-soft)]",
    text: "text-[var(--hq-signal)]",
  },
  clear: {
    label: "Clear",
    bar: "bg-[var(--hq-signal)]",
    soft: "bg-[var(--hq-signal-soft)]",
    text: "text-[var(--hq-signal)]",
  },
};

type Props = {
  advisor: BuilderCeoAdvisor;
};

export function CeoAdvisorPanel({ advisor }: Props) {
  const tone = URGENCY_STYLES[advisor.urgency];

  return (
    <section
      aria-label="CEO Advisor"
      className="overflow-hidden rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] shadow-[0_24px_60px_-48px_rgba(18,21,28,0.55)]"
    >
      <div className={`h-1.5 w-full ${tone.bar}`} />
      <div className="px-6 py-6 md:px-8 md:py-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="hq-mono text-xs tracking-[0.22em] text-[var(--hq-signal)] uppercase">
              CEO Advisor · Executive briefing
            </p>
            <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight md:text-3xl">
              {advisor.headline}
            </h2>
          </div>
          <span
            className={`hq-mono rounded-full px-3 py-1 text-[11px] font-medium ${tone.soft} ${tone.text}`}
          >
            {tone.label}
          </span>
        </div>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <AdvisorBlock title="What happened since last visit" body={advisor.sinceLastVisit} />
          <AdvisorBlock title="What requires attention" body={advisor.requiresAttention} />
          <AdvisorBlock title="Why it matters" body={advisor.whyItMatters} />
          <AdvisorBlock title="Recommended action" body={advisor.recommendedAction} emphasize />
          <AdvisorBlock title="Expected outcome" body={advisor.expectedOutcome} />
          <AdvisorBlock title="Risks if ignored" body={advisor.risksIfIgnored} warn />
        </div>

        <p className="hq-mono mt-5 text-[10px] text-[var(--hq-muted)]">
          Synthesized from sprint, decisions, audit log, releases, engineering health, and CEO
          gates — not a raw data reprint.
          {advisor.lastVisitDisplay
            ? ` Last visit baseline: ${advisor.lastVisitDisplay}.`
            : " First visit baseline (no prior timestamp)."}
        </p>
      </div>
    </section>
  );
}

function AdvisorBlock({
  title,
  body,
  emphasize,
  warn,
}: {
  title: string;
  body: string;
  emphasize?: boolean;
  warn?: boolean;
}) {
  return (
    <div
      className={
        emphasize
          ? "rounded-xl bg-[var(--hq-ink)] px-4 py-3 text-[var(--hq-paper)]"
          : warn
            ? "rounded-xl border border-[var(--hq-warn)]/25 bg-[var(--hq-warn-soft)]/60 px-4 py-3"
            : "rounded-xl border border-[var(--hq-line)]/80 px-4 py-3"
      }
    >
      <p
        className={`hq-mono text-[10px] tracking-[0.16em] uppercase ${
          emphasize ? "text-[var(--hq-signal-soft)]" : "text-[var(--hq-muted)]"
        }`}
      >
        {title}
      </p>
      <p className={`mt-2 text-sm leading-relaxed ${emphasize ? "text-[var(--hq-paper)]" : ""}`}>
        {body}
      </p>
    </div>
  );
}
