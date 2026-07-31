/**
 * Pure autonomous development behaviors for the WorkPilot AI company.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import type { CollaborationMission } from "../collaboration.logic";
import {
  allocateDevTaskId,
  defaultWorkpilotFeatureLink,
  detectMissingRequirements,
  linkFromMission,
} from "./work-items.logic";
import {
  defaultCollaboratorsFor,
  runPeerDiscussion,
} from "./peer-discussion.logic";
import {
  formatWorkItemLine,
  ownershipForEmployee,
  pickOwnerForWork,
} from "./dev-ownership.logic";
import type {
  CeoDevReport,
  CeoDevReportKind,
  DevTask,
  PeerDiscussion,
  RepoChangeEvent,
  WorkItemLink,
} from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function proposeDevTask(input: {
  title: string;
  description: string;
  ownerEmployeeId?: string;
  workItem?: WorkItemLink | null;
  now: string;
  status?: DevTask["status"];
}): DevTask {
  const ownerEmployeeId =
    input.ownerEmployeeId ??
    pickOwnerForWork({ title: input.title, kind: input.description });
  const ownership = ownershipForEmployee(ownerEmployeeId);
  const workItem =
    input.workItem ?? defaultWorkpilotFeatureLink(input.title);
  const missingRequirements = detectMissingRequirements({
    title: input.title,
    description: input.description,
  });
  return {
    id: allocateDevTaskId(new Date(input.now)),
    title: input.title.trim(),
    description: input.description.trim(),
    ownerEmployeeId,
    collaboratorIds: defaultCollaboratorsFor(ownerEmployeeId),
    discipline: ownership?.disciplines[0] ?? "product",
    status:
      input.status ??
      (missingRequirements.length > 0 ? "needs_clarification" : "proposed"),
    workItem,
    missingRequirements,
    progressNote: null,
    blocker: null,
    improvementProposal: null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

/** Seed proactive development work from live missions + ownership. */
export function proposeTasksFromMissions(input: {
  missions: CollaborationMission[];
  existingTaskIds: Set<string>;
  now: string;
}): DevTask[] {
  const out: DevTask[] = [];
  for (const mission of input.missions) {
    if (mission.approvalStatus === "rejected") continue;
    const seedId = `mission:${mission.id}`;
    if (input.existingTaskIds.has(seedId)) continue;
    const lead = mission.leadEmployeeId;
    const task = proposeDevTask({
      title: `Advance: ${mission.title}`,
      description: mission.mission,
      ownerEmployeeId: lead,
      workItem: linkFromMission(mission),
      now: input.now,
      status:
        mission.approvalStatus === "pending" ? "awaiting_ceo" : "in_progress",
    });
    // Stable dedupe key embedded via description tag for store merge
    out.push({
      ...task,
      id: `DEV-MISSION-${mission.id}`,
      progressNote: `Working WorkPilot mission ${mission.id}.`,
    });
  }
  return out;
}

/** Role-based improvement proposals when the floor is quiet. */
export function proposeImprovementTasks(input: {
  now: string;
  existingTitles: Set<string>;
}): DevTask[] {
  const catalog: Array<{ owner: string; title: string; description: string }> = [
    {
      owner: "mia",
      title: "Polish WorkPilot navigation perceived performance",
      description:
        "Audit nav transitions and loading states for the app shell. Need CEO acceptance criteria for desktop vs mobile.",
    },
    {
      owner: "noah",
      title: "Harden WorkPilot API error contracts",
      description:
        "Normalize public API errors for HQ and product routes without leaking secrets.",
    },
    {
      owner: "ethan",
      title: "Expand WorkPilot regression pack for builder HQ",
      description:
        "Add focused tests around chat, approvals, and membership. Need target ship window from CEO.",
    },
    {
      owner: "alex",
      title: "Review WorkPilot deploy readiness checklist",
      description:
        "Check CI/release blockers on the product repo before any production push.",
    },
    {
      owner: "david",
      title: "Architecture note: AI Company ↔ WorkPilot boundary",
      description:
        "Document what stays in ai-company vs workpilot product Feature 38 deferral.",
    },
    {
      owner: "emma",
      title: "Prioritize next WorkPilot beta slice",
      description:
        "Rank the next shippable product slice. Need CEO product priority if roadmap conflict exists.",
    },
  ];

  const out: DevTask[] = [];
  for (const item of catalog) {
    if (input.existingTitles.has(item.title.toLowerCase())) continue;
    out.push(
      proposeDevTask({
        title: item.title,
        description: item.description,
        ownerEmployeeId: item.owner,
        workItem: defaultWorkpilotFeatureLink(item.title),
        now: input.now,
      })
    );
  }
  return out.slice(0, 3);
}

