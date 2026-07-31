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
import {
  LIVE_OFFICE_VISUAL_META,
  approvalZonePosition,
  discussionPosition,
  mapCardStatusToVisualState,
  mapLiveWorkToVisualState,
  separateOverlappingPositions,
  shouldMoveToApprovalZone,
  shouldMoveTowardPartner,
  type LiveOfficeVisualState,
} from "@/features/builder/live-office/live-office-visual-state";

export type { LiveOfficeVisualState } from "@/features/builder/live-office/live-office-visual-state";

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
  /** Real discussion partner id when moving toward a coworker. */
  discussionPartnerId: string | null;
  discussionPartnerName: string | null;
  /** Resolved floor position after movement + de-overlap. */
  renderX: number;
  renderY: number;
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

/**
 * Permanent seats — percentages map to office-plate.png:
 * back row of 3 (farther), front row of 3 (nearer), plus two aisle seats.
 * Anchor = above each seated employee's head (label floats above, never over monitor).
 */
export const LIVE_OFFICE_DESKS: LiveOfficeDesk[] = [
  { employeeId: "sarah", department: "Product", x: 31, y: 40 },
  { employeeId: "daniel", department: "Platform", x: 49, y: 37 },
  { employeeId: "sophia", department: "Executive Engineering", x: 67, y: 40 },
  { employeeId: "david", department: "Engineering", x: 35, y: 61 },
  { employeeId: "alex", department: "Engineering", x: 53, y: 64 },
  { employeeId: "noah", department: "AI Engineering", x: 71, y: 61 },
  { employeeId: "olivia", department: "Engineering", x: 18, y: 48 },
  { employeeId: "emma", department: "Quality", x: 85, y: 52 },
];

export const CEO_APPROVAL_ZONE = { x: 80, y: 76 };

const VISUAL_EMOJI: Record<LiveOfficeVisualState, string> = {
  idle: "🟢",
  planning: "💭",
  working: "✍️",
  reviewing: "🔎",
  discussion: "🗣️",
  waiting: "⏸️",
  waiting_approval: "⏳",
  blocked: "⛔",
  completed: "✅",
};

/** @deprecated Prefer mapLiveWorkToOfficeState / mapLiveWorkToVisualState. */
export function mapStatusToLiveOfficeState(
  status: AiCompanyEmployeeStatus
): LiveOfficeVisualState {
  return mapCardStatusToVisualState(status);
}

export function mapLiveWorkToOfficeState(input: {
  liveWorkStatus: string;
  hasPendingApproval: boolean;
  hasDiscussionPartner: boolean;
}): LiveOfficeVisualState {
  return mapLiveWorkToVisualState(input);
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

function hasRealPendingApproval(
  emp: AiCompanyEmployeeCard,
  dash: AiCompanyDashboard
): boolean {
  if (emp.pendingApprovals > 0) return true;
  if (
    dash.pendingApprovals.some(
      (a) =>
        a.requestingEmployee.id === emp.id ||
        a.collaborationChain.some((s) => s.employeeId === emp.id)
    )
  ) {
    return true;
  }
  const queue = dash.ceoApprovalQueue?.items ?? [];
  return queue.some(
    (item) => item.status === "pending" && item.employee.id === emp.id
  );
}

function discussionPartnerFor(
  employeeId: string,
  connections: LiveOfficeConnection[],
  nameById: Map<string, string>
): { id: string; name: string } | null {
  const link = connections.find(
    (c) =>
      c.fromEmployeeId === employeeId || c.toEmployeeId === employeeId
  );
  if (!link) return null;
  const partnerId =
    link.fromEmployeeId === employeeId
      ? link.toEmployeeId
      : link.fromEmployeeId;
  return {
    id: partnerId,
    name: nameById.get(partnerId) ?? partnerId,
  };
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
      employeeId:
        last.employeeId === "ceo" || last.employeeId === "system"
          ? null
          : String(last.employeeId),
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
  const nameById = new Map(dash.employees.map((e) => [e.id, e.name]));

  const draft = dash.employees.map((emp) => {
    const hasPendingApproval = hasRealPendingApproval(emp, dash);
    const partner = discussionPartnerFor(emp.id, connections, nameById);
    const hasDiscussionPartner = partner != null;
    const visualState = mapLiveWorkToVisualState({
      liveWorkStatus: emp.liveWork.status,
      hasPendingApproval,
      hasDiscussionPartner,
    });
    const meta = LIVE_OFFICE_VISUAL_META[visualState];
    const mission = relatedMission(emp.id, dash.activeCollaborations);
    const recommendation = relatedRecommendation(emp.id, dash.recommendations);
    const desk = deskFor(emp.id, emp.department);
    const atApprovalZone = shouldMoveToApprovalZone(
      visualState,
      hasPendingApproval
    );
    const moveToPartner = shouldMoveTowardPartner(
      visualState,
      hasDiscussionPartner
    );

    let renderX = desk.x;
    let renderY = desk.y;
    if (atApprovalZone) {
      const pos = approvalZonePosition({
        zone: CEO_APPROVAL_ZONE,
        employeeId: emp.id,
      });
      renderX = pos.x;
      renderY = pos.y;
    } else if (moveToPartner && partner) {
      const partnerDesk = deskFor(
        partner.id,
        dash.employees.find((e) => e.id === partner.id)?.department ?? "Team"
      );
      const pos = discussionPosition({
        home: desk,
        partner: partnerDesk,
      });
      renderX = pos.x;
      renderY = pos.y;
    }

    return {
      ...emp,
      visualState,
      visualLabel: meta.label,
      visualEmoji: VISUAL_EMOJI[visualState],
      desk,
      atApprovalZone,
      discussionPartnerId: moveToPartner ? partner?.id ?? null : null,
      discussionPartnerName: moveToPartner ? partner?.name ?? null : null,
      renderX,
      renderY,
      relatedMissionId: mission?.id ?? recommendation?.id ?? null,
      relatedMissionTitle: mission?.title ?? recommendation?.title ?? null,
      conversationPreview: conversationPreviewFor(
        emp.id,
        mission,
        recommendation
      ),
      memoryHints: memoryHintsFromDashboard(emp.id, dash),
    } satisfies LiveOfficeEmployeeView;
  });

  const separated = separateOverlappingPositions(
    draft.map((e) => ({ id: e.id, x: e.renderX, y: e.renderY }))
  );
  const byId = new Map(separated.map((p) => [p.id, p]));

  const employees: LiveOfficeEmployeeView[] = draft.map((e) => {
    const pos = byId.get(e.id);
    return {
      ...e,
      renderX: pos?.x ?? e.renderX,
      renderY: pos?.y ?? e.renderY,
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

/** Resolve rendered position (uses precomputed renderX/Y when present). */
export function renderPosition(emp: LiveOfficeEmployeeView): { x: number; y: number } {
  if (
    typeof emp.renderX === "number" &&
    typeof emp.renderY === "number" &&
    Number.isFinite(emp.renderX) &&
    Number.isFinite(emp.renderY)
  ) {
    return { x: emp.renderX, y: emp.renderY };
  }
  if (emp.atApprovalZone) {
    return approvalZonePosition({
      zone: CEO_APPROVAL_ZONE,
      employeeId: emp.id,
    });
  }
  return { x: emp.desk.x, y: emp.desk.y };
}
