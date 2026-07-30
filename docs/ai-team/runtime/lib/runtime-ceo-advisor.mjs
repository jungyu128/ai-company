/**
 * AI Company CEO Advisor — executive briefing synthesizer.
 * Reasons from HQ snapshot (sprint, decisions, audit, releases, health, approvals).
 * Does not redesign Builder Runtime. Not WorkPilot product / customer data.
 */

/**
 * @typedef {object} CeoAdvisorBriefing
 * @property {string} generatedAt
 * @property {string | null} lastVisitAt
 * @property {'critical' | 'high' | 'watch' | 'clear'} urgency
 * @property {string} headline
 * @property {string} sinceLastVisit
 * @property {string} requiresAttention
 * @property {string} whyItMatters
 * @property {string} recommendedAction
 * @property {string} expectedOutcome
 * @property {string} risksIfIgnored
 * @property {string[]} evidence
 */

function parseTime(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function humanDelta(ms) {
  if (ms == null || ms < 0) return "this session";
  const h = Math.floor(ms / 3_600_000);
  const d = Math.floor(h / 24);
  if (d >= 2) return `${d} days`;
  if (d === 1) return "about a day";
  if (h >= 2) return `${h} hours`;
  if (h === 1) return "about an hour";
  const m = Math.max(1, Math.floor(ms / 60_000));
  return `${m} minutes`;
}

function eventMs(ev) {
  return parseTime(ev?.timestamp) ?? 0;
}

function summarizeSinceLastVisit(hq, lastVisitMs, nowMs) {
  const feed = Array.isArray(hq.activityFeed) ? hq.activityFeed : [];
  const decisions = Array.isArray(hq.recentDecisions) ? hq.recentDecisions : [];
  const releases = Array.isArray(hq.releaseHistory) ? hq.releaseHistory : [];

  if (lastVisitMs == null) {
    const latest = feed[0];
    const release = hq.latestRelease;
    const parts = [
      "This looks like a fresh HQ visit (no prior visit timestamp).",
      hq.sprint
        ? `Active sprint is ${hq.sprint.id} — ${hq.sprint.name}, aimed at: ${hq.sprint.goal}.`
        : "No active sprint is recorded on the Task Board.",
    ];
    if (release) {
      parts.push(`Latest release on record: ${release.title} (${release.date}).`);
    }
    if (latest) {
      parts.push(
        `Most recent company signal: ${latest.action}${latest.taskId ? ` on ${latest.taskId}` : ""} — ${latest.rationale || "see audit log"}.`
      );
    }
    return parts.join(" ");
  }

  const windowLabel = humanDelta(nowMs - lastVisitMs);
  const recentFeed = feed.filter((e) => eventMs(e) > lastVisitMs);
  const recentDecisions = decisions.filter((d) => {
    const t = parseTime(d.date);
    // date-only → treat as end of day UTC for "since" comparison
    if (t == null) return false;
    return t + 86_400_000 > lastVisitMs;
  });
  const recentReleases = releases.filter((r) => {
    const t = parseTime(r.date);
    return t != null && t + 86_400_000 > lastVisitMs;
  });

  if (recentFeed.length === 0 && recentDecisions.length === 0 && recentReleases.length === 0) {
    return `In the last ${windowLabel}, the audit trail shows no new Builder Runtime events. The company is holding steady on the current board state — which may mean work is waiting on you, or agents are idle between missions.`;
  }

  const bits = [`Since your last visit (~${windowLabel}):`];
  if (recentReleases.length) {
    bits.push(
      `Release activity noted — ${recentReleases.map((r) => r.title).join("; ")}.`
    );
  }
  if (recentDecisions.length) {
    bits.push(
      `Decision memory updated (${recentDecisions.length}): ${recentDecisions
        .slice(0, 2)
        .map((d) => d.summary)
        .join("; ")}.`
    );
  }
  const notableActions = recentFeed
    .filter((e) =>
      /EXECUTE_|CEO_|STAGE|HQ_|DISPATCH_|CANCEL_|ADVANCE_|DISCUSSION|RELEASE/i.test(e.action)
    )
    .slice(0, 4);
  if (notableActions.length) {
    bits.push(
      `Runtime moved: ${notableActions
        .map((e) => `${e.action}${e.taskId ? ` (${e.taskId})` : ""}`)
        .join(", ")}.`
    );
  } else if (recentFeed.length) {
    bits.push(`${recentFeed.length} audit event(s) landed without a ship/approval climax.`);
  }
  return bits.join(" ");
}

function pickAttention(hq) {
  const approvals = hq.pendingCeoApprovals ?? [];
  const health = hq.engineeringHealth ?? {};
  const blocked = hq.blockedItems ?? [];
  const task = hq.currentTask;

  if (approvals.length > 0) {
    const a = approvals[0];
    return {
      urgency: approvals.length > 1 ? "critical" : "high",
      requiresAttention: `${approvals.length} CEO gate(s) are open. Top of queue: ${a.id} — ${a.title} (${a.gate}).`,
      whyItMatters:
        "Until you approve or reject, the Builder Runtime cannot honestly mark work DONE or unblock the next DISCUSS → ship cycle. Agents and Claude Code execution stay parked behind the human CEO gate — that is intentional company law, not a bug.",
      recommendedAction: `In Cursor, say exactly: \`${a.phrase}\`. If this is a proposal gate, use the proposal form instead: \`Approve ${a.id} proposal only\`.`,
      expectedOutcome:
        "Ship phrase advances WAITING_CEO → DONE for that task, clears the approval queue signal, and frees Sprint capacity for the next WorkPilot mission. Proposal phrase unlocks IN_PROGRESS implementation under the existing Claude Code bridge.",
      risksIfIgnored:
        "Work piles up as false progress: releases stay half-closed, Decision Memory drifts from reality, and the team either stalls or is tempted to bypass gates — both destroy trust in the AI Company operating model.",
      evidence: [
        `approval:${a.id}`,
        hq.sprint ? `sprint:${hq.sprint.id}` : "sprint:none",
        `waitingCeo:${health.waitingCeo ?? approvals.length}`,
      ],
    };
  }

  if (blocked.length > 0 || (health.blocked ?? 0) > 0) {
    const item = blocked[0] ?? "Blocked task on board";
    return {
      urgency: "high",
      requiresAttention: `Builder work is blocked: ${item}.`,
      whyItMatters:
        "A BLOCKED task freezes the owner agent and stops the pipeline. Sprint goals cannot complete while capacity is trapped on an unresolved dependency.",
      recommendedAction:
        "Open the blocked task file, identify the unblock owner (usually PM), and either remove the blocker or re-scope OUT of the current sprint commitment.",
      expectedOutcome:
        "Task returns to an active status, agents can be dispatched again, and Engineering Health blocked count drops.",
      risksIfIgnored:
        "Sprint goal slips while looking 'busy' on paper; downstream QA/Security never run; CEO sees stale WAITING_CEO or empty progress.",
      evidence: [`blocked:${item}`, hq.sprint ? `sprint:${hq.sprint.id}` : "sprint:none"],
    };
  }

  if ((health.openDebt ?? 0) > 0 && (health.openDebt ?? 0) >= 2) {
    return {
      urgency: "watch",
      requiresAttention: `Engineering Health shows ${health.openDebt} open tech-debt row(s) and ${health.openImprovements ?? 0} improvement proposal(s).`,
      whyItMatters:
        "Debt and improvements are how the company compounds quality. Ignoring them while shipping features recreates the 'solo AI chat' failure mode the Builder Runtime was built to prevent.",
      recommendedAction:
        "Ask Orchestrator to schedule a P0/P1 debt item into the next sprint commitment (capacity-checked), or explicitly WONT_FIX with a Decision Memory entry.",
      expectedOutcome:
        "Debt becomes intentional work with an owner — or is consciously declined — instead of silent drag on every future feature.",
      risksIfIgnored:
        "Recurring gate failures, AGENT_BUSY pressure, and fragile releases that force emergency Stage-style stabilizations.",
      evidence: [`debt:${health.openDebt}`, `improvements:${health.openImprovements ?? 0}`],
    };
  }

  if (task && ["IN_PROGRESS", "QA", "SECURITY", "REVIEW", "DISCUSS", "ARCHITECT"].includes(task.status)) {
    return {
      urgency: "watch",
      requiresAttention: `Company is mid-pipeline on ${task.id} — ${task.title} [${task.status}] (owner ${task.owner}).`,
      whyItMatters:
        "Your job now is oversight, not invention: keep gates honest, answer clarification only when Orchestrator escalates, and avoid starting a second P0 in parallel.",
      recommendedAction: `Let ${task.owner || "the owning role"} finish the current status. Refresh HQ; intervene only if the task goes BLOCKED or WAITING_CEO.`,
      expectedOutcome:
        "Clean handoffs through QA → Security → Review → your ship phrase, with Decision Memory updated at the end.",
      risksIfIgnored:
        "Context-switching into a new mission while this one is live creates dual occupancy pressure and skipped DISCUSSION quality.",
      evidence: [`task:${task.id}`, `status:${task.status}`, `agent:${hq.activeAgent}`],
    };
  }

  const release = hq.latestRelease;
  return {
    urgency: "clear",
    requiresAttention:
      "No CEO approvals or blockers are holding the company. The board is ready for a new WorkPilot mission.",
    whyItMatters:
      "Idle HQ time is when you choose the next highest-leverage product bet — with DISCUSSION and sprint capacity — before agents invent work.",
    recommendedAction:
      'Say: `Enter AI Company. 오늘 WorkPilot 목표: […]` with one sentence, or open `/builder/hq` and instruct Orchestrator to open DISCUSS for that goal.',
    expectedOutcome:
      "A new TASK enters DISCUSS, sprint commitment stays within capacity, and the Advisor will switch to oversight mode once WAITING_CEO appears.",
    risksIfIgnored:
      release
        ? `Momentum after ${release.title} fades; the company looks complete while WorkPilot product gaps remain unprioritized.`
        : "Without a CEO goal, agents cannot legitimately start Builder Runtime work.",
    evidence: [
      hq.sprint ? `sprint:${hq.sprint.id}` : "sprint:none",
      release ? `release:${release.id}` : "release:none",
      `waitingCeo:0`,
    ],
  };
}

/**
 * Synthesize CEO Advisor briefing from an HQ snapshot.
 * @param {object} hq
 * @param {{ lastVisitAt?: string | null, now?: string }} [opts]
 */
export function buildCeoAdvisor(hq, opts = {}) {
  if (!hq || typeof hq !== "object") {
    return {
      ok: false,
      code: "INVALID_HQ",
      message: "CEO Advisor requires an HQ snapshot",
    };
  }

  const nowIso = opts.now ?? new Date().toISOString();
  const nowMs = parseTime(nowIso) ?? Date.now();
  const lastVisitAt = opts.lastVisitAt ?? null;
  const lastVisitMs = parseTime(lastVisitAt);

  const sinceLastVisit = summarizeSinceLastVisit(hq, lastVisitMs, nowMs);
  const attention = pickAttention(hq);

  const sprintBit = hq.sprint
    ? `${hq.sprint.id} is ${hq.sprint.status} with goal “${hq.sprint.goal}”.`
    : "No active sprint framing the week.";

  const headline =
    attention.urgency === "critical" || attention.urgency === "high"
      ? `CEO action needed — ${hq.pendingCeoApprovals?.[0]?.title ?? "company gate"}`
      : attention.urgency === "watch"
        ? `Company in motion — stay the course on ${hq.currentTask?.id ?? "current work"}`
        : `Headquarters clear — set the next WorkPilot mission`;

  /** @type {CeoAdvisorBriefing} */
  const briefing = {
    generatedAt: nowIso,
    lastVisitAt,
    urgency: attention.urgency,
    headline,
    sinceLastVisit: `${sinceLastVisit} ${sprintBit}`,
    requiresAttention: attention.requiresAttention,
    whyItMatters: attention.whyItMatters,
    recommendedAction: attention.recommendedAction,
    expectedOutcome: attention.expectedOutcome,
    risksIfIgnored: attention.risksIfIgnored,
    evidence: attention.evidence,
  };

  return { ok: true, value: briefing, message: "CEO Advisor briefing built" };
}