export function buildCeoDevReport(input: {
  kind: CeoDevReportKind;
  task: DevTask;
  body: string;
  now: string;
  peerDiscussion?: PeerDiscussion | null;
  requiresCeoDecision?: boolean;
}): CeoDevReport {
  const emp = getEmployeeDefinition(input.task.ownerEmployeeId);
  const workLine = formatWorkItemLine(input.task.workItem);
  return {
    id: newId("ceorep"),
    kind: input.kind,
    employeeId: input.task.ownerEmployeeId,
    employeeName: emp?.name ?? input.task.ownerEmployeeId,
    title: input.task.title,
    body: `${workLine}\n${input.body}`,
    workItem: input.task.workItem,
    peerDiscussionId: input.peerDiscussion?.id ?? null,
    taskId: input.task.id,
    requiresCeoDecision:
      input.requiresCeoDecision ??
      ["clarification_request", "deployment_approval", "architecture_proposal", "blocker"].includes(
        input.kind
      ),
    createdAt: input.now,
    deliveredToChat: false,
  };
}

export function reportsFromTask(input: {
  task: DevTask;
  now: string;
  withPeerDiscussion?: boolean;
}): { discussion: PeerDiscussion | null; reports: CeoDevReport[] } {
  const discussion =
    input.withPeerDiscussion !== false
      ? runPeerDiscussion({ task: input.task, now: input.now })
      : null;

  const reports: CeoDevReport[] = [];

  if (input.task.missingRequirements.length > 0) {
    reports.push(
      buildCeoDevReport({
        kind: "clarification_request",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? "Peer check complete."}\nI need clarification before continuing — I will not assume:\n- ${input.task.missingRequirements.join(
          "\n- "
        )}`,
        requiresCeoDecision: true,
      })
    );
    return { discussion, reports };
  }

  if (input.task.blocker) {
    reports.push(
      buildCeoDevReport({
        kind: "blocker",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? ""}\nBlocker: ${input.task.blocker}`,
        requiresCeoDecision: true,
      })
    );
    return { discussion, reports };
  }

  if (input.task.status === "awaiting_ceo" && /deploy|release/i.test(input.task.title)) {
    reports.push(
      buildCeoDevReport({
        kind: "deployment_approval",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? ""}\nDeployment approval requested for WorkPilot. No production write will happen without you.`,
        requiresCeoDecision: true,
      })
    );
    return { discussion, reports };
  }

  if (input.task.discipline === "architecture") {
    reports.push(
      buildCeoDevReport({
        kind: "architecture_proposal",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? ""}\nArchitecture proposal: ${input.task.description}`,
        requiresCeoDecision: true,
      })
    );
    return { discussion, reports };
  }

  if (input.task.discipline === "qa" || /bug/i.test(input.task.title)) {
    reports.push(
      buildCeoDevReport({
        kind: "bug_report",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? ""}\nBug / QA finding: ${input.task.description}`,
        requiresCeoDecision: true,
      })
    );
    return { discussion, reports };
  }

  if (input.task.status === "peer_review") {
    reports.push(
      buildCeoDevReport({
        kind: "code_review_request",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? ""}\nCode review requested. ${input.task.progressNote ?? input.task.description}`,
        requiresCeoDecision: true,
      })
    );
    return { discussion, reports };
  }

  if (input.task.discipline === "product") {
    reports.push(
      buildCeoDevReport({
        kind: "product_recommendation",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? ""}\nProduct recommendation: ${input.task.description}`,
        requiresCeoDecision: true,
      })
    );
    return { discussion, reports };
  }

  if (input.task.status === "done") {
    reports.push(
      buildCeoDevReport({
        kind: "completed_report",
        task: input.task,
        now: input.now,
        peerDiscussion: discussion,
        body: `${discussion?.synthesis ?? ""}\nCompleted: ${input.task.progressNote ?? input.task.title}`,
        requiresCeoDecision: false,
      })
    );
    return { discussion, reports };
  }

  reports.push(
    buildCeoDevReport({
      kind: "progress_update",
      task: input.task,
      now: input.now,
      peerDiscussion: discussion,
      body: `${discussion?.synthesis ?? ""}\nProgress: ${input.task.progressNote ?? "In progress on WorkPilot."}`,
      requiresCeoDecision: false,
    })
  );
  return { discussion, reports };
}

export function reportFromRepoChange(
  change: RepoChangeEvent,
  now: string
): CeoDevReport {
  const emp = getEmployeeDefinition(change.ownerEmployeeId);
  const workLine = formatWorkItemLine(change.workItem);
  return {
    id: newId("ceorep"),
    kind: "repo_change",
    employeeId: change.ownerEmployeeId,
    employeeName: emp?.name ?? change.ownerEmployeeId,
    title: `Repo update: ${change.workItem.title}`,
    body: `${workLine}\n${change.summary}`,
    workItem: change.workItem,
    peerDiscussionId: null,
    taskId: null,
    requiresCeoDecision: change.severity === "attention",
    createdAt: now,
    deliveredToChat: false,
  };
}

/** Build a clarification-first chat reply when requirements are incomplete. */
export function buildClarificationChatBody(input: {
  employeeName: string;
  workItem: WorkItemLink;
  missingRequirements: string[];
  ceoMessage: string;
}): string {
  const workLine = formatWorkItemLine(input.workItem);
  return [
    `${input.employeeName} — clarification before I proceed`,
    workLine,
    `You asked: ${input.ceoMessage.trim()}`,
    "I won't assume missing product requirements. Please confirm:",
    ...input.missingRequirements.map((m, i) => `${i + 1}. ${m}`),
  ].join("\n");
}
