"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { AiCompanyDashboard } from "@/services/builder/company.service";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import { CeoApprovalCenter } from "@/features/builder/components/ceo-approval-center";
import { CollaborationChainView } from "@/features/builder/components/collaboration-chain";
import { CompanyActivityFeed } from "@/features/builder/components/company-activity-feed";
import { MissionHistoryPanel } from "@/features/builder/components/mission-history-panel";
import { CeoCommandCenterView } from "@/features/builder/components/ceo-command-center";
import { AutonomousWorkdayPanel } from "@/features/builder/components/autonomous-workday-panel";
import { CompanyMemoryPanel } from "@/features/builder/components/company-memory-panel";
import { WorkspaceCollaborationPanel } from "@/features/builder/components/workspace-collaboration-panel";
import { AiCompanyExecutiveDashboard } from "@/features/builder/components/ai-company-executive-dashboard";
import { HqShell } from "@/features/builder/components/hq-shell";
import { HqRecommendationCards } from "@/features/builder/components/hq-recommendation-cards";
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
    initial.pendingApprovals.length > 0 ||
    initial.activeCollaborations.length > 0 ||
    initial.recommendations.some((r) => r.status === "pending") ||
    initial.commandCenter.workday.phase === "working";

  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => router.refresh(), 12_000);
    return () => window.clearInterval(id);
  }, [live, router]);

  const workspaceId = initial.workspace.activeWorkspaceId;

  return (
    <HqShell
      workspaceId={workspaceId}
      headline={initial.headline}
      live={live}
      healthLabel={`Health ${initial.companyHealth.score}% · ${initial.companyHealth.label}`}
      approvalCount={initial.pendingApprovals.length}
      ops={
        <div className="hq-ops-panels space-y-10">
          <CeoApprovalCenter items={initial.pendingApprovals} />
          <CeoCommandCenterView commandCenter={initial.commandCenter} />
          <AiCompanyExecutiveDashboard
            initial={initial.executive}
            workspaceId={workspaceId}
          />
          <WorkspaceCollaborationPanel
            activeWorkspaceId={workspaceId}
            workspaces={initial.workspace.workspaces}
            members={initial.workspace.members}
            activityTimeline={initial.workspace.activityTimeline}
            notifications={initial.workspace.notifications}
          />
          <AutonomousWorkdayPanel workday={initial.commandCenter.autonomousWorkday} />
          <CompanyMemoryPanel
            learnedPreferences={initial.commandCenter.companyMemory.learnedPreferences}
            newInsights={initial.commandCenter.companyMemory.newInsights}
            recentlyUpdated={initial.commandCenter.companyMemory.recentlyUpdated}
            lastLearnedAt={initial.commandCenter.companyMemory.lastLearnedAt}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <CompanyActivityFeed items={initial.activityFeed} />
            <MissionHistoryPanel records={initial.missionHistory} compact />
          </div>
          {initial.activeCollaborations.length > 0 ? (
            <section>
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
            </section>
          ) : null}
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
