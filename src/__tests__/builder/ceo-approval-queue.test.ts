/**
 * CEO Approval Queue — unified pending approvals with required fields + gates.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  decideCeoApprovalQueueItem,
  listCeoApprovalQueue,
} from "@/services/builder/ceo-approval-queue";
import {
  applyCeoDailyOpsAction,
  tryExecuteDailyWorkItem,
} from "@/services/builder/daily-ops";
import { getDailyOpsStore, upsertPlan } from "@/services/builder/daily-ops/daily-ops.store";

describe("CEO Approval Queue", () => {
  let tmp = "";
  let prevFlag: string | undefined;

  before(() => {
    prevFlag = process.env.INTERNAL_AI_COMPANY_ENABLED;
    process.env.INTERNAL_AI_COMPANY_ENABLED = "true";
  });

  after(() => {
    if (prevFlag === undefined) delete process.env.INTERNAL_AI_COMPANY_ENABLED;
    else process.env.INTERNAL_AI_COMPANY_ENABLED = prevFlag;
  });

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ceo-approval-queue-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("lists every pending approval with employee, action, reason, impact, and risks", () => {
    const submitted = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Ship approval queue",
        instruction:
          "Implement CEO Approval Queue and deploy the protected code change",
        intendedOutcome: "Unified approval queue ready for CEO decisions",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T14:00:00.000Z",
    });
    assert.equal(submitted.ok, true);

    const queue = listCeoApprovalQueue({ repoRoot: tmp });
    assert.ok(queue.count >= 1);

    const planItem = queue.items.find((i) => i.source === "daily_ops_plan");
    assert.ok(planItem);
    assert.ok(planItem!.employee.name);
    assert.ok(planItem!.requestedAction);
    assert.ok(planItem!.reason);
    assert.ok(planItem!.expectedImpact);
    assert.ok(planItem!.risks.length >= 1);

    const workItems = queue.items.filter((i) => i.source === "daily_ops_work_item");
    assert.ok(workItems.length >= 1);
    for (const item of workItems) {
      assert.ok(item.employee.name);
      assert.ok(item.requestedAction);
      assert.ok(item.reason);
      assert.ok(item.expectedImpact);
      assert.ok(item.risks.length >= 1);
    }

    const protectedItems = queue.items.filter((i) => i.source === "protected_action");
    assert.ok(protectedItems.length >= 1);
    assert.ok(protectedItems.every((i) => i.isProtected));
  });

  it("supports Approve, Reject, and Request Changes without granting protected execution early", async () => {
    const submitted = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Protected gate",
        instruction: "Implement file modification for HQ approval queue UI",
        intendedOutcome: "Protected work blocked until CEO approval",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T14:10:00.000Z",
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const before = listCeoApprovalQueue({ repoRoot: tmp });
    const planItem = before.items.find((i) => i.source === "daily_ops_plan");
    assert.ok(planItem);

    const approvedPlan = await decideCeoApprovalQueueItem({
      id: planItem!.id,
      decision: "approve",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(approvedPlan.ok, true);

    const store = getDailyOpsStore(tmp);
    const plan = store.plans.find((p) => p.id === submitted.snapshot.activePlan?.id);
    assert.ok(plan);
    const protectedWork =
      plan!.proposedWorkItems.find(
        (w) => w.pendingProtectedAction && w.dependencies.length === 0
      ) ?? plan!.proposedWorkItems.find((w) => w.pendingProtectedAction);
    assert.ok(protectedWork);
    assert.equal(protectedWork!.executionPermission, "GRANTED");
    assert.ok(protectedWork!.pendingProtectedAction);

    // Must not execute while protected approval is still pending.
    const blocked = tryExecuteDailyWorkItem({
      workItemId: protectedWork!.id,
      executionKey: `exec-${protectedWork!.id}-1`,
      repoRoot: tmp,
    });
    assert.equal(blocked.ok, false);
    if (!blocked.ok && protectedWork!.dependencies.length === 0) {
      assert.equal(blocked.code, "PROTECTED_ACTION_REQUIRED");
    } else if (!blocked.ok) {
      assert.ok(
        blocked.code === "PROTECTED_ACTION_REQUIRED" ||
          blocked.code === "DEPENDENCY_INCOMPLETE"
      );
    }

    // Force dependency-complete siblings so the protected gate is the only blocker.
    if (protectedWork!.dependencies.length > 0) {
      const unlocked = plan!.proposedWorkItems.map((w) =>
        protectedWork!.dependencies.includes(w.id)
          ? {
              ...w,
              status: "COMPLETED" as const,
              executionPermission: "GRANTED" as const,
              approvalState: "approved" as const,
              progress: 100,
              pendingProtectedAction: null,
              pendingProtectedReason: null,
            }
          : w
      );
      upsertPlan(
        { ...plan!, proposedWorkItems: unlocked, updatedAt: "2026-07-31T14:11:00.000Z" },
        tmp
      );
      const blockedOnlyProtected = tryExecuteDailyWorkItem({
        workItemId: protectedWork!.id,
        executionKey: `exec-${protectedWork!.id}-deps`,
        repoRoot: tmp,
      });
      assert.equal(blockedOnlyProtected.ok, false);
      if (!blockedOnlyProtected.ok) {
        assert.equal(blockedOnlyProtected.code, "PROTECTED_ACTION_REQUIRED");
      }
    }

    const queue = listCeoApprovalQueue({ repoRoot: tmp });
    const prot = queue.items.find(
      (i) => i.source === "protected_action" && i.workItemId === protectedWork!.id
    );
    assert.ok(prot);

    const changes = await decideCeoApprovalQueueItem({
      id: prot!.id,
      decision: "request_changes",
      note: "Narrow the file scope before side effects",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(changes.ok, true);

    const stillBlocked = tryExecuteDailyWorkItem({
      workItemId: protectedWork!.id,
      executionKey: `exec-${protectedWork!.id}-2`,
      repoRoot: tmp,
    });
    assert.equal(stillBlocked.ok, false);

    const afterChanges = listCeoApprovalQueue({ repoRoot: tmp });
    const protAgain = afterChanges.items.find(
      (i) => i.source === "protected_action" && i.workItemId === protectedWork!.id
    );
    assert.ok(protAgain);

    const granted = await decideCeoApprovalQueueItem({
      id: protAgain!.id,
      decision: "approve",
      note: "Scope accepted",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(granted.ok, true);

    const cleared = getDailyOpsStore(tmp)
      .plans.find((p) => p.id === plan!.id)
      ?.proposedWorkItems.find((w) => w.id === protectedWork!.id);
    assert.ok(cleared);
    assert.equal(cleared!.pendingProtectedAction, null);

    const executed = tryExecuteDailyWorkItem({
      workItemId: protectedWork!.id,
      executionKey: `exec-${protectedWork!.id}-3`,
      repoRoot: tmp,
    });
    assert.equal(executed.ok, true);
  });

  it("rejects a work item from the queue and keeps execution DENIED", async () => {
    const submitted = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Reject path",
        instruction: "Plan a small HQ copy refresh without deployment",
        intendedOutcome: "Queue supports reject",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-07-31T15:00:00.000Z",
    });
    assert.equal(submitted.ok, true);

    const queue = listCeoApprovalQueue({ repoRoot: tmp });
    const work = queue.items.find((i) => i.source === "daily_ops_work_item");
    assert.ok(work);

    const rejected = await decideCeoApprovalQueueItem({
      id: work!.id,
      decision: "reject",
      note: "Out of scope today",
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
    });
    assert.equal(rejected.ok, true);

    const item = getDailyOpsStore(tmp)
      .plans.flatMap((p) => p.proposedWorkItems)
      .find((w) => w.id === work!.workItemId);
    assert.ok(item);
    assert.equal(item!.executionPermission, "DENIED");
    assert.equal(item!.status, "REJECTED");
  });
});
