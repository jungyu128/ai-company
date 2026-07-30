"use client";

import Link from "next/link";
import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";

type Props = {
  employee: LiveOfficeEmployeeView | null;
  workspaceId: string;
  onClose: () => void;
};

export function LiveOfficeInspector({ employee, workspaceId, onClose }: Props) {
  if (!employee) return null;

  return (
    <aside className="lo-inspector" role="dialog" aria-label={`${employee.name} details`}>
      <div className="lo-inspector__head">
        <div className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: employee.avatar.hue }}
          >
            {employee.avatar.initials}
          </span>
          <div>
            <p className="font-semibold tracking-tight">{employee.name}</p>
            <p className="text-xs text-[var(--hq-muted)]">
              {employee.role} · {employee.department}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[var(--hq-line)] px-2 py-1 text-xs text-[var(--hq-muted)]"
        >
          Close
        </button>
      </div>

      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium">
        <span aria-hidden>{employee.visualEmoji}</span>
        {employee.visualLabel}
      </p>

      <section className="lo-inspector__section">
        <h4>Current task</h4>
        <p>{employee.currentTask ?? "Ready for assignment"}</p>
      </section>

      <section className="lo-inspector__section">
        <h4>Current reasoning</h4>
        <p>{employee.currentActivity ?? "No active reasoning stream."}</p>
      </section>

      <section className="lo-inspector__section">
        <h4>Assigned mission</h4>
        <p>{employee.relatedMissionTitle ?? "No active mission."}</p>
      </section>

      <section className="lo-inspector__section">
        <h4>Memory</h4>
        {employee.memoryHints.length === 0 ? (
          <p className="text-[var(--hq-muted)]">No matched memory hints yet.</p>
        ) : (
          <ul className="space-y-1">
            {employee.memoryHints.map((m) => (
              <li key={m} className="text-sm">
                · {m}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="lo-inspector__section">
        <h4>Current conversation</h4>
        {employee.conversationPreview.length === 0 ? (
          <p className="text-[var(--hq-muted)]">No live conversation turns.</p>
        ) : (
          <ul className="space-y-2">
            {employee.conversationPreview.map((t) => (
              <li key={t.id} className="rounded-lg bg-white/80 px-2.5 py-2 text-xs leading-relaxed">
                <span className="font-medium">{t.speaker}</span>
                <p className="mt-0.5 text-[var(--hq-muted)] line-clamp-3">{t.body}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href={`/builder/hq/employees/${employee.id}?workspaceId=${encodeURIComponent(workspaceId)}`}
        className="mt-4 inline-flex text-sm text-[var(--hq-signal)] underline-offset-2 hover:underline"
      >
        Open full profile →
      </Link>
    </aside>
  );
}
