/**
 * GitHub integration service for the WorkPilot product repository.
 * UI and route handlers must call this layer — never embed GitHub logic there.
 */

import { getWorkpilotGithubConfig } from "./github-config";
import { githubRequest, repoBasePath } from "./github-client";
import {
  assertWriteTargetBranch,
  refuseMerge,
  requireOwnerWriteApproval,
  type OwnerWriteApproval,
} from "./github-safety";

export type GithubRepoMetadata = {
  fullName: string;
  description: string | null;
  defaultBranch: string;
  private: boolean;
  htmlUrl: string;
  pushedAt: string | null;
};

export type GithubBranch = {
  name: string;
  protected: boolean;
};

export type GithubIssue = {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  updatedAt: string;
};

export type GithubPullRequest = {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  htmlUrl: string;
  headRef: string;
  baseRef: string;
  mergeable: boolean | null;
  updatedAt: string;
};

export type GithubConnectionStatus = {
  configured: boolean;
  tokenConfigured: boolean;
  owner: string;
  repo: string;
  defaultBranch: string;
  connected: boolean;
  error: string | null;
  repository: GithubRepoMetadata | null;
};

export async function getConnectionStatus(): Promise<GithubConnectionStatus> {
  const cfg = getWorkpilotGithubConfig();
  const base: GithubConnectionStatus = {
    configured: true,
    tokenConfigured: cfg.tokenConfigured,
    owner: cfg.owner,
    repo: cfg.repo,
    defaultBranch: cfg.defaultBranch,
    connected: false,
    error: null,
    repository: null,
  };

  if (!cfg.tokenConfigured) {
    return { ...base, error: "GITHUB_TOKEN not set — read/write unavailable" };
  }

  try {
    const repository = await readRepositoryMetadata();
    return { ...base, connected: true, repository };
  } catch (e) {
    return {
      ...base,
      error: e instanceof Error ? e.message : "Failed to connect to GitHub",
    };
  }
}

export async function readRepositoryMetadata(): Promise<GithubRepoMetadata> {
  const data = await githubRequest<{
    full_name: string;
    description: string | null;
    default_branch: string;
    private: boolean;
    html_url: string;
    pushed_at: string | null;
  }>(repoBasePath());

  return {
    fullName: data.full_name,
    description: data.description,
    defaultBranch: data.default_branch,
    private: data.private,
    htmlUrl: data.html_url,
    pushedAt: data.pushed_at,
  };
}

export async function listBranches(): Promise<GithubBranch[]> {
  const data = await githubRequest<Array<{ name: string; protected: boolean }>>(
    `${repoBasePath()}/branches?per_page=100`
  );
  return data.map((b) => ({ name: b.name, protected: b.protected }));
}

export async function listOpenIssues(): Promise<GithubIssue[]> {
  const data = await githubRequest<
    Array<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      updated_at: string;
      pull_request?: unknown;
    }>
  >(`${repoBasePath()}/issues?state=open&per_page=30`);

  return data
    .filter((i) => !i.pull_request)
    .map((i) => ({
      number: i.number,
      title: i.title,
      state: i.state,
      htmlUrl: i.html_url,
      updatedAt: i.updated_at,
    }));
}

export async function readFileContent(
  path: string,
  ref?: string
): Promise<{ path: string; sha: string; content: string; encoding: string }> {
  const cfg = getWorkpilotGithubConfig();
  const q = new URLSearchParams({ ref: ref ?? cfg.defaultBranch });
  const data = await githubRequest<{
    path: string;
    sha: string;
    content: string;
    encoding: string;
  }>(`${repoBasePath()}/contents/${path.replace(/^\//, "")}?${q}`);

  const decoded =
    data.encoding === "base64"
      ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
      : data.content;

  return {
    path: data.path,
    sha: data.sha,
    content: decoded,
    encoding: data.encoding,
  };
}

export async function createIssue(input: {
  title: string;
  body?: string;
  approval: OwnerWriteApproval;
}): Promise<GithubIssue> {
  requireOwnerWriteApproval(input.approval);
  const data = await githubRequest<{
    number: number;
    title: string;
    state: string;
    html_url: string;
    updated_at: string;
  }>(`${repoBasePath()}/issues`, {
    method: "POST",
    body: { title: input.title, body: input.body ?? "" },
  });
  return {
    number: data.number,
    title: data.title,
    state: data.state,
    htmlUrl: data.html_url,
    updatedAt: data.updated_at,
  };
}

