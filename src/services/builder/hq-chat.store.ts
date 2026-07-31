/**
 * Persist HQ desk chat threads per employee (storage-backed).
 */

import path from "node:path";
import type { HqChatMessage } from "./hq-chat.logic";
import { opsRel } from "./workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "./workspace/types";
import { readJson, writeJson } from "./storage";

export const HQ_CHAT_FILE = "ai-company-hq-chat.json";
export const HQ_CHAT_REL = opsRel(HQ_CHAT_FILE, DEFAULT_WORKSPACE_ID);

export type HqChatThread = {
  employeeId: string;
  messages: HqChatMessage[];
  updatedAt: string;
  unreadProactive: boolean;
};

type StoreShape = {
  threads: Record<string, HqChatThread>;
};

function emptyStore(): StoreShape {
  return { threads: {} };
}

function fileFor(workspaceId: string) {
  return opsRel(HQ_CHAT_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): StoreShape {
  const parsed = readJson<StoreShape>(root, fileFor(workspaceId), emptyStore());
  if (!parsed || typeof parsed.threads !== "object" || parsed.threads == null) {
    return emptyStore();
  }
  return { threads: parsed.threads };
}

function writeStore(root: string, workspaceId: string, store: StoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function getChatThread(
  employeeId: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): HqChatThread {
  const store = readStore(path.resolve(repoRoot), workspaceId);
  const existing = store.threads[employeeId];
  if (existing && Array.isArray(existing.messages)) {
    return {
      employeeId,
      messages: existing.messages,
      updatedAt: existing.updatedAt,
      unreadProactive: Boolean(existing.unreadProactive),
    };
  }
  return {
    employeeId,
    messages: [],
    updatedAt: new Date(0).toISOString(),
    unreadProactive: false,
  };
}

export function saveChatThread(
  thread: HqChatThread,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): HqChatThread {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  store.threads[thread.employeeId] = {
    employeeId: thread.employeeId,
    messages: thread.messages,
    updatedAt: thread.updatedAt,
    unreadProactive: thread.unreadProactive,
  };
  writeStore(root, workspaceId, store);
  return store.threads[thread.employeeId];
}

export function appendChatMessages(input: {
  employeeId: string;
  messages: HqChatMessage[];
  unreadProactive?: boolean;
  repoRoot?: string;
  workspaceId?: string;
}): HqChatThread {
  const root = path.resolve(input.repoRoot ?? process.cwd());
  const workspaceId = input.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const thread = getChatThread(input.employeeId, root, workspaceId);
  const next: HqChatThread = {
    employeeId: input.employeeId,
    messages: [...thread.messages, ...input.messages],
    updatedAt: input.messages.at(-1)?.at ?? new Date().toISOString(),
    unreadProactive:
      input.unreadProactive !== undefined
        ? input.unreadProactive
        : thread.unreadProactive,
  };
  return saveChatThread(next, root, workspaceId);
}

export function findMessageByClientRequestId(
  employeeId: string,
  clientRequestId: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): { ceo: HqChatMessage; employee: HqChatMessage | null } | null {
  const thread = getChatThread(employeeId, repoRoot, workspaceId);
  const idx = thread.messages.findIndex(
    (m) => m.role === "ceo" && m.clientRequestId === clientRequestId
  );
  if (idx < 0) return null;
  const ceo = thread.messages[idx];
  const next = thread.messages[idx + 1];
  return {
    ceo,
    employee: next && next.role === "employee" ? next : null,
  };
}

export function listUnreadProactiveEmployeeIds(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): string[] {
  const store = readStore(path.resolve(repoRoot), workspaceId);
  return Object.values(store.threads)
    .filter((t) => t.unreadProactive)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((t) => t.employeeId);
}

export function markChatThreadRead(
  employeeId: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): HqChatThread {
  const root = path.resolve(repoRoot);
  const thread = getChatThread(employeeId, root, workspaceId);
  if (!thread.unreadProactive) return thread;
  return saveChatThread(
    { ...thread, unreadProactive: false },
    root,
    workspaceId
  );
}
