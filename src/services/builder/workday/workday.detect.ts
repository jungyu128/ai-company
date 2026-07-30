/**
 * Detect workday items from company data + connection status.
 * Never fabricates external facts when a system is disconnected.
 */

import { createHash } from "node:crypto";
import {
  getEmployeeDefinition,
  matchEmployeeIdsForText,
} from "../ai-company-employees";
import type { CollaborationMission } from "../collaboration.logic";
import type { ApprovalCenterItem } from "../approval.service";
import type { EmployeeRecommendation } from "../proactive.logic";
import type { ConnectionStatus, ExecutionRecord } from "../execution/types";
import type {
  WorkdayCategory,
  WorkdayDetectedItem,
  WorkdaySource,
} from "./types";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fingerprint(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
}

function itemId(sourceKey: string) {
  return `wd-item-${fingerprint(sourceKey)}`;
}

function assignFor(source: WorkdaySource, text: string): {
  lead: string;
  collaborators: string[];
} {
  const defaults: Record<WorkdaySource, string> = {
    gmail: "emma",
    google_calendar: "alex",
    google_drive: "david",
    crm: "sarah",
    missions: matchEmployeeIdsForText(text)[0] ?? "emma",
    approvals: matchEmployeeIdsForText(text)[0] ?? "emma",
    executions: matchEmployeeIdsForText(text)[0] ?? "emma",
    company: "emma",
  };
  const lead = defaults[source];
  const matched = matchEmployeeIdsForText(text).filter((id) => id !== lead);
  // Multi-employee when domain spans communications + docs / CRM
  const collaborators = matched.slice(0, 2);
  if (
    /proposal|quote|pipeline/.test(text.toLowerCase()) &&
    lead === "sarah" &&
    !collaborators.includes("david")
  ) {
    collaborators.push("david");
  }
  if (
    /email|follow.?up/.test(text.toLowerCase()) &&
    lead !== "emma" &&
    !collaborators.includes("emma")
  ) {
    collaborators.push("emma");
  }
  return { lead, collaborators: Array.from(new Set(collaborators)) };
}

function bandScore(urgency: number, impact: number, confidence: number) {
  return clamp(Math.round(urgency * 0.4 + impact * 0.35 + confidence * 0.25), 1, 100);
}

export function buildSourceFingerprint(input: {
  connections: ConnectionStatus[];
  missions: CollaborationMission[];
  approvals: ApprovalCenterItem[];
  executions: ExecutionRecord[];
  recommendations: EmployeeRecommendation[];
}): string {
  return fingerprint({
    connections: input.connections.map((c) => ({
      system: c.system,
      connected: c.connected,
      reason: c.reason,
    })),
    missions: input.missions.map((m) => ({
      id: m.id,
      status: m.approvalStatus,
      updatedAt: m.updatedAt,
      title: m.title,
    })),
    approvals: input.approvals.map((a) => ({ id: a.id, updatedAt: a.updatedAt })),
    executions: input.executions.map((e) => ({
      id: e.id,
      status: e.status,
      updatedAt: e.updatedAt,
    })),
    recommendations: input.recommendations.map((r) => ({
      id: r.id,
      status: r.status,
      updatedAt: r.updatedAt,
    })),
  });
}

