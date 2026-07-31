import Link from "next/link";
import { AssignEmployeeWorkForm } from "@/features/builder/components/assign-employee-work-form";
import { CollaborationChainView } from "@/features/builder/components/collaboration-chain";
import { EmployeeInboxPanel } from "@/features/builder/components/employee-inbox-panel";
import { MissionHistoryPanel } from "@/features/builder/components/mission-history-panel";
import { ExecutionHistoryList } from "@/features/builder/components/execution-center-panel";
import { PrepareExecutionForm } from "@/features/builder/components/prepare-execution-form";
import type { AiCompanyEmployeeProfile } from "@/services/builder/company.service";

const STATUS_LABEL: Record<AiCompanyEmployeeProfile["status"], string> = {
  online: "Online",
  thinking: "Thinking",
  working: "Working",
  waiting_approval: "Waiting Approval",
  collaborating: "Collaborating",
  completed: "Completed",
  offline: "Offline",
};

type Props = {
  profile: AiCompanyEmployeeProfile;
};

export function AiCompanyEmployeeProfileView({ profile }: Props) {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/builder/hq"
            className="text-xs text-[var(--hq-muted)] underline-offset-2 hover:underline"
          >
            ← Back to company
          </Link>
          <div className="mt-4 flex items-center gap-4">
            <span
              className="flex h-14 w-14 items-center justify-center rounded-full text-2xl font-semibold text-white"
              style={{ backgroundColor: profile.avatar.hue }}
            >
              {profile.avatar.initials}
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{profile.name}</h1>
              <p className="mt-1 text-[var(--hq-muted)]">
                {profile.role} · {profile.department}
              </p>
              <p className="mt-2 text-sm font-medium text-[var(--hq-signal)]">
                {STATUS_LABEL[profile.status]}
              </p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-sm text-[var(--hq-muted)]">{profile.summary}</p>
          <p className="mt-2 max-w-2xl text-xs text-[var(--hq-muted)]">
            Style: {profile.communicationStyle}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] px-4 py-3 text-sm">
          <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">Performance</p>
          <p className="mt-2">Throughput {profile.performance.throughput}%</p>
          <p>Reliability {profile.performance.reliability}%</p>
          <p>Responsiveness {profile.performance.responsiveness}%</p>
        </div>
      </div>

      <AssignEmployeeWorkForm employeeId={profile.id} employeeName={profile.name} />

      <PrepareExecutionForm employeeId={profile.id} employeeName={profile.name} />

      <EmployeeInboxPanel messages={profile.inbox} employeeName={profile.name} />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h2 className="text-lg font-semibold">Expertise</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {profile.expertise.map((item) => (
              <li
                key={item}
                className="rounded-full bg-white px-3 py-1 text-xs text-[var(--hq-muted)]"
              >
                {item}
              </li>
            ))}
          </ul>
          <h3 className="mt-5 text-sm font-semibold">Responsibilities</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--hq-muted)]">
            {profile.responsibilities.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h2 className="text-lg font-semibold">Available actions</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {profile.actions.map((a) => (
              <li key={a} className="rounded-lg bg-white px-3 py-2">
                {a}
              </li>
            ))}
          </ul>
          {profile.currentActivity ? (
            <p className="mt-4 rounded-lg bg-[var(--hq-signal-soft)] px-3 py-2 text-sm text-[var(--hq-signal)]">
              Now: {profile.currentActivity}
            </p>
          ) : null}
          {profile.liveWork ? (
            <div className="mt-4 space-y-2">
              <p className="hq-mono text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
                Live Employee Status
              </p>
              <dl className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt className="text-[var(--hq-muted)]">Live status</dt>
                <dd className="font-medium">{profile.liveWork.status}</dd>
              </div>
              <div>
                <dt className="text-[var(--hq-muted)]">Progress</dt>
                <dd className="font-medium">{profile.liveWork.progressPercent}%</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[var(--hq-muted)]">Current task</dt>
                <dd className="font-medium">
                  {profile.liveWork.currentTask ?? profile.currentTask ?? "None"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[var(--hq-muted)]">Step</dt>
                <dd className="font-medium">{profile.liveWork.currentStep}</dd>
              </div>
              {profile.liveWork.waitingFor ? (
                <div className="col-span-2">
                  <dt className="text-[var(--hq-muted)]">Waiting for</dt>
                  <dd className="font-medium text-[var(--hq-warn)]">
                    {profile.liveWork.waitingFor}
                  </dd>
                </div>
              ) : null}
              <div className="col-span-2">
                <dt className="text-[var(--hq-muted)]">Last update</dt>
                <dd className="font-medium">{profile.liveWork.lastUpdate}</dd>
              </div>
            </dl>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h2 className="text-lg font-semibold">Current work & queue</h2>
          {profile.taskQueue.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">Queue is clear.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {profile.taskQueue.map((t) => (
                <li key={t.id} className="rounded-lg border border-[var(--hq-line)]/70 bg-white px-3 py-2">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-[var(--hq-muted)] capitalize">
                    {t.state.replace(/_/g, " ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h2 className="text-lg font-semibold">Waiting approvals</h2>
          {profile.waitingApprovals.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">Nothing waiting on you.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {profile.waitingApprovals.map((a) => (
                <li key={a.id} className="rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-[var(--hq-warn)]">
                  {a.title}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h2 className="text-lg font-semibold">Completed work</h2>
          {profile.completedWork.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">No completed items linked yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm text-[var(--hq-muted)]">
              {profile.completedWork.map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h2 className="text-lg font-semibold">Recent missions</h2>
          {profile.recentMissions.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--hq-muted)]">No missions yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {profile.recentMissions.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                  <span>{m.title}</span>
                  <span className="text-xs capitalize text-[var(--hq-muted)]">
                    {m.status.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {profile.collaborationHistory.length > 0 ? (
        <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h2 className="text-lg font-semibold">Collaboration history</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {profile.collaborationHistory.slice(0, 4).map((mission) => (
              <div key={mission.id} className="rounded-xl border border-[var(--hq-line)]/70 bg-white p-4">
                <CollaborationChainView mission={mission} compact showConversation={false} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <MissionHistoryPanel records={profile.missionHistory} />

      <ExecutionHistoryList
        records={profile.executionHistory}
        title="Execution history"
      />

      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <h2 className="text-lg font-semibold">Approval history</h2>
        {profile.approvalHistory.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--hq-muted)]">No approval history yet.</p>
        ) : (
          <ul className="mt-4 space-y-3 text-sm">
            {profile.approvalHistory.map((a) => (
              <li
                key={`${a.id}-${a.updatedAt}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--hq-line)]/60 py-2 last:border-0"
              >
                <span>{a.title}</span>
                <span className="text-xs capitalize text-[var(--hq-muted)]">
                  {a.approvalStatus.replace(/_/g, " ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <h2 className="text-lg font-semibold">Activity timeline</h2>
        {profile.activityTimeline.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--hq-muted)]">No recent activity for this employee.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {profile.activityTimeline.map((e) => (
              <li
                key={e.id}
                className="grid grid-cols-[auto_1fr_auto] gap-4 border-b border-[var(--hq-line)]/60 py-2 text-sm last:border-0"
              >
                <span className="hq-mono text-[11px] text-[var(--hq-muted)]">{e.whenDisplay}</span>
                <span>{e.summary}</span>
                <span className="text-[11px] capitalize text-[var(--hq-muted)]">{e.kind}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
