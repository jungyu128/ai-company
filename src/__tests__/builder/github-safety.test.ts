/**
 * GitHub safety rules — no auto-merge, no writes to main without feature branch.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertWriteTargetBranch,
  refuseMerge,
  requireOwnerWriteApproval,
} from "@/services/github/github-safety";

describe("GitHub safety", () => {
  it("requires explicit owner approval for writes", () => {
    assert.throws(() => requireOwnerWriteApproval(null), /Owner approval required/);
    assert.throws(
      () => requireOwnerWriteApproval({ ownerApproved: true, reason: "   " }),
      /reason/
    );
    assert.doesNotThrow(() =>
      requireOwnerWriteApproval({ ownerApproved: true, reason: "Ship feature branch" })
    );
  });

  it("refuses writes to main/master", () => {
    assert.throws(() => assertWriteTargetBranch("main"), /main/);
    assert.throws(() => assertWriteTargetBranch("master"), /main\/master/);
  });

  it("never merges automatically", () => {
    assert.throws(() => refuseMerge(), /Automatic merge is disabled/);
  });
});
