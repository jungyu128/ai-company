"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ExecutiveDashboard } from "@/services/builder/ceo/types";

type Props = {
  initial: ExecutiveDashboard;
  workspaceId: string;
};

export function AiCompanyExecutiveDashboard({ initial, workspaceId }: Props) {
  const router = useRouter();
  const [dash, setDash] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function post(action: string, extra?: Record<string, unknown>) {
    setError(null);
    const res = await fetch("/api/builder/hq/executive", {
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
      executive?: ExecutiveDashboard;
      note?: string;
    };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Could not update executive view");
      return;
    }
    if (data.executive) setDash(data.executive);
    if (data.note) setError(data.note);
    startTransition(() => router.refresh());
  }

  const h = dash.health;

  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              AI CEO · Executive Dashboard
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              Company Health {h.score}
              <span className="ml-2 text-base font-medium text-[var(--hq-muted)]">
                {h.label}
              </span>
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">{h.summary}</p>
            <p className="mt-2 text-xs text-[var(--hq-muted)]">
              Updated {dash.generatedAtDisplay} · AI CEO analyzes and recommends only — never
              approves external writes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => void post("refresh")}
              className="rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)] disabled:opacity-50"
            >
              Refresh
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => void post("reports")}
              className="rounded-xl border border-[var(--hq-line)] bg-white px-4 py-2 text-sm"
            >
              Generate reports
            </button>
          </div>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-[var(--hq-signal-soft)] px-3 py-2 text-sm text-[var(--hq-signal)]">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(h.kpis).map(([key, value]) => (
            <div key={key} className="rounded-xl bg-white px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
                {key.replace(/([A-Z])/g, " $1")}
              </p>
              <p className="mt-1 text-xl font-semibold">{value}%</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Risk Center">
          {dash.risks.length === 0 ? (
            <p className="text-sm text-[var(--hq-muted)]">No open risks.</p>
          ) : (
            <ul className="space-y-3">
              {dash.risks.slice(0, 8).map((r) => (
                <li key={r.id} className="rounded-xl bg-white px-3 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.title}</span>
                    <span className="text-[11px] uppercase text-[var(--hq-muted)]">
                      {r.severity} · {r.confidence}%
                    </span>
                  </div>
                  <p className="mt-1 text-[var(--hq-muted)]">{r.impact}</p>
                  <p className="mt-1 text-xs">
                    Owner: {r.ownerName} · {r.recommendation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Employee workloads">
          <ul className="space-y-2">
            {dash.workloads.map((w) => (
              <li
                key={w.employeeId}
                className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm"
              >
                <span>
                  {w.employeeName}
                  <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">{w.role}</span>
                </span>
                <span className="text-xs capitalize text-[var(--hq-muted)]">
                  {w.status} · {w.activeItems} items
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Approval queue">
          {dash.approvalQueue.length === 0 ? (
            <p className="text-sm text-[var(--hq-muted)]">No pending approvals.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dash.approvalQueue.slice(0, 8).map((a) => (
                <li key={a.id} className="rounded-xl bg-white px-3 py-2">
                  <span className="font-medium">{a.title}</span>
                  <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">{a.owner}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Mission progress">
          {dash.missionProgress.length === 0 ? (
            <p className="text-sm text-[var(--hq-muted)]">No missions yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dash.missionProgress.slice(0, 8).map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
                >
                  <span>{m.title}</span>
                  <span className="text-xs capitalize text-[var(--hq-muted)]">
                    {m.status.replace(/_/g, " ")} · {m.lead}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Execution success">
          <p className="text-3xl font-semibold">{dash.executionSuccessRate}%</p>
          <p className="mt-2 text-sm text-[var(--hq-muted)]">
            Workday {dash.workdayPerformance.status}: {dash.workdayPerformance.completed} done,{" "}
            {dash.workdayPerformance.failed} failed, {dash.workdayPerformance.pending} pending.
          </p>
        </Panel>
        <Panel title="Connector status">
          <ul className="space-y-2 text-sm">
            {dash.connectorStatus.map((c) => (
              <li key={c.system} className="flex justify-between gap-2 rounded-lg bg-white px-3 py-2">
                <span>{c.label}</span>
                <span className="text-xs text-[var(--hq-muted)]">
                  {c.connected ? "connected" : "disconnected"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Memory growth">
          <p className="text-3xl font-semibold">{dash.memoryGrowth.total}</p>
          <p className="mt-2 text-sm text-[var(--hq-muted)]">
            {dash.memoryGrowth.accepted} accepted · {dash.memoryGrowth.pending} pending · avg
            confidence {dash.memoryGrowth.avgConfidence}%
          </p>
        </Panel>
      </div>

      <Panel title="KPI trends">
        {dash.kpiHistory.length === 0 ? (
          <p className="text-sm text-[var(--hq-muted)]">No history yet — refresh to capture a sample.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {dash.kpiHistory.slice(0, 8).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
              >
                <span className="hq-mono text-xs text-[var(--hq-muted)]">
                  {p.at.slice(0, 16).replace("T", " ")}
                </span>
                <span className="font-medium">Health {p.score}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Strategic recommendations">
        {dash.strategicRecommendations.length === 0 ? (
          <p className="text-sm text-[var(--hq-muted)]">No planning recommendations.</p>
        ) : (
          <ul className="space-y-3">
            {dash.strategicRecommendations.slice(0, 8).map((p) => (
              <li key={p.id} className="rounded-xl bg-white px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{p.title}</span>
                  <span className="text-[11px] uppercase text-[var(--hq-muted)]">{p.kind}</span>
                </div>
                <p className="mt-1 text-[var(--hq-muted)]">{p.rationale}</p>
                {p.kind === "reassign" && p.missionId ? (
                  <button
                    type="button"
                    disabled={isPending}
                    className="mt-2 text-xs text-[var(--hq-signal)] underline-offset-2 hover:underline"
                    onClick={() => void post("apply_plan", { planningId: p.id })}
                  >
                    Apply reassignment (still requires human approval for writes)
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <ReportCard title="Weekly executive report" report={dash.latestWeeklyReport} />
        <ReportCard title="Monthly executive report" report={dash.latestMonthlyReport} />
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <h4 className="text-lg font-semibold">{title}</h4>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ReportCard({
  title,
  report,
}: {
  title: string;
  report: ExecutiveDashboard["latestWeeklyReport"];
}) {
  if (!report) {
    return (
      <Panel title={title}>
        <p className="text-sm text-[var(--hq-muted)]">
          No report yet. Use Generate reports to create one.
        </p>
      </Panel>
    );
  }
  return (
    <Panel title={title}>
      <p className="text-sm font-medium">{report.periodLabel}</p>
      <p className="mt-2 text-sm text-[var(--hq-muted)]">{report.summary}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--hq-muted)]">
        {report.recommendations.slice(0, 4).map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </Panel>
  );
}
