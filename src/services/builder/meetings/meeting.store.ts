/**
 * Persist AI Company meetings.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { CompanyMeeting, MeetingKind, MeetingStatus } from "./types";

export const MEETINGS_FILE = "ai-company-meetings.json";

export type MeetingsStoreShape = {
  meetings: CompanyMeeting[];
};

function emptyStore(): MeetingsStoreShape {
  return { meetings: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(MEETINGS_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): MeetingsStoreShape {
  const parsed = readJson<MeetingsStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed || !Array.isArray(parsed.meetings)) return emptyStore();
  return { meetings: parsed.meetings };
}

function writeStore(root: string, workspaceId: string, store: MeetingsStoreShape) {
  writeJson(root, fileFor(workspaceId), store);
}

export function getMeetingsStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): MeetingsStoreShape {
  return readStore(path.resolve(repoRoot), workspaceId);
}

export function listMeetings(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID,
  limit = 80
): CompanyMeeting[] {
  return getMeetingsStore(repoRoot, workspaceId).meetings.slice(0, limit);
}

export function getMeetingById(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyMeeting | null {
  return (
    getMeetingsStore(repoRoot, workspaceId).meetings.find((m) => m.id === id) ??
    null
  );
}

export function upsertMeeting(
  meeting: CompanyMeeting,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyMeeting {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.meetings.findIndex((m) => m.id === meeting.id);
  if (idx >= 0) store.meetings[idx] = meeting;
  else store.meetings.unshift(meeting);
  store.meetings = store.meetings.slice(0, 300);
  writeStore(root, workspaceId, store);
  return meeting;
}

export function listOpenMeetingKinds(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): Set<MeetingKind> {
  const open: MeetingStatus[] = [
    "scheduled",
    "in_discussion",
    "awaiting_ceo",
    "postponed",
  ];
  const set = new Set<MeetingKind>();
  for (const m of getMeetingsStore(repoRoot, workspaceId).meetings) {
    if (open.includes(m.status)) set.add(m.kind);
  }
  return set;
}
