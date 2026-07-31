/**
 * Apply an approved WorkPilot execution package via GitHub writers.
 * Never merges or deploys.
 */

import type { OwnerWriteApproval } from "../../github/github-safety";
import { refuseMerge } from "./safety.logic";
import type { WorkpilotExecutionPackage, WorkpilotGithubWriter } from "./types";

export type ApplyResult = {
  commitShas: string[];
  prNumber: number | null;
  prUrl: string | null;
};

export async function applyApprovedPackage(input: {
  pkg: WorkpilotExecutionPackage;
  approval: OwnerWriteApproval;
  writer: WorkpilotGithubWriter;
  /** Always false — merge is refused. */
  merge?: boolean;
  deploy?: boolean;
}): Promise<ApplyResult> {
  if (input.merge) refuseMerge();
  if (input.deploy) {
    throw new Error("Automatic deploy is disabled. CEO approval + manual deploy required.");
  }

  await input.writer.createBranch({
    branch: input.pkg.branchName,
    approval: input.approval,
  });

  const commitShas: string[] = [];
  for (const file of input.pkg.filesChanged) {
    if (file.action === "delete") {
      throw new Error(
        `Refusing to delete ${file.path} in controlled execution apply path`
      );
    }
    const written = await input.writer.createOrUpdateFile({
      path: file.path,
      content: file.content,
      message: `${file.action}: ${file.path} — ${file.reason}`,
      branch: input.pkg.branchName,
      approval: input.approval,
    });
    commitShas.push(written.commitSha);
  }

  const pr = await input.writer.createPullRequest({
    title: input.pkg.goal.slice(0, 120),
    body: [
      `## Goal`,
      input.pkg.goal,
      ``,
      `## Work item`,
      `${input.pkg.workItem.kind} · ${input.pkg.workItem.refs.join(", ")} · ${input.pkg.workItem.title}`,
      ``,
      `## Reasoning`,
      input.pkg.reasoning,
      ``,
      `## Risks`,
      ...input.pkg.risks.map((r) => `- ${r}`),
      ``,
      `## Tests`,
      ...input.pkg.testResults.map(
        (t) => `- ${t.status.toUpperCase()} ${t.name} (\`${t.command}\`)`
      ),
      ``,
      `## Rollback`,
      input.pkg.rollbackPlan,
      ``,
      `Prepared by AI employee ${input.pkg.employeeName}. Merge/deploy remain manual.`,
    ].join("\n"),
    head: input.pkg.branchName,
    draft: false,
    approval: input.approval,
  });

  return {
    commitShas,
    prNumber: pr.number,
    prUrl: pr.htmlUrl,
  };
}
