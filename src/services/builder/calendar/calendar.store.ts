/**
 * Persist AI Company calendar events.
 */

import path from "node:path";
import { opsRel } from "../workspace/paths";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { readJson, writeJson } from "../storage";
import type { CompanyCalendarEvent } from "./types";

export const CALENDAR_FILE = "ai-company-calendar.json";

export type CalendarStoreShape = {
  events: CompanyCalendarEvent[];
};

function emptyStore(): CalendarStoreShape {
  return { events: [] };
}

function fileFor(workspaceId: string) {
  return opsRel(CALENDAR_FILE, workspaceId);
}

function readStore(root: string, workspaceId: string): CalendarStoreShape {
  const parsed = readJson<CalendarStoreShape>(
    root,
    fileFor(workspaceId),
    emptyStore()
  );
  if (!parsed || !Array.isArray(parsed.events)) return emptyStore();
  return { events: parsed.events };
}

function writeStore(
  root: string,
  workspaceId: string,
  store: CalendarStoreShape
) {
  writeJson(root, fileFor(workspaceId), store);
}

export function getCalendarStore(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CalendarStoreShape {
  return readStore(path.resolve(repoRoot), workspaceId);
}

export function listCalendarEvents(
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID,
  limit = 200
): CompanyCalendarEvent[] {
  return getCalendarStore(repoRoot, workspaceId).events.slice(0, limit);
}

export function getCalendarEventById(
  id: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyCalendarEvent | null {
  return (
    listCalendarEvents(repoRoot, workspaceId).find((e) => e.id === id) ?? null
  );
}

export function upsertCalendarEvent(
  event: CompanyCalendarEvent,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyCalendarEvent {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const idx = store.events.findIndex((e) => e.id === event.id);
  if (idx >= 0) store.events[idx] = event;
  else store.events.unshift(event);
  store.events = store.events.slice(0, 500);
  writeStore(root, workspaceId, store);
  return event;
}

export function upsertCalendarEvents(
  events: CompanyCalendarEvent[],
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyCalendarEvent[] {
  const root = path.resolve(repoRoot);
  const store = readStore(root, workspaceId);
  const byId = new Map(store.events.map((e) => [e.id, e]));
  for (const event of events) byId.set(event.id, event);
  store.events = [...byId.values()]
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 500);
  writeStore(root, workspaceId, store);
  return events;
}

export function listEventsForWorkItem(
  workItemId: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyCalendarEvent[] {
  return listCalendarEvents(repoRoot, workspaceId).filter(
    (e) => e.workItemId === workItemId
  );
}

export function listEventsForMeeting(
  meetingId: string,
  repoRoot = process.cwd(),
  workspaceId = DEFAULT_WORKSPACE_ID
): CompanyCalendarEvent[] {
  return listCalendarEvents(repoRoot, workspaceId).filter(
    (e) => e.meetingId === meetingId
  );
}
