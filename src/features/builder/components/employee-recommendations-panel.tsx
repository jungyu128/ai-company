"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";
import { EmployeeConversationTimeline } from "@/features/builder/components/employee-conversation-timeline";

function delayUntilIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

type Props = {
  recommendations: EmployeeRecommendation[];
};

export function EmployeeRecommendationsPanel({ recommendations }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [reassignById, setReassignById] = useState<Record<string, string>>({});
  const [expandedTalkId, setExpandedTalkId] = useState<string | null>(null);
  const [expandedMetaId, setExpandedMetaId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const pending = recommendations.filter((r) => r.status === "pending" || r.status === "questioned");

  async function decide(
    id: string,
    action: "approve" | "reject" | "ask" | "reassign" | "delay"
  ) {
    setError(null);
    setPendingId(id);
    try {
      const res = await fetch("/api/builder/hq/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId: id,
          action,
          note: noteById[id]?.trim() || null,
          reassignToEmployeeId: action === "reassign" ? reassignById[id] || null : null,
          delayUntil: action === "delay" ? delayUntilIso(24) : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update recommendation");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error while updating recommendation");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            AI Recommendations
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">Decision cards</h3>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            Compact packages from internal employee discussion — expand only when you need depth.
          </p>
        </div>
        <span className="rounded-full bg-[var(--hq-signal-soft)] px-3 py-1 text-xs font-medium text-[var(--hq-signal)]">
          {pending.length} open
        </span>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-sm text-[var(--hq-warn)]">
          {error}
        </p>
      ) : null}

      {pending.length === 0 ? (
        <p className="mt-6 text-sm text-[var(--hq-muted)]">No open recommendations.</p>
      ) : (
        <ul className="mt-6 grid gap-4 lg:grid-cols-2">
          {pending.slice(0, 6).map((rec) => {
            const busy = pendingId === rec.id || isPending;
            const talkOpen = expandedTalkId === rec.id;
            const metaOpen = expandedMetaId === rec.id;
            const turnCount = rec.internalDiscussion.length;

            return (
              <li
                key={rec.id}
                className="flex flex-col rounded-2xl border border-[var(--hq-line)]/80 bg-white p-4 shadow-[0_18px_40px_-36px_rgba(18,21,28,0.45)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold tracking-tight">{rec.title}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-snug text-[var(--hq-ink)]">
                      {rec.recommendation}
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--hq-signal-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--hq-signal)]">
                    {rec.confidence}%
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-[var(--hq-panel)] px-2.5 py-1 text-[11px] text-[var(--hq-muted)]">
                    {rec.priority ?? "Medium"}
                  </span>
                  <span className="rounded-full bg-[var(--hq-panel)] px-2.5 py-1 text-[11px] text-[var(--hq-muted)]">
                    {rec.urgency ?? "This Week"}
                  </span>
                  <span className="rounded-full bg-[var(--hq-panel)] px-2.5 py-1 text-[11px] text-[var(--hq-muted)]">
                    {rec.participatingEmployees.map((p) => p.name).join(" · ")}
                  </span>
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-[var(--hq-muted)]">
                  {rec.expectedImpact}
                </p>

                <button
                  type="button"
                  className="mt-3 self-start text-xs font-medium text-[var(--hq-signal)] underline-offset-2 hover:underline"
                  onClick={() =>
                    setExpandedMetaId((prev) => (prev === rec.id ? null : rec.id))
                  }
                >
                  {metaOpen ? "Hide details" : "Show details"}
                </button>

                {metaOpen ? (
                  <div className="mt-3 space-y-1.5 rounded-xl bg-[var(--hq-panel)] px-3 py-3 text-xs leading-relaxed text-[var(--hq-muted)]">
                    <p>{rec.reasoning}</p>
                    {rec.expectedImpactStructured ? (
                      <p>
                        Impact · Ops {rec.expectedImpactStructured.operational} · Rev{" "}
                        {rec.expectedImpactStructured.revenue} · Cust{" "}
                        {rec.expectedImpactStructured.customer} · Prod{" "}
                        {rec.expectedImpactStructured.productivity} · Risk↓{" "}
                        {rec.expectedImpactStructured.riskReduction}
                      </p>
                    ) : null}
                    {rec.dependencies && rec.dependencies.length > 0 ? (
                      <p>Dependencies: {rec.dependencies.join(" → ")}</p>
                    ) : null}
                    {rec.risks ? <p>Risks: {rec.risks}</p> : null}
                    {rec.evidenceSummary ? (
                      <p>
                        Evidence: {rec.evidenceSummary.statement}
                        {rec.evidenceSummary.caveats[0]
                          ? ` ${rec.evidenceSummary.caveats[0]}`
                          : ""}
                      </p>
                    ) : null}
                    <p>{rec.confidenceReason ?? `${rec.confidence}% confidence`}</p>
                  </div>
                ) : null}

                <div className="mt-4 border-t border-[var(--hq-line)]/60 pt-3">
                  {talkOpen ? (
                    <div className="space-y-3">
                      <EmployeeConversationTimeline
                        turns={rec.internalDiscussion}
                        title="Internal discussion"
                      />
                      <button
                        type="button"
                        className="text-xs font-medium text-[var(--hq-muted)] underline-offset-2 hover:underline"
                        onClick={() => setExpandedTalkId(null)}
                      >
                        Collapse conversation
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg border border-[var(--hq-line)] bg-[var(--hq-panel)] px-3 py-2 text-xs font-medium text-[var(--hq-ink)]"
                      onClick={() => setExpandedTalkId(rec.id)}
                      disabled={turnCount === 0}
                    >
                      {turnCount === 0
                        ? "No conversation yet"
                        : `View Full Conversation (${turnCount})`}
                    </button>
                  )}
                </div>

                <label className="mt-4 block text-xs text-[var(--hq-muted)]">
                  Note / question (optional)
                  <textarea
                    className="mt-1 w-full rounded-lg border border-[var(--hq-line)] bg-[var(--hq-panel)] px-3 py-2 text-sm text-[var(--hq-ink)]"
                    rows={2}
                    value={noteById[rec.id] ?? ""}
                    onChange={(e) =>
                      setNoteById((prev) => ({ ...prev, [rec.id]: e.target.value }))
                    }
                    disabled={busy}
                  />
                </label>

                <label className="mt-3 block text-xs text-[var(--hq-muted)]">
                  Reassign to
                  <select
                    className="mt-1 w-full rounded-lg border border-[var(--hq-line)] bg-[var(--hq-panel)] px-3 py-2 text-sm"
                    value={reassignById[rec.id] ?? ""}
                    onChange={(e) =>
                      setReassignById((prev) => ({ ...prev, [rec.id]: e.target.value }))
                    }
                    disabled={busy}
                  >
                    <option value="">Select employee…</option>
                    {AI_COMPANY_EMPLOYEES.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.role}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-auto flex flex-wrap gap-2 pt-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "approve")}
                    className="rounded-lg bg-[var(--hq-signal)] px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "ask")}
                    className="rounded-lg border border-[var(--hq-line)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Ask questions
                  </button>
                  <button
                    type="button"
                    disabled={busy || !reassignById[rec.id]}
                    onClick={() => void decide(rec.id, "reassign")}
                    className="rounded-lg border border-[var(--hq-line)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Reassign
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "delay")}
                    className="rounded-lg border border-[var(--hq-line)] bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Delay
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "reject")}
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
