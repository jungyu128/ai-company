"use client";

import Link from "next/link";
import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";
import type { LiveOfficeActivityItem } from "@/features/builder/live-office/live-office-model";

type Props = {
  employee: LiveOfficeEmployeeView | null;
  workspaceId: string;
  activity: LiveOfficeActivityItem[];
  onClear?: () => void;
};

export function LiveOfficeConversationPanel({
  employee,
  workspaceId,
  activity,
  onClear,
}: Props) {
  return (
    <aside className="lo-conversation" aria-label="Employee conversation">
      <div className="lo-conversation__head">
        <div>
          <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            Conversation
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            {employee ? employee.name : "Floor channel"}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--hq-muted)]">
            {employee
              ? `${employee.role} · ${employee.visualLabel}`
              : "Select a desk to follow an employee"}
          </p>
        </div>
        {employee && onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="rounded-lg border border-[var(--hq-line)] px-2 py-1 text-[11px] text-[var(--hq-muted)]"
          >
            Clear
          </button>
        ) : (
          <span className="hq-live-dot h-2 w-2 rounded-full bg-[var(--hq-signal)]" />
        )}
      </div>

      {employee ? (
        <>
          {employee.conversationPreview.length === 0 ? (
            <p className="mt-5 text-sm text-[var(--hq-muted)]">
              No live conversation turns for this desk yet.
            </p>
          ) : (
            <ul className="lo-conversation__list">
              {employee.conversationPreview.map((t) => (
                <li key={t.id} className="lo-conversation__turn">
                  <p className="text-xs font-semibold text-[var(--hq-ink)]">{t.speaker}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--hq-muted)]">{t.body}</p>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/builder/hq/employees/${employee.id}?workspaceId=${encodeURIComponent(workspaceId)}`}
            className="mt-4 inline-flex text-sm text-[var(--hq-signal)] underline-offset-2 hover:underline"
          >
            Open full profile →
          </Link>
        </>
      ) : (
        <ul className="lo-conversation__list">
          {activity.slice(0, 10).map((item) => (
            <li key={item.id} className="lo-conversation__turn">
              <p className="text-sm leading-relaxed text-[var(--hq-ink)]">{item.summary}</p>
              <p className="hq-mono mt-1 text-[10px] text-[var(--hq-muted)]">{item.atDisplay}</p>
            </li>
          ))}
          {activity.length === 0 ? (
            <li className="text-sm text-[var(--hq-muted)]">Quiet floor — waiting for the next event.</li>
          ) : null}
        </ul>
      )}
    </aside>
  );
}
