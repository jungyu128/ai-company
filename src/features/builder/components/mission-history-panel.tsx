"use client";

import type { MissionHistoryRecord } from "@/services/builder/conversation.logic";
import { EmployeeConversationTimeline } from "@/features/builder/components/employee-conversation-timeline";

type Props = {
  records: MissionHistoryRecord[];
  compact?: boolean;
};

export function MissionHistoryPanel({ records, compact = false }: Props) {
  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <h3 className="text-xl font-semibold tracking-tight">Mission history</h3>
      <p className="mt-1 text-sm text-[var(--hq-muted)]">
        Participants, conversations, approvals, timeline, and outcomes.
      </p>
      {records.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--hq-muted)]">No missions recorded yet.</p>
      ) : (
        <ul className="mt-5 space-y-5">
          {records.slice(0, compact ? 4 : 8).map((record) => (
            <li
              key={record.id}
              className="rounded-xl border border-[var(--hq-line)]/70 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{record.title}</p>
                  <p className="mt-1 text-xs text-[var(--hq-muted)]">
                    {record.participatingEmployees.map((e) => e.name).join(" → ")}
                  </p>
                </div>
                <div className="text-right text-xs text-[var(--hq-muted)]">
                  <p className="capitalize">{record.finalOutcome.replace(/_/g, " ")}</p>
                  <p>{record.durationDisplay ?? "In progress"}</p>
                </div>
              </div>

              {!compact ? (
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <EmployeeConversationTimeline turns={record.conversations} />
                  <div>
                    <p className="hq-mono text-[10px] tracking-[0.16em] text-[var(--hq-muted)] uppercase">
                      Execution timeline
                    </p>
                    <ol className="mt-2 space-y-2 text-sm text-[var(--hq-muted)]">
                      {record.executionTimeline.map((ev) => (
                        <li key={ev.id}>{ev.summary}</li>
                      ))}
                    </ol>
                    <p className="hq-mono mt-4 text-[10px] tracking-[0.16em] text-[var(--hq-muted)] uppercase">
                      Approvals
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {record.approvals.map((a, i) => (
                        <li key={`${record.id}-ap-${i}`} className="capitalize">
                          {a.decision.replace(/_/g, " ")}
                          {a.note ? ` — ${a.note}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <p className="mt-3 line-clamp-2 text-sm text-[var(--hq-muted)]">
                  {record.conversations[0]?.body ?? record.mission}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
