"use client";

import type { CeoCommandCenter } from "@/services/builder/os.service";
import { EmployeeRecommendationsPanel } from "@/features/builder/components/employee-recommendations-panel";
import { ExecutionCenterPanel } from "@/features/builder/components/execution-center-panel";

type Props = {
  commandCenter: CeoCommandCenter;
};

export function CeoCommandCenterView({ commandCenter }: Props) {
  const cc = commandCenter;
  const phase = cc.workday;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Command Center
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              Self-operating company · {phase.phaseLabel}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">
              Employees prepare work automatically. You step in only when a decision is required.
            </p>
          </div>
          <div className="rounded-xl bg-white px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Company health
            </p>
            <p className="text-2xl font-semibold">
              {cc.companyHealth.score}
              <span className="ml-2 text-sm font-medium text-[var(--hq-muted)]">
                {cc.companyHealth.label}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Active missions" value={String(cc.activeMissions.length)} />
          <Stat label="Waiting approvals" value={String(cc.waitingApprovals.length)} />
          <Stat label="Critical risks" value={String(cc.criticalRisks.length)} />
          <Stat label="Open recommendations" value={String(cc.recommendations.length)} />
        </div>
      </section>

      <WorkDayPhasePanel workday={cc.workday} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h4 className="text-lg font-semibold">Active missions</h4>
          {cc.activeMissions.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">No active missions.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {cc.activeMissions.slice(0, 8).map((m) => (
                <li
                  key={m.missionId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="text-xs text-[var(--hq-muted)]">
                    {m.priority} · {m.recommendedOwnerName} · score {m.score}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h4 className="text-lg font-semibold">Critical risks & opportunities</h4>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <List title="Risks" items={cc.criticalRisks} />
            <List title="Opportunities" items={cc.topOpportunities} />
          </div>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h4 className="text-lg font-semibold">Waiting approvals</h4>
          {cc.waitingApprovals.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">Queue clear.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {cc.waitingApprovals.map((a) => (
                <li key={a.id} className="rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-[var(--hq-warn)]">
                  {a.title}
                  <span className="mt-0.5 block text-xs opacity-80">{a.owner}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h4 className="text-lg font-semibold">Employees needing help</h4>
          {cc.employeesNeedingHelp.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">Everyone is unblocked.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {cc.employeesNeedingHelp.map((e) => (
                <li key={`${e.employeeId}-${e.reason}`} className="rounded-lg bg-white px-3 py-2">
                  <span className="font-medium">{e.name}</span>
                  <p className="text-xs text-[var(--hq-muted)]">{e.reason}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <h4 className="text-lg font-semibold">Productivity trends</h4>
        <div className="mt-4 grid grid-cols-7 gap-2">
          {cc.productivityTrends.map((p) => (
            <div key={p.day} className="rounded-lg bg-white px-2 py-3 text-center">
              <p className="hq-mono text-[10px] text-[var(--hq-muted)]">{p.day.slice(5)}</p>
              <p className="mt-1 text-lg font-semibold">{p.completed}</p>
              <p className="text-[10px] text-[var(--hq-muted)]">
                {(p.successRate * 100).toFixed(0)}%
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-[var(--hq-muted)]">
          Learning · success {(cc.learning.successRate * 100).toFixed(0)}% · approval{" "}
          {(cc.learning.approvalRate * 100).toFixed(0)}% · efficiency{" "}
          {cc.learning.averageCollaborationEfficiency || "—"} · samples {cc.learning.sampleSize}
        </p>
      </section>

      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <h4 className="text-lg font-semibold">Automatic coordination</h4>
        <p className="mt-1 text-sm text-[var(--hq-muted)]">
          Work assigned, rebalanced, and de-duplicated behind the scenes.
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Pill label={`${cc.coordinationSummary.assignments} assignments`} />
          <Pill label={`${cc.coordinationSummary.rebalanced} rebalanced`} />
          <Pill label={`${cc.coordinationSummary.blocked} blocked`} />
          <Pill
            label={`${cc.coordinationSummary.duplicatesPrevented} duplicates prevented`}
          />
        </div>
        {cc.coordinationSummary.autonomyEvents.length > 0 ? (
          <ul className="mt-4 space-y-2 text-sm text-[var(--hq-muted)]">
            {cc.coordinationSummary.autonomyEvents.slice(0, 6).map((e) => (
              <li key={e.id}>{e.summary}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <ExecutionCenterPanel
        pending={cc.pendingExecutions}
        history={cc.executionHistory}
        connections={cc.connectionStatuses}
      />

      <EmployeeRecommendationsPanel recommendations={cc.recommendations} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--hq-muted)]">None</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-white px-3 py-1 text-[var(--hq-ink)]">{label}</span>
  );
}

function WorkDayPhasePanel({
  workday,
}: {
  workday: CeoCommandCenter["workday"];
}) {
  const checklist =
    workday.phase === "morning"
      ? workday.morning.checklist
      : workday.phase === "working"
        ? workday.working.monitoring
        : workday.endOfDay.tomorrowPriorities.map((p) => `Tomorrow: ${p}`);

  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
        Operating cycle · {workday.phaseLabel}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div>
          <p className="text-sm font-semibold">Morning</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--hq-muted)]">
            {workday.morning.checklist.slice(0, 5).map((c) => (
              <li key={c}>✓ {c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--hq-signal)]">
            {workday.morning.risksDetected} risks · {workday.morning.opportunitiesDetected}{" "}
            opportunities · brief {workday.morning.briefReady ? "ready" : "pending"}
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">Working hours</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--hq-muted)]">
            {workday.working.monitoring.map((c) => (
              <li key={c}>• {c}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-[var(--hq-signal)]">
            {workday.working.autoCollaborations} auto-collabs · {workday.working.escalations}{" "}
            escalations
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold">End of day</p>
          <p className="mt-2 text-xs text-[var(--hq-muted)]">{workday.endOfDay.productivityNote}</p>
          <p className="mt-1 text-xs text-[var(--hq-muted)]">{workday.endOfDay.healthNote}</p>
          <ul className="mt-2 space-y-1 text-xs text-[var(--hq-muted)]">
            {workday.endOfDay.tomorrowPriorities.slice(0, 3).map((p) => (
              <li key={p}>→ {p}</li>
            ))}
          </ul>
        </div>
      </div>
      {workday.phase !== "end_of_day" ? (
        <ul className="mt-4 flex flex-wrap gap-2">
          {checklist.slice(0, 6).map((c) => (
            <li
              key={c}
              className="rounded-full bg-white px-3 py-1 text-[11px] text-[var(--hq-muted)]"
            >
              {c}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
