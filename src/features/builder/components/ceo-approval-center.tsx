"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ApprovalCenterItem } from "@/services/builder/approval.service";
import { CollaborationChainView } from "@/features/builder/components/collaboration-chain";
import { EmployeeConversationTimeline } from "@/features/builder/components/employee-conversation-timeline";

type Props = {
  items: ApprovalCenterItem[];
};

export function CeoApprovalCenter({ items }: Props) {
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
          missionId: id,
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
            Approval Center
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">CEO decisions</h3>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            Review employee plans, then approve, reject, or request changes.
          </p>
        </div>
        <span className="rounded-full bg-[var(--hq-warn-soft)] px-3 py-1 text-xs font-medium text-[var(--hq-warn)]">
          {items.length} pending
        </span>
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
                className="rounded-xl border border-[var(--hq-line)]/80 bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-xs text-[var(--hq-muted)]">
                      Requested by {item.requestingEmployee.name} ·{" "}
                      {item.requestingEmployee.role}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--hq-warn-soft)] px-2.5 py-1 text-[11px] capitalize text-[var(--hq-warn)]">
                    {item.approvalStatus.replace(/_/g, " ")}
                  </span>
                </div>

                <p className="mt-3 text-sm text-[var(--hq-ink)]">{item.planSummary}</p>
                <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-[var(--hq-muted)]">
                  {item.planSteps.slice(0, 4).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>

                <div className="mt-4 border-t border-[var(--hq-line)]/60 pt-4">
                  <CollaborationChainView
                    mission={{
                      id: item.id,
                      title: item.title,
                      mission: item.mission,
                      leadEmployeeId: item.requestingEmployee.id,
                      chain: item.collaborationChain,
                      approvalStatus: item.approvalStatus,
                      planSummary: item.planSummary,
                      planSteps: item.planSteps,
                      createdAt: item.createdAt,
                      updatedAt: item.updatedAt,
                      ceoNote: item.ceoNote,
                      conversations: item.conversations,
                    }}
                    compact
                    showConversation={false}
                  />
                </div>

                {item.conversations.length > 0 ? (
                  <div className="mt-4 border-t border-[var(--hq-line)]/60 pt-4">
                    <EmployeeConversationTimeline turns={item.conversations} />
                  </div>
                ) : null}

                <label className="mt-4 block text-xs text-[var(--hq-muted)]">
                  Note to employee (optional)
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
                    Request changes
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
