"use client";

import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";
import { renderPosition } from "@/features/builder/live-office/live-office-model";

type Props = {
  employee: LiveOfficeEmployeeView;
  selected: boolean;
  onSelect: (id: string) => void;
};

export function LiveOfficeDesk({ employee, selected, onSelect }: Props) {
  const pos = renderPosition(employee);
  const stateClass = `lo-desk--${employee.visualState}`;

  return (
    <button
      type="button"
      className={`lo-desk ${stateClass} ${selected ? "lo-desk--selected" : ""}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
      onClick={() => onSelect(employee.id)}
      aria-label={`${employee.name}, ${employee.visualLabel}`}
    >
      <span className="lo-desk__glow" aria-hidden />
      <span
        className="lo-desk__avatar"
        style={{ backgroundColor: employee.avatar.hue }}
      >
        {employee.avatar.initials}
      </span>
      <span className="lo-desk__monitor" aria-hidden>
        <span className="lo-desk__cursor" />
      </span>
      <span className="lo-desk__meta">
        <span className="lo-desk__name">{employee.name}</span>
        <span className="lo-desk__state">
          <span aria-hidden>{employee.visualEmoji}</span> {employee.visualLabel}
        </span>
      </span>
      {employee.visualState === "thinking" ? (
        <span className="lo-desk__think" aria-hidden>
          ···
        </span>
      ) : null}
      {employee.visualState === "discussion" ? (
        <span className="lo-desk__standup" aria-hidden />
      ) : null}
    </button>
  );
}
