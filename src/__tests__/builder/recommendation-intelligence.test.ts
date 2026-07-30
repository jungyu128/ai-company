/**
 * Sprint 1 Part 3 — recommendation intelligence / decision packages.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyDecisionPackageToRecommendation,
  buildEvidenceSummary,
  buildRecommendationDecisionPackage,
  buildStructuredExpectedImpact,
  computeRecommendationPriority,
  computeRecommendationUrgency,
  ensureRecommendationDecisionPackage,
  formatStructuredImpact,
  inferRecommendationDependencies,
  serializeDecisionPackage,
} from "@/services/builder/recommendation-intelligence.logic";
import { defaultLiveDataAvailability } from "@/services/builder/discussion-quality.logic";
import {
  buildRecommendationsFromDiscussions,
  detectProactiveSignals,
} from "@/services/builder/proactive.logic";

describe("recommendation intelligence — priority", () => {
  it("maps severity and category to Critical/High/Medium/Low", () => {
    assert.equal(
      computeRecommendationPriority({
        severity: 5,
        category: "risk",
        signalKind: "schedule_conflict",
      }),
      "Critical"
    );
    assert.equal(
      computeRecommendationPriority({
        severity: 4,
        category: "alert",
        signalKind: "unanswered_email",
      }),
      "High"
    );
    assert.equal(
      computeRecommendationPriority({
        severity: 3,
        category: "opportunity",
        signalKind: "sales_opportunity",
      }),
      "Medium"
    );
    assert.equal(
      computeRecommendationPriority({
        severity: 1,
        category: "follow_up",
        signalKind: "generic",
      }),
      "Medium"
    );
    assert.equal(
      computeRecommendationPriority({
        severity: 2,
        category: "risk",
        signalKind: "generic",
      }),
      "Low"
    );
  });
});

describe("recommendation intelligence — urgency", () => {
  it("maps priority and signal kind to Immediate/Today/This Week/Later", () => {
    assert.equal(
      computeRecommendationUrgency({
        priority: "Critical",
        category: "risk",
      }),
      "Immediate"
    );
    assert.equal(
      computeRecommendationUrgency({
        priority: "High",
        category: "alert",
        signalKind: "unanswered_email",
      }),
      "Today"
    );
    assert.equal(
      computeRecommendationUrgency({
        priority: "Medium",
        category: "opportunity",
      }),
      "This Week"
    );
    assert.equal(
      computeRecommendationUrgency({
        priority: "Low",
        category: "follow_up",
      }),
      "Later"
    );
  });
});

describe("recommendation intelligence — dependencies", () => {
  it("infers realistic prerequisite chains without inventing impossible steps", () => {
    const email = inferRecommendationDependencies({
      leadEmployeeId: "emma",
      signalKind: "customer_reply",
      category: "follow_up",
    });
    assert.deepEqual(email, [
      "Prepare customer email draft",
      "Attach or link proposal if needed",
      "Obtain CEO approval",
      "Update CRM after send",
    ]);

    const sales = inferRecommendationDependencies({
      leadEmployeeId: "sarah",
      signalKind: "sales_opportunity",
      category: "opportunity",
    });
    assert.ok(sales.includes("Prepare proposal"));
    assert.ok(sales.includes("Obtain CEO approval"));
    assert.ok(sales.includes("Update CRM"));
    assert.equal(sales.some((d) => /teleport|invent|magic/i.test(d)), false);

    const calendar = inferRecommendationDependencies({
      leadEmployeeId: "alex",
      signalKind: "schedule_conflict",
      category: "risk",
    });
    assert.ok(calendar[0].toLowerCase().includes("conflict"));
    assert.equal(calendar.at(-1)?.toLowerCase().includes("calendar"), true);
  });
});

describe("recommendation intelligence — evidence safety", () => {
  it("never claims live analysis when connectors are disconnected", () => {
    const evidence = buildEvidenceSummary({
      hasInternalDiscussion: true,
      pendingApprovalTitles: ["Approve email draft"],
      leadEmployeeId: "emma",
      liveData: defaultLiveDataAvailability(),
    });
    assert.equal(evidence.claimedLiveAnalysis, false);
    assert.ok(evidence.sources.includes("internal_state"));
    assert.ok(evidence.sources.includes("ai_discussion"));
    assert.ok(evidence.sources.includes("previous_approvals"));
    assert.ok(evidence.sources.includes("mock_demo_signals"));
    assert.match(evidence.statement, /internal|mock|discussion/i);
    assert.ok(
      evidence.caveats.some((c) => /not live|not analyzed|were not actually read/i.test(c))
    );
    assert.equal(/fetched inbox|opened gmail|read calendar events/i.test(evidence.statement), false);
  });
});

describe("recommendation intelligence — impact generation", () => {
  it("builds qualitative structured impact dimensions", () => {
    const sales = buildStructuredExpectedImpact({
      category: "opportunity",
      leadEmployeeId: "sarah",
      priority: "High",
    });
    assert.equal(sales.revenue, "High");
    assert.ok(["High", "Medium", "Low", "None"].includes(sales.operational));
    const formatted = formatStructuredImpact(sales);
    assert.match(formatted, /Operational/);
    assert.match(formatted, /Revenue/);
    assert.match(formatted, /Customer/);
    assert.match(formatted, /Productivity/);
    assert.match(formatted, /Risk reduction/);
  });
});

describe("recommendation intelligence — structured serialization", () => {
  it("serializes a full decision package and enriches recommendations", () => {
    const pkg = buildRecommendationDecisionPackage({
      title: "Unanswered emails need triage",
      recommendation: "Recommend sending the proposal email before 3 PM.",
      reasoning: "Severity and discussion support action.",
      confidence: 82,
      category: "alert",
      leadEmployeeId: "emma",
      signal: {
        kind: "unanswered_email",
        severity: 4,
        category: "alert",
        sourceMissionId: null,
        title: "Unanswered emails need triage",
      },
      participatingEmployees: [
        { id: "emma", name: "Emma", role: "Email Manager" },
        { id: "david", name: "David", role: "Document Manager" },
      ],
      hasInternalDiscussion: true,
      liveData: defaultLiveDataAvailability(),
    });

    assert.equal(pkg.priority, "High");
    assert.equal(pkg.urgency, "Today");
    assert.ok(pkg.dependencies.length >= 3);
    assert.ok(pkg.risks.length > 20);
    assert.ok(pkg.confidenceReason.includes("82%"));
    assert.equal(pkg.evidenceSummary.claimedLiveAnalysis, false);
    assert.equal(pkg.participatingEmployees.map((p) => p.id).join(","), "emma,david");

    const serialized = serializeDecisionPackage(pkg);
    assert.equal(serialized.priority, "High");
    assert.deepEqual(
      (serialized.dependencies as string[]).slice(0, 2),
      pkg.dependencies.slice(0, 2)
    );
    assert.equal(
      (serialized.evidenceSummary as { claimedLiveAnalysis: boolean }).claimedLiveAnalysis,
      false
    );

    const legacy = ensureRecommendationDecisionPackage({
      title: pkg.title,
      recommendation: pkg.recommendation,
      reasoning: pkg.reasoning,
      expectedImpact: "Clear queue",
      confidence: 70,
      category: "alert",
      leadEmployeeId: "emma",
      participatingEmployees: [{ id: "emma", name: "Emma", role: "Email Manager" }],
      internalDiscussion: [],
    });
    assert.ok(legacy.priority);
    assert.ok(legacy.urgency);
    assert.ok(legacy.dependencies?.length);
    assert.ok(legacy.evidenceSummary);
    assert.ok(legacy.expectedImpactStructured);
    assert.ok(legacy.confidenceReason);

    const applied = applyDecisionPackageToRecommendation(legacy, pkg);
    assert.equal(applied.priority, pkg.priority);
    assert.equal(applied.urgency, pkg.urgency);
  });

  it("attaches decision packages when building proactive recommendations", () => {
    const signals = detectProactiveSignals({
      missions: [],
      pendingApprovals: [],
      now: "2026-07-30T07:00:00.000Z",
    });
    const recs = buildRecommendationsFromDiscussions(signals, "2026-07-30T07:00:00.000Z");
    assert.ok(recs.length > 0);
    for (const rec of recs) {
      assert.ok(rec.priority);
      assert.ok(rec.urgency);
      assert.ok(rec.dependencies && rec.dependencies.length > 0);
      assert.ok(rec.evidenceSummary);
      assert.equal(rec.evidenceSummary!.claimedLiveAnalysis, false);
      assert.ok(rec.expectedImpactStructured);
      assert.ok(rec.confidenceReason);
      assert.ok(rec.risks && rec.risks.length > 10);
      assert.ok(rec.participatingEmployees.length >= 1);
    }
  });
});
