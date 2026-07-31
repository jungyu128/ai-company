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

/** Detect incomplete requirements — employees must ask CEO, not assume. */
export function detectMissingRequirements(input: {
  title: string;
  description: string;
  ceoMessage?: string | null;
}): string[] {
  const text = `${input.title}\n${input.description}\n${input.ceoMessage ?? ""}`;
  const missing: string[] = [];
  if (!/\b(accept|criteria|done when|definition of done)\b/i.test(text)) {
    missing.push("acceptance criteria / definition of done");
  }
  if (
    /\b(ui|page|screen|flow)\b/i.test(text) &&
    !/\b(desktop|mobile|responsive|viewport)\b/i.test(text)
  ) {
    missing.push("target surfaces (desktop / mobile)");
  }
  if (
    /\b(api|endpoint|route)\b/i.test(text) &&
    !/\b(auth|permission|role|public)\b/i.test(text)
  ) {
    missing.push("auth / permission expectations");
  }
  if (
    /\b(ship|release|deploy|beta)\b/i.test(text) &&
    !/\b(date|window|deadline|sprint)\b/i.test(text)
  ) {
    missing.push("target ship window");
  }
  if (
    /\b(maybe|tbd|unclear|somehow|etc\.?|figure out)\b/i.test(text) ||
    /\?\s*$/m.test(input.description.trim())
  ) {
    missing.push("clarified scope (remove TBD / open questions)");
  }
  return missing.slice(0, 4);
}

export function requirementsLookIncomplete(input: {
  title: string;
  description: string;
  ceoMessage?: string | null;
  knownMissing?: string[];
}): boolean {
  if ((input.knownMissing?.length ?? 0) > 0) return true;
  return detectMissingRequirements(input).length > 0;
}
