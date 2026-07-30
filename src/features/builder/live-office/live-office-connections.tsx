"use client";

import type {
  LiveOfficeConnection,
  LiveOfficeEmployeeView,
} from "@/features/builder/live-office/live-office-model";
import { renderPosition } from "@/features/builder/live-office/live-office-model";

type Props = {
  employees: LiveOfficeEmployeeView[];
  connections: LiveOfficeConnection[];
};

export function LiveOfficeConnections({ employees, connections }: Props) {
  if (connections.length === 0) return null;

  const byId = new Map(employees.map((e) => [e.id, e]));

  return (
    <svg
      className="lo-connections"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      {connections.map((link) => {
        const from = byId.get(link.fromEmployeeId);
        const to = byId.get(link.toEmployeeId);
        if (!from || !to) return null;
        const a = renderPosition(from);
        const b = renderPosition(to);
        const midX = (a.x + b.x) / 2;
        const midY = Math.min(a.y, b.y) - 6;
        const d = `M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`;
        return (
          <g key={link.id} className="lo-connection">
            <path d={d} className="lo-connection__line" />
            <circle r="0.7" className="lo-connection__pulse">
              <animateMotion dur="2.4s" repeatCount="indefinite" path={d} />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}
