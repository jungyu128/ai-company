"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CeoApprovalQueueItem } from "@/services/builder/ceo-approval-queue";

type Props = {
  items: CeoApprovalQueueItem[];
  protectedCount?: number;
};

const SOURCE_LABEL: Record<CeoApprovalQueueItem["source"], string> = {
  daily_ops_plan: "Daily plan",
  daily_ops_work_item: "Work item",
  protected_action: "Protected action",
  mission: "Mission",
};

export function CeoApprovalQueue({ items, protectedCount = 0 }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function decide(
    id: string,
    decision: "approve" | "reject" | "request_changes"
  ) {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch("/api/builder/hq/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queueItemId: id,
          decision,
          note: noteById[id]?.trim() || null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update approval");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error while updating approval");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-warn)] uppercase">
            CEO Approval Queue
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">
            Every pending approval
          </h3>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            Review employee, action, reason, impact, and risks — then approve,
            reject, or request changes. Protected actions never run before
            approval.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {protectedCount > 0 ? (
            <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-medium text-rose-800">
              {protectedCount} protected
            </span>
          ) : null}
          <span className="rounded-full bg-[var(--hq-warn-soft)] px-3 py-1 text-xs font-medium text-[var(--hq-warn)]">
            {items.length} pending
          </span>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-sm text-[var(--hq-warn)]">
          {error}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--hq-muted)]">No approvals waiting.</p>
      ) : (
        <ul className="mt-6 space-y-5">
          {items.map((item) => {
            const busy = pendingId === item.id || isPending;
            return (
              <li
                key={item.id}
                className={`rounded-xl border bg-white p-4 ${
                  item.isProtected
                    ? "border-rose-300/80"
                    : "border-[var(--hq-line)]/80"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--hq-muted)]">
                      {SOURCE_LABEL[item.source]}
                      {item.isProtected ? " · protected" : ""}
                      {" · "}
                      {item.createdAtDisplay}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] ${
                      item.isProtected
                        ? "bg-rose-100 text-rose-800"
                        : "bg-[var(--hq-warn-soft)] text-[var(--hq-warn)]"
                    }`}
                  >
                    Pending
                  </span>
                </div>

                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="hq-mono text-[10px] uppercase tracking-[0.14em] text-[var(--hq-muted)]">
                      Employee
                    </dt>
                    <dd className="mt-0.5 text-[var(--hq-ink)]">
                      {item.employee.name}
                      <span className="text-[var(--hq-muted)]">
                        {" "}
                        · {item.employee.role}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="hq-mono text-[10px] uppercase tracking-[0.14em] text-[var(--hq-muted)]">
                      Requested action
                    </dt>
                    <dd className="mt-0.5 text-[var(--hq-ink)]">
                      {item.requestedAction}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="hq-mono text-[10px] uppercase tracking-[0.14em] text-[var(--hq-muted)]">
                      Reason
                    </dt>
                    <dd className="mt-0.5 text-[var(--hq-ink)]">{item.reason}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="hq-mono text-[10px] uppercase tracking-[0.14em] text-[var(--hq-muted)]">
                      Expected impact
                    </dt>
                    <dd className="mt-0.5 text-[var(--hq-ink)]">
                      {item.expectedImpact}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="hq-mono text-[10px] uppercase tracking-[0.14em] text-[var(--hq-muted)]">
                      Risks
                    </dt>
                    <dd className="mt-0.5">
                      <ul className="list-disc space-y-1 pl-5 text-[var(--hq-ink)]">
                        {item.risks.map((risk) => (
                          <li key={risk}>{risk}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                </dl>

                <label className="mt-4 block text-xs text-[var(--hq-muted)]">
                  Note to employee
                  {` (required for Request Changes)`}
                  <textarea
                    className="mt-1 w-full rounded-lg border border-[var(--hq-line)] bg-[var(--hq-panel)] px-3 py-2 text-sm text-[var(--hq-ink)]"
                    rows={2}
                    value={noteById[item.id] ?? ""}
                    onChange={(e) =>
                      setNoteById((prev) => ({ ...prev, [item.id]: e.target.value }))
                    }
                    disabled={busy}
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(item.id, "approve")}
                    className="rounded-lg bg-[var(--hq-signal)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(item.id, "request_changes")}
                    className="rounded-lg border border-[var(--hq-line)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Request Changes
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(item.id, "reject")}
                    className="rounded-lg border border-[var(--hq-warn)]/40 bg-[var(--hq-warn-soft)] px-3 py-2 text-sm font-medium text-[var(--hq-warn)] disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
