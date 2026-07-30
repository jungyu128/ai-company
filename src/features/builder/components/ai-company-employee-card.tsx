"use client";

import Link from "next/link";
import type { AiCompanyEmployeeCard } from "@/services/builder/company.service";

const STATUS_LABEL: Record<AiCompanyEmployeeCard["status"], string> = {
  online: "Online",
  thinking: "Thinking",
  working: "Working",
  waiting_approval: "Waiting Approval",
  collaborating: "Collaborating",
  completed: "Completed",
  offline: "Offline",
};

const STATUS_DOT: Record<AiCompanyEmployeeCard["status"], string> = {
  online: "bg-[var(--hq-signal)]",
  thinking: "bg-sky-500",
  working: "bg-[var(--hq-live)]",
  waiting_approval: "bg-[var(--hq-warn)]",
  collaborating: "bg-indigo-500",
  completed: "bg-emerald-600",
  offline: "bg-[var(--hq-muted)]",
};

type Props = {
  employee: AiCompanyEmployeeCard;
};

export function AiCompanyEmployeeCardView({ employee }: Props) {
  return (
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[var(--hq-ink)]">
          <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[employee.status]}`} />
          {STATUS_LABEL[employee.status]}
        </span>
      </div>

      <p className="mt-4 line-clamp-2 text-sm text-[var(--hq-muted)]">{employee.summary}</p>

      {employee.currentActivity ? (
        <p className="mt-3 line-clamp-2 text-xs text-[var(--hq-signal)]">{employee.currentActivity}</p>
      ) : null}

      <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">Current work</dt>
          <dd className="mt-1 font-medium line-clamp-2">
            {employee.currentTask ?? "Ready for assignment"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">Workload</dt>
          <dd className="mt-1 font-medium">{employee.activeWorkload} active</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">Done today</dt>
          <dd className="mt-1 font-medium">{employee.completedToday}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">Approvals</dt>
          <dd className="mt-1 font-medium">{employee.pendingApprovals}</dd>
        </div>
      </dl>

      <div className="mt-5 flex items-end justify-between gap-3 border-t border-[var(--hq-line)]/70 pt-4">
        <div className="flex gap-3 text-[11px] text-[var(--hq-muted)]">
          <span>Thru {employee.performance.throughput}%</span>
          <span>Rel {employee.performance.reliability}%</span>
          <span>Resp {employee.performance.responsiveness}%</span>
        </div>
        <p className="hq-mono text-[10px] text-[var(--hq-muted)]">{employee.lastActivityDisplay}</p>
      </div>
    </Link>
  );
}
