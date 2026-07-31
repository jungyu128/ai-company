/**
 * Diff WorkPilot repository snapshots into meaningful change events.
 */

import type {
  GithubIssue,
  GithubPullRequest,
  GithubRepoMetadata,
} from "../../github";
import { pickOwnerForWork } from "./dev-ownership.logic";
import {
  linkFromIssue,
  linkFromPullRequest,
  linkFromRepoPush,
} from "./work-items.logic";
import type { RepoChangeEvent, RepoSnapshot } from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildRepoSnapshot(input: {
  capturedAt: string;
  connected: boolean;
  repository: GithubRepoMetadata | null;
  issues: GithubIssue[];
  pullRequests: GithubPullRequest[];
  error?: string | null;
}): RepoSnapshot {
  const issueTitles: Record<string, string> = {};
  const prTitles: Record<string, string> = {};
  const prDraft: Record<string, boolean> = {};
  for (const issue of input.issues) {
    issueTitles[String(issue.number)] = issue.title;
  }
  for (const pr of input.pullRequests) {
    prTitles[String(pr.number)] = pr.title;
    prDraft[String(pr.number)] = pr.draft;
  }
  return {
    capturedAt: input.capturedAt,
    connected: input.connected,
    defaultBranch: input.repository?.defaultBranch ?? "main",
    pushedAt: input.repository?.pushedAt ?? null,
    openIssueNumbers: input.issues.map((i) => i.number).sort((a, b) => a - b),
    openPrNumbers: input.pullRequests.map((p) => p.number).sort((a, b) => a - b),
    issueTitles,
    prTitles,
    prDraft,
    error: input.error ?? null,
  };
}

export function diffRepoSnapshots(input: {
  previous: RepoSnapshot | null;
  next: RepoSnapshot;
  issues: GithubIssue[];
  pullRequests: GithubPullRequest[];
  repository: GithubRepoMetadata | null;
}): RepoChangeEvent[] {
  const { previous, next } = input;
  if (!next.connected) return [];

  const events: RepoChangeEvent[] = [];
  const prevIssues = new Set(previous?.openIssueNumbers ?? []);
  const prevPrs = new Set(previous?.openPrNumbers ?? []);

  for (const issue of input.issues) {
    if (!prevIssues.has(issue.number)) {
      const workItem = linkFromIssue(issue);
      events.push({
        id: newId("repoev"),
        at: next.capturedAt,
        summary: `New open issue #${issue.number}: ${issue.title}`,
        workItem,
        severity: /bug|fail|critical|security/i.test(issue.title)
          ? "attention"
          : "info",
        ownerEmployeeId: pickOwnerForWork({
          title: issue.title,
          kind: "issue",
        }),
      });
    }
  }

  for (const pr of input.pullRequests) {
    if (!prevPrs.has(pr.number)) {
      events.push({
        id: newId("repoev"),
        at: next.capturedAt,
        summary: `New pull request PR#${pr.number}${pr.draft ? " (draft)" : ""}: ${pr.title}`,
        workItem: linkFromPullRequest(pr),
        severity: pr.draft ? "info" : "attention",
        ownerEmployeeId: pickOwnerForWork({
          title: pr.title,
          kind: "pull_request",
          preferDiscipline: "qa",
        }),
      });
    } else if (
      previous &&
      previous.prDraft[String(pr.number)] === true &&
      pr.draft === false
    ) {
      events.push({
        id: newId("repoev"),
        at: next.capturedAt,
        summary: `PR#${pr.number} left draft and is ready for review: ${pr.title}`,
        workItem: linkFromPullRequest(pr),
        severity: "attention",
        ownerEmployeeId: "emma",
      });
    }
  }

  if (
    previous?.pushedAt &&
    next.pushedAt &&
    next.pushedAt !== previous.pushedAt &&
    input.repository
  ) {
    events.push({
      id: newId("repoev"),
      at: next.capturedAt,
      summary: `WorkPilot default branch activity updated (pushedAt ${next.pushedAt}).`,
      workItem: linkFromRepoPush(input.repository),
      severity: "info",
      ownerEmployeeId: "daniel",
    });
  }

  // First successful connect — baseline notice only when previous was null/disconnected
  if ((!previous || !previous.connected) && next.connected && input.repository) {
    events.push({
      id: newId("repoev"),
      at: next.capturedAt,
      summary: `Monitoring WorkPilot repository ${input.repository.fullName} (${next.openPrNumbers.length} open PRs, ${next.openIssueNumbers.length} open issues).`,
      workItem: linkFromRepoPush(input.repository),
      severity: "info",
      ownerEmployeeId: "alex",
    });
  }

  return events;
}
