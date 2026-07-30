"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AutonomousWorkday } from "@/services/builder/workday/types";

type Props = {
  workday: AutonomousWorkday | null;
};

export function AutonomousWorkdayPanel({ workday }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function run(action: "start" | "refresh" | "complete") {
    setError(null);
    try {
      const res = await fetch("/api/builder/hq/workday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update workday");
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setError("Network error while updating workday");
    }
  }

  const brief = workday?.morningBrief;
  const plan = workday?.plan ?? [];
  const eod = workday?.endOfDayReport;

  const pending = plan.filter((p) =>
    ["awaiting_approval", "assigned", "planned", "detected", "executing"].includes(p.status)
  );
  const blocked = plan.filter(
    (p) => p.status === "disconnected" || p.status === "blocked" || p.status === "stale"
  );
  const completed = plan.filter((p) => p.status === "completed");

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Autonomous Workday
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              {workday ? `Today · ${workday.date}` : "Start your workday"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">
              Inspect priorities, assign AI Employees, prepare previews, and approve external writes
              before anything is sent or changed.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => void run("start")}
              className="rounded-xl bg-[var(--hq-ink)] px-4 py-2.5 text-sm font-medium text-[var(--hq-paper)] disabled:opacity-50"
            >
              {workday ? "Resume workday" : "Start Workday"}
            </button>
            {workday ? (
              <>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void run("refresh")}
                  className="rounded-xl border border-[var(--hq-line)] bg-white px-4 py-2.5 text-sm disabled:opacity-50"
                >
                  Refresh
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void run("complete")}
                  className="rounded-xl border border-[var(--hq-signal)]/40 bg-[var(--hq-signal-soft)] px-4 py-2.5 text-sm text-[var(--hq-signal)] disabled:opacity-50"
                >
                  End of day
                </button>
              </>
            ) : null}
          </div>
        </div>

        {workday ? (
          <p className="mt-4 text-xs capitalize text-[var(--hq-muted)]">
            Status · {workday.status.replace(/_/g, " ")}
            {workday.startedAt ? ` · started ${workday.startedAt.slice(11, 16)}` : ""}
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-sm text-[var(--hq-warn)]">
            {error}
          </p>
        ) : null}
      </div>

      {!workday ? (
        <p className="text-sm text-[var(--hq-muted)]">
          Press Start Workday to generate the morning brief and today&apos;s ranked plan.
        </p>
      ) : (
        <>
          {brief ? (
            <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
              <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
                Morning Brief
              </p>
              <h4 className="mt-1 text-xl font-semibold">Executive overview</h4>
              <p className="mt-2 text-sm text-[var(--hq-muted)]">{brief.summary}</p>

              {brief.recommendedFirstAction ? (
                <div className="mt-4 rounded-xl bg-[var(--hq-signal-soft)] px-4 py-3 text-sm text-[var(--hq-signal)]">
                  <p className="font-semibold">Recommended first action</p>
                  <p className="mt-1">
                    {brief.recommendedFirstAction.title}
                    {brief.recommendedFirstAction.assignedEmployeeName
                      ? ` · ${brief.recommendedFirstAction.assignedEmployeeName}`
                      : ""}
                  </p>
                  <p className="mt-1 text-xs opacity-90">
                    {brief.recommendedFirstAction.reason} · confidence{" "}
                    {brief.recommendedFirstAction.confidence}%
                  </p>
                </div>
              ) : null}

              <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <BriefList title="Top priorities" items={brief.topPriorities.map((t) => t.title)} />
                <BriefList title="Urgent emails" items={brief.urgentEmails} />
                <BriefList title="Calendar / conflicts" items={[...brief.calendarSchedule, ...brief.calendarConflicts]} />
                <BriefList title="CRM / pipeline" items={[...brief.crmFollowUps, ...brief.pipelineRisks]} />
                <BriefList title="Documents" items={brief.documentTasks} />
                <BriefList title="Overdue / approvals" items={[...brief.overdueMissions, ...brief.pendingApprovals]} />
              </div>

              {brief.disconnectedIntegrations.length > 0 || brief.unavailableSources.length > 0 ? (
                <p className="mt-4 text-xs text-[var(--hq-warn)]">
                  Unavailable sources (no fabricated data):{" "}
                  {[...brief.disconnectedIntegrations, ...brief.unavailableSources]
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h4 className="text-xl font-semibold">Today&apos;s plan</h4>
                <p className="mt-1 text-sm text-[var(--hq-muted)]">
                  Ranked by urgency, impact, and confidence. External writes need your approval.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs text-[var(--hq-muted)]">
                {plan.length} items · {pending.length} open
              </span>
            </div>

            {plan.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--hq-muted)]">No plan items detected.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {plan.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-[var(--hq-line)]/70 bg-white px-4 py-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          <span className="mr-2 text-[11px] text-[var(--hq-muted)]">{item.priority}</span>
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-[var(--hq-muted)]">
                          {item.assignedEmployeeName}
                          {item.collaboratingEmployeeNames.length > 0
                            ? ` + ${item.collaboratingEmployeeNames.join(", ")}`
                            : ""}
                          {" · "}
                          {item.source.replace(/_/g, " ")}
                          {item.requiresCeoApproval ? " · needs approval" : ""}
                        </p>
                      </div>
                      <span className="text-[11px] capitalize text-[var(--hq-muted)]">
                        {item.status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--hq-muted)]">{item.reason}</p>
                    <p className="mt-1 text-xs">
                      Action: {item.proposedAction}
                      <span className="text-[var(--hq-muted)]"> · confidence {item.confidence}%</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <StatCard title="Pending / in progress" count={pending.length} items={pending.map((p) => p.title)} />
            <StatCard title="Blocked / stale / disconnected" count={blocked.length} items={blocked.map((p) => p.title)} warn />
            <StatCard title="Completed" count={completed.length} items={completed.map((p) => p.title)} />
          </div>

          {eod ? (
            <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
              <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
                End-of-Day Report
              </p>
              <h4 className="mt-1 text-xl font-semibold">
                {eod.fullyCompleted ? "Workday complete" : "Workday partial"}
              </h4>
              <p className="mt-2 text-sm text-[var(--hq-muted)]">{eod.summary}</p>
              <p className="mt-2 text-xs text-[var(--hq-muted)]">{eod.learningNote}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <BriefList title="Completed" items={eod.completed} />
                <BriefList title="Failed" items={eod.failed} />
                <BriefList title="Still open" items={eod.pending} />
                <BriefList title="Skipped" items={eod.skipped} />
                <BriefList title="Stale" items={eod.stale} />
                <BriefList title="Blocked" items={eod.blocked} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--hq-muted)]">None</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
          {items.slice(0, 6).map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  title,
  count,
  items,
  warn,
}: {
  title: string;
  count: number;
  items: string[];
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-4">
      <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">{title}</p>
      <p className={`mt-1 text-2xl font-semibold ${warn ? "text-[var(--hq-warn)]" : ""}`}>{count}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-[var(--hq-muted)]">
          {items.slice(0, 3).map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
