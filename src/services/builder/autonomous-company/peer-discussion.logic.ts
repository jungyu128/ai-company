/**
 * Employees discuss with each other before reporting to the CEO.
 */

import { getEmployeeDefinition } from "../ai-company-employees";
import type { DevTask, PeerDiscussion, PeerDiscussionTurn, WorkItemLink } from "./types";
import { formatWorkItemLine } from "./dev-ownership.logic";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function offsetIso(base: string, seconds: number): string {
  const t = Date.parse(base);
  if (Number.isNaN(t)) return base;
  return new Date(t + seconds * 1000).toISOString();
}

/**
 * Run a short peer discussion among collaborators, then synthesize for the CEO.
 */
export function runPeerDiscussion(input: {
  task: DevTask;
  now: string;
  topic?: string;
}): PeerDiscussion {
  const owner = getEmployeeDefinition(input.task.ownerEmployeeId);
  const peers = input.task.collaboratorIds
    .map((id) => getEmployeeDefinition(id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e))
    .slice(0, 2);

  const workLine = formatWorkItemLine(input.task.workItem);
  const topic =
    input.topic ??
    input.task.blocker ??
    input.task.improvementProposal ??
    input.task.progressNote ??
    input.task.title;

  const turns: PeerDiscussionTurn[] = [];
  let t = 0;

  turns.push({
    employeeId: input.task.ownerEmployeeId,
    employeeName: owner?.name ?? input.task.ownerEmployeeId,
    role: owner?.role ?? "AI Employee",
    body: `${workLine}\nI need a quick peer check on: ${topic}. My current stance: ${
      input.task.progressNote ?? input.task.description
    }`,
    at: offsetIso(input.now, t++ * 25),
  });

  for (const peer of peers) {
    const lens =
      peer.productRole === "qa"
        ? "I'll verify with a focused test plan and refuse to ship without evidence."
        : peer.productRole === "devops"
          ? "I'll check release/CI risk before we ask the CEO to approve a deploy."
          : peer.productRole === "cto"
            ? "I'll flag architectural risk and keep the change branch-scoped."
            : peer.productRole === "frontend"
              ? "I'll validate UX impact and keep the UI change reviewable."
              : peer.productRole === "backend"
                ? "I'll check API/data contracts and regression surface."
                : "I'll challenge scope and keep us honest about missing requirements.";
    turns.push({
      employeeId: peer.id,
      employeeName: peer.name,
      role: peer.role,
      body: `${workLine}\n${lens} Recommendation: ${
        input.task.missingRequirements.length
          ? "ask the CEO for clarification before we assume."
          : "prepare a concise CEO report with options."
      }`,
      at: offsetIso(input.now, t++ * 25),
    });
  }

  const synthesis = synthesizePeerDiscussion({
    workItem: input.task.workItem,
    ownerName: owner?.name ?? "Owner",
    peerNames: peers.map((p) => p.name),
    topic,
    missingRequirements: input.task.missingRequirements,
    blocker: input.task.blocker,
  });

  return {
    id: newId("peer"),
    workItem: input.task.workItem,
    participantIds: [
      input.task.ownerEmployeeId,
      ...peers.map((p) => p.id),
    ],
    turns,
    synthesis,
    createdAt: input.now,
  };
}

export function synthesizePeerDiscussion(input: {
  workItem: WorkItemLink;
  ownerName: string;
  peerNames: string[];
  topic: string;
  missingRequirements: string[];
  blocker: string | null;
}): string {
  const peers =
    input.peerNames.length > 0 ? input.peerNames.join(" + ") : "no peers";
  const workLine = formatWorkItemLine(input.workItem);
  if (input.missingRequirements.length > 0) {
    return `${workLine}\n${input.ownerName} discussed with ${peers}. We will not assume. Missing from CEO: ${input.missingRequirements.join(
      "; "
    )}. Topic: ${input.topic}`;
  }
  if (input.blocker) {
    return `${workLine}\n${input.ownerName} discussed with ${peers}. Blocker: ${input.blocker}. Asking CEO for a decision path.`;
  }
  return `${workLine}\n${input.ownerName} aligned with ${peers} on "${input.topic}". Ready to report to the CEO with a clear recommendation.`;
}

/** Default collaborators for a discipline-aware peer review. */
export function defaultCollaboratorsFor(ownerEmployeeId: string): string[] {
  const map: Record<string, string[]> = {
    emma: ["david", "sarah"],
    alex: ["ethan", "david"],
    sarah: ["emma", "david"],
    david: ["noah", "mia"],
    mia: ["ethan", "emma"],
    noah: ["ethan", "david"],
    olivia: ["noah", "ethan"],
    ethan: ["mia", "noah"],
  };
  return (map[ownerEmployeeId] ?? ["emma"]).filter((id) => id !== ownerEmployeeId);
}
