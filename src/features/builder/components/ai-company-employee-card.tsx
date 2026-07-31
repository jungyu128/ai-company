"use client";

import Link from "next/link";
import type { AiCompanyEmployeeCard } from "@/services/builder/company.service";
import { buildLiveEmployeeStatus } from "@/services/builder/live-employee-status";
import { LiveEmployeeStatusBar } from "@/features/builder/components/live-employee-status-bar";

type Props = {
  employee: AiCompanyEmployeeCard;
};

export function AiCompanyEmployeeCardView({ employee }: Props) {
  const liveStatus = buildLiveEmployeeStatus({
    employeeId: employee.id,
    liveWork: employee.liveWork,
    currentTask: employee.currentTask ?? employee.liveWork.currentTask,
    lastUpdateFallback: employee.lastActivityDisplay,
  });

  return (
    <div className="space-y-2" data-employee-card={employee.id}>
      <LiveEmployeeStatusBar status={liveStatus} />
      <Link
        href={`/builder/hq/employees/${employee.id}`}
        className="group block rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5 shadow-[0_20px_50px_-44px_rgba(18,21,28,0.45)] transition hover:border-[var(--hq-signal)] hover:shadow-[0_24px_60px_-40px_rgba(15,107,92,0.35)]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full text-lg font-semibold text-white"
              style={{ backgroundColor: employee.avatar.hue }}
            >
              {employee.avatar.initials}
            </span>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">{employee.name}</h3>
              <p className="text-sm text-[var(--hq-muted)]">{employee.role}</p>
            </div>
          </div>
        </div>

        <p className="mt-4 line-clamp-2 text-sm text-[var(--hq-muted)]">{employee.summary}</p>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Workload
            </dt>
            <dd className="mt-1 font-medium">{employee.activeWorkload} active</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Done today
            </dt>
            <dd className="mt-1 font-medium">{employee.completedToday}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Approvals
            </dt>
            <dd className="mt-1 font-medium">{employee.pendingApprovals}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Last update
            </dt>
            <dd className="mt-1 font-medium text-xs">{employee.liveWork.lastUpdate}</dd>
          </div>
        </dl>
      </Link>
    </div>
  );
}
