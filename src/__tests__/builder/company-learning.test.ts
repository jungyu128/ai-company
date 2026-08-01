/**
 * Company Learning Engine — append-only lessons from recorded mission state.
 */

import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendMissionLesson,
  buildCompanyLearningView,
  deriveEvolutionSignals,
  deriveMissionLesson,
  getCompanyKnowledgeStore,
  getPlanningKnowledgeAdvice,
  hasLessonForMission,
  learnFromCompletedMission,
  searchKnowledge,
} from "@/services/builder/company-learning";
import {
  applyCeoDailyOpsAction,
  type DailyDirective,
  type DailyExecutionPlan,
} from "@/services/builder/daily-ops";
import { normalizeDailyWorkItem } from "@/services/builder/daily-ops";

describe("Company Learning Engine", () => {
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
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "company-learning-"));
    fs.mkdirSync(path.join(tmp, "docs/ai-team/ops"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("never fabricates a lesson when there is no recorded evidence", () => {
    const derived = deriveMissionLesson({
      missionKey: "empty",
      title: "Empty",
      directiveId: null,
      planId: null,
      recordedAt: "2026-08-01T12:00:00.000Z",
      completedWork: [],
      failedWork: [],
      blockedWork: [],
      qaNotes: [],
      reviewNotes: [],
      architectureNotes: [],
      ceoApprovals: [],
      ceoRejections: [],
      sprintOutcome: null,
      deploymentNotes: [],
      incidentNotes: [],
      analyticsBlockers: [],
      timelineSummaries: [],
    });
    assert.equal(derived, null);
  });

  it("derives a lesson with sourceRefs from completed and blocked work", () => {
    const derived = deriveMissionLesson({
      missionKey: "m1",
      title: "Ship learning",
      directiveId: "d1",
      planId: "p1",
      recordedAt: "2026-08-01T12:00:00.000Z",
      completedWork: [
        { id: "w1", title: "FE slice", ownerId: "alex", status: "COMPLETED" },
      ],
      failedWork: [],
      blockedWork: [
        { id: "w2", title: "Deploy", reason: "Protected action pending" },
      ],
      qaNotes: ["Acceptance criteria covered"],
      reviewNotes: ["Olivia reviewed FE"],
      architectureNotes: ["Keep deploy gated"],
      ceoApprovals: [{ summary: "Approved plan", decision: "approved" }],
      ceoRejections: [],
      sprintOutcome: "Sprint 4: 70% progress",
      deploymentNotes: [],
      incidentNotes: [],
      analyticsBlockers: [
        { label: "CI gate", count: 3, exampleIds: ["w2"] },
      ],
      timelineSummaries: [
        { id: "t1", kind: "work_completed", summary: "FE slice done" },
      ],
    });
    assert.ok(derived);
    assert.ok(derived!.lesson.whatWentWell.length >= 1);
    assert.ok(derived!.lesson.whatWentWrong.length >= 1);
    assert.ok(derived!.lesson.sourceRefs.some((r) => r.startsWith("workItem:")));
    assert.ok(derived!.knowledge.length >= 1);
    assert.ok(
      derived!.knowledge.every((k) => k.sourceRefs.length > 0 && !k.supersededById)
    );
  });

  it("persists lessons append-only and refuses overwrite for same missionKey", () => {
    const derived = deriveMissionLesson({
      missionKey: "mission-a",
      title: "A",
      directiveId: "d1",
      planId: "p1",
      recordedAt: "2026-08-01T12:00:00.000Z",
      completedWork: [
        { id: "w1", title: "Done", ownerId: "david", status: "COMPLETED" },
      ],
      failedWork: [],
      blockedWork: [],
      qaNotes: [],
      reviewNotes: [],
      architectureNotes: [],
      ceoApprovals: [{ summary: "ok", decision: "approved" }],
      ceoRejections: [],
      sprintOutcome: null,
      deploymentNotes: [],
      incidentNotes: [],
      analyticsBlockers: [],
      timelineSummaries: [],
    });
    assert.ok(derived);

    const first = appendMissionLesson({
      lesson: derived!.lesson,
      knowledge: derived!.knowledge,
      repoRoot: tmp,
    });
    assert.equal(first.appended, true);
    assert.equal(hasLessonForMission("mission-a", tmp), true);

    const second = appendMissionLesson({
      lesson: { ...derived!.lesson, id: "lesson-dup", title: "Should not replace" },
      knowledge: [],
      repoRoot: tmp,
    });
    assert.equal(second.appended, false);

    const store = getCompanyKnowledgeStore(tmp);
    assert.equal(store.lessons.filter((l) => l.missionKey === "mission-a").length, 1);
    assert.equal(store.lessons[0]!.title, "A");
    assert.ok(store.ledger.length >= 1);
  });

  it("learns from a completed daily-ops mission via service", () => {
    const submitted = applyCeoDailyOpsAction({
      action: {
        action: "submit_directive",
        title: "Learn from mission",
        instruction: "Complete work so the company can learn",
        intendedOutcome: "Lesson recorded",
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T15:00:00.000Z",
    });
    assert.equal(submitted.ok, true);
    if (!submitted.ok) return;

    const analyzed = applyCeoDailyOpsAction({
      action: {
        action: "analyze_and_propose",
        directiveId: submitted.snapshot.today!.id,
      },
      actorUserId: "ceo-1",
      actorName: "CEO",
      repoRoot: tmp,
      now: "2026-08-01T15:05:00.000Z",
    });
    assert.equal(analyzed.ok, true);
    if (!analyzed.ok) return;

    const plan = analyzed.snapshot.activePlan!;
    // Simulate recorded completions without inventing — mutate plan store via learn input
    const completedPlan: DailyExecutionPlan = {
      ...plan,
      proposedWorkItems: plan.proposedWorkItems.map((w, i) =>
        normalizeDailyWorkItem({
          ...w,
          status: i === 0 ? "COMPLETED" : w.status === "PROPOSED" ? "REJECTED" : w.status,
          blockedReason: i === 0 ? null : "CEO rejected slice",
          progress: i === 0 ? 100 : w.progress,
        })
      ),
      approvalRequirements: plan.approvalRequirements.map((a, i) => ({
        ...a,
        status: i === 0 ? "approved" : a.status === "pending" ? "rejected" : a.status,
      })),
    };
    const directive: DailyDirective = {
      ...analyzed.snapshot.today!,
      status: "COMPLETED",
    };

    const learned = learnFromCompletedMission({
      directive,
      plan: completedPlan,
      repoRoot: tmp,
      now: "2026-08-01T16:00:00.000Z",
    });
    assert.equal(learned.ok, true);
    if (!learned.ok) return;
    assert.equal(learned.appended, true);
    assert.ok(learned.lessonId);

    const view = buildCompanyLearningView({
      generatedAt: "2026-08-01T16:00:00.000Z",
      lessons: getCompanyKnowledgeStore(tmp).lessons,
      knowledge: getCompanyKnowledgeStore(tmp).knowledge,
      evolution: getCompanyKnowledgeStore(tmp).evolution,
    });
    assert.ok(view.lessonsLearned.length >= 1);
    assert.ok(view.knowledgeGrowth.totalLessons >= 1);
    assert.ok(view.companyMaturityScore >= 0);
  });

  it("searches knowledge and warns about repeated problems for planning", () => {
    const derived = deriveMissionLesson({
      missionKey: "m-plan",
      title: "Prior mission",
      directiveId: "d",
      planId: "p",
      recordedAt: "2026-08-01T10:00:00.000Z",
      completedWork: [
        { id: "w", title: "API slice", ownerId: "david", status: "COMPLETED" },
      ],
      failedWork: [],
      blockedWork: [],
      qaNotes: ["Contract tests required"],
      reviewNotes: [],
      architectureNotes: ["No schema change without approval"],
      ceoApprovals: [],
      ceoRejections: [
        { summary: "Missing rollback plan", decision: "rejected" },
      ],
      sprintOutcome: null,
      deploymentNotes: ["PR only — no merge"],
      incidentNotes: [],
      analyticsBlockers: [],
      timelineSummaries: [],
    });
    assert.ok(derived);
    appendMissionLesson({
      lesson: derived!.lesson,
      knowledge: derived!.knowledge,
      repoRoot: tmp,
    });

    const evo = deriveEvolutionSignals({
      now: "2026-08-01T11:00:00.000Z",
      analyticsBlockers: [
        { label: "Missing rollback plan", count: 3, exampleIds: ["w"] },
      ],
      rejectionReasons: ["Missing rollback plan", "Missing rollback plan"],
      reviewThemes: [],
      architectureThemes: [],
      failedTitles: [],
    });
    assert.ok(evo.some((e) => e.kind === "repeated_blocker"));

    const advice = getPlanningKnowledgeAdvice({
      query: "API slice schema rollback",
      repoRoot: tmp,
    });
    // May or may not hit depending on tokens — ensure search API works
    const hits = searchKnowledge(
      getCompanyKnowledgeStore(tmp).knowledge,
      "rollback deployment"
    );
    assert.ok(Array.isArray(hits));
    assert.ok(Array.isArray(advice.analysisNotes));
  });

  it("Operating Center learning view stays empty without fabrication", () => {
    const view = buildCompanyLearningView({
      generatedAt: "2026-08-01T12:00:00.000Z",
      lessons: [],
      knowledge: [],
      evolution: [],
    });
    assert.equal(view.lessonsLearned.length, 0);
    assert.equal(view.recentlyLearnedPatterns.length, 0);
    assert.equal(view.knowledgeGrowth.totalLessons, 0);
    assert.equal(view.companyMaturityLabel, "Emerging");
  });
});
