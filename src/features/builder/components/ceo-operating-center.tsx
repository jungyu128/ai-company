"use client";

import type {
  CeoInboxItem,
  CeoOperatingCenterTone,
  CeoOperatingCenterView,
} from "@/services/builder/ceo-operating-center";

type Props = {
  center: CeoOperatingCenterView;
  /** Compact strip above Live Office; full panel for ops overlay. */
  variant?: "full" | "strip";
};

function toneClass(tone: CeoOperatingCenterTone): string {
  switch (tone) {
    case "critical":
      return "text-red-300";
    case "warning":
      return "text-amber-300";
    case "positive":
      return "text-emerald-300";
    case "info":
      return "text-[var(--hq-signal)]";
    default:
      return "text-[var(--hq-muted)]";
  }
}

function toneBorder(tone: CeoOperatingCenterTone): string {
  switch (tone) {
    case "critical":
      return "border-red-400/40";
    case "warning":
      return "border-amber-400/40";
    case "positive":
      return "border-emerald-400/30";
    default:
      return "border-[var(--hq-line)]";
  }
}

function InboxRow({ item }: { item: CeoInboxItem }) {
  return (
    <a
      href={item.href}
      className={`block rounded-xl border bg-white px-3 py-2.5 text-sm transition hover:border-[var(--hq-signal)]/50 ${toneBorder(item.tone)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className={`font-medium ${toneClass(item.tone)}`}>{item.title}</p>
        <span className="hq-mono shrink-0 text-[10px] text-[var(--hq-muted)]">
          {item.atDisplay}
        </span>
      </div>
      <p className="mt-0.5 text-[var(--hq-muted)]">{item.detail}</p>
      {item.employeeName ? (
        <p className="hq-mono mt-1 text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
          {item.employeeName}
        </p>
      ) : null}
    </a>
  );
}

/** Always-visible strip: recommended action + KPIs + jump to full center. */
export function CeoOperatingCenterStrip({ center }: { center: CeoOperatingCenterView }) {
  const brain = center.brain.recommendation;
  const next = center.recommendedNextAction;
  const alertN = center.criticalAlerts.length;
  const decisionN = center.decisionCenter.count;

  return (
    <section
      className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)]/90 px-4 py-3 backdrop-blur-sm"
      aria-label="CEO Operating Center strip"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            CEO Operating Center · AI Company Brain
          </p>
          <a
            href="#ops-operating-center"
            className="mt-0.5 block truncate text-sm font-semibold text-white/90 hover:underline"
          >
            {brain.recommendedAction}
          </a>
          <p className="mt-0.5 truncate text-xs text-[var(--hq-muted)]">
            {brain.executiveSummary}
            {` · confidence ${brain.confidence}%`}
            {decisionN > 0 ? ` · ${decisionN} decision(s)` : ""}
            {alertN > 0 ? ` · ${alertN} alert(s)` : ""}
            {next ? ` · Next: ${next.title}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {center.liveKpis.slice(0, 4).map((k) => (
            <div
              key={k.id}
              className="rounded-lg border border-[var(--hq-line)] bg-white/5 px-2.5 py-1.5 text-center"
            >
              <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
                {k.label}
              </p>
              <p className={`text-sm font-semibold ${toneClass(k.tone)}`}>{k.value}</p>
            </div>
          ))}
          <a
            href="#ops-operating-center"
            className="rounded-lg border border-[var(--hq-signal)]/40 bg-[var(--hq-signal)]/15 px-3 py-2 text-xs font-medium text-[var(--hq-signal)] hover:bg-[var(--hq-signal)]/25"
          >
            Open center
          </a>
        </div>
      </div>
    </section>
  );
}

export function CeoOperatingCenter({ center, variant = "full" }: Props) {
  if (variant === "strip") {
    return <CeoOperatingCenterStrip center={center} />;
  }

  const { morningBriefing, dailySummary, companyHealth, decisionCenter, brain } =
    center;
  const rec = brain.recommendation;
  const assessments = brain.assessments;

  return (
    <section
      className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5"
      aria-label="CEO Operating Center"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
            CEO Operating Center
          </p>
          <h3 className="mt-1 text-xl font-semibold tracking-tight">
            Operate the company from one screen
          </h3>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            Proactive delivery only — no searching. As of {center.generatedAtDisplay}.
          </p>
        </div>
        {center.recommendedNextAction ? (
          <a
            href={center.recommendedNextAction.href}
            className="max-w-sm rounded-xl border border-[var(--hq-signal)]/40 bg-[var(--hq-signal)]/10 px-4 py-3"
          >
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-signal)]">
              Recommended next action
            </p>
            <p className="mt-1 font-semibold">{center.recommendedNextAction.title}</p>
            <p className="mt-0.5 text-sm text-[var(--hq-muted)]">
              {center.recommendedNextAction.reason}
            </p>
          </a>
        ) : null}
      </div>

      {/* AI Company Brain — permanent Executive Recommendation */}
      <div
        className="mt-5 rounded-2xl border border-[var(--hq-signal)]/35 bg-[var(--hq-signal)]/5 p-4"
        aria-label="AI Company Brain executive recommendation"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              AI Company Brain
            </p>
            <h4 className="mt-1 text-lg font-semibold tracking-tight">
              Executive Recommendation
            </h4>
            <p className="mt-1 text-xs text-[var(--hq-muted)]">
              Observes recorded systems only · updates with company state ·{" "}
              {brain.observedSources.length} source(s)
            </p>
          </div>
          <span className="hq-mono rounded-lg border border-[var(--hq-line)] bg-white/80 px-2.5 py-1 text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
            Confidence {rec.confidence}% · {rec.confidenceLabel}
          </span>
        </div>

        <p className="mt-3 text-sm leading-relaxed">{rec.executiveSummary}</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--hq-line)] bg-white p-3">
            <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
              Why this matters
            </p>
            <p className="mt-1 text-sm">{rec.whyThisMatters}</p>
          </div>
          <div className="rounded-xl border border-[var(--hq-line)] bg-white p-3">
            <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
              Recommended action
            </p>
            <p className="mt-1 text-sm font-semibold">{rec.recommendedAction}</p>
            <p className="mt-1 text-xs text-[var(--hq-muted)]">{rec.expectedImpact}</p>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
              Evidence
            </p>
            {rec.evidence.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--hq-muted)]">
                No recorded evidence available yet.
              </p>
            ) : (
              <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
                {rec.evidence.map((e) => (
                  <li key={`${e.source}-${e.fact}`} className="rounded-lg bg-white/70 px-2 py-1.5">
                    <span className="hq-mono text-[9px] uppercase text-[var(--hq-signal)]">
                      {e.source}
                    </span>
                    <span className="mt-0.5 block text-[var(--hq-muted)]">{e.fact}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
              Risks
            </p>
            <ul className="mt-1 space-y-1 text-sm">
              {rec.risks.map((r) => (
                <li key={r} className="rounded-lg border border-amber-400/30 bg-amber-50/40 px-2 py-1.5">
                  {r}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["Highest priority", assessments.highestCompanyPriority],
              ["Biggest risk", assessments.biggestCurrentRisk],
              ["Biggest blocker", assessments.biggestBlocker],
              ["Weakest sprint", assessments.weakestSprint],
              ["Strongest opportunity", assessments.strongestOpportunity],
              ["Next mission", assessments.recommendedNextMission],
              ["CEO decision", assessments.recommendedCeoDecision],
              ["Workload imbalance", assessments.workloadImbalance],
              ["Engineering health", assessments.engineeringHealth],
              ["Release readiness", assessments.releaseReadiness],
              ["Roadmap impact", assessments.roadmapImpact],
            ] as const
          ).map(([label, value]) =>
            value ? (
              <div
                key={label}
                className="rounded-lg border border-[var(--hq-line)] bg-white/60 px-2.5 py-2"
              >
                <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
                  {label}
                </p>
                <p className="mt-0.5 text-xs leading-snug">{value}</p>
              </div>
            ) : null
          )}
        </div>
      </div>

      {/* Company Learning Engine */}
      <div
        className="mt-5 rounded-2xl border border-[var(--hq-line)] bg-white/5 p-4"
        aria-label="Company Learning Engine"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Company Learning Engine
            </p>
            <h4 className="mt-1 text-lg font-semibold tracking-tight">
              Lessons & company knowledge
            </h4>
            <p className="mt-1 text-sm text-[var(--hq-muted)]">
              Learned only from recorded missions — history is append-only and
              traceable.
            </p>
          </div>
          <div className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-center">
            <p className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">
              Maturity
            </p>
            <p className="text-xl font-semibold">
              {center.learning.companyMaturityScore}
            </p>
            <p className="text-xs text-[var(--hq-muted)]">
              {center.learning.companyMaturityLabel}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg border border-[var(--hq-line)] bg-white px-2.5 py-2">
            <p className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">Lessons</p>
            <p className="font-semibold">{center.learning.knowledgeGrowth.totalLessons}</p>
          </div>
          <div className="rounded-lg border border-[var(--hq-line)] bg-white px-2.5 py-2">
            <p className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">Knowledge</p>
            <p className="font-semibold">
              {center.learning.knowledgeGrowth.activeKnowledge}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--hq-line)] bg-white px-2.5 py-2">
            <p className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">Evolution</p>
            <p className="font-semibold">
              {center.learning.knowledgeGrowth.evolutionSignals}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--hq-line)] bg-white px-2.5 py-2">
            <p className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">Last learned</p>
            <p className="text-xs font-medium">
              {center.learning.knowledgeGrowth.lastLearnedAtDisplay ?? "—"}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
              Lessons learned
            </p>
            {center.learning.lessonsLearned.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--hq-muted)]">
                No mission lessons recorded yet.
              </p>
            ) : (
              <ul className="mt-1 max-h-48 space-y-2 overflow-y-auto">
                {center.learning.lessonsLearned.map((l) => (
                  <li
                    key={l.id}
                    className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-sm"
                  >
                    <p className="font-medium">{l.title}</p>
                    <p className="hq-mono text-[9px] text-[var(--hq-muted)]">
                      {l.recordedAtDisplay}
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-[var(--hq-muted)]">
                      {l.highlights.map((h) => (
                        <li key={h}>· {h}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
              Recently learned patterns
            </p>
            {center.learning.recentlyLearnedPatterns.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--hq-muted)]">No patterns stored yet.</p>
            ) : (
              <ul className="mt-1 max-h-48 space-y-2 overflow-y-auto">
                {center.learning.recentlyLearnedPatterns.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-sm"
                  >
                    <p className="hq-mono text-[9px] uppercase text-[var(--hq-signal)]">
                      {p.category.replace(/_/g, " ")} · {p.confidence}%
                    </p>
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-[var(--hq-muted)]">{p.body}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="hq-mono text-[10px] uppercase tracking-wide text-amber-700">
              Repeated problems
            </p>
            {center.learning.repeatedProblems.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--hq-muted)]">
                No repeated problems detected from recorded state.
              </p>
            ) : (
              <ul className="mt-1 space-y-2">
                {center.learning.repeatedProblems.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-amber-400/40 bg-amber-50/40 px-3 py-2 text-sm"
                  >
                    <p className="font-medium">
                      {p.label}{" "}
                      <span className="text-[var(--hq-muted)]">×{p.count}</span>
                    </p>
                    <p className="text-xs text-[var(--hq-muted)]">{p.recommendation}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
              Process improvement recommendations
            </p>
            {center.learning.processImprovementRecommendations.length === 0 ? (
              <p className="mt-1 text-sm text-[var(--hq-muted)]">None yet.</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {center.learning.processImprovementRecommendations.map((r) => (
                  <li key={r} className="rounded-lg bg-white px-2 py-1.5">
                    · {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Work Execution Engine — full software lifecycle */}
      <div
        className="mt-5 rounded-2xl border border-[var(--hq-line)] bg-white/5 p-4"
        aria-label="Work Execution Engine"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="hq-mono text-[10px] tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Work Execution Engine
            </p>
            <h4 className="mt-1 text-lg font-semibold tracking-tight">
              Software lifecycle
            </h4>
            <p className="mt-1 text-sm text-[var(--hq-muted)]">
              {center.workExecution.summary}
            </p>
          </div>
          <div className="text-right text-xs text-[var(--hq-muted)]">
            {center.workExecution.directive ? (
              <p>
                Directive · {center.workExecution.directive.status}
                {center.workExecution.directive.paused ? " · paused" : ""}
              </p>
            ) : (
              <p>No recorded directive</p>
            )}
            {center.workExecution.protectedApprovalsPending > 0 ? (
              <p className="text-amber-600">
                {center.workExecution.protectedApprovalsPending} protected gate(s)
              </p>
            ) : null}
          </div>
        </div>

        <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {center.workExecution.stages.map((stage, idx) => {
            const tone =
              stage.status === "completed"
                ? "border-emerald-400/40 bg-emerald-50/50"
                : stage.status === "active"
                  ? "border-[var(--hq-signal)]/50 bg-[var(--hq-signal)]/10"
                  : stage.status === "waiting_ceo"
                    ? "border-amber-400/50 bg-amber-50/50"
                    : stage.status === "blocked"
                      ? "border-red-400/40 bg-red-50/40"
                      : "border-[var(--hq-line)] bg-white/70";
            return (
              <li key={stage.id} className={`rounded-xl border px-3 py-2 ${tone}`}>
                <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
                  {idx + 1}. {stage.status.replace(/_/g, " ")}
                </p>
                <p className="mt-0.5 text-sm font-medium">{stage.label}</p>
                {stage.detail ? (
                  <p className="mt-0.5 text-xs text-[var(--hq-muted)]">{stage.detail}</p>
                ) : null}
              </li>
            );
          })}
        </ol>

        {center.workExecution.workItems.length > 0 ? (
          <div className="mt-4 space-y-2">
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
              Work items (recorded)
            </p>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {center.workExecution.workItems.map((w) => (
                <details
                  key={w.id}
                  className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {w.title}{" "}
                    <span className="font-normal text-[var(--hq-muted)]">
                      · {w.ownerName} · {w.status} · {w.progress}%
                    </span>
                  </summary>
                  <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">Objective</dt>
                      <dd>{w.objective}</dd>
                    </div>
                    <div>
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">Owners</dt>
                      <dd>
                        Owner {w.ownerName} · Review {w.reviewOwnerName} · QA {w.qaOwnerName}
                      </dd>
                    </div>
                    <div>
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">Effort / modules</dt>
                      <dd>
                        {w.estimatedEffort} · {w.affectedModules.join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">Dependencies</dt>
                      <dd>
                        {w.dependencyTitles.length > 0
                          ? w.dependencyTitles.join("; ")
                          : "None"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">
                        Implementation plan
                      </dt>
                      <dd>
                        <ul className="mt-0.5 list-disc pl-4">
                          {w.implementationPlan.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">
                        Acceptance criteria
                      </dt>
                      <dd>
                        <ul className="mt-0.5 list-disc pl-4">
                          {w.acceptanceCriteria.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div>
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">Test plan</dt>
                      <dd>
                        <ul className="mt-0.5 list-disc pl-4">
                          {w.testPlan.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="hq-mono uppercase text-[var(--hq-muted)]">Risks</dt>
                      <dd>{w.risks.join("; ") || "None recorded"}</dd>
                    </div>
                    {w.pendingProtectedAction ? (
                      <div className="sm:col-span-2 text-amber-700">
                        Protected action pending CEO: {w.pendingProtectedAction}
                      </div>
                    ) : null}
                  </dl>
                </details>
              ))}
            </div>
          </div>
        ) : null}

        {center.workExecution.collaborationNotes.length > 0 ? (
          <div className="mt-3">
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
              Automatic collaboration
            </p>
            <ul className="mt-1 space-y-1 text-xs text-[var(--hq-muted)]">
              {center.workExecution.collaborationNotes.map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--hq-muted)]">
          <span>Merge-ready packages: {center.workExecution.mergeReadyCount}</span>
          <span>
            Deployment ready:{" "}
            {center.workExecution.deploymentReady
              ? "signals yes — still needs CEO deploy approval"
              : center.workExecution.deploymentBlockedReason ?? "not ready"}
          </span>
          <a href="#ops-approvals" className="text-[var(--hq-signal)] hover:underline">
            Approval Queue →
          </a>
          <a href="#ops-executive" className="text-[var(--hq-signal)] hover:underline">
            Daily Ops →
          </a>
        </div>
      </div>

      {/* Live KPIs */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {center.liveKpis.map((k) => (
          <div
            key={k.id}
            className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
          >
            <p className="hq-mono text-[9px] uppercase tracking-wide text-[var(--hq-muted)]">
              {k.label}
            </p>
            <p className={`mt-0.5 text-lg font-semibold ${toneClass(k.tone)}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {/* Morning Briefing + Daily Summary + Health */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-[var(--hq-line)] bg-white p-4">
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-signal)]">
              Morning Briefing
            </p>
            <h4 className="mt-1 font-semibold">{morningBriefing.headline}</h4>
            <p className="mt-2 text-sm text-[var(--hq-muted)]">{morningBriefing.summary}</p>
            {morningBriefing.bullets.length > 0 ? (
              <ul className="mt-3 space-y-1.5 text-sm">
                {morningBriefing.bullets.map((b) => (
                  <li key={b} className="flex gap-2">
                    <span className="text-[var(--hq-signal)]">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--hq-line)] bg-white p-4">
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
              Company Health
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {companyHealth.score}{" "}
              <span className="text-base font-medium text-[var(--hq-muted)]">
                {companyHealth.label}
              </span>
            </p>
            <p className="mt-2 text-sm text-[var(--hq-muted)]">{companyHealth.summary}</p>
            {companyHealth.factors.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-[var(--hq-muted)]">
                {companyHealth.factors.slice(0, 4).map((f) => (
                  <li key={f}>· {f}</li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--hq-line)] bg-white p-4">
            <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-muted)]">
              Daily Summary
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">Completed</dt>
                <dd className="font-semibold">{dailySummary.completed}</dd>
              </div>
              <div>
                <dt className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">In progress</dt>
                <dd className="font-semibold">{dailySummary.inProgress}</dd>
              </div>
              <div>
                <dt className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">Blocked</dt>
                <dd className="font-semibold">{dailySummary.blocked}</dd>
              </div>
              <div>
                <dt className="hq-mono text-[9px] uppercase text-[var(--hq-muted)]">Approvals</dt>
                <dd className="font-semibold">{dailySummary.waitingApprovals}</dd>
              </div>
            </dl>
            {dailySummary.directiveTitle ? (
              <p className="mt-3 text-sm">
                <span className="text-[var(--hq-muted)]">Directive: </span>
                {dailySummary.directiveTitle}
              </p>
            ) : (
              <p className="mt-3 text-sm text-[var(--hq-muted)]">No Daily Directive recorded.</p>
            )}
            {dailySummary.latestUpdate ? (
              <p className="mt-2 text-xs text-[var(--hq-muted)]">{dailySummary.latestUpdate}</p>
            ) : null}
          </div>
        </div>

        {/* CEO Inbox */}
        <div className="rounded-xl border border-[var(--hq-line)] bg-white/5 p-4 lg:col-span-1">
          <p className="hq-mono text-[10px] uppercase tracking-wide text-[var(--hq-signal)]">
            CEO Inbox
          </p>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            Employees notify you when work completes, blockers appear, reviews finish,
            approvals are required, risks rise, or priorities change.
          </p>
          <div className="mt-3 max-h-[28rem] space-y-2 overflow-y-auto">
            {center.inbox.length === 0 ? (
              <p className="text-sm text-[var(--hq-muted)]">Inbox clear — no proactive notices.</p>
            ) : (
              center.inbox.map((item) => <InboxRow key={item.id} item={item} />)
            )}
          </div>
        </div>

        {/* Decision Center + Critical Alerts */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-[var(--hq-line)] bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="hq-mono text-[10px] uppercase tracking-wide text-amber-600">
                Decision Center
              </p>
              <span className="hq-mono text-xs text-[var(--hq-muted)]">
                {decisionCenter.count}
                {decisionCenter.protectedCount > 0
                  ? ` · ${decisionCenter.protectedCount} protected`
                  : ""}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {decisionCenter.items.length === 0 ? (
                <p className="text-sm text-[var(--hq-muted)]">No decisions waiting.</p>
              ) : (
                decisionCenter.items.map((d) => (
                  <a
                    key={d.id}
                    href={d.href}
                    className={`block rounded-lg border px-3 py-2 text-sm ${
                      d.isProtected ? "border-red-400/40 bg-red-50/50" : "border-[var(--hq-line)]"
                    }`}
                  >
                    <p className="font-medium">{d.title}</p>
                    <p className="mt-0.5 text-[var(--hq-muted)]">
                      {d.employeeName} — {d.reason}
                    </p>
                  </a>
                ))
              )}
            </div>
            {decisionCenter.count > 0 ? (
              <a
                href="#ops-approvals"
                className="mt-3 inline-block text-xs font-medium text-[var(--hq-signal)] hover:underline"
              >
                Open Approval Queue →
              </a>
            ) : null}
          </div>

          <div className="rounded-xl border border-[var(--hq-line)] bg-white p-4">
            <p className="hq-mono text-[10px] uppercase tracking-wide text-red-500">
              Critical Alerts
            </p>
            <div className="mt-3 space-y-2">
              {center.criticalAlerts.length === 0 ? (
                <p className="text-sm text-[var(--hq-muted)]">No critical alerts.</p>
              ) : (
                center.criticalAlerts.map((a) => (
                  <a
                    key={a.id}
                    href={a.href}
                    className={`block rounded-lg border px-3 py-2 text-sm ${
                      a.tone === "critical"
                        ? "border-red-400/40 bg-red-50/40"
                        : "border-amber-400/40 bg-amber-50/40"
                    }`}
                  >
                    <p className="font-medium">{a.title}</p>
                    <p className="mt-0.5 text-[var(--hq-muted)]">{a.detail}</p>
                  </a>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
