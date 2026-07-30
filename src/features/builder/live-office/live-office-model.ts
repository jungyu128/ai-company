/**
 * AI Company Live Office — UX mapping only.
 * Derives desk layout, visual states, and discussion links from existing dashboard data.
 * Does not change AI logic, APIs, or stores.
 */

import type { AiCompanyEmployeeStatus } from "@/services/builder/ai-company-employees";
import type {
  AiCompanyDashboard,
  AiCompanyEmployeeCard,
} from "@/services/builder/company.service";
import type { CollaborationMission } from "@/services/builder/collaboration.logic";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";
import { formatHqTimeDisplay } from "@/services/builder/format-hq-display";

export type LiveOfficeVisualState =
  | "idle"
  | "thinking"
  | "working"
  | "discussion"
  | "waiting_approval"
  | "completed";

export type LiveOfficeDesk = {
  employeeId: string;
  department: string;
  /** Fixed desk position on the floor plan (0–100). */
  x: number;
  y: number;
};

export type LiveOfficeConnection = {
  id: string;
  fromEmployeeId: string;
  toEmployeeId: string;
  label: string;
  source: "collaboration" | "recommendation";
};

export type LiveOfficeActivityItem = {
  id: string;
  atDisplay: string;
  /** Epoch ms for stable sort (not rendered). */
  atMs: number;
  summary: string;
  tone: "positive" | "attention" | "neutral";
  employeeId: string | null;
};

export type LiveOfficeEmployeeView = AiCompanyEmployeeCard & {
  visualState: LiveOfficeVisualState;
  visualLabel: string;
  visualEmoji: string;
  desk: LiveOfficeDesk;
  /** When waiting approval, render near CEO zone instead of home desk. */
  atApprovalZone: boolean;
  relatedMissionId: string | null;
  relatedMissionTitle: string | null;
  conversationPreview: Array<{
    id: string;
    speaker: string;
    body: string;
  }>;
  memoryHints: string[];
};

export type LiveOfficeModel = {
  employees: LiveOfficeEmployeeView[];
  connections: LiveOfficeConnection[];
  activity: LiveOfficeActivityItem[];
  departments: string[];
  generatedAtDisplay: string;
};

/** Permanent desk map — fixed seats so the office feels stable. */
export const LIVE_OFFICE_DESKS: LiveOfficeDesk[] = [
  { employeeId: "emma", department: "Product", x: 12, y: 28 },
  { employeeId: "alex", department: "Platform", x: 28, y: 22 },
  { employeeId: "sarah", department: "Executive", x: 44, y: 28 },
  { employeeId: "david", department: "Engineering", x: 60, y: 22 },
  { employeeId: "mia", department: "Engineering", x: 76, y: 28 },
  { employeeId: "noah", department: "Engineering", x: 20, y: 58 },
  { employeeId: "olivia", department: "Engineering", x: 44, y: 62 },
  { employeeId: "ethan", department: "Quality", x: 68, y: 58 },
];

export const CEO_APPROVAL_ZONE = { x: 50, y: 88 };

const VISUAL: Record<
  LiveOfficeVisualState,
  { label: string; emoji: string }
> = {
  idle: { label: "Idle", emoji: "🟢" },
  thinking: { label: "Thinking", emoji: "💭" },
  working: { label: "Working", emoji: "✍️" },
  discussion: { label: "In Discussion", emoji: "🚶" },
  waiting_approval: { label: "Waiting Approval", emoji: "⏳" },
  completed: { label: "Completed", emoji: "✅" },
};

export function mapStatusToLiveOfficeState(
  status: AiCompanyEmployeeStatus
): LiveOfficeVisualState {
  switch (status) {
    case "thinking":
      return "thinking";
    case "working":
      return "working";
    case "collaborating":
      return "discussion";
    case "waiting_approval":
      return "waiting_approval";
    case "completed":
      return "completed";
    case "online":
    case "offline":
    default:
      return "idle";
  }
}

function deskFor(employeeId: string, department: string): LiveOfficeDesk {
  const found = LIVE_OFFICE_DESKS.find((d) => d.employeeId === employeeId);
  if (found) return found;
  return { employeeId, department, x: 50, y: 50 };
}

