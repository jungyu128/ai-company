"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { BuilderHqSnapshot } from "@/services/builder/hq.service";
import { CeoAdvisorPanel } from "@/features/builder/components/ceo-advisor-panel";
import { CeoMissionInput } from "@/features/builder/components/ceo-mission-input";

const LAST_VISIT_KEY = "ai-company-hq-last-visit";

type Props = { initial: BuilderHqSnapshot };

function StatePill({ state }: { state: string }) {
  const busy = ["Working", "Assigned", "Waiting", "Reviewing"].includes(state);
  return (
    <span
      className={`hq-mono rounded-full px-2 py-0.5 text-[11px] ${
        busy
          ? "bg-[var(--hq-signal-soft)] text-[var(--hq-signal)]"
          : "bg-[var(--hq-line)]/50 text-[var(--hq-muted)]"
      }`}
    >
      {state}
    </span>
  );
}

export function AiCompanyHqDashboard({ initial }: Props) {
  const [hq, setHq] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback((lastVisit?: string | null) => {
    startTransition(async () => {
      try {
        const stored =
          lastVisit === undefined
            ? typeof window !== "undefined"
              ? window.localStorage.getItem(LAST_VISIT_KEY)
              : null
            : lastVisit;
        const qs = stored ? `?lastVisit=${encodeURIComponent(stored)}` : "";
        const res = await fetch(`/api/builder/hq${qs}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Refresh failed");
          return;
        }
        setHq(data.hq);
        setError(null);
        if (typeof window !== "undefined") {
          window.localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
        }
      } catch {
        setError("Network error refreshing HQ");
      }
    });
  }, []);

  useEffect(() => {
    const previous =
      typeof window !== "undefined" ? window.localStorage.getItem(LAST_VISIT_KEY) : null;
    refresh(previous);
    const id = setInterval(() => refresh(), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const h = hq.engineeringHealth;

  return (
    <div className="space-y-12">
      {hq.ceoAdvisor ? <CeoAdvisorPanel advisor={hq.ceoAdvisor} /> : null}

      <CeoMissionInput
        onMissionCreated={(next) => {
          setHq(next);
          setError(null);
        }}
      />

      <section className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-muted)] uppercase">
            What is the company doing right now?
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">
            {hq.currentTask
              ? hq.currentTask.title
              : "No active builder task"}
          </h2>
          <dl className="mt-6 space-y-3 text-sm">
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-[var(--hq-line)]/70 py-2">
              <dt className="w-36 text-[var(--hq-muted)]">Current Sprint</dt>
              <dd className="flex-1 font-medium">
                {hq.sprint ? (
                  <>
                    <span className="hq-mono text-[var(--hq-signal)]">{hq.sprint.id}</span>
                    {" — "}
                    {hq.sprint.name}
                    <span className="mt-1 block text-[var(--hq-muted)] font-normal">
                      {hq.sprint.goal}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-[var(--hq-line)]/70 py-2">
              <dt className="w-36 text-[var(--hq-muted)]">Active Agent</dt>
              <dd className="font-medium">{hq.activeAgent}</dd>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-[var(--hq-line)]/70 py-2">
              <dt className="w-36 text-[var(--hq-muted)]">Current Task</dt>
              <dd className="font-medium">
                {hq.currentTask ? (
                  <>
                    <span className="hq-mono">{hq.currentTask.id}</span>
                    <span className="ml-2 rounded bg-[var(--hq-warn-soft)] px-2 py-0.5 text-xs text-[var(--hq-warn)]">
                      {hq.currentTask.status}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-5 text-sm text-[var(--hq-muted)]">
            <span className="font-medium text-[var(--hq-ink)]">Next mission: </span>
            {hq.recommendedNextMission}
          </p>
        </div>

        <aside className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-6 shadow-[0_20px_50px_-40px_rgba(18,21,28,0.45)]">
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-warn)] uppercase">
            What requires my approval?
          </p>
          {hq.pendingCeoApprovals.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--hq-muted)]">No pending CEO gates.</p>
          ) : (
            <ul className="mt-4 space-y-4">
              {hq.pendingCeoApprovals.map((a) => (
                <li key={a.id}>
                  <p className="font-medium">{a.title}</p>
                  <p className="hq-mono mt-1 text-xs text-[var(--hq-muted)]">{a.id}</p>
                  <p className="mt-2 rounded-lg bg-[var(--hq-ink)] px-3 py-2 font-mono text-xs text-[var(--hq-paper)]">
                    {a.phrase}
                  </p>
                  <p className="hq-mono mt-1 text-[10px] text-[var(--hq-muted)]">
                    Before code: Approve {a.id} proposal only
                  </p>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => refresh()}
            disabled={pending}
            className="mt-6 w-full rounded-xl border border-[var(--hq-line)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--hq-ink)] transition hover:border-[var(--hq-signal)] hover:text-[var(--hq-signal)] disabled:opacity-60"
          >
            {pending ? "Refreshing…" : "Refresh headquarters"}
          </button>
          {error ? <p className="mt-2 text-xs text-[var(--hq-warn)]">{error}</p> : null}
          <p className="hq-mono mt-3 text-[10px] text-[var(--hq-muted)]">
            Updated {hq.generatedAtDisplay}
          </p>
        </aside>
      </section>

      {/* Engineering health — one job */}
      <section>
        <h3 className="text-lg font-semibold tracking-tight">Engineering Health</h3>
        <p className="mt-1 text-sm text-[var(--hq-muted)]">{h.note}</p>
        <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            ["Waiting CEO", h.waitingCeo],
            ["Blocked", h.blocked],
            ["Open debt", h.openDebt],
            ["Improvements", h.openImprovements],
          ].map(([label, value]) => (
            <div key={String(label)} className="border-t-2 border-[var(--hq-signal)] pt-3">
              <p className="text-3xl font-semibold tabular-nums">{value}</p>
              <p className="mt-1 text-xs text-[var(--hq-muted)]">{label}</p>
            </div>
          ))}
        </div>
        {hq.blockedItems.length > 0 ? (
          <ul className="mt-4 space-y-1 text-sm text-[var(--hq-warn)]">
            {hq.blockedItems.map((b) => (
              <li key={b}>Blocked: {b}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Team status */}
      <section>
        <h3 className="text-lg font-semibold tracking-tight">Team Status</h3>
        <p className="mt-1 text-sm text-[var(--hq-muted)]">
          Builder Runtime agent pool — not WorkPilot product employees.
        </p>
        <ul className="mt-5 divide-y divide-[var(--hq-line)]/80 border-y border-[var(--hq-line)]/80">
          {hq.teamStatus.length === 0 ? (
            <li className="py-3 text-sm text-[var(--hq-muted)]">No agent files found.</li>
          ) : (
            hq.teamStatus.map((a) => (
              <li key={a.role} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="font-medium">{a.role}</span>
                <span className="flex items-center gap-3">
                  {a.currentTask ? (
                    <span className="hq-mono text-xs text-[var(--hq-muted)]">{a.currentTask}</span>
                  ) : null}
                  <StatePill state={a.state} />
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <div className="grid gap-10 lg:grid-cols-2">
        <section>
          <h3 className="text-lg font-semibold tracking-tight">Recent Decisions</h3>
          <ul className="mt-4 space-y-4">
            {hq.recentDecisions.length === 0 ? (
              <li className="text-sm text-[var(--hq-muted)]">No decisions recorded.</li>
            ) : (
              hq.recentDecisions.map((d) => (
                <li key={d.id} className="border-l-2 border-[var(--hq-signal)] pl-4">
                  <p className="hq-mono text-xs text-[var(--hq-muted)]">
                    {d.id} · {d.date} · {d.decidedBy}
                  </p>
                  <p className="mt-1 text-sm">{d.summary}</p>
                </li>
              ))
            )}
          </ul>
        </section>

        <section>
          <h3 className="text-lg font-semibold tracking-tight">Release History</h3>
          <ul className="mt-4 space-y-3">
            {(hq.releaseHistory.length ? hq.releaseHistory : hq.latestRelease ? [hq.latestRelease] : [])
              .length === 0 ? (
              <li className="text-sm text-[var(--hq-muted)]">No releases yet.</li>
            ) : (
              (hq.releaseHistory.length ? hq.releaseHistory : [hq.latestRelease!]).map((r) => (
                <li key={r.id} className="flex justify-between gap-3 text-sm">
                  <span>
                    <span className="hq-mono text-[var(--hq-signal)]">{r.id}</span>
                    <span className="mt-0.5 block">{r.title}</span>
                  </span>
                  <span className="hq-mono shrink-0 text-xs text-[var(--hq-muted)]">{r.date}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* Live activity */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold tracking-tight">Live Activity Feed</h3>
          <span className="inline-flex items-center gap-2 text-xs text-[var(--hq-live)]">
            <span className="hq-live-dot h-1.5 w-1.5 rounded-full bg-[var(--hq-live)]" />
            Audit log
          </span>
        </div>
        <ul className="mt-4 space-y-0">
          {hq.activityFeed.length === 0 ? (
            <li className="text-sm text-[var(--hq-muted)]">No audit events.</li>
          ) : (
            hq.activityFeed.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 border-b border-[var(--hq-line)]/60 py-3 text-sm last:border-0"
              >
                <span className="hq-mono text-[11px] text-[var(--hq-muted)] whitespace-nowrap">
                  {e.timestamp.slice(0, 19).replace("T", " ")}
                </span>
                <div>
                  <p>
                    <span className="font-medium">{e.action}</span>
                    <span className="text-[var(--hq-muted)]"> · {e.actorId}</span>
                    {e.taskId ? (
                      <span className="hq-mono ml-2 text-xs text-[var(--hq-signal)]">{e.taskId}</span>
                    ) : null}
                  </p>
                  {e.rationale ? (
                    <p className="mt-0.5 text-xs text-[var(--hq-muted)] line-clamp-2">{e.rationale}</p>
                  ) : null}
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <footer className="border-t border-[var(--hq-line)] pt-6 text-xs text-[var(--hq-muted)]">
        CEO Advisor is the first briefing on entry. Panels below are evidence. After approval
        phrases in Cursor, continue the existing Builder Runtime — no Stage 6.
      </footer>
    </div>
  );
}