export async function createBranch(input: {
  branch: string;
  fromRef?: string;
  approval: OwnerWriteApproval;
}): Promise<{ ref: string; sha: string }> {
  requireOwnerWriteApproval(input.approval);
  assertWriteTargetBranch(input.branch);
  const cfg = getWorkpilotGithubConfig();
  const from = input.fromRef ?? cfg.defaultBranch;

  const refData = await githubRequest<{ object: { sha: string } }>(
    `${repoBasePath()}/git/ref/heads/${from}`
  );

  const created = await githubRequest<{ ref: string; object: { sha: string } }>(
    `${repoBasePath()}/git/refs`,
    {
      method: "POST",
      body: {
        ref: `refs/heads/${input.branch}`,
        sha: refData.object.sha,
      },
    }
  );

  return { ref: created.ref, sha: created.object.sha };
}

export async function createOrUpdateFile(input: {
  path: string;
  content: string;
  message: string;
  branch: string;
  sha?: string;
  approval: OwnerWriteApproval;
}): Promise<{ contentPath: string; commitSha: string; htmlUrl: string | null }> {
  requireOwnerWriteApproval(input.approval);
  assertWriteTargetBranch(input.branch);

  const data = await githubRequest<{
    content: { path: string; html_url: string | null };
    commit: { sha: string };
  }>(`${repoBasePath()}/contents/${input.path.replace(/^\//, "")}`, {
    method: "PUT",
    body: {
      message: input.message,
      content: Buffer.from(input.content, "utf8").toString("base64"),
      branch: input.branch,
      ...(input.sha ? { sha: input.sha } : {}),
    },
  });

  return {
    contentPath: data.content.path,
    commitSha: data.commit.sha,
    htmlUrl: data.content.html_url,
  };
}

export async function createPullRequest(input: {
  title: string;
  body?: string;
  head: string;
  base?: string;
  draft?: boolean;
  approval: OwnerWriteApproval;
}): Promise<GithubPullRequest> {
  requireOwnerWriteApproval(input.approval);
  assertWriteTargetBranch(input.head);
  const cfg = getWorkpilotGithubConfig();
  const base = input.base ?? cfg.defaultBranch;
  if (input.head === base) {
    throw new Error("PR head must differ from base branch");
  }

  const data = await githubRequest<{
    number: number;
    title: string;
    state: string;
    draft: boolean;
    html_url: string;
    head: { ref: string };
    base: { ref: string };
    mergeable: boolean | null;
    updated_at: string;
  }>(`${repoBasePath()}/pulls`, {
    method: "POST",
    body: {
      title: input.title,
      body: input.body ?? "",
      head: input.head,
      base,
      draft: input.draft ?? true,
    },
  });

  return {
    number: data.number,
    title: data.title,
    state: data.state,
    draft: data.draft,
    htmlUrl: data.html_url,
    headRef: data.head.ref,
    baseRef: data.base.ref,
    mergeable: data.mergeable,
    updatedAt: data.updated_at,
  };
}

export async function listRecentPullRequests(): Promise<GithubPullRequest[]> {
  const data = await githubRequest<
    Array<{
      number: number;
      title: string;
      state: string;
      draft: boolean;
      html_url: string;
      head: { ref: string };
      base: { ref: string };
      mergeable: boolean | null;
      updated_at: string;
    }>
  >(`${repoBasePath()}/pulls?state=all&per_page=20&sort=updated`);

  return data.map((p) => ({
    number: p.number,
    title: p.title,
    state: p.state,
    draft: p.draft,
    htmlUrl: p.html_url,
    headRef: p.head.ref,
    baseRef: p.base.ref,
    mergeable: p.mergeable,
    updatedAt: p.updated_at,
  }));
}

export async function readPullRequestStatus(
  number: number
): Promise<GithubPullRequest> {
  const data = await githubRequest<{
    number: number;
    title: string;
    state: string;
    draft: boolean;
    html_url: string;
    head: { ref: string };
    base: { ref: string };
    mergeable: boolean | null;
    updated_at: string;
  }>(`${repoBasePath()}/pulls/${number}`);

  return {
    number: data.number,
    title: data.title,
    state: data.state,
    draft: data.draft,
    htmlUrl: data.html_url,
    headRef: data.head.ref,
    baseRef: data.base.ref,
    mergeable: data.mergeable,
    updatedAt: data.updated_at,
  };
}

/** Explicitly blocked — keep for API completeness. */
export async function mergePullRequest(): Promise<never> {
  return refuseMerge();
}

export async function getRepositoryDashboard() {
  const status = await getConnectionStatus();
  if (!status.connected) {
    return {
      status,
      branches: [] as GithubBranch[],
      issues: [] as GithubIssue[],
      pullRequests: [] as GithubPullRequest[],
    };
  }

  const [branches, issues, pullRequests] = await Promise.all([
    listBranches(),
    listOpenIssues(),
    listRecentPullRequests(),
  ]);

  return { status, branches, issues, pullRequests };
}