function relatedMission(
  employeeId: string,
  missions: CollaborationMission[]
): CollaborationMission | null {
  return (
    missions.find(
      (m) =>
        m.leadEmployeeId === employeeId ||
        m.chain.some(
          (s) =>
            s.employeeId === employeeId &&
            ["thinking", "working", "collaborating", "waiting_approval"].includes(
              s.status
            )
        )
    ) ??
    missions.find((m) => m.chain.some((s) => s.employeeId === employeeId)) ??
    null
  );
}

function relatedRecommendation(
  employeeId: string,
  recommendations: EmployeeRecommendation[]
): EmployeeRecommendation | null {
  return (
    recommendations.find(
      (r) =>
        (r.status === "pending" || r.status === "questioned") &&
        (r.conversationOwnerId === employeeId ||
          r.leadEmployeeId === employeeId ||
          r.participatingEmployees.some((p) => p.id === employeeId))
    ) ?? null
  );
}

function conversationPreviewFor(
  employeeId: string,
  mission: CollaborationMission | null,
  recommendation: EmployeeRecommendation | null
): LiveOfficeEmployeeView["conversationPreview"] {
  const turns =
    recommendation?.internalDiscussion?.length
      ? recommendation.internalDiscussion
      : mission?.conversations ?? [];
  return turns
    .filter((t) => t.employeeId !== "system")
    .slice(-6)
    .map((t) => ({
      id: t.id,
      speaker: t.employeeName,
      body: t.body.slice(0, 220),
    }));
}

function memoryHintsFromDashboard(
  employeeId: string,
  dash: AiCompanyDashboard
): string[] {
  const prefs = dash.commandCenter.companyMemory.learnedPreferences ?? [];
  const insights = dash.commandCenter.companyMemory.newInsights ?? [];
  return [...prefs, ...insights]
    .filter((m) => {
      const blob = `${m.title} ${m.insight}`.toLowerCase();
      const emp = dash.employees.find((e) => e.id === employeeId);
      if (!emp) return false;
      return (
        blob.includes(emp.name.toLowerCase()) ||
        emp.expertise.some((x) => blob.includes(x.toLowerCase().split(" ")[0]!)) ||
        blob.includes(emp.department.toLowerCase())
      );
    })
    .slice(0, 4)
    .map((m) => m.title || m.insight);
}

export function buildLiveOfficeConnections(
  missions: CollaborationMission[],
  recommendations: EmployeeRecommendation[]
): LiveOfficeConnection[] {
  const links: LiveOfficeConnection[] = [];
  const seen = new Set<string>();

  for (const mission of missions) {
    const active = mission.chain.filter((s) =>
      ["thinking", "working", "collaborating", "waiting_approval"].includes(s.status)
    );
    for (let i = 0; i < active.length - 1; i++) {
      const from = active[i]!;
      const to = active[i + 1]!;
      if (from.employeeId === to.employeeId) continue;
      const key = [from.employeeId, to.employeeId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        id: `collab-${mission.id}-${key}`,
        fromEmployeeId: from.employeeId,
        toEmployeeId: to.employeeId,
        label: mission.title,
        source: "collaboration",
      });
    }
    // Lead asking next collaborator for help
    const lead = mission.chain[0];
    const helper = mission.chain.find(
      (s) =>
        s.employeeId !== mission.leadEmployeeId &&
        ["working", "collaborating", "thinking"].includes(s.status)
    );
    if (lead && helper) {
      const key = `${lead.employeeId}->${helper.employeeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        links.push({
          id: `help-${mission.id}-${key}`,
          fromEmployeeId: lead.employeeId,
          toEmployeeId: helper.employeeId,
          label: `${lead.employeeName} asked ${helper.employeeName}`,
          source: "collaboration",
        });
      }
    }
  }

  for (const rec of recommendations) {
    if (rec.status !== "pending" && rec.status !== "questioned") continue;
    const owner = rec.conversationOwnerId ?? rec.leadEmployeeId;
    const peers = rec.participatingEmployees
      .map((p) => p.id)
      .filter((id) => id !== owner);
    for (const peer of peers.slice(0, 3)) {
      const key = `${owner}->${peer}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({
        id: `rec-${rec.id}-${key}`,
        fromEmployeeId: owner,
        toEmployeeId: peer,
        label: rec.title,
        source: "recommendation",
      });
    }
  }

  return links.slice(0, 12);
}

