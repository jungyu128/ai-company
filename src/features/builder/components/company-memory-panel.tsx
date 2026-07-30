"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CompanyMemory } from "@/services/builder/memory/types";

type Props = {
  learnedPreferences: CompanyMemory[];
  newInsights: CompanyMemory[];
  recentlyUpdated: CompanyMemory[];
  lastLearnedAt: string | null;
};

export function CompanyMemoryPanel({
  learnedPreferences,
  newInsights,
  recentlyUpdated,
  lastLearnedAt,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function act(
    action: "accept" | "ignore" | "remove" | "reset",
    memoryId?: string
  ) {
    setError(null);
    setPendingId(memoryId ?? "reset");
    try {
      const res = await fetch("/api/builder/hq/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          action === "reset" ? { action: "reset" } : { action, memoryId }
        ),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update memory");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error while updating memory");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Company Memory
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              Continuous learning
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">
              Insights from completed missions, approvals, and verified executions. They improve
              future recommendations only — never skip your approval.
            </p>
          </div>
          <button
            type="button"
            disabled={isPending}
            onClick={() => void act("reset")}
            className="rounded-xl border border-[var(--hq-warn)]/40 bg-[var(--hq-warn-soft)] px-4 py-2.5 text-sm text-[var(--hq-warn)] disabled:opacity-50"
          >
            {pendingId === "reset" ? "Resetting…" : "Reset memories"}
          </button>
        </div>
        {lastLearnedAt ? (
          <p className="mt-3 text-xs text-[var(--hq-muted)]">
            Last learned · {lastLearnedAt.slice(0, 16).replace("T", " ")}
          </p>
        ) : (
          <p className="mt-3 text-xs text-[var(--hq-muted)]">
            No learning pass yet — complete a workday to generate insights.
          </p>
        )}
        {error ? (
          <p className="mt-4 rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-sm text-[var(--hq-warn)]">
            {error}
          </p>
        ) : null}
      </div>

      <MemoryGroup
        title="New insights"
        empty="No pending insights."
        items={newInsights}
        pendingId={pendingId}
        onAct={act}
        showActions
      />
      <MemoryGroup
        title="Learned preferences"
        empty="No accepted preferences yet."
        items={learnedPreferences}
        pendingId={pendingId}
        onAct={act}
        showActions
      />
      <MemoryGroup
        title="Recently updated"
        empty="No memories yet."
        items={recentlyUpdated}
        pendingId={pendingId}
        onAct={act}
        showActions={false}
      />
    </section>
  );
}

function MemoryGroup({
  title,
  empty,
  items,
  pendingId,
  onAct,
  showActions,
}: {
  title: string;
  empty: string;
  items: CompanyMemory[];
  pendingId: string | null;
  onAct: (action: "accept" | "ignore" | "remove", memoryId: string) => void;
  showActions: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <h4 className="text-lg font-semibold">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--hq-muted)]">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((m) => {
            const busy = pendingId === m.id;
            return (
              <li
                key={m.id}
                className="rounded-xl border border-[var(--hq-line)]/70 bg-white px-4 py-3 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{m.title}</p>
                    <p className="mt-1 text-xs capitalize text-[var(--hq-muted)]">
                      {m.kind.replace(/_/g, " ")} · confidence {m.confidence}% · evidence{" "}
                      {m.evidenceCount}
                    </p>
                  </div>
                  <span className="text-[11px] capitalize text-[var(--hq-muted)]">
                    {m.ceoStatus}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--hq-muted)]">{m.insight}</p>
                <p className="mt-1 text-[11px] text-[var(--hq-muted)]">
                  Updated {m.lastUpdated.slice(0, 10)} · sources {m.sourceRefs.length}
                </p>
                {showActions ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.ceoStatus === "pending" ? (
                      <>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAct("accept", m.id)}
                          className="rounded-lg bg-[var(--hq-signal)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onAct("ignore", m.id)}
                          className="rounded-lg border border-[var(--hq-line)] bg-white px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          Ignore
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onAct("remove", m.id)}
                      className="rounded-lg border border-[var(--hq-warn)]/40 bg-[var(--hq-warn-soft)] px-3 py-1.5 text-xs text-[var(--hq-warn)] disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
