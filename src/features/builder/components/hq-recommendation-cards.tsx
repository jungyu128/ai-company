"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";

function delayUntilIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

type Props = {
  recommendations: EmployeeRecommendation[];
  selectedEmployeeId?: string | null;
  onSelectEmployee?: (employeeId: string) => void;
};

export function HqRecommendationCards({
  recommendations,
  selectedEmployeeId = null,
  onSelectEmployee,
}: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reassignById, setReassignById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const seen = useRef<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const booted = useRef(false);

  const pending = recommendations.filter(
    (r) => r.status === "pending" || r.status === "questioned"
  );

  const pendingKey = pending.map((r) => r.id).join("|");

  useEffect(() => {
    const ids = pendingKey ? pendingKey.split("|") : [];
    const nextFresh = new Set<string>();
    for (const id of ids) {
      if (booted.current && !seen.current.has(id)) nextFresh.add(id);
      seen.current.add(id);
    }
    booted.current = true;
    if (nextFresh.size === 0) return;
    setFresh(nextFresh);
    const t = window.setTimeout(() => setFresh(new Set()), 1100);
    return () => window.clearTimeout(t);
  }, [pendingKey]);

  async function decide(
    id: string,
    action: "approve" | "reject" | "ask" | "delay" | "reassign"
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
          note: null,
          reassignToEmployeeId:
            action === "reassign" ? reassignById[id] || null : null,
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
    <section className="hq-recs" aria-label="AI recommendations">
      <div className="hq-recs__head">
        <div>
          <p className="hq-recs__eyebrow">AI Recommendations</p>
          <h3 className="hq-recs__title">Decision cards</h3>
        </div>
        <span className="hq-recs__count">{pending.length} open</span>
      </div>

      {error ? <p className="hq-recs__error">{error}</p> : null}

      {pending.length === 0 ? (
        <p className="hq-recs__empty">No open recommendations.</p>
      ) : (
        <ul className="hq-recs__list">
          {pending.slice(0, 2).map((rec) => {
            const owner =
              rec.conversationOwnerId ??
              rec.leadEmployeeId ??
              rec.participatingEmployees[0]?.id ??
              null;
            const related =
              !!selectedEmployeeId &&
              (rec.conversationOwnerId === selectedEmployeeId ||
                rec.leadEmployeeId === selectedEmployeeId ||
                rec.participatingEmployees.some((p) => p.id === selectedEmployeeId));
            const busy = pendingId === rec.id || isPending;
            const ownerName =
              rec.participatingEmployees.find((p) => p.id === owner)?.name ??
              rec.participatingEmployees[0]?.name ??
              "Team";

            return (
              <li
                key={rec.id}
                className={[
                  "hq-rec",
                  related ? "hq-rec--active" : "",
                  fresh.has(rec.id) ? "hq-rec--enter" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <button
                  type="button"
                  className="hq-rec__select"
                  onClick={() => {
                    if (owner && onSelectEmployee) onSelectEmployee(owner);
                  }}
                >
                  <div className="hq-rec__title-row">
                    <p className="hq-rec__title">{rec.title}</p>
                    <span className="hq-rec__confidence">{rec.confidence}%</span>
                  </div>
                  <p className="hq-rec__body">{rec.recommendation}</p>
                  <div className="hq-rec__meta">
                    <span>{rec.priority ?? "Medium"}</span>
                    <span>{rec.urgency ?? "This Week"}</span>
                    <span>{ownerName}</span>
                  </div>
                </button>

                <label className="hq-rec__reassign">
                  Reassign
                  <select
                    value={reassignById[rec.id] ?? ""}
                    onChange={(e) =>
                      setReassignById((prev) => ({
                        ...prev,
                        [rec.id]: e.target.value,
                      }))
                    }
                    disabled={busy}
                  >
                    <option value="">Select…</option>
                    {AI_COMPANY_EMPLOYEES.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="hq-rec__actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "approve")}
                    className="lo-btn lo-btn--primary"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "ask")}
                    className="lo-btn lo-btn--ghost"
                  >
                    Ask questions
                  </button>
                  <button
                    type="button"
                    disabled={busy || !reassignById[rec.id]}
                    onClick={() => void decide(rec.id, "reassign")}
                    className="lo-btn lo-btn--ghost"
                  >
                    Reassign
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "delay")}
                    className="lo-btn lo-btn--ghost"
                  >
                    Delay
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(rec.id, "reject")}
                    className="lo-btn lo-btn--danger"
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
