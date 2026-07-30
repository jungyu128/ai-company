/**
 * Internal company coordination helpers.
 * Assign, rebalance, unblock, optimize chains, prevent duplicates.
 * Never expose orchestrator terminology in UI copy.
 */

import { getEmployeeDefinition } from "./ai-company-employees";
import type { CollaborationMission } from "./collaboration.logic";
import { planCollaborationChain } from "./collaboration.logic";
import type { MissionPriorityScore } from "./priority.logic";
import { prioritizeMissions } from "./priority.logic";
import type { MissionOutcomeRecord } from "./learning.logic";
import type { ConversationTurn } from "./conversation.logic";

export type WorkloadMap = Record<string, number>;

export type BlockedMission = {
  missionId: string;
  title: string;
  reason: string;
  ownerEmployeeId: string;
};

export type DuplicateGroup = {
  keepMissionId: string;
  duplicateMissionIds: string[];
  titleHint: string;
};

export type AutonomyActionKind =
  | "ask_help"
  | "delegate"
  | "split"
  | "merge"
  | "escalate";

export type AutonomyEvent = {
  id: string;
  kind: AutonomyActionKind;
  missionId: string;
  fromEmployeeId: string;
  toEmployeeId: string | null;
  summary: string;
  at: string;
  escalatedToCeo: boolean;
};

export type CoordinationPlan = {
  assignments: Array<{
    missionId: string;
    ownerEmployeeId: string;
    ownerName: string;
    priority: string;
  }>;
  rebalanced: Array<{ missionId: string; from: string; to: string; reason: string }>;
  blocked: BlockedMission[];
  optimizedChains: Array<{ missionId: string; before: string[]; after: string[] }>;
  duplicates: DuplicateGroup[];
  autonomyEvents: AutonomyEvent[];
};

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function computeWorkloads(missions: CollaborationMission[]): WorkloadMap {
  const map: WorkloadMap = {};
  for (const m of missions) {
    if (m.approvalStatus === "rejected") continue;
    if (m.finalOutcome === "completed" && m.approvalStatus === "approved") continue;
    for (const step of m.chain) {
      map[step.employeeId] = (map[step.employeeId] ?? 0) + 1;
    }
  }
  return map;
}

export function detectBlockedMissions(missions: CollaborationMission[]): BlockedMission[] {
  const out: BlockedMission[] = [];
  for (const m of missions) {
    const blockedStep = m.chain.find((s) => s.status === "blocked");
    if (blockedStep) {
      out.push({
        missionId: m.id,
        title: m.title,
        reason: `${blockedStep.employeeName} is blocked`,
        ownerEmployeeId: m.leadEmployeeId,
      });
      continue;
    }
    if (m.approvalStatus === "changes_requested") {
      out.push({
        missionId: m.id,
        title: m.title,
        reason: "Waiting on revised plan after CEO feedback",
        ownerEmployeeId: m.leadEmployeeId,
      });
    }
    const waitingTooLong =
      m.approvalStatus === "pending" &&
      Date.parse(m.updatedAt) < Date.now() - 48 * 3_600_000;
    if (waitingTooLong) {
      out.push({
        missionId: m.id,
        title: m.title,
        reason: "Pending approval longer than expected",
        ownerEmployeeId: m.leadEmployeeId,
      });
    }
  }
  return out;
}

export function findDuplicateMissions(missions: CollaborationMission[]): DuplicateGroup[] {
  const byTitle = new Map<string, CollaborationMission[]>();
  for (const m of missions) {
    if (m.approvalStatus === "rejected") continue;
    const key = normalizeTitle(m.title);
    if (!key) continue;
    const list = byTitle.get(key) ?? [];
    list.push(m);
    byTitle.set(key, list);
  }
  const groups: DuplicateGroup[] = [];
  for (const [, list] of byTitle) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
    );
    groups.push({
      keepMissionId: sorted[0].id,
      duplicateMissionIds: sorted.slice(1).map((m) => m.id),
      titleHint: sorted[0].title,
    });
  }
  return groups;
}

export function optimizeCollaborationChain(
  mission: CollaborationMission
): CollaborationMission {
  const ids = mission.chain.map((s) => s.employeeId);
  const unique: string[] = [];
  for (const id of ids) {
    if (!unique.includes(id)) unique.push(id);
  }
  if (unique.length === ids.length) return mission;

  const rebuilt = planCollaborationChain({
    missionId: mission.id,
    title: mission.title,
    mission: mission.mission,
    leadEmployeeId: unique[0] ?? mission.leadEmployeeId,
    planSummary: mission.planSummary,
    planSteps: mission.planSteps,
    now: mission.updatedAt,
  });

  return {
    ...mission,
    chain: rebuilt.chain,
    conversations: rebuilt.conversations,
    leadEmployeeId: rebuilt.leadEmployeeId,
  };
}

