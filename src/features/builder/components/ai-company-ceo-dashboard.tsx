"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { AiCompanyDashboard } from "@/services/builder/company.service";
import { CeoApprovalCenter } from "@/features/builder/components/ceo-approval-center";
import { CollaborationChainView } from "@/features/builder/components/collaboration-chain";
import { CompanyActivityFeed } from "@/features/builder/components/company-activity-feed";
import { MissionHistoryPanel } from "@/features/builder/components/mission-history-panel";
import { CeoCommandCenterView } from "@/features/builder/components/ceo-command-center";
import { AutonomousWorkdayPanel } from "@/features/builder/components/autonomous-workday-panel";
import { CompanyMemoryPanel } from "@/features/builder/components/company-memory-panel";
import { WorkspaceCollaborationPanel } from "@/features/builder/components/workspace-collaboration-panel";
import { AiCompanyExecutiveDashboard } from "@/features/builder/components/ai-company-executive-dashboard";
import { AiCompanyLiveOffice } from "@/features/builder/live-office/ai-company-live-office";

type Props = {
  initial: AiCompanyDashboard;
};

export function AiCompanyCeoDashboard({ initial }: Props) {
  const router = useRouter();
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

  return (
    <div className="space-y-8">
      <section className="lo-hq-hero">
        <div className="min-w-0 flex-1">
          <p className="hq-mono text-xs tracking-[0.2em] text-[var(--hq-signal)] uppercase">
            WorkPilot OS · Live HQ
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">
            {initial.headline}
          </h2>
          {initial.briefing ? (
            <p className="mt-2 max-w-3xl line-clamp-2 text-sm leading-relaxed text-[var(--hq-muted)]">
              {initial.briefing}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-[var(--hq-signal-soft)] px-3 py-1 text-[var(--hq-signal)]">
              {initial.employees.length} AI Employees
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-[var(--hq-muted)]">
              {initial.commandCenter.workday.phaseLabel}
            </span>
            <span className="rounded-full bg-white px-3 py-1 text-[var(--hq-muted)]">
              Health {initial.companyHealth.score}% · {initial.companyHealth.label}
            </span>
            <Link
              href={`/builder/hq/onboarding?workspaceId=${encodeURIComponent(initial.workspace.activeWorkspaceId)}`}
              className="rounded-full bg-white px-3 py-1 text-[var(--hq-signal)] underline-offset-2 hover:underline"
            >
              Launch readiness
            </Link>
          </div>
        </div>

        <aside className="lo-hq-approvals">
          <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-warn)] uppercase">
            Needs approval
          </p>
          {initial.pendingApprovals.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--hq-muted)]">Queue clear.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {initial.pendingApprovals.slice(0, 3).map((a) => (
                <li key={a.id} className="rounded-lg bg-white/90 px-2.5 py-2">
                  <p className="text-sm font-medium leading-snug">{a.title}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--hq-muted)]">
                    {a.requestingEmployee.name}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className="hq-mono mt-3 text-[10px] text-[var(--hq-muted)]">
            Updated {initial.generatedAtDisplay}
          </p>
        </aside>
      </section>

      <AiCompanyLiveOffice dashboard={initial} />

      <CeoApprovalCenter items={initial.pendingApprovals} />

      <CeoCommandCenterView commandCenter={initial.commandCenter} />

      <details className="lo-ops">
        <summary className="lo-ops__summary">
          <span>
            <span className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-muted)] uppercase">
              Operations
            </span>
            <span className="mt-1 block text-lg font-semibold tracking-tight">
              Executive, memory, workspace & history
            </span>
          </span>
          <span className="lo-ops__hint text-xs text-[var(--hq-muted)]">Toggle secondary panels</span>
        </summary>

        <div className="lo-ops__body space-y-10">
          <AiCompanyExecutiveDashboard
            initial={initial.executive}
            workspaceId={initial.workspace.activeWorkspaceId}
          />

          <WorkspaceCollaborationPanel
            activeWorkspaceId={initial.workspace.activeWorkspaceId}
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
              <h3 className="text-xl font-semibold tracking-tight">Active collaborations</h3>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                {initial.activeCollaborations.slice(0, 4).map((mission) => (
                  <div
                    key={mission.id}
                    className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5"
                  >
                    <CollaborationChainView mission={mission} />
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <p className="text-center text-xs text-[var(--hq-muted)]">
            <Link href="/dashboard" className="underline-offset-2 hover:underline">
              WorkPilot product →
            </Link>
          </p>
        </div>
      </details>
    </div>
  );
}
