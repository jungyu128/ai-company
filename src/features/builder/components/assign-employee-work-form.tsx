"use client";

import { useState, useTransition } from "react";
import { MISSION_MAX_CHARS } from "@/services/builder/mission-validation";

type Props = {
  employeeId: string;
  employeeName: string;
  onAssigned?: () => void;
};

export function AssignEmployeeWorkForm({ employeeId, employeeName, onAssigned }: Props) {
  const [mission, setMission] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/builder/hq/mission", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mission, employeeId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Could not assign work");
          return;
        }
        setMission("");
        const execStatus = data.execution?.status as string | undefined;
        if (execStatus === "awaiting_approval") {
          setSuccess(
            `${employeeName} prepared a plan and an external action preview. Approve the write in Command Center before anything is sent or changed.`
          );
        } else if (execStatus === "disconnected") {
          setSuccess(
            `${employeeName} prepared a plan. External system is disconnected — connect credentials before executing writes.`
          );
        } else {
          setSuccess(
            `${employeeName} prepared a plan and is waiting for your approval before executing.`
          );
        }
        onAssigned?.();
      } catch {
        setError("Network error assigning work");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5 md:p-6">
      <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
        Assign work
      </p>
      <h3 className="mt-2 text-lg font-semibold tracking-tight">
        Tell {employeeName} what to do next
      </h3>
      <p className="mt-1 text-sm text-[var(--hq-muted)]">
        They will analyze the request, draft an execution plan, and ask for your approval before
        acting.
      </p>
      <textarea
        value={mission}
        onChange={(e) => setMission(e.target.value)}
        rows={4}
        maxLength={MISSION_MAX_CHARS}
        disabled={pending}
        placeholder={`Example: ${employeeName}, prepare…`}
        className="mt-4 w-full resize-y rounded-xl border border-[var(--hq-line)] bg-white px-4 py-3 text-sm outline-none ring-[var(--hq-signal)] focus:ring-2"
      />
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="hq-mono text-[11px] text-[var(--hq-muted)]">
          {MISSION_MAX_CHARS - mission.length} left
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending || mission.trim().length === 0}
          className="rounded-xl bg-[var(--hq-ink)] px-4 py-2.5 text-sm font-medium text-[var(--hq-paper)] disabled:opacity-50"
        >
          {pending ? "Assigning…" : "Assign to employee"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-[var(--hq-warn)]" role="alert">
          {error}
        </p>
      ) : null}
      {success ? <p className="mt-3 text-sm text-[var(--hq-signal)]">{success}</p> : null}
    </section>
  );
}
