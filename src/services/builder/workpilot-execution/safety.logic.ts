/**
 * Hard safety rules for WorkPilot execution — never destructive without CEO approval.
 */

import {
  refuseMerge,
  requireOwnerWriteApproval,
  assertWriteTargetBranch,
  type OwnerWriteApproval,
} from "../../github/github-safety";
import type { WorkpilotFileChange } from "./types";

export function refuseDeploy(): never {
  throw new Error(
    "Automatic deploy is disabled. CEO approval + manual deploy required."
  );
}

export function refuseSend(): never {
  throw new Error(
    "Automatic send is disabled during WorkPilot code execution."
  );
}

export function refuseDestructiveAction(action: string): never {
  throw new Error(
    `Destructive action "${action}" is blocked without explicit CEO approval.`
  );
}

/** Assert planned changes never target protected branches or include silent deletes. */
export function assertSafeExecutionPlan(input: {
  branchName: string;
  filesChanged: WorkpilotFileChange[];
  allowDeletes?: boolean;
}): void {
  assertWriteTargetBranch(input.branchName);

  for (const file of input.filesChanged) {
    if (!file.path?.trim() || file.path.includes("..")) {
      throw new Error(`Unsafe file path rejected: ${file.path}`);
    }
    if (file.action === "delete" && !input.allowDeletes) {
      refuseDestructiveAction("delete");
    }
  }
}

/** Block goal/reasoning text that requests forbidden ops before approval. */
export function assertNoForbiddenIntent(text: string): void {
  if (
    /\b(auto[-\s]?merge|merge (this|the) (pr|pull request|pull)|merge into main)\b/i.test(
      text
    )
  ) {
    refuseMerge();
  }
  if (
    /\b(auto[-\s]?deploy|deploy to production|push to production|ship to production)\b/i.test(
      text
    )
  ) {
    refuseDeploy();
  }
  if (/\b(auto[-\s]?send|send (email|message) to customers)\b/i.test(text)) {
    refuseSend();
  }
  if (
    /\b(force[-\s]?push|rm\s+-rf|drop table|delete (all|production) (files|data))\b/i.test(
      text
    )
  ) {
    refuseDestructiveAction("destructive");
  }
}

export function approvalFromCeoNote(note: string | null | undefined): OwnerWriteApproval {
  const reason = note?.trim() || "CEO approved WorkPilot execution package";
  const approval = { ownerApproved: true as const, reason };
  requireOwnerWriteApproval(approval);
  return approval;
}

export {
  refuseMerge,
  requireOwnerWriteApproval,
  assertWriteTargetBranch,
};