export function detectWorkdayItems(input: {
  connections: ConnectionStatus[];
  missions: CollaborationMission[];
  approvals: ApprovalCenterItem[];
  executions: ExecutionRecord[];
  recommendations: EmployeeRecommendation[];
  now?: string;
}): { items: WorkdayDetectedItem[]; unavailableSources: string[] } {
  const now = input.now ?? new Date().toISOString();
  const items: WorkdayDetectedItem[] = [];
  const unavailableSources: string[] = [];
  const seen = new Set<string>();

  function push(partial: Omit<WorkdayDetectedItem, "id" | "fingerprint"> & { fingerprintBase: unknown }) {
    if (seen.has(partial.sourceKey)) return;
    seen.add(partial.sourceKey);
    const { fingerprintBase, ...rest } = partial;
    items.push({
      ...rest,
      id: itemId(partial.sourceKey),
      fingerprint: fingerprint(fingerprintBase),
    });
  }

  for (const c of input.connections) {
    if (!c.connected) {
      const label = c.system.replace(/_/g, " ");
      unavailableSources.push(label);
      push({
        sourceKey: `integration:${c.system}`,
        source: "company",
        category: "integration",
        title: `${label} disconnected`,
        detail: c.reason ?? `${label} is unavailable.`,
        urgency: 55,
        impact: 60,
        confidence: 95,
        deadline: null,
        assignedEmployeeId:
          c.system === "gmail"
            ? "emma"
            : c.system === "google_calendar"
              ? "alex"
              : c.system === "google_drive"
                ? "david"
                : "sarah",
        collaboratingEmployeeIds: [],
        proposedAction: "Reconnect the integration before external writes.",
        requiresCeoApproval: false,
        relatedMissionId: null,
        relatedExecutionId: null,
        status: "disconnected",
        fingerprintBase: { system: c.system, reason: c.reason },
      });
    }
  }

  const gmailConnected = input.connections.some((c) => c.system === "gmail" && c.connected);
  const calendarConnected = input.connections.some(
    (c) => c.system === "google_calendar" && c.connected
  );
  const driveConnected = input.connections.some(
    (c) => c.system === "google_drive" && c.connected
  );
  const crmConnected = input.connections.some((c) => c.system === "crm" && c.connected);

  // Company-side signals from missions / recommendations (never invent inbox contents)
  for (const m of input.missions) {
    const hay = `${m.title} ${m.mission}`.toLowerCase();
    const ageHours = Math.max(
      0,
      (Date.parse(now) - Date.parse(m.createdAt)) / 3_600_000
    );
    const overdue =
      ageHours > 48 &&
      (m.approvalStatus === "pending" || m.approvalStatus === "changes_requested");
    const { lead, collaborators } = assignFor("missions", hay);

    if (overdue) {
      push({
        sourceKey: `mission-overdue:${m.id}`,
        source: "missions",
        category: "mission",
        title: `Overdue mission: ${m.title}`,
        detail: `Waiting ${Math.round(ageHours)}h without completion.`,
        urgency: 85,
        impact: 75,
        confidence: 88,
        deadline: m.updatedAt,
        assignedEmployeeId: lead,
        collaboratingEmployeeIds: collaborators,
        proposedAction: "Re-prioritize and request CEO decision if blocked.",
        requiresCeoApproval: true,
        relatedMissionId: m.id,
        relatedExecutionId: null,
        status: "detected",
        fingerprintBase: { id: m.id, updatedAt: m.updatedAt, status: m.approvalStatus },
      });
    }

    if (/email|inbox|gmail|unanswered/.test(hay)) {
      push({
        sourceKey: `mission-email:${m.id}`,
        source: gmailConnected ? "gmail" : "missions",
        category: "email",
        title: m.title,
        detail: gmailConnected
          ? "Email-related mission — prepare reply preview."
          : "Email work noted from company missions (Gmail disconnected — no inbox fabricated).",
        urgency: 70,
        impact: 65,
        confidence: gmailConnected ? 80 : 55,
        deadline: null,
        assignedEmployeeId: "emma",
        collaboratingEmployeeIds: collaborators.filter((id) => id !== "emma"),
        proposedAction: gmailConnected
          ? "Prepare reply draft for CEO approval."
          : "Reconnect Gmail, then prepare reply draft.",
        requiresCeoApproval: true,
        relatedMissionId: m.id,
        relatedExecutionId: null,
        status: gmailConnected ? "detected" : "disconnected",
        fingerprintBase: { id: m.id, updatedAt: m.updatedAt },
      });
    }

    if (/calendar|conflict|meeting|schedule/.test(hay)) {
      push({
        sourceKey: `mission-calendar:${m.id}`,
        source: calendarConnected ? "google_calendar" : "missions",
        category: "calendar",
        title: m.title,
        detail: calendarConnected
          ? "Calendar-related mission — detect conflicts and prepare brief."
          : "Calendar work noted from missions (Calendar disconnected — no schedule fabricated).",
        urgency: 72,
        impact: 70,
        confidence: calendarConnected ? 82 : 55,
        deadline: null,
        assignedEmployeeId: "alex",
        collaboratingEmployeeIds: collaborators.filter((id) => id !== "alex"),
        proposedAction: calendarConnected
          ? "Prepare schedule change preview for CEO approval."
          : "Reconnect Calendar, then prepare schedule preview.",
        requiresCeoApproval: true,
        relatedMissionId: m.id,
        relatedExecutionId: null,
        status: calendarConnected ? "detected" : "disconnected",
        fingerprintBase: { id: m.id, updatedAt: m.updatedAt },
      });
    }

    if (/document|proposal|report|quote|drive/.test(hay)) {
      push({
        sourceKey: `mission-doc:${m.id}`,
        source: driveConnected ? "google_drive" : "missions",
        category: "document",
        title: m.title,
        detail: driveConnected
          ? "Document mission — generate draft and save after approval."
          : "Document work noted from missions (Drive disconnected — no files fabricated).",
        urgency: 60,
        impact: 68,
        confidence: driveConnected ? 78 : 50,
        deadline: null,
        assignedEmployeeId: "david",
        collaboratingEmployeeIds: collaborators.filter((id) => id !== "david"),
        proposedAction: driveConnected
          ? "Prepare document save preview for CEO approval."
          : "Reconnect Drive, then prepare document preview.",
        requiresCeoApproval: true,
        relatedMissionId: m.id,
        relatedExecutionId: null,
        status: driveConnected ? "detected" : "disconnected",
        fingerprintBase: { id: m.id, updatedAt: m.updatedAt },
      });
    }

    if (/crm|pipeline|customer|follow.?up|deal/.test(hay)) {
      push({
        sourceKey: `mission-crm:${m.id}`,
        source: crmConnected ? "crm" : "missions",
        category: "crm",
        title: m.title,
        detail: crmConnected
          ? "CRM mission — prepare customer update for approval."
          : "CRM work noted from missions (CRM unavailable — no customer records fabricated).",
        urgency: 74,
        impact: 80,
        confidence: crmConnected ? 80 : 52,
        deadline: null,
        assignedEmployeeId: "sarah",
        collaboratingEmployeeIds: collaborators.filter((id) => id !== "sarah"),
        proposedAction: crmConnected
          ? "Prepare CRM update preview for CEO approval."
          : "CRM live connector deferred — keep internal plan only.",
        requiresCeoApproval: true,
        relatedMissionId: m.id,
        relatedExecutionId: null,
        status: crmConnected ? "detected" : "disconnected",
        fingerprintBase: { id: m.id, updatedAt: m.updatedAt },
      });
    }
  }

  for (const a of input.approvals) {
    const emp = a.requestingEmployee.id;
    push({
      sourceKey: `approval:${a.id}`,
      source: "approvals",
      category: "approval",
      title: `Pending approval: ${a.title}`,
      detail: `${a.requestingEmployee.name} is waiting on your decision.`,
      urgency: 80,
      impact: 70,
      confidence: 92,
      deadline: a.updatedAt,
      assignedEmployeeId: emp,
      collaboratingEmployeeIds: a.collaborationChain
        .map((c) => c.employeeId)
        .filter((id) => id !== emp)
        .slice(0, 2),
      proposedAction: "Review plan and approve, reject, or request changes.",
      requiresCeoApproval: true,
      relatedMissionId: a.id,
      relatedExecutionId: null,
      status: "awaiting_approval",
      fingerprintBase: { id: a.id, updatedAt: a.updatedAt, status: a.approvalStatus },
    });
  }

  for (const e of input.executions) {
    if (e.status !== "awaiting_approval" && e.status !== "executing") continue;
    push({
      sourceKey: `execution:${e.id}`,
      source: "executions",
      category:
        e.system === "gmail"
          ? "email"
          : e.system === "google_calendar"
            ? "calendar"
            : e.system === "google_drive"
              ? "document"
              : "crm",
      title: e.requestedAction,
      detail: e.preview.summary,
      urgency: 78,
      impact: 72,
      confidence: 90,
      deadline: null,
      assignedEmployeeId: e.employeeId,
      collaboratingEmployeeIds: [],
      proposedAction: "Approve or reject the external write preview.",
      requiresCeoApproval: true,
      relatedMissionId: e.missionId,
      relatedExecutionId: e.id,
      status: e.status === "executing" ? "executing" : "awaiting_approval",
      fingerprintBase: {
        id: e.id,
        status: e.status,
        fingerprint: e.dataFingerprint,
      },
    });
  }

  for (const r of input.recommendations) {
    if (r.status !== "pending" && r.status !== "questioned") continue;
    const { collaborators } = assignFor("company", r.recommendation);
    push({
      sourceKey: `recommendation:${r.id}`,
      source: "company",
      category: "mission",
      title: r.title,
      detail: r.reasoning,
      urgency: clamp(Math.round(r.confidence * 0.7 + 20), 40, 90),
      impact: clamp(Math.round(r.confidence * 0.6 + 30), 40, 95),
      confidence: clamp(Math.round(r.confidence), 1, 100),
      deadline: r.delayedUntil,
      assignedEmployeeId: r.leadEmployeeId,
      collaboratingEmployeeIds: r.participatingEmployees
        .map((p) => p.id)
        .filter((id) => id !== r.leadEmployeeId)
        .concat(collaborators)
        .filter((id, i, arr) => arr.indexOf(id) === i)
        .slice(0, 2),
      proposedAction: r.recommendation,
      requiresCeoApproval: true,
      relatedMissionId: null,
      relatedExecutionId: null,
      status: "detected",
      fingerprintBase: { id: r.id, updatedAt: r.updatedAt, status: r.status },
    });
  }

  // Sort by composite score
  items.sort(
    (a, b) =>
      bandScore(b.urgency, b.impact, b.confidence) -
      bandScore(a.urgency, a.impact, a.confidence)
  );

  return { items, unavailableSources: Array.from(new Set(unavailableSources)) };
}

export function employeeName(id: string) {
  return getEmployeeDefinition(id)?.name ?? id;
}
