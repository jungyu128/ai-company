"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { CeoDailyOpsPanel } from "@/services/builder/ceo/types";
import { DailyReportPanel } from "@/features/builder/components/daily-report-panel";

type Props = {
  initial: CeoDailyOpsPanel;
  workspaceId: string;
};

const STATUS_TONE: Record<string, string> = {
  PROPOSED: "text-[var(--hq-muted)]",
  AWAITING_APPROVAL: "text-[var(--hq-warn)]",
  APPROVED: "text-[var(--hq-signal)]",
  PLANNING: "text-sky-700",
  WORKING: "text-[var(--hq-live)]",
  REVIEWING: "text-indigo-700",
  QA: "text-violet-700",
  WAITING: "text-[var(--hq-warn)]",
  BLOCKED: "text-red-700",
  COMPLETED: "text-emerald-700",
  REJECTED: "text-red-800",
  CANCELLED: "text-[var(--hq-muted)]",
  DRAFT: "text-[var(--hq-muted)]",
  ANALYZING: "text-sky-700",
  PLAN_PROPOSED: "text-[var(--hq-warn)]",
  PARTIALLY_APPROVED: "text-[var(--hq-signal)]",
  EXECUTING: "text-[var(--hq-live)]",
};

export function DailyOperationsPanel({ initial, workspaceId }: Props) {
  const router = useRouter();
  const [panel, setPanel] = useState(initial);
  const [title, setTitle] = useState("");
  const [instruction, setInstruction] = useState("");
  const [outcome, setOutcome] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [changeNote, setChangeNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function post(action: string, extra?: Record<string, unknown>) {
    setError(null);
    setNote(null);
    const res = await fetch("/api/builder/hq/daily-ops", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-company-workspace": workspaceId,
      },
      body: JSON.stringify({ action, workspaceId, ...extra }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      message?: string;
      dailyOps?: CeoDailyOpsPanel;
    };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Daily ops action failed");
      return;
    }
    if (data.dailyOps) setPanel(data.dailyOps);
    if (data.message) setNote(data.message);
    startTransition(() => router.refresh());
  }

  const d = panel.directive;
  const plan = panel.plan;
  const ws = panel.workSummary;

  return (
    <div
      id="ops-daily"
      className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            Daily Directive
          </p>
          <h4 className="mt-1 text-lg font-semibold">One company-wide instruction</h4>
          <p className="mt-1 max-w-2xl text-sm text-[var(--hq-muted)]">
            Do not assign employees yourself. Submit one directive — the company analyzes it,
            builds an execution plan, assigns permanent roles automatically, and returns the plan
            for your approval. Implementation never starts from submission alone.
          </p>
        </div>
        <p className="hq-mono text-[11px] text-[var(--hq-muted)]">as of {panel.asOf}</p>
      </div>

      <ol className="mt-4 grid gap-2 text-xs text-[var(--hq-muted)] sm:grid-cols-5">
        {(
          [
            "1. Submit directive",
            "2. Analyze & plan",
            "3. Auto-assign roles",
            "4. CEO approval",
            "5. Then execute",
          ] as const
        ).map((step) => (
          <li key={step} className="rounded-lg bg-white px-3 py-2">
            {step}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="mt-4 rounded-lg bg-[var(--hq-signal-soft)] px-3 py-2 text-sm text-[var(--hq-signal)]">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mt-4 rounded-lg bg-white px-3 py-2 text-sm text-[var(--hq-ink)]">{note}</p>
      ) : null}

      <div className="mt-5 grid gap-3 rounded-xl bg-white p-4">
        <input
          className="w-full rounded-lg border border-[var(--hq-line)] px-3 py-2 text-sm"
          placeholder="Directive title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="min-h-24 w-full rounded-lg border border-[var(--hq-line)] px-3 py-2 text-sm"
          placeholder="Company-wide daily instruction (not an individual assignment)"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />
        <input
          className="w-full rounded-lg border border-[var(--hq-line)] px-3 py-2 text-sm"
          placeholder="Intended outcome (optional)"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
        <button
          type="button"
          disabled={isPending || !instruction.trim()}
          className="rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)] disabled:opacity-50"
          onClick={() =>
            void post("submit_directive", {
              title: title.trim() || "Daily Directive",
              instruction: instruction.trim(),
              intendedOutcome: outcome.trim(),
            })
          }
        >
          Submit Daily Directive
        </button>
      </div>

      {d ? (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl bg-white px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h5 className="font-semibold">{d.title}</h5>
              <span className={`text-xs font-medium ${STATUS_TONE[d.status] ?? ""}`}>
                {d.status}
                {d.paused ? " · PAUSED" : ""}
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--hq-muted)]">{d.instruction}</p>
            {d.clarifiedOutcome ? (
              <p className="mt-2 text-sm">
                <span className="text-[var(--hq-muted)]">Clarified outcome: </span>
                {d.clarifiedOutcome}
              </p>
            ) : null}
            {plan ? (
              <p className="mt-2 text-xs text-[var(--hq-muted)]">
                Plan v{plan.planVersion} · {plan.status}
                {plan.immutable ? " · immutable after approval" : ""} · {plan.objectiveSummary}
              </p>
            ) : null}
            {plan &&
            (plan.status === "AWAITING_APPROVAL" ||
              d.status === "AWAITING_APPROVAL" ||
              d.status === "PLAN_PROPOSED") ? (
              <p className="mt-3 rounded-lg bg-[var(--hq-signal-soft)] px-3 py-2 text-sm text-[var(--hq-signal)]">
                Plan proposed — awaiting explicit CEO approval. No implementation has started.
                All work items remain executionPermission DENIED.
              </p>
            ) : null}
          </div>

          {(panel.assignments.length > 0 ||
            panel.risks.length > 0 ||
            panel.dependencies.length > 0) && (
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl bg-white px-3 py-3">
                <h5 className="text-sm font-semibold">Auto assignments</h5>
                <ul className="mt-2 space-y-2 text-xs text-[var(--hq-muted)]">
                  {panel.assignments.map((a) => (
                    <li key={a.employeeId}>
                      <span className="font-medium text-[var(--hq-ink)]">
                        {a.employeeName}
                      </span>{" "}
                      · {a.permanentRole}
                      <span className="mt-0.5 block">{a.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl bg-white px-3 py-3">
                <h5 className="text-sm font-semibold">Dependencies</h5>
                <ul className="mt-2 space-y-2 text-xs text-[var(--hq-muted)]">
                  {panel.dependencies.length === 0 ? (
                    <li>None</li>
                  ) : (
                    panel.dependencies.map((dep) => (
                      <li key={dep.id}>{dep.description}</li>
                    ))
                  )}
                </ul>
              </div>
              <div className="rounded-xl bg-white px-3 py-3">
                <h5 className="text-sm font-semibold">Risks</h5>
                <ul className="mt-2 space-y-2 text-xs text-[var(--hq-muted)]">
                  {panel.risks.map((r) => (
                    <li key={r.id}>
                      <span className="uppercase text-[10px]">{r.severity}</span> — {r.summary}
                      <span className="mt-0.5 block">Mitigation: {r.mitigation}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {(
              [
                ["Proposed", ws.proposed],
                ["Awaiting", ws.awaitingApproval],
                ["Approved", ws.approved],
                ["Executing", ws.executing],
                ["Blocked", ws.blocked],
                ["Completed", ws.completed],
                ["Rejected", ws.rejected],
              ] as const
            ).map(([label, n]) => (
              <div key={label} className="rounded-xl bg-white px-3 py-2 text-center">
                <p className="text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
                  {label}
                </p>
                <p className="mt-1 text-lg font-semibold">{n}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {plan ? (
              <>
                <button
                  type="button"
                  disabled={isPending}
                  className="rounded-xl bg-[var(--hq-ink)] px-3 py-2 text-xs text-[var(--hq-paper)]"
                  onClick={() => void post("approve_entire_plan", { planId: plan.id })}
                >
                  Approve Entire Plan
                </button>
                <button
                  type="button"
                  disabled={isPending || selected.length === 0}
                  className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs disabled:opacity-50"
                  onClick={() =>
                    void post("approve_selected_work_items", {
                      planId: plan.id,
                      workItemIds: selected,
                    })
                  }
                >
                  Approve Selected
                </button>
                <button
                  type="button"
                  disabled={isPending || !changeNote.trim()}
                  className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs disabled:opacity-50"
                  onClick={() =>
                    void post("request_plan_changes", {
                      planId: plan.id,
                      note: changeNote.trim(),
                    })
                  }
                >
                  Request Plan Changes
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs"
                  onClick={() => void post("reject_plan", { planId: plan.id })}
                >
                  Reject Plan
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={isPending}
              className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs"
              onClick={() => void post("pause_execution", { directiveId: d.id })}
            >
              Pause Execution
            </button>
            <button
              type="button"
              disabled={isPending}
              className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs"
              onClick={() => void post("resume_execution", { directiveId: d.id })}
            >
              Resume Execution
            </button>
            <button
              type="button"
              disabled={isPending}
              className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs"
              onClick={() => void post("advance_approved_work", { directiveId: d.id })}
            >
              Advance Approved Work
            </button>
            <button
              type="button"
              disabled={isPending}
              className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs"
              onClick={() => void post("complete_directive", { directiveId: d.id })}
            >
              File Daily Report
            </button>
            <button
              type="button"
              disabled={isPending}
              className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs text-red-800"
              onClick={() => void post("cancel_directive", { directiveId: d.id })}
            >
              Cancel Directive
            </button>
          </div>

          <input
            className="w-full rounded-lg border border-[var(--hq-line)] bg-white px-3 py-2 text-sm"
            placeholder="Change request note (required for Request Plan Changes)"
            value={changeNote}
            onChange={(e) => setChangeNote(e.target.value)}
          />

          <div>
            <h5 className="text-sm font-semibold">Proposed / live work items</h5>
            <p className="mt-1 text-xs text-[var(--hq-muted)]">
              Proposed and awaiting items are not executed. Only GRANTED items may advance.
            </p>
            <ul className="mt-3 space-y-2">
              {panel.workItems.map((w) => (
                <li
                  key={w.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-white px-3 py-3 text-sm"
                >
                  <label className="flex min-w-0 flex-1 items-start gap-2">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.includes(w.id)}
                      onChange={(e) =>
                        setSelected((prev) =>
                          e.target.checked
                            ? [...prev, w.id]
                            : prev.filter((id) => id !== w.id)
                        )
                      }
                    />
                    <span>
                      <span className="font-medium">{w.title}</span>
                      <span className="mt-1 block text-xs text-[var(--hq-muted)]">
                        {w.assignedEmployeeId} · {w.permanentRole} · permission{" "}
                        {w.executionPermission}
                      </span>
                      <span className="mt-1 block text-xs">
                        {w.currentStep} · {w.progress}%
                        {w.blockedReason ? ` · ${w.blockedReason}` : ""}
                      </span>
                    </span>
                  </label>
                  <span className={`text-xs font-medium ${STATUS_TONE[w.status] ?? ""}`}>
                    {w.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h5 className="text-sm font-semibold">Employee assignment board</h5>
              <ul className="mt-2 space-y-2 text-sm">
                {panel.employees.map((e) => (
                  <li key={e.employeeId} className="rounded-xl bg-white px-3 py-2">
                    <p className="font-medium">
                      {e.employeeName}{" "}
                      <span className="text-xs text-[var(--hq-muted)]">{e.role}</span>
                    </p>
                    <p className="mt-1 text-xs text-[var(--hq-muted)]">
                      {e.currentActivity ?? "No daily-ops activity"}
                      {e.currentStep ? ` · ${e.currentStep}` : ""}
                      {e.progress ? ` · ${e.progress}%` : ""}
                    </p>
                    {e.waitingFor ? (
                      <p className="mt-1 text-xs text-[var(--hq-warn)]">Waiting: {e.waitingFor}</p>
                    ) : e.nextAction ? (
                      <p className="mt-1 text-xs text-[var(--hq-muted)]">Next: {e.nextAction}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5 className="text-sm font-semibold">Approval queue & blockers</h5>
              <ul className="mt-2 space-y-2 text-sm">
                {panel.approvalQueue.length === 0 ? (
                  <li className="text-[var(--hq-muted)]">No pending daily-ops approvals.</li>
                ) : (
                  panel.approvalQueue.map((a) => (
                    <li key={a.id} className="rounded-xl bg-white px-3 py-2">
                      <span className="text-xs uppercase text-[var(--hq-muted)]">{a.kind}</span>
                      <p>{a.summary}</p>
                    </li>
                  ))
                )}
              </ul>
              <ul className="mt-3 space-y-2 text-sm">
                {panel.blockers.map((b) => (
                  <li key={b.workItemId} className="rounded-xl bg-white px-3 py-2 text-red-800">
                    {b.title}: {b.reason}
                  </li>
                ))}
              </ul>
              <div className="mt-4 rounded-xl bg-white px-3 py-2 text-xs text-[var(--hq-muted)]">
                <p>Latest update: {panel.latestUpdate ?? "—"}</p>
                <p className="mt-1">Morning report: {panel.morningReportTitle ?? "—"}</p>
                <p className="mt-1">Final report: {panel.finalReportTitle ?? "—"}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-5 text-sm text-[var(--hq-muted)]">
          No directive for today yet. Submit one to open the planning cycle.
        </p>
      )}

      <div className="mt-8">
        <DailyReportPanel report={panel.dailyReport} />
      </div>
    </div>
  );
}
