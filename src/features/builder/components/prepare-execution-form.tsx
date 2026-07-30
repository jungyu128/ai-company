"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  defaultWriteActionForEmployee,
  employeeSystemFor,
} from "@/services/builder/execution/types";

type Props = {
  employeeId: string;
  employeeName: string;
};

export function PrepareExecutionForm({ employeeId, employeeName }: Props) {
  const router = useRouter();
  const system = employeeSystemFor(employeeId);
  const action = defaultWriteActionForEmployee(employeeId);
  const [guidance, setGuidance] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!system || !action) return null;

  function submit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/builder/hq/executions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "prepare",
            employeeId,
            action,
            requestedAction: guidance.trim() || `${employeeName} external action`,
            params: {
              guidance: guidance.trim() || undefined,
              body: guidance.trim() || undefined,
              note: guidance.trim() || undefined,
              title: guidance.trim() || undefined,
            },
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          execution?: { status?: string; preview?: { summary?: string } };
        };
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Could not prepare execution");
          return;
        }
        const status = data.execution?.status;
        if (status === "disconnected") {
          setSuccess(
            "External system is disconnected. Connect credentials before approving writes."
          );
        } else {
          setSuccess(
            data.execution?.preview?.summary
              ? `Preview ready: ${data.execution.preview.summary}`
              : "Preview ready — approve the write in Command Center."
          );
        }
        setGuidance("");
        router.refresh();
      } catch {
        setError("Network error preparing execution");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
      <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
        External action
      </p>
      <h3 className="mt-1 text-lg font-semibold tracking-tight">
        Prepare {system.replace(/_/g, " ")} work
      </h3>
      <p className="mt-1 text-sm text-[var(--hq-muted)]">
        {employeeName} will fetch live data and build a preview. Nothing is sent or changed until
        you approve.
      </p>
      <textarea
        value={guidance}
        onChange={(e) => setGuidance(e.target.value)}
        rows={3}
        disabled={isPending}
        placeholder="Optional guidance for the preview…"
        className="mt-4 w-full resize-y rounded-xl border border-[var(--hq-line)] bg-white px-4 py-3 text-sm outline-none ring-[var(--hq-signal)] focus:ring-2"
      />
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="rounded-xl bg-[var(--hq-ink)] px-4 py-2.5 text-sm font-medium text-[var(--hq-paper)] disabled:opacity-50"
        >
          {isPending ? "Preparing…" : "Prepare preview"}
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
