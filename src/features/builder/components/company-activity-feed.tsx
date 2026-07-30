"use client";

import type { ActivityFeedItem } from "@/services/builder/conversation.logic";

type Props = {
  items: ActivityFeedItem[];
};

const TONE_DOT: Record<ActivityFeedItem["tone"], string> = {
  positive: "bg-emerald-500",
  attention: "bg-amber-400",
  neutral: "bg-[var(--hq-muted)]",
};

export function CompanyActivityFeed({ items }: Props) {
  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            Live company feed
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">What the company is doing</h3>
        </div>
        <span className="hq-live-dot h-2 w-2 rounded-full bg-[var(--hq-signal)]" />
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--hq-muted)]">No company activity yet.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.slice(0, 12).map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 border-b border-[var(--hq-line)]/60 pb-3 last:border-0 last:pb-0"
            >
              <span
                className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT[item.tone]}`}
                aria-hidden
              />
              <p className="text-sm leading-relaxed text-[var(--hq-ink)]">{item.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
