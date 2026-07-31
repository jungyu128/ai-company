"use client";

import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";
import { LIVE_OFFICE_VISUAL_META } from "@/features/builder/live-office/live-office-visual-state";

type Props = {
  employee: LiveOfficeEmployeeView | null;
};

function progressFor(employee: LiveOfficeEmployeeView): number | null {
  const pct = employee.liveWork.progressPercent;
  if (typeof pct === "number" && pct > 0) {
    return Math.min(100, Math.max(0, Math.round(pct)));
  }
  if (employee.visualState === "completed") return 100;
  if (employee.visualState === "idle") return 0;
  return null;
}

function nextStepFor(employee: LiveOfficeEmployeeView): string {
  if (employee.liveWork.nextPlannedAction?.trim()) {
    return employee.liveWork.nextPlannedAction.trim();
  }
  switch (employee.visualState) {
    case "waiting_approval":
      return "Waiting for CEO approval";
    case "waiting":
      return employee.liveWork.waitingFor
        ? `Waiting: ${employee.liveWork.waitingFor}`
        : "Waiting";
    case "discussion":
      return employee.discussionPartnerName
        ? `Discussing with ${employee.discussionPartnerName}`
        : employee.relatedMissionTitle
          ? `Continue collaboration on “${employee.relatedMissionTitle}”`
          : "In discussion";
    case "blocked":
      return employee.liveWork.waitingFor
        ? `Blocked: ${employee.liveWork.waitingFor}`
        : "Work is blocked";
    case "working":
    case "planning":
    case "reviewing":
      return (
        employee.liveWork.currentStep ||
        employee.currentTask ||
        LIVE_OFFICE_VISUAL_META[employee.visualState].label
      );
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
  const task =
    employee.liveWork.currentTask ??
    employee.currentTask ??
    "Ready for assignment";
  const step =
    employee.liveWork.currentStep ||
    employee.currentActivity ||
    "No active step recorded.";

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
          <p className="lo-details__value">{task}</p>
        </div>
        <div>
          <p className="lo-details__label">Progress</p>
          {progress != null ? (
            <div className="mt-2 flex items-center gap-3">
              <div className="lo-details__bar" aria-hidden>
                <span style={{ width: `${progress}%` }} />
              </div>
              <span className="hq-mono text-xs text-[var(--hq-muted)]">{progress}%</span>
            </div>
          ) : (
            <p className="lo-details__value mt-1">No progress recorded</p>
          )}
          <p className="mt-1 text-xs text-[var(--hq-muted)]">
            {employee.activeWorkload} active · {employee.completedToday} done today
          </p>
        </div>
        <div>
          <p className="lo-details__label">Current step</p>
          <p className="lo-details__value">{step}</p>
        </div>
        <div>
          <p className="lo-details__label">Next step</p>
          <p className="lo-details__value">{nextStepFor(employee)}</p>
        </div>
      </div>
    </section>
  );
}
