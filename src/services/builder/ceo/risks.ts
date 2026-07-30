/**
 * Operational risk detection for the AI CEO.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import type { CollaborationMission } from "../collaboration.logic";
import type { ExecutionRecord } from "../execution/types";
import type { ConnectionStatus } from "../execution/types";
import type { WorkloadMap } from "../orchestrator.logic";
import { newId, nowIso } from "../workspace/json-file";
import { sanitizeCeoText } from "./safety";
import type { OperationalRisk, RiskSeverity } from "./types";

export type RiskDetectionInput = {
  workspaceId: string;
  missions: CollaborationMission[];
  executions: ExecutionRecord[];
  connections: ConnectionStatus[];
  workloads: WorkloadMap;
  approvalBacklog: number;
  now?: string;
};

function ownerName(employeeId: string | null) {
  if (!employeeId) return "AI CEO";
  return getEmployeeDefinition(employeeId)?.name ?? employeeId;
}

function severityFromLoad(load: number): RiskSeverity {
  if (load >= 8) return "critical";
  if (load >= 6) return "high";
  if (load >= 4) return "medium";
  return "low";
}

export function detectOperationalRisks(input: RiskDetectionInput): OperationalRisk[] {
  const now = input.now ?? nowIso();
  const risks: OperationalRisk[] = [];
  const nowMs = Date.parse(now);

  // Overloaded employees
  for (const [employeeId, load] of Object.entries(input.workloads)) {
    if (load < 4) continue;
    const emp = getEmployeeDefinition(employeeId);
    risks.push({
      id: newId("risk"),
      workspaceId: input.workspaceId,
      kind: "overloaded_employee",
      title: `${emp?.name ?? employeeId} is overloaded`,
      severity: severityFromLoad(load),
      confidence: Math.min(95, 55 + load * 6),
      impact: `${load} active work items may slow delivery and raise approval wait times.`,
      recommendation: `Reassign lower-priority work from ${emp?.name ?? employeeId} or add a collaborator.`,
      ownerEmployeeId: employeeId,
      ownerName: ownerName(employeeId),
      relatedId: employeeId,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Stalled missions (pending/approved but stale)
  for (const m of input.missions) {
    if (m.approvalStatus === "rejected") continue;
    if (m.finalOutcome === "completed") continue;
    const ageH = (nowMs - Date.parse(m.updatedAt)) / (1000 * 60 * 60);
    if (ageH < 48) continue;
    risks.push({
      id: newId("risk"),
      workspaceId: input.workspaceId,
      kind: "stalled_mission",
      title: `Stalled mission: ${m.title}`,
      severity: ageH > 120 ? "high" : "medium",
      confidence: 78,
      impact: "Mission progress has paused; customers or executives may wait longer.",
      recommendation: "Escalate to the lead employee or reassign ownership.",
      ownerEmployeeId: m.leadEmployeeId,
      ownerName: ownerName(m.leadEmployeeId),
      relatedId: m.id,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Approval bottlenecks
  if (input.approvalBacklog >= 3) {
    risks.push({
      id: newId("risk"),
      workspaceId: input.workspaceId,
      kind: "approval_bottleneck",
      title: "Approval backlog is building",
      severity: input.approvalBacklog >= 6 ? "high" : "medium",
      confidence: 88,
      impact: `${input.approvalBacklog} items await human approval — external work cannot proceed.`,
      recommendation: "Review the approval queue; AI CEO will not auto-approve external writes.",
      ownerEmployeeId: null,
      ownerName: "Human CEO",
      relatedId: null,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Disconnected integrations
  for (const c of input.connections) {
    if (c.system === "crm") continue; // deferred is expected
    if (c.connected) continue;
    risks.push({
      id: newId("risk"),
      workspaceId: input.workspaceId,
      kind: "disconnected_integration",
      title: `${labelSystem(c.system)} is disconnected`,
      severity: "medium",
      confidence: 90,
      impact: "Live actions for this system stay blocked until reconnected.",
      recommendation: sanitizeCeoText(
        c.reason ?? "Reconnect the system from launch readiness settings."
      ),
      ownerEmployeeId: null,
      ownerName: "Human CEO",
      relatedId: c.system,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Repeated / recurring execution failures
  const fails = input.executions.filter(
    (e) => e.status === "failed" || e.executionStatus === "failed"
  );
  const byEmployee = new Map<string, number>();
  for (const f of fails) {
    byEmployee.set(f.employeeId, (byEmployee.get(f.employeeId) ?? 0) + 1);
  }
  for (const [employeeId, count] of byEmployee) {
    if (count < 2) continue;
    risks.push({
      id: newId("risk"),
      workspaceId: input.workspaceId,
      kind: count >= 3 ? "recurring_execution_failure" : "repeated_failures",
      title: `Repeated execution failures for ${ownerName(employeeId)}`,
      severity: count >= 3 ? "high" : "medium",
      confidence: Math.min(92, 60 + count * 10),
      impact: "Failed executions waste cycles and may hide connector issues.",
      recommendation: "Inspect connection health and recent failure notes before retrying.",
      ownerEmployeeId: employeeId,
      ownerName: ownerName(employeeId),
      relatedId: employeeId,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Overdue follow-ups (email/sales missions aging)
  for (const m of input.missions) {
    const blob = `${m.title} ${m.mission}`.toLowerCase();
    if (!/(follow[- ]?up|unanswered|overdue|urgent)/.test(blob)) continue;
    if (m.finalOutcome === "completed" || m.approvalStatus === "rejected") continue;
    const ageH = (nowMs - Date.parse(m.createdAt)) / (1000 * 60 * 60);
    if (ageH < 24) continue;
    risks.push({
      id: newId("risk"),
      workspaceId: input.workspaceId,
      kind: "overdue_follow_up",
      title: `Overdue follow-up: ${m.title}`,
      severity: ageH > 72 ? "high" : "medium",
      confidence: 74,
      impact: "Customer or partner response windows may close.",
      recommendation: "Prioritize this follow-up and prepare an approved draft.",
      ownerEmployeeId: m.leadEmployeeId,
      ownerName: ownerName(m.leadEmployeeId),
      relatedId: m.id,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  // Declining productivity — more fails than successes recently
  const recent = input.executions.slice(0, 12);
  const recentFail = recent.filter((e) => e.status === "failed").length;
  const recentOk = recent.filter((e) => e.status === "succeeded").length;
  if (recent.length >= 4 && recentFail > recentOk) {
    risks.push({
      id: newId("risk"),
      workspaceId: input.workspaceId,
      kind: "declining_productivity",
      title: "Execution productivity is declining",
      severity: "high",
      confidence: 70,
      impact: "Recent execution outcomes skew toward failure.",
      recommendation: "Pause new external prep; clear connector and approval issues first.",
      ownerEmployeeId: null,
      ownerName: "AI CEO",
      relatedId: null,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
  }

  return risks.slice(0, 40).map((r) => ({
    ...r,
    title: sanitizeCeoText(r.title),
    impact: sanitizeCeoText(r.impact),
    recommendation: sanitizeCeoText(r.recommendation),
  }));
}

function labelSystem(system: string) {
  switch (system) {
    case "gmail":
      return "Gmail";
    case "google_calendar":
      return "Google Calendar";
    case "google_drive":
      return "Google Drive";
    case "crm":
      return "CRM";
    default:
      return system;
  }
}
