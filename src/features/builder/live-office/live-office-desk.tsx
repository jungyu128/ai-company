"use client";

import type { CSSProperties } from "react";
import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";
import { renderPosition } from "@/features/builder/live-office/live-office-model";
import {
  employeeMotionStyle,
  monitorKindFor,
} from "@/features/builder/live-office/live-office-motion";

type Props = {
  employee: LiveOfficeEmployeeView;
  selected: boolean;
  dimmed: boolean;
  onSelect: (id: string) => void;
};

function activityVerb(employee: LiveOfficeEmployeeView): string {
  const task = (employee.currentTask ?? employee.currentActivity ?? "").toLowerCase();
  switch (employee.visualState) {
    case "waiting_approval":
      return "Waiting approval";
    case "discussion":
      return "In a call";
    case "thinking":
      return "Planning";
    case "completed":
      return "Completed";
    case "idle":
      return "Online";
    default:
      break;
  }
  if (task.includes("deploy")) return "Deploying";
  if (task.includes("design") || task.includes("ui")) return "Designing";
  if (task.includes("analy")) return "Analyzing";
  if (task.includes("review") || task.includes("pr") || task.includes("pull"))
    return "Reviewing";
  if (task.includes("doc") || task.includes("read") || task.includes("brief"))
    return "Reading";
  if (task.includes("code") || task.includes("build") || task.includes("implement"))
    return "Coding";
  return "Coding";
}

function labelBias(employeeId: string): "left" | "right" | "center" {
  const left = new Set(["emma", "david", "olivia"]);
  const right = new Set(["sarah", "noah", "ethan"]);
  if (left.has(employeeId)) return "left";
  if (right.has(employeeId)) return "right";
  return "center";
}

function MonitorPreview({ kind }: { kind: ReturnType<typeof monitorKindFor> }) {
  switch (kind) {
    case "chart":
      return (
        <span className="lo-mon lo-mon--chart">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      );
    case "email":
      return (
        <span className="lo-mon lo-mon--email">
          <i />
          <i />
          <i />
        </span>
      );
    case "design":
      return (
        <span className="lo-mon lo-mon--design">
          <i />
          <b />
        </span>
      );
    case "document":
      return (
        <span className="lo-mon lo-mon--doc">
          <i />
          <i />
          <i />
          <i />
        </span>
      );
    case "code":
    default:
      return (
        <span className="lo-mon lo-mon--code">
          <i />
          <i />
          <i />
          <i />
          <span className="lo-mon__cursor" />
        </span>
      );
  }
}

export function LiveOfficeDesk({ employee, selected, dimmed, onSelect }: Props) {
  const pos = renderPosition(employee);
  const stateClass = `lo-desk--${employee.visualState}`;
  const task = employee.currentTask ?? employee.currentActivity ?? "Standing by";
  const verb = activityVerb(employee);
  const bias = labelBias(employee.id);
  const kind = monitorKindFor(employee);
  const z = selected ? 50 : Math.round(14 + pos.y);
  const motion = employeeMotionStyle(employee.id);

  return (
    <button
      type="button"
      className={[
        "lo-desk",
        `lo-desk--bias-${bias}`,
        stateClass,
        selected ? "lo-desk--selected" : "",
        dimmed ? "lo-desk--dimmed" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        {
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          zIndex: z,
          ...motion,
        } as CSSProperties
      }
      onClick={() => onSelect(employee.id)}
      aria-pressed={selected}
      aria-label={`${employee.name}, ${employee.role}, ${verb}`}
    >
      <span className="lo-desk__seat" aria-hidden>
        <span className="lo-desk__figure">
          <span
            className="lo-desk__head"
            style={{ backgroundColor: employee.avatar.hue }}
          >
            <span className="lo-desk__blink" />
          </span>
          <span className="lo-desk__shoulders" />
        </span>
        <span className={`lo-desk__screen lo-desk__screen--${kind}`}>
          <MonitorPreview kind={kind} />
          <span className="lo-desk__monitor-glow" />
        </span>
        <span className="lo-desk__hands">
          <span className="lo-desk__mouse" />
          <span className="lo-desk__keys" />
        </span>
        <span className="lo-desk__lamp" />
      </span>

      <span className="lo-desk__tag">
        <span className="lo-desk__tag-top">
          <span
            className="lo-desk__avatar"
            style={{ backgroundColor: employee.avatar.hue }}
          >
            {employee.avatar.initials}
          </span>
          <span className={`lo-desk__dot lo-desk__dot--${employee.visualState}`} />
          <span className="lo-desk__who">
            <span className="lo-desk__name">{employee.name}</span>
            <span className="lo-desk__role">{employee.role}</span>
          </span>
        </span>
        <span className="lo-desk__verb">{verb}</span>
        <span className="lo-desk__task" title={task}>
          {task}
        </span>
      </span>
    </button>
  );
}
