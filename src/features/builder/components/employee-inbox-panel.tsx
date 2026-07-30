"use client";

import type { InboxMessage } from "@/services/builder/conversation.logic";

type Props = {
  messages: InboxMessage[];
  employeeName: string;
};

const STATUS_LABEL: Record<InboxMessage["status"], string> = {
  received: "Received work",
  waiting_reply: "Waiting for reply",
  sent: "Sent to teammate",
  completed: "Completed",
};

export function EmployeeInboxPanel({ messages, employeeName }: Props) {
  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <h2 className="text-lg font-semibold">{employeeName}&apos;s inbox</h2>
      <p className="mt-1 text-sm text-[var(--hq-muted)]">
        Internal handoffs — receive work, send work, wait for replies, complete tasks.
      </p>
      {messages.length === 0 ? (
        <p className="mt-4 text-sm text-[var(--hq-muted)]">Inbox is empty.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {messages.map((msg) => (
            <li
              key={msg.id}
              className="rounded-xl border border-[var(--hq-line)]/70 bg-white px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{msg.subject}</p>
                <span className="text-[11px] text-[var(--hq-signal)]">
                  {STATUS_LABEL[msg.status]}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--hq-muted)]">From {msg.fromName}</p>
              <p className="mt-2 text-[var(--hq-ink)]">{msg.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
