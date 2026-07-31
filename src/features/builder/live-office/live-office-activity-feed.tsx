"use client";

import { useEffect, useRef, useState } from "react";
import type { LiveOfficeActivityItem } from "@/features/builder/live-office/live-office-model";

type Props = {
  items: LiveOfficeActivityItem[];
};

const TONE: Record<LiveOfficeActivityItem["tone"], string> = {
  positive: "lo-channel__tone--positive",
  attention: "lo-channel__tone--attention",
  neutral: "lo-channel__tone--neutral",
};

export function LiveOfficeActivityFeed({ items }: Props) {
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const booted = useRef(false);

  useEffect(() => {
    const nextFresh = new Set<string>();
    for (const item of items) {
      if (booted.current && !seen.current.has(item.id)) {
        nextFresh.add(item.id);
      }
      seen.current.add(item.id);
    }
    booted.current = true;
    if (nextFresh.size === 0) return;
    setFresh(nextFresh);
    const t = window.setTimeout(() => setFresh(new Set()), 900);
    return () => window.clearTimeout(t);
  }, [items]);

  return (
    <aside className="lo-channel" aria-label="Floor channel">
      <div className="lo-channel__head">
        <div className="lo-channel__title-row">
          <span className="lo-channel__wave" aria-hidden />
          <div>
            <p className="lo-channel__eyebrow">Floor Channel</p>
            <h3 className="lo-channel__title">Live activity</h3>
          </div>
        </div>
        <button
          type="button"
          className="lo-channel__see-all"
          onClick={() => {
            window.location.hash = "ops-activity";
          }}
        >
          See all
        </button>
      </div>

      {items.length === 0 ? (
        <p className="lo-channel__empty">Quiet floor — waiting for the next company event.</p>
      ) : (
        <ul className="lo-channel__list">
          {items.map((item, index) => (
            <li
              key={item.id}
              className={`lo-channel__item${fresh.has(item.id) ? " lo-channel__item--enter" : ""}`}
              style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
            >
              <span className={`lo-channel__tone ${TONE[item.tone]}`} aria-hidden />
              <div className="lo-channel__body">
                <div className="lo-channel__meta">
                  <span className="hq-mono lo-channel__time">{item.atDisplay}</span>
                </div>
                <p className="lo-channel__summary">{item.summary}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="lo-channel__footer"
        onClick={() => {
          window.location.hash = "ops-activity";
        }}
      >
        See all activity →
      </button>
    </aside>
  );
}
