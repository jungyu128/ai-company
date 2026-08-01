"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AiCompanyDashboard } from "@/services/builder/company.service";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import { CeoApprovalQueue } from "@/features/builder/components/ceo-approval-queue";
import { CollaborationChainView } from "@/features/builder/components/collaboration-chain";
import { CompanyActivityFeed } from "@/features/builder/components/company-activity-feed";
import { CompanyActivityTimeline } from "@/features/builder/components/company-activity-timeline";
import { MissionHistoryPanel } from "@/features/builder/components/mission-history-panel";
import { CeoCommandCenterView } from "@/features/builder/components/ceo-command-center";
import { AutonomousWorkdayPanel } from "@/features/builder/components/autonomous-workday-panel";
import { CompanyMemoryPanel } from "@/features/builder/components/company-memory-panel";
import { WorkspaceCollaborationPanel } from "@/features/builder/components/workspace-collaboration-panel";
import { AiCompanyExecutiveDashboard } from "@/features/builder/components/ai-company-executive-dashboard";
import { CompanyAnalyticsPanel } from "@/features/builder/components/company-analytics-panel";
import { HqShell } from "@/features/builder/components/hq-shell";
import { HqRecommendationCards } from "@/features/builder/components/hq-recommendation-cards";
import { AiCompanyEmployeeCardView } from "@/features/builder/components/ai-company-employee-card";
import { LiveEmployeeStatusBar } from "@/features/builder/components/live-employee-status-bar";
import { buildLiveEmployeeStatus } from "@/services/builder/live-employee-status";
import {
  AiCompanyLiveOffice,
  useLiveOfficeModel,
} from "@/features/builder/live-office/ai-company-live-office";
import { LiveOfficeConversationPanel } from "@/features/builder/live-office/live-office-conversation-panel";
import {
  CeoOperatingCenter,
  CeoOperatingCenterStrip,
} from "@/features/builder/components/ceo-operating-center";

type Props = {
  initial: AiCompanyDashboard;
};

function relatedRecommendationFor(
  employeeId: string | null,
  recommendations: EmployeeRecommendation[]
): EmployeeRecommendation | null {
  if (!employeeId) return null;
  return (
    recommendations.find(
      (r) =>
        (r.status === "pending" || r.status === "questioned") &&
        (r.conversationOwnerId === employeeId ||
          r.leadEmployeeId === employeeId ||
          r.participatingEmployees.some((p) => p.id === employeeId))
    ) ?? null
  );
}

