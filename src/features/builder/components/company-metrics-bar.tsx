"use client";

import type { CompanyDashboardMetrics } from "@/services/builder/conversation.logic";

type Props = {
  metrics: CompanyDashboardMetrics;
};

export function CompanyMetricsBar({ metrics }: Props) {
  const cells = [
    { label: "Active Missions", value: String(metrics.activeMissions) },
    { label: "Employees Working", value: String(metrics.employeesWorking) },
    { label: "Waiting for Approval", value: String(metrics.waitingForApproval) },
    { label: "Completed Today", value: String(metrics.completedToday) },
    {
      label: "Avg Completion",
      value: metrics.averageCompletionTimeDisplay ?? "—",
    },
    { label: "Company Productivity", value: `${metrics.companyProductivity}%` },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] px-4 py-3"
        >
          <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">{cell.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{cell.value}</p>
        </div>
      ))}
    </section>
  );
}
