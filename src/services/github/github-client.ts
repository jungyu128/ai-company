/**
 * Low-level GitHub REST client. Server-only. Never expose GITHUB_TOKEN.
 */

import { getGithubToken, getWorkpilotGithubConfig } from "./github-config";

export class GithubApiError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`GitHub API ${status}: ${body.slice(0, 240)}`);
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Accept header override */
  accept?: string;
};

export async function githubRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = getGithubToken();
  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured");
  }

  const res = await fetch(`https://api.github.com${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: options.accept ?? "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-company-internal",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) throw new GithubApiError(res.status, text);

  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export function repoBasePath(): string {
  const { owner, repo } = getWorkpilotGithubConfig();
  return `/repos/${owner}/${repo}`;
}
