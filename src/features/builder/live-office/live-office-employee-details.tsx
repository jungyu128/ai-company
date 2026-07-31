"use client";

import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";

type Props = {
  employee: LiveOfficeEmployeeView | null;
};

function progressFor(employee: LiveOfficeEmployeeView): number {
  switch (employee.visualState) {
    case "idle":
      return 8;
    case "thinking":
      return 28;
    case "working":
      return 52;
    case "discussion":
      return 64;
    case "waiting_approval":
      return 86;
    case "completed":
      return 100;
    default:
      return 8;
  }
}

function nextStepFor(employee: LiveOfficeEmployeeView): string {
  switch (employee.visualState) {
    case "waiting_approval":
      return "Awaiting CEO approval";
    case "discussion":
      return employee.relatedMissionTitle
        ? `Continue collaboration on “${employee.relatedMissionTitle}”`
        : "Continue peer discussion";
    case "working":
      return employee.currentTask
        ? `Finish: ${employee.currentTask}`
        : "Complete current assignment";
    case "thinking":
      return "Form next recommendation from live signals";
    case "completed":
      return "Return to desk and stand by";
    case "idle":
    default:
      return "Ready for the next mission";
  }
}

export function LiveOfficeEmployeeDetails({ employee }: Props) {
  if (!employee) {
    return (
      <section className="lo-details lo-details--empty">
        <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-muted)] uppercase">
          Selected employee
        </p>
        <p className="mt-2 text-sm text-[var(--hq-muted)]">
          Click a desk on the floor to inspect task, progress, reasoning, and next step.
        </p>
      </section>
    );
  }

  const progress = progressFor(employee);

  return (
    <section className="lo-details" aria-label={`${employee.name} work details`}>
      <div className="lo-details__identity">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: employee.avatar.hue }}
        >
          {employee.avatar.initials}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-semibold tracking-tight">{employee.name}</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px]">
              <span aria-hidden>{employee.visualEmoji}</span>
              {employee.visualLabel}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--hq-muted)]">
            {employee.role} · {employee.department}
          </p>
        </div>
      </div>

      <div className="lo-details__grid">
        <div>
          <p className="lo-details__label">Current task</p>
          <p className="lo-details__value">{employee.currentTask ?? "Ready for assignment"}</p>
        </div>
        <div>
          <p className="lo-details__label">Progress</p>
          <div className="mt-2 flex items-center gap-3">
            <div className="lo-details__bar" aria-hidden>
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="hq-mono text-xs text-[var(--hq-muted)]">{progress}%</span>
          </div>
          <p className="mt-1 text-xs text-[var(--hq-muted)]">
            {employee.activeWorkload} active · {employee.completedToday} done today
          </p>
        </div>
        <div>
          <p className="lo-details__label">Reasoning summary</p>
          <p className="lo-details__value">
            {employee.currentActivity ?? "No active reasoning stream."}
          </p>
        </div>
        <div>
          <p className="lo-details__label">Next step</p>
          <p className="lo-details__value">{nextStepFor(employee)}</p>
        </div>
      </div>
    </section>
  );
}
