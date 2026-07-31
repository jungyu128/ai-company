/**
 * Live Work Tracker — real-time employee work state for CEO Dashboard & cards.
 * Syncs from Continuous OS; appends timeline when state changes.
 */

import "server-only";

import path from "node:path";
import { getAutonomyStore } from "../autonomous-company/autonomous-company.store";
import {
  getContinuousOsStore,
  upsertEmployeeStates,
} from "../continuous-os/continuous-os.store";
import { listCompanyMeetings } from "../meetings/meeting.service";
import { recordWorkStateTimelineTransition } from "../company-timeline/company-timeline.service";
import { recordWorkspaceEvent } from "../workspace/collaboration-feed";
import { DEFAULT_WORKSPACE_ID } from "../workspace/types";
import { isInternalAiCompanyEnabled } from "../internal-ai-company";
import {
  buildLiveWorkTrackerSnapshot,
  enrichEmployeeLiveState,
  fingerprintsFromSnapshot,
  meetingOccupancy,
} from "./live-work.logic";
import {
  getLiveWorkTrackerStore,
  saveLiveWorkTrackerStore,
} from "./live-work.store";
import type { LiveWorkTrackerEntry, LiveWorkTrackerSnapshot } from "./types";

function resolveRoot(repoRoot?: string) {
  return path.resolve(repoRoot ?? process.cwd());
}

/**
 * Enrich Continuous OS states with Idle/Meeting + tracker fields, then persist.
 */
export function enrichAndPersistLiveStates(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
}): ReturnType<typeof upsertEmployeeStates> {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();
  const cos = getContinuousOsStore(root, workspaceId);
  const tasks = getAutonomyStore(root, workspaceId).tasks;
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const meetings = listCompanyMeetings({ repoRoot: root, workspaceId, limit: 40 });

  const enriched = cos.employeeStates.map((base) => {
    const task = base.activeTaskId ? byTask.get(base.activeTaskId) ?? null : null;
    const occ = meetingOccupancy({ meetings, employeeId: base.employeeId });
    return enrichEmployeeLiveState({
      base,
      task,
      inMeeting: occ.inMeeting,
      meetingTitle: occ.meetingTitle,
      now,
    });
  });

  return upsertEmployeeStates(enriched, root, workspaceId);
}

/**
 * Build snapshot + record timeline/audit for any work-state changes.
 */
export function syncLiveWorkTracker(input?: {
  repoRoot?: string;
  workspaceId?: string;
  now?: string;
  recordTimeline?: boolean;
}): LiveWorkTrackerSnapshot {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const now = input?.now ?? new Date().toISOString();

  if (!isInternalAiCompanyEnabled()) {
    return {
      asOf: now,
      employees: [],
      summary: {
        idle: 0,
        planning: 0,
        working: 0,
        reviewing: 0,
        meeting: 0,
        waiting: 0,
        blocked: 0,
        completed: 0,
      },
      recentChanges: [],
    };
  }

  enrichAndPersistLiveStates({ repoRoot: root, workspaceId, now });

  const cos = getContinuousOsStore(root, workspaceId);
  const tasks = getAutonomyStore(root, workspaceId).tasks;
  const store = getLiveWorkTrackerStore(root, workspaceId);

  const snapshot = buildLiveWorkTrackerSnapshot({
    liveStates: cos.employeeStates,
    tasks,
    previousFingerprints: store.fingerprints,
    now,
  });

  if (input?.recordTimeline !== false) {
    for (const change of snapshot.recentChanges) {
      recordWorkspaceEvent({
        workspaceId,
        kind: "assignment",
        summary: change.summary,
        actorUserId: null,
        actorName: change.employeeName,
        actorRole: "ai_employee",
        relatedType: "live_work",
        relatedId: change.employeeId,
        status: change.toStatus,
        auditAction: "live_work.state_change",
        auditResult: "ok",
        repoRoot: root,
      });
      recordWorkStateTimelineTransition({
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        employeeId: change.employeeId,
        employeeName: change.employeeName,
        taskTitle: change.summary,
        at: change.at,
        repoRoot: root,
        workspaceId,
      });
    }
  }

  saveLiveWorkTrackerStore(
    {
      fingerprints: fingerprintsFromSnapshot(snapshot),
      lastSyncAt: now,
      lastSnapshot: snapshot,
    },
    root,
    workspaceId
  );

  return snapshot;
}

export function getLiveWorkTrackerSnapshot(input?: {
  repoRoot?: string;
  workspaceId?: string;
  sync?: boolean;
  now?: string;
}): LiveWorkTrackerSnapshot {
  const root = resolveRoot(input?.repoRoot);
  const workspaceId = input?.workspaceId ?? DEFAULT_WORKSPACE_ID;
  if (input?.sync !== false) {
    return syncLiveWorkTracker({
      repoRoot: root,
      workspaceId,
      now: input?.now,
      recordTimeline: true,
    });
  }
  const store = getLiveWorkTrackerStore(root, workspaceId);
  if (store.lastSnapshot) return store.lastSnapshot;
  return syncLiveWorkTracker({
    repoRoot: root,
    workspaceId,
    now: input?.now,
    recordTimeline: false,
  });
}

export function getLiveWorkForEmployee(input: {
  employeeId: string;
  repoRoot?: string;
  workspaceId?: string;
}): LiveWorkTrackerEntry | null {
  const snap = getLiveWorkTrackerSnapshot({
    repoRoot: input.repoRoot,
    workspaceId: input.workspaceId,
    sync: true,
  });
  return snap.employees.find((e) => e.employeeId === input.employeeId) ?? null;
}
