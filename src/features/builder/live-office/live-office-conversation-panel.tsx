"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import type { LiveOfficeEmployeeView } from "@/features/builder/live-office/live-office-model";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import type {
  HqChatMessage,
  HqChatQuickAction,
} from "@/services/builder/hq-chat.logic";
import { AI_COMPANY_EMPLOYEES } from "@/services/builder/ai-company-employees";
import {
  CONVERSATION_PANEL_LAYOUT,
  recallEmployeeThread,
  rememberEmployeeThread,
  type ConversationThreadCacheEntry,
} from "@/features/builder/lib/conversation-panel-layout";

function delayUntilIso(hoursFromNow: number): string {
  return new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
}

type Props = {
  employee: LiveOfficeEmployeeView | null;
  workspaceId: string;
  relatedRecommendation?: EmployeeRecommendation | null;
};

type ThreadCache = ConversationThreadCacheEntry<HqChatMessage, HqChatQuickAction>;

function newClientRequestId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function LiveOfficeConversationPanel({
  employee,
  workspaceId,
  relatedRecommendation = null,
}: Props) {
  const router = useRouter();
  const cacheRef = useRef<Map<string, ThreadCache>>(new Map());
  const listRef = useRef<HTMLUListElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<HqChatMessage[]>([]);
  const [quickActions, setQuickActions] = useState<HqChatQuickAction[]>([]);
  const [draft, setDraft] = useState("");
  const [reassignTo, setReassignTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [typing, setTyping] = useState(false);
  const [streamingBody, setStreamingBody] = useState<string | null>(null);
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  // Closed by default so Action Required never steals chat height until CEO opens it.
  const [actionsOpen, setActionsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [swap, setSwap] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingBody, typing, scrollToBottom]);

  useEffect(() => {
    setDraft("");
    setReassignTo("");
    setError(null);
    setLastFailedText(null);
    setStreamingBody(null);
    setTyping(false);
    setSwap(true);
    const t = window.setTimeout(() => setSwap(false), 280);
    return () => window.clearTimeout(t);
  }, [employee?.id]);

  useEffect(() => {
    if (!employee) {
      setMessages([]);
      setQuickActions([]);
      return;
    }

    const cached = recallEmployeeThread(cacheRef.current, employee.id);
    if (cached) {
      setMessages(cached.messages);
      setQuickActions(cached.quickActions);
    }

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    setLoadingThread(!cached);

    void (async () => {
      try {
        const res = await fetch(
          `/api/builder/hq/chat?employeeId=${encodeURIComponent(employee.id)}&workspaceId=${encodeURIComponent(workspaceId)}&markRead=1`,
          { signal: ac.signal }
        );
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          messages?: HqChatMessage[];
          quickActions?: HqChatQuickAction[];
        };
        if (ac.signal.aborted) return;
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Could not load conversation");
          return;
        }
        const next: ThreadCache = {
          messages: data.messages ?? [],
          quickActions: data.quickActions ?? [],
        };
        cacheRef.current = rememberEmployeeThread(
          cacheRef.current,
          employee.id,
          next
        );
        setMessages(next.messages);
        setQuickActions(next.quickActions);
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError("Network error while loading conversation");
      } finally {
        if (!ac.signal.aborted) setLoadingThread(false);
      }
    })();

    return () => ac.abort();
  }, [employee?.id, workspaceId]);

  async function sendMessage(textOverride?: string) {
    if (!employee || sending || typing) return;
    const text = (textOverride ?? draft).trim();
    if (!text) return;

    setError(null);
    setLastFailedText(null);
    setDraft("");
    setSending(true);

    const clientRequestId = newClientRequestId();
    const optimistic: HqChatMessage = {
      id: `local-${clientRequestId}`,
      employeeId: employee.id,
      role: "ceo",
      speakerName: "CEO",
      speakerRole: "Executive",
      body: text,
      at: new Date().toISOString(),
      kind: "chat",
      clientRequestId,
    };
    setMessages((prev) => {
      const next = [...prev, optimistic];
      cacheRef.current = rememberEmployeeThread(cacheRef.current, employee.id, {
        messages: next,
        quickActions,
      });
      return next;
    });
    setTyping(true);
    setStreamingBody("");

    try {
      const res = await fetch(
        `/api/builder/hq/chat?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            employeeId: employee.id,
            message: text,
            clientRequestId,
            stream: true,
          }),
        }
      );

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "Could not send message");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      let finalEmployee: HqChatMessage | null = null;
      let finalCeo: HqChatMessage | null = null;
      let nextActions = quickActions;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part
            .split("\n")
            .find((l) => l.startsWith("data: "));
          if (!line) continue;
          const payload = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            message?: HqChatMessage;
            quickActions?: HqChatQuickAction[];
          };
          if (payload.type === "ceo" && payload.message) {
            finalCeo = payload.message;
            setMessages((prev) => {
              const withoutLocal = prev.filter((m) => m.id !== optimistic.id);
              const next = [...withoutLocal, payload.message!];
              cacheRef.current = rememberEmployeeThread(
                cacheRef.current,
                employee.id,
                { messages: next, quickActions: nextActions }
              );
              return next;
            });
          } else if (payload.type === "token" && payload.text) {
            streamed += payload.text;
            setStreamingBody(streamed);
          } else if (payload.type === "done" && payload.message) {
            finalEmployee = payload.message;
            nextActions = payload.quickActions ?? nextActions;
            setQuickActions(nextActions);
          } else if (payload.type === "error") {
            throw new Error("Stream failed");
          }
        }
      }

      if (finalEmployee) {
        setMessages((prev) => {
          const base = finalCeo
            ? prev.some((m) => m.id === finalCeo!.id)
              ? prev
              : [...prev.filter((m) => m.id !== optimistic.id), finalCeo!]
            : prev;
          const withoutDup = base.filter((m) => m.id !== finalEmployee!.id);
          const next = [...withoutDup, finalEmployee!];
          cacheRef.current = rememberEmployeeThread(
            cacheRef.current,
            employee.id,
            { messages: next, quickActions: nextActions }
          );
          return next;
        });
      }
      setStreamingBody(null);
      setTyping(false);
    } catch (e) {
      setTyping(false);
      setStreamingBody(null);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setDraft(text);
      setLastFailedText(text);
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  async function decide(
    action: "approve" | "reject" | "ask" | "reassign" | "delay"
  ) {
    if (!relatedRecommendation) return;
    setError(null);
    setBusyAction(true);
    try {
      const note =
        action === "ask"
          ? draft.trim() || "Please share the evidence behind this recommendation."
          : draft.trim() || null;
      const res = await fetch(
        `/api/builder/hq/recommendations?workspaceId=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recommendationId: relatedRecommendation.id,
            action,
            note,
            reassignToEmployeeId: action === "reassign" ? reassignTo || null : null,
            delayUntil: action === "delay" ? delayUntilIso(24) : null,
          }),
        }
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not update recommendation");
        return;
      }
      setDraft("");
      startTransition(() => router.refresh());
    } catch {
      setError("Network error while updating recommendation");
    } finally {
      setBusyAction(false);
    }
  }

  function onQuickAction(action: HqChatQuickAction) {
    if (action === "ask_evidence") {
      if (relatedRecommendation) {
        void decide("ask");
      } else {
        void sendMessage("Please share the evidence behind your latest update.");
      }
      return;
    }
    if (!relatedRecommendation) {
      void sendMessage(
        action === "approve"
          ? "Approved — proceed."
          : action === "reject"
            ? "Rejected — stop and revise."
            : action === "delay"
              ? "Hold this for 24 hours."
              : "Who should own this instead?"
      );
      return;
    }
    const map: Record<
      Exclude<HqChatQuickAction, "ask_evidence">,
      "approve" | "reject" | "reassign" | "delay"
    > = {
      approve: "approve",
      reject: "reject",
      reassign: "reassign",
      delay: "delay",
    };
    void decide(map[action]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const locked = sending || typing || busyAction || isPending;
  const showActions =
    quickActions.length > 0 || Boolean(relatedRecommendation);

  return (
    <aside
      className={CONVERSATION_PANEL_LAYOUT.rootClass}
      aria-label="Employee conversation"
    >
      <header className={CONVERSATION_PANEL_LAYOUT.headerClass}>
        <div className="min-w-0">
          <p className="lo-conversation__eyebrow">Conversation</p>
          <h3 className="lo-conversation__title">
            {employee ? employee.name : "Floor channel"}
          </h3>
          <p className="lo-conversation__sub">
            {employee
              ? `${employee.role} · ${employee.visualLabel}`
              : "Select a desk to open conversation"}
          </p>
          {employee ? (
            <p className="lo-conversation__status" aria-live="polite">
              Live · {employee.visualEmoji} {employee.visualLabel}
            </p>
          ) : null}
        </div>
        {employee ? (
          <span
            className="lo-conversation__avatar"
            style={{ backgroundColor: employee.avatar.hue }}
            aria-hidden
          >
            {employee.avatar.initials}
          </span>
        ) : null}
      </header>

      <div
        key={employee?.id ?? "none"}
        className={`lo-conversation__body-wrap${swap ? " lo-conversation__body-wrap--swap" : ""}`}
      >
        {employee ? (
          <>
            <div className={CONVERSATION_PANEL_LAYOUT.chatClass}>
              {loadingThread && messages.length === 0 ? (
                <p className="lo-conversation__empty">Loading conversation…</p>
              ) : messages.length === 0 && !typing ? (
                <p className="lo-conversation__empty">
                  Ask {employee.name} a follow-up — replies use their permanent role, mission,
                  and company context.
                </p>
              ) : (
                <ul
                  className={CONVERSATION_PANEL_LAYOUT.listClass}
                  ref={listRef}
                  aria-label="Message history"
                >
                  {messages.map((m) => (
                    <li
                      key={m.id}
                      className={`lo-conversation__turn lo-conversation__turn--${m.role}${
                        m.kind === "proactive" ? " lo-conversation__turn--proactive" : ""
                      }`}
                    >
                      <p className="lo-conversation__speaker">
                        {m.speakerName}
                        {m.kind === "proactive" ? (
                          <span className="lo-conversation__proactive-tag">Proactive</span>
                        ) : null}
                      </p>
                      <p className="lo-conversation__body">{m.body}</p>
                    </li>
                  ))}
                  {typing ? (
                    <li className="lo-conversation__turn lo-conversation__turn--employee lo-conversation__turn--typing">
                      <p className="lo-conversation__speaker">{employee.name}</p>
                      <p className="lo-conversation__body">
                        {streamingBody ? (
                          streamingBody
                        ) : (
                          <span className="lo-conversation__typing-dots" aria-label="Typing">
                            <span />
                            <span />
                            <span />
                          </span>
                        )}
                      </p>
                    </li>
                  ) : null}
                </ul>
              )}

              {error ? (
                <div className="lo-conversation__error-row">
                  <p className="lo-conversation__error">{error}</p>
                  {lastFailedText ? (
                    <button
                      type="button"
                      className="lo-btn lo-btn--ghost"
                      disabled={locked}
                      onClick={() => void sendMessage(lastFailedText)}
                    >
                      Retry
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            {showActions ? (
              <details
                className={CONVERSATION_PANEL_LAYOUT.actionRequiredClass}
                open={actionsOpen}
                onToggle={(e) => setActionsOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="lo-conversation__action-summary">
                  Action Required
                  {relatedRecommendation ? (
                    <span className="lo-conversation__action-count">1</span>
                  ) : null}
                </summary>
                <div className="lo-conversation__actions">
                  {relatedRecommendation ? (
                    <p className="lo-conversation__rec-title">
                      {relatedRecommendation.title}
                    </p>
                  ) : null}
                  {quickActions.includes("reassign") || relatedRecommendation ? (
                    <label className="lo-conversation__reassign">
                      Reassign to
                      <select
                        value={reassignTo}
                        onChange={(e) => setReassignTo(e.target.value)}
                        disabled={locked}
                      >
                        <option value="">Select employee…</option>
                        {AI_COMPANY_EMPLOYEES.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} · {e.role}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  <div className="lo-conversation__btns">
                    {(quickActions.length
                      ? quickActions
                      : ([
                          "approve",
                          "reject",
                          "ask_evidence",
                          "reassign",
                          "delay",
                        ] as HqChatQuickAction[])
                    ).map((action) => (
                      <button
                        key={action}
                        type="button"
                        disabled={
                          locked ||
                          (action === "reassign" &&
                            !reassignTo &&
                            Boolean(relatedRecommendation))
                        }
                        onClick={() => onQuickAction(action)}
                        className={
                          action === "approve"
                            ? "lo-btn lo-btn--primary"
                            : action === "reject"
                              ? "lo-btn lo-btn--danger"
                              : "lo-btn lo-btn--ghost"
                        }
                      >
                        {action === "approve"
                          ? "Approve"
                          : action === "reject"
                            ? "Reject"
                            : action === "ask_evidence"
                              ? "Ask for evidence"
                              : action === "reassign"
                                ? "Reassign"
                                : "Delay"}
                      </button>
                    ))}
                  </div>
                </div>
              </details>
            ) : null}

            <div className={CONVERSATION_PANEL_LAYOUT.composerClass}>
              <input
                className="lo-conversation__input"
                placeholder="Ask a follow-up question…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                disabled={locked}
                aria-label="Ask a follow-up question"
              />
              <button
                type="button"
                className="lo-btn lo-btn--send"
                disabled={locked || !draft.trim()}
                onClick={() => void sendMessage()}
              >
                {sending || typing ? "…" : "Send"}
              </button>
            </div>

            <Link
              href={`/builder/hq/employees/${employee.id}?workspaceId=${encodeURIComponent(workspaceId)}`}
              className={CONVERSATION_PANEL_LAYOUT.profileClass}
            >
              Open full profile →
            </Link>
          </>
        ) : (
          <p className="lo-conversation__empty">
            Click any desk in the office to talk with that employee.
          </p>
        )}
      </div>
    </aside>
  );
}
