/**
 * Insight action client UX + Conversation panel layout contracts.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  applyInsightActionOptimistic,
} from "@/features/builder/lib/company-memory-insight-actions";
import {
  buildInsightActionRequest,
  insightRemovedFromPending,
  resolveInsightActionResult,
  samplePendingInsight,
  snapshotFromDashboardPayload,
} from "@/features/builder/lib/company-memory-insight-client";
import {
  CONVERSATION_PANEL_LAYOUT,
  preservesHistoryAcrossEmployees,
  recallEmployeeThread,
  rememberEmployeeThread,
} from "@/features/builder/lib/conversation-panel-layout";

const CSS_PATH = path.join(
  process.cwd(),
  "src/app/(builder)/builder.css"
);

describe("insight action client persistence UX", () => {
  it("builds real API payloads for accept / ignore / remove (not placeholders)", () => {
    assert.deepEqual(buildInsightActionRequest("accept", "mem-1"), {
      action: "accept",
      memoryId: "mem-1",
    });
    assert.deepEqual(buildInsightActionRequest("ignore", "mem-1"), {
      action: "ignore",
      memoryId: "mem-1",
    });
    assert.deepEqual(buildInsightActionRequest("remove", "mem-1"), {
      action: "remove",
      memoryId: "mem-1",
    });
  });

  it("optimistically removes insights from Pending immediately", () => {
    const pending = samplePendingInsight();
    const snap = {
      newInsights: [pending],
      learnedPreferences: [],
      recentlyUpdated: [pending],
    };
    for (const action of ["accept", "ignore", "remove"] as const) {
      const next = applyInsightActionOptimistic(snap, pending.id, action);
      assert.equal(
        insightRemovedFromPending(next, pending.id),
        true,
        `${action} must clear Pending immediately`
      );
    }
  });

  it("rolls back to previous snapshot when the API fails", () => {
    const pending = samplePendingInsight();
    const previous = {
      newInsights: [pending],
      learnedPreferences: [],
      recentlyUpdated: [pending],
    };
    const optimistic = applyInsightActionOptimistic(previous, pending.id, "accept");
    assert.equal(insightRemovedFromPending(optimistic, pending.id), true);

    const failed = resolveInsightActionResult({
      previous,
      optimistic,
      response: { ok: false, error: "boom" },
      ok: false,
    });
    assert.equal(failed.rolledBack, true);
    assert.equal(failed.snapshot.newInsights.some((m) => m.id === pending.id), true);

    const networkFail = resolveInsightActionResult({
      previous,
      optimistic,
      response: null,
      ok: false,
    });
    assert.equal(networkFail.rolledBack, true);
    assert.deepEqual(networkFail.snapshot, previous);
  });

  it("applies server dashboard immediately on success without requiring a page reload", () => {
    const pending = samplePendingInsight();
    const previous = {
      newInsights: [pending],
      learnedPreferences: [],
      recentlyUpdated: [pending],
    };
    const optimistic = applyInsightActionOptimistic(previous, pending.id, "accept");
    const serverDash = {
      newInsights: [],
      learnedPreferences: [
        { ...pending, ceoStatus: "accepted" as const, acceptedAt: "2026-08-03T01:00:00.000Z" },
      ],
      recentlyUpdated: [
        { ...pending, ceoStatus: "accepted" as const, acceptedAt: "2026-08-03T01:00:00.000Z" },
      ],
    };
    const ok = resolveInsightActionResult({
      previous,
      optimistic,
      response: { ok: true, dashboard: serverDash },
      ok: true,
    });
    assert.equal(ok.rolledBack, false);
    assert.equal(ok.snapshot.newInsights.length, 0);
    assert.equal(ok.snapshot.learnedPreferences[0]?.ceoStatus, "accepted");
  });

  it("normalizes dashboard payloads for live hydrate", () => {
    const pending = samplePendingInsight();
    const snap = snapshotFromDashboardPayload({
      newInsights: [pending],
      learnedPreferences: undefined,
      recentlyUpdated: undefined,
    });
    assert.equal(snap.newInsights.length, 1);
    assert.deepEqual(snap.learnedPreferences, []);
    assert.deepEqual(snap.recentlyUpdated, []);
  });
});

describe("conversation panel layout contracts", () => {
  it("orders sections so chat stays above Action Required and composer", () => {
    assert.deepEqual([...CONVERSATION_PANEL_LAYOUT.sectionOrder], [
      "header",
      "chat",
      "actionRequired",
      "composer",
      "profile",
    ]);
  });

  it("preserves full chat history when switching employees", () => {
    let cache = new Map();
    cache = rememberEmployeeThread(cache, "alex", {
      messages: [{ id: "a1" }],
      quickActions: ["approve"],
    });
    cache = rememberEmployeeThread(cache, "noah", {
      messages: [{ id: "n1" }, { id: "n2" }],
      quickActions: [],
    });

    assert.equal(preservesHistoryAcrossEmployees(cache, "alex", "noah"), true);
    const alex = recallEmployeeThread(cache, "alex");
    const noah = recallEmployeeThread(cache, "noah");
    assert.equal(alex?.messages.length, 1);
    assert.equal(noah?.messages.length, 2);
    assert.equal(alex?.messages[0]?.id, "a1");
  });

  it("keeps independent scroll + chat-first CSS rules (no dock clip strip)", () => {
    const css = fs.readFileSync(CSS_PATH, "utf8");

    assert.match(css, /\.lo-conversation__list\s*\{[^}]*flex:\s*1/s);
    assert.match(css, /\.lo-conversation__list\s*\{[^}]*min-height:\s*12rem/s);
    assert.match(css, /\.lo-conversation__list\s*\{[^}]*overflow-y:\s*auto/s);

    assert.match(css, /\.lo-conversation__chat\s*\{[^}]*flex:\s*1/s);
    assert.match(css, /\.lo-conversation__chat\s*\{[^}]*min-height:\s*12rem/s);

    assert.match(css, /\.lo-conversation__composer\s*\{[^}]*flex-shrink:\s*0/s);
    assert.doesNotMatch(
      css,
      /\.lo-conversation__composer\s*\{[^}]*position:\s*sticky/s
    );

    assert.match(css, /\.lo-conversation__action-required\s*\{/);
    assert.match(
      css,
      /\.lo-conversation__action-required\s*\{[^}]*max-height:\s*2\.4rem/s
    );
    assert.match(css, /\.lo-conversation__turn--ceo\s*\{[^}]*align-self:\s*flex-end/s);

    assert.match(css, /\.hq-main\s*>\s*\.hq-dock\s*\{[^}]*position:\s*sticky/s);
    assert.match(css, /\.hq-main\s*>\s*\.hq-dock\s*\{[^}]*min-height:\s*26rem/s);
    assert.doesNotMatch(
      css,
      /\.hq-main\s*>\s*\.hq-dock\s*\{[^}]*max-height:\s*19rem/s
    );
    assert.match(
      css,
      /\.lo-conversation__action-required\[open\]\s+\.lo-conversation__actions\s*\{[^}]*position:\s*absolute/s
    );
  });

  it("keeps Action Required closed by default so chat stays majority height", () => {
    const panel = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/features/builder/live-office/live-office-conversation-panel.tsx"
      ),
      "utf8"
    );
    assert.match(panel, /const \[actionsOpen, setActionsOpen\] = useState\(false\)/);
    assert.equal(CONVERSATION_PANEL_LAYOUT.actionRequiredDefaultOpen, false);
  });

  it("panel source uses the layout contract classes", () => {
    const panel = fs.readFileSync(
      path.join(
        process.cwd(),
        "src/features/builder/live-office/live-office-conversation-panel.tsx"
      ),
      "utf8"
    );
    assert.match(panel, /CONVERSATION_PANEL_LAYOUT\.chatClass/);
    assert.match(panel, /CONVERSATION_PANEL_LAYOUT\.listClass/);
    assert.match(panel, /CONVERSATION_PANEL_LAYOUT\.actionRequiredClass/);
    assert.match(panel, /CONVERSATION_PANEL_LAYOUT\.composerClass/);
    assert.match(panel, /Action Required/);
    assert.match(panel, /rememberEmployeeThread/);
  });
});
