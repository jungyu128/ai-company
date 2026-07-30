"use client";

import { useState, useTransition } from "react";
import type { BuilderHqSnapshot } from "@/services/builder/hq.service";
import { MISSION_MAX_CHARS } from "@/services/builder/mission-validation";

type MissionSuccess = {
  taskId: string;
  title: string;
  approvalPhrase: string;
  plan: { summary: string; steps: string[] };
};

type Props = {
  onMissionCreated: (hq: BuilderHqSnapshot) => void;
};

export function CeoMissionInput({ onMissionCreated }: Props) {
  const [mission, setMission] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastSuccess, setLastSuccess] = useState<MissionSuccess | null>(null);
  const [pending, startTransition] = useTransition();

  const remaining = MISSION_MAX_CHARS - mission.length;

  function execute() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/builder/hq/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mission }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Mission could not be executed");
          return;
        }
        setMission("");
        const detail: MissionSuccess = {
          taskId: data.taskId,
          title: data.title,
          approvalPhrase: data.approvalPhrase,
          plan: data.plan,
        };
        setLastSuccess(detail);
        onMissionCreated(data.hq);
      } catch {
        setError("Network error executing mission");
      }
    });
  }

  return (
    <section
      aria-label="CEO Mission"
      className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-6 shadow-[0_20px_50px_-40px_rgba(18,21,28,0.45)] md:p-8"
    >
      <p className="hq-mono text-xs tracking-[0.22em] text-[var(--hq-signal)] uppercase">
        CEO Mission · Execute
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight md:text-2xl">
        What should the company build next?
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">
        Saves a Builder Runtime task, generates a short pre-execution plan, and parks work at{" "}
        <span className="hq-mono">WAITING_CEO</span> — no product code until you approve the
        proposal phrase.
      </p>

      <label className="mt-5 block">
        <span className="sr-only">Mission text</span>
        <textarea
          value={mission}
          onChange={(e) => setMission(e.target.value)}
          rows={4}
          maxLength={MISSION_MAX_CHARS}
          placeholder="Example: Add calendar conflict warnings to the executive morning brief…"
          className="w-full resize-y rounded-xl border border-[var(--hq-line)] bg-white px-4 py-3 text-sm text-[var(--hq-ink)] outline-none ring-[var(--hq-signal)] placeholder:text-[var(--hq-muted)] focus:ring-2"
          disabled={pending}
        />
      </label>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p
          className={`hq-mono text-[11px] ${
            remaining < 40 ? "text-[var(--hq-warn)]" : "text-[var(--hq-muted)]"
          }`}
        >
          {remaining} characters left
        </p>
        <button
          type="button"
          onClick={execute}
          disabled={pending || mission.trim().length === 0}
          className="rounded-xl bg-[var(--hq-ink)] px-5 py-2.5 text-sm font-medium text-[var(--hq-paper)] transition hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Executing…" : "Execute Mission"}
        </button>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-[var(--hq-warn)]" role="alert">
          {error}
        </p>
      ) : null}

      {lastSuccess ? (
        <div className="mt-5 rounded-xl border border-[var(--hq-signal)]/30 bg-[var(--hq-signal-soft)] px-4 py-3 text-sm">
          <p className="font-medium text-[var(--hq-ink)]">
            Mission parked ·{" "}
            <span className="hq-mono text-[var(--hq-signal)]">{lastSuccess.taskId}</span>
          </p>
          <p className="mt-1 text-[var(--hq-muted)]">{lastSuccess.plan.summary}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--hq-ink)]">
            {lastSuccess.plan.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="hq-mono mt-3 rounded-lg bg-[var(--hq-ink)] px-3 py-2 text-xs text-[var(--hq-paper)]">
            {lastSuccess.approvalPhrase}
          </p>
        </div>
      ) : null}
    </section>
  );
}
