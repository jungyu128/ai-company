"use client";

import type { ReactNode } from "react";
import type { DailyReportView } from "@/services/builder/daily-report/types";

type Props = {
  report: DailyReportView | null;
};

function Empty({ label }: { label: string }) {
  return (
    <p className="text-sm text-[var(--hq-muted)]">
      {label} — none recorded.
    </p>
  );
}

export function DailyReportPanel({ report }: Props) {
  if (!report) {
    return (
      <section
        id="ops-daily-report"
        className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5"
      >
        <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
          Daily Report
        </p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight">
          End-of-execution summary
        </h3>
        <p className="mt-3 text-sm text-[var(--hq-muted)]">
          No Daily Report filed yet. Complete a directive or finish granted
          execution to generate one from recorded state only.
        </p>
      </section>
    );
  }

  const { body } = report;

  return (
    <section
      id="ops-daily-report"
      className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            Daily Report
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">{report.title}</h3>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            {report.createdAtDisplay} · recorded state only
          </p>
        </div>
        <span className="hq-mono text-xs text-[var(--hq-muted)]">
          {body.integrity.completedCount} completed ·{" "}
          {body.integrity.incompleteCount} incomplete
        </span>
      </div>

      <p className="mt-4 rounded-lg bg-white/60 px-3 py-2 text-xs text-[var(--hq-muted)]">
        {body.integrity.note}
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Completed work">
          {body.completedWork.length === 0 ? (
            <Empty label="Completed work" />
          ) : (
            <ul className="space-y-2 text-sm">
              {body.completedWork.map((w) => (
                <li key={w.id} className="rounded-xl bg-white px-3 py-2">
                  <p className="font-medium">{w.title}</p>
                  <p className="text-xs text-[var(--hq-muted)]">
                    {w.employeeName} · {w.permanentRole} · {w.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Incomplete work">
          {body.incompleteWork.length === 0 ? (
            <Empty label="Incomplete work" />
          ) : (
            <ul className="space-y-2 text-sm">
              {body.incompleteWork.map((w) => (
                <li key={w.id} className="rounded-xl bg-white px-3 py-2">
                  <p className="font-medium">{w.title}</p>
                  <p className="text-xs text-[var(--hq-muted)]">
                    {w.employeeName} · {w.status} · {w.progress}%
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Blockers">
          {body.blockers.length === 0 ? (
            <Empty label="Blockers" />
          ) : (
            <ul className="space-y-2 text-sm">
              {body.blockers.map((b) => (
                <li
                  key={b.workItemId}
                  className="rounded-xl bg-white px-3 py-2 text-red-900"
                >
                  <p className="font-medium">{b.title}</p>
                  <p className="text-xs">
                    {b.employeeName}: {b.reason}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Approvals">
          {body.approvals.length === 0 ? (
            <Empty label="Approvals" />
          ) : (
            <ul className="space-y-2 text-sm">
              {body.approvals.map((a) => (
                <li key={a.id} className="rounded-xl bg-white px-3 py-2">
                  <p className="text-xs uppercase text-[var(--hq-muted)]">
                    {a.kind} · {a.status}
                  </p>
                  <p>{a.summary}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Reviews">
          {body.reviews.length === 0 ? (
            <Empty label="Reviews" />
          ) : (
            <ul className="space-y-2 text-sm">
              {body.reviews.map((r) => (
                <li key={r.workItemId} className="rounded-xl bg-white px-3 py-2">
                  <p className="font-medium">{r.title}</p>
                  <p className="text-xs text-[var(--hq-muted)]">
                    {r.employeeName} · {r.status}
                    {r.reviewCompleted ? " · review cycle completed" : " · in review/QA"}
                  </p>
                  {r.requiredReviewers.length > 0 ? (
                    <p className="mt-1 text-xs text-[var(--hq-muted)]">
                      Reviewers: {r.requiredReviewers.join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Changed files">
          {body.changedFiles.length === 0 ? (
            <Empty label="Changed files" />
          ) : (
            <ul className="space-y-1 font-mono text-xs">
              {body.changedFiles.map((f) => (
                <li key={f} className="rounded bg-white px-2 py-1">
                  {f}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Risks">
          {body.risks.length === 0 ? (
            <Empty label="Risks" />
          ) : (
            <ul className="space-y-2 text-sm">
              {body.risks.map((r) => (
                <li key={r.id} className="rounded-xl bg-white px-3 py-2">
                  <p className="font-medium">{r.summary}</p>
                  <p className="text-xs text-[var(--hq-muted)]">
                    {r.severity} · {r.mitigation}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Next recommendations">
          {body.nextRecommendations.length === 0 ? (
            <Empty label="Next recommendations" />
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {body.nextRecommendations.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </section>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold tracking-tight">{title}</h4>
      <div className="mt-2">{children}</div>
    </div>
  );
}
