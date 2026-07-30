"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  ActivityItem,
  AiCompanyWorkspace,
  WorkspaceMember,
  WorkspaceNotification,
} from "@/services/builder/workspace/types";

type Props = {
  activeWorkspaceId: string;
  workspaces: AiCompanyWorkspace[];
  members: WorkspaceMember[];
  activityTimeline: ActivityItem[];
  notifications: WorkspaceNotification[];
};

export function WorkspaceCollaborationPanel({
  activeWorkspaceId,
  workspaces,
  members,
  activityTimeline,
  notifications,
}: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [commentMissionId, setCommentMissionId] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function withWorkspaceHeaders(): HeadersInit {
    return {
      "Content-Type": "application/json",
      "x-ai-company-workspace": activeWorkspaceId,
    };
  }

  async function switchWorkspace(id: string) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("ai-company-workspace", id);
      const url = new URL(window.location.href);
      url.searchParams.set("workspaceId", id);
      window.location.href = url.toString();
    }
  }

  async function addMember() {
    setError(null);
    try {
      const res = await fetch("/api/builder/hq/workspaces", {
        method: "POST",
        headers: withWorkspaceHeaders(),
        body: JSON.stringify({
          action: "add_member",
          workspaceId: activeWorkspaceId,
          email: memberEmail,
          displayName: memberEmail.split("@")[0],
          role: memberRole,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not add member");
        return;
      }
      setMemberEmail("");
      startTransition(() => router.refresh());
    } catch {
      setError("Network error adding member");
    }
  }

  async function postComment() {
    setError(null);
    try {
      const res = await fetch("/api/builder/hq/collaboration", {
        method: "POST",
        headers: withWorkspaceHeaders(),
        body: JSON.stringify({
          action: "comment",
          missionId: commentMissionId,
          body: commentBody,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not comment");
        return;
      }
      setCommentBody("");
      startTransition(() => router.refresh());
    } catch {
      setError("Network error posting comment");
    }
  }

  async function markRead(id: string) {
    await fetch("/api/builder/hq/collaboration", {
      method: "POST",
      headers: withWorkspaceHeaders(),
      body: JSON.stringify({ action: "read_notification", notificationId: id }),
    });
    startTransition(() => router.refresh());
  }

  const unread = notifications.filter((n) => !n.read);

  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="hq-mono text-xs tracking-[0.18em] text-[var(--hq-signal)] uppercase">
              Workspace
            </p>
            <h3 className="mt-1 text-2xl font-semibold tracking-tight">
              Multi-user collaboration
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-[var(--hq-muted)]">
              Switch workspaces, manage teammates, follow the activity timeline, and stay on top of
              notifications — with role-based approvals.
            </p>
          </div>
          <label className="text-sm">
            <span className="mb-1 block text-[11px] uppercase tracking-wide text-[var(--hq-muted)]">
              Active workspace
            </span>
            <select
              className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2"
              value={activeWorkspaceId}
              onChange={(e) => void switchWorkspace(e.target.value)}
            >
              {(workspaces.length > 0
                ? workspaces
                : [{ id: activeWorkspaceId, name: "Primary AI Company" }]
              ).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error ? (
          <p className="mt-4 rounded-lg bg-[var(--hq-warn-soft)] px-3 py-2 text-sm text-[var(--hq-warn)]">
            {error}
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h4 className="text-lg font-semibold">Team members</h4>
          <ul className="mt-4 space-y-2 text-sm">
            {members.length === 0 ? (
              <li className="text-[var(--hq-muted)]">No members yet.</li>
            ) : (
              members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
                >
                  <span>
                    {m.displayName}
                    <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">{m.email}</span>
                  </span>
                  <span className="text-xs capitalize text-[var(--hq-muted)]">{m.role}</span>
                </li>
              ))
            )}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="min-w-[180px] flex-1 rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-sm"
            />
            <select
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className="rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-sm"
            >
              {["owner", "admin", "manager", "member", "viewer"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={isPending || !memberEmail.trim()}
              onClick={() => void addMember()}
              className="rounded-xl bg-[var(--hq-ink)] px-3 py-2 text-sm text-[var(--hq-paper)] disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-lg font-semibold">Notifications</h4>
            <span className="text-xs text-[var(--hq-muted)]">{unread.length} unread</span>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {notifications.length === 0 ? (
              <li className="text-[var(--hq-muted)]">No notifications.</li>
            ) : (
              notifications.slice(0, 8).map((n) => (
                <li key={n.id} className="rounded-lg bg-white px-3 py-2">
                  <p className={`font-medium ${n.read ? "text-[var(--hq-muted)]" : ""}`}>
                    {n.title}
                  </p>
                  <p className="mt-1 text-xs text-[var(--hq-muted)]">{n.body}</p>
                  {!n.read ? (
                    <button
                      type="button"
                      className="mt-2 text-xs text-[var(--hq-signal)] underline-offset-2 hover:underline"
                      onClick={() => void markRead(n.id)}
                    >
                      Mark read
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h4 className="text-lg font-semibold">Activity timeline</h4>
          <ul className="mt-4 space-y-3 text-sm">
            {activityTimeline.length === 0 ? (
              <li className="text-[var(--hq-muted)]">No activity yet.</li>
            ) : (
              activityTimeline.slice(0, 12).map((a) => (
                <li
                  key={a.id}
                  className="grid grid-cols-[auto_1fr_auto] gap-3 border-b border-[var(--hq-line)]/60 py-2 last:border-0"
                >
                  <span className="hq-mono text-[11px] text-[var(--hq-muted)]">
                    {a.createdAt.slice(11, 16)}
                  </span>
                  <span>
                    <span className="font-medium">{a.summary}</span>
                    <span className="mt-0.5 block text-xs text-[var(--hq-muted)]">
                      {a.actorName} · {a.kind}
                    </span>
                  </span>
                  <span className="text-[11px] capitalize text-[var(--hq-muted)]">{a.status}</span>
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="rounded-2xl border border-[var(--hq-line)] bg-[var(--hq-panel)] p-5">
          <h4 className="text-lg font-semibold">Collaboration</h4>
          <p className="mt-1 text-sm text-[var(--hq-muted)]">
            Comment on a mission so teammates see context in the timeline.
          </p>
          <input
            value={commentMissionId}
            onChange={(e) => setCommentMissionId(e.target.value)}
            placeholder="Mission id"
            className="mt-4 w-full rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-sm"
          />
          <textarea
            value={commentBody}
            onChange={(e) => setCommentBody(e.target.value)}
            rows={3}
            placeholder="Add a comment…"
            className="mt-2 w-full rounded-xl border border-[var(--hq-line)] bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={isPending || !commentMissionId.trim() || !commentBody.trim()}
            onClick={() => void postComment()}
            className="mt-3 rounded-xl bg-[var(--hq-signal)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Post comment
          </button>
        </div>
      </div>
    </section>
  );
}
