"use client";

import type { ExecutiveBrief } from "@/services/builder/proactive.logic";

type Props = {
  brief: ExecutiveBrief;
};

export function ExecutiveBriefPanel({ brief }: Props) {
  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
        Daily Executive Brief
      </p>
      <h3 className="mt-1 text-xl font-semibold tracking-tight">{brief.headline}</h3>
      <p className="mt-2 text-sm leading-relaxed text-[var(--hq-muted)]">{brief.summary}</p>
      <p className="hq-mono mt-2 text-[10px] text-[var(--hq-muted)]">
        Generated {brief.generatedAtDisplay}
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <BriefList title="Highest priorities" items={brief.highestPriorities} />
        <BriefList title="Suggested actions" items={brief.suggestedActions} />
        <BriefList title="Risks" items={brief.risks} />
        <BriefList title="Opportunities" items={brief.opportunities} />
        <BriefList title="Pending approvals" items={brief.pendingApprovals} />
        <div>
          <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
            Recommended assignments
          </p>
          {brief.recommendedAssignments.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--hq-muted)]">No assignments suggested.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {brief.recommendedAssignments.map((a) => (
                <li key={`${a.employeeId}-${a.assignment}`} className="rounded-lg bg-white px-3 py-2">
                  <span className="font-medium">{a.employeeName}</span>
                  <span className="text-[var(--hq-muted)]"> · {a.role}</span>
                  <p className="mt-0.5 text-[var(--hq-muted)]">{a.assignment}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function BriefList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--hq-muted)]">None right now.</p>
      ) : (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--hq-ink)]">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
