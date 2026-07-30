"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ConnectionStatus, ExecutionRecord } from "@/services/builder/execution/types";

type Props = {
  pending: ExecutionRecord[];
  history: ExecutionRecord[];
  connections: ConnectionStatus[];
};

export function ExecutionCenterPanel({ pending, history, connections }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function decide(id: string, decision: "approve" | "reject") {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch("/api/builder/hq/executions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ executionId: id, decision }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update execution");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error while updating execution");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
          External systems
        </p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight">Connection status</h3>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {connections.map((c) => (
            <li key={c.system} className="rounded-xl bg-white px-3 py-3 text-sm">
              <p className="font-medium capitalize">{c.system.replace(/_/g, " ")}</p>
              <p
                className={`mt-1 text-xs ${c.connected ? "text-[var(--hq-signal)]" : "text-[var(--hq-warn)]"}`}
              >
                {c.connected ? "Connected" : "Disconnected"}
              </p>
              {!c.connected && c.reason ? (
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--hq-muted)]">{c.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-warn)] uppercase">
              Execution approvals
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight">
              External writes awaiting CEO
            </h3>
            <p className="mt-1 text-sm text-[var(--hq-muted)]">
              Emails, calendar changes, document shares, and CRM updates never run without approval.
            </p>
          </div>
          <span className="rounded-full bg-[var(--hq-warn-soft)] px-3 py-1 text-xs text-[var(--hq-warn)]">
            {pending.length} pending
          </span>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-sm text-[var(--hq-warn)]">
            {error}
          </p>
        ) : null}

        {pending.length === 0 ? (
          <p className="mt-6 text-sm text-[var(--hq-muted)]">No execution previews waiting.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {pending.map((item) => {
              const busy = pendingId === item.id || isPending;
              return (
                <li key={item.id} className="rounded-xl border border-[var(--hq-line)]/80 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{item.requestedAction}</p>
                      <p className="mt-1 text-xs text-[var(--hq-muted)]">
                        {item.employeeName} · {item.system.replace(/_/g, " ")} · {item.action}
                      </p>
                    </div>
                    <span className="text-[11px] capitalize text-[var(--hq-warn)]">{item.status}</span>
                  </div>
                  <p className="mt-3 text-sm">{item.preview.summary}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(item.id, "approve")}
                      className="rounded-lg bg-[var(--hq-signal)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      Approve & execute
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(item.id, "reject")}
                      className="rounded-lg border border-[var(--hq-warn)]/40 bg-[var(--hq-warn-soft)] px-3 py-2 text-sm text-[var(--hq-warn)] disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ExecutionHistoryList records={history} title="Recent executions" />
    </section>
  );
}

export function ExecutionHistoryList({
  records,
  title = "Execution history",
}: {
  records: ExecutionRecord[];
  title?: string;
}) {
  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <h3 className="text-lg font-semibold">{title}</h3>
      {records.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--hq-muted)]">No executions recorded yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {records.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-[var(--hq-line)]/70 bg-white px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{r.requestedAction}</p>
                <span className="text-[11px] capitalize text-[var(--hq-muted)]">{r.status}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--hq-muted)]">
                {r.employeeName} · {r.system.replace(/_/g, " ")}
                {r.externalReference ? ` · ref ${r.externalReference}` : ""}
              </p>
              {r.verificationResult ? (
                <p className="mt-1 text-xs text-[var(--hq-signal)]">{r.verificationResult}</p>
              ) : null}
              {r.errorDetails ? (
                <p className="mt-1 text-xs text-[var(--hq-warn)]">{r.errorDetails}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
