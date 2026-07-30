/**
 * WorkPilot repository connection config (server-only).
 * Never import this module from client components.
 */

export type WorkpilotGithubConfig = {
  owner: string;
  repo: string;
  defaultBranch: string;
  tokenConfigured: boolean;
};

export function getWorkpilotGithubConfig(): WorkpilotGithubConfig {
  return {
    owner: process.env.WORKPILOT_GITHUB_OWNER?.trim() || "jungyu128",
    repo: process.env.WORKPILOT_GITHUB_REPO?.trim() || "workpilot",
    defaultBranch: process.env.WORKPILOT_GITHUB_BRANCH?.trim() || "main",
    tokenConfigured: Boolean(process.env.GITHUB_TOKEN?.trim()),
  };
}

/** Returns the token for server-side GitHub API calls only. */
export function getGithubToken(): string | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token || null;
}

export function assertSafeFeatureBranch(branch: string, defaultBranch: string): void {
  const name = branch.trim();
  if (!name) throw new Error("Feature branch name is required");
  if (name === defaultBranch) {
    throw new Error(`Refusing to use default branch "${defaultBranch}" for writes`);
  }
  if (name === "main" || name === "master") {
    throw new Error("Refusing to write directly to main/master");
  }
}
