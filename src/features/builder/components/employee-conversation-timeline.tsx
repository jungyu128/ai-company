"use client";

import type { ConversationTurn } from "@/services/builder/conversation.logic";

type Props = {
  turns: ConversationTurn[];
  title?: string;
};

function isSystemEvent(turn: ConversationTurn): boolean {
  return turn.employeeId === "system" || turn.kind === "system";
}

function isStructuredSynthesis(turn: ConversationTurn): boolean {
  return (
    turn.kind === "request" &&
    /\nRecommendation\n/.test(turn.body) &&
    /\nReasoning\n/.test(turn.body)
  );
}

export function EmployeeConversationTimeline({ turns, title = "Employee conversation" }: Props) {
  if (turns.length === 0) {
    return (
      <p className="text-sm text-[var(--hq-muted)]">No conversation yet for this mission.</p>
    );
  }

  return (
    <div>
      <p className="hq-mono text-[10px] tracking-[0.16em] text-[var(--hq-muted)] uppercase">
        {title}
      </p>
      <ol className="mt-3 space-y-0">
        {turns.map((turn, index) => {
          const system = isSystemEvent(turn);
          const structured = isStructuredSynthesis(turn);
          return (
            <li key={turn.id} className="relative flex gap-3 pb-4 last:pb-0">
              {index < turns.length - 1 ? (
                <span
                  className="absolute top-8 left-[15px] h-[calc(100%-1.25rem)] w-px bg-[var(--hq-line)]"
                  aria-hidden
                />
              ) : null}
              <span
                className={`relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  turn.employeeId === "ceo"
                    ? "bg-[var(--hq-warn-soft)] text-[var(--hq-warn)]"
                    : system
                      ? "bg-[var(--hq-panel)] text-[var(--hq-muted)] border border-[var(--hq-line)]"
                      : "border border-[var(--hq-line)] bg-white text-[var(--hq-ink)]"
                }`}
              >
                {system ? "S" : turn.employeeName.slice(0, 1)}
              </span>
              <div
                className={`min-w-0 flex-1 rounded-xl border px-3 py-2 ${
                  system
                    ? "border-[var(--hq-line)]/50 bg-[var(--hq-panel)]"
                    : "border-[var(--hq-line)]/70 bg-white"
                }`}
              >
                <p className="text-sm font-medium">
                  {system ? "System" : turn.employeeName}
                  <span className="font-normal text-[var(--hq-muted)]">
                    {" "}
                    · {system ? "Event" : turn.role}
                  </span>
                </p>
                {structured ? (
                  <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--hq-ink)]">
                    {turn.body}
                  </pre>
                ) : (
                  <p className="mt-1 text-sm leading-relaxed text-[var(--hq-ink)]">
                    {system ? turn.body : `“${turn.body}”`}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
