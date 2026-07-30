/**
 * AI CEO resource planning — recommend only; never bypass permissions/approvals.
 */

import { AI_COMPANY_EMPLOYEES, getEmployeeDefinition } from "../ai-company-employees";
import type { CollaborationMission } from "../collaboration.logic";
import type { WorkloadMap } from "../orchestrator.logic";
import { newId, nowIso } from "../workspace/json-file";
import { sanitizeCeoText } from "./safety";
import type { PlanningRecommendation, WorkloadEntry } from "./types";

export function buildWorkloadEntries(
  workloads: WorkloadMap,
  missions: CollaborationMission[]
): WorkloadEntry[] {
  return AI_COMPANY_EMPLOYEES.map((emp) => {
    const activeItems = workloads[emp.id] ?? 0;
    const pendingApprovals = missions.filter(
      (m) =>
        (m.approvalStatus === "pending" || m.approvalStatus === "changes_requested") &&
        m.chain.some((s) => s.employeeId === emp.id)
    ).length;
    const loadScore = activeItems * 12 + pendingApprovals * 8;
    const status: WorkloadEntry["status"] =
      loadScore >= 70
        ? "overloaded"
        : loadScore >= 45
          ? "heavy"
          : loadScore >= 15
            ? "balanced"
            : "light";
    return {
      employeeId: emp.id,
      employeeName: emp.name,
      role: emp.role,
      activeItems,
      pendingApprovals,
      loadScore,
      status,
    };
  }).sort((a, b) => b.loadScore - a.loadScore);
}

export function buildPlanningRecommendations(input: {
  workspaceId: string;
  workloads: WorkloadEntry[];
  missions: CollaborationMission[];
  now?: string;
}): PlanningRecommendation[] {
  const now = input.now ?? nowIso();
  const out: PlanningRecommendation[] = [];
  const heavy = input.workloads.filter(
    (w) => w.status === "overloaded" || w.status === "heavy"
  );
  const light = input.workloads.filter((w) => w.status === "light");

  for (const h of heavy) {
    const target = light[0] ?? input.workloads.find((w) => w.employeeId !== h.employeeId);
    const mission = input.missions.find(
      (m) =>
        m.leadEmployeeId === h.employeeId &&
        m.approvalStatus !== "rejected" &&
        m.finalOutcome !== "completed"
    );
    if (!target) continue;
    out.push({
      id: newId("plan"),
      workspaceId: input.workspaceId,
      kind: "reassign",
      title: `Reassign work from ${h.employeeName} to ${target.employeeName}`,
      rationale: sanitizeCeoText(
        `${h.employeeName} is ${h.status}; ${target.employeeName} has capacity.`
      ),
      fromEmployeeId: h.employeeId,
      toEmployeeId: target.employeeId,
      missionId: mission?.id ?? null,
      priorityHint: "medium",
      requiresHumanApproval: true,
      createdAt: now,
    });
    out.push({
      id: newId("plan"),
      workspaceId: input.workspaceId,
      kind: "balance",
      title: `Balance workload for ${h.employeeName}`,
      rationale: "Spread lower-priority items to keep delivery predictable.",
      fromEmployeeId: h.employeeId,
      toEmployeeId: target.employeeId,
      missionId: null,
      priorityHint: null,
      requiresHumanApproval: true,
      createdAt: now,
    });
  }

  // Multi-employee collaboration suggestions for complex pending missions
  for (const m of input.missions) {
    if (m.approvalStatus === "rejected" || m.finalOutcome === "completed") continue;
    if (m.chain.length >= 2) continue;
    const blob = `${m.title} ${m.mission}`.toLowerCase();
    if (!/(proposal|pipeline|document|email|calendar|contract)/.test(blob)) continue;
    const partner =
      AI_COMPANY_EMPLOYEES.find((e) => e.id !== m.leadEmployeeId) ?? null;
    if (!partner) continue;
    out.push({
      id: newId("plan"),
      workspaceId: input.workspaceId,
      kind: "collaborate",
      title: `Add ${partner.name} to “${m.title}”`,
      rationale: sanitizeCeoText(
        "Multi-employee collaboration can improve quality before CEO approval."
      ),
      fromEmployeeId: m.leadEmployeeId,
      toEmployeeId: partner.id,
      missionId: m.id,
      priorityHint: "high",
      requiresHumanApproval: true,
      createdAt: now,
    });
  }

  // Priority reordering for stalled + overdue-ish
  const pending = input.missions.filter(
    (m) => m.approvalStatus === "pending" || m.approvalStatus === "changes_requested"
  );
  if (pending.length >= 2) {
    const sorted = [...pending].sort(
      (a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt)
    );
    out.push({
      id: newId("plan"),
      workspaceId: input.workspaceId,
      kind: "reorder",
      title: `Prioritize “${sorted[0].title}” ahead of newer items`,
      rationale: "Older waiting work should move first to reduce stall risk.",
      fromEmployeeId: sorted[0].leadEmployeeId,
      toEmployeeId: null,
      missionId: sorted[0].id,
      priorityHint: "high",
      requiresHumanApproval: true,
      createdAt: now,
    });
  }

  // Escalation for blocked-looking missions
  for (const m of input.missions) {
    const waiting = m.chain.some((s) => s.status === "waiting_approval");
    if (!waiting) continue;
    const ageH = (Date.parse(now) - Date.parse(m.updatedAt)) / (1000 * 60 * 60);
    if (ageH < 36) continue;
    out.push({
      id: newId("plan"),
      workspaceId: input.workspaceId,
      kind: "escalate",
      title: `Escalate blocked approval: ${m.title}`,
      rationale: "Work is waiting on human approval longer than expected.",
      fromEmployeeId: m.leadEmployeeId,
      toEmployeeId: null,
      missionId: m.id,
      priorityHint: "critical",
      requiresHumanApproval: true,
      createdAt: now,
    });
  }

  return out.slice(0, 24);
}

/** Apply a reassignment recommendation to mission lead (still requires human approval for writes). */
export function applyReassignmentRecommendation(
  mission: CollaborationMission,
  toEmployeeId: string
): CollaborationMission {
  const emp = getEmployeeDefinition(toEmployeeId);
  if (!emp) return mission;
  return {
    ...mission,
    leadEmployeeId: toEmployeeId,
    updatedAt: nowIso(),
    chain: mission.chain.map((step, idx) =>
      idx === 0
        ? {
            ...step,
            employeeId: toEmployeeId,
            employeeName: emp.name,
            role: emp.role,
          }
        : step
    ),
  };
}
