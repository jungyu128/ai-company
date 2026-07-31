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
import {
  AiCompanyLiveOffice,
  useLiveOfficeModel,
} from "@/features/builder/live-office/ai-company-live-office";
import { LiveOfficeConversationPanel } from "@/features/builder/live-office/live-office-conversation-panel";

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
      ops={
        <div className="hq-ops-panels space-y-10">
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
        <AiCompanyLiveOffice
          dashboard={initial}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <section id="ops-live-employees" className="hq-employee-roster mt-8 px-4 md:px-6">
          <div className="mb-4">
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Live Employee Status
            </p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-white/90">
              Real-time work state
            </h3>
            <p className="mt-1 text-sm text-white/55">
              Status and progress come from Continuous OS / Live Work Tracker — never fabricated.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {initial.employees.map((employee) => (
              <AiCompanyEmployeeCardView key={employee.id} employee={employee} />
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
