"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";

function delayUntilIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

type Props = {
  employee: LiveOfficeEmployeeView | null;
  workspaceId: string;
  relatedRecommendation?: EmployeeRecommendation | null;
};

export function LiveOfficeConversationPanel({
  employee,
  workspaceId,
  relatedRecommendation = null,
}: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [swap, setSwap] = useState(false);

  useEffect(() => {
    setNote("");
    setReassignTo("");
    setError(null);
    setSwap(true);
    const t = window.setTimeout(() => setSwap(false), 320);
    return () => window.clearTimeout(t);
  }, [employee?.id]);

  async function decide(action: "approve" | "reject" | "ask" | "reassign" | "delay") {
    if (!relatedRecommendation) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/builder/hq/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendationId: relatedRecommendation.id,
          action,
          note: note.trim() || null,
          reassignToEmployeeId: action === "reassign" ? reassignTo || null : null,
          delayUntil: action === "delay" ? delayUntilIso(24) : null,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update recommendation");
        return;
      }
      setNote("");
      startTransition(() => router.refresh());
    } catch {
      setError("Network error while updating recommendation");
    } finally {
      setBusy(false);
    }
  }

  const locked = busy || isPending;

  return (
    <aside className="lo-conversation" aria-label="Employee conversation">
      <div className="lo-conversation__head">
        <div className="min-w-0">
          <p className="lo-conversation__eyebrow">Conversation</p>
          <h3 className="lo-conversation__title">
            {employee ? employee.name : "Floor channel"}
          </h3>
          <p className="lo-conversation__sub">
            {employee
              ? `${employee.role} · ${employee.visualLabel}`
              : "Select a desk to open conversation"}
          </p>
        </div>
        {employee ? (
          <span
            className="lo-conversation__avatar"
            style={{ backgroundColor: employee.avatar.hue }}
          >
            {employee.avatar.initials}
          </span>
        ) : null}
      </div>

      <div
        key={employee?.id ?? "none"}
        className={`lo-conversation__body-wrap${swap ? " lo-conversation__body-wrap--swap" : ""}`}
      >
      {employee ? (
        <>
          {employee.conversationPreview.length === 0 ? (
            <p className="lo-conversation__empty">
              No live conversation turns for this desk yet.
            </p>
          ) : (
            <ul className="lo-conversation__list">
              {employee.conversationPreview.slice(-4).map((t) => (
                <li key={t.id} className="lo-conversation__turn">
                  <p className="lo-conversation__speaker">{t.speaker}</p>
                  <p className="lo-conversation__body">{t.body}</p>
                </li>
              ))}
            </ul>
          )}

          {relatedRecommendation ? (
            <div className="lo-conversation__actions">
              <p className="lo-conversation__rec-title">{relatedRecommendation.title}</p>
              {error ? <p className="lo-conversation__error">{error}</p> : null}
              <label className="lo-conversation__reassign">
                Reassign to
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  disabled={locked}
                >
                  <option value="">Select employee…</option>
                  {AI_COMPANY_EMPLOYEES.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} · {e.role}
                    </option>
                  ))}
                </select>
              </label>
              <div className="lo-conversation__btns">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => void decide("approve")}
                  className="lo-btn lo-btn--primary"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => void decide("ask")}
                  className="lo-btn lo-btn--ghost"
                >
                  Ask questions
                </button>
                <button
                  type="button"
                  disabled={locked || !reassignTo}
                  onClick={() => void decide("reassign")}
                  className="lo-btn lo-btn--ghost"
                >
                  Reassign
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => void decide("delay")}
                  className="lo-btn lo-btn--ghost"
                >
                  Delay
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => void decide("reject")}
                  className="lo-btn lo-btn--danger"
                >
                  Reject
                </button>
              </div>
            </div>
          ) : null}

          <div className="lo-conversation__composer">
            <input
              className="lo-conversation__input"
              placeholder="Ask a follow-up question…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={locked || !relatedRecommendation}
            />
            <button
              type="button"
              className="lo-btn lo-btn--send"
              disabled={locked || !relatedRecommendation || !note.trim()}
              onClick={() => void decide("ask")}
            >
              Send
            </button>
          </div>

          <Link
            href={`/builder/hq/employees/${employee.id}?workspaceId=${encodeURIComponent(workspaceId)}`}
            className="lo-conversation__profile"
          >
            Open full profile →
          </Link>
        </>
      ) : (
        <p className="lo-conversation__empty">
          Click any desk in the office to talk with that employee.
        </p>
      )}
      </div>
    </aside>
  );
}
