/**
 * Pure meeting helpers — create, discuss, decide, action items.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import { filterValidCollaborators } from "../autonomous-company/employee-role.logic";
import type {
  CompanyMeeting,
  MeetingActionItem,
  MeetingAgendaItem,
  MeetingAutoCreateHint,
  MeetingDecision,
  MeetingDiscussionTurn,
  MeetingKind,
} from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function offsetIso(base: string, seconds: number): string {
  const t = Date.parse(base);
  if (Number.isNaN(t)) return base;
  return new Date(t + seconds * 1000).toISOString();
}

function dueInDays(now: string, days: number): string {
  const t = Date.parse(now);
  if (Number.isNaN(t)) return now.slice(0, 10);
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10);
}

export const MEETING_KIND_LABEL: Record<MeetingKind, string> = {
  sprint_planning: "Sprint Planning",
  daily_standup: "Daily Standup",
  architecture_review: "Architecture Review",
  design_review: "Design Review",
  qa_review: "QA Review",
  release_review: "Release Review",
  incident_review: "Incident Review",
};

export function defaultParticipantsForKind(kind: MeetingKind): string[] {
  const map: Record<MeetingKind, string[]> = {
    sprint_planning: ["emma", "sarah", "david", "mia", "noah", "ethan"],
    daily_standup: ["emma", "mia", "noah", "ethan", "alex"],
    architecture_review: ["david", "noah", "mia", "alex"],
    design_review: ["mia", "emma", "david", "ethan"],
    qa_review: ["ethan", "mia", "noah", "emma"],
    release_review: ["alex", "ethan", "david", "sarah"],
    incident_review: ["alex", "noah", "ethan", "david", "sarah"],
  };
  return map[kind] ?? ["emma", "david"];
}

export function defaultAgendaForKind(
  kind: MeetingKind,
  workItemTitle: string | null
): MeetingAgendaItem[] {
  const focus = workItemTitle ?? "active WorkPilot objective";
  const templates: Record<MeetingKind, string[]> = {
    sprint_planning: [
      `Confirm sprint goal for ${focus}`,
      "Rank shippable WorkPilot slices",
      "Assign owners and due dates",
    ],
    daily_standup: [
      `Blockers on ${focus}`,
      "Yesterday / today WorkPilot progress",
      "Help needed across roles",
    ],
    architecture_review: [
      `Architecture options for ${focus}`,
      "Risks and branch scope",
      "Recommendation for CEO",
    ],
    design_review: [
      `UI/UX scope for ${focus}`,
      "Accessibility and HQ consistency",
      "QA handoff notes",
    ],
    qa_review: [
      `Test plan for ${focus}`,
      "Evidence of pass/fail",
      "Release confidence",
    ],
    release_review: [
      `Release readiness for ${focus}`,
      "CI / deploy checklist (no auto-deploy)",
      "Go / no-go recommendation",
    ],
    incident_review: [
      `Incident timeline for ${focus}`,
      "Root cause hypotheses",
      "Preventive WorkPilot actions",
    ],
  };
  return (templates[kind] ?? [`Discuss ${focus}`]).map((text, i) => ({
    id: `ag-${i + 1}`,
    text,
    ownerEmployeeId: null,
  }));
}

export function buildMeetingDraft(input: {
  kind: MeetingKind;
  now: string;
  workItemId?: string | null;
  workItemTitle?: string | null;
  missionId?: string | null;
  purpose?: string | null;
  organizerEmployeeId?: string | null;
}): CompanyMeeting {
  const participants = defaultParticipantsForKind(input.kind);
  const organizer = input.organizerEmployeeId ?? participants[0]!;
  const title = `${MEETING_KIND_LABEL[input.kind]}${
    input.workItemTitle ? ` — ${input.workItemTitle}` : ""
  }`;
  const purpose =
    input.purpose?.trim() ||
    `Align the AI Company on ${MEETING_KIND_LABEL[input.kind].toLowerCase()} for the active WorkPilot work item before asking the CEO.`;

  return {
    id: newId("mtg"),
    kind: input.kind,
    title,
    purpose,
    status: "scheduled",
    participantIds: [...new Set([organizer, ...participants])],
    agenda: defaultAgendaForKind(input.kind, input.workItemTitle ?? null),
    discussion: [],
    decisions: [],
    actionItems: [],
    owners: [organizer],
    dueDates: [],
    workItemId: input.workItemId ?? null,
    workItemTitle: input.workItemTitle ?? null,
    missionId: input.missionId ?? null,
    synthesis: null,
    ceoJoined: false,
    ceoComments: [],
    ceoDecision: null,
    ceoNote: null,
    createdAt: input.now,
    updatedAt: input.now,
    presentedToCeoAt: null,
  };
}

/** Employees discuss among themselves before presenting to the CEO. */
export function runMeetingDiscussion(input: {
  meeting: CompanyMeeting;
  now: string;
}): {
  discussion: MeetingDiscussionTurn[];
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  synthesis: string;
  owners: string[];
  dueDates: string[];
} {
  const meeting = input.meeting;
  const leadId = meeting.participantIds[0]!;
  const lead = getEmployeeDefinition(leadId);
  const peers = filterValidCollaborators(leadId, meeting.participantIds.slice(1))
    .map((id) => getEmployeeDefinition(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .slice(0, 3);

  const focus =
    meeting.workItemTitle ??
    meeting.agenda[0]?.text ??
    MEETING_KIND_LABEL[meeting.kind];

  const discussion: MeetingDiscussionTurn[] = [];
  let t = 0;
  discussion.push({
    id: newId("md"),
    employeeId: leadId,
    employeeName: lead?.name ?? leadId,
    role: lead?.role ?? "AI Employee",
    body: `Opening ${MEETING_KIND_LABEL[meeting.kind]} on WorkPilot: ${focus}. Purpose: ${meeting.purpose}`,
    at: offsetIso(input.now, t++ * 30),
  });

  for (const peer of peers) {
    const lens =
      peer.productRole === "qa"
        ? "I'll require test evidence before we recommend ship."
        : peer.productRole === "devops"
          ? "I'll check CI/release readiness — no auto-deploy."
          : peer.productRole === "cto"
            ? "I'll keep the architecture branch-scoped and reviewable."
            : peer.productRole === "frontend"
              ? "I'll validate UI scope and HQ consistency."
              : peer.productRole === "backend"
                ? "I'll check API/schema risk and regression surface."
                : "I'll keep us on the WorkPilot objective and acceptance criteria.";
    discussion.push({
      id: newId("md"),
      employeeId: peer.id,
      employeeName: peer.name,
      role: peer.role,
      body: `${lens} Agenda item: ${meeting.agenda[Math.min(t, meeting.agenda.length - 1)]?.text ?? focus}`,
      at: offsetIso(input.now, t++ * 30),
    });
  }

  const decisionText = `Proceed with ${MEETING_KIND_LABEL[meeting.kind].toLowerCase()} outcome for “${focus}” — prepare CEO decision package; no merge/deploy without approval.`;
  const decisions: MeetingDecision[] = [
    {
      id: newId("mdec"),
      text: decisionText,
      proposedByEmployeeId: leadId,
      status: "proposed",
    },
  ];

  const ownerIds = [...new Set([leadId, ...peers.map((p) => p.id)])].slice(0, 3);
  const actionItems: MeetingActionItem[] = ownerIds.map((id, index) => {
    const emp = getEmployeeDefinition(id);
    const dueDate = dueInDays(input.now, index === 0 ? 1 : 2 + index);
    return {
      id: newId("mai"),
      text:
        index === 0
          ? `Present ${MEETING_KIND_LABEL[meeting.kind]} recommendation to CEO for “${focus}”.`
          : `Complete follow-up for ${MEETING_KIND_LABEL[meeting.kind]} as ${emp?.role ?? id}.`,
      ownerEmployeeId: id,
      ownerName: emp?.name ?? id,
      dueDate,
      status: "open",
    };
  });

  const synthesis = [
    `${MEETING_KIND_LABEL[meeting.kind]} synthesis for WorkPilot “${focus}”.`,
    `Participants aligned: ${[lead?.name ?? leadId, ...peers.map((p) => p.name)].join(", ")}.`,
    `Proposed decision: ${decisionText}`,
    `Action items: ${actionItems.length} with owners and due dates.`,
    "Ready for CEO join / comment / approve / postpone / reject.",
  ].join(" ");

  return {
    discussion,
    decisions,
    actionItems,
    synthesis,
    owners: ownerIds,
    dueDates: [...new Set(actionItems.map((a) => a.dueDate))],
  };
}

/**
 * Detect when a meeting should be auto-created from WorkPilot signals.
 */
export function detectNeededMeetings(input: {
  now: string;
  missionTitles: string[];
  taskTitles: string[];
  taskStatuses: string[];
  existingOpenKinds: Set<MeetingKind>;
}): MeetingAutoCreateHint[] {
  const hints: MeetingAutoCreateHint[] = [];
  const hay = [...input.missionTitles, ...input.taskTitles].join(" ").toLowerCase();
  const statuses = input.taskStatuses.join(" ");

  const push = (kind: MeetingKind, reason: string) => {
    if (input.existingOpenKinds.has(kind)) return;
    hints.push({
      kind,
      workItemTitle: input.missionTitles[0] ?? input.taskTitles[0] ?? null,
      missionId: null,
      reason,
    });
  };

  if (
    input.missionTitles.length > 0 &&
    !input.existingOpenKinds.has("sprint_planning")
  ) {
    push("sprint_planning", "Active WorkPilot mission needs sprint alignment");
  }

  if (/architect|boundary|implementation plan/.test(hay)) {
    push("architecture_review", "Architecture-related WorkPilot work detected");
  }
  if (/ui|design|frontend|component|hq/.test(hay)) {
    push("design_review", "Design/UI WorkPilot work detected");
  }
  if (/test|qa|regression|verify/.test(hay) || /peer_review/.test(statuses)) {
    push("qa_review", "QA/verification WorkPilot work detected");
  }
  if (/release|deploy|ship|beta/.test(hay)) {
    push("release_review", "Release-related WorkPilot work detected");
  }
  if (/incident|outage|sev|pager|hotfix/.test(hay)) {
    push("incident_review", "Incident-related WorkPilot signal detected");
  }
  if (
    input.taskStatuses.some((s) => s === "in_progress") &&
    !input.existingOpenKinds.has("daily_standup")
  ) {
    push("daily_standup", "In-progress WorkPilot tasks need a standup sync");
  }

  return hints.slice(0, 2);
}
