"use client";

import type { CollaborationMission, CollaborationStep } from "@/services/builder/collaboration.logic";
import { EmployeeConversationTimeline } from "@/features/builder/components/employee-conversation-timeline";

const STEP_LABEL: Record<CollaborationStep["status"], string> = {
  queued: "Queued",
  thinking: "Thinking",
  working: "Working",
  collaborating: "Collaborating",
  waiting_approval: "Waiting approval",
  completed: "Completed",
  blocked: "Blocked",
};

type Props = {
  mission: CollaborationMission;
  compact?: boolean;
  showConversation?: boolean;
};

export function CollaborationChainView({
  mission,
  compact = false,
  showConversation = true,
}: Props) {
  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {!compact ? (
        <div>
          <p className="hq-mono text-[10px] tracking-[0.16em] text-[var(--hq-muted)] uppercase">
            Collaboration chain
          </p>
          <p className="mt-1 text-sm font-medium">{mission.title}</p>
        </div>
      ) : null}
      <ol className="flex flex-col gap-0">
        {mission.chain.map((step, index) => (
          <li key={`${mission.id}-${step.employeeId}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
            {index < mission.chain.length - 1 ? (
              <span
                className="absolute top-8 left-[15px] h-[calc(100%-1.25rem)] w-px bg-[var(--hq-line)]"
                aria-hidden
              />
            ) : null}
            <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--hq-line)] bg-white text-xs font-semibold text-[var(--hq-ink)]">
              {step.employeeName.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-sm font-medium">
                  {step.employeeName}
                  <span className="font-normal text-[var(--hq-muted)]"> · {step.role}</span>
                </p>
                <span className="text-[11px] text-[var(--hq-signal)]">
                  {STEP_LABEL[step.status]}
                </span>
              </div>
              {!compact ? (
                <p className="mt-1 text-xs leading-relaxed text-[var(--hq-muted)]">{step.message}</p>
              ) : null}
            </div>
          </li>
        ))}
        <li className="relative flex gap-3">
          <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--hq-warn-soft)] text-[10px] font-semibold text-[var(--hq-warn)]">
            CEO
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-sm font-medium">CEO Approval</p>
            <p className="mt-0.5 text-xs capitalize text-[var(--hq-muted)]">
              {mission.approvalStatus.replace(/_/g, " ")}
            </p>
          </div>
        </li>
      </ol>
      {!compact && showConversation && mission.conversations?.length ? (
        <div className="border-t border-[var(--hq-line)]/60 pt-4">
          <EmployeeConversationTimeline turns={mission.conversations} />
        </div>
      ) : null}
    </div>
  );
}
