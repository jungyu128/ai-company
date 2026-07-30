"use client";

import type { LiveOfficeActivityItem } from "@/features/builder/live-office/live-office-model";

type Props = {
  items: LiveOfficeActivityItem[];
};

const TONE: Record<LiveOfficeActivityItem["tone"], string> = {
  positive: "bg-emerald-500",
  attention: "bg-amber-400",
  neutral: "bg-[var(--hq-muted)]",
};

export function LiveOfficeActivityFeed({ items }: Props) {
  return (
    <section className="lo-feed">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            Live office
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">Floor activity</h3>
        </div>
        <span className="hq-live-dot h-2 w-2 rounded-full bg-[var(--hq-signal)]" />
      </div>

      {items.length === 0 ? (
        <p className="mt-5 text-sm text-[var(--hq-muted)]">
          Quiet floor — waiting for the next real company event.
        </p>
      ) : (
        <ul className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-3 border-b border-[var(--hq-line)]/50 pb-3 last:border-0">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[item.tone]}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm leading-relaxed text-[var(--hq-ink)]">{item.summary}</p>
                <p className="hq-mono mt-1 text-[10px] text-[var(--hq-muted)]">{item.atDisplay}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
