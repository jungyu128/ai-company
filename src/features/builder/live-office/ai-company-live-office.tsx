"use client";

import { useMemo } from "react";
import type { AiCompanyDashboard } from "@/services/builder/company.service";
import {
  buildLiveOfficeModel,
  LIVE_OFFICE_DESKS,
} from "@/features/builder/live-office/live-office-model";
import { LiveOfficeDesk } from "@/features/builder/live-office/live-office-desk";
import { LiveOfficeConnections } from "@/features/builder/live-office/live-office-connections";
import { LiveOfficeActivityFeed } from "@/features/builder/live-office/live-office-activity-feed";

type Props = {
  dashboard: AiCompanyDashboard;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

export function AiCompanyLiveOffice({ dashboard, selectedId, onSelect }: Props) {
  const model = useMemo(() => buildLiveOfficeModel(dashboard), [dashboard]);
  const deskCount = LIVE_OFFICE_DESKS.length;
  const workingCount = model.employees.filter((e) =>
    ["working", "thinking", "discussion", "waiting_approval"].includes(e.visualState)
  ).length;
  const focusMode = selectedId != null;

  return (
    <div className="lo-stage">
      <div className={`lo-viewport${focusMode ? " lo-viewport--focus" : ""}`}>
        <div className="lo-floor" role="img" aria-label="AI Company live office">
          <div className="lo-plate" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hq/office-plate.png"
              alt=""
              className="lo-plate__img"
              draggable={false}
            />
            <div className="lo-plate__shade" />
            <div className="lo-plate__ambient">
              <span className="lo-plate__lamp-glow lo-plate__lamp-glow--a" />
              <span className="lo-plate__lamp-glow lo-plate__lamp-glow--b" />
              <span className="lo-plate__lamp-glow lo-plate__lamp-glow--c" />
              <span className="lo-plate__reflect" />
            </div>
            <div className="lo-plate__live-clock">
              <p className="lo-plate__screen-kicker">AI COMPANY · WorkPilot</p>
              <p className="lo-plate__screen-time">{model.generatedAtDisplay}</p>
            </div>
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
              dimmed={focusMode && selectedId !== employee.id}
              onSelect={(id) => onSelect(id)}
            />
          ))}

          <div className="lo-hud-chip">
            <span className="hq-live-dot" />
            <span>
              {workingCount}/{deskCount} active
            </span>
          </div>
        </div>
      </div>

      <LiveOfficeActivityFeed items={model.activity} />
    </div>
  );
}

export function useLiveOfficeModel(dashboard: AiCompanyDashboard) {
  return useMemo(() => buildLiveOfficeModel(dashboard), [dashboard]);
}
