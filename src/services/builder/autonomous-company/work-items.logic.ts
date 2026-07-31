/**
 * Link every autonomous action to a real WorkPilot work item.
 */

import type { CollaborationMission } from "../collaboration.logic";
import type {
  GithubIssue,
  GithubPullRequest,
  GithubRepoMetadata,
} from "../../github";
import type { WorkItemKind, WorkItemLink } from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function linkFromMission(mission: CollaborationMission): WorkItemLink {
  return {
    kind: "task",
    id: mission.id,
    title: mission.title,
    url: null,
    refs: [mission.id],
  };
}

export function linkFromPullRequest(pr: GithubPullRequest): WorkItemLink {
  return {
    kind: "pull_request",
    id: `PR-${pr.number}`,
    title: pr.title,
    url: pr.htmlUrl,
    refs: [`PR#${pr.number}`, pr.headRef],
  };
}

export function linkFromIssue(issue: GithubIssue): WorkItemLink {
  const kind: WorkItemKind = /bug|fix|fail|error/i.test(issue.title)
    ? "bug"
    : "feature";
  return {
    kind,
    id: `ISSUE-${issue.number}`,
    title: issue.title,
    url: issue.htmlUrl,
    refs: [`#${issue.number}`],
  };
}

export function linkFromRoadmap(input: {
  milestoneId: string;
  title: string;
}): WorkItemLink {
  return {
    kind: "roadmap",
    id: input.milestoneId,
    title: input.title,
    url: null,
    refs: [input.milestoneId],
  };
}

export function linkFromDocument(input: {
  path: string;
  title: string;
}): WorkItemLink {
  return {
    kind: "document",
    id: input.path,
    title: input.title,
    url: null,
    refs: [input.path],
  };
}

/** Default WorkPilot product surface when no repo/mission signal exists. */
export function defaultWorkpilotFeatureLink(featureHint: string): WorkItemLink {
  const slug = featureHint
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return {
    kind: "feature",
    id: `feature-${slug || "workpilot-core"}`,
    title: featureHint.trim() || "WorkPilot core",
    url: null,
    refs: [`feature:${slug || "workpilot-core"}`],
  };
}

export function linkFromRepoPush(repo: GithubRepoMetadata): WorkItemLink {
  return {
    kind: "feature",
    id: `repo-${repo.fullName.replace("/", "-")}`,
    title: `${repo.fullName} repository activity`,
    url: repo.htmlUrl,
    refs: [repo.fullName, repo.defaultBranch],
  };
}

export function ensureWorkItem(input: {
  workItem?: WorkItemLink | null;
  fallbackTitle: string;
}): WorkItemLink {
  if (input.workItem?.id && input.workItem.title) return input.workItem;
  return defaultWorkpilotFeatureLink(input.fallbackTitle);
}

export function allocateDevTaskId(now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  return `DEV-${day}-${newId("t").slice(-4).toUpperCase()}`;
}

/** Detect incomplete requirements — ask CEO only when truly required; prefer inference. */
export function detectMissingRequirements(input: {
  title: string;
  description: string;
  ceoMessage?: string | null;
  /** Active mission / roadmap / plan text used to infer safely. */
  missionCorpus?: string | null;
  /** Repo evidence lines (tests, files, roadmap notes). */
  repositoryEvidence?: string[] | null;
}): string[] {
  const text = `${input.title}\n${input.description}\n${input.ceoMessage ?? ""}`;
  const inferred = [
    input.missionCorpus ?? "",
    ...(input.repositoryEvidence ?? []),
  ]
    .join("\n")
    .toLowerCase();
  const combined = `${text}\n${inferred}`;

  const missing: string[] = [];

  const hasAcceptance =
    /\b(accept|criteria|done when|definition of done)\b/i.test(combined) ||
    /\bplan step:/i.test(inferred) ||
    /\b(must|should)\b.+\b(verify|pass|ship)\b/i.test(inferred);
  if (!hasAcceptance) {
    missing.push("acceptance criteria / definition of done");
  }

  if (
    /\b(ui|page|screen|flow)\b/i.test(text) &&
    !/\b(desktop|mobile|responsive|viewport|hq|builder)\b/i.test(combined)
  ) {
    missing.push("target surfaces (desktop / mobile)");
  }

  if (
    /\b(api|endpoint|route)\b/i.test(text) &&
    !/\b(auth|permission|role|public|internal|hq)\b/i.test(combined)
  ) {
    missing.push("auth / permission expectations");
  }

  if (
    /\b(ship|release|deploy|beta)\b/i.test(text) &&
    !/\b(date|window|deadline|sprint|roadmap|plan step)\b/i.test(combined)
  ) {
    missing.push("target ship window");
  }

  // Only ask to clarify TBD when the mission/repo evidence does not already bound scope.
  if (
    (/\b(maybe|tbd|unclear|somehow|etc\.?|figure out)\b/i.test(text) ||
      /\?\s*$/m.test(input.description.trim())) &&
    !/\b(plan step|acceptance|must|scoped to)\b/i.test(inferred)
  ) {
    missing.push("clarified scope (remove TBD / open questions)");
  }

  return [...new Set(missing)].slice(0, 4);
}

/** True when prior employee clarification already asked the same missing set. */
export function clarificationAlreadyAsked(
  priorMessages: Array<{ role: string; body: string }>,
  missingRequirements: string[]
): boolean {
  if (!missingRequirements.length) return true;
  const prior = priorMessages
    .filter(
      (m) =>
        m.role === "employee" &&
        /clarification before i proceed|please confirm:/i.test(m.body)
    )
    .map((m) => m.body.toLowerCase());
  if (!prior.length) return false;
  return prior.some((body) =>
    missingRequirements.every((item) => {
      const token = item.toLowerCase().slice(0, 18);
      return body.includes(token);
    })
  );
}

export function requirementsLookIncomplete(input: {
  title: string;
  description: string;
  ceoMessage?: string | null;
  knownMissing?: string[];
  missionCorpus?: string | null;
  repositoryEvidence?: string[] | null;
}): boolean {
  if ((input.knownMissing?.length ?? 0) > 0) {
    // Re-evaluate known missing against inference before treating as incomplete.
    const refreshed = detectMissingRequirements({
      title: input.title,
      description: input.description,
      ceoMessage: input.ceoMessage,
      missionCorpus: input.missionCorpus,
      repositoryEvidence: input.repositoryEvidence,
    });
    const stillMissing = input.knownMissing!.filter((m) =>
      refreshed.includes(m)
    );
    if (stillMissing.length === 0 && refreshed.length === 0) return false;
    if (stillMissing.length === 0 && refreshed.length > 0) return true;
    return stillMissing.length > 0;
  }
  return detectMissingRequirements(input).length > 0;
}
