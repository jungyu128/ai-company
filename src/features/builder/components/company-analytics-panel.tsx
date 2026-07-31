"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type {
  AnalyticsDimension,
  CompanyAnalyticsView,
} from "@/services/builder/analytics/types";

type Props = {
  workspaceId: string;
};

const DIMENSIONS: Array<{ id: AnalyticsDimension; label: string }> = [
  { id: "company", label: "Company" },
  { id: "employee", label: "Employee" },
  { id: "team", label: "Team" },
  { id: "sprint", label: "Sprint" },
  { id: "work_item", label: "Work item" },
];

export function CompanyAnalyticsPanel({ workspaceId }: Props) {
  const router = useRouter();
  const [view, setView] = useState<CompanyAnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dimension, setDimension] = useState<AnalyticsDimension>("company");
  const [dimensionId, setDimensionId] = useState("");
  const [isPending, startTransition] = useTransition();

  async function load(nextDimension = dimension, nextId = dimensionId) {
    setError(null);
    const params = new URLSearchParams({
      history: "1",
      workspaceId,
      dimension: nextDimension,
    });
    if (nextDimension !== "company" && nextId.trim()) {
      params.set("id", nextId.trim());
    }
    const res = await fetch(`/api/builder/hq/analytics?${params.toString()}`, {
      headers: { "x-ai-company-workspace": workspaceId },
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      snapshot?: CompanyAnalyticsView["snapshot"];
      history?: CompanyAnalyticsView["history"];
      trends?: CompanyAnalyticsView["trends"];
    };
    if (!res.ok || !data.ok || !data.snapshot || !data.history || !data.trends) {
      setError(data.error ?? "Could not load analytics");
      return;
    }
    setView({
      snapshot: data.snapshot,
      history: data.history,
      trends: data.trends,
    });
  }

  async function recordSample() {
    setError(null);
    const res = await fetch("/api/builder/hq/analytics", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-company-workspace": workspaceId,
      },
      body: JSON.stringify({ action: "record", force: true, workspaceId }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      snapshot?: CompanyAnalyticsView["snapshot"];
      history?: CompanyAnalyticsView["history"];
      trends?: CompanyAnalyticsView["trends"];
    };
    if (!res.ok || !data.ok) {
      setError(data.error ?? "Could not record sample");
      return;
    }
    if (data.snapshot && data.history && data.trends) {
      setView({
        snapshot: data.snapshot,
        history: data.history,
        trends: data.trends,
      });
    }
    startTransition(() => router.refresh());
  }

  useEffect(() => {
    if (dimension === "company") {
      void load("company", "");
      return;
    }
    if (!dimensionId.trim()) {
      setView(null);
      return;
    }
    void load(dimension, dimensionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on dimension/id change only
  }, [workspaceId, dimension, dimensionId]);

  const snap = view?.snapshot;
  const kpis = snap?.kpis;

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Company Analytics
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              Operations KPIs
              {snap ? (
                <span className="ml-2 text-base font-medium text-[var(--hq-muted)]">
                  Health {snap.healthScore} · {snap.healthLabel}
                </span>
              ) : null}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">
              Observe-only metrics across employees, teams, sprints, and work items. Recording
              samples never changes Continuous OS, meetings, memory, calendar, or execution.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => void load()}
              className="rounded-xl border border-[var(--hq-line)] bg-white px-4 py-2 text-sm"
            >
              Refresh
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() => void recordSample()}
              className="rounded-xl bg-[var(--hq-ink)] px-4 py-2 text-sm text-[var(--hq-paper)] disabled:opacity-50"
            >
              Record sample
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Dimension
            </span>
            <select
              className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
              value={dimension}
              onChange={(e) => {
                setDimension(e.target.value as AnalyticsDimension);
                if (e.target.value === "company") setDimensionId("");
              }}
            >
              {DIMENSIONS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {dimension !== "company" ? (
            <label className="text-sm">
              <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
                Id
              </span>
              <input
                className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
                placeholder={
                  dimension === "employee"
                    ? "alex"
                    : dimension === "team"
                      ? "Engineering"
                      : dimension === "sprint"
                        ? "SPRINT-…"
                        : "DEV-…"
                }
                value={dimensionId}
                onChange={(e) => setDimensionId(e.target.value)}
              />
            </label>
          ) : null}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-[var(--hq-signal-soft)] px-3 py-2 text-sm text-[var(--hq-signal)]">
            {error}
          </p>
        ) : null}
      </div>

      {kpis ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Productivity" value={`${kpis.employeeProductivityAvg}%`} />
          <Kpi
            label="Avg completion"
            value={
              kpis.avgWorkCompletionHours == null
                ? "—"
                : `${kpis.avgWorkCompletionHours}h`
            }
          />
          <Kpi label="Sprint velocity" value={String(kpis.sprintVelocity)} />
          <Kpi label="Blocked work" value={String(kpis.blockedWorkCount)} />
          <Kpi label="Meeting efficiency" value={`${kpis.meetingEfficiencyPercent}%`} />
          <Kpi
            label="Approval turnaround"
            value={
              kpis.approvalTurnaroundHours == null
                ? "—"
                : `${kpis.approvalTurnaroundHours}h`
            }
          />
          <Kpi
            label="QA pass rate"
            value={
              kpis.qaPassRatePercent == null ? "—" : `${kpis.qaPassRatePercent}%`
            }
          />
          <Kpi
            label="QA fail rate"
            value={
              kpis.qaFailRatePercent == null ? "—" : `${kpis.qaFailRatePercent}%`
            }
          />
          <Kpi label="Health score" value={String(kpis.companyHealthScore)} />
          <Kpi label="Active / done" value={`${kpis.activeWorkCount}/${kpis.completedWorkCount}`} />
        </div>
      ) : (
        <p className="text-sm text-[var(--hq-muted)]">
          {dimension === "company"
            ? "Loading analytics…"
            : "Enter an id to load dimension analytics."}
        </p>
      )}

      {snap ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Work distribution">
            <DistList title="By employee" items={snap.workDistribution.byEmployee} />
            <DistList title="By team" items={snap.workDistribution.byTeam} />
            <DistList title="By status" items={snap.workDistribution.byStatus} />
          </Panel>
          <Panel title="Employee productivity">
            <ul className="space-y-2 text-sm">
              {snap.employees.map((e) => (
                <li
                  key={e.employeeId}
                  className="flex items-center justify-between rounded-xl bg-white px-3 py-2"
                >
                  <span>
                    {e.employeeName}
                    <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">
                      {e.department} · {e.completed} done · {e.active} active · {e.blocked}{" "}
                      blocked
                    </span>
                  </span>
                  <span className="text-xs text-[var(--hq-muted)]">
                    {e.productivityPercent}%
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Recurring blockers">
            {snap.recurringBlockers.length === 0 ? (
              <p className="text-sm text-[var(--hq-muted)]">No recurring blockers.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {snap.recurringBlockers.map((b) => (
                  <li key={b.key} className="rounded-xl bg-white px-3 py-2">
                    <span className="font-medium">{b.label}</span>
                    <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">
                      {b.count} work items
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Historical trends">
            <TrendLine title="Health" points={view?.trends.health ?? []} />
            <TrendLine title="Blocked" points={view?.trends.blocked ?? []} />
            <TrendLine title="Velocity" points={view?.trends.velocity ?? []} />
            <TrendLine title="Productivity" points={view?.trends.productivity ?? []} />
          </Panel>
        </div>
      ) : null}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <h4 className="text-lg font-semibold">{title}</h4>
      <div className="mt-4 space-y-4">{children}</div>
    </div>
  );
}

function DistList({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; label: string; count: number; percent: number }>;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-[var(--hq-muted)]">{title}</p>
      <ul className="mt-2 space-y-1 text-sm">
        {items.slice(0, 6).map((item) => (
          <li key={item.key} className="flex justify-between rounded-lg bg-white px-3 py-1.5">
            <span>{item.label}</span>
            <span className="text-[var(--hq-muted)]">
              {item.count} · {item.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendLine({
  title,
  points,
}: {
  title: string;
  points: Array<{ at: string; value: number }>;
}) {
  if (!points.length) {
    return (
      <p className="text-sm text-[var(--hq-muted)]">
        {title}: no history yet — record a sample.
      </p>
    );
  }
  const latest = points[points.length - 1];
  const first = points[0];
  return (
    <div className="rounded-xl bg-white px-3 py-2 text-sm">
      <div className="flex justify-between gap-2">
        <span className="font-medium">{title}</span>
        <span className="text-[var(--hq-muted)]">{latest?.value}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--hq-muted)]">
        {points.length} samples · from {first?.value} → {latest?.value}
      </p>
    </div>
  );
}