export function rebalanceAssignments(
  missions: CollaborationMission[],
  priorities: MissionPriorityScore[]
): Array<{ missionId: string; from: string; to: string; reason: string }> {
  const workloads = computeWorkloads(missions);
  const moves: Array<{ missionId: string; from: string; to: string; reason: string }> = [];
  const pending = missions.filter(
    (m) => m.approvalStatus === "pending" || m.approvalStatus === "changes_requested"
  );

  for (const m of pending) {
    const from = m.leadEmployeeId;
    const load = workloads[from] ?? 0;
    if (load < 3) continue;
    const candidates = Object.keys(workloads)
      .concat(
        // ensure catalog peers considered
        ["emma", "alex", "sarah", "david", "mia", "noah", "olivia", "ethan"]
      )
      .filter((id, i, arr) => arr.indexOf(id) === i && id !== from);
    const lightest = candidates.sort(
      (a, b) => (workloads[a] ?? 0) - (workloads[b] ?? 0)
    )[0];
    if (!lightest) continue;
    if ((workloads[lightest] ?? 0) + 1 >= load) continue;
    const pri = priorities.find((p) => p.missionId === m.id);
    if (pri && pri.priority === "P0") continue; // keep critical with current owner
    moves.push({
      missionId: m.id,
      from,
      to: lightest,
      reason: `Rebalanced from overloaded ${getEmployeeDefinition(from)?.name ?? from}`,
    });
    workloads[from] = Math.max(0, load - 1);
    workloads[lightest] = (workloads[lightest] ?? 0) + 1;
  }

  return moves;
}

export function buildAutonomyEvents(
  missions: CollaborationMission[],
  blocked: BlockedMission[],
  duplicates: DuplicateGroup[],
  now: string
): AutonomyEvent[] {
  const events: AutonomyEvent[] = [];

  for (const m of missions) {
    if (m.chain.length < 2) continue;
    const lead = m.chain[0];
    const helper = m.chain[1];
    if (lead && helper && m.approvalStatus === "pending") {
      events.push({
        id: `auto-help-${m.id}`,
        kind: "ask_help",
        missionId: m.id,
        fromEmployeeId: lead.employeeId,
        toEmployeeId: helper.employeeId,
        summary: `${lead.employeeName} asked ${helper.employeeName} for help on “${m.title}”.`,
        at: now,
        escalatedToCeo: false,
      });
    }
  }

  for (const b of blocked) {
    const needsCeo =
      /approval|CEO|feedback/i.test(b.reason) || b.reason.includes("Pending approval");
    events.push({
      id: `auto-esc-${b.missionId}`,
      kind: needsCeo ? "escalate" : "ask_help",
      missionId: b.missionId,
      fromEmployeeId: b.ownerEmployeeId,
      toEmployeeId: needsCeo ? null : "mia",
      summary: needsCeo
        ? `${getEmployeeDefinition(b.ownerEmployeeId)?.name ?? "Employee"} escalated “${b.title}” — CEO input required.`
        : `${getEmployeeDefinition(b.ownerEmployeeId)?.name ?? "Employee"} requested help on blocked work.`,
      at: now,
      escalatedToCeo: needsCeo,
    });
  }

  for (const d of duplicates) {
    events.push({
      id: `auto-merge-${d.keepMissionId}`,
      kind: "merge",
      missionId: d.keepMissionId,
      fromEmployeeId: "sarah",
      toEmployeeId: null,
      summary: `Merged duplicate missions into “${d.titleHint}”.`,
      at: now,
      escalatedToCeo: false,
    });
  }

  return events;
}

export function applyDelegate(
  mission: CollaborationMission,
  toEmployeeId: string,
  now: string
): { mission: CollaborationMission; event: AutonomyEvent } {
  const to = getEmployeeDefinition(toEmployeeId);
  if (!to) throw new Error("UNKNOWN_EMPLOYEE");
  const from = mission.leadEmployeeId;
  const next = planCollaborationChain({
    missionId: mission.id,
    title: mission.title,
    mission: mission.mission,
    leadEmployeeId: toEmployeeId,
    planSummary: mission.planSummary,
    planSteps: mission.planSteps,
    now,
  });
  const discussion: ConversationTurn[] = [
    ...(mission.conversations ?? []),
    {
      id: `${mission.id}-delegate-${now}`,
      employeeId: from,
      employeeName: getEmployeeDefinition(from)?.name ?? from,
      role: getEmployeeDefinition(from)?.role ?? "AI Employee",
      body: `Delegating this mission to ${to.name}.`,
      at: now,
      kind: "handoff",
    },
  ];
  return {
    mission: {
      ...mission,
      ...next,
      conversations: discussion,
      leadEmployeeId: toEmployeeId,
      updatedAt: now,
    },
    event: {
      id: `auto-delegate-${mission.id}-${now}`,
      kind: "delegate",
      missionId: mission.id,
      fromEmployeeId: from,
      toEmployeeId,
      summary: `Delegated “${mission.title}” to ${to.name}.`,
      at: now,
      escalatedToCeo: false,
    },
  };
}

