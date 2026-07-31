/**
 * HQ desk chat — send, stream chunks, persistence, switching, proactive, failures.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildEmployeeChatReply,
  buildProactiveOpener,
  chunkReplyForStream,
  resolveQuickActions,
} from "@/services/builder/hq-chat.logic";
import {
  getChatThread,
  findMessageByClientRequestId,
} from "@/services/builder/hq-chat.store";
import {
  ensureProactiveChat,
  getHqChatThreadView,
  sendHqChatMessage,
  replaceChatThreadForTests,
} from "@/services/builder/hq-chat.service";
import { saveProactiveScan } from "@/services/builder/proactive.store";
import type { EmployeeRecommendation } from "@/services/builder/proactive.logic";

describe("hq chat logic", () => {
  it("builds contextual employee replies from role and history", () => {
    const reply = buildEmployeeChatReply({
      employeeId: "emma",
      employeeName: "Emma",
      employeeRole: "Product Manager",
      expertise: ["Requirements"],
      communicationStyle: "Clear and action-oriented",
      currentTask: "Drafting acceptance criteria",
      currentActivity: "Working on specs",
      missionTitle: "Ship HQ chat",
      missionSummary: "Make conversation panel real",
      memoryHints: ["CEO prefers concise updates"],
      knowledgeHints: ["Capture requirements first"],
      recentActivity: ["Emma completed analysis"],
      priorMessages: [
        { role: "ceo", body: "What is blocking you?" },
        { role: "employee", body: "Waiting on approval criteria." },
      ],
      ceoMessage: "What should we ship first?",
      relatedRecommendationTitle: "Approve chat slice",
      relatedRecommendationBody: "Ship the desk conversation first.",
    });
    assert.match(reply, /Emma/);
    assert.match(reply, /Product Manager|acceptance|mission|Ship HQ chat|memory|recommendation/i);
    assert.equal(/What should we ship first\?/i.test(reply) && reply.trim() === "What should we ship first?", false);
  });

  it("chunks replies for streaming", () => {
    const chunks = chunkReplyForStream("Hello there from Emma on the floor.");
    assert.ok(chunks.length >= 2);
    assert.equal(chunks.join(""), "Hello there from Emma on the floor.");
  });

  it("suggests quick actions for pending recommendations", () => {
    const actions = resolveQuickActions({
      hasPendingRecommendation: true,
      proactiveReason: "approval_request",
    });
    assert.ok(actions.includes("approve"));
    assert.ok(actions.includes("ask_evidence"));
  });
});

describe("hq chat persistence and send", () => {
  let tmp = "";

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hq-chat-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("sends a CEO message and persists the employee reply", () => {
    const result = sendHqChatMessage({
      employeeId: "emma",
      message: "What are you working on?",
      clientRequestId: "req-1",
      repoRoot: tmp,
      now: "2026-07-31T01:00:00.000Z",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.ceoMessage.role, "ceo");
    assert.equal(result.employeeMessage.role, "employee");
    assert.match(result.employeeMessage.body, /Emma/i);
    assert.ok(result.chunks.length >= 1);

    const thread = getChatThread("emma", tmp);
    assert.equal(thread.messages.length, 2);
    assert.equal(thread.messages[0].body, "What are you working on?");
  });

  it("prevents duplicate sends via clientRequestId", () => {
    const first = sendHqChatMessage({
      employeeId: "alex",
      message: "Status?",
      clientRequestId: "dup-1",
      repoRoot: tmp,
      now: "2026-07-31T01:00:00.000Z",
    });
    assert.equal(first.ok, true);
    const second = sendHqChatMessage({
      employeeId: "alex",
      message: "Status?",
      clientRequestId: "dup-1",
      repoRoot: tmp,
      now: "2026-07-31T01:00:05.000Z",
    });
    assert.equal(second.ok, true);
    if (!second.ok) return;
    assert.equal(second.replayed, true);
    const thread = getChatThread("alex", tmp);
    assert.equal(thread.messages.length, 2);
    const found = findMessageByClientRequestId("alex", "dup-1", tmp);
    assert.ok(found?.employee);
  });

  it("keeps separate history per employee and restores on switch", () => {
    sendHqChatMessage({
      employeeId: "emma",
      message: "Emma thread",
      clientRequestId: "e1",
      repoRoot: tmp,
    });
    sendHqChatMessage({
      employeeId: "sarah",
      message: "Sarah thread",
      clientRequestId: "s1",
      repoRoot: tmp,
    });
    const emma = getHqChatThreadView({ employeeId: "emma", repoRoot: tmp });
    const sarah = getHqChatThreadView({ employeeId: "sarah", repoRoot: tmp });
    assert.ok(emma.messages.some((m) => m.body === "Emma thread"));
    assert.ok(sarah.messages.some((m) => m.body === "Sarah thread"));
    assert.equal(
      emma.messages.some((m) => m.body === "Sarah thread"),
      false
    );
  });

  it("opens a proactive conversation for pending recommendations", () => {
    const rec: EmployeeRecommendation = {
      id: "rec-chat-1",
      title: "Approve requirements pack",
      recommendation: "Ship the acceptance criteria for HQ chat this sprint.",
      reasoning: "Unblocks the Live Office conversation slice.",
      confidence: 82,
      expectedImpact: "CEO can chat with desks end-to-end.",
      category: "opportunity",
      leadEmployeeId: "emma",
      conversationOwnerId: "emma",
      participatingEmployees: [
        { id: "emma", name: "Emma", role: "Product Manager" },
      ],
      internalDiscussion: [],
      status: "pending",
      ceoNote: null,
      reassignedToEmployeeId: null,
      delayedUntil: null,
      signalIds: [],
      createdAt: "2026-07-31T01:00:00.000Z",
      updatedAt: "2026-07-31T01:00:00.000Z",
      priority: "High",
      urgency: "This Week",
    };
    saveProactiveScan({
      signals: [],
      recommendations: [rec],
      scannedAt: "2026-07-31T01:00:00.000Z",
      repoRoot: tmp,
    });

    const opened = ensureProactiveChat({
      employeeId: "emma",
      repoRoot: tmp,
      now: "2026-07-31T01:01:00.000Z",
    });
    assert.equal(opened.opened, true);
    assert.ok(opened.message);
    assert.equal(opened.message?.kind, "proactive");
    assert.equal(opened.thread.unreadProactive, true);

    const again = ensureProactiveChat({
      employeeId: "emma",
      repoRoot: tmp,
      now: "2026-07-31T01:02:00.000Z",
    });
    assert.equal(again.opened, false);
  });

  it("returns clear failures for empty messages and unknown employees", () => {
    const empty = sendHqChatMessage({
      employeeId: "emma",
      message: "   ",
      repoRoot: tmp,
    });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.code, "EMPTY_MESSAGE");

    const unknown = sendHqChatMessage({
      employeeId: "not-a-real-employee",
      message: "Hello",
      repoRoot: tmp,
    });
    assert.equal(unknown.ok, false);
    if (!unknown.ok) assert.equal(unknown.code, "UNKNOWN_EMPLOYEE");
  });

  it("builds a proactive opener from recommendation context", () => {
    const msg = buildProactiveOpener({
      employeeId: "sarah",
      now: "2026-07-31T02:00:00.000Z",
      currentTask: null,
      missionTitle: null,
      pendingApprovalTitle: null,
      recommendation: {
        id: "r1",
        title: "Pipeline risk on Acme",
        recommendation: "Escalate discount approval today.",
        priority: "Critical",
        urgency: "Today",
        status: "pending",
      },
      recentRiskActivity: null,
      existingMessages: [],
    });
    assert.ok(msg);
    assert.equal(msg?.proactiveReason, "risk");
    assert.match(msg?.body ?? "", /risk|Acme|Escalate/i);
  });

  it("preserves an existing thread when replacing via test helper", () => {
    replaceChatThreadForTests(
      {
        employeeId: "mia",
        messages: [
          {
            id: "m1",
            employeeId: "mia",
            role: "employee",
            speakerName: "Mia",
            speakerRole: "Engineer",
            body: "Cached message",
            at: "2026-07-31T00:00:00.000Z",
            kind: "chat",
          },
        ],
        updatedAt: "2026-07-31T00:00:00.000Z",
        unreadProactive: false,
      },
      tmp
    );
    const view = getHqChatThreadView({ employeeId: "mia", repoRoot: tmp });
    assert.equal(view.messages[0]?.body, "Cached message");
  });
});
