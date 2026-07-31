"use client";

import type { LiveEmployeeStatusView } from "@/services/builder/live-employee-status";

const STATUS_TONE: Record<LiveEmployeeStatusView["status"], string> = {
  Idle: "bg-[var(--hq-muted)]",
  Planning: "bg-sky-500",
  Working: "bg-[var(--hq-live)]",
  Reviewing: "bg-indigo-500",
  Waiting: "bg-[var(--hq-warn)]",
  Blocked: "bg-red-600",
  Completed: "bg-emerald-600",
};

type Props = {
  status: LiveEmployeeStatusView;
  compact?: boolean;
};

/**
 * Real-time live status strip — placed above each employee card / desk tag.
 */
export function LiveEmployeeStatusBar({ status, compact = false }: Props) {
  return (
    <div
      className={
        compact
          ? "lo-live-status lo-live-status--compact"
          : "rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-xs shadow-sm"
      }
      data-live-employee-status={status.employeeId}
      data-live-status={status.status}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-medium text-[var(--hq-ink)]">
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_TONE[status.status]}`}
            aria-hidden
          />
          {status.status}
        </span>
        <span className="hq-mono text-[10px] text-[var(--hq-muted)]">
          {status.progress}%
        </span>
      </div>
      <p className="mt-1 line-clamp-1 text-[var(--hq-muted)]">
        Task: {status.currentTask ?? "None"}
      </p>
      <p className="mt-0.5 line-clamp-1 text-[var(--hq-muted)]">
        Step: {status.currentStep}
      </p>
      {status.waitingFor ? (
        <p className="mt-0.5 line-clamp-1 text-[var(--hq-warn)]">
          Waiting: {status.waitingFor}
        </p>
      ) : null}
      <p className="mt-0.5 hq-mono text-[10px] text-[var(--hq-muted)]">
        Updated {status.lastUpdate}
      </p>
    </div>
  );
}
