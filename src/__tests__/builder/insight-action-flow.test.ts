/**
 * Insight action data-flow regressions — persistence + immediate UI updates.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  decideMemory,
  getCompanyMemoryDashboard,
} from "@/services/builder/memory/memory.service";
import { listMemories, upsertMemory } from "@/services/builder/memory/memory.store";
import { listMemoryDecisions } from "@/services/builder/memory/memory.store";
import { getCompanyTimeline } from "@/services/builder/company-timeline";
import { listKnowledge } from "@/services/builder/company-learning";
import { listAudit } from "@/services/builder/workspace/collaboration-feed";
import { listAnalyticsSamples } from "@/services/builder/analytics/analytics.store";
import {
  buildInsightActionRequest,
  buildInsightActionUrl,
  insightRemovedFromPending,
  mergePropsWithAppliedDecisions,
  pruneAppliedDecisions,
  recordAppliedDecision,
  resolveInsightActionResult,
  samplePendingInsight,
} from "@/features/builder/lib/company-memory-insight-client";
import { applyInsightActionOptimistic } from "@/features/builder/lib/company-memory-insight-actions";

describe("insight action request wiring", () => {
  it("sends the correct insight ID, action, and workspace on every button", () => {
    assert.equal(
      buildInsightActionUrl("ws-acme"),
      "/api/builder/hq/memory?workspaceId=ws-acme"
    );
    assert.deepEqual(buildInsightActionRequest("accept", "mem-42", "ws-acme"), {
      action: "accept",
      memoryId: "mem-42",
      workspaceId: "ws-acme",
    });
    assert.deepEqual(buildInsightActionRequest("ignore", "mem-42", "ws-acme"), {
      action: "ignore",
      memoryId: "mem-42",
      workspaceId: "ws-acme",
    });
    assert.deepEqual(buildInsightActionRequest("remove", "mem-42", "ws-acme"), {
      action: "remove",
      memoryId: "mem-42",
      workspaceId: "ws-acme",
    });
  });
});

describe("insight action immediate UI + stale SSR protection", () => {
  it("removes from Pending immediately and survives stale prop sync", () => {
    const pending = samplePendingInsight({ id: "mem-ui-1" });
    const props = {
      newInsights: [pending],
      learnedPreferences: [],
      recentlyUpdated: [pending],
    };

    const optimistic = applyInsightActionOptimistic(props, pending.id, "accept");
    assert.equal(insightRemovedFromPending(optimistic, pending.id), true);

    const applied = recordAppliedDecision([], pending.id, "accept");
    // Stale SSR still has the pending insight — merge must keep it out of Pending
    const merged = mergePropsWithAppliedDecisions(props, applied);
    assert.equal(insightRemovedFromPending(merged, pending.id), true);
    assert.equal(merged.learnedPreferences[0]?.ceoStatus, "accepted");

    // Once SSR catches up, prune drops the applied entry
    const caughtUp = {
      newInsights: [],
      learnedPreferences: merged.learnedPreferences,
      recentlyUpdated: merged.recentlyUpdated,
    };
    assert.deepEqual(pruneAppliedDecisions(applied, caughtUp), []);
  });

  it("rolls back local state when the API fails", () => {
    const pending = samplePendingInsight({ id: "mem-ui-2" });
    const previous = {
      newInsights: [pending],
      learnedPreferences: [],
      recentlyUpdated: [pending],
    };
    const optimistic = applyInsightActionOptimistic(previous, pending.id, "ignore");
    const result = resolveInsightActionResult({
      previous,
      optimistic,
      response: { ok: false, error: "Memory not found" },
      ok: false,
    });
    assert.equal(result.rolledBack, true);
    assert.equal(result.snapshot.newInsights[0]?.id, pending.id);
  });

  it("applies API dashboard immediately on success", () => {
    const pending = samplePendingInsight({ id: "mem-ui-3" });
    const previous = {
      newInsights: [pending],
      learnedPreferences: [],
      recentlyUpdated: [pending],
    };
    const optimistic = applyInsightActionOptimistic(previous, pending.id, "remove");
    const dashboard = {
      newInsights: [],
      learnedPreferences: [],
      recentlyUpdated: [],
    };
    const result = resolveInsightActionResult({
      previous,
      optimistic,
      response: { ok: true, dashboard },
      ok: true,
    });
    assert.equal(result.rolledBack, false);
    assert.equal(result.snapshot.newInsights.length, 0);
  });
});

describe("insight action service persistence", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "insight-flow-"));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("persists accept → accepted, leave Pending, timeline + audit + learning", () => {
    const mem = samplePendingInsight({ id: "mem-flow-accept", patternKey: "flow:a" });
    upsertMemory(mem, tmp, "ws-a");

    const result = decideMemory({
      memoryId: mem.id,
      action: "accept",
      repoRoot: tmp,
      workspaceId: "ws-a",
      actor: { userId: "ceo", displayName: "CEO", role: "owner" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.memory.ceoStatus, "accepted");
    assert.equal(result.dashboard.newInsights.some((m) => m.id === mem.id), false);
    assert.ok(result.dashboard.learnedPreferences.some((m) => m.id === mem.id));
    assert.ok(
      listMemoryDecisions(tmp, "ws-a").some(
        (d) => d.memoryId === mem.id && d.action === "accept"
      )
    );
    assert.ok(
      getCompanyTimeline({ repoRoot: tmp, workspaceId: "ws-a" }).events.some(
        (e) => e.kind === "insight_accepted" && e.relatedId === mem.id
      )
    );
    assert.ok(
      listKnowledge(tmp, "ws-a").some((k) =>
        k.sourceRefs.includes(`memory:${mem.id}`)
      )
    );
    assert.ok(
      listAudit("ws-a", tmp, 40).some(
        (a) => a.action === "memory.accept" && a.targetId === mem.id
      )
    );
  });

  it("persists ignore → ignored, leave Pending, audit + analytics", () => {
    const mem = samplePendingInsight({ id: "mem-flow-ignore", patternKey: "flow:i" });
    upsertMemory(mem, tmp, "ws-a");
    const knowledgeBefore = listKnowledge(tmp, "ws-a").length;

    const result = decideMemory({
      memoryId: mem.id,
      action: "ignore",
      repoRoot: tmp,
      workspaceId: "ws-a",
      actor: { userId: "ceo", displayName: "CEO", role: "owner" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.memory.ceoStatus, "ignored");
    assert.equal(result.dashboard.newInsights.some((m) => m.id === mem.id), false);
    assert.equal(listKnowledge(tmp, "ws-a").length, knowledgeBefore);
    assert.ok(
      listAudit("ws-a", tmp, 40).some(
        (a) => a.action === "memory.ignore" && a.targetId === mem.id
      )
    );
    assert.ok(
      listAnalyticsSamples(tmp, "ws-a", 20).some((s) =>
        s.id.includes(result.decision.id)
      )
    );
  });

  it("persists remove → deleted from active insights for that workspace", () => {
    const mem = samplePendingInsight({ id: "mem-flow-remove", patternKey: "flow:r" });
    upsertMemory(mem, tmp, "ws-a");

    const result = decideMemory({
      memoryId: mem.id,
      action: "remove",
      repoRoot: tmp,
      workspaceId: "ws-a",
      actor: { userId: "ceo", displayName: "CEO", role: "owner" },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.memory.ceoStatus, "removed");
    assert.equal(listMemories(tmp, "ws-a").some((m) => m.id === mem.id), false);
    assert.equal(
      getCompanyMemoryDashboard({ repoRoot: tmp, workspaceId: "ws-a" }).newInsights
        .length,
      0
    );
    // Wrong workspace must not see the write as a miss — data is isolated
    assert.equal(listMemories(tmp, "default").some((m) => m.id === mem.id), false);
  });
});