export function AiCompanyCeoDashboard({ initial }: Props) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const model = useLiveOfficeModel(initial);
  const selected = model.employees.find((e) => e.id === selectedId) ?? null;
  const relatedRec = useMemo(
    () => relatedRecommendationFor(selectedId, initial.recommendations),
    [selectedId, initial.recommendations]
  );

  const live =
    initial.ceoApprovalQueue.count > 0 ||
    initial.pendingApprovals.length > 0 ||
    initial.activeCollaborations.length > 0 ||
    initial.recommendations.some((r) => r.status === "pending") ||
    initial.commandCenter.workday.phase === "working";

  const onlineCount = initial.employees.filter((e) => e.status !== "offline").length;

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => router.refresh(), 12_000);
    return () => window.clearInterval(id);
  }, [live, router]);

  const workspaceId = initial.workspace.activeWorkspaceId;

  // Employees proactively open the conversation for reports / risks / approvals.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/builder/hq/chat?proactive=1&workspaceId=${encodeURIComponent(workspaceId)}`
        );
        const data = (await res.json()) as { ok?: boolean; employeeIds?: string[] };
        if (cancelled || !res.ok || !data.ok || !data.employeeIds?.length) return;
        setSelectedId((current) => current ?? data.employeeIds![0] ?? null);
      } catch {
        /* ignore — selection remains manual */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workspaceId, initial.recommendations.length, initial.pendingApprovals.length]);

  return (
    <HqShell
      workspaceId={workspaceId}
      live={live}
      onlineCount={onlineCount}
      approvalCount={initial.ceoApprovalQueue.count}
      operatingCenterCount={
        initial.operatingCenter.decisionCenter.count +
        initial.operatingCenter.criticalAlerts.length
      }
      ops={
        <div className="hq-ops-panels space-y-10">
          <section id="ops-operating-center">
            <CeoOperatingCenter center={initial.operatingCenter} />
          </section>
          <section id="ops-approvals">
            <CeoApprovalQueue
              items={initial.ceoApprovalQueue.items}
              protectedCount={initial.ceoApprovalQueue.protectedCount}
            />
          </section>
          <section id="ops-command">
            <CeoCommandCenterView commandCenter={initial.commandCenter} />
          </section>
          <section id="ops-executive">
            <AiCompanyExecutiveDashboard
              initial={initial.executive}
              workspaceId={workspaceId}
            />
          </section>
          <section id="ops-analytics">
            <CompanyAnalyticsPanel workspaceId={workspaceId} />
          </section>
          <section id="ops-workspace">
            <WorkspaceCollaborationPanel
              activeWorkspaceId={workspaceId}
              workspaces={initial.workspace.workspaces}
              members={initial.workspace.members}
              activityTimeline={initial.workspace.activityTimeline}
              notifications={initial.workspace.notifications}
            />
          </section>
          <section id="ops-workday">
            <AutonomousWorkdayPanel workday={initial.commandCenter.autonomousWorkday} />
          </section>
          <section id="ops-memory">
            <CompanyMemoryPanel
              learnedPreferences={initial.commandCenter.companyMemory.learnedPreferences}
              newInsights={initial.commandCenter.companyMemory.newInsights}
              recentlyUpdated={initial.commandCenter.companyMemory.recentlyUpdated}
              lastLearnedAt={initial.commandCenter.companyMemory.lastLearnedAt}
            />
          </section>
          <section id="ops-activity" className="grid gap-6 lg:grid-cols-2">
            <CompanyActivityTimeline events={initial.companyTimeline.events} />
            <div className="space-y-6">
              <CompanyActivityFeed items={initial.activityFeed} />
              <MissionHistoryPanel records={initial.missionHistory} compact />
            </div>
          </section>
          <section id="ops-collaborations">
            {initial.activeCollaborations.length > 0 ? (
              <>
                <h3 className="text-xl font-semibold tracking-tight text-white/90">
                  Active collaborations
                </h3>
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {initial.activeCollaborations.slice(0, 4).map((mission) => (
                    <div key={mission.id} className="hq-glass-panel p-5">
                      <CollaborationChainView mission={mission} />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-sm text-white/50">No active collaborations.</p>
            )}
          </section>
          <p className="text-center text-xs text-white/45">
            <Link href="/login" className="underline-offset-2 hover:underline">
              Owner session →
            </Link>
          </p>
        </div>
      }
    >
      <div className="hq-main">
        <div className="mb-4 px-1">
          <CeoOperatingCenterStrip center={initial.operatingCenter} />
        </div>

        <AiCompanyLiveOffice
          dashboard={initial}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <section
          id="ops-live-employees"
          className="hq-live-status-section"
          aria-label="Live Employee Status"
        >
          <div className="hq-live-status-section__head">
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Live Employee Status
            </p>
            <h3 className="text-xl font-semibold tracking-tight text-white/90">
              Real-time work state
            </h3>
            <p className="text-sm text-white/55">
              Status and progress come from Continuous OS / Live Work Tracker —
              never fabricated.
            </p>
          </div>
          <div className="hq-live-status-grid">
            {initial.employees.map((employee) => (
              <LiveEmployeeStatusBar
                key={`status-${employee.id}`}
                status={buildLiveEmployeeStatus({
                  employeeId: employee.id,
                  liveWork: employee.liveWork,
                  currentTask:
                    employee.currentTask ?? employee.liveWork.currentTask,
                  lastUpdateFallback: employee.lastActivityDisplay,
                })}
              />
            ))}
          </div>
        </section>

        <section
          id="ops-employee-cards"
          className="hq-employee-cards"
          aria-label="Employee cards"
        >
          <div className="hq-employee-cards__head">
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Team
            </p>
            <h3 className="text-xl font-semibold tracking-tight text-white/90">
              Employee cards
            </h3>
          </div>
          <div className="hq-employee-cards-grid">
            {initial.employees.map((employee) => (
              <div key={employee.id} className="hq-employee-card-slot">
                <AiCompanyEmployeeCardView employee={employee} />
              </div>
            ))}
          </div>
        </section>

        <div className="hq-dock">
          <HqRecommendationCards
            recommendations={initial.recommendations}
            selectedEmployeeId={selectedId}
            onSelectEmployee={setSelectedId}
          />
          <LiveOfficeConversationPanel
            employee={selected}
            workspaceId={workspaceId}
            relatedRecommendation={relatedRec}
          />
        </div>
      </div>
    </HqShell>
  );
}
