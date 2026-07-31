"use client";

import {
  COMPANY_TIMELINE_LABELS,
  type CompanyTimelineEvent,
  type CompanyTimelineEventKind,
} from "@/services/builder/company-timeline";

type Props = {
  events: CompanyTimelineEvent[];
};

const KIND_DOT: Record<CompanyTimelineEventKind, string> = {
  directive_submitted: "bg-sky-400",
  work_assigned: "bg-indigo-400",
  work_started: "bg-emerald-500",
  review_started: "bg-violet-400",
  review_completed: "bg-violet-500",
  approval_requested: "bg-amber-400",
  approval_granted: "bg-emerald-400",
  work_completed: "bg-teal-500",
  blocked: "bg-rose-500",
  resumed: "bg-lime-400",
};

export function CompanyActivityTimeline({ events }: Props) {
  const chronological = [...events].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            Company activity timeline
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">
            What happened, in order
          </h3>
        </div>
        <span className="hq-mono text-xs text-[var(--hq-muted)]">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      {chronological.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--hq-muted)]">
          No company timeline events yet. Submit a Daily Directive to start the
          record.
        </p>
      ) : (
        <ol className="mt-5 space-y-0 border-l border-[var(--hq-line)] pl-4">
          {chronological.map((event) => (
            <li key={event.id} className="relative pb-4 last:pb-0">
              <span
                className={`absolute -left-[1.35rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--hq-panel)] ${KIND_DOT[event.kind]}`}
                aria-hidden
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <time
                  dateTime={event.at}
                  className="hq-mono text-[11px] tracking-wide text-[var(--hq-muted)]"
                >
                  {event.atDisplay}
                </time>
                <span className="hq-mono text-[10px] uppercase tracking-[0.14em] text-[var(--hq-signal)]">
                  {COMPANY_TIMELINE_LABELS[event.kind]}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-[var(--hq-ink)]">
                {event.summary}
              </p>
              {event.actorName ? (
                <p className="mt-0.5 text-xs text-[var(--hq-muted)]">
                  {event.actorName}
                  {event.actorRole === "owner"
                    ? " · CEO"
                    : event.actorRole === "ai_employee"
                      ? " · employee"
                      : ""}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
