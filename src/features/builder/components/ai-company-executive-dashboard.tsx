"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  CeoDashboardDrillResult,
  CeoDashboardDrillSection,
  CeoDashboardItemRef,
  CeoLiveWorkPanel,
  ExecutiveDashboard,
} from "@/services/builder/ceo/types";
import { DailyOperationsPanel } from "@/features/builder/components/daily-operations-panel";

type Props = {
  initial: ExecutiveDashboard;
  workspaceId: string;
};

export function AiCompanyExecutiveDashboard({ initial, workspaceId }: Props) {
  const router = useRouter();
  const [dash, setDash] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<CeoDashboardDrillResult | null>(null);
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

  async function openDrill(section: CeoDashboardDrillSection, id: string) {
    setError(null);
    const params = new URLSearchParams({
      section,
      id,
      workspaceId,
    });
    const res = await fetch(`/api/builder/hq/executive?${params.toString()}`, {
      headers: { "x-ai-company-workspace": workspaceId },
    });
    const data = (await res.json()) as {
      ok?: boolean;
      error?: string;
      drill?: CeoDashboardDrillResult;
    };
    if (!res.ok || !data.ok || !data.drill) {
      setError(data.error ?? "Could not open detail");
      return;
    }
    setDrill(data.drill);
  }

  function onItemClick(item: {
    section: CeoDashboardDrillSection;
    id: string;
    href: string;
  }) {
    if (item.href.startsWith("/builder/hq/employees/")) {
      router.push(item.href);
      return;
    }
    if (item.href === "#ops-approvals") {
      document.getElementById("ops-approvals")?.scrollIntoView({ behavior: "smooth" });
      void openDrill(item.section, item.id);
      return;
    }
    void openDrill(item.section, item.id);
  }

  const h = dash.health;
  const sprint = dash.sprintProgress;

  return (
    <section className="space-y-8">
      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              AI CEO · Executive Dashboard
            </p>
            <button
              type="button"
              className="mt-1 text-left"
              onClick={() => void openDrill("health", h.id)}
            >
              <h3 className="text-2xl font-semibold tracking-tight">
                Company Health {h.score}
                <span className="ml-2 text-base font-medium text-[var(--hq-muted)]">
                  {h.label}
                </span>
              </h3>
            </button>
            <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">{h.summary}</p>
            <p className="mt-2 text-xs text-[var(--hq-muted)]">
              Updated {dash.generatedAtDisplay} · Real-time HQ OS health · AI CEO analyzes and
              recommends only — never approves external writes.
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
            <button
              key={key}
              type="button"
              onClick={() => void openDrill("kpi", key)}
              className="rounded-xl bg-white px-4 py-3 text-left transition hover:ring-1 hover:ring-[var(--hq-line)]"
            >
              <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
                {key.replace(/([A-Z])/g, " $1")}
              </p>
              <p className="mt-1 text-xl font-semibold">{value}%</p>
            </button>
          ))}
        </div>
      </div>

      {drill ? (
        <div className="rounded-2xl border border-[var(--hq-signal)] bg-[var(--hq-panel)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="hq-mono text-[11px] uppercase tracking-[0.16em] text-[var(--hq-signal)]">
                Drill · {drill.section.replace(/_/g, " ")}
              </p>
              <h4 className="mt-1 text-lg font-semibold">{drill.title}</h4>
            </div>
            <button
              type="button"
              className="rounded-lg border border-[var(--hq-line)] bg-white px-3 py-1.5 text-xs"
              onClick={() => setDrill(null)}
            >
              Close
            </button>
          </div>
          <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-white p-3 text-xs text-[var(--hq-muted)] whitespace-pre-wrap">
            {JSON.stringify(drill.detail, null, 2)}
          </pre>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Employee workloads">
          <ItemList
            empty="No workload signals."
            items={dash.workloads.map((w) => ({
              id: w.employeeId,
              section: "workload" as const,
              title: w.employeeName,
              subtitle: `${w.role} · ${w.status} · ${w.activeItems} items`,
              status: w.status,
              href: `/builder/hq/employees/${encodeURIComponent(w.employeeId)}`,
            }))}
            onSelect={onItemClick}
          />
        </Panel>

        <Panel title="Approvals waiting">
          <ItemList
            empty="No pending approvals."
            items={dash.approvalQueue.map((a) => ({
              id: a.id,
              section: "approval" as const,
              title: a.title,
              subtitle: a.owner,
              status: "pending",
              href: a.href || "#ops-approvals",
            }))}
            onSelect={onItemClick}
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Active work">
          <ItemList
            empty="No active work items."
            items={dash.activeWork}
            onSelect={onItemClick}
          />
        </Panel>
        <Panel title="Blocked work">
          <ItemList
            empty="No blocked work."
            items={dash.blockedWork}
            onSelect={onItemClick}
          />
        </Panel>
      </div>

      <LiveWorkTrackerPanel
        panel={dash.liveWorkTracker}
        onSelect={(employeeId) =>
          void openDrill("live_work", employeeId)
        }
        onOpenEmployee={(href) => router.push(href)}
      />

      <DailyOperationsPanel initial={dash.dailyOps} workspaceId={workspaceId} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Sprint progress">
          {sprint.active ? (
            <button
              type="button"
              className="mb-4 w-full rounded-xl bg-white px-3 py-3 text-left text-sm"
              onClick={() => void openDrill("sprint", sprint.active!.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{sprint.active.name}</span>
                <span className="text-xs text-[var(--hq-muted)]">
                  {sprint.active.progressPercent}%
                </span>
              </div>
              <p className="mt-1 text-[var(--hq-muted)]">{sprint.active.goal}</p>
              <p className="mt-2 text-xs text-[var(--hq-muted)]">
                Velocity {sprint.active.velocity}/day · {sprint.active.completedWorkItems}/
                {sprint.active.totalWorkItems} done · {sprint.active.blockedWorkItems} blocked ·{" "}
                {sprint.plannedCount} planned · {sprint.completedCount} completed sprints
              </p>
            </button>
          ) : (
            <p className="mb-3 text-sm text-[var(--hq-muted)]">
              No active sprint · {sprint.plannedCount} planned · {sprint.completedCount} completed
            </p>
          )}
          <ItemList empty="No sprint items." items={sprint.items} onSelect={onItemClick} />
        </Panel>

        <Panel title="Meeting summaries">
          {dash.meetingSummaries.length === 0 ? (
            <p className="text-sm text-[var(--hq-muted)]">No recent meetings.</p>
          ) : (
            <ul className="space-y-3">
              {dash.meetingSummaries.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white px-3 py-3 text-left text-sm"
                    onClick={() => void openDrill("meeting", m.id)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{m.title}</span>
                      <span className="text-[11px] uppercase text-[var(--hq-muted)]">
                        {m.kind.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 text-[var(--hq-muted)]">{m.synthesis}</p>
                    <p className="mt-1 text-xs text-[var(--hq-muted)]">
                      {m.status.replace(/_/g, " ")}
                      {m.workItemTitle ? ` · ${m.workItemTitle}` : ""} · {m.participantCount}{" "}
                      participants
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Risk Center">
          {dash.risks.length === 0 ? (
            <p className="text-sm text-[var(--hq-muted)]">No open risks.</p>
          ) : (
            <ul className="space-y-3">
              {dash.risks.slice(0, 8).map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white px-3 py-3 text-left text-sm"
                    onClick={() => void openDrill("risk", r.id)}
                  >
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
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent decisions">
          {dash.recentDecisions.length === 0 ? (
            <p className="text-sm text-[var(--hq-muted)]">No recent decisions.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {dash.recentDecisions.slice(0, 10).map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="w-full rounded-xl bg-white px-3 py-2 text-left"
                    onClick={() => void openDrill("decision", d.id)}
                  >
                    <span className="font-medium">{d.summary}</span>
                    <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">
                      {d.actorName} · {d.at.slice(0, 16).replace("T", " ")} · {d.relatedType}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Mission progress">
          <ItemList
            empty="No missions yet."
            items={dash.missionProgress.map((m) => ({
              id: m.id,
              section: "active_work" as const,
              title: m.title,
              subtitle: `${m.status.replace(/_/g, " ")} · ${m.lead}`,
              status: m.status,
              href: m.href || drillFallback("active_work", m.id),
            }))}
            onSelect={onItemClick}
          />
        </Panel>

        <Panel title="Execution success">
          <p className="text-3xl font-semibold">{dash.executionSuccessRate}%</p>
          <p className="mt-2 text-sm text-[var(--hq-muted)]">
            Workday {dash.workdayPerformance.status}: {dash.workdayPerformance.completed} done,{" "}
            {dash.workdayPerformance.failed} failed, {dash.workdayPerformance.pending} pending.
          </p>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
              <li key={p.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl bg-white px-3 py-2 text-left"
                  onClick={() => void openDrill("kpi", p.id)}
                >
                  <span className="hq-mono text-xs text-[var(--hq-muted)]">
                    {p.at.slice(0, 16).replace("T", " ")}
                  </span>
                  <span className="font-medium">Health {p.score}</span>
                </button>
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

      <p className="text-xs text-[var(--hq-muted)]">
        Open employee detail via workload rows · Approvals also live in{" "}
        <Link href="#ops-approvals" className="underline-offset-2 hover:underline">
          Approvals
        </Link>
        .
      </p>
    </section>
  );
}

function drillFallback(section: CeoDashboardDrillSection, id: string) {
  return `#ops-executive?drill=${encodeURIComponent(section)}&id=${encodeURIComponent(id)}`;
}

function ItemList({
  items,
  empty,
  onSelect,
}: {
  items: CeoDashboardItemRef[];
  empty: string;
  onSelect: (item: CeoDashboardItemRef) => void;
}) {
  if (!items.length) {
    return <p className="text-sm text-[var(--hq-muted)]">{empty}</p>;
  }
  return (
    <ul className="space-y-2 text-sm">
      {items.slice(0, 10).map((item) => (
        <li key={`${item.section}-${item.id}`}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left transition hover:ring-1 hover:ring-[var(--hq-line)]"
            onClick={() => onSelect(item)}
          >
            <span>
              <span className="font-medium">{item.title}</span>
              <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">{item.subtitle}</span>
            </span>
            <span className="shrink-0 text-[11px] capitalize text-[var(--hq-muted)]">
              {item.status.replace(/_/g, " ")}
            </span>
          </button>
        </li>
      ))}
    </ul>
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

function LiveWorkTrackerPanel({
  panel,
  onSelect,
  onOpenEmployee,
}: {
  panel: CeoLiveWorkPanel;
  onSelect: (employeeId: string) => void;
  onOpenEmployee: (href: string) => void;
}) {
  const s = panel.summary;
  return (
    <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">Live Work Tracker</h4>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            Real-time status for every employee · updated continuously with Continuous OS
          </p>
        </div>
        <p className="hq-mono text-[11px] text-[var(--hq-muted)]">as of {panel.asOf}</p>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {(
          [
            ["Idle", s.idle],
            ["Planning", s.planning],
            ["Working", s.working],
            ["Reviewing", s.reviewing],
            ["Meeting", s.meeting],
            ["Waiting", s.waiting],
            ["Blocked", s.blocked],
            ["Done", s.completed],
          ] as const
        ).map(([label, n]) => (
          <div key={label} className="rounded-xl bg-white px-3 py-2 text-center">
            <p className="text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">{label}</p>
            <p className="mt-1 text-lg font-semibold">{n}</p>
          </div>
        ))}
      </div>

      <ul className="mt-5 space-y-2">
        {panel.employees.map((e) => (
          <li key={e.employeeId}>
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-3 text-left text-sm transition hover:ring-1 hover:ring-[var(--hq-line)]"
              onClick={() => onSelect(e.employeeId)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.employeeName}</span>
                  <span className="text-xs text-[var(--hq-muted)]">{e.role}</span>
                  <span className="rounded-full bg-[var(--hq-signal-soft)] px-2 py-0.5 text-[11px] text-[var(--hq-signal)]">
                    {e.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-[var(--hq-muted)]">
                  {e.currentTask ?? "No active task"} · {e.currentStep} · {e.progressPercent}%
                </p>
                {e.waitingFor ? (
                  <p className="mt-1 text-xs text-[var(--hq-warn)]">Waiting: {e.waitingFor}</p>
                ) : null}
              </div>
              <span
                className="text-xs text-[var(--hq-signal)] underline"
                onClick={(ev) => {
                  ev.stopPropagation();
                  onOpenEmployee(e.href);
                }}
              >
                Profile
              </span>
            </button>
          </li>
        ))}
      </ul>

      {panel.recentChanges.length > 0 ? (
        <div className="mt-5 border-t border-[var(--hq-line)]/70 pt-4">
          <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
            Recent state changes
          </p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--hq-muted)]">
            {panel.recentChanges.slice(0, 6).map((c, i) => (
              <li key={`${c.employeeId}-${c.at}-${i}`}>{c.summary}</li>
            ))}
          </ul>
        </div>
      ) : null}
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