export function applySplitMission(
  mission: CollaborationMission,
  now: string
): { primary: CollaborationMission; secondary: CollaborationMission; event: AutonomyEvent } {
  const mid = Math.max(1, Math.floor(mission.chain.length / 2));
  const firstIds = mission.chain.slice(0, mid).map((s) => s.employeeId);
  const secondIds = mission.chain.slice(mid).map((s) => s.employeeId);
  const leadA = firstIds[0] ?? mission.leadEmployeeId;
  const leadB = secondIds[0] ?? mission.leadEmployeeId;

  const primary = planCollaborationChain({
    missionId: mission.id,
    title: `${mission.title} (part A)`,
    mission: mission.mission,
    leadEmployeeId: leadA,
    planSummary: mission.planSummary,
    planSteps: mission.planSteps.slice(0, Math.ceil(mission.planSteps.length / 2)),
    now,
  });
  const secondary = planCollaborationChain({
    missionId: `${mission.id}-B`,
    title: `${mission.title} (part B)`,
    mission: mission.mission,
    leadEmployeeId: leadB,
    planSummary: mission.planSummary,
    planSteps: mission.planSteps.slice(Math.ceil(mission.planSteps.length / 2)),
    now,
  });

  return {
    primary: { ...mission, ...primary, id: mission.id, updatedAt: now },
    secondary,
    event: {
      id: `auto-split-${mission.id}-${now}`,
      kind: "split",
      missionId: mission.id,
      fromEmployeeId: mission.leadEmployeeId,
      toEmployeeId: leadB,
      summary: `Split “${mission.title}” into parallel workstreams.`,
      at: now,
      escalatedToCeo: false,
    },
  };
}

export function runCoordination(
  missions: CollaborationMission[],
  options?: { outcomes?: MissionOutcomeRecord[]; now?: string }
): CoordinationPlan {
  const now = options?.now ?? new Date().toISOString();
  const priorities = prioritizeMissions(missions, {
    outcomes: options?.outcomes,
    now,
  });
  const blocked = detectBlockedMissions(missions);
  const duplicates = findDuplicateMissions(missions);
  const rebalanced = rebalanceAssignments(missions, priorities);
  const optimizedChains: CoordinationPlan["optimizedChains"] = [];

  for (const m of missions) {
    const optimized = optimizeCollaborationChain(m);
    const before = m.chain.map((s) => s.employeeId);
    const after = optimized.chain.map((s) => s.employeeId);
    if (before.join() !== after.join()) {
      optimizedChains.push({ missionId: m.id, before, after });
    }
  }

  const assignments = priorities
    .filter((p) =>
      missions.some(
        (m) =>
          m.id === p.missionId &&
          (m.approvalStatus === "pending" ||
            m.approvalStatus === "changes_requested" ||
            m.approvalStatus === "approved")
      )
    )
    .slice(0, 20)
    .map((p) => ({
      missionId: p.missionId,
      ownerEmployeeId: p.recommendedOwnerId,
      ownerName: p.recommendedOwnerName,
      priority: p.priority,
    }));

  const autonomyEvents = buildAutonomyEvents(missions, blocked, duplicates, now);

  return {
    assignments,
    rebalanced,
    blocked,
    optimizedChains,
    duplicates,
    autonomyEvents,
  };
}

export function employeesNeedingHelp(
  plan: CoordinationPlan,
  workloads: WorkloadMap
): Array<{ employeeId: string; name: string; reason: string }> {
  const out: Array<{ employeeId: string; name: string; reason: string }> = [];
  for (const b of plan.blocked) {
    out.push({
      employeeId: b.ownerEmployeeId,
      name: getEmployeeDefinition(b.ownerEmployeeId)?.name ?? b.ownerEmployeeId,
      reason: b.reason,
    });
  }
  for (const [id, load] of Object.entries(workloads)) {
    if (load >= 4) {
      out.push({
        employeeId: id,
        name: getEmployeeDefinition(id)?.name ?? id,
        reason: `High workload (${load} active items)`,
      });
    }
  }
  // dedupe by employeeId keeping first reason
  const seen = new Set<string>();
  return out.filter((e) => {
    if (seen.has(e.employeeId)) return false;
    seen.add(e.employeeId);
    return true;
  });
}
