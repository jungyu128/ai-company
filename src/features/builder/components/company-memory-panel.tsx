"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { CompanyMemory } from "@/services/builder/memory/types";
import {
  applyInsightActionOptimistic,
  type InsightAction,
  type MemoryInsightSnapshot,
} from "@/features/builder/lib/company-memory-insight-actions";
import {
  buildInsightActionRequest,
  buildInsightActionUrl,
  fetchInsightDashboard,
  mergePropsWithAppliedDecisions,
  pruneAppliedDecisions,
  recordAppliedDecision,
  resolveInsightActionResult,
  snapshotFromDashboardPayload,
  type AppliedInsightDecision,
  type InsightActionApiResponse,
} from "@/features/builder/lib/company-memory-insight-client";

type Props = {
  learnedPreferences: CompanyMemory[];
  newInsights: CompanyMemory[];
  recentlyUpdated: CompanyMemory[];
  lastLearnedAt: string | null;
  workspaceId: string;
};

type ToastState = {
  tone: "success" | "error";
  message: string;
  retry?: { action: InsightAction | "reset"; memoryId?: string };
} | null;

export function CompanyMemoryPanel({
  learnedPreferences,
  newInsights,
  recentlyUpdated,
  lastLearnedAt,
  workspaceId,
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<InsightAction | "reset" | null>(
    null
  );
  const [, startTransition] = useTransition();
  const inFlight = useRef(false);
  const appliedRef = useRef<AppliedInsightDecision[]>([]);

  const [local, setLocal] = useState<MemoryInsightSnapshot>(() =>
    mergePropsWithAppliedDecisions(
      { newInsights, learnedPreferences, recentlyUpdated },
      []
    )
  );

  // Always prefer the live memory store — SSR props can lag behind in-memory runtime storage.
  useEffect(() => {
    if (inFlight.current || pendingId) return;
    let cancelled = false;
    void (async () => {
      const live = await fetchInsightDashboard(workspaceId);
      if (cancelled || inFlight.current) return;
      if (live) {
        appliedRef.current = pruneAppliedDecisions(appliedRef.current, live);
        setLocal(mergePropsWithAppliedDecisions(live, appliedRef.current));
        return;
      }
      // Fallback to SSR only when GET fails
      const propsSnap = { newInsights, learnedPreferences, recentlyUpdated };
      appliedRef.current = pruneAppliedDecisions(appliedRef.current, propsSnap);
      setLocal(mergePropsWithAppliedDecisions(propsSnap, appliedRef.current));
    })();
    return () => {
      cancelled = true;
    };
  }, [
    workspaceId,
    pendingId,
    newInsights,
    learnedPreferences,
    recentlyUpdated,
  ]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const act = useCallback(
    async (action: InsightAction | "reset", memoryId?: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setToast(null);

      const previous = local;
      const targetId = memoryId ?? "reset";
      setPendingId(targetId);
      setPendingAction(action);

      let optimistic = previous;
      if (action !== "reset" && memoryId) {
        optimistic = applyInsightActionOptimistic(previous, memoryId, action);
        // Immediate Pending removal — no page refresh required
        setLocal(optimistic);
      } else if (action === "reset") {
        optimistic = {
          newInsights: [],
          learnedPreferences: [],
          recentlyUpdated: [],
        };
        setLocal(optimistic);
      }

      try {
        const res = await fetch(buildInsightActionUrl(workspaceId), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-ai-company-workspace": workspaceId,
          },
          body: JSON.stringify(
            buildInsightActionRequest(action, memoryId, workspaceId)
          ),
        });
        const data = (await res.json()) as InsightActionApiResponse & {
          code?: string;
        };
        const resolved = resolveInsightActionResult({
          previous,
          optimistic,
          response: data,
          ok: res.ok,
        });

        if (resolved.rolledBack) {
          // Stale SSR IDs → resync from store so the CEO sees current Pending.
          const live = await fetchInsightDashboard(workspaceId);
          if (live) {
            appliedRef.current = pruneAppliedDecisions(appliedRef.current, live);
            setLocal(mergePropsWithAppliedDecisions(live, appliedRef.current));
          } else {
            setLocal(resolved.snapshot);
          }
          const stale =
            data.code === "NOT_FOUND" ||
            /not found/i.test(data.error ?? "");
          setToast({
            tone: "error",
            message: stale
              ? "Insight list was out of date — refreshed. Try again."
              : data.error ?? "Could not update insight",
            retry: stale ? undefined : { action, memoryId },
          });
          return;
        }

        setLocal(
          data.dashboard
            ? snapshotFromDashboardPayload(data.dashboard)
            : resolved.snapshot
        );

        if (action === "reset") {
          appliedRef.current = [];
        } else if (memoryId) {
          appliedRef.current = recordAppliedDecision(
            appliedRef.current,
            memoryId,
            action
          );
        }

        const successMsg =
          action === "accept"
            ? "Insight accepted — removed from Pending, learning updated"
            : action === "ignore"
              ? "Insight ignored — recorded in analytics and audit"
              : action === "remove"
                ? "Insight removed permanently"
                : "Memories reset";
        setToast({ tone: "success", message: successMsg });

        // Refresh Timeline / Audit / Learning / OC from stored state (non-blocking)
        startTransition(() => {
          router.refresh();
        });
      } catch {
        setLocal(previous);
        setToast({
          tone: "error",
          message: "Network error while updating insight",
          retry: { action, memoryId },
        });
      } finally {
        inFlight.current = false;
        setPendingId(null);
        setPendingAction(null);
      }
    },
    [local, router, workspaceId]
  );

  const busy = pendingId != null;

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
            disabled={busy}
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
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            toast.tone === "success"
              ? "border-emerald-400/40 bg-emerald-50/80 text-emerald-900"
              : "border-[var(--hq-warn)]/40 bg-[var(--hq-warn-soft)] text-[var(--hq-warn)]"
          }`}
        >
          <span>{toast.message}</span>
          {toast.retry ? (
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-current/30 px-3 py-1 text-xs font-medium disabled:opacity-50"
              onClick={() => void act(toast.retry!.action, toast.retry!.memoryId)}
            >
              Retry
            </button>
          ) : null}
        </div>
      ) : null}

      <MemoryGroup
        title="New insights"
        empty="No pending insights."
        items={local.newInsights}
        pendingId={pendingId}
        pendingAction={pendingAction}
        busy={busy}
        onAct={act}
        showActions
      />
      <MemoryGroup
        title="Learned preferences"
        empty="No accepted preferences yet."
        items={local.learnedPreferences}
        pendingId={pendingId}
        pendingAction={pendingAction}
        busy={busy}
        onAct={act}
        showActions
      />
      <MemoryGroup
        title="Recently updated"
        empty="No memories yet."
        items={local.recentlyUpdated}
        pendingId={pendingId}
        pendingAction={pendingAction}
        busy={busy}
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
  pendingAction,
  busy,
  onAct,
  showActions,
}: {
  title: string;
  empty: string;
  items: CompanyMemory[];
  pendingId: string | null;
  pendingAction: InsightAction | "reset" | null;
  busy: boolean;
  onAct: (action: InsightAction, memoryId: string) => void;
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
            const rowBusy = pendingId === m.id;
            return (
              <li
                key={m.id}
                className={`rounded-xl border border-[var(--hq-line)]/70 bg-white px-4 py-3 text-sm ${
                  rowBusy ? "opacity-70" : ""
                }`}
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
                    {rowBusy ? "Saving…" : m.ceoStatus}
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
                          aria-busy={rowBusy && pendingAction === "accept"}
                          data-insight-id={m.id}
                          data-insight-action="accept"
                          onClick={() => onAct("accept", m.id)}
                          className="rounded-lg bg-[var(--hq-signal)] px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {rowBusy && pendingAction === "accept" ? "Accepting…" : "Accept"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-busy={rowBusy && pendingAction === "ignore"}
                          data-insight-id={m.id}
                          data-insight-action="ignore"
                          onClick={() => onAct("ignore", m.id)}
                          className="rounded-lg border border-[var(--hq-line)] bg-white px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {rowBusy && pendingAction === "ignore" ? "Ignoring…" : "Ignore"}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy}
                      aria-busy={rowBusy && pendingAction === "remove"}
                      data-insight-id={m.id}
                      data-insight-action="remove"
                      onClick={() => onAct("remove", m.id)}
                      className="rounded-lg border border-[var(--hq-warn)]/40 bg-[var(--hq-warn-soft)] px-3 py-1.5 text-xs text-[var(--hq-warn)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rowBusy && pendingAction === "remove" ? "Removing…" : "Remove"}
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
