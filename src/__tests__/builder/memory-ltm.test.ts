/**
 * Persistent AI Company long-term memory — search, summarize, recall.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildLongTermMemoryDraft,
  recallMemoryHints,
  searchMemories,
  summarizeOldMemories,
} from "@/services/builder/memory/memory-ltm.logic";
import {
  recordLongTermMemory,
  recallMemoryForDiscussion,
  searchCompanyMemory,
  summarizeCompanyMemory,
} from "@/services/builder/memory/memory.service";
import { listMemories, upsertMemory } from "@/services/builder/memory/memory.store";
import type { CompanyMemory } from "@/services/builder/memory/types";

function oldMemory(
  overrides: Partial<CompanyMemory> & Pick<CompanyMemory, "id" | "patternKey" | "insight">
): CompanyMemory {
  return {
    kind: "discussion",
    title: "Old note",
    confidence: 70,
    evidenceCount: 1,
    sourceRefs: [],
    expiration: { softExpireDays: 30, hardExpireDays: 90 },
    ceoStatus: "accepted",
    createdAt: "2026-06-01T10:00:00.000Z",
    lastUpdated: "2026-06-01T10:00:00.000Z",
    acceptedAt: "2026-06-01T10:00:00.000Z",
    ignoredAt: null,
    employeeIds: ["mia"],
    projectKey: "workpilot",
    workItemId: "TASK-MEM-001",
    workItemTitle: "HQ Conversation autonomy",
    occurredAt: "2026-06-01T10:00:00.000Z",
    tags: ["discussion"],
    ...overrides,
  };
}

describe("long-term memory drafts and search", () => {
  it("builds LTM drafts for completed work, decisions, blockers, bugs, and CEO prefs", () => {
    const kinds = [
      "completed_work",
      "discussion",
      "decision",
      "review",
      "blocker",
      "recurring_bug",
      "ceo_preference",
    ] as const;
    for (const kind of kinds) {
      const draft = buildLongTermMemoryDraft(
        {
          kind,
          title: `${kind} sample`,
          insight: `Remember ${kind} for WorkPilot HQ chat`,
          employeeIds: ["mia", "ethan"],
          projectKey: "workpilot",
          workItemId: "TASK-MEM-001",
          workItemTitle: "HQ Conversation autonomy",
        },
        "2026-07-31T17:00:00.000Z"
      );
      assert.ok(draft);
      assert.equal(draft?.kind, kind);
      assert.ok(draft?.employeeIds?.includes("mia"));
      assert.equal(draft?.projectKey, "workpilot");
      assert.equal(draft?.workItemId, "TASK-MEM-001");
    }
  });

  it("searches by employee, project, work item, and date", () => {
    const memories: CompanyMemory[] = [
      oldMemory({
        id: "m1",
        patternKey: "a",
        insight: "Mia finished HQ chat UI",
        kind: "completed_work",
        occurredAt: "2026-07-10T12:00:00.000Z",
      }),
      oldMemory({
        id: "m2",
        patternKey: "b",
        insight: "Noah API blocker on auth",
        kind: "blocker",
        employeeIds: ["noah"],
        workItemId: "TASK-OTHER",
        occurredAt: "2026-07-20T12:00:00.000Z",
      }),
      oldMemory({
        id: "m3",
        patternKey: "c",
        insight: "CEO prefers desktop-first HQ",
        kind: "ceo_preference",
        employeeIds: ["sarah"],
        occurredAt: "2026-07-25T12:00:00.000Z",
      }),
    ];

    const byEmployee = searchMemories(memories, { employeeId: "mia" });
    assert.ok(byEmployee.every((m) => (m.employeeIds ?? []).includes("mia")));

    const byWork = searchMemories(memories, { workItemId: "TASK-MEM-001" });
    assert.ok(byWork.some((m) => m.id === "m1"));
    assert.ok(!byWork.some((m) => m.id === "m2"));

    const byProject = searchMemories(memories, { projectKey: "workpilot", q: "desktop" });
    assert.equal(byProject.length, 1);
    assert.equal(byProject[0]?.kind, "ceo_preference");

    const byDate = searchMemories(memories, {
      from: "2026-07-15",
      to: "2026-07-31",
    });
    assert.ok(byDate.every((m) => (m.occurredAt ?? "") >= "2026-07-15"));
  });

  it("summarizes old context instead of repeating entire histories", () => {
    const memories = [1, 2, 3, 4].map((n) =>
      oldMemory({
        id: `old-${n}`,
        patternKey: `old-${n}`,
        insight: `Discussion turn ${n} about HQ chat`,
        occurredAt: `2026-06-0${n}T10:00:00.000Z`,
      })
    );
    const { summary, supersededIds } = summarizeOldMemories({
      memories,
      employeeId: "mia",
      workItemId: "TASK-MEM-001",
      olderThanDays: 14,
      now: "2026-07-31T17:00:00.000Z",
    });
    assert.ok(summary);
    assert.match(summary!.insight, /Compressed/i);
    assert.ok((summary!.summarizesIds?.length ?? 0) >= 3);
    assert.ok(supersededIds.length >= 3);

    const hints = recallMemoryHints([summary!, ...memories], {
      employeeId: "mia",
      workItemId: "TASK-MEM-001",
      limit: 3,
    });
    assert.ok(hints[0]?.includes("[Memory"));
    assert.ok(hints.some((h) => /Summary|Compressed|HQ/i.test(h)));
  });
});

describe("long-term memory service persistence", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mem-ltm-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("records, searches, recalls, and summarizes persistent employee memory", () => {
    const recorded = recordLongTermMemory({
      record: {
        kind: "completed_work",
        title: "Shipped HQ chat slice",
        insight: "Mia completed HQ Conversation autonomy UI with tests",
        employeeIds: ["mia"],
        projectKey: "workpilot",
        workItemId: "TASK-MEM-001",
        workItemTitle: "HQ Conversation autonomy",
        tags: ["completed_work"],
        ceoStatus: "accepted",
      },
      repoRoot: tmp,
      now: "2026-07-31T17:10:00.000Z",
    });
    assert.equal(recorded.ok, true);

    recordLongTermMemory({
      record: {
        kind: "recurring_bug",
        title: "Flaky nav prefetch",
        insight: "Nav prefetch race recurs on HQ load",
        employeeIds: ["ethan", "mia"],
        projectKey: "workpilot",
        workItemId: "TASK-MEM-001",
        tags: ["bug"],
      },
      repoRoot: tmp,
      now: "2026-07-31T17:11:00.000Z",
    });

    const found = searchCompanyMemory({
      repoRoot: tmp,
      query: { employeeId: "mia", workItemId: "TASK-MEM-001", projectKey: "workpilot" },
    });
    assert.ok(found.length >= 2);

    const hints = recallMemoryForDiscussion({
      employeeId: "mia",
      workItemId: "TASK-MEM-001",
      repoRoot: tmp,
    });
    assert.ok(hints.length >= 1);
    assert.ok(hints.some((h) => /HQ|nav|chat/i.test(h)));

    // Seed old memories then summarize
    for (let i = 0; i < 4; i++) {
      upsertMemory(
        oldMemory({
          id: `seed-${i}`,
          patternKey: `seed-${i}`,
          insight: `Legacy discussion ${i}`,
          occurredAt: `2026-06-0${i + 1}T09:00:00.000Z`,
        }),
        tmp,
        "default"
      );
    }
    const summarized = summarizeCompanyMemory({
      repoRoot: tmp,
      employeeId: "mia",
      workItemId: "TASK-MEM-001",
      olderThanDays: 14,
      now: "2026-07-31T17:20:00.000Z",
    });
    assert.equal(summarized.ok, true);
    assert.ok(summarized.summary);
    assert.ok(summarized.supersededCount >= 3);
    assert.ok(listMemories(tmp, "default").some((m) => (m.summarizesIds?.length ?? 0) > 0));
  });
});
