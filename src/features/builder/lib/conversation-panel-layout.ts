/**
 * Layout contract for the HQ Conversation panel.
 * Keeps chat history as the primary surface; actions never cover messages.
 */

export const CONVERSATION_PANEL_LAYOUT = {
  rootClass: "lo-conversation",
  headerClass: "lo-conversation__head",
  chatClass: "lo-conversation__chat",
  listClass: "lo-conversation__list",
  actionRequiredClass: "lo-conversation__action-required",
  composerClass: "lo-conversation__composer",
  profileClass: "lo-conversation__profile",
  /** Message list must claim remaining height and scroll itself. */
  listMinHeightCss: "12rem",
  /** Dock must stay pinned and tall enough for readable history. */
  dockMinHeightCss: "26rem",
  /** Action Required stays collapsed unless the CEO expands it. */
  actionRequiredDefaultOpen: false,
  sectionOrder: [
    "header",
    "chat",
    "actionRequired",
    "composer",
    "profile",
  ] as const,
} as const;

export type ConversationThreadCacheEntry<TMessages, TActions> = {
  messages: TMessages[];
  quickActions: TActions[];
};

/** Preserve per-employee history when switching desks. */
export function rememberEmployeeThread<TMessages, TActions>(
  cache: Map<string, ConversationThreadCacheEntry<TMessages, TActions>>,
  employeeId: string,
  entry: ConversationThreadCacheEntry<TMessages, TActions>
): Map<string, ConversationThreadCacheEntry<TMessages, TActions>> {
  const next = new Map(cache);
  next.set(employeeId, {
    messages: [...entry.messages],
    quickActions: [...entry.quickActions],
  });
  return next;
}

export function recallEmployeeThread<TMessages, TActions>(
  cache: Map<string, ConversationThreadCacheEntry<TMessages, TActions>>,
  employeeId: string
): ConversationThreadCacheEntry<TMessages, TActions> | null {
  return cache.get(employeeId) ?? null;
}

/** True when switching employees must not wipe the prior employee's cache. */
export function preservesHistoryAcrossEmployees(
  cache: Map<string, ConversationThreadCacheEntry<unknown, unknown>>,
  fromEmployeeId: string,
  toEmployeeId: string
): boolean {
  if (fromEmployeeId === toEmployeeId) return true;
  return cache.has(fromEmployeeId);
}