function parseAt(isoOrDisplay: string): { atMs: number; atDisplay: string } {
  const atMs = Date.parse(isoOrDisplay);
  if (!Number.isFinite(atMs)) {
    return { atMs: 0, atDisplay: isoOrDisplay };
  }
  return { atMs, atDisplay: formatHqTimeDisplay(isoOrDisplay) };
}

export function buildLiveOfficeActivity(dash: AiCompanyDashboard): LiveOfficeActivityItem[] {
  const items: LiveOfficeActivityItem[] = [];

  for (const a of dash.activityFeed.slice(0, 20)) {
    const when = parseAt(a.at);
    items.push({
      id: `feed-${a.id}`,
      atDisplay: when.atDisplay,
      atMs: when.atMs,
      summary: a.summary,
      tone: a.tone,
      employeeId: a.employeeId,
    });
  }

  for (const a of dash.workspace.activityTimeline.slice(0, 20)) {
    const when = parseAt(a.createdAt);
    items.push({
      id: `ws-${a.id}`,
      atDisplay: when.atDisplay,
      atMs: when.atMs,
      summary: a.summary,
      tone:
        a.kind === "approval" || a.kind === "failure"
          ? "attention"
          : a.kind === "execution" || a.kind === "mission"
            ? "positive"
            : "neutral",
      employeeId: null,
    });
  }

  for (const rec of dash.recommendations.filter(
    (r) => r.status === "pending" || r.status === "questioned"
  )) {
    const last = rec.internalDiscussion[rec.internalDiscussion.length - 1];
    if (!last) continue;
    const when = parseAt(last.at);
    items.push({
      id: `rec-act-${rec.id}-${last.id}`,
      atDisplay: when.atDisplay,
      atMs: when.atMs,
      summary: `${last.employeeName}: ${last.body.slice(0, 100)}`,
      tone: "neutral",
      employeeId: last.employeeId === "ceo" || last.employeeId === "system" ? null : String(last.employeeId),
    });
  }

  return items.sort((a, b) => b.atMs - a.atMs).slice(0, 24);
}

export function buildLiveOfficeModel(dash: AiCompanyDashboard): LiveOfficeModel {
  const connections = buildLiveOfficeConnections(
    dash.activeCollaborations,
    dash.recommendations
  );
  const departments = [
    ...new Set(LIVE_OFFICE_DESKS.map((d) => d.department)),
  ];

  const employees: LiveOfficeEmployeeView[] = dash.employees.map((emp) => {
    const visualState = mapStatusToLiveOfficeState(emp.status);
    const meta = VISUAL[visualState];
    const mission = relatedMission(emp.id, dash.activeCollaborations);
    const recommendation = relatedRecommendation(emp.id, dash.recommendations);
    return {
      ...emp,
      visualState,
      visualLabel: meta.label,
      visualEmoji: meta.emoji,
      desk: deskFor(emp.id, emp.department),
      atApprovalZone: visualState === "waiting_approval",
      relatedMissionId: mission?.id ?? recommendation?.id ?? null,
      relatedMissionTitle: mission?.title ?? recommendation?.title ?? null,
      conversationPreview: conversationPreviewFor(
        emp.id,
        mission,
        recommendation
      ),
      memoryHints: memoryHintsFromDashboard(emp.id, dash),
    };
  });

  return {
    employees,
    connections,
    activity: buildLiveOfficeActivity(dash),
    departments,
    generatedAtDisplay: dash.generatedAtDisplay,
  };
}

/** Resolve rendered position (approval zone overrides desk). */
export function renderPosition(emp: LiveOfficeEmployeeView): { x: number; y: number } {
  if (emp.atApprovalZone) {
    // Fan waiting employees slightly around CEO zone
    const waitingIndex = Math.abs(
      emp.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
    ) % 5;
    return {
      x: CEO_APPROVAL_ZONE.x - 16 + waitingIndex * 8,
      y: CEO_APPROVAL_ZONE.y,
    };
  }
  return { x: emp.desk.x, y: emp.desk.y };
}
