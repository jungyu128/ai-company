/**
 * AI Company Brain — pure company-level reasoning.
 * Observes recorded inputs only; never invents progress, meetings, or blockers.
 */

import type {
  CompanyBrainAnalyticsInput,
  CompanyBrainAssessments,
  CompanyBrainEvidence,
  CompanyBrainInput,
  CompanyBrainView,
  ExecutiveRecommendation,
} from "./types";

function evidence(
  source: string,
  fact: string | null | undefined
): CompanyBrainEvidence | null {
  const trimmed = fact?.trim();
  if (!trimmed) return null;
  return { source, fact: trimmed };
}

function pushEvidence(
  list: CompanyBrainEvidence[],
  item: CompanyBrainEvidence | null
) {
  if (item) list.push(item);
}

function confidenceLabel(score: number): ExecutiveRecommendation["confidenceLabel"] {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function observeSources(input: CompanyBrainInput): string[] {
  const sources: string[] = [];
  if (input.directive) sources.push("Daily Directive");
  if (input.continuousOs) sources.push("Continuous OS");
  sources.push("Live Work Tracker");
  if (input.timelineRecent.length > 0) sources.push("Timeline");
  if (input.analytics) sources.push("Analytics");
  if (input.sprint) sources.push("Sprint");
  if (input.meetings.length > 0) sources.push("Meetings");
  if (
    input.memory.insightCount > 0 ||
    input.memory.preferenceCount > 0 ||
    input.memory.lastLearnedAt
  ) {
    sources.push("Memory");
  }
  if (input.ceoInbox.total > 0) sources.push("CEO Inbox");
  if (input.approvalQueue.count > 0) sources.push("Approval Queue");
  if (input.github) sources.push("GitHub status");
  sources.push("Company Health");
  if (input.employeeRecommendations.length > 0) sources.push("Employee reports");
  return sources;
}

function assessWorkloadImbalance(
  input: CompanyBrainInput
): { text: string | null; evidence: CompanyBrainEvidence | null } {
  const fromAnalytics = input.analytics?.employeeActive ?? [];
  if (fromAnalytics.length >= 2) {
    const sorted = [...fromAnalytics].sort((a, b) => b.active - a.active);
    const top = sorted[0]!;
    const bottom = sorted[sorted.length - 1]!;
    if (top.active >= 2 && top.active - bottom.active >= 2) {
      return {
        text: `${top.name} carries ${top.active} active items vs ${bottom.name} at ${bottom.active}`,
        evidence: evidence(
          "Analytics",
          `Workload skew: ${top.name} active=${top.active}, ${bottom.name} active=${bottom.active}`
        ),
      };
    }
  }
  if (input.liveWork.overloadedNames.length > 0) {
    const names = input.liveWork.overloadedNames.join(", ");
    return {
      text: `Overloaded employees: ${names}`,
      evidence: evidence("Live Work Tracker", `Overloaded: ${names}`),
    };
  }
  if (input.liveWork.blocked > 0 && input.liveWork.idle > input.liveWork.working) {
    return {
      text: `${input.liveWork.blocked} blocked while ${input.liveWork.idle} idle — capacity not applied to blockers`,
      evidence: evidence(
        "Live Work Tracker",
        `Blocked=${input.liveWork.blocked}, idle=${input.liveWork.idle}, working=${input.liveWork.working}`
      ),
    };
  }
  return { text: null, evidence: null };
}

function assessEngineeringHealth(input: CompanyBrainInput): {
  text: string | null;
  evidenceItems: CompanyBrainEvidence[];
} {
  const items: CompanyBrainEvidence[] = [];
  const parts: string[] = [];
  if (input.companyHealth) {
    parts.push(`health ${input.companyHealth.score} (${input.companyHealth.label})`);
    pushEvidence(
      items,
      evidence(
        "Company Health",
        `${input.companyHealth.label}: ${input.companyHealth.summary}`
      )
    );
  }
  if (input.executionSuccessRate != null) {
    parts.push(`execution success ${Math.round(input.executionSuccessRate)}%`);
    pushEvidence(
      items,
      evidence(
        "Company Health",
        `Execution success rate ${Math.round(input.executionSuccessRate)}%`
      )
    );
  }
  if (input.analytics?.qaPassRatePercent != null) {
    parts.push(`QA pass ${input.analytics.qaPassRatePercent}%`);
    pushEvidence(
      items,
      evidence("Analytics", `QA pass rate ${input.analytics.qaPassRatePercent}%`)
    );
  }
  if (parts.length === 0) return { text: null, evidenceItems: [] };
  return { text: parts.join(" · "), evidenceItems: items };
}

function assessReleaseReadiness(input: CompanyBrainInput): {
  text: string | null;
  evidenceItems: CompanyBrainEvidence[];
} {
  const items: CompanyBrainEvidence[] = [];
  const blockers: string[] = [];
  const ready: string[] = [];

  if (input.approvalQueue.protectedCount > 0) {
    blockers.push(
      `${input.approvalQueue.protectedCount} protected approval(s) pending`
    );
    pushEvidence(
      items,
      evidence(
        "Approval Queue",
        `${input.approvalQueue.protectedCount} protected action(s) awaiting CEO`
      )
    );
  } else if (input.approvalQueue.count > 0) {
    blockers.push(`${input.approvalQueue.count} approval(s) open`);
    pushEvidence(
      items,
      evidence("Approval Queue", `${input.approvalQueue.count} decision(s) open`)
    );
  } else {
    ready.push("approval queue clear");
  }

  if (input.blockers.length > 0 || input.liveWork.blocked > 0) {
    const n = Math.max(input.blockers.length, input.liveWork.blocked);
    blockers.push(`${n} blocker(s) open`);
    pushEvidence(
      items,
      evidence(
        "Live Work Tracker",
        `${input.liveWork.blocked} employee(s) blocked; daily-ops blockers=${input.blockers.length}`
      )
    );
  } else {
    ready.push("no recorded blockers");
  }

  if (input.github) {
    if (!input.github.connected) {
      blockers.push(
        input.github.error
          ? `GitHub: ${input.github.error}`
          : "GitHub not connected"
      );
      pushEvidence(
        items,
        evidence(
          "GitHub status",
          input.github.error ??
            `Not connected to ${input.github.owner}/${input.github.repo}`
        )
      );
    } else {
      ready.push(`GitHub connected (${input.github.owner}/${input.github.repo})`);
      pushEvidence(
        items,
        evidence(
          "GitHub status",
          `Connected to ${input.github.owner}/${input.github.repo}` +
            (input.github.pushedAt ? `; last push ${input.github.pushedAt}` : "")
        )
      );
    }
  }

  if (
    input.executionSuccessRate != null &&
    input.executionSuccessRate < 70
  ) {
    blockers.push(`execution success ${Math.round(input.executionSuccessRate)}%`);
  }

  if (blockers.length === 0) {
    return {
      text: `Ready signals: ${ready.join("; ") || "no release blockers recorded"}`,
      evidenceItems: items,
    };
  }
  return {
    text: `Not release-ready: ${blockers.join("; ")}`,
    evidenceItems: items,
  };
}

function buildAssessments(input: CompanyBrainInput): {
  assessments: CompanyBrainAssessments;
  evidencePool: CompanyBrainEvidence[];
} {
  const evidencePool: CompanyBrainEvidence[] = [];

  // Highest company priority
  let highestCompanyPriority: string | null = null;
  if (input.approvalQueue.protectedCount > 0) {
    highestCompanyPriority = `Clear ${input.approvalQueue.protectedCount} protected approval(s)`;
    pushEvidence(
      evidencePool,
      evidence(
        "Approval Queue",
        `Protected count ${input.approvalQueue.protectedCount}: ${input.approvalQueue.topTitles.slice(0, 2).join("; ") || "pending"}`
      )
    );
  } else if (input.approvalQueue.count > 0) {
    highestCompanyPriority = `Resolve ${input.approvalQueue.count} pending CEO decision(s)`;
    pushEvidence(
      evidencePool,
      evidence(
        "Approval Queue",
        `Open decisions: ${input.approvalQueue.topTitles.slice(0, 3).join("; ") || String(input.approvalQueue.count)}`
      )
    );
  } else if (input.directive && !input.directive.paused) {
    highestCompanyPriority = `Advance Daily Directive: ${input.directive.title}`;
    pushEvidence(
      evidencePool,
      evidence(
        "Daily Directive",
        `${input.directive.title} (${input.directive.status})`
      )
    );
  } else if (input.executiveBrief.recommendedNextAction) {
    highestCompanyPriority = input.executiveBrief.recommendedNextAction;
    pushEvidence(
      evidencePool,
      evidence(
        "CEO Inbox",
        `Executive brief next action: ${input.executiveBrief.recommendedNextAction}`
      )
    );
  }

  // Biggest risk
  let biggestCurrentRisk: string | null = null;
  if (input.risks[0]) {
    biggestCurrentRisk = input.risks[0];
    pushEvidence(evidencePool, evidence("Company Health", `Risk: ${input.risks[0]}`));
  } else if (input.companyHealth.score < 50) {
    biggestCurrentRisk = `Company health At risk/Watch — score ${input.companyHealth.score}`;
    pushEvidence(
      evidencePool,
      evidence(
        "Company Health",
        `Score ${input.companyHealth.score}: ${input.companyHealth.summary}`
      )
    );
  } else if (input.analytics?.recurringBlockers[0]) {
    const rb = input.analytics.recurringBlockers[0];
    biggestCurrentRisk = `Recurring blocker: ${rb.label} (×${rb.count})`;
    pushEvidence(
      evidencePool,
      evidence("Analytics", `Recurring blocker ${rb.label} count=${rb.count}`)
    );
  }

  // Biggest blocker
  let biggestBlocker: string | null = null;
  if (input.blockers[0]) {
    biggestBlocker = `${input.blockers[0].title}: ${input.blockers[0].reason}`;
    pushEvidence(
      evidencePool,
      evidence(
        "Daily Directive",
        `Blocker ${input.blockers[0].title}: ${input.blockers[0].reason}`
      )
    );
  } else if (input.liveWork.blocked > 0) {
    biggestBlocker = `${input.liveWork.blocked} employee(s) blocked on live work`;
    pushEvidence(
      evidencePool,
      evidence("Live Work Tracker", `${input.liveWork.blocked} blocked`)
    );
  } else if (input.ceoInbox.blockerCount > 0) {
    biggestBlocker = `${input.ceoInbox.blockerCount} blocker notice(s) in CEO Inbox`;
    pushEvidence(
      evidencePool,
      evidence("CEO Inbox", `${input.ceoInbox.blockerCount} blocker inbox items`)
    );
  }

  // Weakest sprint
  let weakestSprint: string | null = null;
  if (input.sprint) {
    const s = input.sprint;
    if (s.blockedWorkItems > 0 || s.progressPercent < 40) {
      weakestSprint = `${s.name}: ${s.progressPercent}% progress, ${s.blockedWorkItems} blocked of ${s.totalWorkItems}`;
      pushEvidence(
        evidencePool,
        evidence(
          "Sprint",
          `${s.name} status=${s.status} progress=${s.progressPercent}% blocked=${s.blockedWorkItems} velocity=${s.velocity}`
        )
      );
    } else {
      weakestSprint = `${s.name}: on track at ${s.progressPercent}% (${s.completedWorkItems}/${s.totalWorkItems} done)`;
      pushEvidence(
        evidencePool,
        evidence(
          "Sprint",
          `${s.name} progress=${s.progressPercent}% completed=${s.completedWorkItems}/${s.totalWorkItems}`
        )
      );
    }
  }

  // Strongest opportunity
  let strongestOpportunity: string | null = null;
  if (input.opportunities[0]) {
    strongestOpportunity = input.opportunities[0];
    pushEvidence(
      evidencePool,
      evidence("Company Health", `Opportunity: ${input.opportunities[0]}`)
    );
  } else if (
    input.liveWork.idle > 0 &&
    input.blockers.length === 0 &&
    input.approvalQueue.count === 0
  ) {
    strongestOpportunity = `${input.liveWork.idle} idle employee(s) available to advance the directive`;
    pushEvidence(
      evidencePool,
      evidence("Live Work Tracker", `${input.liveWork.idle} idle employees`)
    );
  }

  // Recommended next mission
  let recommendedNextMission: string | null = null;
  const pendingRec = input.employeeRecommendations.find(
    (r) => r.status === "pending" || r.status === "questioned"
  );
  if (pendingRec) {
    recommendedNextMission = pendingRec.title;
    pushEvidence(
      evidencePool,
      evidence(
        "Employee reports",
        `${pendingRec.title}: ${pendingRec.summary.slice(0, 160)}`
      )
    );
  } else if (input.directive && !input.directive.paused) {
    recommendedNextMission = `Continue mission from directive “${input.directive.title}”`;
    pushEvidence(
      evidencePool,
      evidence("Daily Directive", input.directive.instruction.slice(0, 200))
    );
  } else if (input.sprint?.goal) {
    recommendedNextMission = `Advance sprint goal: ${input.sprint.goal}`;
    pushEvidence(evidencePool, evidence("Sprint", `Goal: ${input.sprint.goal}`));
  }

  // Recommended CEO decision
  let recommendedCeoDecision: string | null = null;
  if (input.approvalQueue.protectedCount > 0) {
    recommendedCeoDecision = `Approve or reject protected action: ${input.approvalQueue.topTitles[0] ?? "protected queue item"}`;
    pushEvidence(
      evidencePool,
      evidence("Approval Queue", "Protected actions require explicit CEO decision")
    );
  } else if (input.approvalQueue.count > 0) {
    recommendedCeoDecision = `Decide on: ${input.approvalQueue.topTitles[0] ?? "pending approval"}`;
  } else if (input.ceoInbox.waitingCount > 0) {
    recommendedCeoDecision = `Unblock ${input.ceoInbox.waitingCount} employee(s) waiting on CEO`;
    pushEvidence(
      evidencePool,
      evidence("CEO Inbox", `${input.ceoInbox.waitingCount} waiting notices`)
    );
  }

  const workload = assessWorkloadImbalance(input);
  if (workload.evidence) evidencePool.push(workload.evidence);

  const eng = assessEngineeringHealth(input);
  evidencePool.push(...eng.evidenceItems);

  const release = assessReleaseReadiness(input);
  evidencePool.push(...release.evidenceItems);

  // Roadmap impact
  let roadmapImpact: string | null = null;
  if (input.directive && (biggestBlocker || input.approvalQueue.count > 0)) {
    roadmapImpact = `Directive “${input.directive.title}” is gated by ${
      input.approvalQueue.count > 0 ? "CEO approvals" : "recorded blockers"
    }`;
    pushEvidence(
      evidencePool,
      evidence(
        "Daily Directive",
        `Roadmap gate on “${input.directive.title}” (${input.directive.status})`
      )
    );
  } else if (input.sprint && input.sprint.blockedWorkItems > 0) {
    roadmapImpact = `Sprint “${input.sprint.name}” goal delayed by ${input.sprint.blockedWorkItems} blocked item(s)`;
    pushEvidence(
      evidencePool,
      evidence(
        "Sprint",
        `Goal “${input.sprint.goal}” blockedWorkItems=${input.sprint.blockedWorkItems}`
      )
    );
  } else if (input.directive) {
    roadmapImpact = `Directive “${input.directive.title}” remains the recorded roadmap focus`;
  }

  // Meetings / Continuous OS / Timeline — only as supporting evidence when present
  for (const m of input.meetings.slice(0, 2)) {
    if (m.synthesis.trim()) {
      pushEvidence(
        evidencePool,
        evidence("Meetings", `${m.title} (${m.status}): ${m.synthesis.slice(0, 160)}`)
      );
    }
  }
  if (input.continuousOs) {
    pushEvidence(
      evidencePool,
      evidence(
        "Continuous OS",
        `running=${input.continuousOs.running}; activeTasks=${input.continuousOs.activeTaskCount}; lastTick=${input.continuousOs.lastTickAt ?? "never"}`
      )
    );
  }
  for (const t of input.timelineRecent.slice(0, 3)) {
    pushEvidence(
      evidencePool,
      evidence("Timeline", `${t.kind}: ${t.summary}`)
    );
  }
  if (input.dailyOpsLatestUpdate) {
    pushEvidence(
      evidencePool,
      evidence("Daily Directive", `Latest update: ${input.dailyOpsLatestUpdate}`)
    );
  }
  if (input.memory.lastLearnedAt || input.memory.insightCount > 0) {
    pushEvidence(
      evidencePool,
      evidence(
        "Memory",
        `insights=${input.memory.insightCount}; preferences=${input.memory.preferenceCount}; lastLearned=${input.memory.lastLearnedAt ?? "n/a"}`
      )
    );
  }

  return {
    assessments: {
      highestCompanyPriority,
      biggestCurrentRisk,
      biggestBlocker,
      weakestSprint,
      strongestOpportunity,
      recommendedNextMission,
      recommendedCeoDecision,
      workloadImbalance: workload.text,
      engineeringHealth: eng.text,
      releaseReadiness: release.text,
      roadmapImpact,
    },
    evidencePool,
  };
}

function pickRecommendedAction(
  a: CompanyBrainAssessments,
  input: CompanyBrainInput
): { action: string; why: string; impact: string } {
  if (a.recommendedCeoDecision && input.approvalQueue.protectedCount > 0) {
    return {
      action: a.recommendedCeoDecision,
      why: "Protected side-effecting work is paused until the CEO decides.",
      impact: "Unblocks execution and restores Continuous OS progress on gated work.",
    };
  }
  if (a.recommendedCeoDecision && input.approvalQueue.count > 0) {
    return {
      action: a.recommendedCeoDecision,
      why: "Recorded Approval Queue items are waiting on the CEO.",
      impact: "Clears Decision Center and lets assigned employees resume granted work.",
    };
  }
  if (a.biggestBlocker) {
    return {
      action: `Resolve blocker: ${a.biggestBlocker}`,
      why: "A recorded blocker is the largest drag on company throughput.",
      impact: "Restores Live Work progress and improves release readiness.",
    };
  }
  if (a.recommendedNextMission) {
    return {
      action: `Authorize next mission: ${a.recommendedNextMission}`,
      why: "Employee reports / Daily Directive point to this as the next company move.",
      impact: "Aligns the team on one recorded priority without inventing new work.",
    };
  }
  if (a.highestCompanyPriority) {
    return {
      action: a.highestCompanyPriority,
      why: "This is the highest-priority signal from recorded company state.",
      impact: "Keeps the company focused on the current directive and health signals.",
    };
  }
  return {
    action: "Review Morning Briefing and Company Health in Operating Center",
    why: "No urgent approvals or blockers are recorded right now.",
    impact: "Maintains situational awareness until the next recorded state change.",
  };
}

function dedupeEvidence(items: CompanyBrainEvidence[]): CompanyBrainEvidence[] {
  const priority: Record<string, number> = {
    "Approval Queue": 0,
    "Daily Directive": 1,
    "CEO Inbox": 2,
    "Live Work Tracker": 3,
    "GitHub status": 4,
    Sprint: 5,
    Analytics: 6,
    "Company Health": 7,
    "Continuous OS": 8,
    Timeline: 9,
    Meetings: 10,
    Memory: 11,
    "Employee reports": 12,
  };
  const sorted = [...items].sort(
    (a, b) => (priority[a.source] ?? 50) - (priority[b.source] ?? 50)
  );
  const seen = new Set<string>();
  const out: CompanyBrainEvidence[] = [];
  for (const e of sorted) {
    const key = `${e.source}:${e.fact}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= 14) break;
  }
  return out;
}

function scoreConfidence(
  assessments: CompanyBrainAssessments,
  evidenceCount: number,
  observedSources: string[]
): number {
  const filled = Object.values(assessments).filter((v) => v != null && v !== "").length;
  const base = Math.min(40, observedSources.length * 3);
  const assessBoost = Math.min(40, filled * 4);
  const evidenceBoost = Math.min(20, evidenceCount * 2);
  return Math.min(95, base + assessBoost + evidenceBoost);
}

export function buildCompanyBrainView(input: CompanyBrainInput): CompanyBrainView {
  const observedSources = observeSources(input);
  const { assessments, evidencePool } = buildAssessments(input);
  const pick = pickRecommendedAction(assessments, input);
  const evidenceList = dedupeEvidence(evidencePool);

  const riskList = [
    ...input.risks.slice(0, 4),
    assessments.biggestBlocker ? `Blocker: ${assessments.biggestBlocker}` : null,
    assessments.releaseReadiness?.startsWith("Not release-ready")
      ? assessments.releaseReadiness
      : null,
  ].filter(Boolean) as string[];

  const summaryParts = [
    assessments.highestCompanyPriority
      ? `Priority: ${assessments.highestCompanyPriority}`
      : null,
    assessments.biggestCurrentRisk
      ? `Risk: ${assessments.biggestCurrentRisk}`
      : null,
    assessments.biggestBlocker
      ? `Blocker: ${assessments.biggestBlocker}`
      : null,
    input.companyHealth
      ? `Health ${input.companyHealth.score} (${input.companyHealth.label})`
      : null,
  ].filter(Boolean);

  const executiveSummary =
    summaryParts.length > 0
      ? summaryParts.join(" · ")
      : input.executiveBrief.summary ||
        "Insufficient recorded state for a stronger company recommendation.";

  const confidence = scoreConfidence(
    assessments,
    evidenceList.length,
    observedSources
  );

  const recommendation: ExecutiveRecommendation = {
    executiveSummary,
    whyThisMatters: pick.why,
    evidence: evidenceList,
    risks: riskList.length > 0 ? riskList : ["No elevated risks recorded in current state."],
    recommendedAction: pick.action,
    expectedImpact: pick.impact,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
  };

  return {
    generatedAt: input.generatedAt,
    generatedAtDisplay: input.generatedAtDisplay,
    observedSources,
    assessments,
    recommendation,
  };
}

/** Map optional analytics snapshot into Brain input slice. */
export function analyticsToBrainInput(
  analytics: CompanyBrainAnalyticsInput | null | undefined
): CompanyBrainAnalyticsInput | null {
  return analytics ?? null;
}
