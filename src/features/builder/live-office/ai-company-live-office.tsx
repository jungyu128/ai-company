"use client";

import { useMemo, useState } from "react";
import type { AiCompanyDashboard } from "@/services/builder/company.service";
import {
  buildLiveOfficeModel,
  LIVE_OFFICE_DESKS,
  CEO_APPROVAL_ZONE,
} from "@/features/builder/live-office/live-office-model";
import { LiveOfficeDesk } from "@/features/builder/live-office/live-office-desk";
import { LiveOfficeConnections } from "@/features/builder/live-office/live-office-connections";
import { LiveOfficeConversationPanel } from "@/features/builder/live-office/live-office-conversation-panel";
import { LiveOfficeEmployeeDetails } from "@/features/builder/live-office/live-office-employee-details";

type Props = {
  dashboard: AiCompanyDashboard;
};

/** Soft department footprints derived from fixed desk seats. */
const DEPT_ZONES: Array<{
  department: string;
  left: number;
  top: number;
  width: number;
  height: number;
}> = [
  { department: "Product", left: 4, top: 12, width: 18, height: 28 },
  { department: "Platform", left: 20, top: 8, width: 18, height: 26 },
  { department: "Executive", left: 36, top: 12, width: 18, height: 28 },
  { department: "Architecture", left: 52, top: 8, width: 18, height: 26 },
  { department: "Frontend", left: 68, top: 12, width: 18, height: 28 },
  { department: "Backend", left: 10, top: 44, width: 40, height: 28 },
  { department: "Quality", left: 58, top: 44, width: 22, height: 28 },
];

const LEGEND = [
  { emoji: "🟢", label: "Idle" },
  { emoji: "💭", label: "Thinking" },
  { emoji: "✍️", label: "Working" },
  { emoji: "🚶", label: "In Discussion" },
  { emoji: "⏳", label: "Waiting Approval" },
  { emoji: "✅", label: "Completed" },
] as const;

export function AiCompanyLiveOffice({ dashboard }: Props) {
  const model = useMemo(() => buildLiveOfficeModel(dashboard), [dashboard]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = model.employees.find((e) => e.id === selectedId) ?? null;
  const deskCount = LIVE_OFFICE_DESKS.length;

  return (
    <section className="lo-root lo-workspace space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hq-mono text-xs tracking-[0.2em] text-[var(--hq-signal)] uppercase">
            Live office
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            Company floor
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">
            Watch real employee states and collaborations. Click a desk to open their conversation.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--hq-muted)]">
          {LEGEND.map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center gap-1 rounded-full bg-white/80 px-2.5 py-1"
            >
              <span aria-hidden>{item.emoji}</span>
              {item.label}
            </span>
          ))}
          <span className="hq-mono ml-1 text-[10px]">
            {deskCount} desks · {model.generatedAtDisplay}
          </span>
        </div>
      </div>

      <div className="lo-workspace__main">
        <div className="lo-floor-wrap">
          <div className="lo-floor hq-grid" role="img" aria-label="AI Company office floor">
            <div className="lo-floor__carpet" aria-hidden />

            {DEPT_ZONES.map((zone) => (
              <div
                key={zone.department}
                className="lo-dept"
                style={{
                  left: `${zone.left}%`,
                  top: `${zone.top}%`,
                  width: `${zone.width}%`,
                  height: `${zone.height}%`,
                }}
              >
                <span className="lo-dept__label">{zone.department}</span>
              </div>
            ))}

            <div
              className="lo-ceo-zone"
              style={{
                left: `${CEO_APPROVAL_ZONE.x}%`,
                top: `${CEO_APPROVAL_ZONE.y}%`,
              }}
            >
              <span className="lo-ceo-zone__label">CEO approval</span>
            </div>

            <LiveOfficeConnections
              employees={model.employees}
              connections={model.connections}
            />

            {model.employees.map((employee) => (
              <LiveOfficeDesk
                key={employee.id}
                employee={employee}
                selected={selectedId === employee.id}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </div>

        <LiveOfficeConversationPanel
          employee={selected}
          workspaceId={dashboard.workspace.activeWorkspaceId}
          activity={model.activity}
          onClear={() => setSelectedId(null)}
        />
      </div>

      <LiveOfficeEmployeeDetails employee={selected} />
    </section>
  );
}
